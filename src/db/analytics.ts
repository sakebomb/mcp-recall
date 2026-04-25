import { Database, type SQLQueryBindings } from "bun:sqlite";
import type {
  StoredOutput,
  Stats,
  ToolBreakdownRow,
  SuggestionsOptions,
  SuggestionsData,
  ContextOptions,
  ContextData,
  SessionSummaryOptions,
  SessionSummaryData,
} from "./types";
import { getSessionDays } from "./queries";

/** Returns aggregate storage stats (counts, sizes, compression ratio) for a project. */
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

/** Returns per-tool storage stats, sorted by original_bytes desc. */
export function getToolBreakdown(db: Database, project_key: string): ToolBreakdownRow[] {
  return db.prepare(`
    SELECT
      tool_name,
      COUNT(*)                       AS items,
      COALESCE(SUM(original_size),0) AS original_bytes,
      COALESCE(SUM(summary_size),0)  AS summary_bytes
    FROM stored_outputs
    WHERE project_key = ?
    GROUP BY tool_name
    ORDER BY original_bytes DESC
  `).all(project_key) as ToolBreakdownRow[];
}

/**
 * Returns the most recent `limit` stored outputs for an exact tool_name match.
 * Used by `mcp-recall profiles retrain` to sample real output corpus.
 */
export function sampleOutputs(
  db: Database,
  project_key: string,
  tool_name: string,
  limit: number
): StoredOutput[] {
  return db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND tool_name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(project_key, tool_name, limit) as StoredOutput[];
}

/**
 * Returns pin candidates (frequently accessed, not yet pinned) and stale
 * candidates (never accessed, older than `stale_days`) for the project.
 * Both lists are capped at `limit` items to avoid overwhelming output.
 */
export function getSuggestions(
  db: Database,
  project_key: string,
  opts: SuggestionsOptions = {}
): SuggestionsData {
  const threshold = opts.pin_threshold ?? 5;
  const staleDays = opts.stale_days ?? 3;
  const limit = opts.limit ?? 3;
  const staleCutoff = Math.floor(Date.now() / 1000) - staleDays * 86400;

  const pin_candidates = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 0 AND access_count >= ?
    ORDER BY access_count DESC
    LIMIT ?
  `).all(project_key, threshold, limit) as StoredOutput[];

  const stale_candidates = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 0 AND access_count = 0 AND created_at < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(project_key, staleCutoff, limit) as StoredOutput[];

  return { pin_candidates, stale_candidates };
}

/**
 * Returns a digest of stored activity for a session or calendar day.
 * Filters by `opts.session_id` (exact) or `opts.date` (YYYY-MM-DD UTC, defaults to today).
 */
export function getSessionSummary(
  db: Database,
  project_key: string,
  opts: SessionSummaryOptions = {}
): SessionSummaryData {
  let filter: string;
  let filterParams: SQLQueryBindings[];
  let label: string;

  if (opts.session_id) {
    filter = "session_id = ?";
    filterParams = [opts.session_id];
    label = opts.session_id;
  } else {
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const startOfDay = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    const endOfDay = startOfDay + 86400;
    filter = "created_at >= ? AND created_at < ?";
    filterParams = [startOfDay, endOfDay];
    label = date;
  }

  const base = `WHERE project_key = ? AND ${filter}`;
  const bp: SQLQueryBindings[] = [project_key, ...filterParams];

  const agg = db.prepare(`
    SELECT
      COUNT(*) as stored_count,
      COALESCE(SUM(original_size), 0) as total_original_bytes,
      COALESCE(SUM(summary_size), 0) as total_summary_bytes,
      COUNT(CASE WHEN access_count > 0 THEN 1 END) as accessed_count,
      COALESCE(SUM(access_count), 0) as total_accesses
    FROM stored_outputs ${base}
  `).get(...bp) as {
    stored_count: number;
    total_original_bytes: number;
    total_summary_bytes: number;
    accessed_count: number;
    total_accesses: number;
  };

  const tool_counts = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM stored_outputs ${base}
    GROUP BY tool_name
    ORDER BY count DESC
  `).all(...bp) as Array<{ tool_name: string; count: number }>;

  const top_accessed = db.prepare(`
    SELECT id, tool_name, summary, access_count
    FROM stored_outputs ${base} AND access_count > 0
    ORDER BY access_count DESC
    LIMIT 5
  `).all(...bp) as Array<{ id: string; tool_name: string; summary: string; access_count: number }>;

  const pinned = db.prepare(`
    SELECT id, tool_name, summary
    FROM stored_outputs ${base} AND pinned = 1
    ORDER BY created_at DESC
  `).all(...bp) as Array<{ id: string; tool_name: string; summary: string }>;

  const notes = db.prepare(`
    SELECT id, summary
    FROM stored_outputs ${base} AND tool_name = 'recall__note'
    ORDER BY created_at DESC
  `).all(...bp) as Array<{ id: string; summary: string }>;

  return { label, ...agg, tool_counts, top_accessed, pinned, notes };
}

/**
 * Returns a session-orientation snapshot in five isolated sections:
 * pinned items, unpinned notes, recently accessed items (within `opts.days`),
 * hot items from the last session, and a last-session headline.
 * Each item appears in exactly one section.
 */
export function getContext(
  db: Database,
  project_key: string,
  opts: ContextOptions = {}
): ContextData {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 5;
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const today = new Date().toISOString().slice(0, 10);

  // 1. All pinned items, most recently accessed first
  const pinned = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 1
    ORDER BY last_accessed DESC NULLS LAST, created_at DESC
  `).all(project_key) as StoredOutput[];

  // 2. Unpinned notes, newest first (capped to avoid noise)
  const notes = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 0 AND tool_name = 'recall__note'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(project_key) as StoredOutput[];

  // 3. Unpinned non-notes recently accessed, most recent first
  const recent = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 0 AND tool_name != 'recall__note'
      AND last_accessed >= ?
    ORDER BY last_accessed DESC
    LIMIT ?
  `).all(project_key, cutoff, limit) as StoredOutput[];

  // 4. Last session headline (most recent past date in sessions table)
  const sessionDays = getSessionDays(db);
  const pastDays = sessionDays.filter((d) => d < today);
  let last_session = null;
  let lastDate: string | null = null;
  if (pastDays.length > 0) {
    lastDate = pastDays[0]!;
    const summary = getSessionSummary(db, project_key, { date: lastDate });
    if (summary.stored_count > 0) {
      last_session = {
        date: lastDate,
        stored_count: summary.stored_count,
        total_original_bytes: summary.total_original_bytes,
        total_summary_bytes: summary.total_summary_bytes,
      };
    }
  }

  // 5. Hot items from the last session — top accessed, not already surfaced above.
  //    Only items with access_count > 0 are included; falls naturally out of the recent
  //    window when lastDate is older than `days` days.
  const hot: StoredOutput[] = [];
  if (lastDate) {
    const startOfDay = Math.floor(new Date(`${lastDate}T00:00:00Z`).getTime() / 1000);
    const endOfDay = startOfDay + 86400;
    // Filter duplicates in JS to avoid unbounded NOT IN bind-param expansion.
    // Pinned and note items are already excluded by SQL predicates; only
    // recent items can overlap, but we build the full set for safety.
    const excludeSet = new Set([...pinned, ...notes, ...recent].map((i) => i.id));
    const rows = db.prepare(`
      SELECT * FROM stored_outputs
      WHERE project_key = ?
        AND pinned = 0
        AND tool_name != 'recall__note'
        AND created_at >= ? AND created_at < ?
        AND access_count > 0
      ORDER BY access_count DESC
      LIMIT ?
    `).all(project_key, startOfDay, endOfDay, 5 + excludeSet.size) as StoredOutput[];
    hot.push(...rows.filter((r) => !excludeSet.has(r.id)).slice(0, 5));
  }

  return { pinned, notes, recent, hot, last_session };
}
