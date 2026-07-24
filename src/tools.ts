/**
 * Tool handler logic for all recall__* MCP tools.
 * Pure functions that take a DB + args and return a formatted text response.
 * Server.ts wires these to the MCP SDK.
 */

export const CONTEXT_EMPTY_RESPONSE =
  "[recall: no context available yet — use recall tools to build up your context store]";

import type { Database } from "bun:sqlite";
import {
  retrieveOutput,
  retrieveSnippet,
  retrievePeek,
  recordAccess,
  pinOutput,
  searchOutputs,
  listOutputs,
  forgetOutputs,
  getStats,
  getToolBreakdown,
  getSuggestions,
  getSessionDays,
  getSessionSummary,
  getContext,
  storeOutput,
  type StoredOutput,
  type ForgetOptions,
} from "./db/index";
import { loadConfig } from "./config";
import { formatBytes, formatRelativeTime } from "./format";

// ---------------------------------------------------------------------------
// Display constants
// ---------------------------------------------------------------------------

const PIN_BUDGET_WARN_PCT = 80;  // warn in recall__stats when pinned bytes reach this % of max_size_mb
const SEARCH_EXCERPT_LEN  = 120; // chars shown per result in recall__search
const NOTE_EXCERPT_LEN    = 200; // chars shown in recall__note store confirmation
const CONTEXT_EXCERPT_LEN = 100; // chars shown per item in recall__context
const SNIPPET_MAX         = 150; // max chars of FTS snippet shown in search results
const LIST_TOOL_COL_WIDTH = 40;  // tool name column in recall__list_stored
const LIST_ID_COL_WIDTH   = 16;  // id column in recall__list_stored header

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toISOString().slice(0, 10);
}

function reductionPct(original: number, summary: number): string {
  if (original === 0) return "0%";
  return `${((1 - summary / original) * 100).toFixed(0)}%`;
}

function itemHeader(item: StoredOutput): string {
  return `[recall:${item.id} · ${item.tool_name} · ${formatDate(item.created_at)} · ${formatBytes(item.original_size)}→${formatBytes(item.summary_size)}]`;
}

// ---------------------------------------------------------------------------
// recall__retrieve
// ---------------------------------------------------------------------------

export type RetrieveMode = "summary" | "peek" | "full";

export interface RetrieveArgs {
  id: string;
  query?: string;
  max_bytes?: number;
  mode?: RetrieveMode;
}

/**
 * Graduated retrieval across three tiers:
 * - `summary` — the compressed summary (cheapest; the default when no query).
 * - `peek`    — a bounded context window (top matching chunks with a query,
 *               head chunks without) — the middle tier, far smaller than full.
 * - `full`    — the verbatim content, capped at `max_bytes`.
 *
 * Backward-compatible: with no explicit `mode`, a query defaults to `peek` and
 * its absence to `summary`, matching the prior focused-excerpt / summary split.
 */
export function toolRetrieve(db: Database, args: RetrieveArgs): string {
  const config = loadConfig();
  const cap = args.max_bytes ?? config.retrieve.default_max_bytes;

  const item = retrieveOutput(db, args.id);
  if (!item) {
    return `[recall: no item found with id "${args.id}"]`;
  }

  recordAccess(db, args.id);
  const header = itemHeader(item);

  const mode: RetrieveMode = args.mode ?? (args.query ? "peek" : "summary");

  const fullCapped = (): string => {
    const content = item.full_content.slice(0, cap);
    const truncated =
      item.full_content.length > cap ? `\n…(truncated at ${formatBytes(cap)})` : "";
    return `${header}\n${content}${truncated}`;
  };

  if (mode === "summary") return `${header}\n${item.summary}`;
  if (mode === "full") return fullCapped();

  // mode === "peek": bounded context window, with graceful fallbacks.
  const peek = retrievePeek(db, args.id, args.query);
  if (peek) return `${header}\n${peek}`;
  // Pre-chunking items with a query: legacy single-snippet path.
  if (args.query) {
    const snippet = retrieveSnippet(db, args.id, args.query);
    if (snippet) return `${header}\n${snippet}`;
  }
  // Nothing to peek at (no chunks / no match): fall back to full content.
  return fullCapped();
}

// ---------------------------------------------------------------------------
// recall__search
// ---------------------------------------------------------------------------

export interface SearchArgs {
  query: string;
  tool?: string;
  limit?: number;
}

export function toolSearch(
  db: Database,
  projectKey: string,
  args: SearchArgs
): string {
  const limit = args.limit ?? 5;

  // Tool filter: substring match (case-insensitive) via post-filter since FTS handles content
  const results = searchOutputs(db, args.query, {
    project_key: projectKey,
    limit: limit * 3, // over-fetch to allow tool filtering
  });

  const filtered = args.tool
    ? results.filter((r) =>
        r.tool_name.toLowerCase().includes(args.tool!.toLowerCase())
      )
    : results;

  const items = filtered.slice(0, limit);

  if (items.length === 0) {
    return `[recall: no results for "${args.query}"]`;
  }

  const lines = items.map((item, i) => {
    const excerpt = item.summary.slice(0, SEARCH_EXCERPT_LEN).replace(/\n/g, " ");
    const ellipsis = item.summary.length > SEARCH_EXCERPT_LEN ? "…" : "";
    const summaryLine = `${i + 1}. ${item.id} · ${item.tool_name} · ${formatDate(item.created_at)}\n   ${excerpt}${ellipsis}`;

    const snippet = retrieveSnippet(db, item.id, args.query);
    if (!snippet) return summaryLine;

    const snipText = snippet.replace(/\n/g, " ").trim();
    const capped = snipText.slice(0, SNIPPET_MAX);
    const trailingEllipsis = snipText.length > SNIPPET_MAX ? "…" : "";
    return `${summaryLine}\n   > …${capped}${trailingEllipsis}`;
  });

  return `Found ${items.length} result${items.length === 1 ? "" : "s"} for "${args.query}":\n\n${lines.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// recall__pin
// ---------------------------------------------------------------------------

export interface PinArgs {
  id: string;
  pinned?: boolean; // defaults to true
}

export function toolPin(
  db: Database,
  projectKey: string,
  args: PinArgs
): string {
  const pinned = args.pinned ?? true;
  const success = pinOutput(db, args.id, projectKey, pinned);
  if (!success) {
    return `[recall: no item found with id "${args.id}"]`;
  }
  return `[recall: ${pinned ? "pinned" : "unpinned"} ${args.id}]`;
}

// ---------------------------------------------------------------------------
// recall__note
// ---------------------------------------------------------------------------

export interface NoteArgs {
  text: string;
  title?: string;
}

export function toolNote(
  db: Database,
  projectKey: string,
  args: NoteArgs
): string {
  const title = args.title ?? "(note)";
  const excerpt = args.text.slice(0, NOTE_EXCERPT_LEN);
  const ellipsis = args.text.length > NOTE_EXCERPT_LEN ? "…" : "";
  const summary = `${title}: ${excerpt}${ellipsis}`;
  const originalSize = Buffer.byteLength(args.text, "utf8");
  const sessionId = new Date().toISOString().slice(0, 10);

  const stored = storeOutput(db, {
    project_key: projectKey,
    session_id: sessionId,
    tool_name: "recall__note",
    summary,
    full_content: args.text,
    original_size: originalSize,
  });

  return `[recall: note stored as ${stored.id}]`;
}

// ---------------------------------------------------------------------------
// recall__export
// ---------------------------------------------------------------------------

export function toolExport(db: Database, projectKey: string): string {
  const items = db
    .prepare(
      `SELECT * FROM stored_outputs WHERE project_key = ? ORDER BY created_at ASC`
    )
    .all(projectKey) as StoredOutput[];

  if (items.length === 0) {
    return `[recall: no items to export]`;
  }

  return JSON.stringify(items, null, 2);
}

// ---------------------------------------------------------------------------
// recall__forget
// ---------------------------------------------------------------------------

export interface ForgetArgs {
  id?: string;
  tool?: string;
  session_id?: string;
  older_than_days?: number;
  all?: boolean;
  confirmed?: boolean;
  force?: boolean;
}

export function toolForget(
  db: Database,
  projectKey: string,
  args: ForgetArgs
): string {
  if (args.all && !args.confirmed) {
    return `[recall: clearing all stored items requires confirmed: true]`;
  }

  if (args.older_than_days !== undefined && args.older_than_days < 1) {
    return `[recall: older_than_days must be at least 1 — use all: true with confirmed: true to delete everything]`;
  }

  const options: ForgetOptions = {
    id: args.id,
    tool: args.tool,
    session_id: args.session_id,
    older_than_days: args.older_than_days,
    all: args.all,
    force: args.force,
  };

  const deleted = forgetOutputs(db, projectKey, options);

  if (deleted === 0) {
    return `[recall: no items matched — nothing deleted]`;
  }

  return `[recall: deleted ${deleted} item${deleted === 1 ? "" : "s"}]`;
}

// ---------------------------------------------------------------------------
// recall__list_stored
// ---------------------------------------------------------------------------

export interface ListStoredArgs {
  limit?: number;
  offset?: number;
  tool?: string;
  sort?: "recent" | "accessed" | "size";
}

export function toolListStored(
  db: Database,
  projectKey: string,
  args: ListStoredArgs
): string {
  const limit = args.limit ?? 10;
  const offset = args.offset ?? 0;

  const order =
    args.sort === "size"
      ? "original_size DESC"
      : args.sort === "accessed"
      ? "access_count DESC, last_accessed DESC NULLS LAST, created_at DESC"
      : "created_at DESC";

  const sql = `
    SELECT * FROM stored_outputs
    WHERE project_key = ?
    ${args.tool ? "AND tool_name LIKE ?" : ""}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `;
  const params: Array<string | number> = [projectKey];
  if (args.tool) params.push(`%${args.tool}%`);
  params.push(limit, offset);
  const items = db.prepare(sql).all(...params) as ReturnType<typeof listOutputs>;

  if (!items || items.length === 0) {
    return offset > 0
      ? `[recall: no more items]`
      : `[recall: no stored items]`;
  }

  const rows = items.map((item) => {
    const reduction = reductionPct(item.original_size, item.summary_size);
    const pin = item.pinned ? " 📌" : "";
    return `${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  ${formatDate(item.created_at)}  ${formatBytes(item.original_size).padStart(7)}→${formatBytes(item.summary_size).padEnd(8)}  ${reduction}${pin}`;
  });

  const header = `${"ID".padEnd(LIST_ID_COL_WIDTH)}  ${"Tool".padEnd(LIST_TOOL_COL_WIDTH)}  ${"Date".padEnd(10)}  ${"Size".padStart(7)} ${"→".padEnd(9)}  Red.`;
  const separator = "-".repeat(header.length);

  return [header, separator, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// recall__context
// ---------------------------------------------------------------------------

export interface ContextArgs {
  days?: number;
  limit?: number;
}

export function toolContext(
  db: Database,
  projectKey: string,
  args: ContextArgs
): string {
  const data = getContext(db, projectKey, args);
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  const isEmpty =
    data.pinned.length === 0 &&
    data.notes.length === 0 &&
    data.recent.length === 0 &&
    data.hot.length === 0 &&
    data.last_session === null;

  if (isEmpty) {
    return CONTEXT_EMPTY_RESPONSE;
  }

  const lines: string[] = [
    `Context — ${today}`,
    "═".repeat(36),
    `Generated ${formatRelativeTime(Date.now() - now)}`,
  ];

  if (data.pinned.length > 0) {
    lines.push("", `Pinned (${data.pinned.length}):`);
    for (const item of data.pinned) {
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "…" : "";
      lines.push(`  📌 ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  ${formatDate(item.created_at)}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }

  if (data.notes.length > 0) {
    lines.push("", `Notes (${data.notes.length}):`);
    for (const note of data.notes) {
      const excerpt = note.summary.slice(0, 100).replace(/\n/g, " ");
      const ellipsis = note.summary.length > 100 ? "…" : "";
      lines.push(`  ${note.id}  ${formatDate(note.created_at)}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }

  if (data.recent.length > 0) {
    const days = args.days ?? 7;
    lines.push("", `Recently accessed (last ${days} day${days === 1 ? "" : "s"}, ${data.recent.length} item${data.recent.length === 1 ? "" : "s"}):`);
    for (const item of data.recent) {
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "…" : "";
      lines.push(`  ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  ${formatDate(item.created_at)}  ×${item.access_count}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }

  if (data.hot.length > 0) {
    const date = data.last_session?.date ?? "";
    lines.push("", `Hot from last session (${date}, ${data.hot.length} item${data.hot.length === 1 ? "" : "s"}):`);
    for (const item of data.hot) {
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "…" : "";
      lines.push(`  ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  ${formatDate(item.created_at)}  ×${item.access_count}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }

  if (data.last_session) {
    const s = data.last_session;
    const reductionStr = reductionPct(s.total_original_bytes, s.total_summary_bytes);
    lines.push("", `Last session (${s.date}):`);
    lines.push(`  ${s.stored_count} item${s.stored_count === 1 ? "" : "s"} stored · ${formatBytes(s.total_original_bytes)} → ${formatBytes(s.total_summary_bytes)} (${reductionStr} reduction)`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// recall__session_summary
// ---------------------------------------------------------------------------

export interface SessionSummaryArgs {
  session_id?: string;
  date?: string;
}

export function toolSessionSummary(
  db: Database,
  projectKey: string,
  args: SessionSummaryArgs
): string {
  const data = getSessionSummary(db, projectKey, args);

  if (data.stored_count === 0) {
    return `[recall: no items stored for ${data.label}]`;
  }

  const reductionStr = reductionPct(data.total_original_bytes, data.total_summary_bytes);

  const lines: string[] = [
    `Session Summary — ${data.label}`,
    "─".repeat(36),
    `Stored: ${data.stored_count} item${data.stored_count === 1 ? "" : "s"} · ${formatBytes(data.total_original_bytes)} → ${formatBytes(data.total_summary_bytes)} (${reductionStr} reduction)`,
    `Retrieved: ${data.accessed_count} item${data.accessed_count === 1 ? "" : "s"} · ${data.total_accesses} total access${data.total_accesses === 1 ? "" : "es"}`,
    "",
    "Tools stored:",
  ];

  const TOP_TOOLS = 5;
  for (const t of data.tool_counts.slice(0, TOP_TOOLS)) {
    lines.push(`  ${t.tool_name.padEnd(44)}×${t.count}`);
  }
  if (data.tool_counts.length > TOP_TOOLS) {
    lines.push(`  + ${data.tool_counts.length - TOP_TOOLS} more`);
  }

  if (data.top_accessed.length > 0) {
    lines.push("", "Most accessed:");
    for (const item of data.top_accessed) {
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "…" : "";
      lines.push(`  ${item.id} (×${item.access_count}) ${item.tool_name}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }

  if (data.pinned.length > 0) {
    lines.push("", `Pinned: ${data.pinned.length}`);
    for (const item of data.pinned) {
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "…" : "";
      lines.push(`  📌 ${item.id}  ${item.tool_name}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }

  if (data.notes.length > 0) {
    lines.push("", `Notes: ${data.notes.length}`);
    for (const note of data.notes) {
      const excerpt = note.summary.slice(0, 100).replace(/\n/g, " ");
      const ellipsis = note.summary.length > 100 ? "…" : "";
      lines.push(`  ${note.id} — ${excerpt}${ellipsis}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// recall__stats
// ---------------------------------------------------------------------------

export interface StatsArgs {
  /** Access-count threshold for pin candidates (default: config or 5). */
  pin_threshold?: number;
  /** Days without any access before an item is flagged as stale (default: config or 3). */
  stale_days?: number;
}

export function toolStats(
  db: Database,
  projectKey: string,
  args: StatsArgs = {}
): string {
  const stats = getStats(db, projectKey);
  const sessionDays = getSessionDays(db);

  if (stats.total_items === 0) {
    return `[recall: no data stored for this project yet]`;
  }

  const saved = stats.total_original_bytes - stats.total_summary_bytes;
  const reductionPctVal = ((1 - stats.compression_ratio) * 100).toFixed(1);

  // Rough token savings: ~4 bytes per token
  const tokensSaved = Math.floor(saved / 4);

  const lines = [
    `Session stats for current project:`,
    `  Items stored:      ${stats.total_items}`,
    `  Original size:     ${formatBytes(stats.total_original_bytes)}`,
    `  Compressed size:   ${formatBytes(stats.total_summary_bytes)}`,
    `  Saved:             ${formatBytes(saved)} (${reductionPctVal}% reduction)`,
    `  ~Tokens saved:     ~${tokensSaved.toLocaleString()}`,
    `  Session days:      ${sessionDays.length}`,
  ];

  // Pin-budget awareness: pinned items are exempt from eviction, so a store that
  // is mostly pinned can silently defeat the max_size_mb cap. Surface it.
  if (stats.pinned_items > 0) {
    const maxSizeMb = loadConfig().store.max_size_mb;
    const maxBytes = maxSizeMb * 1024 * 1024;
    const capPct = maxBytes > 0 ? (stats.pinned_bytes / maxBytes) * 100 : 0;
    lines.push(
      `  Pinned:            ${stats.pinned_items} item${stats.pinned_items === 1 ? "" : "s"}` +
        ` (${formatBytes(stats.pinned_bytes)}, ${capPct.toFixed(0)}% of cap)`
    );
    if (capPct >= PIN_BUDGET_WARN_PCT) {
      lines.push(
        `  ⚠ Pinned data is ${capPct.toFixed(0)}% of the ${maxSizeMb} MB cap and is exempt` +
          ` from eviction — unpin or raise store.max_size_mb to reclaim space.`
      );
    }
  }

  // Per-tool breakdown
  const breakdown = getToolBreakdown(db, projectKey);
  if (breakdown.length > 0) {
    lines.push("", "By tool (sorted by original size):");
    const colW = Math.min(40, Math.max(...breakdown.map((r) => r.tool_name.length)));
    for (const row of breakdown) {
      const reduction =
        row.original_bytes > 0
          ? `${((1 - row.summary_bytes / row.original_bytes) * 100).toFixed(0)}%`
          : " —";
      lines.push(
        `  ${row.tool_name.padEnd(colW)}  ${String(row.items).padStart(4)} item${row.items === 1 ? " " : "s"}` +
          `  ${formatBytes(row.original_bytes).padStart(8)} → ${formatBytes(row.summary_bytes).padEnd(8)}  ${reduction.padStart(4)}`
      );
    }
  }

  const suggestions = getSuggestions(db, projectKey, {
    pin_threshold: args.pin_threshold,
    stale_days: args.stale_days,
  });

  const hasSuggestions =
    suggestions.pin_candidates.length > 0 || suggestions.stale_candidates.length > 0;

  if (hasSuggestions) {
    lines.push("", "Suggestions:");

    if (suggestions.pin_candidates.length > 0) {
      lines.push("  📌 Consider pinning:");
      for (const item of suggestions.pin_candidates) {
        lines.push(`     ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  accessed ${item.access_count}×`);
      }
    }

    if (suggestions.stale_candidates.length > 0) {
      if (suggestions.pin_candidates.length > 0) lines.push("");
      lines.push("  🗑  Never accessed (consider forgetting):");
      const now = Math.floor(Date.now() / 1000);
      for (const item of suggestions.stale_candidates) {
        const ageDays = Math.floor((now - item.created_at) / 86400);
        lines.push(`     ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  created ${ageDays} day${ageDays === 1 ? "" : "s"} ago`);
      }
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// recall__suggest
// ---------------------------------------------------------------------------

export interface SuggestArgs {
  pin_threshold?: number;
  stale_days?: number;
  limit?: number;
}

export function toolSuggest(
  db: Database,
  projectKey: string,
  args: SuggestArgs = {}
): string {
  const config = loadConfig();
  const suggestions = getSuggestions(db, projectKey, {
    pin_threshold: args.pin_threshold ?? config.store.pin_recommendation_threshold,
    stale_days: args.stale_days ?? config.store.stale_item_days,
    limit: args.limit,
  });

  const hasPin = suggestions.pin_candidates.length > 0;
  const hasStale = suggestions.stale_candidates.length > 0;

  if (!hasPin && !hasStale) {
    return "[recall: no suggestions — no frequently accessed unpinned items and no stale items]";
  }

  const lines: string[] = ["Recall suggestions:"];

  if (hasPin) {
    lines.push("", "Pin candidates (frequently accessed, not yet pinned):");
    for (const item of suggestions.pin_candidates) {
      const excerpt = item.summary.slice(0, 80).replace(/\n/g, " ");
      const ellipsis = item.summary.length > 80 ? "…" : "";
      lines.push(`  ${item.id}  (accessed ${item.access_count}×)  ${item.tool_name}`);
      lines.push(`    ${excerpt}${ellipsis}`);
      lines.push(`    → recall__pin id="${item.id}"`);
    }
  }

  if (hasStale) {
    lines.push("", "Stale items (never accessed, consider forgetting):");
    const now = Math.floor(Date.now() / 1000);
    for (const item of suggestions.stale_candidates) {
      const ageDays = Math.floor((now - item.created_at) / 86400);
      const excerpt = item.summary.slice(0, 80).replace(/\n/g, " ");
      const ellipsis = item.summary.length > 80 ? "…" : "";
      lines.push(`  ${item.id}  (${ageDays} day${ageDays === 1 ? "" : "s"} old)  ${item.tool_name}`);
      lines.push(`    ${excerpt}${ellipsis}`);
      lines.push(`    → recall__forget id="${item.id}"`);
    }
  }

  return lines.join("\n");
}
