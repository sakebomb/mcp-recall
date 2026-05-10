import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { storeOutput, pinOutput } from "../src/db/index";
import { initSchema, closeDb } from "../src/db/schema";
import { toolExport } from "../src/tools";
import { handleImportCommand } from "../src/import/index";
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
      await handleImportCommand([dumpFile, "--keep-project-key"]);

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

  test("preserves original project key with --keep-project-key", async () => {
    storeOutput(sourceDb, makeInput());
    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile, "--keep-project-key"]);

      const targetDb = new Database(targetDbPath);
      const row = targetDb
        .prepare(`SELECT project_key FROM stored_outputs LIMIT 1`)
        .get() as { project_key: string } | null;
      targetDb.close();

      expect(row?.project_key).toBe(SOURCE_PROJECT);
    } finally {
      delete process.env.RECALL_DB_PATH;
    }
  });

  test("preserves pin flag", async () => {
    const item = storeOutput(sourceDb, makeInput());
    pinOutput(sourceDb, item.id, SOURCE_PROJECT, true);

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile, "--keep-project-key"]);

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

  test("content is searchable via FTS after import", async () => {
    storeOutput(sourceDb, makeInput({ full_content: "The quick brown fox jumps over the lazy dog" }));

    const dumpFile = makeTmpPath();
    const targetDbPath = makeTmpPath(".db");
    exportToFile(dumpFile);

    process.env.RECALL_DB_PATH = targetDbPath;
    try {
      await handleImportCommand([dumpFile, "--keep-project-key"]);

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
      await handleImportCommand([dumpFile, "--keep-project-key"]);
      closeDb(); // reset singleton so next import opens the same file fresh

      // Mutate summary in source, re-export
      sourceDb.prepare(`UPDATE stored_outputs SET summary = 'UPDATED' WHERE id = ?`).run(item.id);
      exportToFile(dumpFile);

      // Second import — should skip
      await handleImportCommand([dumpFile, "--keep-project-key"]);

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
      await handleImportCommand([dumpFile, "--keep-project-key"]);
      closeDb();

      sourceDb.prepare(`UPDATE stored_outputs SET summary = 'OVERWRITTEN' WHERE id = ?`).run(item.id);
      exportToFile(dumpFile);

      await handleImportCommand([dumpFile, "--keep-project-key", "--overwrite"]);

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
      await handleImportCommand([dumpFile, "--keep-project-key"]);
      closeDb();

      // Update content in source and re-export
      sourceDb.prepare(`UPDATE stored_outputs SET full_content = 'replacement content' WHERE id = ?`).run(item.id);
      exportToFile(dumpFile);

      await handleImportCommand([dumpFile, "--keep-project-key", "--overwrite"]);

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
      await handleImportCommand([dumpFile, "--keep-project-key"]);
      closeDb();

      // Capture dry-run output
      let output = "";
      const originalLog = console.log;
      console.log = (...a: unknown[]) => { output += a.join(" ") + "\n"; };
      try {
        await handleImportCommand([dumpFile, "--keep-project-key", "--dry-run"]);
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
