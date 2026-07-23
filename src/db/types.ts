/** A fully-hydrated row from the `stored_outputs` table. */
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
  output_hash: string | null;
}

/** Input required to persist a new compressed tool output. */
export interface StoreInput {
  project_key: string;
  session_id: string;
  tool_name: string;
  summary: string;
  full_content: string;
  original_size: number;
  input_hash?: string;
  /** Precomputed sha256 of full_content; storeOutput derives it when omitted. */
  output_hash?: string;
}

/** Options for full-text search across stored outputs. */
export interface SearchOptions {
  project_key: string;
  tool?: string;
  limit?: number;
}

/** Options for paginated listing of stored outputs. */
export interface ListOptions {
  project_key: string;
  tool?: string;
  limit?: number;
  offset?: number;
  sort?: "newest" | "oldest";
}

/** Criteria for bulk-deleting stored outputs. Exactly one selector should be set. */
export interface ForgetOptions {
  id?: string;
  tool?: string;
  session_id?: string;
  older_than_days?: number;
  all?: boolean;
  force?: boolean; // override pinned protection
}

/** Aggregate storage statistics for a project. */
export interface Stats {
  total_items: number;
  total_original_bytes: number;
  total_summary_bytes: number;
  compression_ratio: number;
}

/** Options for the session-orientation context snapshot. */
export interface ContextOptions {
  days?: number;   // lookback window for recently accessed (default 7)
  limit?: number;  // max items in recently accessed section (default 5)
}

/** Data returned by {@link getContext}: five isolated sections with no overlap. */
export interface ContextData {
  pinned: StoredOutput[];
  notes: StoredOutput[];
  recent: StoredOutput[];
  hot: StoredOutput[];
  last_session: {
    date: string;
    stored_count: number;
    total_original_bytes: number;
    total_summary_bytes: number;
  } | null;
}

/** Filter options for {@link getSessionSummary}. Provide either session_id or date, not both. */
export interface SessionSummaryOptions {
  session_id?: string;
  date?: string; // YYYY-MM-DD, defaults to today (UTC)
}

/** Digest returned by {@link getSessionSummary}. */
export interface SessionSummaryData {
  label: string;
  stored_count: number;
  total_original_bytes: number;
  total_summary_bytes: number;
  tool_counts: Array<{ tool_name: string; count: number }>;
  accessed_count: number;
  total_accesses: number;
  top_accessed: Array<{ id: string; tool_name: string; summary: string; access_count: number }>;
  pinned: Array<{ id: string; tool_name: string; summary: string }>;
  notes: Array<{ id: string; summary: string }>;
}

/** Per-tool row returned by {@link getToolBreakdown}. */
export interface ToolBreakdownRow {
  tool_name: string;
  items: number;
  original_bytes: number;
  summary_bytes: number;
}

/** Options for {@link getSuggestions}. */
export interface SuggestionsOptions {
  /** Access-count threshold above which a non-pinned item is a pin candidate (default 5). */
  pin_threshold?: number;
  /** Items with zero accesses older than this many days are stale candidates (default 3). */
  stale_days?: number;
  /** Maximum items to return per category (default 3). */
  limit?: number;
}

/** Output of {@link getSuggestions}: two categorised item lists. */
export interface SuggestionsData {
  /** Non-pinned items accessed at or above the pin threshold. */
  pin_candidates: StoredOutput[];
  /** Non-pinned items that have never been accessed and are older than `stale_days`. */
  stale_candidates: StoredOutput[];
}
