/**
 * What `mcp-recall install` says after it has written the config (#496): what
 * happens next, how to check it, and what to expect from the MCP servers this
 * user has. Reads nothing but the parsed ~/.claude.json it is handed, and never
 * the network: the scan asks the installed handlers and profiles, not the
 * community manifest that `profiles seed` fetches.
 */

import { hasDedicatedHandler } from "../handlers/index";

const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";
const RESET = "\x1b[0m";

export interface ServerScan {
  /** Servers a TypeScript handler or an installed profile is written for, for some or all of their tools. */
  dedicated: string[];
  /** Servers whose output goes to the JSON, CSV or generic fallback. */
  fallback: string[];
}

/** The tool-name prefixes a server's tools can carry: as written, and with hyphens as underscores. */
function toolPrefixes(server: string): string[] {
  const name = server.replace(/[^a-zA-Z0-9_-]/g, "_");
  return [...new Set([name, name.replace(/-/g, "_")])].map((n) => `mcp__${n}__`);
}

/** Sorts the user-scope servers in a parsed ~/.claude.json, recall itself left out. */
export function scanServers(claudeJson: Record<string, unknown>): ServerScan {
  const raw = claudeJson["mcpServers"];
  const isMap = raw !== null && typeof raw === "object" && !Array.isArray(raw);
  const servers = isMap ? Object.keys(raw).filter((k) => k !== "recall") : [];
  const isDedicated = (s: string) => toolPrefixes(s).some(hasDedicatedHandler);
  return {
    dedicated: servers.filter(isDedicated),
    fallback: servers.filter((s) => !isDedicated(s)),
  };
}

function serverLines(scan: ServerScan, shownJson: string): string[] {
  if (scan.dedicated.length + scan.fallback.length === 0) {
    return [
      `  No user-scope MCP servers in ${shownJson}, so expect savings mainly on large`,
      `  Bash output such as test logs and diffs. Project and plugin servers are not`,
      `  checked here.`,
    ];
  }
  const lines = [`  Your user-scope MCP servers ${DIM}(${shownJson})${RESET}:`];
  if (scan.dedicated.length > 0) {
    lines.push(`    handler or profile for some or all tools: ${scan.dedicated.join(", ")}`);
  }
  if (scan.fallback.length > 0) {
    lines.push(`    general summarizer, for now:              ${scan.fallback.join(", ")}`);
  }
  return lines;
}

/** The closing block. `scan` is null when Claude Code is not among the agents installed into. */
export function whatHappensNext(scan: ServerScan | null, shownJson: string): string[] {
  return [
    ``,
    `What happens next:`,
    `  The store starts empty and there is no warm-up. Large tool output is replaced`,
    `  by a summary from the first call; short output usually passes through untouched.`,
    ...(scan ? serverLines(scan, shownJson) : []),
    ``,
    `  See what it has done:`,
    `    ${BOLD}mcp-recall stats${RESET}        ${DIM}# savings by tool${RESET}`,
    `    ${BOLD}mcp-recall statusline${RESET}   ${DIM}# today's calls, for Claude Code's status line${RESET}`,
  ];
}
