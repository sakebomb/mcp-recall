/**
 * Store measurement: real savings across every project store on this machine,
 * with the sample size printed next to each figure.
 *
 *   bun run measure
 *
 * Two figures, both from the product's own code rather than ad-hoc SQL:
 *
 *  1. Recorded savings: `getStats` per project (recall__note excluded, as in
 *     recall__stats). This is what the installed versions actually delivered,
 *     so rows written by an older release carry that release's compression.
 *  2. MCP replay: every stored MCP row with a retained body, re-compressed by
 *     the current handlers. This is what this checkout would deliver on the
 *     same real calls. Bash rows are not replayed: summary-only rows
 *     (store.retention) have no body to replay, so the result would be biased.
 *
 * Opens every store read-only and prints aggregates only, never stored content,
 * so the output is safe to share. One machine's store is one user's workload:
 * report it as such.
 */
import { Database } from "bun:sqlite";
import { readdirSync } from "fs";
import { join } from "path";
import { dataDir } from "../src/db/schema";
import { getStats } from "../src/db/analytics";
import { getHandler } from "../src/handlers/index";

interface Totals {
  original: number;
  summary: number;
  calls: number;
}

const empty = (): Totals => ({ original: 0, summary: 0, calls: 0 });
const add = (t: Totals, original: number, summary: number, calls: number) => {
  t.original += original;
  t.summary += summary;
  t.calls += calls;
};
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
const pct = (t: Totals) => (t.original > 0 ? `${(100 * (1 - t.summary / t.original)).toFixed(1)}%` : "n/a");
const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);

// Same note-excluding totals as getStats, for stores that predate the
// full_retained column getStats reads (never reopened since that migration).
const LEGACY_TOTALS = `
  SELECT COALESCE(SUM(original_size), 0) AS total_original_bytes,
         COALESCE(SUM(summary_size), 0) AS total_summary_bytes,
         COUNT(*) AS total_items
  FROM stored_outputs WHERE project_key = ? AND tool_name != 'recall__note'`;

function projectTotals(db: Database, projectKey: string) {
  try {
    return getStats(db, projectKey);
  } catch {
    return db.query(LEGACY_TOTALS).get(projectKey) as ReturnType<typeof getStats>;
  }
}

const emptySummaries = new Map<string, number>();

const tally = (map: Map<string, Totals>, key: string, original: number, summary: number, calls: number) => {
  const t = map.get(key) ?? empty();
  add(t, original, summary, calls);
  map.set(key, t);
};

function replayMcp(db: Database, replay: Totals, byTool: Map<string, Totals>): void {
  const rows = db
    .query("SELECT tool_name, full_content, original_size FROM stored_outputs WHERE tool_name LIKE 'mcp__%' AND length(full_content) > 0")
    .all() as { tool_name: string; full_content: string; original_size: number }[];
  for (const row of rows) {
    let output: unknown = row.full_content;
    try {
      output = JSON.parse(row.full_content);
    } catch {
      // stored as plain text
    }
    const { summary } = getHandler(row.tool_name, output)(row.tool_name, output);
    const delivered = Buffer.byteLength(summary, "utf8");
    // An empty summary is a handler failure, not perfect compression: Claude
    // would see nothing. Count it so it cannot pass as a 100% row.
    if (summary.trim() === "") emptySummaries.set(row.tool_name, (emptySummaries.get(row.tool_name) ?? 0) + 1);
    add(replay, row.original_size, delivered, 1);
    tally(byTool, row.tool_name, row.original_size, delivered, 1);
  }
}

/**
 * Recorded Bash savings per command family. `command_fp` is the first word of
 * the command line, so wrappers (cd, timeout, for, ssh) hide the real command.
 */
function tallyBash(db: Database, byCommand: Map<string, Totals>): void {
  let rows: { fp: string; o: number; s: number; n: number }[];
  try {
    rows = db
      .query(`SELECT COALESCE(command_fp, 'unknown') AS fp, SUM(original_size) AS o,
                     SUM(summary_size) AS s, COUNT(*) AS n
              FROM stored_outputs WHERE tool_name = 'Bash' GROUP BY fp`)
      .all() as typeof rows;
  } catch {
    return; // store predates command_fp
  }
  for (const r of rows) tally(byCommand, r.fp, r.o, r.s, r.n);
}

const size = (b: number) => (b >= 1048576 ? mb(b) : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`);

function printRanked(title: string, map: Map<string, Totals>, minCalls: number, limit: number): void {
  const ranked = [...map]
    .filter(([, t]) => t.calls >= minCalls)
    .sort(([, a], [, b]) => b.original - a.original)
    .slice(0, limit)
    .sort(([, a], [, b]) => a.summary / a.original - b.summary / b.original);
  console.log(`\n${title}\n`);
  console.log("| Name | Calls | Original | Delivered | Reduction |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const [name, t] of ranked) {
    console.log(`| \`${name}\` | ${t.calls.toLocaleString("en-US")} | ${size(t.original)} | ${size(t.summary)} | ${pct(t)} |`);
  }
}

const dir = dataDir();
const recorded = empty();
const families: Record<string, Totals> = { Bash: empty(), MCP: empty() };
const replay = empty();
const byTool = new Map<string, Totals>();
const byCommand = new Map<string, Totals>();
let stores = 0;
let projects = 0;
let first = Infinity;
let last = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".db"))) {
  let db: Database;
  try {
    db = new Database(join(dir, file), { readonly: true });
    db.query("SELECT 1 FROM stored_outputs LIMIT 1").get();
  } catch {
    continue; // not a readable store
  }
  stores++;
  for (const { project_key } of db.query("SELECT DISTINCT project_key FROM stored_outputs").all() as { project_key: string }[]) {
    const s = projectTotals(db, project_key);
    add(recorded, s.total_original_bytes, s.total_summary_bytes, s.total_items);
    if (s.total_items > 0) projects++;
  }
  const familyRows = db
    .query(`SELECT CASE WHEN tool_name = 'Bash' THEN 'Bash' ELSE 'MCP' END AS fam,
                   SUM(original_size) AS o, SUM(summary_size) AS s, COUNT(*) AS n,
                   MIN(created_at) AS lo, MAX(created_at) AS hi
            FROM stored_outputs WHERE tool_name != 'recall__note'
              AND (tool_name = 'Bash' OR tool_name LIKE 'mcp__%') GROUP BY fam`)
    .all() as { fam: string; o: number; s: number; n: number; lo: number; hi: number }[];
  for (const r of familyRows) {
    add(families[r.fam]!, r.o, r.s, r.n);
    first = Math.min(first, r.lo);
    last = Math.max(last, r.hi);
  }
  replayMcp(db, replay, byTool);
  tallyBash(db, byCommand);
  db.close();
}

if (recorded.calls === 0) {
  console.log(`No intercepted calls found in ${dir}.`);
  process.exit(0);
}

console.log(`Measured ${new Date().toISOString().slice(0, 10)} · ${stores} stores · ${projects} projects · calls dated ${day(first)} to ${day(last)}\n`);
console.log("| Figure | Calls | Original | Delivered | Reduction |");
console.log("| --- | --- | --- | --- | --- |");
const row = (label: string, t: Totals) =>
  console.log(`| ${label} | ${t.calls.toLocaleString("en-US")} | ${mb(t.original)} | ${mb(t.summary)} | ${pct(t)} |`);
row("Recorded, all intercepted calls", recorded);
row("Recorded, Bash", families.Bash!);
row("Recorded, MCP", families.MCP!);
row("MCP replayed through current handlers", replay);
console.log(`\nRecorded savings: ${mb(recorded.original - recorded.summary)} (~${((recorded.original - recorded.summary) / 4 / 1e6).toFixed(1)}M tokens at 4 bytes/token).`);
printRanked("MCP by tool, replayed through current handlers (best first)", byTool, 1, 25);
printRanked("Bash by command family, as recorded (15 largest by bytes, best first)", byCommand, 1, 15);
if (emptySummaries.size > 0) {
  console.log("\nWARNING: handlers returned an EMPTY summary (Claude sees nothing) for:");
  for (const [tool, n] of emptySummaries) console.log(`  ${tool}: ${n} call(s). Its reduction above is not real.`);
}
console.log("\nOne machine's store is one user's workload. Regenerate with `bun run measure`.");
