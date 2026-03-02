/**
 * Tool handler logic for all recall__* MCP tools.
 * Pure functions that take a DB + args and return a formatted text response.
 * Server.ts wires these to the MCP SDK.
 */

import type { Database } from "bun:sqlite";
import {
  retrieveOutput,
  searchOutputs,
  listOutputs,
  forgetOutputs,
  getStats,
  getSessionDays,
  type ForgetOptions,
} from "./db/index";
import { loadConfig } from "./config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toISOString().slice(0, 10);
}

function reductionPct(original: number, summary: number): string {
  if (original === 0) return "0%";
  return `${((1 - summary / original) * 100).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// recall__retrieve
// ---------------------------------------------------------------------------

export interface RetrieveArgs {
  id: string;
  query?: string;
  max_bytes?: number;
}

export function toolRetrieve(
  db: Database,
  args: RetrieveArgs
): string {
  const config = loadConfig();
  const cap = args.max_bytes ?? config.retrieve.default_max_bytes;

  const item = retrieveOutput(db, args.id);
  if (!item) {
    return `[recall: no item found with id "${args.id}"]`;
  }

  const header = `[recall:${item.id} · ${item.tool_name} · ${formatDate(item.created_at)} · ${formatBytes(item.original_size)}→${formatBytes(item.summary_size)}]`;

  // With a query, return full content (capped) so Claude can find more detail
  if (args.query) {
    const content = item.full_content.slice(0, cap);
    const truncated = item.full_content.length > cap ? `\n…(truncated at ${formatBytes(cap)})` : "";
    return `${header}\n${content}${truncated}`;
  }

  // Without a query, return the summary
  return `${header}\n${item.summary}`;
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
    const excerpt = item.summary.slice(0, 120).replace(/\n/g, " ");
    const ellipsis = item.summary.length > 120 ? "…" : "";
    return `${i + 1}. ${item.id} · ${item.tool_name} · ${formatDate(item.created_at)}\n   ${excerpt}${ellipsis}`;
  });

  return `Found ${items.length} result${items.length === 1 ? "" : "s"} for "${args.query}":\n\n${lines.join("\n\n")}`;
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
}

export function toolForget(
  db: Database,
  projectKey: string,
  args: ForgetArgs
): string {
  if (args.all && !args.confirmed) {
    return `[recall: clearing all stored items requires confirmed: true]`;
  }

  const options: ForgetOptions = {
    id: args.id,
    tool: args.tool,
    session_id: args.session_id,
    older_than_days: args.older_than_days,
    all: args.all,
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
    args.sort === "size" ? "original_size DESC" : "created_at DESC";
  const sql = `
    SELECT * FROM stored_outputs
    WHERE project_key = ?
    ${args.tool ? "AND tool_name LIKE ?" : ""}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `;
  const params: unknown[] = [projectKey];
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
    return `${item.id}  ${item.tool_name.padEnd(40)}  ${formatDate(item.created_at)}  ${formatBytes(item.original_size).padStart(7)}→${formatBytes(item.summary_size).padEnd(8)}  ${reduction}`;
  });

  const header = `${"ID".padEnd(16)}  ${"Tool".padEnd(40)}  ${"Date".padEnd(10)}  ${"Size".padStart(7)} ${"→".padEnd(9)}  Red.`;
  const separator = "-".repeat(header.length);

  return [header, separator, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// recall__stats
// ---------------------------------------------------------------------------

export function toolStats(db: Database, projectKey: string): string {
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

  return lines.join("\n");
}
