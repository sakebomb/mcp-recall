import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";
import { log } from "../log";

// External-content FTS5 (#263): the index reads text through from stored_outputs by
// rowid instead of keeping its own verbatim copy (formerly ~34% of store bytes).
// Not contentless (content=''), which would break snippet() in searchOutputs.
// Reading through by rowid makes stored_outputs' implicit rowid load-bearing; see
// verifyFtsIndex for the guard after VACUUM.
const FTS_TABLE_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS outputs_fts USING fts5(
    id UNINDEXED,
    tool_name,
    summary,
    full_content,
    content='stored_outputs',
    content_rowid='rowid'
  )`;

// An external-content index must be told the deleted row's old values; a plain
// DELETE would look them up in stored_outputs, where the row is already gone.
const FTS_DELETE_TRIGGER_DDL = `
  CREATE TRIGGER IF NOT EXISTS outputs_ad AFTER DELETE ON stored_outputs BEGIN
    INSERT INTO outputs_fts(outputs_fts, rowid, id, tool_name, summary, full_content)
    VALUES ('delete', old.rowid, old.id, old.tool_name, old.summary, old.full_content);
  END`;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS stored_outputs (
    id TEXT PRIMARY KEY,
    project_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    full_content TEXT NOT NULL,
    original_size INTEGER NOT NULL,
    summary_size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed INTEGER,
    input_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_so_project_key ON stored_outputs(project_key);
  CREATE INDEX IF NOT EXISTS idx_so_created_at  ON stored_outputs(created_at);
  CREATE INDEX IF NOT EXISTS idx_so_tool_name   ON stored_outputs(tool_name);
  CREATE INDEX IF NOT EXISTS idx_so_input_hash  ON stored_outputs(project_key, input_hash);

  ${FTS_TABLE_DDL};

  CREATE TRIGGER IF NOT EXISTS outputs_ai AFTER INSERT ON stored_outputs BEGIN
    INSERT INTO outputs_fts(rowid, id, tool_name, summary, full_content)
    VALUES (new.rowid, new.id, new.tool_name, new.summary, new.full_content);
  END;

  ${FTS_DELETE_TRIGGER_DDL};

  CREATE VIRTUAL TABLE IF NOT EXISTS content_chunks USING fts5(
    output_id UNINDEXED,
    chunk_index UNINDEXED,
    content
  );

  CREATE TRIGGER IF NOT EXISTS outputs_ad_chunks AFTER DELETE ON stored_outputs BEGIN
    DELETE FROM content_chunks WHERE output_id = old.id;
  END;

  CREATE TABLE IF NOT EXISTS sessions (
    date TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// Schema changes applied after initial creation, each idempotent: columns rely on
// the duplicate-column catch below (SQLite has no ADD COLUMN IF NOT EXISTS),
// indexes use IF NOT EXISTS directly.
const MIGRATIONS = [
  "ALTER TABLE stored_outputs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stored_outputs ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stored_outputs ADD COLUMN last_accessed INTEGER",
  "ALTER TABLE stored_outputs ADD COLUMN input_hash TEXT",
  "ALTER TABLE stored_outputs ADD COLUMN output_hash TEXT",
  "CREATE INDEX IF NOT EXISTS idx_so_output_hash ON stored_outputs(project_key, output_hash)",
  // Whether the verbatim body is persisted (1) or the row is summary-only (0).
  // Existing rows all have bodies, so default 1. See store.retention.
  "ALTER TABLE stored_outputs ADD COLUMN full_retained INTEGER NOT NULL DEFAULT 1",
  // Privacy-safe command family fingerprint for per-command savings attribution
  // (#251); NULL for non-Bash rows and for rows written before this migration
  // (reported as "unknown"). See commandFingerprint in handlers/bash.ts.
  "ALTER TABLE stored_outputs ADD COLUMN command_fp TEXT",
  "CREATE INDEX IF NOT EXISTS idx_so_command_fp ON stored_outputs(project_key, command_fp)",
];

function applyMigrations(db: Database): void {
  for (const sql of MIGRATIONS) {
    try {
      db.run(sql);
    } catch (e) {
      // Only swallow "duplicate column" errors — ALTER TABLE IF NOT EXISTS is not
      // supported for columns in SQLite, so this is the standard approach.
      if (!(e instanceof Error) || !e.message.includes("duplicate column")) {
        throw e;
      }
    }
  }
}

/** True when outputs_fts is the pre-#263 form that keeps its own copy of the text. */
function hasLegacyFts(db: Database): boolean {
  return (
    db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'outputs_fts_content'").get() !==
    null
  );
}

export type FtsMigrationResult = "migrated" | "current" | "failed";

/**
 * One-time conversion of a legacy self-contained `outputs_fts` to external content
 * (#263). Runs in a single IMMEDIATE transaction that ends with a content-aware
 * integrity-check, so an interruption or a failed check rolls back to the old,
 * working index — never a half-built or silently-wrong one. The legacy check is
 * repeated inside the transaction because two processes (hook + server) can open
 * the same store at once. Never throws: a store that cannot migrate keeps working
 * on the old schema and retries on its next open.
 */
export function migrateFtsToExternalContent(db: Database): FtsMigrationResult {
  if (!hasLegacyFts(db)) return "current";
  try {
    const migrated = db
      .transaction(() => {
        if (!hasLegacyFts(db)) return false;
        db.run("DROP TRIGGER IF EXISTS outputs_ad");
        db.run("DROP TABLE outputs_fts");
        db.run(FTS_TABLE_DDL);
        db.run(FTS_DELETE_TRIGGER_DDL);
        db.run("INSERT INTO outputs_fts(outputs_fts) VALUES('rebuild')");
        db.run("INSERT INTO outputs_fts(outputs_fts, rank) VALUES('integrity-check', 1)");
        return true;
      })
      .immediate();
    if (!migrated) return "current";
  } catch (e) {
    log.warn(`FTS migration failed, keeping the existing index — ${e instanceof Error ? e.message : e}`);
    return "failed";
  }
  // The dropped copy's pages are free but still in the file. A no-op on stores
  // created without auto_vacuum=INCREMENTAL; `gc --vacuum` reclaims those.
  try {
    db.run("PRAGMA incremental_vacuum");
  } catch (e) {
    log.warn(`incremental_vacuum after FTS migration failed — ${e instanceof Error ? e.message : e}`);
  }
  log.debug("FTS index migrated to external content (#263)");
  return "migrated";
}

/**
 * Checks that outputs_fts agrees with stored_outputs and rebuilds it if not.
 * stored_outputs has no INTEGER PRIMARY KEY, and SQLite documents that VACUUM may
 * renumber implicit rowids; current SQLite preserves them, but an external-content
 * index keyed on rowid would silently return wrong rows if one ever did. Call after
 * VACUUM. Returns true when a rebuild was needed. Never throws.
 */
export function verifyFtsIndex(db: Database): boolean {
  if (db.query("SELECT 1 FROM sqlite_master WHERE name = 'outputs_fts'").get() === null) return false;
  try {
    db.run("INSERT INTO outputs_fts(outputs_fts, rank) VALUES('integrity-check', 1)");
    return false;
  } catch {
    try {
      db.run("INSERT INTO outputs_fts(outputs_fts) VALUES('rebuild')");
      log.warn("FTS index disagreed with stored_outputs; rebuilt");
    } catch (e) {
      log.warn(`FTS rebuild failed — ${e instanceof Error ? e.message : e}`);
    }
    return true;
  }
}

let instance: Database | null = null;

/**
 * Returns the SQLite database path for a project.
 * Respects `RECALL_DB_PATH` env override; otherwise places the DB in
 * `~/.local/share/mcp-recall/<projectKey>.db`.
 */
export function defaultDbPath(projectKey: string): string {
  return (
    process.env.RECALL_DB_PATH ??
    join(homedir(), ".local", "share", "mcp-recall", `${projectKey}.db`)
  );
}

/**
 * Returns the directory that holds per-project databases.
 * When `RECALL_DB_PATH` overrides to a single file, returns its parent directory
 * so callers that scan the store (e.g. `gc`) operate on the right location.
 */
export function dataDir(): string {
  const override = process.env.RECALL_DB_PATH;
  if (override) return dirname(override);
  return join(homedir(), ".local", "share", "mcp-recall");
}

/**
 * Opens and returns the singleton SQLite database, creating it if needed.
 * Applies the full schema and any pending migrations on first open.
 * Use `":memory:"` in tests to avoid touching the filesystem.
 */
export function getDb(path: string): Database {
  if (instance) return instance;
  if (path !== ":memory:") {
    mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  }
  instance = new Database(path);
  instance.run("PRAGMA journal_mode=WAL");
  instance.run("PRAGMA foreign_keys=ON");
  // Retry for up to 5 s when another writer holds the lock, rather than
  // failing immediately with SQLITE_BUSY.
  instance.run("PRAGMA busy_timeout=5000");
  // Prefer incremental auto-vacuum so free pages can be reclaimed in small
  // batches without blocking. Has no effect on existing databases that were
  // created with auto_vacuum=NONE; those gracefully skip reclamation.
  instance.run("PRAGMA auto_vacuum=INCREMENTAL");
  instance.run(SCHEMA);
  applyMigrations(instance);
  migrateFtsToExternalContent(instance);
  return instance;
}

/**
 * Applies the full schema and migrations to an existing connection.
 * Useful in tests that open a second raw connection to the same DB file and
 * need the schema available without depending on WAL checkpoint visibility.
 * All DDL uses IF NOT EXISTS / duplicate-column guards so it is idempotent.
 */
export function initSchema(db: Database): void {
  db.run(SCHEMA);
  applyMigrations(db);
  migrateFtsToExternalContent(db);
}

/** Closes the singleton database connection and resets the instance. Call in tests after each case. */
export function closeDb(): void {
  if (instance) {
    instance.run("PRAGMA optimize");
    instance.close();
  }
  instance = null;
}
