/**
 * CLI entrypoint for hook subcommands.
 *
 * Subcommands:
 *   session-start   — record today as an active session day, prune expired entries
 *   post-tool-use   — compress and store MCP tool output, return summary to Claude
 *
 * User-facing commands:
 *   install         — register hooks + MCP server in Claude Code
 *   uninstall       — remove hooks + MCP server
 *   status          — show configuration and health
 *   profiles        — manage compression profiles
 *   learn           — generate profile suggestions from session data
 *   completions     — print shell completion script for bash, zsh, or fish
 *   --help, -h      — print this help
 *   --version, -v   — print installed version
 */

import { handleSessionStart } from "./hooks/session-start";
import { handlePostToolUse } from "./hooks/post-tool-use";
import { handleProfilesCommand } from "./profiles/commands";
import { handleLearnCommand } from "./learn/index";
import { installCommand, uninstallCommand, statusCommand } from "./install/index";

export async function getVersion(): Promise<string> {
  const pkg = await import("../package.json");
  return (pkg as unknown as { version: string }).version;
}

export function printHelp(): void {
  console.log(`
mcp-recall — context compression for Claude Code

Usage: mcp-recall <command> [options]

Commands:
  install              Register hooks + MCP server in Claude Code
  uninstall            Remove hooks + MCP server
  status               Show current configuration and health
  profiles <cmd>       Manage compression profiles
    seed [--all]       Install profiles for detected MCPs (--all for entire catalog)
    list               Show installed profiles
    install <id>       Install a specific community profile
    update             Update all community profiles
    remove <id>        Remove a community profile
    feed [path]        Contribute a profile to the community
    check              Detect pattern conflicts
    retrain            Suggest profile improvements from stored data
    test <tool>        Test a profile against real input
  learn                Generate profile suggestions from session data
  completions <shell>  Print shell completion script (bash, zsh, fish)

Options:
  --help, -h           Show this help
  --version, -v        Show version

Examples:
  mcp-recall install              # first-time setup
  mcp-recall profiles seed        # install profiles for your MCPs
  mcp-recall status               # check everything is working
  mcp-recall completions zsh >> ~/.zfunc/_mcp-recall
`);
}

export function completionScript(shell: string): string {
  switch (shell) {
    case "bash":
      return bashCompletion();
    case "zsh":
      return zshCompletion();
    case "fish":
      return fishCompletion();
    default:
      throw new Error(`Unknown shell "${shell}". Supported: bash, zsh, fish`);
  }
}

function bashCompletion(): string {
  return `# mcp-recall bash completions
# Add to your ~/.bashrc or source from /etc/bash_completion.d/mcp-recall

_mcp_recall() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"

  local commands="install uninstall status profiles learn completions --help --version"
  local profiles_cmds="list install update remove seed feed check retrain test"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( \$(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  if [[ "\${COMP_WORDS[1]}" == "profiles" ]]; then
    if [[ \${COMP_CWORD} -eq 2 ]]; then
      COMPREPLY=( \$(compgen -W "\${profiles_cmds}" -- "\${cur}") )
      return 0
    fi
    if [[ \${COMP_CWORD} -ge 3 ]]; then
      local subcmd="\${COMP_WORDS[2]}"
      if [[ "\$subcmd" == "install" || "\$subcmd" == "remove" || "\$subcmd" == "test" ]]; then
        local profile_ids
        profile_ids="\$(mcp-recall profiles list --machine-readable 2>/dev/null)"
        COMPREPLY=( \$(compgen -W "\${profile_ids}" -- "\${cur}") )
        return 0
      fi
    fi
  fi
}

complete -F _mcp_recall mcp-recall
`;
}

function zshCompletion(): string {
  return `#compdef mcp-recall
# mcp-recall zsh completions
# Add to your fpath, e.g.: mcp-recall completions zsh >> ~/.zfunc/_mcp-recall
# Then add to ~/.zshrc: fpath=(~/.zfunc \${fpath}); autoload -Uz compinit && compinit

_mcp_recall_profiles() {
  local state
  _arguments \\
    '1: :->subcommand' \\
    '*:: :->args'

  case \$state in
    subcommand)
      local subcommands=(
        'list:show installed profiles'
        'install:install a community profile by ID'
        'update:update all installed community profiles'
        'remove:remove an installed community profile'
        'seed:install profiles for all detected MCPs'
        'feed:contribute a local profile to the community'
        'check:detect pattern conflicts between installed profiles'
        'retrain:suggest profile improvements from stored data'
        'test:test a profile against real input'
      )
      _describe 'subcommand' subcommands
      ;;
    args)
      case \$words[1] in
        install|remove|test)
          local profiles
          profiles=(\${(f)"\$(mcp-recall profiles list --machine-readable 2>/dev/null)"})
          _describe 'profile' profiles
          ;;
        seed)
          _arguments '--all[install every profile in the community catalog]'
          ;;
      esac
      ;;
  esac
}

_mcp_recall() {
  local state
  _arguments \\
    '(-h --help)'{-h,--help}'[show help and exit]' \\
    '(-v --version)'{-v,--version}'[show version and exit]' \\
    '1: :->command' \\
    '*:: :->args'

  case \$state in
    command)
      local commands=(
        'install:register hooks and MCP server in Claude Code'
        'uninstall:remove hooks and MCP server'
        'status:show current configuration and health'
        'profiles:manage compression profiles'
        'learn:generate profile suggestions from session data'
        'completions:print shell completion script (bash, zsh, fish)'
      )
      _describe 'command' commands
      ;;
    args)
      case \$words[1] in
        profiles)
          _mcp_recall_profiles
          ;;
        completions)
          local shells=('bash:generate bash completion script' 'zsh:generate zsh completion script' 'fish:generate fish completion script')
          _describe 'shell' shells
          ;;
      esac
      ;;
  esac
}

_mcp_recall "\$@"
`;
}

function fishCompletion(): string {
  return `# mcp-recall fish completions
# Save to: mcp-recall completions fish > ~/.config/fish/completions/mcp-recall.fish

set -l commands install uninstall status profiles learn completions

# Top-level commands
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -a install -d "Register hooks and MCP server in Claude Code"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -a uninstall -d "Remove hooks and MCP server"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -a status -d "Show current configuration and health"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -a profiles -d "Manage compression profiles"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -a learn -d "Generate profile suggestions from session data"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -a completions -d "Print shell completion script"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -s h -l help -d "Show help and exit"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from \$commands" \\
  -s v -l version -d "Show version and exit"

# completions subcommand — shell argument
complete -c mcp-recall -f -n "__fish_seen_subcommand_from completions" \\
  -a "bash zsh fish"

# profiles subcommands
set -l profile_cmds list install update remove seed feed check retrain test

complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a list -d "Show installed profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a install -d "Install a community profile by ID"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a update -d "Update all installed community profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a remove -d "Remove an installed community profile"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a seed -d "Install profiles for all detected MCPs"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a feed -d "Contribute a local profile to the community"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a check -d "Detect pattern conflicts between installed profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a retrain -d "Suggest profile improvements from stored data"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from \$profile_cmds" \\
  -a test -d "Test a profile against real input"

# Dynamic profile IDs for install / remove / test
complete -c mcp-recall -f \\
  -n "__fish_seen_subcommand_from profiles; and __fish_seen_subcommand_from install remove test" \\
  -a "(mcp-recall profiles list --machine-readable 2>/dev/null)"

# profiles seed --all flag
complete -c mcp-recall -n "__fish_seen_subcommand_from profiles; and __fish_seen_subcommand_from seed" \\
  -l all -d "Install every profile in the community catalog"
`;
}

const subcommand = process.argv[2];

async function main(): Promise<void> {
  // Flags that work anywhere in argv
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(await getVersion());
    process.exit(0);
  }

  // No subcommand → show help
  if (!subcommand) {
    printHelp();
    process.exit(0);
  }

  // User-facing commands — do not read stdin (not hook handlers)
  if (subcommand === "completions") {
    const shell = process.argv[3];
    if (!shell) {
      console.error("Usage: mcp-recall completions <bash|zsh|fish>");
      process.exit(1);
    }
    try {
      process.stdout.write(completionScript(shell));
    } catch (err) {
      console.error(`${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    process.exit(0);
  }

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

if (import.meta.main) {
  main();
}
