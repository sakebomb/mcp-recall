/**
 * Captures the MCP cases of the public quality benchmark (#390): real results
 * from public sources, with no credentials, so anyone can rerun the capture.
 *
 *   bun run scripts/quality-mcp.ts
 *
 * Hugging Face: the public MCP server at huggingface.co/mcp, called
 * anonymously. Claude Code hands on a tool's structuredContent when it has
 * one, which for hf_fs is JSON, so these cases exercise mcp-recall's JSON
 * fallback. Search results cannot be pinned; the README is read at a pinned
 * revision.
 *
 * GitHub: the REST API for this repository (MIT), at pinned commits and merged
 * pull requests, as an MCP server that returns the API's JSON hands it on. The
 * tool names follow the GitHub MCP server's; mcp-recall routes on their
 * mcp__github__ prefix.
 *
 * benchmark/ATTRIBUTION-MCP.md records each source and licence. Files are
 * written only once every call has succeeded.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { containsSecret } from "../src/secrets";
import type { Case } from "./quality-corpus";

const CORPUS = join(import.meta.dir, "..", "benchmark", "corpus");
const ATTRIBUTION = join(import.meta.dir, "..", "benchmark", "ATTRIBUTION-MCP.md");
const PREFIX = "mcp-";
// Above this Claude Code saves an MCP result to a file and hands on a notice instead.
const MAX_CHARS = 50_000;

const HF_SERVER = "https://huggingface.co/mcp";
const SWE_HERO = "nvidia/SWE-Hero-openhands-trajectories";
const SWE_HERO_REVISION = "150bc119e52c647216fce285fd801f16b6fd745b";

interface HfCall { id: string; tool: string; input: object; source: string }

const HF_CALLS: HfCall[] = [
  {
    id: "hf-search-datasets", tool: "hf_fs",
    input: { operations: [{ cmd: "search", args: ["hf://datasets", "agent trajectories"] }] },
    source: "Hugging Face dataset search for \"agent trajectories\"",
  },
  {
    id: "hf-search-owner", tool: "hf_fs",
    input: { operations: [{ cmd: "search", args: ["hf://datasets/nvidia"] }] },
    source: "Hugging Face datasets of one owner (nvidia)",
  },
  {
    id: "hf-cat-readme", tool: "hf_fs",
    input: { operations: [{ cmd: "cat", args: [`hf://datasets/${SWE_HERO}@${SWE_HERO_REVISION}/README.md`] }] },
    source: `the ${SWE_HERO} dataset card and metadata (CC BY 4.0) at ${SWE_HERO_REVISION.slice(0, 7)}`,
  },
  {
    id: "hf-search-models", tool: "hf_fs",
    input: { operations: [{ cmd: "search", args: ["hf://models", "coder"] }] },
    source: "Hugging Face model search for \"coder\"",
  },
];

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const REPO = { owner: "sakebomb", repo: "mcp-recall" };
const PINNED_SHA = "504bcf3c83ded17796d8fbba9211f5d09ad9b411";

interface GitHubCall { id: string; tool: string; input: object; path: string; source: string }

const GITHUB_CALLS: GitHubCall[] = [
  {
    id: "github-list-commits", tool: "list_commits", input: { ...REPO, sha: PINNED_SHA, perPage: 6 },
    path: `commits?sha=${PINNED_SHA}&per_page=6`, source: `6 commits of ${REPO.owner}/${REPO.repo} ending at ${PINNED_SHA.slice(0, 7)}`,
  },
  {
    id: "github-get-pull-request", tool: "get_pull_request", input: { ...REPO, pullNumber: 404 },
    path: "pulls/404", source: `merged pull request #404 of ${REPO.owner}/${REPO.repo}`,
  },
  {
    id: "github-pull-request-files", tool: "get_pull_request_files", input: { ...REPO, pullNumber: 402 },
    path: "pulls/402/files", source: `the changed files of merged pull request #402 of ${REPO.owner}/${REPO.repo}`,
  },
  {
    // The second page: the first quotes a PEM key header, which the secret scan rightly flags.
    id: "github-list-issues", tool: "list_issues", input: { ...REPO, state: "closed", sort: "created", direction: "asc", perPage: 5, page: 2 },
    path: "issues?state=closed&sort=created&direction=asc&per_page=5&page=2", source: `closed issues 6 to 10 by age of ${REPO.owner}/${REPO.repo}`,
  },
];

const today = () => new Date().toISOString().slice(0, 10);

/** What Claude Code hands on for an MCP result: its structuredContent when it has one, else its text. */
export function deliveredText(result: Record<string, unknown>): string {
  if (result.structuredContent !== undefined) return JSON.stringify(result.structuredContent);
  const blocks: { type?: string; text?: unknown }[] = Array.isArray(result.content) ? result.content : [];
  return blocks.filter((b) => b?.type === "text").map((b) => String(b.text)).join("\n");
}

function check(id: string, text: string): void {
  if (text.length > MAX_CHARS) throw new Error(`${id}: ${text.length} characters, over Claude Code's ${MAX_CHARS}`);
  if (containsSecret(text)) throw new Error(`${id}: holds something the secret scan flags`);
}

async function captureHf(): Promise<Case[]> {
  const client = new Client({ name: "mcp-recall-quality-capture", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(HF_SERVER)));
  try {
    const server = client.getServerVersion();
    const cases: Case[] = [];
    for (const call of HF_CALLS) {
      const result = await client.callTool({ name: call.tool, arguments: call.input as Record<string, unknown> });
      if (result.isError) throw new Error(`${call.id}: ${deliveredText(result)}`);
      const text = deliveredText(result);
      check(call.id, text);
      cases.push({
        id: `${PREFIX}${call.id}`, family: "mcp-json", command: `${call.tool} ${JSON.stringify(call.input)}`,
        source: `public: ${call.source}`, version: `${server?.name} ${server?.version}, ${today()}`,
        stdout: text, stderr: "", tool: `mcp__huggingface__${call.tool}`, input: call.input,
      });
    }
    return cases;
  } finally {
    await client.close();
  }
}

async function captureGitHub(): Promise<Case[]> {
  const cases: Case[] = [];
  for (const call of GITHUB_CALLS) {
    const url = `${GITHUB_API}/repos/${REPO.owner}/${REPO.repo}/${call.path}`;
    const r = await fetch(url, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": GITHUB_API_VERSION } });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    // Compact, as an MCP server serializes it.
    const text = JSON.stringify(await r.json());
    check(call.id, text);
    cases.push({
      id: `${PREFIX}${call.id}`, family: "mcp-github", command: `${call.tool} ${JSON.stringify(call.input)}`,
      source: `public: ${call.source}`, version: `GitHub REST API ${GITHUB_API_VERSION}, ${today()}`,
      stdout: text, stderr: "", tool: `mcp__github__${call.tool}`, input: call.input,
    });
  }
  return cases;
}

const ATTRIBUTION_TEXT = [
  "# MCP case attribution",
  "",
  `The \`${PREFIX}*\` cases in \`benchmark/corpus/\` are results captured by \`scripts/quality-mcp.ts\` from public`,
  "sources, with no credentials. Each case records the server or API version and the capture date.",
  "",
  `- \`${PREFIX}hf-*\`: the Hugging Face MCP server (${HF_SERVER}). Repository names, counts and dates in search`,
  "  results are public Hub content, which Hugging Face's terms license to every user. The dataset card is",
  `  from [${SWE_HERO}](https://huggingface.co/datasets/${SWE_HERO}) at revision \`${SWE_HERO_REVISION}\`,`,
  "  by NVIDIA, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), unchanged.",
  `- \`${PREFIX}github-*\`: the GitHub REST API (version ${GITHUB_API_VERSION}) for this repository,`,
  `  [${REPO.owner}/${REPO.repo}](https://github.com/${REPO.owner}/${REPO.repo}), MIT licensed.`,
  "",
  "These files are test data for the benchmark and are not part of the published package. The CC BY 4.0",
  "content stays under that licence.",
  "",
].join("\n");

async function main(): Promise<void> {
  const cases = [...(await captureHf()), ...(await captureGitHub())];
  mkdirSync(CORPUS, { recursive: true });
  for (const f of readdirSync(CORPUS)) if (f.startsWith(PREFIX)) rmSync(join(CORPUS, f));
  for (const c of cases) writeFileSync(join(CORPUS, `${c.id}.json`), JSON.stringify(c, null, 2) + "\n");
  writeFileSync(ATTRIBUTION, ATTRIBUTION_TEXT);
  for (const c of cases) console.log(`${c.id}: ${Buffer.byteLength(c.stdout, "utf8")} B`);
}

if (import.meta.main) await main();
