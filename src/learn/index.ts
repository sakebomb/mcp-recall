/**
 * `mcp-recall learn` — reads ~/.claude.json, connects to each installed MCP
 * server via stdio, inspects tool schemas, and generates TOML profiles saved
 * to the user profile directory.
 *
 * Usage:
 *   mcp-recall learn              # generate for all installed MCPs
 *   mcp-recall learn jira notion  # generate only for named servers
 *   mcp-recall learn --dry-run    # print profiles without writing
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { listMcpTools } from "./client";
import { generateProfile } from "./generate";
import { clearProfileCache } from "../profiles/loader";

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

function userProfilesDir(): string {
  return (
    process.env.RECALL_USER_PROFILES_PATH ??
    join(homedir(), ".config", "mcp-recall", "profiles")
  );
}

function readClaudeJson(): Record<string, McpServerConfig> {
  const path = join(homedir(), ".claude.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return (raw["mcpServers"] as Record<string, McpServerConfig>) ?? {};
}

export async function handleLearnCommand(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const targets = args.filter((a) => !a.startsWith("--"));

  let servers: Record<string, McpServerConfig>;
  try {
    servers = readClaudeJson();
  } catch {
    console.error("Could not read ~/.claude.json");
    process.exit(1);
  }

  // Filter out recall itself and any HTTP servers
  const candidates = Object.entries(servers).filter(([key, cfg]) => {
    if (key === "recall") return false;
    if (targets.length > 0 && !targets.includes(key)) return false;
    if (!cfg.command) {
      console.log(`  ${key}: skipped (HTTP/SSE server — only stdio supported)`);
      return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    console.log("No stdio MCP servers found to learn from.");
    return;
  }

  console.log(`\nLearning from ${candidates.length} MCP server(s)…\n`);

  const outputDir = userProfilesDir();
  let written = 0;
  let skipped = 0;

  for (const [key, cfg] of candidates) {
    process.stdout.write(`  ${key}: connecting… `);
    let tools;
    try {
      tools = await listMcpTools(
        cfg.command!,
        cfg.args ?? [],
        cfg.env ?? {},
        10_000
      );
    } catch (e) {
      console.log(`failed — ${e instanceof Error ? e.message : String(e)}`);
      skipped++;
      continue;
    }

    console.log(`${tools.length} tool(s) found`);

    const toml = generateProfile(key, tools);

    if (dryRun) {
      console.log(`\n─── ${key} ───────────────────────────────`);
      console.log(toml);
      continue;
    }

    const profileDir = join(outputDir, `mcp__${key.replace(/-/g, "_")}`);
    mkdirSync(profileDir, { recursive: true });
    const filePath = join(profileDir, "default.toml");
    writeFileSync(filePath, toml);
    console.log(`     → ${filePath}`);
    written++;
  }

  if (!dryRun) {
    clearProfileCache();
    console.log(`\n${written} profile(s) written, ${skipped} skipped.`);
    if (written > 0) {
      console.log(`\nNext steps:`);
      console.log(`  1. Run a tool from each MCP to see real output`);
      console.log(`  2. Refine items_path and fields in the generated profiles`);
      console.log(`  3. Run: mcp-recall profiles check`);
      console.log(`  4. Share good profiles: mcp-recall profiles feed <path>`);
    }
  }
}
