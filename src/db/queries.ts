import { Database, type SQLQueryBindings } from "bun:sqlite";
import { randomBytes, createHash } from "crypto";
import { log } from "../log";
import type { StoredOutput, StoreInput, SearchOptions, ListOptions, ForgetOptions } from "./types";
import { chunkText, sanitizeFtsQuery } from "./chunking";

function generateId(): string {
  return `recall_${randomBytes(8).toString("hex")}`;
}

function storeChunks(db: Database, id: string, full_content: string): void {
  const chunks = chunkText(full_content);
  const stmt = db.prepare(
    `INSERT INTO content_chunks (output_id, chunk_index, content) VALUES (?, ?, ?)`
  );
  for (let i = 0; i < chunks.length; i++) {
    stmt.run(id, i, chunks[i]!);
  }
}

function countAndDelete(db: Database, where: string, params: SQLQueryBindings[]): number {
  const count = (
    db.prepare(`SELECT COUNT(*) as n FROM stored_outputs WHERE ${where}`)
      .get(...params) as { n: number }
  ).n;
  if (count > 0) {
    db.prepare(`DELETE FROM stored_outputs WHERE ${where}`).run(...params);
  }
  return count;
}

/** Minimum number of deleted rows that triggers incremental_vacuum to reclaim disk space. */
const VACUUM_THRESHOLD = 50;

/**
 * Persists a compressed tool output and populates the FTS index and chunk table.
 * Returns the fully-hydrated row including the generated `id`.
 */
export function storeOutput(db: Database, input: StoreInput): StoredOutput {
  const id = generateId();
  const summary_size = Buffer.byteLength(input.summary, "utf8");
  const created_at = Math.floor(Date.now() / 1000);
  const input_hash = input.input_hash ?? null;
  // Content hash enables dedup of identical output across different calls,
  // independent of the input-based hash. Source of truth is the full content.
  const output_hash = hashContent(input.full_content);

  const insertAndChunk = db.transaction(() => {
    db.prepare(`
      INSERT INTO stored_outputs
        (id, project_key, session_id, tool_name, summary, full_content,
         original_size, summary_size, created_at, input_hash, output_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.project_key, input.session_id, input.tool_name,
      input.summary, input.full_content, input.original_size,
      summary_size, created_at, input_hash, output_hash
    );

    storeChunks(db, id, input.full_content);
  });

  insertAndChunk();

  return {
    id, ...input, summary_size, created_at,
    pinned: 0, access_count: 0, last_accessed: null,
    input_hash: input_hash,
    output_hash,
  };
}

/** SHA-256 of tool output content, used as a path-independent dedup key. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Fetches a single stored output by its ID, or `null` if not found. */
export function retrieveOutput(db: Database, id: string): StoredOutput | null {
  return db.prepare(
    `SELECT * FROM stored_outputs WHERE id = ?`
  ).get(id) as StoredOutput | null;
}

/** Increments `access_count` and updates `last_accessed` timestamp for an item. */
export function recordAccess(db: Database, id: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE stored_outputs
    SET access_count = access_count + 1, last_accessed = ?
    WHERE id = ?
  `).run(now, id);
}

/**
 * Pins or unpins an item. Pinned items are exempt from expiry and eviction.
 * Returns `true` if the item was found and updated.
 */
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

/**
 * Looks up the most recent stored output with a matching `input_hash` for the project.
 * Returns `null` on a miss, indicating the call should be compressed and stored normally.
 */
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

/**
 * Looks up the most recent stored output whose *content* matches `output_hash`.
 * Catches the case the input-hash dedup misses: identical output produced by a
 * different call (or a call with no `tool_input` to hash). Returns `null` on a miss.
 */
export function checkOutputDedup(
  db: Database,
  project_key: string,
  output_hash: string
): StoredOutput | null {
  return db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND output_hash = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(project_key, output_hash) as StoredOutput | null;
}

const DEFAULT_EVICTION_HALF_LIFE_DAYS = 7;
const SECONDS_PER_DAY = 86400;

/**
 * Enforces the project store size cap by evicting the lowest-value non-pinned
 * items until total `original_size` is within `max_size_mb`.
 *
 * Value is a recency-weighted frequency score: `(access_count + 1)` decayed by
 * an exponential half-life on the time since last access (falling back to
 * creation time for never-accessed items). This ranks a steadily-used recent
 * item above one hit many times long ago — smarter than pure LFU, which would
 * cling to a once-hammered-then-abandoned item. Pinned items are exempt.
 * `now_secs` is injectable for deterministic tests.
 * Returns the number of items evicted (0 if already within limit).
 */
export function evictIfNeeded(
  db: Database,
  project_key: string,
  max_size_mb: number,
  half_life_days = DEFAULT_EVICTION_HALF_LIFE_DAYS,
  now_secs = Math.floor(Date.now() / 1000)
): number {
  const max_bytes = max_size_mb * 1024 * 1024;

  const { total } = db.prepare(`
    SELECT COALESCE(SUM(original_size), 0) as total
    FROM stored_outputs WHERE project_key = ?
  `).get(project_key) as { total: number };

  if (total <= max_bytes) return 0;

  const bytesToShed = total - max_bytes;

  const candidates = db.prepare(`
    SELECT id, original_size, access_count, last_accessed, created_at
    FROM stored_outputs
    WHERE project_key = ? AND pinned = 0
  `).all(project_key) as {
    id: string;
    original_size: number;
    access_count: number;
    last_accessed: number | null;
    created_at: number;
  }[];

  if (candidates.length === 0) return 0; // all remaining items are pinned

  // Math.max(1, …) guards against a non-positive half-life (NaN/Infinity) if a
  // future direct caller bypasses the Zod-validated config.
  const halfLifeSecs = Math.max(1, half_life_days * SECONDS_PER_DAY);
  const scoreOf = (c: (typeof candidates)[number]): number => {
    const lastActive = c.last_accessed ?? c.created_at;
    const ageSecs = Math.max(0, now_secs - lastActive);
    const recency = Math.pow(0.5, ageSecs / halfLifeSecs); // 1.0 when fresh, → 0 when old
    return (c.access_count + 1) * recency;
  };

  // Evict lowest value first; tiebreak oldest creation, then id for full determinism.
  const ranked = candidates
    .map((c) => ({ id: c.id, original_size: c.original_size, score: scoreOf(c), created_at: c.created_at }))
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.created_at - b.created_at ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );

  const toEvict: string[] = [];
  let shed = 0;
  for (const row of ranked) {
    if (shed >= bytesToShed) break;
    toEvict.push(row.id);
    shed += row.original_size;
  }

  // Single DELETE for all selected IDs.
  const placeholders = toEvict.map(() => "?").join(",");
  db.prepare(`DELETE FROM stored_outputs WHERE id IN (${placeholders})`).run(
    ...(toEvict as unknown as SQLQueryBindings[])
  );

  return toEvict.length;
}

/**
 * Returns a relevant excerpt from a stored item's full content using FTS.
 * Prefers chunk-based retrieval (precise, verbatim) over the legacy FTS snippet
 * function. Returns `null` if the item doesn't exist or the query has no match.
 */
export function retrieveSnippet(
  db: Database,
  id: string,
  query: string
): string | null {
  const row = db.prepare(
    `SELECT rowid FROM stored_outputs WHERE id = ?`
  ).get(id) as { rowid: number } | null;

  if (!row) return null;

  // FTS5 MATCH has its own query syntax — malformed queries throw.
  // Wrap in double-quotes to treat as a phrase, falling back on error.
  const safeQuery = sanitizeFtsQuery(query);

  // 1. Chunk-based retrieval: returns the best matching chunk verbatim
  try {
    const chunkRow = db.prepare(`
      SELECT content FROM content_chunks
      WHERE content_chunks MATCH ? AND output_id = ?
      ORDER BY rank
      LIMIT 1
    `).get(safeQuery, id) as { content: string } | null;

    if (chunkRow) return chunkRow.content;
  } catch {
    // FTS parse error — fall through to legacy
  }

  // 2. Legacy fallback: FTS snippet on full document (items stored pre-chunking)
  try {
    const snippetRow = db.prepare(`
      SELECT snippet(outputs_fts, 3, '', '', ' [...] ', 64) as excerpt
      FROM outputs_fts
      WHERE outputs_fts MATCH ?
      AND rowid = ?
    `).get(safeQuery, row.rowid) as { excerpt: string } | null;

    return snippetRow?.excerpt ?? null;
  } catch {
    return null;
  }
}

/** Chunks a "peek" returns — a bounded context window, not the full document. */
const PEEK_MAX_CHUNKS = 3;
const PEEK_CHUNK_JOINER = "\n […] \n";

/**
 * Peek: a bounded, multi-chunk context window into a stored item — the middle
 * retrieval tier between `searchOutputs` (index) and full content. With a query,
 * returns the top matching chunks (ranked); without one, the first chunks as a
 * head preview. Returns null when the item has no stored chunks (e.g. rows
 * created before chunking) so the caller can fall back.
 */
export function retrievePeek(
  db: Database,
  id: string,
  query: string | undefined,
  maxChunks = PEEK_MAX_CHUNKS
): string | null {
  const exists = db.prepare(`SELECT 1 FROM stored_outputs WHERE id = ?`).get(id);
  if (!exists) return null;

  if (query) {
    const safeQuery = sanitizeFtsQuery(query);
    try {
      const rows = db
        .prepare(
          `SELECT content, chunk_index FROM content_chunks
           WHERE content_chunks MATCH ? AND output_id = ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(safeQuery, id, maxChunks) as { content: string; chunk_index: number }[];
      if (rows.length > 0) {
        // Select the top-K by relevance, then present them in document order so
        // the […] joiner reflects real gaps, not a relevance reshuffle.
        return [...rows]
          .sort((a, b) => a.chunk_index - b.chunk_index)
          .map((r) => r.content)
          .join(PEEK_CHUNK_JOINER);
      }
    } catch {
      // FTS parse error — signal fallback to the caller
    }
    return null;
  }

  const rows = db
    .prepare(
      `SELECT content FROM content_chunks
       WHERE output_id = ?
       ORDER BY chunk_index
       LIMIT ?`
    )
    .all(id, maxChunks) as { content: string }[];
  return rows.length > 0 ? rows.map((r) => r.content).join(PEEK_CHUNK_JOINER) : null;
}

/**
 * Full-text searches across stored outputs for a project.
 * Results are ordered by FTS rank (best match first), capped at `options.limit` (default 10).
 */
export function searchOutputs(
  db: Database,
  query: string,
  options: SearchOptions
): StoredOutput[] {
  const limit = options.limit ?? 10;
  const safeQuery = sanitizeFtsQuery(query);
  const sql = `
    SELECT s.* FROM outputs_fts f
    JOIN stored_outputs s ON s.rowid = f.rowid
    WHERE outputs_fts MATCH ?
    AND s.project_key = ?
    ${options.tool ? "AND s.tool_name = ?" : ""}
    ORDER BY rank
    LIMIT ?
  `;
  const params: SQLQueryBindings[] = [safeQuery, options.project_key];
  if (options.tool) params.push(options.tool);
  params.push(limit);
  try {
    return db.prepare(sql).all(...params) as StoredOutput[];
  } catch {
    return [];
  }
}

/** Returns a paginated list of stored outputs, optionally filtered by tool name. */
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
  const params: SQLQueryBindings[] = [options.project_key];
  if (options.tool) params.push(options.tool);
  params.push(limit, offset);
  return db.prepare(sql).all(...params) as StoredOutput[];
}

/**
 * Deletes stored outputs matching the given criteria.
 * Pinned items are skipped unless `options.force` is true — except for
 * single-ID deletes (`options.id`), which always bypass pin protection
 * since an explicit ID is an intentional target.
 * Exactly one selector (`id`, `tool`, `session_id`, `older_than_days`, or `all`) should be set.
 * Returns the number of items deleted.
 */
export function forgetOutputs(
  db: Database,
  project_key: string,
  options: ForgetOptions
): number {
  const pinGuard = options.force ? "" : "AND pinned = 0";
  let deleted = 0;

  if (options.all) {
    deleted = countAndDelete(db, `project_key = ? ${pinGuard}`, [project_key]);
  } else if (options.id) {
    // Single-item delete: ignore pin guard (explicit ID targets are intentional)
    deleted = countAndDelete(db, "id = ? AND project_key = ?", [options.id, project_key]);
  } else if (options.tool) {
    deleted = countAndDelete(db, `tool_name = ? AND project_key = ? ${pinGuard}`, [options.tool, project_key]);
  } else if (options.session_id) {
    deleted = countAndDelete(db, `session_id = ? AND project_key = ? ${pinGuard}`, [options.session_id, project_key]);
  } else if (options.older_than_days !== undefined) {
    const cutoff = Math.floor(Date.now() / 1000) - options.older_than_days * 86400;
    deleted = countAndDelete(db, `created_at < ? AND project_key = ? ${pinGuard}`, [cutoff, project_key]);
  }

  if (deleted >= VACUUM_THRESHOLD) {
    try {
      // Non-blocking incremental reclamation; no-op on databases that were
      // created without auto_vacuum=INCREMENTAL.
      db.run("PRAGMA incremental_vacuum");
    } catch (e) {
      log.warn(`incremental_vacuum failed — ${e instanceof Error ? e.message : e}`);
    }
  }

  return deleted;
}

/**
 * Deletes non-pinned items created more than `calendar_days` ago.
 * Called by the SessionStart hook to enforce the expiry policy.
 * Returns the number of items deleted.
 */
export function pruneExpired(
  db: Database,
  project_key: string,
  calendar_days: number
): number {
  const cutoff = Math.floor(Date.now() / 1000) - calendar_days * 86400;
  return countAndDelete(db, "created_at < ? AND project_key = ? AND pinned = 0", [cutoff, project_key]);
}

/** Records a session date (YYYY-MM-DD) in the sessions table. No-op if already present. */
export function recordSession(db: Database, date: string): void {
  db.prepare(`INSERT OR IGNORE INTO sessions (date) VALUES (?)`).run(date);
}

/** Returns all recorded session dates in descending order (most recent first). */
export function getSessionDays(db: Database): string[] {
  return (
    db.prepare(`SELECT date FROM sessions ORDER BY date DESC`).all() as {
      date: string;
    }[]
  ).map((r) => r.date);
}
