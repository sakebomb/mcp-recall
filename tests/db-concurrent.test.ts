/**
 * Concurrent DB access tests.
 *
 * These tests open two Database connections to the same on-disk file to verify
 * that WAL mode handles simultaneous readers and writers without data loss or
 * crashes.  In-memory DBs cannot be shared across connections, so every test
 * here uses a real temp file that is cleaned up in afterEach.
 */
import { describe, it, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getDb,
  closeDb,
  storeOutput,
  listOutputs,
  forgetOutputs,
  type StoreInput,
} from "../src/db/index";

const PROJECT_KEY = "concurrent-test-proj";

function makeInput(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: PROJECT_KEY,
    session_id: "2026-03-01",
    tool_name: "mcp__test__tool",
    summary: "summary",
    full_content: "full content",
    original_size: 100,
    ...overrides,
  };
}

/** Create a fresh temp directory and return both the dir and DB file path. */
function tempDb(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "recall-concurrent-"));
  return { dir, dbPath: join(dir, "test.db") };
}

/**
 * Open a second raw connection to an already-initialised WAL file.
 * The caller is responsible for closing it.
 */
function openSecondConnection(dbPath: string, busyTimeout = 5000): Database {
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode=WAL");
  db.run(`PRAGMA busy_timeout=${busyTimeout}`);
  return db;
}

describe("concurrent DB access", () => {
  let cleanupDir: string | undefined;

  afterEach(() => {
    closeDb(); // reset singleton
    if (cleanupDir) {
      try { rmSync(cleanupDir, { recursive: true }); } catch { /* ignore */ }
      cleanupDir = undefined;
    }
  });

  // -------------------------------------------------------------------------
  // Two writers to the same file
  // -------------------------------------------------------------------------

  it("two connections writing to the same WAL file preserve all rows", () => {
    const { dir, dbPath } = tempDb();
    cleanupDir = dir;

    const db1 = getDb(dbPath);               // initialises schema + WAL
    const db2 = openSecondConnection(dbPath); // second writer

    for (let i = 0; i < 15; i++) {
      storeOutput(db1, makeInput({ summary: `db1 item ${i}` }));
      storeOutput(db2, makeInput({ summary: `db2 item ${i}` }));
    }

    db2.close();
    expect(listOutputs(db1, { project_key: PROJECT_KEY, limit: 100 }).length).toBe(30);
  });

  // -------------------------------------------------------------------------
  // Reader during bulk delete
  // -------------------------------------------------------------------------

  it("reader on second connection is not blocked during a bulk delete", () => {
    const { dir, dbPath } = tempDb();
    cleanupDir = dir;

    const db1 = getDb(dbPath);
    const db2 = openSecondConnection(dbPath);

    for (let i = 0; i < 10; i++) {
      storeOutput(db1, makeInput({ summary: `item ${i}` }));
    }

    // Snapshot read before delete — should see all 10 rows
    const before = listOutputs(db2, { project_key: PROJECT_KEY });

    forgetOutputs(db1, PROJECT_KEY, { all: true });

    // Read after delete — WAL reader is not blocked and sees the committed state
    const after = listOutputs(db2, { project_key: PROJECT_KEY });

    db2.close();

    expect(before.length).toBe(10);
    expect(after.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Busy timeout behaviour
  // -------------------------------------------------------------------------

  it("second writer throws immediately when DB is exclusively locked and busy_timeout=0", () => {
    const { dir, dbPath } = tempDb();
    cleanupDir = dir;

    const db1 = getDb(dbPath);
    const db2 = openSecondConnection(dbPath, 0); // no retry

    // Hold an exclusive write transaction on db1
    db1.run("BEGIN EXCLUSIVE");

    // db2 should fail immediately — documents failure mode without busy_timeout
    expect(() => {
      db2.run("BEGIN EXCLUSIVE");
    }).toThrow();

    db1.run("ROLLBACK");
    db2.close();
  });

  it("interleaved writes from two connections with busy_timeout preserve all rows", () => {
    const { dir, dbPath } = tempDb();
    cleanupDir = dir;

    const db1 = getDb(dbPath); // getDb already sets busy_timeout=5000
    const db2 = openSecondConnection(dbPath, 5000);

    for (let i = 0; i < 5; i++) {
      storeOutput(db1, makeInput({ summary: `db1 item ${i}` }));
      storeOutput(db2, makeInput({ summary: `db2 item ${i}` }));
    }

    db2.close();
    expect(listOutputs(db1, { project_key: PROJECT_KEY }).length).toBe(10);
  });
});
