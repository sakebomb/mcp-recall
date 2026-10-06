/**
 * Bash corpus: runs a fixed set of READ-ONLY commands across local git repos and
 * compresses each real output with the current handlers, per command.
 *
 *   bun run corpus ~/code            # every git repo under ~/code (depth 3)
 *   bun run corpus ~/a ~/b --limit 10
 *
 * Why: stored Bash rows are mostly summary-only, so `bun run measure` cannot
 * replay them through current code. This generates fresh, real outputs instead.
 *
 * Mirrors the PostToolUse hook: the same response shape Claude Code sends
 * ({stdout, stderr, interrupted, isImage, noOutputExpected}, no exit code), the
 * secret scan (a match is skipped, as the hook does), an empty summary falls back
 * to genericHandler, and output that does not get smaller passes through
 * uncompressed. stdout/stderr are capped at 30,000 chars; 99.7% of real stored
 * Bash outputs are within that.
 *
 * Wrapped variants (`timeout 30 …`, `cd <repo> && …`) show whether a wrapper
 * hides the command from command-aware routing. Prints aggregates only, never
 * output content. Makes no network calls and writes nothing.
 */
import { readdirSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";
import { getHandler } from "../src/handlers/index";
import { genericHandler } from "../src/handlers/generic";
import { findSecrets } from "../src/secrets";
import { extractText } from "../src/handlers/types";

const OUTPUT_CAP = 30_000;
const COMMAND_TIMEOUT_MS = 20_000;
const MAX_DEPTH = 3;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "target", ".venv", "venv", "vendor", ".next"]);
const EXCLUDES = [...SKIP_DIRS].map((d) => `--exclude-dir=${d}`).join(" ");
const FIND_PRUNE = `\\( ${[...SKIP_DIRS].map((d) => `-name ${d}`).join(" -o ")} \\) -prune -o`;

interface Spec {
  label: string;
  command: (repo: string) => string;
}

const BASE: Spec[] = [
  { label: "git log --oneline", command: () => "git log --oneline -300" },
  { label: "git log --stat", command: () => "git log --stat -15" },
  { label: "git log -p", command: () => "git log -p -3" },
  { label: "git show", command: () => "git show HEAD" },
  { label: "git diff", command: () => "git diff HEAD~5 HEAD" },
  { label: "git status", command: () => "git status" },
  { label: "git branch -a", command: () => "git branch -a" },
  { label: "grep -rn", command: () => `grep -rn ${EXCLUDES} -I "import" .` },
  { label: "grep -rn (rare term)", command: () => `grep -rn ${EXCLUDES} -I "TODO" .` },
  { label: "find -type f", command: () => `find . ${FIND_PRUNE} -type f -print` },
  { label: "ls -la", command: () => "ls -la" },
  { label: "ls -R", command: (repo) => `ls -R ${existsSync(join(repo, "src")) ? "src" : "."}` },
  { label: "cat README", command: () => "cat README.md" },
  { label: "sed -n (largest file)", command: () => "sed -n '1,400p' \"$(git ls-files | xargs -d '\\n' ls -S 2>/dev/null | head -1)\"" },
  { label: "head -100", command: () => "head -100 \"$(git ls-files | head -1)\"" },
  { label: "wc -l", command: () => "git ls-files | head -300 | xargs -d '\\n' wc -l" },
];

// The same commands behind wrappers that appear in real sessions.
const WRAPPED_BASES = ["grep -rn", "git log --stat", "git diff", "find -type f", "ls -R"];
const SPECS: Spec[] = [
  ...BASE,
  ...BASE.filter((s) => WRAPPED_BASES.includes(s.label)).flatMap((s) => [
    { label: `${s.label} [timeout]`, command: (r: string) => `timeout 30 ${s.command(r)}` },
    { label: `${s.label} [cd &&]`, command: (r: string) => `cd ${JSON.stringify(r)} && ${s.command(r)}` },
  ]),
];

function discoverRepos(root: string, depth = 0, found: string[] = []): string[] {
  // Keep descending past a repo: nested repos (a workspace that is itself a
  // repo, holding project repos) are separate projects.
  if (existsSync(join(root, ".git"))) found.push(root);
  if (depth >= MAX_DEPTH) return found;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return found;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const path = join(root, name);
    try {
      if (statSync(path).isDirectory()) discoverRepos(path, depth + 1, found);
    } catch {
      // unreadable entry
    }
  }
  return found;
}

function run(command: string, cwd: string): { stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["bash", "-c", command], { cwd, timeout: COMMAND_TIMEOUT_MS, stdout: "pipe", stderr: "pipe" });
  const cap = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array()).slice(0, OUTPUT_CAP);
  return { stdout: cap(proc.stdout), stderr: cap(proc.stderr) };
}

interface Row {
  calls: number;
  passthrough: number;
  original: number;
  delivered: number;
  handlers: Set<string>;
}

const rows = new Map<string, Row>();
let secretSkips = 0;
let emptyOutputs = 0;

/** Compress one output exactly as the hook would; returns null when the hook would skip it. */
function compress(command: string, stdout: string, stderr: string) {
  const response = { stdout, stderr, interrupted: false, isImage: false, noOutputExpected: false };
  if (findSecrets(extractText(response)).length > 0) return null;
  const handler = getHandler("Bash", response, { command });
  let { summary, originalSize } = handler("Bash", response);
  let name = handler.name || "anonymous";
  if (summary.trim() === "" && originalSize > 0) {
    ({ summary, originalSize } = genericHandler("Bash", response));
    name = `${name}->genericHandler`;
  }
  const summarySize = Buffer.byteLength(summary, "utf8");
  return { name, originalSize, delivered: Math.min(summarySize, originalSize), passthrough: summarySize >= originalSize };
}

function record(repo: string, spec: Spec): void {
  const label = spec.label;
  const command = spec.command(repo);
  const { stdout, stderr } = run(command, repo);
  if (stdout.trim() === "" && stderr.trim() === "") {
    emptyOutputs++;
    return;
  }
  const result = compress(command, stdout, stderr);
  if (!result) {
    secretSkips++;
    return;
  }
  const row = rows.get(label) ?? { calls: 0, passthrough: 0, original: 0, delivered: 0, handlers: new Set<string>() };
  row.calls++;
  row.original += result.originalSize;
  row.delivered += result.delivered;
  if (result.passthrough) row.passthrough++;
  row.handlers.add(result.name);
  rows.set(label, row);
}

const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const roots = limitAt >= 0 ? args.filter((_, i) => i !== limitAt && i !== limitAt + 1) : args;
const repos = (roots.length ? roots : ["."]).flatMap((r) => discoverRepos(resolve(r))).slice(0, limit);
if (repos.length === 0) {
  console.log("No git repositories found.");
  process.exit(0);
}

const started = Date.now();
for (const repo of repos) for (const spec of SPECS) record(repo, spec);

const pct = (r: { original: number; delivered: number }) => `${(100 * (1 - r.delivered / r.original)).toFixed(1)}%`;
const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`);
const total = [...rows.values()].reduce(
  (t, r) => ({ calls: t.calls + r.calls, passthrough: t.passthrough + r.passthrough, original: t.original + r.original, delivered: t.delivered + r.delivered }),
  { calls: 0, passthrough: 0, original: 0, delivered: 0 },
);

console.log(`Corpus ${new Date().toISOString().slice(0, 10)} · ${repos.length} repos · ${total.calls.toLocaleString("en-US")} outputs · ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(`Skipped: ${emptyOutputs} empty outputs, ${secretSkips} secret-scan matches (the hook would not store them).\n`);
console.log(`All outputs: ${kb(total.original)} -> ${kb(total.delivered)} = ${pct(total)} (pass-throughs count as 0% saved)\n`);
console.log("| Command | Outputs | Passed through | Original | Delivered | Reduction | Handler |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const [label, r] of [...rows].sort(([, a], [, b]) => a.delivered / a.original - b.delivered / b.original)) {
  console.log(`| \`${label}\` | ${r.calls} | ${r.passthrough} | ${kb(r.original)} | ${kb(r.delivered)} | ${pct(r)} | ${[...r.handlers].join(", ")} |`);
}
