/**
 * src/install/index.ts
 *
 * Implements `mcp-recall install`, `mcp-recall uninstall`, and `mcp-recall status`.
 *
 * Writes the MCP server entry to ~/.claude.json, the two hook entries to
 * ~/.claude/settings.json, and a short instruction block to ~/.claude/CLAUDE.md.
 * All operations are non-destructive — existing entries from other tools are
 * never touched. Writes are atomic (tmp → rename).
 */

import { existsSync } from "fs";
import { mkdir, rename, readFile, realpath, readlink, stat, chmod, rm, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { defaultPiDir, installPi, piDetected, piExtensionDir, piLaunch, piStatus, uninstallPi } from "../agents/pi";
import { loadProfiles } from "../profiles/loader";
import { storeFootprint } from "../gc/index";
import { loadConfig } from "../config";
import { formatBytes } from "../format";

// ── Utilities ────────────────────────────────────────────────────────────────

function isEnoent(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as NodeJS.ErrnoException).code === "ENOENT";
}

// ── ANSI ─────────────────────────────────────────────────────────────────────

const BOLD  = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED   = "\x1b[31m";
const DIM   = "\x1b[2m";
const RESET = "\x1b[0m";

// ── Default paths ─────────────────────────────────────────────────────────────

export function defaultClaudeJsonPath(): string {
  return path.join(os.homedir(), ".claude.json");
}

export function defaultSettingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

export function defaultClaudeMdPath(): string {
  return path.join(os.homedir(), ".claude", "CLAUDE.md");
}

/** Claude Code's record of installed plugins, which a marketplace install of recall is in (#456). */
export function defaultPluginsPath(): string {
  return path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json");
}

// ── Launch detection ─────────────────────────────────────────────────────────

/** How Claude Code runs mcp-recall: through bun and the bundled dist, or a standalone binary (#361). */
export interface RecallLaunch {
  /** The command a hook runs, before its subcommand: `bun /…/dist/cli.js`, or the binary. */
  cli: string;
  /** The `mcpServers.recall` entry for ~/.claude.json. */
  server: { type: "stdio"; command: string; args: string[] };
  /** Files the launch needs: install refuses, and status warns, when one is missing. */
  artifacts: Array<{ label: string; path: string }>;
}

/**
 * True for a module path under a compiled binary's virtual root: `/$bunfs/` on
 * POSIX, `B:\~BUN\` on Windows. Kept apart from {@link isStandaloneBinary} so the
 * regex is tested on every Bun, including ones whose flag short-circuits it (#419).
 */
export function isBunfsPath(modulePath: string): boolean {
  return /^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(modulePath);
}

/**
 * True inside a `bun build --compile` binary. `Bun.isStandaloneExecutable` says
 * so directly in newer Bun; the module path is the fallback for older ones.
 */
export function isStandaloneBinary(modulePath = import.meta.path): boolean {
  const flag = (Bun as { isStandaloneExecutable?: unknown }).isStandaloneExecutable;
  if (typeof flag === "boolean") return flag;
  return isBunfsPath(modulePath);
}

/**
 * `p` as one word of a hook command. Claude Code runs hook commands through a
 * POSIX shell (Git Bash on Windows), so a path with a space or a quote goes in
 * single quotes, where a backslash stays literal (`C:\Program Files\…`).
 */
export function shellWord(p: string): string {
  // Only characters a shell leaves alone stay bare; a backslash is an escape.
  return /[^\w@%+=:,./-]/.test(p) ? `'${p.replace(/'/g, `'\\''`)}'` : p;
}

/**
 * The words of a hook command, as a POSIX shell splits them: the reverse of
 * {@link shellWord}, so `status` can find the files a hook runs (#364).
 * Handles bare words, single quotes and backslash escapes; nothing else.
 */
export function shellWords(cmd: string): string[] {
  const words: string[] = [];
  let i = 0;
  while (i < cmd.length) {
    while (cmd[i] === " ") i++;
    if (i >= cmd.length) break;
    let word = "";
    while (i < cmd.length && cmd[i] !== " ") {
      if (cmd[i] === "'") {
        const end = cmd.indexOf("'", i + 1);
        if (end === -1) return words; // unterminated: not a command we wrote
        word += cmd.slice(i + 1, end);
        i = end + 1;
      } else if (cmd[i] === "\\") {
        word += cmd[i + 1] ?? "";
        i += 2;
      } else {
        word += cmd[i++];
      }
    }
    words.push(word);
  }
  return words;
}

/**
 * Package runners whose cache a run leaves behind, keyed by a path-segment pattern
 * from their real layout (1.21.0): npx `…/_npx/<hash>/`, bunx `…/.bunx-<uid>/`,
 * pnpm dlx `…/pnpm/dlx/<hash>/`. Either separator, so Windows paths match too.
 */
const RUNNER_CACHES: Array<[runner: string, segment: RegExp]> = [
  ["npx",      /[\\/]_npx[\\/]/],
  ["bunx",     /[\\/]\.bunx-[^\\/]*[\\/]/],
  ["pnpm dlx", /[\\/]pnpm[\\/]dlx[\\/]/],
];

/**
 * The package runner whose cache holds `p`, or null. A launch registered there
 * breaks silently when the cache is cleaned, so install refuses it (#455).
 */
export function ephemeralRunner(p: string): string | null {
  return RUNNER_CACHES.find(([, segment]) => segment.test(p))?.[0] ?? null;
}

export function detectLaunch(standalone = isStandaloneBinary()): RecallLaunch {
  if (standalone) {
    const bin = process.execPath;
    return {
      cli: shellWord(bin),
      server: { type: "stdio", command: bin, args: ["serve"] },
      artifacts: [{ label: "binary", path: bin }],
    };
  }
  // import.meta.path is the absolute path of the currently executing file.
  // Running from src/install/index.ts (dev): dist is ../../plugins/mcp-recall/dist/
  // Running from dist/cli.js (built):        dist is import.meta.dir itself.
  const isBuilt = import.meta.path.endsWith(".js");
  const distDir = isBuilt
    ? import.meta.dir
    : path.resolve(import.meta.dir, "../../plugins/mcp-recall/dist");
  const serverJs = path.join(distDir, "server.js");
  const cliJs = path.join(distDir, "cli.js");

  return {
    cli: `bun ${shellWord(cliJs)}`,
    server: { type: "stdio", command: "bun", args: [serverJs] },
    artifacts: [{ label: "dist/server.js", path: serverJs }, { label: "dist/cli.js", path: cliJs }],
  };
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

export async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch (e: unknown) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Cannot parse ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, 2) + "\n");
}

// The kernel's own symlink-chain limit (Linux ELOOP), so a loop cannot spin.
const MAX_LINK_HOPS = 40;

/**
 * The file a write to `filePath` should replace: the end of a symlink chain,
 * even a dangling one, so a dotfiles-managed link survives the rename (#373).
 */
async function writeTarget(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch (e: unknown) {
    if (!isEnoent(e)) throw e;
  }
  let target = filePath;
  for (let hop = 0; hop < MAX_LINK_HOPS; hop++) {
    try {
      target = path.resolve(path.dirname(target), await readlink(target));
    } catch {
      return target; // no file yet, or the end of the chain
    }
  }
  return target;
}

/**
 * Atomic write (temp file + rename) through any symlink, keeping the replaced
 * file's mode: a 600 `~/.claude.json` can hold MCP server tokens (#373).
 */
async function writeTextFile(filePath: string, content: string): Promise<void> {
  const target = await writeTarget(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  const mode = await stat(target).then((s) => s.mode & 0o7777, () => undefined);
  const tmp = target + ".tmp";
  // A fresh temp file is created with the mode (narrowed by the umask), so it is
  // never wider than the file it replaces; the chmod restores bits the umask cut.
  await rm(tmp, { force: true });
  await writeFile(tmp, content, mode === undefined ? undefined : { mode });
  if (mode !== undefined) await chmod(tmp, mode);
  await rename(tmp, target);
}

// ── CLAUDE.md helpers ─────────────────────────────────────────────────────────

export const CLAUDE_MD_MARKER_START = "<!-- BEGIN mcp-recall -->";
export const CLAUDE_MD_MARKER_END   = "<!-- END mcp-recall -->";

export const CLAUDE_MD_SNIPPET = `## mcp-recall

Session context from previous sessions is automatically injected at startup (pinned items, notes, recent activity). If it was truncated, call \`recall__context()\` for the full view.

When a tool output was compressed by mcp-recall (you'll see a \`[recall:recall_abc123 · …]\` line above a summary), call \`recall__retrieve({"id": "recall_abc123"})\` for the content behind it, or add a \`query\` to see the parts that match.

Proactively:
- \`recall__note("…")\` — save important decisions or context worth keeping across sessions
- \`recall__pin("recall_abc123")\` — protect frequently-needed items from expiry and eviction
- \`recall__search("query")\` — find stored outputs by content when you don't have an ID`;

export const CLAUDE_MD_BLOCK = `${CLAUDE_MD_MARKER_START}\n${CLAUDE_MD_SNIPPET}\n${CLAUDE_MD_MARKER_END}`;

export function isClaudeMdInjected(content: string): boolean {
  return content.includes(CLAUDE_MD_MARKER_START);
}

export async function injectClaudeMd(
  filePath: string,
  dryRun = false
): Promise<"added" | "updated" | "present"> {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (e: unknown) {
    if (!isEnoent(e)) throw e;
  }

  const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
  const endIdx   = existing.indexOf(CLAUDE_MD_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const currentBlock = existing.slice(startIdx, endIdx + CLAUDE_MD_MARKER_END.length);
    if (currentBlock === CLAUDE_MD_BLOCK) return "present";
    if (!dryRun) {
      const updated =
        existing.slice(0, startIdx) +
        CLAUDE_MD_BLOCK +
        existing.slice(endIdx + CLAUDE_MD_MARKER_END.length);
      await writeTextFile(filePath, updated);
    }
    return "updated";
  }

  if (!dryRun) {
    const newContent = existing
      ? existing.trimEnd() + "\n\n" + CLAUDE_MD_BLOCK + "\n"
      : CLAUDE_MD_BLOCK + "\n";
    await writeTextFile(filePath, newContent);
  }
  return "added";
}

export async function removeClaudeMd(filePath: string): Promise<boolean> {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (e: unknown) {
    if (isEnoent(e)) return false;
    throw e;
  }

  const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
  const endIdx   = existing.indexOf(CLAUDE_MD_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return false;

  const before = existing.slice(0, startIdx).trimEnd();
  const after  = existing.slice(endIdx + CLAUDE_MD_MARKER_END.length).replace(/^\n+/, "\n");
  const result = (before + after).trimEnd();
  await writeTextFile(filePath, result ? result + "\n" : "");
  return true;
}

// ── Hook builders ─────────────────────────────────────────────────────────────

export const SESSION_START_MARKER = "session-start";
export const POST_TOOL_USE_MARKER = "post-tool-use";
/**
 * No look-around: grok compiles matchers with Rust's regex crate, which rejects
 * it, so the old matcher left grok without this hook (#459). The hook itself
 * skips recall's own tools (the denylist holds mcp__recall__*).
 */
export const POST_TOOL_USE_MATCHER = "mcp__.*|Bash";
/** The matcher before #459; install rewrites an entry that still has it. */
export const LEGACY_POST_TOOL_USE_MATCHER = "(mcp__(?!recall__).*|Bash)";

/** Shape of a single hook entry in Claude Code's settings.json hooks array. */
interface HookEntry {
  hooks: Array<{ type: string; command: string; timeout?: number }>;
  matcher?: string;
}

/** `cli` is {@link RecallLaunch.cli}: `bun /…/dist/cli.js`, or a binary's path. */
export function makeSessionStartEntry(cli: string) {
  return {
    hooks: [{ type: "command", command: `${cli} session-start`, timeout: 10 }],
  };
}

export function makePostToolUseEntry(cli: string) {
  return {
    matcher: POST_TOOL_USE_MATCHER,
    hooks: [{ type: "command", command: `${cli} post-tool-use`, timeout: 10 }],
  };
}

// ── Hook detectors ────────────────────────────────────────────────────────────

/** Recognisers for recall's hooks in one event: the entry that holds one, and the hook itself. */
export interface OurHooks {
  entry: (entry: unknown) => boolean;
  hook: (hook: unknown) => boolean;
}

/**
 * Recall's hooks for each event. A hook is recall's when its command names
 * recall and the subcommand, as every npm install's does, or when it is
 * exactly `<cli> <subcommand>` for one of `clis`: launches known to run recall,
 * which covers a binary whose path has no "recall" in it (#366).
 */
export function recallHooks(clis: readonly string[] = []): { SessionStart: OurHooks; PostToolUse: OurHooks } {
  const recogniser = (marker: string, matchers?: readonly string[]): OurHooks => {
    const hook = (h: unknown) => {
      const cmd = (h as Record<string, unknown> | null)?.["command"];
      if (typeof cmd !== "string") return false;
      return (cmd.includes("recall") && cmd.includes(marker)) || clis.some((cli) => cmd === `${cli} ${marker}`);
    };
    const entry = (e: unknown) => {
      if (!e || typeof e !== "object") return false;
      const { matcher: m, hooks } = e as Record<string, unknown>;
      const matches = matchers === undefined || (typeof m === "string" && matchers.includes(m));
      return matches && Array.isArray(hooks) && hooks.some(hook);
    };
    return { entry, hook };
  };
  return {
    SessionStart: recogniser(SESSION_START_MARKER),
    PostToolUse: recogniser(POST_TOOL_USE_MARKER, [POST_TOOL_USE_MATCHER, LEGACY_POST_TOOL_USE_MATCHER]),
  };
}

/**
 * The launches known to run recall, for {@link recallHooks}: this install's, and
 * the binary the registered server names, so that uninstall from npm still
 * finds the hooks of a renamed binary (#366).
 */
function knownClis(launch: RecallLaunch, server: unknown): string[] {
  const command = (server as Record<string, unknown> | undefined)?.["command"];
  return typeof command === "string" && !isBunProgram(command) ? [launch.cli, shellWord(command)] : [launch.cli];
}

export function isOurSessionStartHook(entry: unknown): boolean {
  return recallHooks().SessionStart.entry(entry);
}

export function isOurPostToolUseHook(entry: unknown): boolean {
  return recallHooks().PostToolUse.entry(entry);
}

/**
 * Removes recall's hooks from `entries`, dropping an entry only once it is
 * empty, so a hook the user grouped beside recall's stays. Returns how many
 * hooks went.
 */
export function removeOurHooks(entries: unknown[], ours: OurHooks): { entries: unknown[]; removed: number } {
  let removed = 0;
  const kept = entries.flatMap((e) => {
    if (!ours.entry(e)) return [e];
    const entry = e as HookEntry;
    const hooks = entry.hooks.filter((h) => !ours.hook(h));
    removed += entry.hooks.length - hooks.length;
    return hooks.length > 0 ? [{ ...entry, hooks }] : [];
  });
  return { entries: kept, removed };
}

/**
 * Adds `fresh` to `entries`, or points recall's existing hook at fresh's command.
 * An update changes that hook's `command` and nothing else: a timeout the user
 * raised, and other hooks they grouped into the same entry, stay (#365).
 * Duplicates of recall's hook after the first are removed (#366). An entry
 * with an older matcher of recall's gets fresh's (#459).
 */
export function upsertHook(
  entries: unknown[],
  ours: OurHooks,
  fresh: HookEntry,
): { entries: unknown[]; result: "added" | "updated" | "present" } {
  const idx = entries.findIndex(ours.entry);
  if (idx === -1) return { entries: [...entries, fresh], result: "added" };
  const dupes = removeOurHooks(entries.slice(idx + 1), ours);
  const entry = entries[idx] as HookEntry;
  const first = entry.hooks.findIndex(ours.hook);
  const command = fresh.hooks[0]!.command;
  const hooks = entry.hooks.flatMap((h, i) => {
    if (i === first) return [{ ...h, command }];
    return ours.hook(h) ? [] : [h]; // a second copy inside the same entry
  });
  const matcher = fresh.matcher ?? entry.matcher;
  const changed = dupes.removed > 0 || hooks.length !== entry.hooks.length ||
    entry.hooks[first]!.command !== command || entry.matcher !== matcher;
  if (!changed) return { entries, result: "present" };
  const updated = matcher === undefined ? { ...entry, hooks } : { ...entry, matcher, hooks };
  return { entries: [...entries.slice(0, idx), updated, ...dupes.entries], result: "updated" };
}

// ── install ───────────────────────────────────────────────────────────────────

/** The coding agents mcp-recall can install into (#458). */
export const AGENTS = ["claude", "pi"] as const;
export type Agent = (typeof AGENTS)[number];

/** Claude Code always, as before #458; pi when its config dir exists. */
export function detectAgents(piDir: string): Agent[] {
  return piDetected(piDir) ? ["claude", "pi"] : ["claude"];
}

/** Parses `--agent claude,pi` (or repeated `--agent`); null when a name is unknown. */
export function parseAgents(argv: string[]): Agent[] | null | undefined {
  const names: string[] = [];
  argv.forEach((arg, i) => {
    if (arg === "--agent") names.push(...(argv[i + 1] ?? "").split(","));
    else if (arg.startsWith("--agent=")) names.push(...arg.slice("--agent=".length).split(","));
  });
  if (names.length === 0) return undefined;
  const wanted = names.map((n) => n.trim()).filter(Boolean);
  if (wanted.length === 0 || wanted.some((n) => !(AGENTS as readonly string[]).includes(n))) return null;
  return [...new Set(wanted)] as Agent[];
}

/** The launch as the pi extension's launch.json records it. */
function piLaunchOf(launch: RecallLaunch) {
  return piLaunch(shellWords(launch.cli), launch.server);
}

export interface InstallOptions {
  dryRun?: boolean;
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
  /** Defaults to {@link detectLaunch}; tests pass one. */
  launch?: RecallLaunch;
  /** pi's config dir; defaults to {@link defaultPiDir}. */
  piDir?: string;
  /** Which agents to install into; defaults to {@link detectAgents}. */
  agents?: Agent[];
}

export async function installCommand(opts: InstallOptions = {}): Promise<void> {
  const {
    dryRun         = false,
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
    launch         = detectLaunch(),
    piDir          = defaultPiDir(),
  } = opts;
  const agents = opts.agents ?? detectAgents(piDir);

  const missing = launch.artifacts.find((a) => !existsSync(a.path));
  if (missing) {
    console.error(`${RED}✗ Build artifacts not found.${RESET}`);
    console.error(`  Expected: ${DIM}${missing.path}${RESET}`);
    console.error(`  Run ${BOLD}bun run build${RESET} first.`);
    process.exit(1);
  }

  const runner = launch.artifacts.map((a) => ephemeralRunner(a.path)).find((r) => r !== null);
  if (runner) {
    console.error(`${RED}✗ mcp-recall is running from ${runner}'s temporary cache.${RESET}`);
    console.error(`  Registering it there breaks once that cache is cleaned. Install it globally, then install from there:`);
    console.error(`    ${BOLD}npm install -g mcp-recall${RESET}   ${DIM}# or: bun add -g mcp-recall${RESET}`);
    console.error(`    ${BOLD}mcp-recall install${RESET}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`${DIM}dry run — no files will be modified${RESET}\n`);
  }

  let anyChange = false;
  if (agents.includes("claude")) {
    anyChange = (await installClaude(claudeJsonPath, settingsPath, claudeMdPath, launch, dryRun)) || anyChange;
  }
  if (agents.includes("pi")) {
    if (agents.includes("claude")) console.log("");
    const dir = piExtensionDir(piDir);
    const result = await installPi(piDir, piLaunchOf(launch), dryRun);
    if (result === "added") {
      console.log(`${GREEN}✓${RESET} pi extension added        ${DIM}(${dir})${RESET}`);
    } else if (result === "updated") {
      console.log(`${YELLOW}↺${RESET} pi extension updated      ${DIM}(${dir})${RESET}`);
    } else {
      console.log(`${DIM}ℹ pi extension already installed${RESET}`);
    }
    if (result !== "present") {
      anyChange = true;
      if (!dryRun) console.log(`\nRestart pi (or run /reload) to activate mcp-recall.`);
    }
  }

  if (anyChange && !dryRun) {
    console.log(`\nNext steps:`);
    console.log(`  Install compression profiles for your MCPs:`);
    console.log(`    ${BOLD}mcp-recall profiles seed${RESET}`);
    console.log(`\n  Optional — enable shell completions:`);
    console.log(`    ${BOLD}mcp-recall completions zsh > ~/.zfunc/_mcp-recall${RESET}   ${DIM}# zsh${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions bash >> ~/.bash_completion${RESET}    ${DIM}# bash${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions fish > ~/.config/fish/completions/mcp-recall.fish${RESET}  ${DIM}# fish${RESET}`);
  }
}

/** Claude Code's part of install: the MCP server, both hooks and the CLAUDE.md block. */
async function installClaude(
  claudeJsonPath: string, settingsPath: string, claudeMdPath: string, launch: RecallLaunch, dryRun: boolean,
): Promise<boolean> {
  let anyChange = false;

  // ── ~/.claude.json ──────────────────────────────────────────────────────────
  const claudeJson = await readJsonFile(claudeJsonPath);
  const mcpServers = (claudeJson["mcpServers"] as Record<string, unknown>) ?? {};
  const newServer  = launch.server;
  const existing   = mcpServers["recall"] as Record<string, unknown> | undefined;
  // Compare the whole launch, so moving between npm and a binary is an update.
  const sameServer = runsServer(existing, newServer);

  if (!existing) {
    if (!dryRun) {
      claudeJson["mcpServers"] = { ...mcpServers, recall: newServer };
      await writeJsonFile(claudeJsonPath, claudeJson);
    }
    console.log(`${GREEN}✓${RESET} MCP server registered     ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else if (!sameServer) {
    if (!dryRun) {
      // Only the launch changes: an env or other field the user added stays (#365).
      claudeJson["mcpServers"] = { ...mcpServers, recall: { ...existing, ...newServer } };
      await writeJsonFile(claudeJsonPath, claudeJson);
    }
    console.log(`${YELLOW}↺${RESET} MCP server path updated    ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}ℹ MCP server already registered${RESET}`);
  }

  // ── ~/.claude/settings.json — read once, write once ─────────────────────────
  const settings     = await readJsonFile(settingsPath);
  const hooks        = (settings["hooks"] as Record<string, unknown[]>) ?? {};
  let settingsChanged = false;
  // From the server entry as it was before this run, which may name a renamed binary.
  const ours = recallHooks(knownClis(launch, existing));

  // SessionStart
  const ss = upsertHook(
    (hooks["SessionStart"] as unknown[]) ?? [], ours.SessionStart, makeSessionStartEntry(launch.cli),
  );
  hooks["SessionStart"] = ss.entries;
  if (ss.result === "added") {
    console.log(`${GREEN}✓${RESET} SessionStart hook added    ${DIM}(${settingsPath})${RESET}`);
  } else if (ss.result === "updated") {
    console.log(`${YELLOW}↺${RESET} SessionStart hook updated   ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}ℹ SessionStart hook already registered${RESET}`);
  }

  // PostToolUse
  const ptu = upsertHook(
    (hooks["PostToolUse"] as unknown[]) ?? [], ours.PostToolUse, makePostToolUseEntry(launch.cli),
  );
  hooks["PostToolUse"] = ptu.entries;
  if (ptu.result === "added") {
    console.log(`${GREEN}✓${RESET} PostToolUse hook added     ${DIM}(${settingsPath})${RESET}`);
  } else if (ptu.result === "updated") {
    console.log(`${YELLOW}↺${RESET} PostToolUse hook updated    ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}ℹ PostToolUse hook already registered${RESET}`);
  }

  if (ss.result !== "present" || ptu.result !== "present") {
    settingsChanged = true;
    anyChange = true;
  }

  if (settingsChanged && !dryRun) {
    settings["hooks"] = hooks;
    await writeJsonFile(settingsPath, settings);
  }

  // ── ~/.claude/CLAUDE.md ──────────────────────────────────────────────────────
  const claudeMdResult = await injectClaudeMd(claudeMdPath, dryRun);
  if (claudeMdResult === "added") {
    console.log(`${GREEN}✓${RESET} CLAUDE.md instructions added  ${DIM}(${claudeMdPath})${RESET}`);
    anyChange = true;
  } else if (claudeMdResult === "updated") {
    console.log(`${YELLOW}↺${RESET} CLAUDE.md instructions updated ${DIM}(${claudeMdPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}ℹ CLAUDE.md instructions already present${RESET}`);
  }

  if (anyChange && !dryRun) {
    console.log(`\nRestart Claude Code to activate mcp-recall.`);
  }
  return anyChange;
}

// ── uninstall ─────────────────────────────────────────────────────────────────

export interface UninstallOptions {
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
  /** Defaults to {@link detectLaunch}; tests pass one. */
  launch?: RecallLaunch;
  /** pi's config dir; defaults to {@link defaultPiDir}. */
  piDir?: string;
  /** Which agents to uninstall from; defaults to all of them. */
  agents?: Agent[];
}

export async function uninstallCommand(opts: UninstallOptions = {}): Promise<void> {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
    launch         = detectLaunch(),
    piDir          = defaultPiDir(),
    agents         = [...AGENTS],
  } = opts;

  if (agents.includes("claude")) await uninstallClaude(claudeJsonPath, settingsPath, claudeMdPath, launch);
  // pi is mentioned only to someone who has it, or who asked for it by name.
  const piNamed = opts.agents?.includes("pi") ?? false;
  if (agents.includes("pi") && (piNamed || piDetected(piDir))) {
    if (agents.includes("claude")) console.log("");
    if (await uninstallPi(piDir)) {
      console.log(`${GREEN}✓${RESET} Removed pi extension        ${DIM}(${piExtensionDir(piDir)})${RESET}`);
      console.log(`\nRestart pi (or run /reload) to deactivate mcp-recall.`);
    } else {
      console.log(`${DIM}ℹ pi extension not present${RESET}`);
    }
  }
}

/** Claude Code's part of uninstall: the reverse of {@link installClaude}. */
async function uninstallClaude(
  claudeJsonPath: string, settingsPath: string, claudeMdPath: string, launch: RecallLaunch,
): Promise<void> {
  let anyChange = false;

  // ~/.claude.json
  const claudeJson = await readJsonFile(claudeJsonPath);
  const mcpServers = claudeJson["mcpServers"] as Record<string, unknown> | undefined;
  // Read before the entry goes: it may name a renamed binary whose hooks follow (#366).
  const ours = recallHooks(knownClis(launch, mcpServers?.["recall"]));
  if (mcpServers?.["recall"]) {
    delete mcpServers["recall"];
    await writeJsonFile(claudeJsonPath, claudeJson);
    console.log(`${GREEN}✓${RESET} Removed mcpServers.recall  ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}ℹ mcpServers.recall not present${RESET}`);
  }

  // ~/.claude/settings.json — read once, write once
  const settings     = await readJsonFile(settingsPath);
  const hooks        = (settings["hooks"] as Record<string, unknown[]>) ?? {};
  let settingsChanged = false;

  // Every copy, not only the first: earlier versions could leave duplicates (#366).
  const ss = removeOurHooks((hooks["SessionStart"] as unknown[]) ?? [], ours.SessionStart);
  if (ss.removed > 0) {
    hooks["SessionStart"] = ss.entries;
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}✓${RESET} Removed SessionStart hook   ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}ℹ SessionStart hook not present${RESET}`);
  }

  const ptu = removeOurHooks((hooks["PostToolUse"] as unknown[]) ?? [], ours.PostToolUse);
  if (ptu.removed > 0) {
    hooks["PostToolUse"] = ptu.entries;
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}✓${RESET} Removed PostToolUse hook    ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}ℹ PostToolUse hook not present${RESET}`);
  }

  if (settingsChanged) {
    settings["hooks"] = hooks;
    await writeJsonFile(settingsPath, settings);
  }

  // ~/.claude/CLAUDE.md
  const removed = await removeClaudeMd(claudeMdPath);
  if (removed) {
    console.log(`${GREEN}✓${RESET} Removed CLAUDE.md instructions  ${DIM}(${claudeMdPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}ℹ CLAUDE.md instructions not present${RESET}`);
  }

  if (anyChange) {
    console.log(`\nRestart Claude Code to deactivate mcp-recall.`);
  }
}

// ── status ────────────────────────────────────────────────────────────────────

/** True when a registered `mcpServers.recall` entry runs `server`: same command and args. */
function runsServer(entry: unknown, server: RecallLaunch["server"]): boolean {
  const e = entry as Record<string, unknown> | undefined;
  return e?.["command"] === server.command && JSON.stringify(e?.["args"]) === JSON.stringify(server.args);
}

function isBunProgram(program: string): boolean {
  return /(^|[\\/])bun(\.exe)?$/.test(program);
}

/** How status names a launch, from the program its server entry runs. */
function describeLaunch(command: unknown): string {
  return typeof command === "string" && !isBunProgram(command) ? `the binary at ${command}` : "the npm install";
}

/** A program as a shell finds it: an absolute path as is, a bare name on PATH. */
function locate(program: string): { path: string; exists: boolean } {
  if (path.isAbsolute(program) || path.win32.isAbsolute(program)) {
    return { path: program, exists: existsSync(program) };
  }
  const found = Bun.which(program);
  return { path: found ?? program, exists: found !== null };
}

export interface RegisteredFile { label: string; path: string; exists: boolean }

/**
 * The files the registered server and hooks run, from each launch's words: its
 * program and, for bun, the script after it. Status checks these, not its own
 * files, which say nothing when another install is the one registered (#364).
 */
export function registeredFiles(launches: string[][]): RegisteredFile[] {
  const files = new Map<string, RegisteredFile>();
  const add = (label: string, p: string) => {
    if (!files.has(p)) files.set(p, { label, ...locate(p) });
  };
  for (const [program, script] of launches) {
    if (!program) continue;
    if (isBunProgram(program)) {
      add("bun", program);
      if (script) add(path.basename(script), script);
    } else {
      add("binary", program);
    }
  }
  return [...files.values()];
}

/**
 * pi's part of status, shown when pi is installed or the extension is: whether
 * the extension is there and current, and whether what its launch.json runs exists.
 */
async function printPiStatus(piDir: string, launch: RecallLaunch): Promise<void> {
  const st = await piStatus(piDir);
  if (!piDetected(piDir) && !st.extension) return;
  const tick = (ok: boolean) => (ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`);
  const files = st.launch ? registeredFiles([st.launch.cli, [st.launch.server.command, ...st.launch.server.args]]) : [];
  const ok = st.extension && st.launch !== null && !st.stale && files.every((f) => f.exists);
  const label = ok ? `${GREEN}installed${RESET}` : st.extension ? `${YELLOW}partial / stale${RESET}` : `${RED}not installed${RESET}`;
  const shown = piExtensionDir(piDir).replace(os.homedir(), "~");

  console.log(`\npi: ${BOLD}${label}${RESET}\n`);
  console.log(`  ${shown}`);
  console.log(`    ${tick(st.extension && !st.stale)} extension${st.stale ? " (from another version)" : ""}`);
  console.log(`    ${tick(st.launch !== null)} launch.json`);
  for (const f of files) console.log(`    ${tick(f.exists)} ${f.label} ${DIM}${f.path}${RESET}`);
  if (st.launch && JSON.stringify(st.launch) !== JSON.stringify(piLaunchOf(launch))) {
    console.log(`\n  The extension runs another install of mcp-recall than this one.`);
  }
  if (!ok) console.log(`\n  Run ${BOLD}mcp-recall install${RESET}`);
}

/** The commands of recall's own hooks among an event's entries, not their neighbours'. */
function ourHookCommands(entries: unknown, ours: OurHooks): string[] {
  return ((entries as unknown[] | undefined) ?? [])
    .filter(ours.entry)
    .flatMap((e) => (e as HookEntry).hooks.filter(ours.hook).map((h) => h.command));
}

/** recall installed through the Claude Code plugin marketplace. */
export interface PluginInstall { key: string; installPath: string; enabled: boolean }

/**
 * A user-scope `mcp-recall@<marketplace>` plugin in Claude Code's registry, and
 * whether `enabledPlugins` turns it off. Claude Code does not document the
 * registry, so any shape this does not recognise reads as no plugin (#456).
 */
export function findPluginInstall(registry: Record<string, unknown>, settings: Record<string, unknown>): PluginInstall | null {
  const plugins = registry["plugins"];
  if (typeof plugins !== "object" || plugins === null) return null;
  const enabledPlugins = settings["enabledPlugins"] as Record<string, unknown> | undefined;
  for (const [key, entries] of Object.entries(plugins)) {
    if (!key.startsWith("mcp-recall@") || !Array.isArray(entries)) continue;
    const user = entries.find((e) => e?.scope === "user" && typeof e?.installPath === "string");
    if (user) return { key, installPath: user.installPath, enabled: enabledPlugins?.[key] !== false };
  }
  return null;
}

/** The plugin registry, or nothing when it is absent or not JSON: status must still run. */
async function readPluginRegistry(filePath: string): Promise<Record<string, unknown>> {
  try { return await readJsonFile(filePath); } catch { return {}; }
}

/**
 * The plugin part of status. Alone, the plugin is the install, so its files and
 * the CLAUDE.md block decide the label. Beside a CLI install it is a second
 * registration, and disabled it is a note above the CLI's own checks.
 */
function printPluginStatus(plugin: PluginInstall, claudeMdOk: boolean, cliRegistered: boolean): void {
  if (!plugin.enabled) {
    console.log(`\n  Claude Code plugin ${plugin.key}: disabled`);
    return;
  }
  const files = [
    { label: "dist/server.js", ...locate(path.join(plugin.installPath, "dist", "server.js")) },
    { label: "bin/recall", ...locate(path.join(plugin.installPath, "bin", "recall")) },
    { label: "bun", ...locate("bun") },
  ];
  const filesOk = files.every((f) => f.exists);
  const tick = (ok: boolean) => (ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`);
  if (!cliRegistered) {
    const label = filesOk && claudeMdOk ? `${GREEN}installed${RESET}` : `${YELLOW}partial / stale${RESET}`;
    console.log(`\nInstallation: ${BOLD}${label}${RESET}\n`);
  }
  console.log(`${cliRegistered ? "\n" : ""}  Claude Code plugin ${plugin.key}  ${DIM}${plugin.installPath.replace(os.homedir(), "~")}${RESET}`);
  for (const f of files) console.log(`    ${tick(f.exists)} ${f.label} ${DIM}${f.path}${RESET}`);
  if (cliRegistered) {
    console.log(`\n  ${YELLOW}mcp-recall is registered twice:${RESET} by the plugin and by the entries above. Keep one:`);
    console.log(`    ${BOLD}mcp-recall uninstall${RESET}   ${DIM}# removes the CLI entries${RESET}`);
    console.log(`    ${BOLD}claude plugin uninstall ${plugin.key}${RESET}   ${DIM}# removes the plugin${RESET}`);
    return;
  }
  console.log(`  ${pad30("~/.claude/CLAUDE.md")}  ${tick(claudeMdOk)} mcp-recall instructions`);
  if (!filesOk) console.log(`\n  What is marked ${RED}✗${RESET} is gone: run ${BOLD}claude plugin update ${plugin.key}${RESET}`);
  if (!claudeMdOk) {
    console.log(`  Add the instructions yourself: see ${BOLD}https://github.com/sakebomb/mcp-recall/blob/main/docs/install.md#claude-instructions${RESET}`);
  }
}

function pad30(s: string): string {
  return s + " ".repeat(Math.max(0, 30 - s.length));
}

/** What status found of a CLI install (`mcp-recall install`): its entries and what they run. */
interface CliStatus {
  serverRegistered: boolean;
  ssRegistered: boolean;
  ptuRegistered: boolean;
  claudeMdOk: boolean;
  files: RegisteredFile[];
  elsewhere: boolean;
  server: Record<string, unknown> | undefined;
  launch: RecallLaunch;
}

/** The CLI install's part of status: its four entries, the files they run, and what to do. */
function printCliStatus(c: CliStatus): void {
  const tick = (ok: boolean) => (ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`);
  const filesOk = c.files.every((f) => f.exists);
  const fullyInstalled = c.serverRegistered && c.ssRegistered && c.ptuRegistered && c.claudeMdOk && filesOk;
  const label = fullyInstalled
    ? `${GREEN}installed${RESET}`
    : (c.serverRegistered || c.ssRegistered || c.ptuRegistered)
      ? `${YELLOW}partial / stale${RESET}`
      : `${RED}not installed${RESET}`;

  console.log(`\nInstallation: ${BOLD}${label}${RESET}\n`);

  console.log(`  ${pad30("~/.claude.json")}  ${tick(c.serverRegistered)} mcpServers.recall`);
  console.log(`  ${pad30("~/.claude/settings.json")}  ${tick(c.ssRegistered)} SessionStart hook`);
  console.log(`  ${pad30("")}  ${tick(c.ptuRegistered)} PostToolUse hook`);
  console.log(`  ${pad30("~/.claude/CLAUDE.md")}  ${tick(c.claudeMdOk)} mcp-recall instructions`);
  if (c.files.length > 0) {
    console.log("");
    console.log(`  ${pad30("Registered launch")}`);
    for (const f of c.files) {
      console.log(`  ${pad30(`  ${f.label}`)}  ${tick(f.exists)} ${DIM}${f.path}${RESET}`);
    }
  }
  if (c.elsewhere && c.server) {
    console.log("");
    console.log(`  Registered: ${describeLaunch(c.server["command"])}; this is ${describeLaunch(c.launch.server.command)}.`);
    console.log(`  Run ${BOLD}mcp-recall install${RESET} from this one to switch Claude Code to it.`);
  }

  if (!fullyInstalled) {
    console.log("");
    if (!filesOk) {
      console.log(`  Run ${BOLD}mcp-recall install${RESET} from the install Claude Code should use: what is marked ${RED}✗${RESET} is gone`);
    } else {
      console.log(`  Run ${BOLD}mcp-recall install${RESET}`);
    }
    if (!c.claudeMdOk) {
      console.log(`  Or add instructions manually: see ${BOLD}https://github.com/sakebomb/mcp-recall/blob/main/docs/install.md#claude-instructions${RESET}`);
    }
  }
}

export interface StatusOptions {
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
  pluginsPath?: string;
  /** Defaults to {@link detectLaunch}; tests pass one. */
  launch?: RecallLaunch;
  /** pi's config dir; defaults to {@link defaultPiDir}. */
  piDir?: string;
}

export async function statusCommand(opts: StatusOptions = {}): Promise<void> {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
    pluginsPath    = defaultPluginsPath(),
    launch         = detectLaunch(),
    piDir          = defaultPiDir(),
  } = opts;

  // Config entries
  const claudeJson   = await readJsonFile(claudeJsonPath);
  const settings     = await readJsonFile(settingsPath);
  const hooks        = (settings["hooks"] as Record<string, unknown[]>) ?? {};
  const mcpServers   = claudeJson["mcpServers"] as Record<string, unknown> | undefined;

  const server = mcpServers?.["recall"] as Record<string, unknown> | undefined;
  const ours   = recallHooks(knownClis(launch, server));

  const serverRegistered = !!server;
  const ssRegistered     = ((hooks["SessionStart"] as unknown[]) ?? []).some(ours.SessionStart.entry);
  const ptuRegistered    = ((hooks["PostToolUse"]  as unknown[]) ?? []).some(ours.PostToolUse.entry);

  // CLAUDE.md
  let claudeMdContent = "";
  try { claudeMdContent = await readFile(claudeMdPath, "utf8"); } catch { /* absent is ok */ }
  const claudeMdOk = isClaudeMdInjected(claudeMdContent);

  // What the registered entries run, which may be another install's (#364)
  const serverWords = typeof server?.["command"] === "string"
    ? [[server["command"], ...(Array.isArray(server["args"]) ? server["args"].map(String) : [])]]
    : [];
  const files = registeredFiles([
    ...serverWords,
    ...ourHookCommands(hooks["SessionStart"], ours.SessionStart).map(shellWords),
    ...ourHookCommands(hooks["PostToolUse"], ours.PostToolUse).map(shellWords),
  ]);
  const elsewhere = server !== undefined && !runsServer(server, launch.server);
  const cli: CliStatus = { serverRegistered, ssRegistered, ptuRegistered, claudeMdOk, files, elsewhere, server, launch };

  // A marketplace install writes none of the entries above: Claude Code runs the plugin's own (#456).
  const plugin = findPluginInstall(await readPluginRegistry(pluginsPath), settings);
  const cliRegistered = serverRegistered || ssRegistered || ptuRegistered;
  if (plugin?.enabled && !cliRegistered) {
    printPluginStatus(plugin, claudeMdOk, false);
  } else {
    printCliStatus(cli);
    if (plugin) printPluginStatus(plugin, claudeMdOk, cliRegistered);
  }

  await printPiStatus(piDir, launch);

  // Profiles
  console.log("");
  const profiles = loadProfiles();
  if (profiles.length === 0) {
    console.log(`  ${RED}✗${RESET} Profiles: none installed`);
    console.log(`    → Run: ${BOLD}mcp-recall profiles seed${RESET}`);
  } else {
    const counts = profiles.reduce<Record<string, number>>((acc, p) => {
      acc[p.tier] = (acc[p.tier] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ");
    console.log(`  ${GREEN}✓${RESET} Profiles: ${profiles.length} installed (${summary})`);
  }

  // Store footprint — nudge toward `gc` when the on-disk store is large.
  console.log("");
  const { totalBytes, dbCount } = storeFootprint();
  const reminderMb = loadConfig().store.gc_reminder_mb;
  const large = reminderMb > 0 && totalBytes >= reminderMb * 1024 * 1024;
  const storeIcon = large ? `${YELLOW}!${RESET}` : `${GREEN}✓${RESET}`;
  console.log(
    `  ${storeIcon} Store: ${formatBytes(totalBytes)} across ${dbCount} project database${dbCount === 1 ? "" : "s"}`
  );
  if (large) {
    console.log(`    → Reclaim space: ${BOLD}mcp-recall gc${RESET} (review, then re-run with ${BOLD}--force${RESET})`);
  }

  console.log("");
}
