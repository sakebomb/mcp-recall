/**
 * mcp-recall statusline — one line for Claude Code's `statusLine` setting
 * (#495): today's counted calls and the bytes kept out of context, for the
 * project the session was started in.
 *
 * Claude Code runs the command on every status refresh and shows nothing if it
 * exits non-zero or prints nothing. So this never writes a store (readonly, and
 * it adds the unfolded log lines instead of folding them), and a fault prints
 * nothing: a broken store must not cost the user the rest of their status line.
 *
 * Measured bytes and calls only, as in `mcp-recall stats`.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { hasCallCounts, readCallLog, defaultDbPath, localDay } from "../db/index";
import { getProjectKey } from "../project-key";
import { formatBytes } from "../format";

export interface DayTotals {
  /** Calls the hook saw, summarized or passed through. */
  calls: number;
  /** Original bytes minus what Claude received. */
  saved_bytes: number;
}

export interface StoreLocation {
  file: string;
  projectKey: string;
}

export interface StatuslineDeps {
  storeFor?: (cwd: string) => StoreLocation;
}

const NO_CALLS: DayTotals = { calls: 0, saved_bytes: 0 };

/**
 * One project's totals for `day` (a {@link localDay}). Zero when the store does
 * not exist yet or predates call counts; null when it exists and cannot be read.
 */
export function readDayTotals(file: string, projectKey: string, day: string): DayTotals | null {
  if (!existsSync(file)) return NO_CALLS;
  let db: Database | null = null;
  try {
    db = new Database(file, { readonly: true });
    const folded = hasCallCounts(db)
      ? (db.prepare(`
          SELECT COALESCE(SUM(calls), 0) AS calls,
                 COALESCE(SUM(original_bytes - delivered_bytes), 0) AS saved_bytes
          FROM call_counts
          WHERE project_key = ? AND day = ?
        `).get(projectKey, day) as DayTotals)
      : NO_CALLS;
    const pending = readCallLog(file).filter((c) => c.project_key === projectKey && c.day === day);
    return {
      calls: folded.calls + pending.length,
      saved_bytes: folded.saved_bytes + pending.reduce((n, c) => n + c.original_bytes - c.delivered_bytes, 0),
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** The line for `totals`; empty for null, so an unreadable store shows nothing. */
export function formatStatusline(totals: DayTotals | null): string {
  if (totals === null) return "";
  if (totals.calls === 0) return "recall: no calls yet today";
  const calls = `${totals.calls} call${totals.calls === 1 ? "" : "s"}`;
  if (totals.saved_bytes <= 0) return `recall: ${calls} today, none large enough to summarize`;
  return `recall: ${formatBytes(totals.saved_bytes)} kept out today · ${calls}`;
}

/**
 * The directory the session was started in, from the JSON Claude Code sends on
 * stdin: `workspace.project_dir`, else the current directory. `fallback` when
 * the command is run by hand, with no JSON at all.
 */
export function sessionDir(raw: string, fallback: string): string {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return fallback; }
  if (typeof data !== "object" || data === null) return fallback;
  const { workspace, cwd } = data as { workspace?: unknown; cwd?: unknown };
  const ws = (typeof workspace === "object" && workspace !== null ? workspace : {}) as Record<string, unknown>;
  const dir = [ws.project_dir, ws.current_dir, cwd].find((d) => typeof d === "string" && d !== "");
  return typeof dir === "string" ? dir : fallback;
}

function defaultStoreFor(cwd: string): StoreLocation {
  const projectKey = getProjectKey(cwd);
  return { file: defaultDbPath(projectKey), projectKey };
}

/** The status line for the session described by `raw`. Never throws. */
export function statuslineText(raw: string, deps: StatuslineDeps = {}): string {
  try {
    const { file, projectKey } = (deps.storeFor ?? defaultStoreFor)(sessionDir(raw, process.cwd()));
    return formatStatusline(readDayTotals(file, projectKey, localDay()));
  } catch {
    return "";
  }
}

/** How long to wait for the session JSON before going on without it. */
export const STDIN_TIMEOUT_MS = 1000;

/**
 * Stdin as text, or "" when it is a terminal, cannot be read, or is still open
 * after `timeoutMs`. Claude Code writes the session and closes the pipe; a
 * wrapper script that leaves its own stdin open must not stall every refresh.
 */
export async function readSession(timeoutMs: number = STDIN_TIMEOUT_MS): Promise<string> {
  if (process.stdin.isTTY) return "";
  try {
    return await Promise.race([
      Bun.stdin.text(),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), timeoutMs)),
    ]);
  } catch {
    return "";
  }
}

/** Prints the line. The caller exits 0 whatever happened here. */
export async function statuslineCommand(): Promise<void> {
  const text = statuslineText(await readSession());
  if (text !== "") console.log(text);
}
