/**
 * mcp-recall stats — what mcp-recall has summarized, from the command line
 * (#495): the same totals as `recall__stats`, without asking Claude, for this
 * project or every store with --all.
 *
 * Read-only: every store is opened readonly, so the report never migrates or
 * writes one. A store too old to have `delivered_size` (opened by no session
 * since that migration) is counted as unreadable, never silently dropped.
 */

import { Database } from "bun:sqlite";
import { getStats, getToolBreakdown, type ToolBreakdownRow } from "../db/index";
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
  /** Stores read. */
  stores: number;
  /** Stores that exist but could not be read. */
  unreadable: number;
}

export interface StatsOptions {
  all?: boolean;
}

const EMPTY: StatsReport = { items: 0, original_bytes: 0, delivered_bytes: 0, tools: [], stores: 0, unreadable: 0 };

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

    const keys = projectKey !== undefined
      ? [projectKey]
      : (db.prepare(`SELECT DISTINCT project_key FROM stored_outputs`).all() as Array<{ project_key: string }>)
          .map((r) => r.project_key);
    const reports = keys.map((key): StatsReport => {
      const s = getStats(db!, key);
      return {
        items: s.total_items,
        original_bytes: s.total_original_bytes,
        delivered_bytes: s.total_summary_bytes,
        tools: getToolBreakdown(db!, key).filter((r) => r.tool_name !== NOTE_TOOL),
        stores: 0,
        unreadable: 0,
      };
    });
    return { ...mergeStats(reports), stores: 1 };
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
  const sum = (f: (r: StatsReport) => number) => reports.reduce((n, r) => n + f(r), 0);
  return {
    items: sum((r) => r.items),
    original_bytes: sum((r) => r.original_bytes),
    delivered_bytes: sum((r) => r.delivered_bytes),
    tools: [...tools.values()].sort((a, b) => b.original_bytes - a.original_bytes),
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

export function formatStats(report: StatsReport, all: boolean): string {
  const lines: string[] = [];
  if (report.items === 0 && report.unreadable > 0) {
    lines.push(all ? "Nothing to report from the stores that could be read." : "Nothing to report: this project's store could not be read.");
  } else if (report.items === 0) {
    lines.push(
      all ? "Nothing summarized yet in any store." : "Nothing summarized yet for this project.",
      "That is normal right after install: there is no warm-up, and output too small to",
      "summarize passes through untouched and is not stored. To see it work, follow",
      `step 3 of the Quick start: ${QUICK_START_URL}`,
    );
  } else {
    const saved = report.original_bytes - report.delivered_bytes;
    const shown = report.tools.slice(0, MAX_TOOL_ROWS);
    const hidden = report.tools.length - shown.length;
    lines.push(
      `  Outputs summarized:  ${report.items}`,
      `  Original size:       ${formatBytes(report.original_bytes)}`,
      `  Delivered to Claude: ${formatBytes(report.delivered_bytes)}`,
      `  Kept out of context: ${formatBytes(saved)} (${reduction(report.original_bytes, report.delivered_bytes)} smaller, ` +
        `~${Math.floor(saved / BYTES_PER_TOKEN).toLocaleString()} tokens at ~${BYTES_PER_TOKEN} bytes each)`,
      "",
      "By tool:",
      ...table(
        ["tool", "outputs", "original", "delivered", "reduction"],
        shown.map((r) => [
          r.tool_name, String(r.items), formatBytes(r.original_bytes),
          formatBytes(r.summary_bytes), reduction(r.original_bytes, r.summary_bytes),
        ]),
      ),
      ...(hidden > 0 ? [`  … ${hidden} more tool${hidden === 1 ? "" : "s"} with less output`] : []),
      "",
      "Counts cover what is in the store now: expired or evicted output no longer counts,",
      "and output too small to summarize is never stored.",
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
