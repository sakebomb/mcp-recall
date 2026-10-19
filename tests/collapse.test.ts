import { describe, it, expect } from "bun:test";
import { collapseRepeats, repeatKey } from "../src/handlers/collapse";
import { shellHandler } from "../src/handlers/shell";
import { genericHandler } from "../src/handlers/generic";

const texts = (lines: string[]) => collapseRepeats(lines).map((l) => l.text);

describe("repeatKey", () => {
  it("masks timestamps, pids, uuids, hex ids and durations", () => {
    expect(repeatKey("Oct 19 12:00:01 jupiter sshd[812]: retry in 1.5s")).toBe(
      "<ts> jupiter sshd[<pid>]: retry in <dur>"
    );
    expect(repeatKey("2026-10-19T12:00:01.123Z job 3f9a2c1e7b failed")).toBe("<ts> job <hex> failed");
    expect(repeatKey("ERROR 12:00:01 req 123e4567-e89b-12d3-a456-426614174000 done")).toBe("ERROR <ts> req <uuid> done");
  });

  // The summary can be the only copy, so anything that is not plainly volatile
  // must keep two log lines apart. Each pair is a log line, so masking runs.
  it("keeps log lines apart that differ in a path, status code, counter or word", () => {
    const apart: [string, string][] = [
      ["GET /api/a 200", "GET /api/b 200"],
      ["GET /api/a 200", "GET /api/a 500"],
      ["retry 1 failed", "retry 2 failed"],
      ["open /var/log/a.log: denied", "open /var/log/b.log: denied"],
      ["key deadbeef", "key cafebabe"],
      ["exit 1", "exit 2"],
    ];
    for (const [a, b] of apart) {
      expect(repeatKey(`12:00:01 ${a}`)).not.toBe(repeatKey(`12:00:02 ${b}`));
    }
  });

  // Found in a transcript replay: a timestamp or id past the line's start is
  // data, and masking it would hide which slots or commits exist.
  it("does not mask a line that does not open with a timestamp", () => {
    const slot = (t: string) => `  "s": "2026-09-26 | 2026-09-26T${t}:00.000Z | status=open | cap=10 booked=0"`;
    expect(repeatKey(slot("14:00"))).not.toBe(repeatKey(slot("15:30")));
    const row = (from: string, to: string) => `2026-09-26 | ${from}:00 | ${to}:00 | closed | 10 | 0 | 0`;
    expect(repeatKey(row("11:00", "11:30"))).not.toBe(repeatKey(row("11:30", "12:00")));
    expect(repeatKey("3f9a2c1e7b wip")).not.toBe(repeatKey("8d0e4b6a2f wip"));
  });
});

describe("collapseRepeats", () => {
  it("collapses an identical run with a count", () => {
    expect(texts(["a", "b", "b", "b", "c"])).toEqual(["a", "b  (×3)", "c"]);
  });

  it("collapses a run that differs only in timestamps and shows the last", () => {
    expect(texts(["12:00:01 retry failed", "12:00:02 retry failed", "12:03:20 retry failed"])).toEqual([
      "12:00:01 retry failed  (×3, until 12:03:20)",
    ]);
  });

  it("says ids vary when a run has no timestamp to show", () => {
    expect(texts(["12:00:01 worker[1] up", "12:00:01 worker[2] up"])).toEqual(["12:00:01 worker[1] up  (×2, varying ids)"]);
  });

  it("leaves interleaved repeats and blank lines in order", () => {
    expect(texts(["a", "b", "a", "b", "", "", "c"])).toEqual(["a", "b", "a", "b", "", "", "c"]);
  });

  it("records how many input lines each summary line stands for", () => {
    expect(collapseRepeats(["x", "x", "y"]).map((l) => l.count)).toEqual([2, 1]);
  });
});

describe("fallback handlers collapse repeats before truncating (#340)", () => {
  // 500 lines, three distinct messages: the old 25-line head showed one.
  const journal = [
    ...Array.from({ length: 200 }, (_, i) => `Oct 19 12:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")} jupiter app[812]: connection reset, retrying`),
    ...Array.from({ length: 299 }, () => "Oct 19 12:05:00 jupiter app[812]: queue depth 0"),
    "Oct 19 12:05:01 jupiter app[812]: FATAL: disk full on /var",
  ];

  it("shows all three distinct messages of a 500-line log with counts", () => {
    const { summary } = shellHandler("Bash", { stdout: journal.join("\n"), stderr: "" });
    expect(summary).toContain("[bash · 500 lines stdout]");
    expect(summary).toContain("connection reset, retrying  (×200, until Oct 19 12:03:19)");
    expect(summary).toContain("queue depth 0  (×299)");
    expect(summary).toContain("FATAL: disk full on /var");
    expect(summary).not.toContain("more lines");
  });

  it("counts the overflow in input lines, not summary lines", () => {
    const lines = [...Array.from({ length: 10 }, () => "same"), ...Array.from({ length: 40 }, (_, i) => `line ${i}`)];
    const { summary } = shellHandler("Bash", lines.join("\n"));
    // 25 summary lines = the run (10 input lines) + line 0..23; 16 left.
    expect(summary).toContain("same  (×10)");
    expect(summary).toContain("line 23");
    expect(summary).not.toContain("line 24");
    expect(summary).toContain("… (+16 more lines)");
  });

  it("summarizes a collapsed repetitive output in the generic handler, not a raw window", () => {
    const raw = Array.from({ length: 500 }, (_, i) => `2026-10-19T12:00:${String(i % 60).padStart(2, "0")}Z poll ok`).join("\n");
    const { summary } = genericHandler("mcp__x__logs", raw);
    // The last line is i = 499, at second 499 % 60 = 19.
    expect(summary).toBe("2026-10-19T12:00:00Z poll ok  (×500, until 2026-10-19T12:00:19Z)");
  });
});
