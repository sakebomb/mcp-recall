/**
 * CLI entrypoint for hook subcommands.
 *
 * Subcommands:
 *   session-start   — record today as an active session day, prune expired entries
 *   post-tool-use   — compress and store MCP tool output, return summary to Claude
 */

import { handleSessionStart } from "./hooks/session-start";
import { handlePostToolUse } from "./hooks/post-tool-use";

const subcommand = process.argv[2];

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();

  try {
    switch (subcommand) {
      case "session-start":
        handleSessionStart(raw);
        process.stdout.write(JSON.stringify({ suppressOutput: true }) + "\n");
        break;
      case "post-tool-use": {
        const result = handlePostToolUse(raw);
        process.stdout.write(JSON.stringify(result) + "\n");
        break;
      }
      default:
        process.stderr.write(`[recall] unknown subcommand: ${subcommand}\n`);
        process.exit(1);
    }
  } catch (err) {
    // Fail open — a recall error must never break Claude's workflow
    if (process.env.RECALL_DEBUG) {
      process.stderr.write(`[recall:debug] STACK: ${err instanceof Error ? err.stack : String(err)}\n`);
    }
    process.stderr.write(`[recall] error in ${subcommand}: ${err}\n`);
    process.stdout.write("{}\n");
    process.exit(0);
  }
}

main();
