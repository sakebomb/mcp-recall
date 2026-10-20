/**
 * Compression benchmark — runs representative command outputs through the
 * command-aware Bash handlers and prints a per-output reduction table.
 *
 *   bun run bench
 *
 * These are PER-OUTPUT compression ratios on representative fixtures, not a
 * whole-session token figure (most outputs are smaller; the fallback already
 * caps). Use the numbers to refresh the README savings table; use
 * `recall__stats` on a real session for actual session savings.
 */
import { getBashHandler } from "../src/handlers/bash";

export interface Fixture {
  label: string;
  command: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  /** `rtk pipe -f` filter for the same output, for scripts/compare-rtk.ts. */
  rtk?: string;
  /** Facts a summary must still carry for Claude (regex sources), checked by scripts/compare-rtk.ts. */
  keep?: string[];
}

const rep = (line: string, n: number) => Array.from({ length: n }, (_, i) => line.replace(/%i/g, String(i))).join("\n");

const DIFF_18_FILES = Array.from({ length: 18 }, (_, i) =>
  `diff --git a/src/f${i}.ts b/src/f${i}.ts\nindex abc..def 100644\n--- a/src/f${i}.ts\n+++ b/src/f${i}.ts\n@@ -1,9 +1,11 @@\n` +
  rep(" context %i", 4) + "\n" + rep("-old %i", 5) + "\n" + rep("+new %i", 7)
).join("\n");
const RG_240_MATCHES = rep("src/mod%i/orchestrator.ts:%i:  const r = doThing(ctx, %i)", 240)
  .replace(/mod(\d+)/g, (_, n) => `mod${Number(n) % 6}`);

export const FIXTURES: Fixture[] = [
  {
    label: "`tsc --noEmit` (60 errors)",
    command: "tsc --noEmit",
    rtk: "tsc",
    keep: ["60 errors", "file59\\.ts"],
    stdout:
      rep("src/module%i/file%i.ts(%i,10): error TS2345: Argument of type 'Foo%i' is not assignable to parameter of type 'Bar%i'.", 60) +
      "\n\nFound 60 errors in 60 files.\n" +
      rep("  at Object.<anonymous> (/repo/node_modules/typescript/lib/tsc.js:%i:40)", 300),
    exit_code: 2,
  },
  {
    label: "`cargo build` (typical failure)",
    command: "cargo build",
    stderr:
      "   Compiling demo v0.1.0 (/home/u/demo)\n" +
      rep("error[E0308]: mismatched types\n  --> src/mod%i.rs:%i:20\n   |\n%i |     let x: u32 = \"hi\";\n   |            ---   ^^^^ expected `u32`, found `&str`\n   |", 12) +
      "\nerror: aborting due to 12 previous errors\nerror: could not compile `demo` (bin \"demo\") due to 12 previous errors",
    exit_code: 101,
  },
  {
    label: "`git --no-pager diff` (18 files)",
    command: "git --no-pager diff",
    rtk: "git-diff",
    keep: ["f17\\.ts", "\\+new 6"],
    stdout: DIFF_18_FILES,
    exit_code: 0,
  },
  {
    // The same output run over ssh: routed by the remote command since #339.
    label: "`ssh host 'cd /srv && git diff'` (18 files)",
    command: "ssh -p 22 build-host 'cd /srv/app && git --no-pager diff'",
    stdout: DIFF_18_FILES,
    exit_code: 0,
  },
  {
    label: "`rg` (240 matches, 6 files)",
    command: "rg --no-heading doThing",
    rtk: "grep",
    keep: ["240 matches", "mod5/"],
    stdout: RG_240_MATCHES,
    exit_code: 0,
  },
  {
    label: "`ssh host rg` (240 matches, 6 files)",
    command: "ssh build-host rg --no-heading doThing",
    stdout: RG_240_MATCHES,
    exit_code: 0,
  },
  {
    label: "`ls -R` (deep tree)",
    command: "ls -R",
    stdout: Array.from({ length: 25 }, (_, i) => `./src/pkg${i}:\n` + rep("a%i.ts", 8) + "\n").join("\n"),
    exit_code: 0,
  },
  {
    // Shell fallback. Repeats collapse before the 25-line cap since #340, so the
    // last two messages are shown at all; before, the head held only retries.
    label: "`journalctl -n 500` (retry loop, 3 messages)",
    command: "journalctl -u app -n 500 --no-pager",
    rtk: "log",
    keep: ["FATAL: disk full"],
    stdout: [
      ...Array.from({ length: 300 }, (_, i) => `Oct 19 12:${String(10 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")} host app[812]: connection reset by peer, retrying in 1s`),
      ...Array.from({ length: 199 }, (_, i) => `Oct 19 12:15:${String(i % 60).padStart(2, "0")} host app[812]: INFO queue depth 0`),
      "Oct 19 12:16:00 host app[812]: FATAL: disk full on /var/lib/app",
    ].join("\n"),
    exit_code: 0,
  },
  {
    // A unit failing as systemd reports it: no line says "error", so a filter
    // that classifies by keyword can count none. Modelled on a recorded journal.
    label: "`journalctl -b -1` (a unit fails, no line says \"error\")",
    command: "journalctl -b -1 --no-pager",
    stdout: [
      ...Array.from({ length: 30 }, (_, i) => `Oct 05 17:16:${String(i % 20).padStart(2, "0")} host systemd[1]: Started session-${i}.scope - Session ${i} of User u.`),
      "Oct 05 17:16:21 host systemd[1]: cups-browsed.service: Main process exited, code=exited, status=1/FAILURE",
      "Oct 05 17:16:21 host systemd[1]: cups-browsed.service: Failed with result 'exit-code'.",
      ...Array.from({ length: 10 }, (_, i) => `Oct 05 17:16:22 host kernel: usb 1-${i}: new high-speed USB device number ${i}`),
    ].join("\n"),
    exit_code: 0,
    rtk: "log",
    keep: ["status=1", "Failed with result"],
  },
  {
    // One minified line: `head` caps lines, not width, so before #349 the whole
    // 180 KB line was delivered. Now it is clipped with the elided count.
    label: "`grep -n` piped to `head` (one 180 KB minified line)",
    command: "grep -n sourceMappingURL dist/app.min.js | head",
    rtk: "grep",
    stdout: "1:" + Array.from({ length: 6000 }, (_, i) => `function a${i}(b){return b+${i}};`).join(""),
    exit_code: 0,
  },
  {
    label: "`find` (400 paths)",
    command: "find . -name '*.ts'",
    rtk: "find",
    keep: ["400", "file399\\.ts"],
    stdout: rep("./src/very/deeply/nested/path/segment/file%i.ts", 400),
    exit_code: 0,
  },
];

export const fmt = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** The summary mcp-recall's handler makes for a fixture, and the original's size. */
export function summarize(f: Fixture): { summary: string; original: number } {
  const output = JSON.stringify({ stdout: f.stdout ?? "", stderr: f.stderr ?? "", exit_code: f.exit_code ?? 0 });
  const { summary } = getBashHandler({ command: f.command })("Bash", output);
  return { summary, original: Buffer.byteLength((f.stdout ?? "") + (f.stderr ?? ""), "utf8") };
}

if (import.meta.main) {
  console.log("| Command | Original | Delivered | Reduction |");
  console.log("| --- | --- | --- | --- |");
  for (const f of FIXTURES) {
    const { summary, original } = summarize(f);
    const delivered = Buffer.byteLength(summary, "utf8");
    const reduction = original > 0 ? ((1 - delivered / original) * 100).toFixed(1) : "0";
    console.log(`| ${f.label} | ${fmt(original)} | ${fmt(delivered)} | ${reduction}% |`);
  }
  console.log("\nPer-output reduction on representative fixtures. Regenerate with `bun run bench`.");
}
