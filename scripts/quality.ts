/**
 * Public quality benchmark, tier 1 (#390): does what Claude receives still
 * carry the facts in the output, and does it ever claim something the output
 * contradicts?
 *
 *   bun run quality            print the table
 *   bun run quality --write    rewrite benchmark/results.md
 *   bun run quality --check    exit 1 if results.md is stale or a control fails
 *
 * Every case in benchmark/corpus/ (built by scripts/quality-corpus.ts) runs
 * through four arms on identical bytes: mcp-recall's real PostToolUse hook, the
 * output's head cut to mcp-recall's delivered size, the first line alone, at
 * most 200 bytes (the sabotage control), and pass-through. MCP cases run through
 * the same hook as their MCP tool. Facts are extracted from the raw output
 * by the rules in scripts/quality-facts.ts, which never import from src/: a
 * shared parser would make a handler bug an extractor bug, and it would score
 * as a pass. Pass-through
 * must keep every fact (or an extractor invented one) and the first line must
 * score below mcp-recall in every family (or the benchmark cannot fail).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { firstLine, headBytes } from "./fidelity";
import type { Case } from "./quality-corpus";
import { contradicts, facts, keptShare, type Fact } from "./quality-facts";
import { loadHook } from "./transcripts";

const DIR = join(import.meta.dir, "..", "benchmark");
const RESULTS = join(DIR, "results.md");

/**
 * Per family: mean share of each case's facts kept, per arm, and false claims.
 * `lost` counts the facts mcp-recall's summaries cut; `found` how many of those
 * one recall__search for the fact lists the stored output for, and `shown` how
 * many it also prints.
 */
export interface FamilyScore {
  family: string; cases: number; compressed: number; facts: number;
  ours: number; head: number; first: number; pass: number;
  oursClaims: number; headClaims: number; raw: number; delivered: number;
  lost: number; found: number; shown: number;
}

/** Why the controls fail, or null when they hold in every family. */
export function controlsBroken(rows: FamilyScore[]): string | null {
  for (const r of rows) {
    if (r.pass < 1) return `pass-through kept ${pc(r.pass)} in ${r.family}; it must keep every fact`;
    if (r.first >= r.ours) return `first-line control scored ${pc(r.first)} in ${r.family}, not below mcp-recall's ${pc(r.ours)}`;
  }
  return null;
}

export function loadCorpus(dir = join(DIR, "corpus")): Case[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Case);
}

const rawOf = (c: Case) => (c.stderr ? `${c.stdout}\n${c.stderr}` : c.stdout);
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

// Compact JSON is one line, so the first line alone would be the whole output.
const FIRST_LINE_MAX = 200;
const control = (raw: string) => headBytes(firstLine(raw), FIRST_LINE_MAX);

type Hook = Awaited<ReturnType<typeof loadHook>>;

/**
 * Whether one recall__search for `fact` lists stored output `id`, and whether its
 * entry also prints the fact. Results are blank-line-separated entries, each
 * opening "N. <id> · tool".
 */
export function recovery(results: string, id: string, fact: Fact): { found: boolean; shown: boolean } {
  const entry = results.split("\n\n").find((e) => new RegExp(`^\\d+\\. ${id} ·`).test(e));
  return { found: entry !== undefined, shown: entry !== undefined && keptShare([fact], entry) === 1 };
}

const empty = (family: string): FamilyScore =>
  ({ family, cases: 0, compressed: 0, facts: 0, ours: 0, head: 0, first: 0, pass: 0, oursClaims: 0, headClaims: 0, raw: 0, delivered: 0, lost: 0, found: 0, shown: 0 });

async function score(cases: Case[]): Promise<FamilyScore[]> {
  const scratch = mkdtempSync(join(tmpdir(), "quality-"));
  try {
    const hook: Hook = await loadHook(scratch, "quality");
    const by = new Map<string, FamilyScore>();
    const lost: { family: string; id: string; fact: Fact }[] = [];
    for (const c of cases) {
      const raw = rawOf(c);
      const ours = (c.tool ? hook.deliverMcp(c.tool, c.input, c.stdout) : hook.deliver(c.command, c.stdout, c.stderr)).delivered;
      const head = ours === raw ? raw : headBytes(raw, bytes(ours));
      const fs = facts(c.family, raw);
      const r = by.get(c.family) ?? empty(c.family);
      by.set(c.family, r);
      r.cases++; r.compressed += ours === raw ? 0 : 1; r.facts += fs.length;
      r.ours += keptShare(fs, ours); r.head += keptShare(fs, head); r.first += keptShare(fs, control(raw)); r.pass += keptShare(fs, raw);
      r.oursClaims += contradicts(raw, ours) ? 1 : 0; r.headClaims += contradicts(raw, head) ? 1 : 0;
      r.raw += bytes(raw); r.delivered += bytes(ours);
      const id = ours.match(/^\[recall:(recall_[0-9a-f]+)/)?.[1];
      if (id) lost.push(...fs.filter((f) => keptShare([f], ours) < 1).map((fact) => ({ family: c.family, id, fact })));
    }
    // Searched once every case is stored, so each search runs over the whole corpus, as in a long session.
    for (const { family, id, fact } of lost) {
      const r = by.get(family)!;
      const { found, shown } = recovery(hook.search(fact.text), id, fact);
      r.lost++; r.found += found ? 1 : 0; r.shown += shown ? 1 : 0;
    }
    // Sums become means; the sort makes the table independent of corpus file order.
    return [...by.values()].sort((a, b) => a.family.localeCompare(b.family)).map((r) =>
      ({ ...r, ours: r.ours / r.cases, head: r.head / r.cases, first: r.first / r.cases, pass: r.pass / r.cases }));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const pc = (x: number) => `${(100 * x).toFixed(1)}%`;
const recovered = (r: FamilyScore) => (r.lost === 0 ? "none cut" : `${pc(r.found / r.lost)} · ${pc(r.shown / r.lost)} of ${r.lost}`);
const cell = (s: string) => s.replace(/\|/g, "\\|");

const familyTable = (rows: FamilyScore[]): string[] => [
  `| Family | Cases (compressed) | Facts | mcp-recall | Head, same size | First line (≤ ${FIRST_LINE_MAX} B) | Pass-through | False claims: mcp-recall · head | Reduction | Cut facts: found · shown |`,
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.family} | ${r.cases} (${r.compressed}) | ${r.facts} | ${pc(r.ours)} | ${pc(r.head)} | ${pc(r.first)} | ${pc(r.pass)} | ${r.oursClaims} · ${r.headClaims} | ${pc(1 - r.delivered / r.raw)} | ${recovered(r)} |`),
];

/** The page whose results block `--write` fills and `--check` verifies. */
const REPORT = join(import.meta.dir, "..", "docs", "benchmarks.md");
export const BLOCK_BEGIN = "<!-- quality:results:begin (generated by `bun run quality --write`; do not edit) -->";
export const BLOCK_END = "<!-- quality:results:end -->";

/**
 * The report's results: the family table, then every family where mcp-recall
 * keeps fewer facts than the same-size head or ties it (equal to one decimal).
 * Derived, so the page cannot keep claiming a win the numbers no longer show.
 */
export function reportBlock(rows: FamilyScore[]): string {
  const behind = rows.filter((r) => pc(r.ours) !== pc(r.head) && r.ours < r.head);
  const tied = rows.filter((r) => pc(r.ours) === pc(r.head));
  const lines = [
    ...behind.map((r) => `- ${r.family}: ${pc(r.ours)} against the head's ${pc(r.head)}`),
    ...tied.map((r) => `- ${r.family}: tied at ${pc(r.ours)}`),
  ];
  return [
    ...familyTable(rows),
    "",
    lines.length === 0
      ? "mcp-recall keeps more facts than the same-size head in every family."
      : "Families where mcp-recall keeps no more facts than the same-size head:",
    "",
    ...lines,
  ].join("\n");
}

/** `doc` with what lies between the block markers replaced by `block`. Throws when either marker is missing. */
export function fillBlock(doc: string, block: string): string {
  const start = doc.indexOf(BLOCK_BEGIN);
  const end = doc.indexOf(BLOCK_END);
  if (start < 0 || end < start) throw new Error(`the results block markers are missing from ${REPORT}`);
  return `${doc.slice(0, start + BLOCK_BEGIN.length)}\n${block}\n${doc.slice(end)}`;
}

export function render(rows: FamilyScore[], cases: Case[]): string {
  const out = [
    "# Quality benchmark results",
    "",
    "Generated by `bun run quality --write` from `benchmark/corpus/`. Do not edit by hand: CI fails when this file",
    "differs from what the corpus produces. Method, corpus and how to read it: `docs/benchmarks.md`.",
    "",
    "Facts kept: the mean, over a family's cases, of the share of each case's facts still in what Claude receives.",
    "Recovery: of the facts mcp-recall's summaries cut, the share for which one `recall__search` for the fact lists",
    "the stored output (found), and the share whose result also prints it (shown). A head cut keeps nothing to search.",
    "",
    ...familyTable(rows),
    "",
    "## Cases",
    "",
    "| Case | Family | Command | Bytes | Source | Made with |",
    "| --- | --- | --- | --- | --- | --- |",
    ...cases.map((c) => `| ${c.id} | ${c.family} | \`${cell(c.command)}\` | ${bytes(rawOf(c))} | ${cell(c.source)} | ${c.version} |`),
    "",
    "## Limits",
    "",
    "- Two kinds of case. `scripted:` cases are built to reproduce shapes that can hide a failure, one or a few per",
    "  family. `public:` cases are a fixed sample of real agent runs (`benchmark/ATTRIBUTION.md`), so their families",
    "  are whatever those agents ran: mostly pytest, plus MCP results captured from public sources",
    "  (`benchmark/ATTRIBUTION-MCP.md`): Hugging Face (`mcp-json`, which mcp-recall's JSON fallback handles) and GitHub.",
    "- MCP JSON facts are string values only, so a count or flag a summary drops is not scored. GitHub facts are the",
    "  fields an agent reads an item for (`scripts/quality-facts.ts`), not its ids or API links.",
    "- A case mcp-recall passes through whole scores 100% in both the mcp-recall and head columns.",
    "- Matching is literal (or one fixed pattern per state fact), so a correct paraphrase scores as lost.",
    "- Recovery assumes the agent searches for the cut fact's own text; it is not credited in the facts-kept columns.",
    "  The default `store.retention = \"balanced\"` stores re-runnable shell output summary-only, by design, so what its",
    "  summary cuts is recovered by running the command again, not by a search.",
    "",
  ];
  return out.join("\n");
}

async function main(): Promise<void> {
  const cases = loadCorpus();
  const rows = await score(cases);
  const text = render(rows, cases);
  const page = readFileSync(REPORT, "utf8");
  const report = fillBlock(page, reportBlock(rows));
  const mode = process.argv[2];
  if (mode === "--write") { writeFileSync(RESULTS, text); writeFileSync(REPORT, report); }
  else if (mode !== "--check") process.stdout.write(text);
  const broken = controlsBroken(rows);
  if (broken) { console.error(`controls failed: ${broken}`); process.exitCode = 1; }
  if (mode === "--check" && (readFileSync(RESULTS, "utf8") !== text || page !== report)) {
    console.error("benchmark/results.md or docs/benchmarks.md is stale: run `bun run quality --write` and commit them");
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
