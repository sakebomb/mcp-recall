/**
 * `mcp-recall import` — restores items from a `recall__export` JSON dump into
 * the current project's SQLite database.
 *
 * Usage:
 *   mcp-recall import dump.json          # restore from file
 *   mcp-recall import < dump.json        # restore from stdin
 *   mcp-recall import dump.json --overwrite        # replace existing items
 *   mcp-recall import dump.json --keep-project-key # preserve original project key
 *   mcp-recall import dump.json --dry-run          # preview without writing
 */

import { readFileSync, statSync, existsSync } from "fs";
import { resolve } from "path";
import { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb, defaultDbPath } from "../db/schema";
import { chunkText } from "../db/chunking";
import { getProjectKey } from "../project-key";

// 50 MB — warn before loading a very large file synchronously
const LARGE_FILE_BYTES = 50 * 1024 * 1024;

// Sentinel emitted by toolExport when the project has no items
const EMPTY_EXPORT_SENTINEL = "[recall: no items to export]";

// ── Validation schema ─────────────────────────────────────────────────────────

const StoredOutputSchema = z.object({
  id: z.string().min(1),
  project_key: z.string().min(1),
  session_id: z.string().min(1),
  tool_name: z.string().min(1),
  summary: z.string(),
  full_content: z.string(),
  original_size: z.number().int().nonnegative(),
  summary_size: z.number().int().nonnegative(),
  created_at: z.number().int().positive(),
  pinned: z.number().int().min(0).max(1),
  access_count: z.number().int().nonnegative(),
  last_accessed: z.number().int().nullable(),
  input_hash: z.string().nullable(),
});

type StoredOutputRow = z.infer<typeof StoredOutputSchema>;

const ExportSchema = z.array(StoredOutputSchema);

// ── Core import logic ─────────────────────────────────────────────────────────

interface ImportResult {
  imported: number;
  skipped: number;
  overwritten: number;
}

/**
 * Counts how many items would be imported, overwritten, or skipped without
 * writing anything. Opens the target DB read-only if it exists.
 */
function dryRunCount(
  dbPath: string,
  items: StoredOutputRow[],
  overwrite: boolean
): ImportResult {
  if (dbPath === ":memory:" || !existsSync(dbPath)) {
    return { imported: items.length, skipped: 0, overwritten: 0 };
  }

  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const hasTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stored_outputs' LIMIT 1`)
      .get();
    if (!hasTable) return { imported: items.length, skipped: 0, overwritten: 0 };

    const result: ImportResult = { imported: 0, skipped: 0, overwritten: 0 };
    const check = db.prepare(`SELECT id FROM stored_outputs WHERE id = ? LIMIT 1`);
    for (const item of items) {
      const existing = check.get(item.id);
      if (existing) {
        if (overwrite) result.overwritten++;
        else result.skipped++;
      } else {
        result.imported++;
      }
    }
    return result;
  } catch {
    return { imported: items.length, skipped: 0, overwritten: 0 };
  } finally {
    db?.close();
  }
}

function importItems(
  dbPath: string,
  items: StoredOutputRow[],
  opts: { overwrite: boolean; targetProjectKey: string | null }
): ImportResult {
  const db = getDb(dbPath);

  const result: ImportResult = { imported: 0, skipped: 0, overwritten: 0 };

  // Prepare chunk statement once outside the per-item loop
  const chunkStmt = db.prepare(
    `INSERT INTO content_chunks (output_id, chunk_index, content) VALUES (?, ?, ?)`
  );

  const insertItem = db.transaction((item: StoredOutputRow) => {
    const projectKey = opts.targetProjectKey ?? item.project_key;

    const existing = db
      .prepare(`SELECT id FROM stored_outputs WHERE id = ? LIMIT 1`)
      .get(item.id) as { id: string } | null;

    if (existing) {
      if (!opts.overwrite) return "skipped" as const;
      // Delete existing row — triggers handle FTS + chunk cleanup automatically
      db.prepare(`DELETE FROM stored_outputs WHERE id = ?`).run(item.id);
    }

    db.prepare(`
      INSERT INTO stored_outputs
        (id, project_key, session_id, tool_name, summary, full_content,
         original_size, summary_size, created_at, pinned, access_count,
         last_accessed, input_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      projectKey,
      item.session_id,
      item.tool_name,
      item.summary,
      item.full_content,
      item.original_size,
      item.summary_size,
      item.created_at,
      item.pinned,
      item.access_count,
      item.last_accessed,
      item.input_hash
    );

    // Re-index chunks (FTS trigger covers stored_outputs but not content_chunks)
    const chunks = chunkText(item.full_content);
    for (let i = 0; i < chunks.length; i++) {
      chunkStmt.run(item.id, i, chunks[i]!);
    }

    return existing ? "overwritten" as const : "imported" as const;
  });

  // Accumulate counts only after each transaction commits successfully
  for (const item of items) {
    const action = insertItem(item);
    result[action]++;
  }

  return result;
}

// ── CLI handler ───────────────────────────────────────────────────────────────

export async function handleImportCommand(args: string[]): Promise<void> {
  const overwrite = args.includes("--overwrite");
  const keepProjectKey = args.includes("--keep-project-key");
  const dryRun = args.includes("--dry-run");
  const rawPath = args.find((a) => !a.startsWith("--"));
  const filePath = rawPath ? resolve(rawPath) : null;

  // Read input
  let raw: string;
  if (filePath) {
    try {
      const size = statSync(filePath).size;
      if (size > LARGE_FILE_BYTES) {
        console.error(`Warning: file is ${Math.round(size / 1024 / 1024)} MB — this may take a while.`);
      }
      raw = readFileSync(filePath, "utf8");
    } catch {
      console.error(`Cannot read file: ${filePath}`);
      process.exit(1);
    }
  } else {
    try {
      raw = readFileSync("/dev/stdin", "utf8");
    } catch {
      console.error("No file specified and stdin is not readable.");
      console.error("Usage: mcp-recall import <file.json> [--overwrite] [--keep-project-key] [--dry-run]");
      process.exit(1);
    }
  }

  // Detect the sentinel emitted by recall__export when the project is empty
  if (raw.trimStart().startsWith(EMPTY_EXPORT_SENTINEL)) {
    console.log("Nothing to import (empty export).");
    return;
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("Invalid JSON input.");
    process.exit(1);
  }

  // Validate schema
  const validation = ExportSchema.safeParse(parsed);
  if (!validation.success) {
    console.error("Input does not look like a recall__export dump:");
    for (const issue of validation.error.issues.slice(0, 5)) {
      console.error(`  [${issue.path.join(".")}] ${issue.message}`);
    }
    process.exit(1);
  }

  const items = validation.data;

  if (items.length === 0) {
    console.log("Nothing to import (empty export).");
    return;
  }

  // Resolve target DB
  const projectKey = getProjectKey(process.cwd());
  const dbPath = defaultDbPath(projectKey);
  const targetProjectKey = keepProjectKey ? null : projectKey;

  console.log(`\nImporting ${items.length} item(s) into ${dbPath}`);
  if (dryRun) console.log("(dry run — nothing will be written)\n");

  const result = dryRun
    ? dryRunCount(dbPath, items, overwrite)
    : importItems(dbPath, items, { overwrite, targetProjectKey });

  const parts: string[] = [];
  if (result.imported > 0) parts.push(`${result.imported} imported`);
  if (result.overwritten > 0) parts.push(`${result.overwritten} overwritten`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped (already exist — use --overwrite to replace)`);

  console.log(parts.length > 0 ? parts.join(", ") + "." : "Nothing imported.");

  if (!dryRun && result.imported + result.overwritten > 0) {
    console.log("\nNext steps:");
    console.log("  recall__search <query>   — verify content is searchable");
    console.log("  recall__list_stored      — browse imported items");
  }
}
