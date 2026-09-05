import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { storeOutput, pinOutput } from "../src/db/index";
import { initSchema, closeDb } from "../src/db/schema";
import { toolExport, toolListStored, toolSearch } from "../src/tools";
import { handleImportCommand } from "../src/import/index";
import { getProjectKey } from "../src/project-key";
import type { StoreInput } from "../src/db/types";

const PROJECT_ROOT = import.meta.dir.replace(/\/tests$/, "");

// ── helpers ───────────────────────────────────────────────────────────────────

const SOURCE_PROJECT = "import_test_source_key";

let sourceDb: Database;
let tmpFiles: string[] = [];

function makeTmpPath(ext = ".json"): string {
  const p = join(tmpdir(), `recall-import-test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  tmpFiles.push(p);
  return p;
}

function makeInput(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: SOURCE_PROJECT,
    session_id: "sess-abc",
    tool_name: "mcp__github__list_issues",
    summary: "Issue #1",
    full_content: JSON.stringify([{ number: 1, title: "Fix bug" }]),
    original_size: 512,
    ...overrides,
  };
}

function exportToFile(filePath: string): void {
  writeFileSync(filePath, toolExport(sourceDb, SOURCE_PROJECT));
}

beforeEach(() => {
  // Reset any singleton a prior test file may have left open. getDb() returns
  // the cached instance and ignores its path argument once one exists, so
  // without this, a leaked singleton would make handleImportCommand write to
  // the wrong DB and leave targetDbPath schema-less ("no such table") — an
  // order-dependent cross-file flake. Resetting here makes the invariant below
  // ("a fresh singleton to the target path") hold regardless of run order.
  closeDb();
  // Use a raw Database (not the singleton) for the source so that
  // handleImportCommand can open a fresh singleton to the target path.
  sourceDb = new Database(":memory:");
  initSchema(sourceDb);
  tmpFiles = [];
});

afterEach(() => {
  sourceDb.close();
  closeDb(); // reset singleton opened by handleImportCommand
  for (const p of tmpFiles) {
    if (existsSync(p)) unlinkSync(p);
  }
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe("import round-trip", () => {
  test("imports all items into target DB", async () => {
    storeOutput(sourceDb, makeInput());
    storeOutput(sourceDb, makeInput({ tool_name: "mcp__github__get_issue", summary: "Issue #2" }));

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);

      const targetDb = new Database(targetDbPath);
      const rows = targetDb
        .prepare(`SELECT tool_name FROM stored_outputs ORDER BY created_at ASC`)
        .all() as Array<{ tool_name: string }>;
      targetDb.close();

      expect(rows).toHaveLength(2);
      expect(rows[0]!.tool_name).toBe("mcp__github__list_issues");
      expect(rows[1]!.tool_name).toBe("mcp__github__get_issue");
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("preserves summary-only rows (full_retained) across export/import", async () => {
    // A retained row and a summary-only row (body dropped per store.retention).
    storeOutput(sourceDb, makeInput({ tool_name: "mcp__github__list_issues", full_content: "kept body" }));
    storeOutput(sourceDb, makeInput({
      tool_name: "Bash", full_content: "dropped body ".repeat(50), full_retained: 0,
    }));

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);
      const targetDb = new Database(targetDbPath);
      const bash = targetDb
        .prepare(`SELECT full_retained, full_content FROM stored_outputs WHERE tool_name = 'Bash'`)
        .get() as { full_retained: number; full_content: string };
      const chunkCount = (
        targetDb.prepare(
          `SELECT COUNT(*) n FROM content_chunks c JOIN stored_outputs s ON s.id = c.output_id WHERE s.tool_name = 'Bash'`
        ).get() as { n: number }
      ).n;
      targetDb.close();

      expect(bash.full_retained).toBe(0);   // flag round-trips, not silently reset to 1
      expect(bash.full_content).toBe("");    // body stays dropped
      expect(chunkCount).toBe(0);            // no chunks re-indexed for a bodiless row
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  // A legitimate export never carries a body for a summary-only row (storeOutput
  // zeroes it at write). But a hand-edited / tampered / foreign-version dump can
  // pair full_retained=0 with a non-empty full_content — the schema validates the
  // two independently. Import must enforce storeOutput's invariant so the body is
  // dropped, otherwise the row occupies its full bytes on disk while the
  // effective-size cap accounting (#247) counts it as summary_size only.
  test("round-trips command_fp across export/import (#251)", async () => {
    storeOutput(sourceDb, makeInput({ tool_name: "Bash", command_fp: "git diff", summary: "d" }));

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);
      const targetDb = new Database(targetDbPath);
      const row = targetDb
        .prepare(`SELECT command_fp FROM stored_outputs WHERE tool_name = 'Bash'`)
        .get() as { command_fp: string | null };
      targetDb.close();
      expect(row.command_fp).toBe("git diff"); // fingerprint survives, not reset to unknown
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("drops the body of a summary-only row from a malformed dump (full_retained=0 invariant)", async () => {
    const bigBody = "x".repeat(10000);
    const dump = [{
      id: "recall_deadbeefcafe0001",
      project_key: SOURCE_PROJECT,
      session_id: "sess-abc",
      tool_name: "Bash",
      summary: "short summary",
      full_content: bigBody,        // present despite full_retained = 0 (malformed)
      original_size: 10000,
      summary_size: 13,
      created_at: 1_700_000_000,
      pinned: 0,
      access_count: 0,
      last_accessed: null,
      input_hash: null,
      full_retained: 0,
    }];
    const dumpFile = makeTmpPath();
    writeFileSync(dumpFile, JSON.stringify(dump));
    const targetDbPath = makeTmpPath(".db");

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);
      const targetDb = new Database(targetDbPath);
      const row = targetDb
        .prepare(`SELECT full_retained, full_content FROM stored_outputs WHERE id = 'recall_deadbeefcafe0001'`)
        .get() as { full_retained: number; full_content: string };
      targetDb.close();

      expect(row.full_retained).toBe(0);   // flag preserved
      expect(row.full_content).toBe("");    // body dropped to honor the invariant
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("remaps project key to current project by default", async () => {
    storeOutput(sourceDb, makeInput());
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);

      // Without --keep-project-key the project key is derived from cwd, not SOURCE_PROJECT.
      const targetDb = new Database(targetDbPath);
      const row = targetDb
        .prepare(`SELECT project_key FROM stored_outputs LIMIT 1`)
        .get() as { project_key: string } | null;
      targetDb.close();

      expect(row?.project_key).not.toBe(SOURCE_PROJECT);
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("rejects --keep-project-key and writes nothing (#226)", async () => {
    // The flag stranded rows: written to the current project's DB but stamped
    // with the dump's key, unreachable and undeletable through the tool layer.
    // It is now rejected before any DB is opened.
    storeOutput(sourceDb, makeInput());
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "import", dumpFile, "--keep-project-key"],
      {
        cwd: PROJECT_ROOT,
        stderr: "pipe",
        env: { ...process.env, RECALL_DB_PATH: targetDbPath },
      }
    );

    expect(result.exitCode).toBe(1);
    const stderr = result.stderr.toString();
    expect(stderr).toContain("--keep-project-key");
    expect(stderr).toContain("#226");
    // Rejected before any DB file is created — nothing is written.
    expect(existsSync(targetDbPath)).toBe(false);
  });

  test("preserves pin flag", async () => {
    const item = storeOutput(sourceDb, makeInput());
    pinOutput(sourceDb, item.id, SOURCE_PROJECT, true);

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);

      const targetDb = new Database(targetDbPath);
      const row = targetDb
        .prepare(`SELECT pinned FROM stored_outputs WHERE id = ?`)
        .get(item.id) as { pinned: number } | null;
      targetDb.close();

      expect(row?.pinned).toBe(1);
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("imported items are reachable through the project-scoped tool layer (#226)", async () => {
    // The bug: rows landed under a foreign project key, so the tool layer (which
    // filters WHERE project_key = current) could not see them. After the fix a
    // default import stamps the current key, so search/list_stored find them.
    storeOutput(sourceDb, makeInput({ full_content: "reachable content marker" }));
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);
      closeDb(); // flush the singleton so a fresh handle sees committed rows

      const currentKey = getProjectKey(process.cwd());
      const targetDb = new Database(targetDbPath);
      try {
        const listed = toolListStored(targetDb, currentKey, {});
        const searched = toolSearch(targetDb, currentKey, { query: "reachable" });
        expect(listed).not.toContain("no stored items");
        expect(listed).toContain("mcp__github__list_issues");
        expect(searched).not.toContain("no results");
      } finally {
        targetDb.close();
      }
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("content is searchable via FTS after import", async () => {
    storeOutput(sourceDb, makeInput({ full_content: "The quick brown fox jumps over the lazy dog" }));

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);

      const targetDb = new Database(targetDbPath);
      const rows = targetDb
        .prepare(
          `SELECT o.id FROM stored_outputs o
           JOIN outputs_fts f ON f.rowid = o.rowid
           WHERE outputs_fts MATCH ?`
        )
        .all("fox") as Array<{ id: string }>;
      targetDb.close();

      expect(rows.length).toBeGreaterThan(0);
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });
});

// ── skip / overwrite ──────────────────────────────────────────────────────────

describe("import conflict handling", () => {
  test("skips existing items by default", async () => {
    const item = storeOutput(sourceDb, makeInput());
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      // First import
      await handleImportCommand([dumpFile]);
      closeDb(); // reset singleton so next import opens the same file fresh

      // Mutate summary in source, re-export
      sourceDb.prepare(`UPDATE stored_outputs SET summary = 'UPDATED' WHERE id = ?`).run(item.id);
      exportToFile(dumpFile);

      // Second import — should skip
      await handleImportCommand([dumpFile]);

      const targetDb = new Database(targetDbPath);
      const row = targetDb
        .prepare(`SELECT summary FROM stored_outputs WHERE id = ?`)
        .get(item.id) as { summary: string } | null;
      targetDb.close();

      expect(row?.summary).toBe("Issue #1");
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("replaces existing items with --overwrite", async () => {
    const item = storeOutput(sourceDb, makeInput());
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);
      closeDb();

      sourceDb.prepare(`UPDATE stored_outputs SET summary = 'OVERWRITTEN' WHERE id = ?`).run(item.id);
      exportToFile(dumpFile);

      await handleImportCommand([dumpFile, "--overwrite"]);

      const targetDb = new Database(targetDbPath);
      const row = targetDb
        .prepare(`SELECT summary FROM stored_outputs WHERE id = ?`)
        .get(item.id) as { summary: string } | null;
      targetDb.close();

      expect(row?.summary).toBe("OVERWRITTEN");
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("chunk rows are replaced on --overwrite (no stale FTS entries)", async () => {
    const item = storeOutput(sourceDb, makeInput({ full_content: "original content" }));
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile]);
      closeDb();

      // Update content in source and re-export
      sourceDb.prepare(`UPDATE stored_outputs SET full_content = 'replacement content' WHERE id = ?`).run(item.id);
      exportToFile(dumpFile);

      await handleImportCommand([dumpFile, "--overwrite"]);

      const targetDb = new Database(targetDbPath);
      const chunkRows = targetDb
        .prepare(`SELECT content FROM content_chunks WHERE output_id = ?`)
        .all(item.id) as Array<{ content: string }>;
      targetDb.close();

      // There should be exactly one chunk group and none should contain "original"
      expect(chunkRows.length).toBeGreaterThan(0);
      expect(chunkRows.every((r) => !r.content.includes("original"))).toBe(true);
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });
});

// ── dry-run ───────────────────────────────────────────────────────────────────

describe("import --dry-run", () => {
  test("writes nothing to DB", async () => {
    storeOutput(sourceDb, makeInput());
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile, "--dry-run"]);
      expect(existsSync(targetDbPath)).toBe(false);
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("accurately counts skips when items already exist", async () => {
    storeOutput(sourceDb, makeInput());
    storeOutput(sourceDb, makeInput({ tool_name: "mcp__github__get_issue", summary: "Issue #2" }));

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      // Real import first
      await handleImportCommand([dumpFile]);
      closeDb();

      // Capture dry-run output
      let output = "";
      const originalLog = console.log;
      console.log = (...a: unknown[]) => { output += a.join(" ") + "\n"; };
      try {
        await handleImportCommand([dumpFile, "--dry-run"]);
      } finally {
        console.log = originalLog;
      }

      expect(output).toContain("2 skipped");
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });
});

// ── validation ────────────────────────────────────────────────────────────────

describe("import validation", () => {
  test("rejects invalid JSON", async () => {
    const dumpFile = makeTmpPath();
    writeFileSync(dumpFile, "not json at all");

    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "import", dumpFile],
      { cwd: PROJECT_ROOT, stderr: "pipe" }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Invalid JSON");
  });

  test("rejects JSON that doesn't match export schema", async () => {
    const dumpFile = makeTmpPath();
    writeFileSync(dumpFile, JSON.stringify([{ foo: "bar" }]));

    const result = Bun.spawnSync(
      ["bun", "run", "src/cli.ts", "import", dumpFile],
      { cwd: PROJECT_ROOT, stderr: "pipe" }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("recall__export");
  });

  test("handles empty export gracefully", async () => {
    const dumpFile = makeTmpPath();
    writeFileSync(dumpFile, "[]");
    // Should resolve without throwing
    await handleImportCommand([dumpFile]);
  });
});
