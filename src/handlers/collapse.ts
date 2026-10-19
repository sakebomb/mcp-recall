/**
 * Collapses runs of repeated lines (#340), so a fallback summary spends its line
 * budget on distinct lines instead of a retry loop's hundredth copy.
 *
 * Two lines repeat when they are equal once volatile tokens are masked:
 * timestamps, bracketed PIDs (`sshd[812]`), UUIDs, mixed hex ids of 8+ chars,
 * and durations (`12ms`, `1.5s`). Nothing else is masked, so lines that differ
 * in a path, a status code or a bare counter (`retry 1`, `retry 2`) stay apart.
 * Only consecutive lines collapse: interleaved repeats keep their order.
 *
 * Under `balanced` retention a fallback row may keep no body, so the summary is
 * the only copy. Masking is kept narrow for that reason.
 */

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

/** `line` with its volatile tokens masked: the key two repeats share. */
export function repeatKey(line: string): string {
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
 * otherwise. Blank lines are never collapsed.
 */
export function collapseRepeats(lines: string[]): CollapsedLine[] {
  const out: CollapsedLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const first = lines[i]!;
    let end = i + 1;
    if (first.trim() !== "") {
      const key = repeatKey(first);
      while (end < lines.length && repeatKey(lines[end]!) === key) end++;
    }
    out.push({ text: end - i > 1 ? `${first}  ${runNote(lines.slice(i, end))}` : first, count: end - i });
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
