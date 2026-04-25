import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

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

  CREATE VIRTUAL TABLE IF NOT EXISTS outputs_fts USING fts5(
    id UNINDEXED,
    tool_name,
    summary,
    full_content
  );

  CREATE TRIGGER IF NOT EXISTS outputs_ai AFTER INSERT ON stored_outputs BEGIN
    INSERT INTO outputs_fts(rowid, id, tool_name, summary, full_content)
    VALUES (new.rowid, new.id, new.tool_name, new.summary, new.full_content);
  END;

  CREATE TRIGGER IF NOT EXISTS outputs_ad AFTER DELETE ON stored_outputs BEGIN
    DELETE FROM outputs_fts WHERE rowid = old.rowid;
  END;

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
`;

// Columns added after initial schema — applied once, idempotent via try/catch
const MIGRATIONS = [
  "ALTER TABLE stored_outputs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stored_outputs ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stored_outputs ADD COLUMN last_accessed INTEGER",
  "ALTER TABLE stored_outputs ADD COLUMN input_hash TEXT",
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
}

/** Closes the singleton database connection and resets the instance. Call in tests after each case. */
export function closeDb(): void {
  if (instance) {
    instance.run("PRAGMA optimize");
    instance.close();
  }
  instance = null;
}
