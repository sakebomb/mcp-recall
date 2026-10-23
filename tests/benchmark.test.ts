import { describe, expect, it } from "bun:test";
import { FIXTURES, factsKept, summarize, type Fixture } from "../scripts/benchmark";

const fixture: Fixture = { label: "x", command: "tsc", keep: ["60 errors", "file59\\.ts"] };

describe("factsKept", () => {
  it("counts the listed facts the summary still carries", () => {
    expect(factsKept(fixture, "Found 60 errors in 60 files")).toBe("1/2");
    expect(factsKept(fixture, "60 errors · last: src/file59.ts")).toBe("2/2");
    expect(factsKept(fixture, "tsc failed")).toBe("0/2");
  });

  it("reports a dash for a fixture that lists no facts", () => {
    expect(factsKept({ label: "x", command: "ls" }, "anything")).toBe("—");
  });

  it("scores a summary that drops everything below one that keeps the facts", () => {
    // The column must be able to fail: an empty summary keeps none of a fixture's facts.
    for (const f of FIXTURES.filter((x) => x.keep?.length)) {
      expect(factsKept(f, "")).toBe(`0/${f.keep!.length}`);
      const kept = Number(factsKept(f, summarize(f).summary).split("/")[0]);
      expect(kept).toBeGreaterThan(0);
    }
  });
});
