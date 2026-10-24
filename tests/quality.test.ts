import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { BLOCK_BEGIN, BLOCK_END, controlsBroken, fillBlock, loadCorpus, recovery, reportBlock, type FamilyScore } from "../scripts/quality";
import { contradicts, facts, keptShare, type Fact } from "../scripts/quality-facts";

const texts = (fs: Fact[]) => fs.map((f) => f.text);

describe("facts", () => {
  it("takes every path and the merge state from a long git status", () => {
    const raw = [
      "On branch main", "You have unmerged paths.", "", "Unmerged paths:", "\tboth modified:   src/mod0.ts",
      "Changes not staged for commit:", "\tmodified:   lib/a.ts", "\tdeleted:    old/b.ts", "\trenamed:    x.ts -> y.ts",
      "Untracked files:", "  (use \"git add <file>...\" to include in what will be committed)", "\tnotes/",
    ].join("\n");
    const fs = facts("git-status", raw);
    expect(texts(fs)).toEqual(expect.arrayContaining(["main", "src/mod0.ts", "lib/a.ts", "old/b.ts", "x.ts", "y.ts", "notes/"]));
    expect(fs.some((f) => f.text === "unmerged" && f.pattern)).toBe(true);
  });

  it("takes every path from a short git status, both sides of a rename", () => {
    expect(texts(facts("git-status", " M src/a.ts\nR  old.ts -> new.ts\n?? tmp/\nUU both.ts"))).toEqual(["src/a.ts", "old.ts", "new.ts", "tmp/", "both.ts"]);
  });

  it("takes a quoted path without its quotes, and a detached HEAD's commit", () => {
    expect(texts(facts("git-status", '## main...origin/main [ahead 2]\n M "my file.ts"'))).toEqual(["main", "my file.ts"]);
    expect(texts(facts("git-status", "HEAD detached at abc1234\nnothing to commit, working tree clean"))).toEqual(["abc1234"]);
  });

  it("takes a removed line that starts with -- inside a hunk, which only looks like a header", () => {
    const raw = "diff --git a/a.sql b/a.sql\n--- a/a.sql\n+++ b/a.sql\n@@ -1 +1 @@\n--- a removed sql comment\n+-- an added sql comment\n";
    expect(texts(facts("git-diff", raw))).toEqual(["a.sql", "-- a removed sql comment", "-- an added sql comment"]);
  });

  it("takes each file and each changed line of a diff, not the context or headers", () => {
    const raw = "diff --git a/src/x.ts b/src/x.ts\nindex 1..2 100644\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1,3 +1,3 @@\n keep this context line\n-const limit = 10;\n+const limit = 20;\n";
    expect(texts(facts("git-diff", raw))).toEqual(["src/x.ts", "const limit = 10;", "const limit = 20;"]);
  });

  it("takes each commit's short hash and subject from a log", () => {
    const oneline = facts("git-log", "abc1234 fix: one (#1)\ndef5678 feat: two (#2)");
    expect(texts(oneline)).toEqual(["abc1234", "fix: one (#1)", "def5678", "feat: two (#2)"]);
    const full = facts("git-log", "commit 0123456789abcdef0123456789abcdef01234567\nAuthor: A <a@x>\nDate:   Thu\n\n    fix: one (#1)\n\n    Why: body.\n");
    expect(texts(full)).toEqual(["0123456", "fix: one (#1)"]);
  });

  it("takes failing pytest ids, the exception lines and each count of the final summary", () => {
    const raw = [
      "E       AssertionError: compute(44) drifted", "E       assert 133 == 132",
      "FAILED tests/test_mod4.py::test_compute_4_4 - AssertionError: compute(44) dri...", "ERROR tests/test_billing.py",
      "=================== 19 failed, 181 passed, 1 error in 0.10s ===================",
    ].join("\n");
    expect(texts(facts("pytest", raw))).toEqual([
      "tests/test_mod4.py::test_compute_4_4", "tests/test_billing.py", "19 failed", "181 passed", "1 error", "AssertionError: compute(44) drifted",
    ]);
  });

  it("takes the counts of a quiet pytest summary, which has no banner", () => {
    expect(texts(facts("pytest", "..F.\n1 failed, 3 passed in 0.10s"))).toEqual(["1 failed", "3 passed"]);
  });

  it("takes failing cargo tests, each panic's location and message, and the result counts", () => {
    const raw = [
      "test tests::scales_input_7 ... FAILED", "test tests::scales_input_8 ... ok",
      "thread 'tests::scales_input_7' (1000) panicked at src/lib.rs:46:9:", "assertion `left == right` failed: scale(7) is off",
      "test result: FAILED. 75 passed; 5 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.10s",
    ].join("\n");
    expect(texts(facts("cargo-test", raw))).toEqual([
      "tests::scales_input_7", "src/lib.rs:46:9", "assertion `left == right` failed: scale(7) is off", "75 passed", "5 failed",
    ]);
  });

  it("takes each file a formatter would change and its summary count", () => {
    const raw = "would reformat /work/app/h1.py\nwould reformat /work/app/h9.py\n\nOh no!\n45 files would be reformatted, 75 files would be left unchanged.";
    expect(texts(facts("format", raw))).toEqual(["/work/app/h1.py", "/work/app/h9.py", "45 files would be reformatted"]);
  });

  it("takes each lint location in full or concise format, and each distinct diagnostic", () => {
    const full = "F401 [*] `os` imported but unused\n --> svc/mod0.py:1:8\n  |\nF401 [*] `os` imported but unused\n --> svc/mod1.py:1:8\nFound 2 errors.";
    expect(texts(facts("lint", full))).toEqual(["F401 [*] `os` imported but unused", "svc/mod0.py:1:8", "svc/mod1.py:1:8", "Found 2 errors."]);
    expect(texts(facts("lint", "svc/a.py:3:1: E302 expected 2 blank lines"))).toEqual(["svc/a.py:3:1"]);
  });

  it("takes each frame of a traceback, the exception and that it crashed, not the log lines before it", () => {
    const raw = "INFO batch 1: processed 17 records\nTraceback (most recent call last):\n  File \"/work/job.py\", line 48, in step_11\n    return record[\"user_id\"]\nKeyError: 'user_id'";
    expect(texts(facts("crash", raw))).toEqual(['File "/work/job.py", line 48, in step_11', "KeyError: 'user_id'", "Traceback (most recent call last):"]);
  });

  it("takes each grep match's file and line", () => {
    expect(texts(facts("grep", "src/a.ts:7:  // TODO x\nsrc/b.ts:18:  // TODO y"))).toEqual(["src/a.ts:7", "src/b.ts:18"]);
  });

  it("adds error lines whatever the family, without duplicates", () => {
    expect(texts(facts("git-diff", "fatal: bad revision 'nope'\nfatal: bad revision 'nope'"))).toEqual(["fatal: bad revision 'nope'"]);
  });

  it("takes every string value of MCP JSON as it is written there, and each line of a long one", () => {
    const raw = JSON.stringify({ results: [{ index: 0, status: "success", result: { path: "nvidia/SWE-Hero", likes: 104, content: "# Title line\nshort\nsays \"quoted\" here" } }] });
    expect(texts(facts("mcp-json", raw))).toEqual(["nvidia/SWE-Hero", "# Title line", 'says \\"quoted\\" here']);
  });

  it("keeps an MCP JSON fact a summary prints unescaped", () => {
    const [quoted] = facts("mcp-json", JSON.stringify({ text: 'says "quoted" here' }));
    expect(keptShare([quoted], 'line: says "quoted" here')).toBe(1);
  });

  it("does not turn a one-line JSON document with an error in it into one fact", () => {
    const raw = JSON.stringify({ log: "fatal error: disk full", path: "data/train.parquet" });
    expect(texts(facts("mcp-json", raw))).toEqual(["fatal error: disk full", "data/train.parquet"]);
  });

  it("takes each GitHub item's number, title, link, body lines, sha, file, changed lines and labels", () => {
    const raw = JSON.stringify([
      { number: 402, title: "fix: read back a saved result", html_url: "https://github.com/o/r/pull/402", body: "## Summary\n- reads the file", labels: [{ name: "bug-fix" }], node_id: "PR_kwDOabc", user: { login: "someone" } },
      { sha: "504bcf3c83ded17796d8fbba9211f5d09ad9b411", commit: { message: "feat: add a sample\n\nWhy: coverage." } },
      { filename: "src/hooks/post-tool-use.ts", patch: "@@ -1,2 +1,2 @@\n-const lines = null;\n+const lines = count(m);\n context" },
    ]);
    expect(texts(facts("mcp-github", raw))).toEqual([
      '"number":402', "fix: read back a saved result", "https://github.com/o/r/pull/402", "## Summary", "- reads the file", "bug-fix",
      "504bcf3", "feat: add a sample", "Why: coverage.", "src/hooks/post-tool-use.ts", "const lines = null;", "const lines = count(m);",
    ]);
  });

  it("keeps a GitHub number a summary writes as #N", () => {
    const [n] = facts("mcp-github", JSON.stringify({ number: 402 }));
    expect(keptShare([n], "#402 fix: read back")).toBe(1);
    expect(keptShare([n], "#4021 other")).toBe(0);
  });

  it("returns only facts the raw output satisfies, so pass-through keeps them all", () => {
    const raw = "On branch topic\nYou have unmerged paths.\n\tboth modified:   a.ts\n";
    const fs = facts("git-status", raw);
    expect(keptShare(fs, raw)).toBe(1);
  });
});

describe("keptShare", () => {
  const fs: Fact[] = [{ text: "src/a.ts" }, { text: "unmerged", pattern: /unmerged|conflict/i }];

  it("matches text literally and a pattern by regex", () => {
    expect(keptShare(fs, "2 conflicts; see src/a.ts")).toBe(1);
    expect(keptShare(fs, "src/a.ts changed")).toBe(0.5);
  });

  it("counts a case with no facts as fully kept", () => {
    expect(keptShare([], "anything")).toBe(1);
  });
});

describe("contradicts", () => {
  const merge = "On branch main\nYou have unmerged paths.\n\tboth modified:   a.ts\n";

  it("flags a clean claim over a merge in progress", () => {
    expect(contradicts(merge, "working tree clean")).toBe(true);
    expect(contradicts(merge, "nothing to commit")).toBe(true);
  });

  it("flags a no-errors claim over an output with an error", () => {
    expect(contradicts("error: could not apply abc", "0 errors")).toBe(true);
  });

  it("does not flag a claim the output makes itself, or a summary that makes none", () => {
    expect(contradicts("nothing to commit, working tree clean", "nothing to commit, working tree clean")).toBe(false);
    expect(contradicts(merge, "2 unmerged paths")).toBe(false);
  });

  it("flags a match count that disagrees with the matching lines shown", () => {
    const grep = "src/a.ts:7:  // TODO x\nsrc/b.ts:18:  // TODO y\nsrc/b.ts:29:  // TODO z";
    expect(contradicts(grep, "40 matches in 2 files")).toBe(true);
    expect(contradicts(grep, "3 matches in 2 files")).toBe(false);
  });

  it("does not check a match count against output that is not all match lines", () => {
    expect(contradicts("src/a.ts:7:  // TODO x\nnot a match line", "40 matches")).toBe(false);
  });

  it("does not flag a match count the output itself contains", () => {
    expect(contradicts("src/a.ts:7:  // keep 40 matches at most", "src/a.ts:7 keep 40 matches at most")).toBe(false);
  });

  it("does not flag a merge summary for naming a file the output lists", () => {
    const withPath = `${merge}\tmodified:   src/clean.ts\n`;
    expect(contradicts(withPath, "conflicts (1): a.ts\nunstaged (1): src/clean.ts")).toBe(false);
  });
});

describe("controlsBroken", () => {
  const row = (family: string, ours: number, first: number, pass = 1): FamilyScore =>
    ({ family, cases: 1, compressed: 1, facts: 4, ours, head: ours, first, pass, oursClaims: 0, headClaims: 0, raw: 100, delivered: 50, lost: 0, found: 0, shown: 0 });

  it("passes when pass-through keeps everything and the first line scores below mcp-recall in every family", () => {
    expect(controlsBroken([row("git-diff", 0.8, 0.1), row("git-log", 0.5, 0.2)])).toBeNull();
  });

  it("fails when the first line ties mcp-recall in any one family", () => {
    expect(controlsBroken([row("git-diff", 0.8, 0.1), row("git-log", 0.3, 0.3)])).toContain("git-log");
  });

  it("fails when pass-through misses a fact, which means an extractor invented it", () => {
    expect(controlsBroken([row("git-diff", 0.8, 0.1, 0.99)])).toContain("pass-through");
  });
});

describe("recovery", () => {
  const results = [
    'Found 2 results for "src/a.ts":',
    "1. recall_aaaa · Bash · 2026-10-24\n   git diff — 3 files\n   > …diff --git a/src/a.ts b/src/a.ts",
    "2. recall_bbbb · Bash · 2026-10-24\n   pytest — 1 failed",
  ].join("\n\n");

  it("finds a stored output the results list, and shows a fact its own entry prints", () => {
    expect(recovery(results, "recall_aaaa", { text: "src/a.ts" })).toEqual({ found: true, shown: true });
  });

  it("does not credit a fact another entry prints", () => {
    expect(recovery(results, "recall_bbbb", { text: "src/a.ts" })).toEqual({ found: true, shown: false });
  });

  it("finds nothing when the output is not listed, or the search has no results", () => {
    expect(recovery(results, "recall_cccc", { text: "src/a.ts" })).toEqual({ found: false, shown: false });
    expect(recovery('[recall: no results for "x"]', "recall_aaaa", { text: "x" })).toEqual({ found: false, shown: false });
  });
});

describe("the report block", () => {
  const row = (family: string, ours: number, head: number) =>
    ({ family, ours, head, cases: 1, compressed: 1, facts: 1, first: 0, pass: 1, oursClaims: 0, headClaims: 0, raw: 1, delivered: 1, lost: 0, found: 0, shown: 0 }) as FamilyScore;

  it("replaces only what lies between the markers", () => {
    const doc = `intro\n${BLOCK_BEGIN}\nold\n${BLOCK_END}\noutro\n`;
    expect(fillBlock(doc, "new")).toBe(`intro\n${BLOCK_BEGIN}\nnew\n${BLOCK_END}\noutro\n`);
  });

  it("refuses a page without the markers, so the check cannot pass on a missing block", () => {
    expect(() => fillBlock("no block here", "new")).toThrow();
  });

  it("names every family where mcp-recall keeps fewer facts than the head, or ties it", () => {
    const text = reportBlock([row("lint", 0.5, 0.2), row("format", 0.435, 0.522), row("other", 0.381, 0.381)]);
    expect(text).toContain("- format: 43.5% against the head's 52.2%");
    expect(text).toContain("- other: tied at 38.1%");
    expect(text).not.toContain("- lint");
  });
});

describe("the fact rules", () => {
  it("reach no module under src/ through static imports", () => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      for (const [, spec] of text.matchAll(/^import [^;]*? from "(\.[^"]+)";/gm)) walk(join(dirname(file), `${spec.replace(/\.ts$/, "")}.ts`));
    };
    const root = join(import.meta.dir, "../scripts/quality-facts.ts");
    walk(root);
    expect([...seen].filter((f) => f.includes("/src/"))).toEqual([]);
    expect(readFileSync(root, "utf8")).not.toMatch(/\bimport\(/);
  });
});

describe("the committed results", () => {
  it("are what the corpus produces now", () => {
    // A subprocess: the hook reads RECALL_DB_PATH once at load, so it must not share this test process.
    const r = spawnSync("bun", ["run", join(import.meta.dir, "../scripts/quality.ts"), "--check"], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  }, 60_000);

  it("name every corpus case, with its source and tool version", () => {
    const results = readFileSync(join(import.meta.dir, "../benchmark/results.md"), "utf8");
    const cases = loadCorpus();
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.source).toMatch(/^(scripted|public): /);
      expect(c.version).not.toBe("");
      expect(results).toContain(`| ${c.id} | ${c.family} |`);
    }
  });
});
