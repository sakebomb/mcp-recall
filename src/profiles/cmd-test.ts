import { readFileSync } from "fs";
import { loadProfiles } from "./loader";
import { resolveProfile } from "./index";
import { getHandler } from "../handlers/index";
import { getDb, defaultDbPath } from "../db/index";
import { getProjectKey } from "../project-key";
import type { LoadedProfile } from "./types";
import { isDenied } from "../denylist";
import { loadConfig } from "../config";
import { formatBytes } from "../format";

export interface TestResult {
  toolName: string;
  matchedProfile: LoadedProfile | null;
  handlerName: string;
  inputBytes: number;
  outputBytes: number;
  reductionPct: number;
  summary: string;
}

/** Core logic — exported for testing. */
export function testProfile(toolName: string, content: string): TestResult {
  const profiles = loadProfiles();
  const matchedProfile = resolveProfile(toolName, profiles);
  const handler = getHandler(toolName, content);
  const { summary, originalSize } = handler(toolName, content);
  const outputBytes = Buffer.byteLength(summary, "utf8");
  const reductionPct =
    originalSize > 0 ? Math.round((1 - outputBytes / originalSize) * 100) : 0;
  return { toolName, matchedProfile, handlerName: handler.name, inputBytes: originalSize, outputBytes, reductionPct, summary };
}

export function cmdTest(args: string[]): void {
  let toolName: string | undefined;
  let storedId: string | undefined;
  let inputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--stored" && args[i + 1]) {
      storedId = args[++i];
    } else if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[++i];
    } else if (!args[i]!.startsWith("-")) {
      toolName = args[i];
    }
  }

  if (!toolName) {
    console.error("Usage: mcp-recall profiles test <tool_name> [--stored <id>] [--input <file>]");
    console.error("\nExamples:");
    console.error("  mcp-recall profiles test mcp__jira__search_issues --stored recall_abc123");
    console.error("  mcp-recall profiles test mcp__stripe__list_customers --input fixture.json");
    process.exit(1);
  }

  if (!storedId && !inputFile) {
    console.error("Provide --stored <recall_id> or --input <file>\n");
    console.error(`To find a stored item:  recall__list_stored(tool: "${toolName}")`);
    process.exit(1);
  }

  let content: string;
  let contentSource: string;

  if (storedId) {
    const projectKey = getProjectKey(process.cwd());
    const db = getDb(defaultDbPath(projectKey));
    const row = db
      .prepare("SELECT full_content FROM stored_outputs WHERE id = ?")
      .get(storedId) as { full_content: string } | null;
    if (!row) {
      console.error(`No stored item found: ${storedId}`);
      process.exit(1);
    }
    content = row.full_content;
    contentSource = `stored:${storedId}`;
  } else {
    try {
      content = readFileSync(inputFile!, "utf8");
    } catch {
      console.error(`Cannot read: ${inputFile}`);
      process.exit(1);
    }
    contentSource = inputFile!;
  }

  const config = loadConfig();
  if (isDenied(toolName, config)) {
    console.log(`Tool "${toolName}" is on the denylist — output will not be processed or stored.`);
    return;
  }

  const result = testProfile(toolName, content);

  if (result.matchedProfile) {
    const p = result.matchedProfile;
    console.log(`\nProfile:  ${p.spec.profile.id} (${p.tier}) — ${p.patterns.join(", ")}`);
    console.log(`File:     ${p.filePath}`);
    console.log(`Strategy: ${p.spec.strategy.type}`);
  } else {
    console.log(`\nNo profile match for ${toolName}`);
    console.log(`Handler:  ${result.handlerName} (TypeScript fallback)`);
    console.log(`\nTo add a profile:`);
    console.log(`  mcp-recall learn`);
    console.log(`  https://github.com/sakebomb/mcp-recall/blob/main/docs/profile-schema.md`);
  }

  console.log(`\nInput:  ${formatBytes(result.inputBytes)}  (${contentSource})`);
  console.log("─".repeat(60));
  console.log(result.summary);
  console.log("─".repeat(60));
  console.log(`Output: ${formatBytes(result.outputBytes)}  (${result.reductionPct}% reduction)\n`);
}
