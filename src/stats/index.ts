/**
 * mcp-recall stats — what mcp-recall has summarized, from the command line
 * (#495): the same totals as `recall__stats`, without asking Claude, for this
 * project or every store with --all.
 *
 * Read-only: every store is opened readonly, so the report never migrates or
 * writes one. A store too old to have `delivered_size` (opened by no session
 * since that migration) is counted as unreadable, never silently dropped.
 *
 * Two sources, reported apart: the stored rows (what is in the store now, so
 * eviction and expiry shrink it) and the call counters (every intercepted call
 * since counting began, passed through or not; #495 part 2).
 */

import { Database } from "bun:sqlite";
import {
  getStats, getToolBreakdown, hasCallCounts, getCallBreakdown, pendingCallKeys, CALL_OUTCOMES,
  type ToolBreakdownRow, type CallBreakdownRow, type CallOutcome,
} from "../db/index";
import { storeFiles } from "../discover/index";
import { getProjectKey } from "../project-key";
import { formatBytes } from "../format";

/** recall__note rows are project memory, not intercepted output (as in recall__stats). */
const NOTE_TOOL = "recall__note";

/** Rough bytes per token, the same figure recall__stats uses. */
const BYTES_PER_TOKEN = 4;

const QUICK_START_URL = "https://github.com/sakebomb/mcp-recall#quick-start";

/** Tool rows listed before the rest are folded into one line. */
export const MAX_TOOL_ROWS = 15;

export interface StatsReport {
  items: number;
  original_bytes: number;
  delivered_bytes: number;
  /** Per tool, largest original first. */
  tools: ToolBreakdownRow[];
  /** Counted calls per tool and Bash command family, most calls first. */
  calls: CallBreakdownRow[];
  /** First day counted, or null when no call is. */
  callsSince: string | null;
  /** Stores read that have no call counters yet (no session since #495). */
  uncounted: number;
  /** Stores read. */
  stores: number;
  /** Stores that exist but could not be read. */
  unreadable: number;
}

export interface StatsOptions {
  all?: boolean;
}

const EMPTY: StatsReport = {
  items: 0, original_bytes: 0, delivered_bytes: 0, tools: [],
  calls: [], callsSince: null, uncounted: 0, stores: 0, unreadable: 0,
};

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  summarized: "summarized",
  cached: "reused",
  too_small: "too small",
  content_read: "short reads",
};

/** What each outcome means, printed beside its total. */
const OUTCOME_NOTE: Record<CallOutcome, string> = {
  summarized: "a new summary replaced the output",
  cached: "an earlier summary of the same output was reused",
  too_small: "passed through: a summary would not have saved a quarter",
  content_read: "passed through whole: a short file read",
};

function totalCalls(row: CallBreakdownRow): number {
  return CALL_OUTCOMES.reduce((n, o) => n + row.calls[o], 0);
}

/**
 * The report for one store file: for `projectKey` alone when given, as
 * recall__stats counts, or across every project key the file holds. One file
 * can hold several keys when RECALL_DB_PATH points every project at it.
 */
export function readStatsStore(file: string, projectKey?: string): StatsReport {
  let db: Database | null = null;
  try {
    db = new Database(file, { readonly: true });
    const isRecallDb = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='stored_outputs'`)
      .get();
    if (!isRecallDb) return EMPTY;

    const counted = hasCallCounts(db);
    // A project whose every call passed through has counters and no stored rows.
    const keySql = counted
      ? `SELECT project_key FROM stored_outputs UNION SELECT project_key FROM call_counts`
      : `SELECT DISTINCT project_key FROM stored_outputs`;
    const keys = projectKey !== undefined
      ? [projectKey]
      : [...new Set([
          ...(db.prepare(keySql).all() as Array<{ project_key: string }>).map((r) => r.project_key),
          ...(counted ? pendingCallKeys(db) : []),
        ])];
    const reports = keys.map((key): StatsReport => {
      const s = getStats(db!, key);
      const c = counted ? getCallBreakdown(db!, key) : { rows: [], since: null };
      return {
        items: s.total_items,
        original_bytes: s.total_original_bytes,
        delivered_bytes: s.total_summary_bytes,
        tools: getToolBreakdown(db!, key).filter((r) => r.tool_name !== NOTE_TOOL),
        calls: c.rows,
        callsSince: c.since,
        uncounted: 0,
        stores: 0,
        unreadable: 0,
      };
    });
    return { ...mergeStats(reports), uncounted: counted ? 0 : 1, stores: 1 };
  } catch {
    return { ...EMPTY, unreadable: 1 };
  } finally {
    db?.close();
  }
}

/** Sums reports from several stores or project keys into one. */
export function mergeStats(reports: StatsReport[]): StatsReport {
  const tools = new Map<string, ToolBreakdownRow>();
  for (const row of reports.flatMap((r) => r.tools)) {
    const prev = tools.get(row.tool_name);
    tools.set(row.tool_name, prev
      ? {
          tool_name: row.tool_name,
          items: prev.items + row.items,
          original_bytes: prev.original_bytes + row.original_bytes,
          summary_bytes: prev.summary_bytes + row.summary_bytes,
        }
      : row);
  }
  const calls = new Map<string, CallBreakdownRow>();
  for (const row of reports.flatMap((r) => r.calls)) {
    const key = `${row.tool_name}\0${row.command_fp}`;
    const prev = calls.get(key);
    calls.set(key, prev
      ? {
          ...row,
          calls: Object.fromEntries(CALL_OUTCOMES.map((o) => [o, prev.calls[o] + row.calls[o]])) as Record<CallOutcome, number>,
          original_bytes: prev.original_bytes + row.original_bytes,
          delivered_bytes: prev.delivered_bytes + row.delivered_bytes,
        }
      : row);
  }
  const days = reports.map((r) => r.callsSince).filter((d): d is string => d !== null).sort();
  const sum = (f: (r: StatsReport) => number) => reports.reduce((n, r) => n + f(r), 0);
  return {
    items: sum((r) => r.items),
    original_bytes: sum((r) => r.original_bytes),
    delivered_bytes: sum((r) => r.delivered_bytes),
    tools: [...tools.values()].sort((a, b) => b.original_bytes - a.original_bytes),
    calls: [...calls.values()].sort((a, b) => totalCalls(b) - totalCalls(a)),
    callsSince: days[0] ?? null,
    uncounted: sum((r) => r.uncounted),
    stores: sum((r) => r.stores),
    unreadable: sum((r) => r.unreadable),
  };
}

function reduction(original: number, delivered: number): string {
  return original > 0 ? `${(((original - delivered) / original) * 100).toFixed(0)}%` : "—";
}

/** A text table: the first column left-aligned, the figures after it right-aligned. */
function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells: string[]) =>
    "  " + cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  return [fmt(header), ...rows.map(fmt)];
}

function tokens(bytes: number): string {
  return `~${Math.floor(bytes / BYTES_PER_TOKEN).toLocaleString()} tokens at ~${BYTES_PER_TOKEN} bytes each`;
}

function folded(hidden: number, one: string, many: string): string[] {
  return hidden > 0 ? [`  … ${hidden} more ${hidden === 1 ? one : many}`] : [];
}

/** Every counted call, by outcome and by tool (#495 part 2). */
function callsSection(report: StatsReport): string[] {
  const byOutcome = Object.fromEntries(
    CALL_OUTCOMES.map((o) => [o, report.calls.reduce((n, r) => n + r.calls[o], 0)]),
  ) as Record<CallOutcome, number>;
  const total = CALL_OUTCOMES.reduce((n, o) => n + byOutcome[o], 0);
  const saved = report.calls.reduce((n, r) => n + r.original_bytes - r.delivered_bytes, 0);
  const width = Math.max(...CALL_OUTCOMES.map((o) => String(byOutcome[o]).length));
  const shown = report.calls.slice(0, MAX_TOOL_ROWS);
  return [
    `Calls seen since ${report.callsSince}: ${total}`,
    ...CALL_OUTCOMES.map((o) =>
      `  ${OUTCOME_LABEL[o].padEnd(11)}  ${String(byOutcome[o]).padStart(width)}  ${OUTCOME_NOTE[o]}`),
    `  Kept out of context since then: ${formatBytes(saved)} (${tokens(saved)})`,
    "",
    "Calls by tool:",
    ...table(
      ["tool / command", "calls", ...CALL_OUTCOMES.map((o) => OUTCOME_LABEL[o])],
      shown.map((r) => [
        r.command_fp ? `${r.tool_name}: ${r.command_fp}` : r.tool_name,
        String(totalCalls(r)), ...CALL_OUTCOMES.map((o) => String(r.calls[o])),
      ]),
    ),
    ...folded(report.calls.length - shown.length, "tool or command with fewer calls", "tools or commands with fewer calls"),
  ];
}

/** What the stored rows hold now: eviction and expiry shrink these figures. */
function storeSection(report: StatsReport): string[] {
  const saved = report.original_bytes - report.delivered_bytes;
  const shown = report.tools.slice(0, MAX_TOOL_ROWS);
  return [
    "In the store now:",
    `  Outputs summarized:  ${report.items}`,
    `  Original size:       ${formatBytes(report.original_bytes)}`,
    `  Delivered to Claude: ${formatBytes(report.delivered_bytes)}`,
    `  Kept out of context: ${formatBytes(saved)} ` +
      `(${reduction(report.original_bytes, report.delivered_bytes)} smaller, ${tokens(saved)})`,
    "",
    "Stored by tool:",
    ...table(
      ["tool", "outputs", "original", "delivered", "reduction"],
      shown.map((r) => [
        r.tool_name, String(r.items), formatBytes(r.original_bytes),
        formatBytes(r.summary_bytes), reduction(r.original_bytes, r.summary_bytes),
      ]),
    ),
    ...folded(report.tools.length - shown.length, "tool with less output", "tools with less output"),
    "",
    "The store drops output once it expires or is evicted; the call counts keep every call.",
  ];
}

export function formatStats(report: StatsReport, all: boolean): string {
  const lines: string[] = [];
  const hasCalls = report.calls.length > 0;
  if (report.items === 0 && !hasCalls && report.unreadable > 0) {
    lines.push(all ? "Nothing to report from the stores that could be read." : "Nothing to report: this project's store could not be read.");
  } else if (report.items === 0 && !hasCalls) {
    lines.push(
      all ? "Nothing summarized yet in any store." : "Nothing summarized yet for this project.",
      "That is normal right after install: there is no warm-up, and output too small to",
      "summarize passes through untouched and is not stored. To see it work, follow",
      `step 3 of the Quick start: ${QUICK_START_URL}`,
    );
  } else {
    if (hasCalls) lines.push(...callsSection(report));
    if (hasCalls && report.items > 0) lines.push("");
    if (report.items > 0) lines.push(...storeSection(report));
  }
  if (report.uncounted > 0) {
    lines.push(
      all
        ? `${report.uncounted} store${report.uncounted === 1 ? " has" : "s have"} no call counts yet: ` +
          "counting starts with the next Claude Code session in that project."
        : "Calls are not counted yet: counting starts with the next Claude Code session in this project.",
    );
  }
  if (report.unreadable > 0) {
    const one = report.unreadable === 1;
    lines.push(
      `${report.unreadable} store${one ? "" : "s"} could not be read ` +
        `(locked, or not opened since an upgrade) and ${one ? "is" : "are"} not included. ` +
        "Starting a Claude Code session in that project upgrades its store.",
    );
  }
  return lines.join("\n");
}

export function statsCommand(opts: StatsOptions = {}): void {
  const all = opts.all ?? false;
  const files = storeFiles(all);
  const key = all ? undefined : getProjectKey(process.cwd());
  const report = mergeStats(files.map((f) => readStatsStore(f, key)));
  const scope = all ? `${report.stores} store${report.stores === 1 ? "" : "s"}` : "this project";
  console.log(`mcp-recall stats · ${scope}\n`);
  console.log(formatStats(report, all));
}
