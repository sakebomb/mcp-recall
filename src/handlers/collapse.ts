/**
 * Collapses runs of repeated lines (#340), so a fallback summary spends its line
 * budget on distinct lines instead of a retry loop's hundredth copy.
 *
 * Two lines repeat when they are equal, or when both are log lines (see
 * {@link repeatKey}) equal once volatile tokens are masked: timestamps,
 * bracketed PIDs (`sshd[812]`), UUIDs, mixed hex ids of 8+ chars, and durations
 * (`12ms`, `1.5s`). Nothing else is masked, so lines that differ in a path, a
 * status code or a bare counter (`retry 1`, `retry 2`) stay apart.
 * Only consecutive lines collapse: interleaved repeats keep their order.
 *
 * Under `balanced` retention a fallback row may keep no body, so the summary is
 * the only copy. Masking is kept narrow for that reason.
 */
import { clipLine } from "./clip";

const TIMESTAMP_RES = [
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2}(?:\.\d+)?/g,
  /\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g,
];

const VOLATILE_RES: Array<[RegExp, string]> = [
  ...TIMESTAMP_RES.map((re): [RegExp, string] => [re, "<ts>"]),
  [/\[\d+\]/g, "[<pid>]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
  // Hex with at least one digit and one letter, so a word like `deadbeef` or a
  // plain number is never masked.
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/g, "<hex>"],
  [/\b\d+(?:\.\d+)?(?:ms|µs|us|ns|s)\b/g, "<dur>"],
];

// A log line puts its timestamp first, after at most a level, host or count
// (`ERROR 2026-…`, `host 2026-…`, `1 time="…"`).
const MAX_WORDS_BEFORE_TIMESTAMP = 2;
// Where a log line's timestamp must start; also bounds the search per line.
const LOG_PREFIX_CHARS = 64;
// Non-global copies for `search`, compiled once: every line passes through here.
const TIMESTAMP_FIRST_RES = TIMESTAMP_RES.map((re) => new RegExp(re.source));

/**
 * True when `line` opens with a timestamp, as a log line does. A `|` before it
 * marks a table row (`2026-09-26 | 11:00:00 | closed`), whose times are data.
 */
function isLogLine(line: string): boolean {
  const head = line.slice(0, LOG_PREFIX_CHARS);
  // Every timestamp form holds an HH:MM:SS: one cheap test rules most lines out.
  if (!/\d\d:\d\d:\d\d/.test(head)) return false;
  const starts = TIMESTAMP_FIRST_RES.map((re) => head.search(re)).filter((i) => i >= 0);
  if (starts.length === 0) return false;
  const prefix = line.slice(0, Math.min(...starts)).trim();
  if (prefix.includes("|")) return false;
  return prefix === "" || prefix.split(/\s+/).length <= MAX_WORDS_BEFORE_TIMESTAMP;
}

/**
 * `line` with its volatile tokens masked: the key two repeats share. Only a log
 * line is masked; in any other line a timestamp or id may be the data itself
 * (a list of booking slots, of commits), so it must match exactly.
 */
export function repeatKey(line: string): string {
  if (!isLogLine(line)) return line;
  return VOLATILE_RES.reduce((s, [re, mask]) => s.replace(re, mask), line);
}

function lastTimestamp(line: string): string | null {
  for (const re of TIMESTAMP_RES) {
    const all = line.match(re);
    if (all) return all[all.length - 1]!;
  }
  return null;
}

/** One summary line and how many input lines it stands for. */
export interface CollapsedLine {
  text: string;
  count: number;
}

/**
 * `lines` with each run of 2+ repeats replaced by its first line and a count:
 * `(×N)` when the run is identical, `(×N, until <ts>)` when only volatile
 * tokens differ and the last line has a timestamp, `(×N, varying ids)`
 * otherwise. Blank lines are never collapsed. Stops after `limit` summary lines,
 * for a caller that keeps only the head. Each line is clipped to `width` before
 * its count is appended, so a clipped run keeps its `(×N)` (#349).
 */
export function collapseRepeats(lines: string[], limit = Infinity, width = Infinity): CollapsedLine[] {
  const out: CollapsedLine[] = [];
  let i = 0;
  while (i < lines.length && out.length < limit) {
    const first = lines[i]!;
    let end = i + 1;
    if (first.trim() !== "") {
      const key = repeatKey(first);
      while (end < lines.length && (lines[end] === first || repeatKey(lines[end]!) === key)) end++;
    }
    const text = clipLine(first, width);
    out.push({ text: end - i > 1 ? `${text}  ${runNote(lines.slice(i, end))}` : text, count: end - i });
    i = end;
  }
  return out;
}

function runNote(run: string[]): string {
  const last = run[run.length - 1]!;
  if (run.every((l) => l === run[0])) return `(×${run.length})`;
  const ts = lastTimestamp(last);
  return ts && ts !== lastTimestamp(run[0]!) ? `(×${run.length}, until ${ts})` : `(×${run.length}, varying ids)`;
}
