/**
 * Caps the width of a summary line (#349). Handlers cap how many lines a summary
 * keeps, never how wide they are, so one huge line (a minified bundle hit by
 * grep, a serialized blob, a progress bar with no newlines) was delivered whole.
 *
 * A clipped line ends in an explicit marker with the elided char count, and a
 * summary carrying one keeps its body under `balanced` retention (see
 * {@link hasClippedLine}), so the marker never points at content that is gone.
 */

// Wide enough that prose and JSON lines a summary already showed survive: on the
// transcript replay, 1,000 also cut 1–2 KB paragraphs in 65 outputs (15 of them
// ≤ 8 KB) for 0.7% more saving; 4,000 cut none ≤ 8 KB and kept ~85% of it.
export const MAX_LINE_CHARS = 4000;

const CLIP_MARKER_RE = /… \(\+\d+ chars\)$/m;

/** `line` cut to `max` chars plus `… (+N chars)`, or unchanged when it fits. */
export function clipLine(line: string, max = MAX_LINE_CHARS): string {
  if (line.length <= max) return line;
  // Never split a surrogate pair.
  const end = /[\uD800-\uDBFF]/.test(line[max - 1]!) ? max - 1 : max;
  return `${line.slice(0, end)}… (+${line.length - end} chars)`;
}

/** True when some line of `summary` was cut by {@link clipLine}. */
export function hasClippedLine(summary: string): boolean {
  return CLIP_MARKER_RE.test(summary);
}
