/**
 * CLI entrypoint for hook subcommands.
 * Fully implemented in Phase 5.
 *
 * Subcommands:
 *   session-start   — record today as an active session day
 *   post-tool-use   — compress and store MCP tool output
 */

const subcommand = process.argv[2];

switch (subcommand) {
  case "session-start":
    // Phase 5: src/hooks/session-start.ts
    process.exit(0);
    break;
  case "post-tool-use":
    // Phase 5: src/hooks/post-tool-use.ts
    process.exit(0);
    break;
  default:
    process.stderr.write(`[recall] unknown subcommand: ${subcommand}\n`);
    process.exit(1);
}
