import { handleRetrainCommand } from "../learn/retrain";
import { cmdList, cmdRemove, cmdFeed, cmdCheck } from "./cmd-local";
import { cmdInstall, cmdUpdate, cmdSeed, cmdInfo, cmdAvailable } from "./cmd-catalog";
import { cmdTest } from "./cmd-test";

// Re-exports consumed by tests and external callers
export { patternsOverlap, cmdList, cmdRemove } from "./cmd-local";
export { cmdInstall, cmdSeed, cmdAvailable } from "./cmd-catalog";
export { testProfile, type TestResult } from "./cmd-test";
export { verifyManifest } from "./shared";

export async function handleProfilesCommand(args: string[]): Promise<void> {
  const cmd = args[0];
  const rest = args.slice(1);

  switch (cmd) {
    case "list":
      cmdList(rest);
      break;
    case "install":
      await cmdInstall(rest);
      break;
    case "update":
      await cmdUpdate(rest);
      break;
    case "remove":
      cmdRemove(rest);
      break;
    case "seed":
      await cmdSeed(rest);
      break;
    case "feed":
      cmdFeed(rest);
      break;
    case "check":
      cmdCheck();
      break;
    case "retrain":
      await handleRetrainCommand(rest);
      break;
    case "info":
      await cmdInfo(rest);
      break;
    case "available":
      await cmdAvailable(rest);
      break;
    case "test":
      cmdTest(rest);
      break;
    default:
      console.error(`Unknown subcommand: ${cmd ?? "(none)"}\n`);
      console.error("Usage: mcp-recall profiles <command>\n");
      console.error("Commands:");
      console.error("  list                    Show all installed profiles");
      console.error("  available [--verbose]   Browse the community catalog");
      console.error("  info <name>             Show full metadata for a profile");
      console.error("  install <name>          Install a community profile");
      console.error("  update                  Update all installed community profiles");
      console.error("  remove <name>           Remove a community profile");
      console.error("  seed [--all]            Install profiles for all detected MCPs (--all for entire catalog)");
      console.error("  feed [path]             Contribute a local profile to the community");
      console.error("  check                   Detect pattern conflicts");
      console.error("  retrain [--apply] [--depth N] [filter]  Suggest profile improvements from stored corpus");
      console.error("  test <tool> [--stored <id>] [--input <file>]  Test a profile against real input");
      process.exit(1);
  }
}
