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

const plural = (n: number): string => (n === 1 ? "" : "s");

function summarizeLines(lines: string[]): string {
  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(lines.length - TAIL_LINES);
  const middle = lines.slice(HEAD_LINES, lines.length - TAIL_LINES);
  const matches = middle.filter((l) => MATCH_RE.test(l)).slice(0, MAX_MATCH_LINES);

  const note = matches.length
    ? `…(${middle.length} middle line${plural(middle.length)} elided; ${matches.length} error/warn shown)…`
    : `…(${middle.length} middle line${plural(middle.length)} elided)…`;

  return [...head, note, ...matches, ...tail].join("\n");
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

  const lines = raw.split("\n");
  const summary =
    lines.length >= LINE_MODE_MIN_LINES ? summarizeLines(lines) : summarizeBlock(raw);

  // Note: for a small log whose few middle lines all match MATCH_RE, the
  // line-mode summary can be no smaller than the input (nothing is truly
  // elided). That's intentional — the PostToolUse hook skips storing when the
  // summary doesn't shrink, so such small output simply passes through in full,
  // which preserves the error lines we'd otherwise want to surface anyway.
  return { summary, originalSize };
};
