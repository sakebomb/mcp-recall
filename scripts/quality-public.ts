/**
 * Draws the public sample of the quality benchmark (#390): real shell outputs
 * from coding-agent trajectories someone else recorded, so the corpus is not
 * only cases written to find mcp-recall's gaps.
 *
 *   bun run scripts/quality-public.ts
 *
 * Source: nvidia/SWE-Hero-openhands-trajectories (CC BY 4.0), whose tasks come
 * only from MIT, Apache-2.0 and BSD repositories and whose rows name the
 * repository and its licence; benchmark/ATTRIBUTION.md lists every case. The
 * rules are fixed before any arm runs: 100 trajectories at even offsets, and
 * from each the first execute_bash output between MIN_CHARS and MAX_CHARS
 * once OpenHands' trailer lines are removed, that holds at least one fact and
 * no secret. Rows are read from the dataset server, which serves the current
 * revision only, so a run against a dataset that has moved past REVISION
 * fails instead of mixing revisions.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { containsSecret } from "../src/secrets";
import type { Case } from "./quality-corpus";
import { facts } from "./quality-facts";

const DATASET = "nvidia/SWE-Hero-openhands-trajectories";
const REVISION = "150bc119e52c647216fce285fd801f16b6fd745b";
const ROWS = 34_269;
const TRAJECTORIES = 100;
// Smaller outputs pass through mcp-recall whole; above 30,000 characters Claude
// Code saves Bash output to a file, which this benchmark does not model.
const MIN_CHARS = 4096;
const MAX_CHARS = 30_000;
const PREFIX = "swe-hero-";
const CORPUS = join(import.meta.dir, "..", "benchmark", "corpus");
const ATTRIBUTION = join(import.meta.dir, "..", "benchmark", "ATTRIBUTION.md");

interface Message { role: string; content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] | null }
interface Row { repo: string; license: string; trajectory_id: string; trajectory: Message[] }

// What OpenHands appends to a command's output; Claude Code's Bash result has none of it.
const TRAILER_RE = /\n?\[(?:The command completed with exit code -?\d+\.|Current working directory: [^\]]*|Python interpreter: [^\]]*)\]\s*$/;

export function stripTrailer(content: string): string {
  let out = content;
  for (let prev = ""; prev !== out; ) { prev = out; out = out.replace(TRAILER_RE, ""); }
  return out;
}

// The family is read from the command alone, by rules of this file, never by mcp-recall's router.
const FAMILIES: [RegExp, string][] = [
  [/^git\s+status\b/, "git-status"], [/^git\s+(diff|show)\b/, "git-diff"], [/^git\s+log\b/, "git-log"],
  [/^(python3?\s+-m\s+)?pytest\b/, "pytest"], [/^cargo\s+test\b/, "cargo-test"],
  [/^(grep|egrep|rg|git\s+grep)\s/, "grep"], [/^(ruff|flake8|pylint|mypy)\b/, "lint"], [/^(black|isort)\b/, "format"],
  [/^python3?\s/, "python"],
];

/** The command that ran, without the `cd … &&`, `timeout N` and `VAR=x` wrappers agents put in front. */
export function bareCommand(command: string): string {
  let c = command.trim();
  for (let prev = ""; prev !== c; ) {
    prev = c;
    c = c.replace(/^cd\s+\S+\s*&&\s*/, "").replace(/^timeout\s+\d+[smh]?\s+/, "").replace(/^[A-Z_][A-Z0-9_]*=\S*\s+/, "");
  }
  return c;
}

export const familyOf = (command: string): string => FAMILIES.find(([re]) => re.test(bareCommand(command)))?.[1] ?? "other";

/** Each execute_bash call paired with its output: tool messages answer the calls before them, in order. */
export function bashOutputs(trajectory: Message[]): { command: string; output: string }[] {
  const out: { command: string; output: string }[] = [];
  let pending: (string | null)[] = [];
  for (const m of trajectory) {
    if (m.role === "assistant") {
      pending = (m.tool_calls ?? []).map((c) => (c.function.name === "execute_bash" ? (JSON.parse(c.function.arguments).command ?? null) : null));
    } else if (m.role === "tool") {
      const command = pending.shift();
      if (typeof command === "string" && command) out.push({ command, output: stripTrailer(m.content ?? "") });
    }
  }
  return out;
}

/** The first output of `row` the sample takes, or null when none qualifies. */
export function pick(row: Row): { command: string; output: string; family: string } | null {
  for (const { command, output } of bashOutputs(row.trajectory)) {
    if (output.length < MIN_CHARS || output.length > MAX_CHARS) continue;
    const family = familyOf(command);
    if (facts(family, output).length === 0 || containsSecret(output)) continue;
    return { command, output, family };
  }
  return null;
}

const PAUSE_MS = 1_000;
const RETRIES = 6;

/** GET `url` as JSON, waiting out the dataset server's rate limit (HTTP 429) with backoff. */
async function fetchJson(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status !== 429 || attempt === RETRIES) throw new Error(`${url}: HTTP ${r.status}`);
    const wait = Number(r.headers.get("retry-after")) * 1000 || PAUSE_MS * 2 ** (attempt + 2);
    await Bun.sleep(wait);
  }
}

async function main(): Promise<void> {
  const meta = await fetchJson(`https://huggingface.co/api/datasets/${DATASET}`);
  if (meta.sha !== REVISION) throw new Error(`${DATASET} is at ${meta.sha}, not ${REVISION}: review the change before moving REVISION`);
  const cases: Case[] = [];
  const credits: string[] = [];
  const step = Math.floor(ROWS / TRAJECTORIES);
  for (let i = 0; i < TRAJECTORIES; i++) {
    const offset = i * step;
    if (i > 0) await Bun.sleep(PAUSE_MS);
    const page = await fetchJson(`https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=${offset}&length=1`);
    const row = page.rows[0].row as Row;
    const taken = pick(row);
    if (!taken) continue;
    const id = `${PREFIX}${String(offset).padStart(5, "0")}`;
    cases.push({
      id, family: taken.family, command: taken.command, version: `${DATASET}@${REVISION.slice(0, 7)}`,
      source: `public: SWE-Hero row ${offset}, trajectory ${row.trajectory_id}, ${row.repo} (${row.license})`,
      stdout: taken.output, stderr: "",
    });
    credits.push(`| ${id} | ${row.trajectory_id} | [${row.repo}](https://github.com/${row.repo}) | ${row.license} |`);
  }
  // Only once every row is in: a run that fails partway leaves the corpus as it was.
  mkdirSync(CORPUS, { recursive: true });
  for (const f of readdirSync(CORPUS)) if (f.startsWith(PREFIX)) rmSync(join(CORPUS, f));
  for (const c of cases) writeFileSync(join(CORPUS, `${c.id}.json`), JSON.stringify(c, null, 2) + "\n");
  writeFileSync(ATTRIBUTION, attribution(credits));
  console.log(`${cases.length} of ${TRAJECTORIES} trajectories gave a case`);
}

function attribution(credits: string[]): string {
  return [
    "# Corpus attribution",
    "",
    `The \`${PREFIX}*\` cases in \`benchmark/corpus/\` are command outputs from`,
    `[${DATASET}](https://huggingface.co/datasets/${DATASET}) at revision \`${REVISION}\`,`,
    "by NVIDIA, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). OpenHands' trailer lines",
    "(exit code, working directory, interpreter) are removed; the outputs are otherwise unchanged.",
    "",
    "The outputs quote code from the repositories the tasks were drawn from, each under its own",
    "licence below. Ludwig, Ahmad, Majumdar and Ginsburg, *From SWE-ZERO to SWE-HERO*,",
    "[arXiv:2604.01496](https://arxiv.org/abs/2604.01496).",
    "",
    "These files are not covered by this repository's MIT licence: they stay under CC BY 4.0 and the",
    "licences listed. They are test data for the benchmark and are not part of the published package.",
    "",
    "Regenerate with `bun run scripts/quality-public.ts`.",
    "",
    "| Case | Trajectory | Repository | Licence |",
    "| --- | --- | --- | --- |",
    ...credits,
    "",
  ].join("\n");
}

if (import.meta.main) await main();
