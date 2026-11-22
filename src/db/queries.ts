import { Database, type SQLQueryBindings } from "bun:sqlite";
import { randomBytes, createHash } from "crypto";
import { log } from "../log";
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync } from "fs";
import { basename, dirname, join } from "path";
import type { StoredOutput, StoreInput, SearchOptions, ListOptions, ForgetOptions, CallRecord } from "./types";
import { CALL_OUTCOMES } from "./types";
import { chunkText, sanitizeFtsQuery } from "./chunking";
import { truncateWal } from "./schema";

/**
 * SQL expression for a row's *effective* stored size — the bytes it actually
 * occupies. A summary-only row (`full_retained = 0`, written under
 * `store.retention`) drops its body and chunks, so it costs ~`summary_size`,
 * not `original_size`. Used by the byte-cap accounting (store.max_size_mb
 * eviction, store.max_pinned_mb pin budget) so lowering retention genuinely
 * expands the item budget (#247). NOT used for the *savings* figures in
 * getStats — those keep reporting `original_size` (the context actually saved).
 */
export const EFFECTIVE_SIZE_EXPR =
  "CASE WHEN full_retained = 1 THEN original_size ELSE summary_size END";

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
 * Returns free pages to the OS after a bulk delete, when enough rows were removed
 * to be worth the work. A no-op on databases created without
 * `auto_vacuum=INCREMENTAL` (e.g. legacy stores) — those must be reclaimed with a
 * full `VACUUM`, which `mcp-recall gc --vacuum` performs. Never throws.
 */
export function reclaimPages(db: Database, deleted: number): void {
  if (deleted < VACUUM_THRESHOLD) return;
  try {
    db.run("PRAGMA incremental_vacuum");
  } catch (e) {
    log.warn(`incremental_vacuum failed — ${e instanceof Error ? e.message : e}`);
  }
  truncateWal(db);
}

/** Upserts a key/value pair into the per-project `meta` table. */
export function setMeta(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

/** Reads a value from the `meta` table, or `null` if the key is absent. */
export function getMeta(db: Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

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
  // independent of the input-based hash. Reuse the caller's hash when provided
  // (the hook already computed it for the dedup check) to avoid re-hashing.
  // Hash the REAL content even for summary-only rows, so dedup still works.
  const output_hash = input.output_hash ?? hashContent(input.full_content);

  // Summary-only rows (store.retention) drop the verbatim body and its chunks.
  // full_content is NOT NULL, so store an empty string rather than NULL.
  const full_retained = input.full_retained ?? 1;
  const bodyToStore = full_retained ? input.full_content : "";
  const command_fp = input.command_fp ?? null;
  const delivered_size = input.delivered_size ?? null;
  const handler = input.handler ?? null;

  const insertAndChunk = db.transaction(() => {
    db.prepare(`
      INSERT INTO stored_outputs
        (id, project_key, session_id, tool_name, summary, full_content,
         original_size, summary_size, created_at, input_hash, output_hash, full_retained, command_fp,
         delivered_size, handler)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.project_key, input.session_id, input.tool_name,
      input.summary, bodyToStore, input.original_size,
      summary_size, created_at, input_hash, output_hash, full_retained, command_fp,
      delivered_size, handler
    );

    if (full_retained) storeChunks(db, id, input.full_content);
  });

  insertAndChunk();

  return {
    id, ...input, full_content: bodyToStore, summary_size, created_at,
    pinned: 0, access_count: 0, last_accessed: null,
    input_hash: input_hash,
    output_hash,
    full_retained,
    command_fp,
    delivered_size,
    handler,
  };
}

/** SHA-256 of tool output content, used as a path-independent dedup key. */
// ── Call counters (#495) ──────────────────────────────────────────────────────
//
// A SQLite commit costs a pass-through call 15-20 ms on Bun 1.4 (a bare
// open-write-exit takes 24 ms there against 9 ms on 1.3). So the hook appends
// each call to a log beside the store, `<store>.calls`, and the log is folded
// into call_counts by writes that happen anyway: storing a summary, a session
// starting, forget-all. Readers add the unfolded lines, so counts are current.

/** A counted call with the local day it happened. */
export interface PendingCall extends CallRecord {
  day: string;
}

/**
 * The local calendar date, YYYY-MM-DD: the day a call is counted under. Local,
 * not UTC, so "today" on the status line turns over at the user's midnight
 * (UTC's falls in the working evening across the Americas).
 */
export function localDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A fold claims the log by renaming it to `<log>.<unique>.folding` first. */
const FOLDING_SUFFIX = ".folding";
/** A claimed log this old belongs to a fold that died before deleting it. */
const STALE_FOLD_MS = 60_000;

/** The pending-count log beside a store file, or null for an in-memory store. */
export function callLogPath(dbFile: string): string | null {
  return dbFile === "" || dbFile === ":memory:" ? null : `${dbFile}.calls`;
}

/** The log and any claimed copies of it: every file holding unfolded counts. */
export function callLogFiles(dbFile: string): string[] {
  const live = callLogPath(dbFile);
  if (live === null) return [];
  const dir = dirname(live);
  const prefix = basename(live) + ".";
  let claimed: string[] = [];
  try {
    claimed = readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith(FOLDING_SUFFIX)).map((n) => join(dir, n));
  } catch { /* no directory: nothing pending */ }
  return [...(existsSync(live) ? [live] : []), ...claimed];
}

function parseCallLog(file: string): PendingCall[] {
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return []; }
  const calls: PendingCall[] = [];
  for (const line of text.split("\n")) {
    if (line === "") continue;
    try {
      const c = JSON.parse(line) as PendingCall;
      if (typeof c.project_key === "string" && typeof c.tool_name === "string" && typeof c.day === "string" &&
          (CALL_OUTCOMES as readonly string[]).includes(c.outcome)) calls.push(c);
    } catch { /* a torn or foreign line: skip it, never fail the reader */ }
  }
  return calls;
}

/** Every counted call not yet folded into call_counts, for a reader. */
export function readCallLog(dbFile: string): PendingCall[] {
  return callLogFiles(dbFile).flatMap(parseCallLog);
}

function upsertCalls(db: Database, calls: PendingCall[]): void {
  const stmt = db.prepare(`
    INSERT INTO call_counts (project_key, day, tool_name, command_fp, outcome, calls, original_bytes, delivered_bytes)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT (project_key, day, tool_name, command_fp, outcome) DO UPDATE SET
      calls           = calls + 1,
      original_bytes  = original_bytes + excluded.original_bytes,
      delivered_bytes = delivered_bytes + excluded.delivered_bytes
  `);
  db.transaction(() => {
    for (const c of calls) {
      stmt.run(c.project_key, c.day, c.tool_name, c.command_fp ?? "", c.outcome, c.original_bytes, c.delivered_bytes);
    }
  })();
}

/**
 * Counts one intercepted call under today's local date: one appended line, no
 * SQLite write. An in-memory store has no file to log beside, so it is
 * written directly. Never throws: a counter must not cost the user the summary.
 */
export function recordCall(db: Database, call: CallRecord): void {
  try {
    const pending: PendingCall = { ...call, day: localDay() };
    const log_ = callLogPath(db.filename);
    if (log_ === null) upsertCalls(db, [pending]);
    else appendFileSync(log_, JSON.stringify(pending) + "\n");
  } catch (e) {
    log.debug(`recordCall failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Moves the store's logged counts into call_counts. Each file is claimed by an
 * atomic rename before it is read, so two folds never count a line twice; a
 * hook appending meanwhile starts a fresh log. Call it where the store is being
 * written anyway. Never throws.
 *
 * The counts are best effort, never exact: an append already open on the log
 * when it is claimed can land after the read and be lost; a crash between the
 * upsert and the unlink counts that file again once its claim goes stale; and a
 * reader between those two steps sees the file's lines twice, briefly.
 */
export function foldCallLog(db: Database): void {
  const live = callLogPath(db.filename);
  if (live === null) return;
  const claims: string[] = [];
  const claim = (file: string): void => {
    const to = `${live}.${process.pid}-${Date.now()}-${claims.length}${FOLDING_SUFFIX}`;
    try { renameSync(file, to); } catch { return; /* gone, or another fold took it */ }
    claims.push(to);
    // A rename keeps the log's last-append mtime, so a quiet project's log would
    // look stale the moment it is claimed and another fold could take it over.
    try { const now = new Date(); utimesSync(to, now, now); } catch { /* best effort */ }
  };
  if (existsSync(live)) claim(live);
  for (const file of callLogFiles(db.filename)) {
    if (file === live || claims.includes(file)) continue;
    try { if (Date.now() - statSync(file).mtimeMs > STALE_FOLD_MS) claim(file); } catch { /* gone */ }
  }
  for (const file of claims) {
    try {
      upsertCalls(db, parseCallLog(file));
      unlinkSync(file);
    } catch (e) {
      log.debug(`foldCallLog failed on ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

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
 * Outcome of a {@link pinOutput} call. `over_budget` carries the byte figures so
 * the caller can build an actionable message without re-querying.
 */
export type PinOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "over_budget"; pinnedBytes: number; itemBytes: number; capBytes: number };

/**
 * Pins or unpins an item. Pinned items are exempt from expiry and eviction, so an
 * unbounded number of pins would silently void `store.max_size_mb`. When pinning a
 * not-yet-pinned item and `maxPinnedMb` is supplied, this enforces that cap *at the
 * write*: if the item's effective size (`summary_size` for summary-only rows,
 * else `original_size`) would push total pinned bytes over the cap, the row is
 * left unpinned and `over_budget` is returned — so the bound holds even
 * if the caller ignores the result and keeps pinning. Unpinning, and re-pinning an
 * already-pinned item, are never budget-checked. Omitting `maxPinnedMb` disables the
 * check (used by tests and internal callers that pin unconditionally).
 */
export function pinOutput(
  db: Database,
  id: string,
  project_key: string,
  pinned: boolean,
  maxPinnedMb?: number
): PinOutcome {
  const item = db.prepare(`
    SELECT ${EFFECTIVE_SIZE_EXPR} AS effective_size, pinned FROM stored_outputs WHERE id = ? AND project_key = ?
  `).get(id, project_key) as { effective_size: number; pinned: number } | null;
  if (!item) return { ok: false, reason: "not_found" };

  if (pinned && item.pinned === 0 && maxPinnedMb !== undefined) {
    const capBytes = maxPinnedMb * 1024 * 1024;
    const { pinnedBytes } = db.prepare(`
      SELECT COALESCE(SUM(${EFFECTIVE_SIZE_EXPR}), 0) as pinnedBytes
      FROM stored_outputs WHERE project_key = ? AND pinned = 1
    `).get(project_key) as { pinnedBytes: number };
    if (pinnedBytes + item.effective_size > capBytes) {
      return { ok: false, reason: "over_budget", pinnedBytes, itemBytes: item.effective_size, capBytes };
    }
  }

  db.prepare(`
    UPDATE stored_outputs SET pinned = ? WHERE id = ? AND project_key = ?
  `).run(pinned ? 1 : 0, id, project_key);
  return { ok: true };
}

/**
 * Looks up the most recent stored output whose summary can stand in for this
 * call: identical content (`output_hash`) from the same tool and, for Bash, the
 * same command family. Matching on input instead served a re-run its first
 * run's result after the output changed, and matching content across commands
 * delivered one command's summary for another (#324). Returns `null` on a miss.
 */
export function checkOutputDedup(
  db: Database,
  project_key: string,
  output_hash: string,
  tool_name: string,
  command_fp: string | null
): StoredOutput | null {
  return db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND output_hash = ? AND tool_name = ? AND command_fp IS ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(project_key, output_hash, tool_name, command_fp) as StoredOutput | null;
}

const DEFAULT_EVICTION_HALF_LIFE_DAYS = 7;
const SECONDS_PER_DAY = 86400;

/**
 * Enforces the project store size cap by evicting the lowest-value non-pinned
 * items until total effective size is within `max_size_mb`. Effective size is
 * `original_size` for full-body rows and `summary_size` for summary-only rows
 * (`full_retained = 0`, written under `store.retention`), so lowering retention
 * genuinely raises the number of items the store holds before eviction (#247).
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
    SELECT COALESCE(SUM(${EFFECTIVE_SIZE_EXPR}), 0) as total
    FROM stored_outputs WHERE project_key = ?
  `).get(project_key) as { total: number };

  if (total <= max_bytes) return 0;

  const bytesToShed = total - max_bytes;

  const candidates = db.prepare(`
    SELECT id, ${EFFECTIVE_SIZE_EXPR} AS effective_size, access_count, last_accessed, created_at
    FROM stored_outputs
    WHERE project_key = ? AND pinned = 0
  `).all(project_key) as {
    id: string;
    effective_size: number;
    access_count: number;
    last_accessed: number | null;
    created_at: number;
  }[];

  if (candidates.length === 0) return 0; // all remaining items are pinned

  // Fall back to the finite default for any non-finite or non-positive half-life before
  // deriving seconds. This closes two silent-degradation cases (#228): Infinity — reachable
  // from `eviction_half_life_days = inf`, legal TOML that passes z.number().positive() —
  // makes every recency factor 1, degrading decay to plain LFU; NaN (a direct caller only,
  // Zod rejects it) makes every score NaN, so the comparator falls through to insertion
  // order, unranked. The trailing Math.max(1, …) still floors sub-second finite values.
  const safeHalfLifeDays =
    Number.isFinite(half_life_days) && half_life_days > 0
      ? half_life_days
      : DEFAULT_EVICTION_HALF_LIFE_DAYS;
  const halfLifeSecs = Math.max(1, safeHalfLifeDays * SECONDS_PER_DAY);
  const scoreOf = (c: (typeof candidates)[number]): number => {
    const lastActive = c.last_accessed ?? c.created_at;
    const ageSecs = Math.max(0, now_secs - lastActive);
    const recency = Math.pow(0.5, ageSecs / halfLifeSecs); // 1.0 when fresh, → 0 when old
    return (c.access_count + 1) * recency;
  };

  // Evict lowest value first; tiebreak oldest creation, then id for full determinism.
  const ranked = candidates
    .map((c) => ({ id: c.id, effective_size: c.effective_size, score: scoreOf(c), created_at: c.created_at }))
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
    shed += row.effective_size;
  }

  // Single DELETE for all selected IDs.
  const placeholders = toEvict.map(() => "?").join(",");
  db.prepare(`DELETE FROM stored_outputs WHERE id IN (${placeholders})`).run(
    ...(toEvict as unknown as SQLQueryBindings[])
  );

  reclaimPages(db, toEvict.length);

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

/** A bounded excerpt of a search match, and which sides of it were cut. */
export interface MatchWindow {
  text: string;
  cutStart: boolean;
  cutEnd: boolean;
}

/** The pair FTS5 highlight() wraps each matched token in. */
interface Marks { open: string; close: string }

// Private-use code points, rare in tool output but not absent: nerd-font icons
// share the range, so content holding these gets a pair from markerPairFor().
const DEFAULT_MARKS: Marks = { open: "", close: "" };

/** The first private-use pair absent from `raw`, or null if every one occurs. */
function markerPairFor(raw: string): Marks | null {
  const free: string[] = [];
  for (let cp = 0xe000; cp <= 0xf8ff && free.length < 2; cp++) {
    const ch = String.fromCharCode(cp);
    if (!raw.includes(ch)) free.push(ch);
  }
  return free.length === 2 ? { open: free[0], close: free[1] } : null;
}

/**
 * Cuts `marked` (text with highlight markers) to `width` characters around the
 * best run of matches, centered on it. Best covers the most distinct matched
 * terms, then spans the fewest characters: near-duplicate lines share every term
 * but the one that tells them apart, so a looser run drifts onto a sibling line.
 * Text without markers yields its first `width` characters.
 */
export function windowAroundMatches(marked: string, width: number, marks: Marks = DEFAULT_MARKS): MatchWindow {
  const { text, spans } = parseMarks(marked, marks);
  if (text.length <= width) return { text, cutStart: false, cutEnd: false };

  // Sliding window over the matches: for each right end, drop from the left while
  // the run is too wide or the leftmost term repeats later in the run.
  const counts = new Map<string, number>();
  let best = { terms: 0, start: 0, end: 0 };
  let left = 0;
  for (let right = 0; right < spans.length; right++) {
    counts.set(spans[right].term, (counts.get(spans[right].term) ?? 0) + 1);
    while (left <= right && (spans[right].end - spans[left].start > width || counts.get(spans[left].term)! > 1)) {
      const n = counts.get(spans[left].term)! - 1;
      if (n === 0) counts.delete(spans[left].term); else counts.set(spans[left].term, n);
      left++;
    }
    if (left > right) continue; // one match wider than the window
    const run = { terms: counts.size, start: spans[left].start, end: spans[right].end };
    if (run.terms > best.terms || (run.terms === best.terms && run.end - run.start < best.end - best.start)) best = run;
  }
  const slack = width - (best.end - best.start);
  const start = best.terms === 0 ? 0 : Math.max(0, Math.min(best.start - Math.floor(slack / 2), text.length - width));
  return { text: text.slice(start, start + width), cutStart: start > 0, cutEnd: start + width < text.length };
}

/** Strips highlight markers, returning the plain text and each match's span and lowercased term. */
function parseMarks(marked: string, marks: Marks): { text: string; spans: Array<{ start: number; end: number; term: string }> } {
  const spans: Array<{ start: number; end: number; term: string }> = [];
  const parts: string[] = [];
  let length = 0;
  for (const [i, piece] of marked.split(marks.open).entries()) {
    const close = i === 0 ? -1 : piece.indexOf(marks.close);
    if (close >= 0) {
      const term = piece.slice(0, close);
      spans.push({ start: length, end: length + term.length, term: term.toLowerCase() });
    }
    const plain = close >= 0 ? piece.slice(0, close) + piece.slice(close + 1) : piece;
    parts.push(plain);
    length += plain.length;
  }
  return { text: parts.join(""), spans };
}

/**
 * The search-result excerpt for one stored item: `width` characters of its best
 * matching chunk, placed on the match. Match positions come from FTS5 itself, so
 * they agree with the tokenizer that found the item. When no one chunk holds
 * every term (the match straddles a chunk boundary, or the item predates
 * chunking), the window is placed over the whole document instead.
 */
export function retrieveMatchWindow(
  db: Database,
  id: string,
  query: string,
  width: number
): MatchWindow | null {
  const safeQuery = sanitizeFtsQuery(query);
  const chunkSql = `
    SELECT content AS raw, highlight(content_chunks, 2, ?, ?) AS marked FROM content_chunks
    WHERE content_chunks MATCH ? AND output_id = ?
    ORDER BY rank
    LIMIT 1`;
  const docSql = `
    SELECT full_content AS raw, highlight(outputs_fts, 3, ?, ?) AS marked FROM outputs_fts
    WHERE outputs_fts MATCH ? AND rowid = (SELECT rowid FROM stored_outputs WHERE id = ?)`;
  const run = (sql: string, marks: Marks) =>
    db.prepare(sql).get(marks.open, marks.close, safeQuery, id) as { raw: string; marked: string } | null;

  // Content already holding a default marker is highlighted again with a pair it lacks.
  const place = (sql: string): MatchWindow | null => {
    const row = run(sql, DEFAULT_MARKS);
    if (!row) return null;
    if (!row.raw.includes(DEFAULT_MARKS.open) && !row.raw.includes(DEFAULT_MARKS.close)) {
      return windowAroundMatches(row.marked, width);
    }
    const marks = markerPairFor(row.raw);
    if (!marks) return { text: row.raw.slice(0, width), cutStart: false, cutEnd: row.raw.length > width };
    return windowAroundMatches(run(sql, marks)!.marked, width, marks);
  };
  try {
    return place(chunkSql) ?? place(docSql);
  } catch {
    return null; // FTS parse error
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
    // "Forget everything" covers the call counters too (#495); they hold no content.
    // Fold first, so counts still in the log are not left behind.
    foldCallLog(db);
    db.prepare(`DELETE FROM call_counts WHERE project_key = ?`).run(project_key);
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

  reclaimPages(db, deleted);

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
  const deleted = countAndDelete(db, "created_at < ? AND project_key = ? AND pinned = 0", [cutoff, project_key]);
  reclaimPages(db, deleted);
  return deleted;
}

/**
 * Returns the count of stored outputs grouped by every project key OTHER than
 * the current one, most rows first. Used to surface rows stranded under a
 * foreign key (e.g. by the removed `import --keep-project-key` flag, see #237)
 * so they can be enumerated and deleted through the tool layer.
 */
export function foreignKeyBreakdown(
  db: Database,
  current_key: string
): { project_key: string; count: number }[] {
  return db
    .prepare(
      `SELECT project_key, COUNT(*) AS count
       FROM stored_outputs
       WHERE project_key != ?
       GROUP BY project_key
       ORDER BY count DESC, project_key ASC`
    )
    .all(current_key) as { project_key: string; count: number }[];
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
