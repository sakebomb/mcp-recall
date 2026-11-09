#!/usr/bin/env bun
/**
 * demo/demo.ts: the scenes `demo.tape` records into `demo.gif`.
 *
 * Every scene runs real output from the public benchmark corpus (benchmark/corpus/)
 * through the real PostToolUse hook and recall__* tools, on a throwaway store, so
 * the GIF shows what mcp-recall does today rather than pre-written text. Re-record
 * after a handler change and the GIF follows.
 *
 * Usage: bun demo/demo.ts raw | claude | retrieve <query> | stats
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadHook } from "../scripts/transcripts";

const ROOT = join(import.meta.dir, "..");
const CORPUS = join(ROOT, "benchmark/corpus");
const CASE = "mcp-github-list-issues";

const DIM = "\x1b[2m", BOLD = "\x1b[1m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const WIDTH = Math.min(process.stdout.columns || 110, 110);

interface Case { id: string; tool?: string; input?: unknown; command: string; stdout: string; stderr: string }

const load = (id: string): Case => JSON.parse(readFileSync(join(CORPUS, `${id}.json`), "utf8"));
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const tokens = (n: number) => Math.floor(n / 4).toLocaleString(); // the same estimate recall__stats uses

/** Wraps to the terminal width and keeps the first `max` rows. */
function rows(text: string, max: number): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    for (let i = 0; i < Math.max(line.length, 1); i += WIDTH) out.push(line.slice(i, i + WIDTH));
  }
  return out.length > max ? [...out.slice(0, max), `${DIM}… ${out.length - max} more rows${RESET}`] : out;
}

async function withStore<T>(fn: (hook: Awaited<ReturnType<typeof loadHook>>, scratch: string) => Promise<T> | T): Promise<T> {
  const scratch = mkdtempSync(join(tmpdir(), "mcp-recall-demo-"));
  try {
    return await fn(await loadHook(scratch, "demo", ROOT), scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function raw(): void {
  const c = load(CASE);
  const bytes = Buffer.byteLength(c.stdout);
  console.log(`${BOLD}${c.tool}${RESET} returned ${YELLOW}${kb(bytes)}${RESET} (~${tokens(bytes)} tokens) of JSON:\n`);
  console.log(rows(c.stdout, 9).join("\n"));
}

async function claude(): Promise<void> {
  const c = load(CASE);
  const delivered = await withStore((hook) => hook.deliverMcp(c.tool!, c.input, c.stdout).delivered);
  const [header, ...body] = delivered.split("\n");
  console.log(`${GREEN}${header}${RESET}`);
  console.log(rows(body.join("\n"), 14).join("\n"));
  console.log(`\n${BOLD}Claude reads ${GREEN}~${tokens(Buffer.byteLength(delivered))} tokens${RESET}${BOLD} instead of ${YELLOW}~${tokens(Buffer.byteLength(c.stdout))}${RESET}${BOLD}.${RESET}`);
}

async function retrieve(query: string): Promise<void> {
  const c = load(CASE);
  await withStore(async (hook, scratch) => {
    const id = hook.deliverMcp(c.tool!, c.input, c.stdout).delivered.match(/^\[recall:(recall_[0-9a-f]+)/)?.[1];
    const { toolRetrieve } = await import(join(ROOT, "src/tools"));
    const { getDb } = await import(join(ROOT, "src/db/index"));
    const [header, ...body] = toolRetrieve(getDb(join(scratch, "store.db")), { id, query }).split("\n");
    console.log(`${GREEN}${header}${RESET}`);
    // Colour only: the excerpt's text is printed exactly as recall__retrieve returned it.
    const terms = query.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const hit = new RegExp(`(${terms.join("|")})`, "gi");
    console.log(rows(body.join("\n").trim(), 6).map((r) => r.replace(hit, `${BOLD}${YELLOW}$1${RESET}`)).join("\n"));
  });
}

async function stats(): Promise<void> {
  await withStore(async (hook, scratch) => {
    const files = readdirSync(CORPUS).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const c = load(f.replace(/\.json$/, ""));
      if (c.tool) hook.deliverMcp(c.tool, c.input, c.stdout);
      else hook.deliver(c.command, c.stdout, c.stderr);
    }
    const { toolStats } = await import(join(ROOT, "src/tools"));
    const { getDb } = await import(join(ROOT, "src/db/index"));
    const { getProjectKey } = await import(join(ROOT, "src/project-key"));
    const report: string = toolStats(getDb(join(scratch, "store.db")), getProjectKey(scratch));
    // The headline and the per-tool table; the rest of the report is per-command detail.
    // Session days count real days of use, always 0 on a store filled in one go.
    const lines = report.split("\n").filter((l) => !l.trimStart().startsWith("Session days"));
    const end = lines.findIndex((l) => l.startsWith("By Bash command"));
    console.log(`${DIM}${files.length} real outputs from the public corpus; small ones pass through whole.${RESET}\n`);
    const shown = lines.slice(0, end === -1 ? undefined : end).join("\n").trimEnd();
    console.log(shown.replace(/^(\s*(?:Saved|~Tokens saved):.*)$/gm, `${BOLD}${GREEN}$1${RESET}`));
  });
}

const [scene, ...args] = process.argv.slice(2);
switch (scene) {
  case "raw": raw(); break;
  case "claude": await claude(); break;
  case "retrieve": await retrieve(args.join(" ") || "LFU expiry"); break;
  case "stats": await stats(); break;
  default:
    console.error("usage: bun demo/demo.ts raw | claude | retrieve <query> | stats");
    process.exit(1);
}
