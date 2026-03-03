#!/usr/bin/env bun
/**
 * demo/show-compression.ts
 *
 * Reads a cached MCP tool response from disk, runs it through the appropriate
 * handler, and prints what Claude actually receives alongside the reduction stats.
 *
 * Usage: bun demo/show-compression.ts <file> [tool-name]
 * Example: bun demo/show-compression.ts /tmp/issues.json mcp__github__list_issues
 */
import { readFileSync } from "fs";
import { githubHandler } from "../src/handlers/github";

const BOLD  = "\x1b[1m";
const GREEN = "\x1b[32m";
const DIM   = "\x1b[2m";
const RESET = "\x1b[0m";

const file     = process.argv[2] ?? "/tmp/issues.json";
const toolName = process.argv[3] ?? "mcp__github__list_issues";

const maxItems = (() => {
  const i = process.argv.indexOf("--max");
  return i !== -1 ? parseInt(process.argv[i + 1] ?? "5", 10) : 5;
})();

const raw = readFileSync(file, "utf8");
const { summary, originalSize } = githubHandler(toolName, raw);
const summaryBytes = Buffer.byteLength(summary, "utf8");
const pct = Math.round((1 - summaryBytes / originalSize) * 100);

const before = `${(originalSize  / 1024).toFixed(1)} KB`;
const after  = `${(summaryBytes  / 1024).toFixed(1)} KB`;

// Trim to maxItems lines for demo readability
const lines = summary.split("\n");
const trimmed = lines.slice(0, maxItems);
const hidden  = lines.length - trimmed.length;
if (hidden > 0) trimmed.push(`${DIM}…and ${hidden} more${RESET}`);

console.log(
  `${BOLD}What Claude receives${RESET} ${DIM}(${before} → ${after} · ${GREEN}${pct}% reduction${RESET}${DIM})${RESET}\n`
);
console.log("─".repeat(64));
console.log(trimmed.join("\n"));
console.log("─".repeat(64));
console.log(
  `\n${DIM}Full content stored in SQLite — retrievable any time via recall__retrieve${RESET}`
);
