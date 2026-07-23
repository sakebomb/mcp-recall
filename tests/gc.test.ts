import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initSchema, setMeta, storeOutput, forgetOutputs } from "../src/db/index";
import { scanDatabases, isDeletionCandidate } from "../src/gc/index";

const DAY_MS = 86400 * 1000;

let workDir: string; // holds the .db store
let projectsDir: string; // holds fake project directories

function makeDb(name: string, projectPath: string | null, items = 0): string {
  const file = join(workDir, `${name}.db`);
  const db = new Database(file);
  initSchema(db);
  if (projectPath !== null) setMeta(db, "project_path", projectPath);
  for (let i = 0; i < items; i++) {
    db.prepare(
      `INSERT INTO stored_outputs
        (id, project_key, session_id, tool_name, summary, full_content, original_size, summary_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(`id_${name}_${i}`, name, "2026-01-01", "t", "s", "c", 10, 2, 1000);
  }
  db.close();
  return file;
}

/** A DB with no `meta` table at all — mimics stores created before meta existed. */
function makeLegacyDb(name: string): string {
  const file = join(workDir, `${name}.db`);
  const db = new Database(file);
  db.run(`CREATE TABLE stored_outputs (id TEXT PRIMARY KEY, original_size INTEGER)`);
  db.close();
  return file;
}

describe("gc scanDatabases", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "recall-gc-"));
    projectsDir = mkdtempSync(join(tmpdir(), "recall-proj-"));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(projectsDir, { recursive: true, force: true });
  });

  it("returns empty for a nonexistent directory", () => {
    expect(scanDatabases(join(workDir, "nope"), "/x.db", 90)).toEqual([]);
  });

  it("classifies a DB whose recorded path exists as active", () => {
    const existing = join(projectsDir, "live");
    mkdirSync(existing);
    makeDb("live", existing);
    const [entry] = scanDatabases(workDir, "/current.db", 90);
    expect(entry!.status).toBe("active");
    expect(isDeletionCandidate(entry!.status)).toBe(false);
  });

  it("classifies a DB whose recorded path is gone as orphaned (deletion candidate)", () => {
    makeDb("dead", join(projectsDir, "deleted-project"));
    const [entry] = scanDatabases(workDir, "/current.db", 90);
    expect(entry!.status).toBe("orphaned");
    expect(isDeletionCandidate(entry!.status)).toBe(true);
  });

  it("never flags the current project's DB, even when its path is gone", () => {
    const file = makeDb("mine", join(projectsDir, "also-deleted"));
    const [entry] = scanDatabases(workDir, file, 90);
    expect(entry!.status).toBe("current");
    expect(isDeletionCandidate(entry!.status)).toBe(false);
  });

  it("treats a pathless DB as legacy-stale only once past the stale window", () => {
    makeDb("old", null, 3);
    // now = well past the stale window relative to the just-created file
    const stale = scanDatabases(workDir, "/current.db", 90, Date.now() + 200 * DAY_MS);
    expect(stale[0]!.status).toBe("legacy-stale");
    expect(isDeletionCandidate(stale[0]!.status)).toBe(true);

    const fresh = scanDatabases(workDir, "/current.db", 90, Date.now());
    expect(fresh[0]!.status).toBe("legacy-fresh");
    expect(isDeletionCandidate(fresh[0]!.status)).toBe(false);
  });

  it("handles a DB with no meta table (legacy) without throwing", () => {
    makeLegacyDb("ancient");
    const [entry] = scanDatabases(workDir, "/current.db", 90, Date.now() + 200 * DAY_MS);
    expect(entry!.projectPath).toBeNull();
    expect(entry!.status).toBe("legacy-stale");
  });

  it("reports item counts and sorts largest first", () => {
    const a = join(projectsDir, "a");
    const b = join(projectsDir, "b");
    mkdirSync(a);
    mkdirSync(b);
    makeDb("small", a, 1);
    makeDb("big", b, 200);
    const entries = scanDatabases(workDir, "/current.db", 90);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.sizeBytes).toBeGreaterThanOrEqual(entries[1]!.sizeBytes);
    const big = entries.find((e) => e.file.endsWith("big.db"))!;
    expect(big.items).toBe(200);
  });

  it("ignores non-.db files in the store directory", () => {
    makeDb("real", join(projectsDir, "x"));
    writeFileSync(join(workDir, "notes.txt"), "hi");
    const entries = scanDatabases(workDir, "/current.db", 90);
    expect(entries).toHaveLength(1);
  });
});

describe("incremental_vacuum reclamation (on-disk)", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "recall-vac-"));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("returns free pages to the file after a bulk delete on an INCREMENTAL db", () => {
    const file = join(workDir, "store.db");
    const db = new Database(file);
    db.run("PRAGMA auto_vacuum=INCREMENTAL"); // must precede table creation
    initSchema(db);

    const big = "z".repeat(4096);
    for (let i = 0; i < 80; i++) {
      storeOutput(db, {
        project_key: "p",
        session_id: "2026-01-01",
        tool_name: "mcp__tool",
        summary: "s",
        full_content: big,
        original_size: big.length,
      });
    }
    const before = (db.query("PRAGMA page_count").get() as { page_count: number }).page_count;

    // forgetOutputs deletes >= VACUUM_THRESHOLD rows and calls reclaimPages internally.
    const deleted = forgetOutputs(db, "p", { all: true, force: true });
    expect(deleted).toBe(80);

    const after = (db.query("PRAGMA page_count").get() as { page_count: number }).page_count;
    expect(after).toBeLessThan(before);
    db.close();
  });
});
