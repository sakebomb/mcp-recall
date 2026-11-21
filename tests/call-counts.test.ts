import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  initSchema, recordCall, foldCallLog, readCallLog, callLogPath, getCallBreakdown, closeDb,
  type CallRecord,
} from "../src/db/index";
import { handleSessionStart } from "../src/hooks/session-start";
import { resetConfig } from "../src/config";

// The hook logs each call beside the store and folds the log into call_counts
// on writes that happen anyway, because a SQLite commit per pass-through call
// cost 15-20 ms on Bun 1.4 (#495).

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    project_key: "ccA", tool_name: "Bash", command_fp: "cat",
    outcome: "content_read", original_bytes: 40, delivered_bytes: 40, ...overrides,
  };
}

let dir: string;
let file: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recall-calls-"));
  file = join(dir, "store.db");
  db = new Database(file);
  initSchema(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const rowCount = () => (db.prepare("SELECT COALESCE(SUM(calls), 0) AS n FROM call_counts").get() as { n: number }).n;

describe("recordCall on a file store", () => {
  it("appends to the log beside the store and writes nothing to the table", () => {
    recordCall(db, call());
    recordCall(db, call({ outcome: "too_small" }));

    expect(rowCount()).toBe(0);
    expect(readCallLog(file).map((c) => c.outcome)).toEqual(["content_read", "too_small"]);
  });

  it("is already visible to a reader before any fold", () => {
    recordCall(db, call());
    recordCall(db, call());
    const { rows, since } = getCallBreakdown(db, "ccA");

    expect(rows.map((r) => [r.command_fp, r.calls.content_read, r.original_bytes])).toEqual([["cat", 2, 80]]);
    expect(since).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("foldCallLog", () => {
  it("moves logged counts into the table and removes the log", () => {
    for (let i = 0; i < 3; i++) recordCall(db, call());
    foldCallLog(db);

    expect(rowCount()).toBe(3);
    expect(readCallLog(file)).toEqual([]);
    expect(readdirSync(dir).filter((n) => n.includes(".calls"))).toEqual([]);
  });

  it("counts each call once across a fold: table plus log never double up", () => {
    recordCall(db, call());
    foldCallLog(db);
    recordCall(db, call());
    expect(getCallBreakdown(db, "ccA").rows[0].calls.content_read).toBe(2);
    foldCallLog(db);
    expect(getCallBreakdown(db, "ccA").rows[0].calls.content_read).toBe(2);
  });

  it("takes over a claimed log a dead fold left behind, but not a fresh one", () => {
    const line = JSON.stringify({ ...call(), day: "2026-01-01" }) + "\n";
    const stale = `${callLogPath(file)}.999-1-0.folding`;
    const fresh = `${callLogPath(file)}.998-2-0.folding`;
    writeFileSync(stale, line);
    writeFileSync(fresh, line);
    const old = new Date(Date.now() - 5 * 60_000);
    utimesSync(stale, old, old);
    foldCallLog(db);

    expect(rowCount()).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true); // a fold in progress elsewhere may own it
  });

  it("skips a torn or foreign line instead of failing", () => {
    recordCall(db, call());
    appendFileSync(callLogPath(file)!, '{"project_key":"ccA","tool_na\nnot json\n{"outcome":"bogus"}\n');
    recordCall(db, call());
    foldCallLog(db);

    expect(rowCount()).toBe(2);
  });

  it("does nothing for an in-memory store, which records straight into the table", () => {
    const mem = new Database(":memory:");
    initSchema(mem);
    recordCall(mem, call());
    foldCallLog(mem);
    expect((mem.prepare("SELECT SUM(calls) AS n FROM call_counts").get() as { n: number }).n).toBe(1);
    mem.close();
  });
});

describe("session start folds the log (#495)", () => {
  afterEach(() => {
    closeDb();
    resetConfig();
    delete process.env.RECALL_DB_PATH;
  });

  it("moves the calls logged since the last write into the table", () => {
    recordCall(db, call());
    recordCall(db, call());
    db.close();
    closeDb(); // never inherit a store another test file left open
    process.env.RECALL_DB_PATH = file;
    handleSessionStart(JSON.stringify({ session_id: "s", cwd: process.cwd() }));
    closeDb();

    db = new Database(file);
    expect(rowCount()).toBe(2);
    expect(existsSync(callLogPath(file)!)).toBe(false);
  });
});
