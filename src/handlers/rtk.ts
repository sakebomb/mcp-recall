/**
 * Output from rtk (#353). rtk's PreToolUse hook rewrites a command before it
 * runs (`git diff` → `rtk git diff`), and rtk then prints its own compact form,
 * with a recovery hint wherever it elided something: `[+3 hidden: rtk recall
 * 18f9a13f3086]`, `[full output: rtk recall <hash>]`, or `[full diff: rtk git
 * diff --no-compact]`. A summary that cuts the line holding a hint must keep it,
 * or the elided content can no longer be found.
 */

const RECOVERY_HINT_RE = /\brtk recall [0-9a-f]{6,}\b|^\s*\[full [a-z ]+: rtk [^\]]+\]\s*$/;

/** At most this many hints are appended, so a hint-dense output stays bounded. */
const MAX_HINTS = 5;

/** The rtk recovery hints among `lines`, in order, at most {@link MAX_HINTS}. */
export function recoveryHints(lines: string[]): string[] {
  return lines.filter((l) => RECOVERY_HINT_RE.test(l)).slice(0, MAX_HINTS).map((l) => l.trim());
}
