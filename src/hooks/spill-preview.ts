/**
 * Claude Code wraps a Bash result it spilled to tool-results/ in its own notice
 * and shows the model only a preview of the hook's replacement: "Preview (first
 * 2KB)", cut back to a whole line. Whatever a summary puts after that never
 * arrives, and handlers put totals, failures and "+N more" footers last (#499).
 *
 * Measured on Claude Code 2.1.330: of a 2,371-byte replacement, 1,978 bytes
 * were shown and the next line, ending at byte 2,045, was not. The cap stays
 * under what was seen to arrive, so it holds whether the limit counts bytes or
 * characters.
 */
export const SPILL_PREVIEW_BYTES = 1950;

/** Lines kept from the end, where a summary's footer sits. */
const TAIL_LINES = 3;

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

/** The longest prefix of `s` within `max` bytes that ends on a whole character. */
function cutBytes(s: string, max: number): string {
  let out = "";
  let used = 0;
  for (const ch of s) {
    used += bytes(ch);
    if (used > max) break;
    out += ch;
  }
  return out;
}

/**
 * Fits `summary` in `maxBytes` by dropping lines from the middle: the head and
 * the last few lines stay, with a marker between them saying how many went.
 * A summary already within the budget is returned as it is.
 */
export function fitLines(summary: string, maxBytes: number): string {
  if (bytes(summary) <= maxBytes) return summary;
  const lines = summary.split("\n");
  const marker = (cut: number) => `  … (${cut} lines cut to fit Claude Code's preview; retrieve this id for all of it)`;
  // Sized for the largest count it could carry, plus the newlines around it.
  let budget = maxBytes - bytes(marker(lines.length)) - 1;

  const tail: string[] = [];
  for (let i = lines.length - 1; i > 0 && tail.length < TAIL_LINES; i--) {
    const cost = bytes(lines[i]!) + 1;
    if (cost > budget / 3) break;
    tail.unshift(lines[i]!);
    budget -= cost;
  }

  const head: string[] = [];
  const headEnd = lines.length - tail.length;
  for (let i = 0; i < headEnd; i++) {
    const cost = bytes(lines[i]!) + (i > 0 ? 1 : 0);
    if (cost > budget) break;
    head.push(lines[i]!);
    budget -= cost;
  }
  // One line longer than the whole budget: keep its start rather than nothing.
  if (head.length === 0) head.push(cutBytes(lines[0]!, Math.max(budget, 0)));

  return [...head, marker(headEnd - head.length), ...tail].join("\n");
}
