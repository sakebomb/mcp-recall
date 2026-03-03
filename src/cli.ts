/**
 * CLI entrypoint for hook subcommands.
 *
 * Subcommands:
 *   session-start   — record today as an active session day, prune expired entries
 *   post-tool-use   — compress and store MCP tool output, return summary to Claude
 */

import { handleSessionStart } from "./hooks/session-start";
import { handlePostToolUse } from "./hooks/post-tool-use";
import { handleProfilesCommand } from "./profiles/commands";
import { handleLearnCommand } from "./learn/index";
import { installCommand, uninstallCommand, statusCommand } from "./install/index";

const subcommand = process.argv[2];

async function main(): Promise<void> {
  // User-facing commands — do not read stdin (not hook handlers)
  if (subcommand === "profiles") {
    await handleProfilesCommand(process.argv.slice(3));
    process.exit(0);
  }

  if (subcommand === "learn") {
    await handleLearnCommand(process.argv.slice(3));
    process.exit(0);
  }

  if (subcommand === "install") {
    const dryRun = process.argv.includes("--dry-run");
    await installCommand({ dryRun });
    process.exit(0);
  }

  if (subcommand === "uninstall") {
    await uninstallCommand();
    process.exit(0);
  }

  if (subcommand === "status") {
    await statusCommand();
    process.exit(0);
  }

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
