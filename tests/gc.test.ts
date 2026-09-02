import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initSchema, setMeta, storeOutput, forgetOutputs } from "../src/db/index";
import {
  scanDatabases,
  isDeletionCandidate,
  vacuumTargets,
  storeFootprint,
  executeDeletions,
  vacuumFile,
  gcReminderText,
  type DbEntry,
} from "../src/gc/index";

const DAY_MS = 86400 * 1000;

let workDir: string; // holds the .db store
let projectsDir: string; // holds fake project directories

function makeDb(name: string, projectPath: string | null, items = 0): string {
  const file = join(workDir, `${name}.db`);
  const db = new Database(file);
  initSchema(db);
  if (projectPath !== null) setMeta(db, "project_path", projectPath);
  // Prepare once, and commit once: a bare .run() per row is its own implicit
  // transaction, so 200 rows meant ~200 fsyncs and ~4.1s against this file's 5s
  // timeout — enough headroom on an idle machine to pass, not enough under load.
  const insert = db.prepare(
    `INSERT INTO stored_outputs
      (id, project_key, session_id, tool_name, summary, full_content, original_size, summary_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (let i = 0; i < items; i++) {
      insert.run(`id_${name}_${i}`, name, "2026-01-01", "t", "s", "c", 10, 2, 1000);
    }
  })();
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

/** A valid SQLite file that is NOT an mcp-recall DB (no `stored_outputs` table). */
function makeForeignDb(name: string): string {
  const file = join(workDir, `${name}.db`);
  const db = new Database(file);
  db.run(`CREATE TABLE something_else (x INTEGER)`);
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

  it("matches the current DB even when currentFile is a non-normalized path", () => {
    const file = makeDb("mine", null);
    // e.g. a RECALL_DB_PATH override with a "/./" segment — resolve() must still match.
    const nonNormalized = join(workDir, ".", "mine.db");
    const [entry] = scanDatabases(workDir, nonNormalized, 90);
    expect(entry!.file).toBe(file);
    expect(entry!.status).toBe("current");
  });

  it("classifies a path gone whose PARENT is also gone as unverifiable (never deleted)", () => {
    // Mimics a live project on an unmounted volume: whole path tree absent.
    makeDb("unmounted", "/no/such/mount/point/project");
    const [entry] = scanDatabases(workDir, "/current.db", 90);
    expect(entry!.status).toBe("unverifiable");
    expect(isDeletionCandidate(entry!.status)).toBe(false);
  });

  // `dirname("")` and `dirname("bare-name")` are both ".", which always exists, so
  // the parent-survived orphan test would read these as "project deleted" and
  // destroy the DB. A relative path cannot be rooted, so it must never be deleted on
  // a deleted-project inference — but it should not stay pinned forever either (#214):
  // once untouched past the stale window it falls through to the staleness rule.
  it.each([
    ["an empty recorded path", ""],
    ["a bare relative name", "myproject"],
    ["a relative path with segments", "some/relative/path"],
    // Exists relative to whatever cwd gc runs from. Must not become "active":
    // a DB's status cannot depend on the directory the command was invoked in.
    ["a relative path that resolves against cwd", "."],
  ])("keeps %s as unrooted-fresh before the stale window (never deleted)", (_label, recorded) => {
    makeDb("relpath", recorded);
    const [entry] = scanDatabases(workDir, "/current.db", 90, Date.now());
    expect(entry!.projectPath).toBe(recorded);
    expect(entry!.status).toBe("unrooted-fresh");
    expect(isDeletionCandidate(entry!.status)).toBe(false);
  });

  it.each([
    ["an empty recorded path", ""],
    ["a bare relative name", "myproject"],
    ["a relative path with segments", "some/relative/path"],
    ["a relative path that resolves against cwd", "."],
  ])(
    "reclaims %s as unrooted-stale once past the stale window (deletion candidate)",
    (_label, recorded) => {
      makeDb("relpath", recorded);
      const [entry] = scanDatabases(workDir, "/current.db", 90, Date.now() + 200 * DAY_MS);
      expect(entry!.projectPath).toBe(recorded);
      expect(entry!.status).toBe("unrooted-stale");
      expect(isDeletionCandidate(entry!.status)).toBe(true);
    }
  );

  it("keeps an unmounted absolute path as unverifiable regardless of age (never deleted)", () => {
    // Distinct from the un-rootable case above: an absolute path whose whole tree is
    // absent is likely a mount that will return with its project intact, so it is
    // never a candidate — not even long past the stale window.
    makeDb("unmounted", "/no/such/mount/point/project");
    const [entry] = scanDatabases(workDir, "/current.db", 90, Date.now() + 500 * DAY_MS);
    expect(entry!.status).toBe("unverifiable");
    expect(isDeletionCandidate(entry!.status)).toBe(false);
  });

  it("classifies a non-mcp-recall .db as unreadable (never deleted)", () => {
    makeForeignDb("stranger");
    const [entry] = scanDatabases(workDir, "/current.db", 90, Date.now() + 200 * DAY_MS);
    expect(entry!.status).toBe("unreadable");
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

describe("gc vacuumTargets", () => {
  const entry = (status: DbEntry["status"]): DbEntry => ({
    file: `/x/${status}.db`,
    status,
    projectPath: null,
    sizeBytes: 100,
    mtimeMs: 0,
    items: 0,
  });

  it("vacuums only kept databases — never deletion candidates, current, or unreadable", () => {
    const all: DbEntry[] = [
      entry("active"),
      entry("legacy-fresh"),
      entry("unrooted-fresh"), // kept (un-rootable but fresh) — vacuumable
      entry("orphaned"), // deletion candidate — must be excluded (was the 5GB bug)
      entry("legacy-stale"), // deletion candidate — must be excluded
      entry("unrooted-stale"), // deletion candidate — must be excluded
      entry("current"), // live-locked
      entry("unverifiable"), // path unverifiable — must be excluded
      entry("unreadable"),
    ];
    const targets = vacuumTargets(all).map((e) => e.status);
    expect(targets).toEqual(["active", "legacy-fresh", "unrooted-fresh"]);
  });

  it("returns nothing when every database is a deletion candidate", () => {
    expect(vacuumTargets([entry("orphaned"), entry("legacy-stale")])).toEqual([]);
  });
});

describe("gc storeFootprint", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "recall-fp-"));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("returns zero for a nonexistent directory", () => {
    expect(storeFootprint(join(workDir, "nope"))).toEqual({ totalBytes: 0, dbCount: 0 });
  });

  it("counts .db files and sums their size (ignoring non-.db files)", () => {
    makeDb("a", null, 5);
    makeDb("b", null, 5);
    writeFileSync(join(workDir, "readme.txt"), "x");
    const fp = storeFootprint(workDir);
    expect(fp.dbCount).toBe(2);
    expect(fp.totalBytes).toBeGreaterThan(0);
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
    // storeOutput opens its own transaction per call, so an unbatched loop is one
    // fsyncing commit per row on this non-WAL file DB. Outer transaction nests as
    // a savepoint and collapses them into a single commit.
    db.transaction(() => {
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
    })();
    const before = (db.query("PRAGMA page_count").get() as { page_count: number }).page_count;

    // forgetOutputs deletes >= VACUUM_THRESHOLD rows and calls reclaimPages internally.
    const deleted = forgetOutputs(db, "p", { all: true, force: true });
    expect(deleted).toBe(80);

    const after = (db.query("PRAGMA page_count").get() as { page_count: number }).page_count;
    expect(after).toBeLessThan(before);
    db.close();
  });
});

describe("gc executeDeletions (destructive path)", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "recall-del-"));
    projectsDir = mkdtempSync(join(tmpdir(), "recall-delproj-"));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(projectsDir, { recursive: true, force: true });
  });

  it("deletes only deletion candidates, including their -wal/-shm sidecars, and never a live DB", () => {
    // orphaned: recorded path gone but parent (projectsDir) exists → candidate
    const orphanFile = makeDb("orphan", join(projectsDir, "gone"));
    writeFileSync(`${orphanFile}-wal`, "wal");
    writeFileSync(`${orphanFile}-shm`, "shm");
    // active: recorded path exists → must be preserved
    const liveDir = join(projectsDir, "live");
    mkdirSync(liveDir);
    const activeFile = makeDb("active", liveDir);

    const entries = scanDatabases(workDir, "/current.db", 90);
    const candidates = entries.filter((e) => isDeletionCandidate(e.status));
    expect(candidates.map((e) => e.file)).toEqual([orphanFile]);

    const freed = executeDeletions(candidates);
    expect(freed).toBeGreaterThan(0);
    expect(existsSync(orphanFile)).toBe(false);
    expect(existsSync(`${orphanFile}-wal`)).toBe(false);
    expect(existsSync(`${orphanFile}-shm`)).toBe(false);
    expect(existsSync(activeFile)).toBe(true); // non-candidate untouched
  });
});

describe("gc vacuumFile (full VACUUM)", () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "recall-vf-"));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("reclaims free pages and upgrades a legacy auto_vacuum=NONE DB to INCREMENTAL", () => {
    const file = join(workDir, "legacy.db");
    const db = new Database(file); // default auto_vacuum = NONE (0)
    initSchema(db);
    expect((db.query("PRAGMA auto_vacuum").get() as { auto_vacuum: number }).auto_vacuum).toBe(0);

    const big = "z".repeat(4096);
    db.transaction(() => {
      for (let i = 0; i < 120; i++) {
        storeOutput(db, {
          project_key: "p",
          session_id: "2026-01-01",
          tool_name: "t",
          summary: "s",
          full_content: big,
          original_size: big.length,
        });
      }
    })();
    // Raw delete (no reclaimPages) — on a NONE database the pages become freelist.
    db.prepare("DELETE FROM stored_outputs").run();
    const freelistBefore = (db.query("PRAGMA freelist_count").get() as { freelist_count: number }).freelist_count;
    expect(freelistBefore).toBeGreaterThan(0);
    db.close();

    const result = vacuumFile(file);
    expect("after" in result).toBe(true);
    if ("after" in result) expect(result.after).toBeLessThanOrEqual(result.before);

    const check = new Database(file, { readonly: true });
    // 2 = INCREMENTAL — the legacy DB was upgraded.
    expect((check.query("PRAGMA auto_vacuum").get() as { auto_vacuum: number }).auto_vacuum).toBe(2);
    expect((check.query("PRAGMA freelist_count").get() as { freelist_count: number }).freelist_count).toBe(0);
    check.close();
  });
});

describe("gc gcReminderText", () => {
  const GB = 1024 * 1024 * 1024;

  it("returns empty when reminders are disabled (reminderMb <= 0)", () => {
    expect(gcReminderText({ totalBytes: 10 * GB, dbCount: 50 }, 0)).toBe("");
  });

  it("returns empty when under the threshold", () => {
    expect(gcReminderText({ totalBytes: 100 * 1024 * 1024, dbCount: 3 }, 2048)).toBe("");
  });

  it("returns a reminder naming size and count when over the threshold", () => {
    const msg = gcReminderText({ totalBytes: 3 * GB, dbCount: 40 }, 2048);
    expect(msg).toContain("mcp-recall gc");
    expect(msg).toContain("40");
  });
});
