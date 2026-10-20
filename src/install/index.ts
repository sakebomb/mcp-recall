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
import { mkdir, rename, readFile } from "fs/promises";
import path from "path";
import os from "os";
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
 * True inside a `bun build --compile` binary, whose modules live under a virtual
 * root: `/$bunfs/` on POSIX, `B:\~BUN\` on Windows. `Bun.isStandaloneExecutable`
 * says so directly in newer Bun; the path is the fallback for older ones.
 */
export function isStandaloneBinary(modulePath = import.meta.path): boolean {
  const flag = (Bun as { isStandaloneExecutable?: unknown }).isStandaloneExecutable;
  if (typeof flag === "boolean") return flag;
  return /^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(modulePath);
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
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  const tmp = filePath + ".tmp";
  await Bun.write(tmp, content);
  await rename(tmp, filePath);
}

// ── CLAUDE.md helpers ─────────────────────────────────────────────────────────

export const CLAUDE_MD_MARKER_START = "<!-- BEGIN mcp-recall -->";
export const CLAUDE_MD_MARKER_END   = "<!-- END mcp-recall -->";

export const CLAUDE_MD_SNIPPET = `## mcp-recall

Session context from previous sessions is automatically injected at startup (pinned items, notes, recent activity). If it was truncated, call \`recall__context()\` for the full view.

When a tool output was compressed by mcp-recall (you'll see a summary with a recall ID like \`recall_abc123\`), call \`recall__retrieve("recall_abc123")\` when you need the full content.

Proactively:
- \`recall__note("…")\` — save important decisions or context worth keeping across sessions
- \`recall__pin("recall_abc123")\` — protect frequently-needed items from expiry and eviction
- \`recall__search("query")\` — find stored outputs by content when you don't have an ID`;

export const CLAUDE_MD_BLOCK = `${CLAUDE_MD_MARKER_START}\n${CLAUDE_MD_SNIPPET}\n${CLAUDE_MD_MARKER_END}`;

async function writeTextFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  await Bun.write(tmp, content);
  await rename(tmp, filePath);
}

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
export const POST_TOOL_USE_MATCHER = "(mcp__(?!recall__).*|Bash)";

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

/** True for one hook (not an entry) that runs recall's `marker` subcommand. */
function isOurHookCommand(hook: unknown, marker: string): boolean {
  const cmd = (hook as Record<string, unknown> | null)?.["command"];
  return typeof cmd === "string" && cmd.includes("recall") && cmd.includes(marker);
}

export function isOurSessionStartHook(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const hooks = (entry as Record<string, unknown>)["hooks"];
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h) => isOurHookCommand(h, SESSION_START_MARKER));
}

export function isOurPostToolUseHook(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["matcher"] !== POST_TOOL_USE_MATCHER) return false;
  const hooks = e["hooks"];
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h) => isOurHookCommand(h, POST_TOOL_USE_MARKER));
}

/**
 * Adds `fresh` to `entries`, or points recall's existing hook at fresh's command.
 * An update changes that hook's `command` and nothing else: a timeout the user
 * raised, and other hooks they grouped into the same entry, stay (#365).
 */
export function upsertHook(
  entries: unknown[],
  isOurs: (entry: unknown) => boolean,
  marker: string,
  fresh: HookEntry,
): { entries: unknown[]; result: "added" | "updated" | "present" } {
  const idx = entries.findIndex(isOurs);
  if (idx === -1) return { entries: [...entries, fresh], result: "added" };
  const entry = entries[idx] as HookEntry;
  const ours = entry.hooks.find((h) => isOurHookCommand(h, marker));
  const command = fresh.hooks[0]!.command;
  if (ours?.command === command) return { entries, result: "present" };
  const updated = { ...entry, hooks: entry.hooks.map((h) => (h === ours ? { ...h, command } : h)) };
  return { entries: entries.map((e, i) => (i === idx ? updated : e)), result: "updated" };
}

// ── install ───────────────────────────────────────────────────────────────────

export interface InstallOptions {
  dryRun?: boolean;
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
  /** Defaults to {@link detectLaunch}; tests pass one. */
  launch?: RecallLaunch;
}

export async function installCommand(opts: InstallOptions = {}): Promise<void> {
  const {
    dryRun         = false,
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
    launch         = detectLaunch(),
  } = opts;

  const missing = launch.artifacts.find((a) => !existsSync(a.path));
  if (missing) {
    console.error(`${RED}✗ Build artifacts not found.${RESET}`);
    console.error(`  Expected: ${DIM}${missing.path}${RESET}`);
    console.error(`  Run ${BOLD}bun run build${RESET} first.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`${DIM}dry run — no files will be modified${RESET}\n`);
  }

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

  // SessionStart
  const ss = upsertHook(
    (hooks["SessionStart"] as unknown[]) ?? [], isOurSessionStartHook,
    SESSION_START_MARKER, makeSessionStartEntry(launch.cli),
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
    (hooks["PostToolUse"] as unknown[]) ?? [], isOurPostToolUseHook,
    POST_TOOL_USE_MARKER, makePostToolUseEntry(launch.cli),
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
    console.log(`\nNext steps:`);
    console.log(`  Install compression profiles for your MCPs:`);
    console.log(`    ${BOLD}mcp-recall profiles seed${RESET}`);
    console.log(`\n  Optional — enable shell completions:`);
    console.log(`    ${BOLD}mcp-recall completions zsh > ~/.zfunc/_mcp-recall${RESET}   ${DIM}# zsh${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions bash >> ~/.bash_completion${RESET}    ${DIM}# bash${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions fish > ~/.config/fish/completions/mcp-recall.fish${RESET}  ${DIM}# fish${RESET}`);
  }
}

// ── uninstall ─────────────────────────────────────────────────────────────────

export interface UninstallOptions {
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
}

export async function uninstallCommand(opts: UninstallOptions = {}): Promise<void> {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
  } = opts;

  let anyChange = false;

  // ~/.claude.json
  const claudeJson = await readJsonFile(claudeJsonPath);
  const mcpServers = claudeJson["mcpServers"] as Record<string, unknown> | undefined;
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

  const ssHooks  = (hooks["SessionStart"] as unknown[]) ?? [];
  const ssIdx    = ssHooks.findIndex(isOurSessionStartHook);
  if (ssIdx !== -1) {
    hooks["SessionStart"] = ssHooks.filter((_, i) => i !== ssIdx);
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}✓${RESET} Removed SessionStart hook   ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}ℹ SessionStart hook not present${RESET}`);
  }

  const ptuHooks = (hooks["PostToolUse"] as unknown[]) ?? [];
  const ptuIdx   = ptuHooks.findIndex(isOurPostToolUseHook);
  if (ptuIdx !== -1) {
    hooks["PostToolUse"] = ptuHooks.filter((_, i) => i !== ptuIdx);
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

/** The commands of recall's own hooks among an event's entries, not their neighbours'. */
function ourHookCommands(entries: unknown, isOurs: (e: unknown) => boolean, marker: string): string[] {
  return ((entries as unknown[] | undefined) ?? [])
    .filter(isOurs)
    .flatMap((e) => (e as HookEntry).hooks.filter((h) => isOurHookCommand(h, marker)).map((h) => h.command));
}

export interface StatusOptions {
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
  /** Defaults to {@link detectLaunch}; tests pass one. */
  launch?: RecallLaunch;
}

export async function statusCommand(opts: StatusOptions = {}): Promise<void> {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
    launch         = detectLaunch(),
  } = opts;

  function tick(ok: boolean) { return ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`; }
  function pad(s: string, n: number) { return s + " ".repeat(Math.max(0, n - s.length)); }

  // Config entries
  const claudeJson   = await readJsonFile(claudeJsonPath);
  const settings     = await readJsonFile(settingsPath);
  const hooks        = (settings["hooks"] as Record<string, unknown[]>) ?? {};
  const mcpServers   = claudeJson["mcpServers"] as Record<string, unknown> | undefined;

  const serverRegistered = !!mcpServers?.["recall"];
  const ssRegistered     = ((hooks["SessionStart"] as unknown[]) ?? []).some(isOurSessionStartHook);
  const ptuRegistered    = ((hooks["PostToolUse"]  as unknown[]) ?? []).some(isOurPostToolUseHook);

  // CLAUDE.md
  let claudeMdContent = "";
  try { claudeMdContent = await readFile(claudeMdPath, "utf8"); } catch { /* absent is ok */ }
  const claudeMdOk = isClaudeMdInjected(claudeMdContent);

  // What the registered entries run, which may be another install's (#364)
  const server = mcpServers?.["recall"] as Record<string, unknown> | undefined;
  const serverWords = typeof server?.["command"] === "string"
    ? [[server["command"], ...(Array.isArray(server["args"]) ? server["args"].map(String) : [])]]
    : [];
  const files = registeredFiles([
    ...serverWords,
    ...ourHookCommands(hooks["SessionStart"], isOurSessionStartHook, SESSION_START_MARKER).map(shellWords),
    ...ourHookCommands(hooks["PostToolUse"], isOurPostToolUseHook, POST_TOOL_USE_MARKER).map(shellWords),
  ]);
  const filesOk   = files.every((f) => f.exists);
  const elsewhere = server !== undefined && !runsServer(server, launch.server);

  const fullyInstalled = serverRegistered && ssRegistered && ptuRegistered && claudeMdOk && filesOk;
  const label = fullyInstalled
    ? `${GREEN}installed${RESET}`
    : (serverRegistered || ssRegistered || ptuRegistered)
      ? `${YELLOW}partial / stale${RESET}`
      : `${RED}not installed${RESET}`;

  console.log(`\nInstallation: ${BOLD}${label}${RESET}\n`);

  console.log(`  ${pad("~/.claude.json", 30)}  ${tick(serverRegistered)} mcpServers.recall`);
  console.log(`  ${pad("~/.claude/settings.json", 30)}  ${tick(ssRegistered)} SessionStart hook`);
  console.log(`  ${pad("", 30)}  ${tick(ptuRegistered)} PostToolUse hook`);
  console.log(`  ${pad("~/.claude/CLAUDE.md", 30)}  ${tick(claudeMdOk)} mcp-recall instructions`);
  if (files.length > 0) {
    console.log("");
    console.log(`  ${pad("Registered launch", 30)}`);
    for (const f of files) {
      console.log(`  ${pad(`  ${f.label}`, 30)}  ${tick(f.exists)} ${DIM}${f.path}${RESET}`);
    }
  }
  if (elsewhere) {
    console.log("");
    console.log(`  Registered: ${describeLaunch(server["command"])}; this is ${describeLaunch(launch.server.command)}.`);
    console.log(`  Run ${BOLD}mcp-recall install${RESET} from this one to switch Claude Code to it.`);
  }

  if (!fullyInstalled) {
    console.log("");
    if (!filesOk) {
      console.log(`  Run ${BOLD}mcp-recall install${RESET} from the install Claude Code should use: what is marked ${RED}✗${RESET} is gone`);
    } else {
      console.log(`  Run ${BOLD}mcp-recall install${RESET}`);
    }
    if (!claudeMdOk) {
      console.log(`  Or add instructions manually: see ${BOLD}docs/quickstart.md${RESET}`);
    }
  }

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
