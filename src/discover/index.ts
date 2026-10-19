/**
 * mcp-recall discover — which tools and Bash commands land on a fallback
 * handler, by bytes, with their reduction and retrieval rate (#341). The data
 * to decide which handler to write next.
 *
 * Read-only: every store is opened readonly, so the report never migrates or
 * writes one. A store opened by no session since #341 has no `handler` column;
 * its rows count as "stored before handlers were recorded", like NULL rows.
 */

import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  dataDir,
  defaultDbPath,
  getFallbackRoutes,
  getHandlerBreakdown,
  countUnrecordedHandler,
  type FallbackRouteRow,
  type HandlerBreakdownRow,
  type HandlerQueryOptions,
} from "../db/index";
import { getProjectKey } from "../project-key";
import { formatBytes } from "../format";

export const DEFAULT_LIMIT = 10;

export interface DiscoverReport {
  routes: FallbackRouteRow[];
  handlers: HandlerBreakdownRow[];
  /** Intercepted rows with no recorded handler: stored before #341. */
  unrecorded: number;
  stores: number;
}

export interface DiscoverOptions {
  all?: boolean;
  since?: number;
  limit?: number;
}

const EMPTY: DiscoverReport = { routes: [], handlers: [], unrecorded: 0, stores: 0 };

function hasHandlerColumn(db: Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(stored_outputs)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === "handler");
}

/** The report for one store file, across every project key it holds. */
export function readStore(file: string, opts: HandlerQueryOptions = {}): DiscoverReport {
  let db: Database | null = null;
  try {
    db = new Database(file, { readonly: true });
    const isRecallDb = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='stored_outputs'`)
      .get();
    if (!isRecallDb) return EMPTY;

    const keys = (db.prepare(`SELECT DISTINCT project_key FROM stored_outputs`).all() as Array<{ project_key: string }>)
      .map((r) => r.project_key);
    if (!hasHandlerColumn(db)) {
      const since = opts.since ?? 0;
      const { n } = db
        .prepare(`SELECT COUNT(*) AS n FROM stored_outputs WHERE tool_name != 'recall__note' AND created_at >= ?`)
        .get(since) as { n: number };
      return { ...EMPTY, unrecorded: n, stores: 1 };
    }
    const reports = keys.map((key) => ({
      routes: getFallbackRoutes(db!, key, opts),
      handlers: getHandlerBreakdown(db!, key, opts),
      unrecorded: countUnrecordedHandler(db!, key, opts),
      stores: 0,
    }));
    return { ...mergeReports(reports), stores: 1 };
  } catch {
    return EMPTY; // unreadable or locked: leave it out rather than fail the report
  } finally {
    db?.close();
  }
}

function addCounts<T extends HandlerBreakdownRow>(a: T, b: T): T {
  return {
    ...a,
    items: a.items + b.items,
    original_bytes: a.original_bytes + b.original_bytes,
    summary_bytes: a.summary_bytes + b.summary_bytes,
    retrieved: a.retrieved + b.retrieved,
  };
}

function sumBy<T extends HandlerBreakdownRow>(rows: T[], key: (r: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const prev = merged.get(k);
    merged.set(k, prev ? addCounts(prev, row) : row);
  }
  return [...merged.values()].sort((a, b) => b.original_bytes - a.original_bytes);
}

/** Sums reports from several stores or project keys into one. */
export function mergeReports(reports: DiscoverReport[]): DiscoverReport {
  return {
    routes: sumBy(reports.flatMap((r) => r.routes), (r) => `${r.tool_name}\0${r.command_fp ?? ""}\0${r.handler}`),
    handlers: sumBy(reports.flatMap((r) => r.handlers), (r) => r.handler),
    unrecorded: reports.reduce((n, r) => n + r.unrecorded, 0),
    stores: reports.reduce((n, r) => n + r.stores, 0),
  };
}

/** The store files a run covers: the current project's, or every one with --all. */
export function storeFiles(all: boolean, cwd: string = process.cwd()): string[] {
  if (!all) {
    const file = defaultDbPath(getProjectKey(cwd));
    return existsSync(file) ? [file] : [];
  }
  const dir = dataDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(".db")).map((n) => join(dir, n));
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(0)}%` : "—";
}

function reduction(row: HandlerBreakdownRow): string {
  return row.original_bytes > 0 ? pct(row.original_bytes - row.summary_bytes, row.original_bytes) : "—";
}

function routeLabel(row: FallbackRouteRow): string {
  return row.command_fp !== null ? `${row.tool_name}: ${row.command_fp}` : row.tool_name;
}

/** A text table: the first `textCols` columns left-aligned, the figures after them right-aligned. */
function table(header: string[], rows: string[][], textCols = 1): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells: string[]) =>
    "  " + cells.map((c, i) => (i < textCols ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  return [fmt(header), ...rows.map(fmt)];
}

export function formatReport(report: DiscoverReport, limit: number = DEFAULT_LIMIT): string {
  const lines: string[] = [];
  const shown = report.routes.slice(0, limit);

  lines.push("Fallback-routed output, by original size (candidates for a new handler):");
  if (shown.length === 0) {
    lines.push("  none recorded");
  } else {
    lines.push(
      ...table(
        ["tool / command", "handler", "items", "original", "delivered", "reduction", "retrieved"],
        shown.map((r) => [
          routeLabel(r), r.handler, String(r.items), formatBytes(r.original_bytes),
          formatBytes(r.summary_bytes), reduction(r), pct(r.retrieved, r.items),
        ]),
        2
      )
    );
    const hidden = report.routes.length - shown.length;
    if (hidden > 0) lines.push(`  … ${hidden} more (--limit to show more)`);
  }

  lines.push("", "By handler:");
  if (report.handlers.length === 0) {
    lines.push("  none recorded");
  } else {
    lines.push(
      ...table(
        ["handler", "items", "original", "delivered", "reduction", "retrieved"],
        report.handlers.map((r) => [
          r.handler, String(r.items), formatBytes(r.original_bytes),
          formatBytes(r.summary_bytes), reduction(r), pct(r.retrieved, r.items),
        ])
      )
    );
  }

  lines.push(
    "",
    "retrieved = share fetched at least once with recall__retrieve; a high rate means the summary dropped something needed.",
  );
  if (report.unrecorded > 0) {
    lines.push(
      `${report.unrecorded} item${report.unrecorded === 1 ? "" : "s"} stored before handlers were recorded (1.17.0) ` +
        `${report.unrecorded === 1 ? "is" : "are"} not included.`
    );
  }
  return lines.join("\n");
}

/** Parses a YYYY-MM-DD date (local midnight) to Unix seconds, or null when malformed. */
export function parseSince(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (date.getMonth() !== Number(m[2]) - 1 || date.getDate() !== Number(m[3])) return null;
  return Math.floor(date.getTime() / 1000);
}

/** YYYY-MM-DD in local time, the inverse of {@link parseSince}. */
function localDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function discoverCommand(opts: DiscoverOptions = {}): void {
  const files = storeFiles(opts.all ?? false);
  if (files.length === 0) {
    console.log(opts.all ? "No stores found." : "No store for this project yet.");
    return;
  }
  const report = mergeReports(files.map((f) => readStore(f, { since: opts.since })));
  const scope = opts.all ? `${report.stores} store${report.stores === 1 ? "" : "s"}` : "this project";
  const since = opts.since !== undefined ? ` since ${localDate(opts.since)}` : "";
  console.log(`mcp-recall discover · ${scope}${since}\n`);
  console.log(formatReport(report, opts.limit));
}
