/**
 * `mcp-recall import` — restores items from a `recall__export` JSON dump into
 * the current project's SQLite database.
 *
 * Usage:
 *   mcp-recall import dump.json          # restore from file
 *   mcp-recall import < dump.json        # restore from stdin
 *   mcp-recall import dump.json --overwrite        # replace existing items
 *   mcp-recall import dump.json --dry-run          # preview without writing
 *
 * Imported rows are always stamped with the current project's key so they are
 * reachable through the project-scoped tool layer. The former
 * `--keep-project-key` flag is rejected (#226) — see handleImportCommand.
 *
 * Rows carrying a credential are withheld and reported rather than written —
 * see partitionSecrets (#273). This is the only secret scan on the import path.
 */

import { readFileSync, statSync, existsSync } from "fs";
import { resolve } from "path";
import { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb, defaultDbPath } from "../db/schema";
import { chunkText } from "../db/chunking";
import { getProjectKey } from "../project-key";
import { findSecrets } from "../secrets";

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
  // Optional for backward-compat with dumps predating store.retention: an older
  // dump has no flag and its rows all carry bodies, so default to retained (1).
  full_retained: z.number().int().min(0).max(1).optional().default(1),
  // Optional for backward-compat with dumps predating per-command attribution
  // (#251): missing → NULL, reported as "unknown".
  command_fp: z.string().nullable().optional().default(null),
});

type StoredOutputRow = z.infer<typeof StoredOutputSchema>;

const ExportSchema = z.array(StoredOutputSchema);

// ── Secret scan ───────────────────────────────────────────────────────────────

interface SecretScan {
  clean: StoredOutputRow[];
  withheld: number;
  patterns: string[];
}

/**
 * Partitions dump rows into those safe to write and those carrying a credential.
 *
 * `mcp-recall import` reaches storage through its own INSERT — it bypasses both
 * the PostToolUse hook and storeOutput — so this is the only secret scan on the
 * path (#273, the sibling entry point left open by #271/#272).
 *
 * The scan runs once here, before either the dry-run counter or the real insert
 * sees the array, rather than inside importItems: a matching row is then never
 * *constructed* into an INSERT, and `--dry-run` cannot disagree with the run it
 * is predicting.
 *
 * Skip-and-report rather than abort — one bad row must not fail a 10,000-row
 * restore. Pattern names are reported, never the matched values.
 */
function partitionSecrets(items: StoredOutputRow[]): SecretScan {
  const clean: StoredOutputRow[] = [];
  const patterns = new Set<string>();
  let withheld = 0;

  for (const item of items) {
    // Scan the body even for full_retained=0, whose body the insert drops: a
    // tampered dump can pair that flag with a populated body, and a credential
    // surviving only in the summary is just as unsafe to store.
    const found = findSecrets(`${item.summary}\n${item.full_content}`);
    if (found.length > 0) {
      withheld++;
      for (const name of found) patterns.add(name);
      continue;
    }
    clean.push(item);
  }

  return { clean, withheld, patterns: [...patterns].sort() };
}

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
  opts: { overwrite: boolean; projectKey: string }
): ImportResult {
  const db = getDb(dbPath);

  const result: ImportResult = { imported: 0, skipped: 0, overwritten: 0 };

  // Prepare chunk statement once outside the per-item loop
  const chunkStmt = db.prepare(
    `INSERT INTO content_chunks (output_id, chunk_index, content) VALUES (?, ?, ?)`
  );

  const insertItem = db.transaction((item: StoredOutputRow) => {
    // Always stamp the current project's key (never the dump's) so the row is
    // reachable and deletable through the project-scoped tool layer (#226).
    const projectKey = opts.projectKey;

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
         last_accessed, input_hash, full_retained, command_fp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      projectKey,
      item.session_id,
      item.tool_name,
      item.summary,
      // Enforce storeOutput's invariant: a summary-only row (full_retained=0)
      // carries no body. A legitimate export already has full_content="" here,
      // but a malformed/tampered dump may not — dropping it keeps effective-size
      // cap accounting (#247) honest and matches the write path.
      item.full_retained ? item.full_content : "",
      item.original_size,
      item.summary_size,
      item.created_at,
      item.pinned,
      item.access_count,
      item.last_accessed,
      item.input_hash,
      item.full_retained,
      item.command_fp
    );

    // Re-index chunks (FTS trigger covers stored_outputs but not content_chunks).
    // Summary-only rows have no body, so skip — matches storeOutput's behavior.
    if (item.full_retained) {
      const chunks = chunkText(item.full_content);
      for (let i = 0; i < chunks.length; i++) {
        chunkStmt.run(item.id, i, chunks[i]!);
      }
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
  const dryRun = args.includes("--dry-run");

  // --keep-project-key was removed in #226. It stamped rows with the dump's
  // original project key while still writing them to the *current* project's
  // database — where every project-scoped path (search, list_stored, forget,
  // size accounting) filters on the current key. The rows were therefore
  // unreachable and undeletable through the tool layer. Reject the flag loudly
  // rather than silently re-stamping, so a caller who relied on it learns why.
  if (args.includes("--keep-project-key")) {
    console.error(
      "The --keep-project-key flag was removed (#226): it wrote rows into the current\n" +
      "project's database while stamping them with the dump's original key, leaving them\n" +
      "unreachable by search/list_stored/forget and invisible to the size cap.\n" +
      "Run `mcp-recall import <file>` without it — items land in the current project and\n" +
      "behave normally. To recover rows already stranded by the old flag, see\n" +
      '"Recovering rows stranded by --keep-project-key" in docs/troubleshooting.md.'
    );
    process.exit(1);
  }

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
      console.error("Usage: mcp-recall import <file.json> [--overwrite] [--dry-run]");
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

  const { clean, withheld, patterns } = partitionSecrets(items);

  console.log(`\nImporting ${clean.length} item(s) into ${dbPath}`);
  if (dryRun) console.log("(dry run — nothing will be written)\n");

  // Loud, and on stderr, so the warning survives `| tee` / redirected stdout.
  // Deliberately worded apart from the "skipped (already exist)" count below —
  // both can occur in one run and they mean different things.
  if (withheld > 0) {
    console.error(
      `${dryRun ? "Would withhold" : "Withheld"} ${withheld} row(s) containing secrets ` +
      `(${patterns.join(", ")}). ${dryRun ? "They would not be imported." : "They were NOT imported."}`
    );
  }

  const result = dryRun
    ? dryRunCount(dbPath, clean, overwrite)
    : importItems(dbPath, clean, { overwrite, projectKey });

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
