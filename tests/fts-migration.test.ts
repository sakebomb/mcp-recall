import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb, closeDb, initSchema, migrateFtsToExternalContent, verifyFtsIndex } from "../src/db/schema";
import { storeOutput, searchOutputs, forgetOutputs } from "../src/db/index";
import { vacuumFile } from "../src/gc/index";
import type { StoreInput } from "../src/db/types";

const PROJECT = "fts_migration_test";
const SRC_DIR = join(import.meta.dir, "..", "src");

let tmpFiles: string[] = [];
function tmpDb(): string {
  const p = join(tmpdir(), `recall-fts-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  tmpFiles.push(p);
  return p;
}

// The pre-#263 schema: a self-contained FTS table and a plain DELETE trigger.
function convertToLegacyFts(db: Database): void {
  db.run("DROP TRIGGER outputs_ad");
  db.run("DROP TABLE outputs_fts");
  db.run("CREATE VIRTUAL TABLE outputs_fts USING fts5(id UNINDEXED, tool_name, summary, full_content)");
  db.run(`CREATE TRIGGER outputs_ad AFTER DELETE ON stored_outputs BEGIN
    DELETE FROM outputs_fts WHERE rowid = old.rowid;
  END`);
}

function input(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: PROJECT,
    session_id: "2026-10-05",
    tool_name: "mcp__github__list_issues",
    summary: "issue list summary",
    full_content: "the quick brown fox jumps over the lazy dog",
    original_size: 1000,
    ...overrides,
  };
}

/** A legacy store on disk with full-body, summary-only, and deleted rows (rowid gaps). */
function buildLegacyStore(path: string): void {
  const db = new Database(path);
  initSchema(db);
  convertToLegacyFts(db);
  for (let i = 0; i < 30; i++) {
    storeOutput(db, input({ full_content: `alpha body number${i} kubernetes pod crashloop`, summary: `alpha summary ${i}` }));
  }
  storeOutput(db, input({ summary: "summaryonly zebra row", full_content: "never persisted", full_retained: 0 }));
  db.run("DELETE FROM stored_outputs WHERE rowid % 4 = 0");
  db.close();
}

const shadowTables = (db: Database) =>
  (db.query("SELECT name FROM sqlite_master WHERE name LIKE 'outputs_fts_%'").all() as { name: string }[])
    .map((r) => r.name)
    .sort();

const snippets = (db: Database, q: string) =>
  db.query("SELECT rowid, snippet(outputs_fts, 3, '', '', ' [...] ', 64) AS s FROM outputs_fts WHERE outputs_fts MATCH ? ORDER BY rowid").all(q);

const integrityPasses = (db: Database) => {
  try {
    db.run("INSERT INTO outputs_fts(outputs_fts, rank) VALUES('integrity-check', 1)");
    return true;
  } catch {
    return false;
  }
};

beforeEach(() => closeDb());
afterEach(() => {
  closeDb();
  for (const f of tmpFiles) for (const s of ["", "-wal", "-shm"]) rmSync(f + s, { force: true });
  tmpFiles = [];
});

describe("external-content FTS (#263)", () => {
  test("new stores create outputs_fts without a content shadow table", () => {
    const db = getDb(":memory:");
    expect(shadowTables(db)).not.toContain("outputs_fts_content");
    const sql = (db.query("SELECT sql FROM sqlite_master WHERE name = 'outputs_fts'").get() as { sql: string }).sql;
    expect(sql).toContain("content='stored_outputs'");
    expect(migrateFtsToExternalContent(db)).toBe("current");
  });

  test("legacy store migrates on open with identical search results and snippets", () => {
    const path = tmpDb();
    buildLegacyStore(path);

    const legacy = new Database(path);
    expect(shadowTables(legacy)).toContain("outputs_fts_content");
    const beforeSearch = searchOutputs(legacy, "kubernetes", { project_key: PROJECT, limit: 100 }).map((r) => r.id);
    const beforeSnippets = snippets(legacy, "crashloop");
    const beforeZebra = searchOutputs(legacy, "zebra", { project_key: PROJECT }).map((r) => r.id);
    legacy.close();
    expect(beforeSearch.length).toBeGreaterThan(10);
    expect(beforeZebra.length).toBe(1);

    const db = getDb(path);
    expect(shadowTables(db)).not.toContain("outputs_fts_content");
    expect(integrityPasses(db)).toBe(true);
    expect(searchOutputs(db, "kubernetes", { project_key: PROJECT, limit: 100 }).map((r) => r.id)).toEqual(beforeSearch);
    expect(snippets(db, "crashloop")).toEqual(beforeSnippets);
    // Summary-only rows (store.retention) stay findable by summary.
    expect(searchOutputs(db, "zebra", { project_key: PROJECT }).map((r) => r.id)).toEqual(beforeZebra);
  });

  test("a migration that fails midway rolls back to the working legacy index", () => {
    // Force a failure after DROP TABLE: rebuild reads stored_outputs.summary, which
    // this synthetic store lacks, while its legacy triggers work without it.
    const path = tmpDb();
    const setup = new Database(path);
    setup.run("CREATE TABLE stored_outputs (id TEXT PRIMARY KEY, tool_name TEXT, title TEXT, full_content TEXT)");
    setup.run("CREATE VIRTUAL TABLE outputs_fts USING fts5(id UNINDEXED, tool_name, summary, full_content)");
    setup.run(`CREATE TRIGGER outputs_ai AFTER INSERT ON stored_outputs BEGIN
      INSERT INTO outputs_fts(rowid, id, tool_name, summary, full_content)
      VALUES (new.rowid, new.id, new.tool_name, new.title, new.full_content);
    END`);
    setup.run(`CREATE TRIGGER outputs_ad AFTER DELETE ON stored_outputs BEGIN
      DELETE FROM outputs_fts WHERE rowid = old.rowid;
    END`);
    setup.run("INSERT INTO stored_outputs VALUES ('a', 't', 'title', 'walrus content')");

    expect(migrateFtsToExternalContent(setup)).toBe("failed");
    expect(shadowTables(setup)).toContain("outputs_fts_content");
    expect(setup.query("SELECT id FROM outputs_fts WHERE outputs_fts MATCH 'walrus'").all()).toEqual([{ id: "a" }]);
    const trigger = setup.query("SELECT sql FROM sqlite_master WHERE name = 'outputs_ad'").get() as { sql: string };
    expect(trigger.sql).toContain("DELETE FROM outputs_fts");
    setup.close();
  });

  test("migration truncates the WAL while another connection holds the store (#292)", () => {
    const path = tmpDb();
    const setup = new Database(path);
    setup.run("PRAGMA auto_vacuum=INCREMENTAL");
    setup.run("PRAGMA journal_mode=WAL");
    initSchema(setup);
    convertToLegacyFts(setup);
    const body = "lorem ipsum dolor sit amet ".repeat(400);
    setup.transaction(() => {
      for (let i = 0; i < 150; i++) storeOutput(setup, input({ full_content: `${body} item${i}` }));
    })();
    setup.run("PRAGMA wal_checkpoint(TRUNCATE)");
    const server = new Database(path); // stands in for a session's MCP server
    server.query("SELECT count(*) FROM stored_outputs").get();

    expect(migrateFtsToExternalContent(setup)).toBe("migrated");

    const wal = `${path}-wal`;
    expect(existsSync(wal) ? statSync(wal).size : 0).toBe(0);
    server.close();
    setup.close();
  });

  test("deletes keep the index consistent after migration", () => {
    const path = tmpDb();
    buildLegacyStore(path);
    const db = getDb(path);
    const victim = searchOutputs(db, "number5", { project_key: PROJECT })[0]!;
    expect(forgetOutputs(db, PROJECT, { id: victim.id })).toBe(1);
    expect(searchOutputs(db, "number5", { project_key: PROJECT })).toEqual([]);
    forgetOutputs(db, PROJECT, { all: true, force: true });
    expect(db.query("SELECT count(*) AS c FROM stored_outputs").get()).toEqual({ c: 0 });
    expect(integrityPasses(db)).toBe(true);
    expect(searchOutputs(db, "alpha", { project_key: PROJECT })).toEqual([]);
  });

  test("verifyFtsIndex rebuilds an index that disagrees with stored_outputs", () => {
    const db = getDb(":memory:");
    storeOutput(db, input({ full_content: "ocelot one" }));
    storeOutput(db, input({ full_content: "ocelot two" }));
    expect(verifyFtsIndex(db)).toBe(false);

    // Desync: delete a row without telling the index.
    db.run("DROP TRIGGER outputs_ad");
    db.run("DELETE FROM stored_outputs WHERE rowid = 1");
    expect(integrityPasses(db)).toBe(false);

    expect(verifyFtsIndex(db)).toBe(true);
    expect(integrityPasses(db)).toBe(true);
  });

  test("gc --vacuum migrates a legacy store and shrinks it", () => {
    const path = tmpDb();
    const db = new Database(path);
    db.run("PRAGMA auto_vacuum=NONE");
    initSchema(db);
    convertToLegacyFts(db);
    const body = "lorem ipsum dolor sit amet ".repeat(400);
    for (let i = 0; i < 200; i++) storeOutput(db, input({ full_content: `${body} item${i}` }));
    db.close();
    const before = statSync(path).size;

    const result = vacuumFile(path);
    expect("error" in result).toBe(false);

    const after = new Database(path);
    expect(shadowTables(after)).not.toContain("outputs_fts_content");
    expect(integrityPasses(after)).toBe(true);
    expect(after.query("SELECT count(*) AS c FROM outputs_fts WHERE outputs_fts MATCH 'item7'").get()).toEqual({ c: 1 });
    after.close();
    expect(statSync(path).size).toBeLessThan(before * 0.8);
  });

  test("no writer can change an indexed column without the index noticing", () => {
    // There is no AFTER UPDATE trigger: an UPDATE of an indexed column, or a REPLACE
    // (whose implicit delete skips triggers), would silently desync outputs_fts.
    const sources = readdirSync(SRC_DIR, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(join(SRC_DIR, f), "utf8"));
    const updates = sources.flatMap((s) => [...s.matchAll(/UPDATE\s+stored_outputs\s+SET\s+([^`]*?)\s+WHERE/gi)].map((m) => m[1]!));
    expect(updates.length).toBeGreaterThan(0);
    for (const set of updates) expect(set).not.toMatch(/\b(id|tool_name|summary|full_content)\s*=/);
    for (const s of sources) expect(s).not.toMatch(/(OR\s+REPLACE|REPLACE)\s+INTO\s+stored_outputs/i);
  });
});
