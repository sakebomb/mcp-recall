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

interface Fixture {
  label: string;
  command: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
}

const rep = (line: string, n: number) => Array.from({ length: n }, (_, i) => line.replace(/%i/g, String(i))).join("\n");

const FIXTURES: Fixture[] = [
  {
    label: "`tsc --noEmit` (60 errors)",
    command: "tsc --noEmit",
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
    stdout: Array.from({ length: 18 }, (_, i) =>
      `diff --git a/src/f${i}.ts b/src/f${i}.ts\nindex abc..def 100644\n--- a/src/f${i}.ts\n+++ b/src/f${i}.ts\n@@ -1,6 +1,8 @@\n` +
      rep(" context %i", 4) + "\n" + rep("-old %i", 5) + "\n" + rep("+new %i", 7)
    ).join("\n"),
    exit_code: 0,
  },
  {
    label: "`rg` (240 matches, 6 files)",
    command: "rg --no-heading doThing",
    stdout: rep("src/mod%i/orchestrator.ts:%i:  const r = doThing(ctx, %i)", 240).replace(/mod(\d+)/g, (_, n) => `mod${Number(n) % 6}`),
    exit_code: 0,
  },
  {
    label: "`ls -R` (deep tree)",
    command: "ls -R",
    stdout: Array.from({ length: 25 }, (_, i) => `./src/pkg${i}:\n` + rep("a%i.ts", 8) + "\n").join("\n"),
    exit_code: 0,
  },
  {
    label: "`find` (400 paths)",
    command: "find . -name '*.ts'",
    stdout: rep("./src/very/deeply/nested/path/segment/file%i.ts", 400),
    exit_code: 0,
  },
];

const fmt = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

console.log("| Command | Original | Delivered | Reduction |");
console.log("| --- | --- | --- | --- |");
for (const f of FIXTURES) {
  const output = JSON.stringify({ stdout: f.stdout ?? "", stderr: f.stderr ?? "", exit_code: f.exit_code ?? 0 });
  const handler = getBashHandler({ command: f.command });
  const { summary } = handler("Bash", output);
  const original = Buffer.byteLength((f.stdout ?? "") + (f.stderr ?? ""), "utf8");
  const delivered = Buffer.byteLength(summary, "utf8");
  const reduction = original > 0 ? ((1 - delivered / original) * 100).toFixed(1) : "0";
  console.log(`| ${f.label} | ${fmt(original)} | ${fmt(delivered)} | ${reduction}% |`);
}
console.log("\nPer-output reduction on representative fixtures. Regenerate with `bun run bench`.");
