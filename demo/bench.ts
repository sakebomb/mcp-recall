#!/usr/bin/env bun
/**
 * demo/bench.ts — compression benchmark using real + fixture data
 *
 * Live: fetches real GitHub issues from a public repo (no auth required)
 * Fixture: uses bundled sample data for handlers that need a live session
 *
 * Usage: bun demo/bench.ts
 */
import { githubHandler } from "../src/handlers/github";
import { tavilyHandler } from "../src/handlers/tavily";
import { csvHandler } from "../src/handlers/csv";
import { playwrightHandler } from "../src/handlers/playwright";
import { databaseHandler } from "../src/handlers/database";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";

function fmt(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

function pct(original: number, compressed: number): string {
  const r = Math.round((1 - compressed / original) * 100);
  return `${GREEN}${r}%${RESET}`;
}

function row(label: string, original: number, compressed: number, live: boolean) {
  const tag = live ? `${CYAN}live${RESET}` : `${DIM}fixture${RESET}`;
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.replace(/\x1b\[[^m]+m/g, "").length));
  console.log(
    `  ${pad(label, 30)} ${pad(fmt(original), 10)} ${pad(fmt(compressed), 10)} ${pad(pct(original, compressed), 18)} ${tag}`
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAYWRIGHT_FIXTURE = [
  '- document "Dashboard"',
  '  - heading "Account settings"',
  '  - button "Save changes"',
  '  - button "Cancel"',
  '  - textbox "Email address"',
  '  - textbox "Display name"',
  '  - textbox "Bio"',
  '  - link "Forgot password?"',
  '  - link "View profile"',
  '  - checkbox "Email notifications"',
  '  - checkbox "Push notifications"',
  '  - select "Timezone"',
  '  - button "Delete account"',
  '  - statictext "Last updated 2 hours ago"',
  // Pad to ~56KB with realistic noise
  ...Array.from({ length: 2000 }, (_, i) =>
    `  - statictext "aria-label-${i} description text padding content here for realistic size"`
  ),
].join("\n");

const TAVILY_FIXTURE = JSON.stringify({
  query: "Claude Code context window limits best practices",
  answer:
    "Claude Code has a 200K token context window. Best practices include using MCP tools efficiently, summarizing large outputs, and using hooks to intercept and compress tool responses before they consume context.",
  results: Array.from({ length: 10 }, (_, i) => ({
    title: `Result ${i + 1}: Claude context management guide`,
    url: `https://example.com/claude-context-${i + 1}`,
    content: `Detailed guide on managing Claude Code context windows effectively. Covers MCP tool output compression, session management, and token optimization strategies for long-running sessions. Part ${i + 1} of ${10}.`,
    raw_content: "F".repeat(8000),
    score: 0.95 - i * 0.02,
  })),
});

function makeCsv(rows: number, cols: number): string {
  const headers = Array.from({ length: cols }, (_, i) => `col_${i + 1}`).join(",");
  const dataRows = Array.from(
    { length: rows },
    (_, r) => Array.from({ length: cols }, (_, c) => `val_${r}_${c}`).join(",")
  );
  return [headers, ...dataRows].join("\n");
}

const CSV_FIXTURE = makeCsv(500, 12);

const DB_FIXTURE = JSON.stringify({
  rows: Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    user_id: 1000 + i,
    email: `user${i}@example.com`,
    status: i % 3 === 0 ? "active" : i % 3 === 1 ? "inactive" : "pending",
    created_at: "2026-03-01T00:00:00Z",
    total_spend: (Math.random() * 10000).toFixed(2),
  })),
  fields: [
    { name: "id" }, { name: "user_id" }, { name: "email" },
    { name: "status" }, { name: "created_at" }, { name: "total_spend" },
  ],
  rowCount: 50,
});

// ---------------------------------------------------------------------------
// Main — flags: --summary shows GitHub summary only, default shows table
// ---------------------------------------------------------------------------

const showSummaryOnly = process.argv.includes("--summary");

// Fetch GitHub data (needed for both modes)
process.stdout.write(showSummaryOnly ? "" : `  ${"GitHub list_issues (20)".padEnd(30)} fetching...`);
let githubRaw = "";
try {
  const res = await fetch(
    "https://api.github.com/repos/anthropics/anthropic-sdk-python/issues?per_page=20&state=all",
    { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "mcp-recall-bench" } }
  );
  githubRaw = await res.text();
} catch {
  // handled below
}

if (showSummaryOnly) {
  if (!githubRaw) {
    console.log(`${DIM}(network unavailable)${RESET}`);
    process.exit(1);
  }
  const { summary } = githubHandler("mcp__github__list_issues", githubRaw);
  console.log(`${BOLD}What Claude receives (GitHub list_issues, 20 items):${RESET}\n`);
  console.log(summary);
  console.log("");
  process.exit(0);
}

// --- Table mode (default) ---

console.log(`\n${BOLD}mcp-recall compression benchmark${RESET}\n`);

const header = `  ${"Handler".padEnd(30)} ${"Before".padEnd(10)} ${"After".padEnd(10)} ${"Reduction".padEnd(12)}   Source`;
console.log(header);
console.log("  " + "─".repeat(header.length - 2));

// 1. GitHub — live fetch (public API, no auth)
if (githubRaw) {
  const { summary, originalSize } = githubHandler("mcp__github__list_issues", githubRaw);
  const githubSummaryBytes = Buffer.byteLength(summary, "utf8");
  process.stdout.write("\r");
  row("GitHub list_issues (20)", originalSize, githubSummaryBytes, true);
} else {
  process.stdout.write("\r");
  console.log(`  ${"GitHub list_issues (20)".padEnd(30)} ${DIM}(network unavailable)${RESET}`);
}

// 2. Playwright — fixture
{
  const { summary, originalSize } = playwrightHandler("mcp__playwright__browser_snapshot", PLAYWRIGHT_FIXTURE);
  row("Playwright snapshot", originalSize, Buffer.byteLength(summary, "utf8"), false);
}

// 3. Tavily — fixture
{
  const { summary, originalSize } = tavilyHandler("mcp__tavily__tavily_search", TAVILY_FIXTURE);
  row("Tavily search (10 results)", originalSize, Buffer.byteLength(summary, "utf8"), false);
}

// 4. CSV — fixture
{
  const { summary, originalSize } = csvHandler("mcp__export__get_csv", CSV_FIXTURE);
  row("CSV (500 rows × 12 cols)", originalSize, Buffer.byteLength(summary, "utf8"), false);
}

// 5. Database — fixture
{
  const { summary, originalSize } = databaseHandler("mcp__postgres__query", DB_FIXTURE);
  row("Postgres query (50 rows)", originalSize, Buffer.byteLength(summary, "utf8"), false);
}

console.log("");
