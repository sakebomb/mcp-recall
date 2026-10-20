/**
 * Generic handler — last-resort fallback for output that matches no dedicated
 * handler and is neither JSON nor CSV (those route earlier). Rather than a blind
 * head-truncation, it is structure-aware and deterministic (no LLM, no network):
 *
 * - Small output (≤ MAX_CHARS) is returned unchanged.
 * - Long *multi-line* output (logs, traces) → the first and last few lines, the
 *   count of elided middle lines, and any error/warn lines surfaced from the
 *   middle so failures aren't buried.
 * - Long *single-block* output (prose, one huge line) → a head + tail window so
 *   the end (often a conclusion or final error) survives, not just the head.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";
import { collapseRepeats } from "./collapse";
import { clipLine } from "./clip";
import { recoveryHints } from "./rtk";

const MAX_CHARS = 500; // return unchanged at or below this size

// Block-mode (few lines) head + tail character windows.
const HEAD_CHARS = 380;
const TAIL_CHARS = 100;

// Line-mode (many lines) windows. Threshold exceeds HEAD+TAIL so the middle is
// always non-empty and head/tail never overlap.
const HEAD_LINES = 5;
const TAIL_LINES = 5;
const LINE_MODE_MIN_LINES = HEAD_LINES + TAIL_LINES + 1;
const MAX_MATCH_LINES = 8;

/** Lines worth surfacing from an otherwise-elided middle. */
const MATCH_RE =
  /\b(error|errors|warn|warning|fail|failed|failure|exception|fatal|panic|denied|refused|timeout)\b/i;

function summarizeBlock(raw: string): string {
  const head = raw.slice(0, HEAD_CHARS).trimEnd();
  const tail = raw.slice(-TAIL_CHARS).trimStart();
  return `${head}\n…\n${tail}`;
}

/** Up to MAX_MATCH_LINES error/warn lines from lines a summary would cut. */
export function failureLines(lines: string[]): string[] {
  return lines.filter((l) => MATCH_RE.test(l)).slice(0, MAX_MATCH_LINES);
}

const plural = (n: number): string => (n === 1 ? "" : "s");

function summarizeLines(lines: string[]): string {
  return summarizeLineWindow(lines, HEAD_LINES, TAIL_LINES);
}

/**
 * First `headLines` and last `tailLines` lines, with a count of the elided
 * middle and any error/warn lines and rtk recovery hints (#353) surfaced from
 * it, each line clipped to MAX_LINE_CHARS (#349). Callers keep
 * `lines.length > headLines + tailLines` so the windows never overlap.
 */
export function summarizeLineWindow(lines: string[], headLines: number, tailLines: number): string {
  const head = lines.slice(0, headLines);
  const tail = lines.slice(lines.length - tailLines);
  const middle = lines.slice(headLines, lines.length - tailLines);
  const matches = failureLines(middle);
  const hints = recoveryHints(middle.filter((l) => !matches.includes(l)));

  const note = matches.length
    ? `…(${middle.length} middle line${plural(middle.length)} elided; ${matches.length} error/warn shown)…`
    : `…(${middle.length} middle line${plural(middle.length)} elided)…`;

  return [...head, note, ...matches, ...hints, ...tail].map((l) => clipLine(l)).join("\n");
}

export const genericHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  if (raw.length <= MAX_CHARS) {
    return { summary: raw, originalSize };
  }

  // Repeats collapse first (#340), so the head, tail and surfaced error lines
  // are distinct lines; the elided count is then in collapsed lines.
  const lines = collapseRepeats(raw.split("\n")).map((l) => l.text);
  const text = lines.join("\n");
  const summary =
    lines.length >= LINE_MODE_MIN_LINES ? summarizeLines(lines)
    : text.length <= MAX_CHARS ? text
    : summarizeBlock(text);

  // Note: for a small log whose few middle lines all match MATCH_RE, the
  // line-mode summary can be no smaller than the input (nothing is truly
  // elided). That's intentional — the PostToolUse hook skips storing when the
  // summary doesn't shrink, so such small output simply passes through in full,
  // which preserves the error lines we'd otherwise want to surface anyway.
  return { summary, originalSize };
};
