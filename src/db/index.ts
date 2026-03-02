import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";
import { randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredOutput {
  id: string;
  project_key: string;
  session_id: string;
  tool_name: string;
  summary: string;
  full_content: string;
  original_size: number;
  summary_size: number;
  created_at: number;
  pinned: number;        // 0 | 1
  access_count: number;
  last_accessed: number | null;
  input_hash: string | null;
}

export interface StoreInput {
  project_key: string;
  session_id: string;
  tool_name: string;
  summary: string;
  full_content: string;
  original_size: number;
  input_hash?: string;
}

export interface SearchOptions {
  project_key: string;
  tool?: string;
  limit?: number;
}

export interface ListOptions {
  project_key: string;
  tool?: string;
  limit?: number;
  offset?: number;
  sort?: "newest" | "oldest";
}

export interface ForgetOptions {
  id?: string;
  tool?: string;
  session_id?: string;
  older_than_days?: number;
  all?: boolean;
  force?: boolean; // override pinned protection
}

export interface Stats {
  total_items: number;
  total_original_bytes: number;
  total_summary_bytes: number;
  compression_ratio: number;
}

// ---------------------------------------------------------------------------
// Schema + migrations
// ---------------------------------------------------------------------------

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
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let instance: Database | null = null;

export function defaultDbPath(projectKey: string): string {
  return (
    process.env.RECALL_DB_PATH ??
    join(homedir(), ".local", "share", "mcp-recall", `${projectKey}.db`)
  );
}

export function getDb(path: string): Database {
  if (instance) return instance;
  if (path !== ":memory:") {
    mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  }
  instance = new Database(path);
  instance.run("PRAGMA journal_mode=WAL");
  instance.run("PRAGMA foreign_keys=ON");
  instance.run(SCHEMA);
  applyMigrations(instance);
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function generateId(): string {
  return `recall_${randomBytes(4).toString("hex")}`;
}

export function storeOutput(db: Database, input: StoreInput): StoredOutput {
  const id = generateId();
  const summary_size = Buffer.byteLength(input.summary, "utf8");
  const created_at = Math.floor(Date.now() / 1000);
  const input_hash = input.input_hash ?? null;

  db.prepare(`
    INSERT INTO stored_outputs
      (id, project_key, session_id, tool_name, summary, full_content,
       original_size, summary_size, created_at, input_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.project_key, input.session_id, input.tool_name,
    input.summary, input.full_content, input.original_size,
    summary_size, created_at, input_hash
  );

  return {
    id, ...input, summary_size, created_at,
    pinned: 0, access_count: 0, last_accessed: null,
    input_hash: input_hash,
  };
}

export function retrieveOutput(db: Database, id: string): StoredOutput | null {
  return db.prepare(
    `SELECT * FROM stored_outputs WHERE id = ?`
  ).get(id) as StoredOutput | null;
}

export function recordAccess(db: Database, id: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE stored_outputs
    SET access_count = access_count + 1, last_accessed = ?
    WHERE id = ?
  `).run(now, id);
}

export function pinOutput(
  db: Database,
  id: string,
  project_key: string,
  pinned: boolean
): boolean {
  const result = db.prepare(`
    UPDATE stored_outputs SET pinned = ? WHERE id = ? AND project_key = ?
  `).run(pinned ? 1 : 0, id, project_key);
  return result.changes > 0;
}

export function checkDedup(
  db: Database,
  project_key: string,
  input_hash: string
): StoredOutput | null {
  return db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND input_hash = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(project_key, input_hash) as StoredOutput | null;
}

export function evictIfNeeded(
  db: Database,
  project_key: string,
  max_size_mb: number
): number {
  const max_bytes = max_size_mb * 1024 * 1024;
  let evicted = 0;

  while (true) {
    const total = (db.prepare(`
      SELECT COALESCE(SUM(original_size), 0) as n
      FROM stored_outputs WHERE project_key = ?
    `).get(project_key) as { n: number }).n;

    if (total <= max_bytes) break;

    // Evict the least-frequently-accessed non-pinned item
    const candidate = db.prepare(`
      SELECT id FROM stored_outputs
      WHERE project_key = ? AND pinned = 0
      ORDER BY access_count ASC, last_accessed ASC NULLS FIRST, created_at ASC
      LIMIT 1
    `).get(project_key) as { id: string } | null;

    if (!candidate) break; // all remaining items are pinned

    db.prepare(`DELETE FROM stored_outputs WHERE id = ?`).run(candidate.id);
    evicted++;
  }

  return evicted;
}

export function retrieveSnippet(
  db: Database,
  id: string,
  query: string
): string | null {
  const row = db.prepare(
    `SELECT rowid FROM stored_outputs WHERE id = ?`
  ).get(id) as { rowid: number } | null;

  if (!row) return null;

  const result = db.prepare(`
    SELECT snippet(outputs_fts, 3, '', '', ' [...] ', 64) as excerpt
    FROM outputs_fts
    WHERE outputs_fts MATCH ?
    AND rowid = ?
  `).get(query, row.rowid) as { excerpt: string } | null;

  return result?.excerpt ?? null;
}

export function searchOutputs(
  db: Database,
  query: string,
  options: SearchOptions
): StoredOutput[] {
  const limit = options.limit ?? 10;
  const sql = `
    SELECT s.* FROM outputs_fts f
    JOIN stored_outputs s ON s.rowid = f.rowid
    WHERE outputs_fts MATCH ?
    AND s.project_key = ?
    ${options.tool ? "AND s.tool_name = ?" : ""}
    ORDER BY rank
    LIMIT ?
  `;
  const params: unknown[] = [query, options.project_key];
  if (options.tool) params.push(options.tool);
  params.push(limit);
  return db.prepare(sql).all(...params) as StoredOutput[];
}

export function listOutputs(db: Database, options: ListOptions): StoredOutput[] {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const order = options.sort === "oldest" ? "ASC" : "DESC";
  const sql = `
    SELECT * FROM stored_outputs
    WHERE project_key = ?
    ${options.tool ? "AND tool_name = ?" : ""}
    ORDER BY created_at ${order}
    LIMIT ? OFFSET ?
  `;
  const params: unknown[] = [options.project_key];
  if (options.tool) params.push(options.tool);
  params.push(limit, offset);
  return db.prepare(sql).all(...params) as StoredOutput[];
}

function countAndDelete(db: Database, where: string, params: unknown[]): number {
  const count = (
    db.prepare(`SELECT COUNT(*) as n FROM stored_outputs WHERE ${where}`)
      .get(...params) as { n: number }
  ).n;
  if (count > 0) {
    db.prepare(`DELETE FROM stored_outputs WHERE ${where}`).run(...params);
  }
  return count;
}

export function forgetOutputs(
  db: Database,
  project_key: string,
  options: ForgetOptions
): number {
  const pinGuard = options.force ? "" : "AND pinned = 0";

  if (options.all) {
    return countAndDelete(db, `project_key = ? ${pinGuard}`, [project_key]);
  }
  if (options.id) {
    // Single-item delete: ignore pin guard (explicit ID targets are intentional)
    return countAndDelete(db, "id = ? AND project_key = ?", [options.id, project_key]);
  }
  if (options.tool) {
    return countAndDelete(db, `tool_name = ? AND project_key = ? ${pinGuard}`, [options.tool, project_key]);
  }
  if (options.session_id) {
    return countAndDelete(db, `session_id = ? AND project_key = ? ${pinGuard}`, [options.session_id, project_key]);
  }
  if (options.older_than_days !== undefined) {
    const cutoff = Math.floor(Date.now() / 1000) - options.older_than_days * 86400;
    return countAndDelete(db, `created_at < ? AND project_key = ? ${pinGuard}`, [cutoff, project_key]);
  }
  return 0;
}

export function getStats(db: Database, project_key: string): Stats {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total_items,
      COALESCE(SUM(original_size), 0) as total_original_bytes,
      COALESCE(SUM(summary_size), 0) as total_summary_bytes
    FROM stored_outputs
    WHERE project_key = ?
  `).get(project_key) as {
    total_items: number;
    total_original_bytes: number;
    total_summary_bytes: number;
  };

  const compression_ratio =
    row.total_original_bytes > 0
      ? row.total_summary_bytes / row.total_original_bytes
      : 0;

  return { ...row, compression_ratio };
}

export function pruneExpired(
  db: Database,
  project_key: string,
  calendar_days: number
): number {
  const cutoff = Math.floor(Date.now() / 1000) - calendar_days * 86400;
  return countAndDelete(db, "created_at < ? AND project_key = ? AND pinned = 0", [cutoff, project_key]);
}

export function recordSession(db: Database, date: string): void {
  db.prepare(`INSERT OR IGNORE INTO sessions (date) VALUES (?)`).run(date);
}

export function getSessionDays(db: Database): string[] {
  return (
    db.prepare(`SELECT date FROM sessions ORDER BY date DESC`).all() as {
      date: string;
    }[]
  ).map((r) => r.date);
}
