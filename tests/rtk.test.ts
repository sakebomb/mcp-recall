import { describe, it, expect } from "bun:test";
import { recoveryHints } from "../src/handlers/rtk";
import { getBashHandler } from "../src/handlers/bash";

// The tail of `rtk grep -rn export src` (rtk 1.0.1): per-file and overall
// recovery hints, after 200 match lines a 25-line summary would cut.
const matches = Array.from({ length: 200 }, (_, i) => `src/m${i % 20}.ts:${i + 1}:export function f${i}() {}`);
const RTK_GREP = [
  ...matches,
  "  +3 more in src/import/index.ts [+3 hidden: rtk recall 18f9a13f3086]",
  "+21 more files [+135 hidden: rtk recall 207c077f54e0]",
].join("\n");
const envelope = (stdout: string) => ({ stdout, stderr: "", exit_code: 0 });

describe("recoveryHints", () => {
  it("finds both rtk recall forms and rtk's re-run hint", () => {
    expect(recoveryHints([
      "plain line",
      "+21 more files [+135 hidden: rtk recall 207c077f54e0]",
      "[full output: rtk recall 3f9a1c2b]",
      "[full diff: rtk git diff --no-compact]",
      "run rtk recall later", // no hash: not a hint
    ])).toEqual([
      "+21 more files [+135 hidden: rtk recall 207c077f54e0]",
      "[full output: rtk recall 3f9a1c2b]",
      "[full diff: rtk git diff --no-compact]",
    ]);
  });
});

describe("a summary keeps rtk's recovery hints (#353)", () => {
  it("keeps hints the shell fallback's head would cut", () => {
    const { summary } = getBashHandler({ command: "rtk grep -rn export src" })("Bash", envelope(RTK_GREP));
    expect(summary).toContain("… (+177 more lines)");
    expect(summary).toContain("[+3 hidden: rtk recall 18f9a13f3086]");
    expect(summary.trimEnd().endsWith("+21 more files [+135 hidden: rtk recall 207c077f54e0]")).toBe(true);
  });

  it("keeps a hint from the middle of a compound command's window", () => {
    const stdout = [...matches.slice(0, 40), "[full output: rtk recall 3f9a1c2b]", ...matches.slice(40, 80)].join("\n");
    const { summary } = getBashHandler({ command: "rtk git status; rtk grep -rn x src" })("Bash", envelope(stdout));
    expect(summary).toContain("middle lines elided");
    expect(summary).toContain("[full output: rtk recall 3f9a1c2b]");
  });

  it("adds nothing to a summary with no hints (control)", () => {
    const { summary } = getBashHandler({ command: "rtk grep -rn export src" })("Bash", envelope(matches.join("\n")));
    expect(summary).not.toContain("rtk recall");
    expect(summary.trimEnd().endsWith("… (+175 more lines)")).toBe(true);
  });
});
