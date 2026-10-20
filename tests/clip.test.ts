import { describe, it, expect } from "bun:test";
import { clipLine, hasClippedLine, MAX_LINE_CHARS } from "../src/handlers/clip";
import { collapseRepeats } from "../src/handlers/collapse";
import { getBashHandler } from "../src/handlers/bash";
import { genericHandler } from "../src/handlers/generic";
import { shouldRetainFullBody } from "../src/retention";

const HUGE = "x".repeat(900_000);
const envelope = (stdout: string) => ({ stdout, stderr: "", exit_code: 0 });

describe("clipLine", () => {
  it("leaves a line at the cap unchanged", () => {
    const line = "a".repeat(MAX_LINE_CHARS);
    expect(clipLine(line)).toBe(line);
    expect(hasClippedLine(line)).toBe(false);
  });

  it("cuts a wide line to the cap and states the elided char count", () => {
    const clipped = clipLine(HUGE);
    expect(clipped).toBe(`${"x".repeat(MAX_LINE_CHARS)}… (+${900_000 - MAX_LINE_CHARS} chars)`);
    expect(hasClippedLine(`header\n${clipped}\ntail`)).toBe(true);
  });

  it("never splits a surrogate pair at the cut", () => {
    const line = "a".repeat(9) + "😀" + "b".repeat(20);
    const clipped = clipLine(line, 10);
    expect(clipped.startsWith("a".repeat(9) + "…")).toBe(true);
    expect(clipped).toContain(`(+${line.length - 9} chars)`);
  });

  it("clips a run of wide repeats before its count, so the count survives", () => {
    const [run] = collapseRepeats([HUGE, HUGE, HUGE], Infinity, MAX_LINE_CHARS);
    expect(run!.count).toBe(3);
    expect(run!.text.endsWith(" chars)  (×3)")).toBe(true);
  });
});

describe("one huge line yields a small summary (#349)", () => {
  const cases: [string, string, string][] = [
    ["shell", "make bundle", HUGE],
    ["grep piped to head", "grep -n sourceMappingURL dist/app.min.js | head", `1:${HUGE}`],
    ["git grep", "git grep foo", HUGE],
    ["compound", "ls dist; cat dist/app.min.js", `app.min.js\n${HUGE}`],
  ];
  for (const [label, command, stdout] of cases) {
    it(`clips it on ${label}`, () => {
      const { summary } = getBashHandler({ command })("Bash", envelope(stdout));
      expect(summary.length).toBeLessThan(MAX_LINE_CHARS + 200);
      expect(hasClippedLine(summary)).toBe(true);
    });
  }

  it("clips it in the generic fallback's line window", () => {
    const lines = [HUGE, ...Array.from({ length: 20 }, (_, i) => `line ${i}`)].join("\n");
    const summary = genericHandler("mcp__x__y", lines).summary;
    expect(summary.length).toBeLessThan(MAX_LINE_CHARS + 400);
    expect(hasClippedLine(summary)).toBe(true);
  });

  it("leaves a summary with no wide line byte-identical (control)", () => {
    const stdout = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const { summary } = getBashHandler({ command: "ls dist; cat notes" })("Bash", envelope(stdout));
    expect(summary).toBe(stdout);
  });
});

describe("retention of a clipped summary", () => {
  const clipped = `[bash · 1 line stdout]\n${clipLine(HUGE)}`;

  it("keeps the body of reproducible Bash under balanced when a line was clipped", () => {
    expect(shouldRetainFullBody("balanced", "Bash", "make bundle", clipped)).toBe(true);
    expect(shouldRetainFullBody("balanced", "Bash", "make bundle", "[bash · 3 lines stdout]\na\nb\nc")).toBe(false);
  });

  it("still drops every body under minimal", () => {
    expect(shouldRetainFullBody("minimal", "Bash", "make bundle", clipped)).toBe(false);
  });
});
