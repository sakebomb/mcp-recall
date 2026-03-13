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

// ── Dist path detection ───────────────────────────────────────────────────────

export interface RecallPaths {
  serverJs: string;
  cliJs: string;
}

export function detectPaths(): RecallPaths {
  // import.meta.path is the absolute path of the currently executing file.
  // Running from src/install/index.ts (dev): dist is ../../plugins/mcp-recall/dist/
  // Running from dist/cli.js (built):        dist is import.meta.dir itself.
  const isBuilt = import.meta.path.endsWith(".js");
  const distDir = isBuilt
    ? import.meta.dir
    : path.resolve(import.meta.dir, "../../plugins/mcp-recall/dist");

  return {
    serverJs: path.join(distDir, "server.js"),
    cliJs:    path.join(distDir, "cli.js"),
  };
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

export async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch (e: any) {
    if (e.code === "ENOENT") return {};
    throw new Error(`Cannot parse ${filePath}: ${e.message}`);
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
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
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
  } catch (e: any) {
    if (e.code === "ENOENT") return false;
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

export function makeSessionStartEntry(cliJs: string) {
  return {
    hooks: [{ type: "command", command: `bun ${cliJs} session-start`, timeout: 10 }],
  };
}

export function makePostToolUseEntry(cliJs: string) {
  return {
    matcher: POST_TOOL_USE_MATCHER,
    hooks: [{ type: "command", command: `bun ${cliJs} post-tool-use`, timeout: 10 }],
  };
}

// ── Hook detectors ────────────────────────────────────────────────────────────

export function isOurSessionStartHook(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const hooks = (entry as Record<string, unknown>)["hooks"];
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h) => {
    const cmd = (h as Record<string, unknown>)["command"];
    return typeof cmd === "string"
      && cmd.includes("recall")
      && cmd.includes(SESSION_START_MARKER);
  });
}

export function isOurPostToolUseHook(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["matcher"] !== POST_TOOL_USE_MATCHER) return false;
  const hooks = e["hooks"];
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h) => {
    const cmd = (h as Record<string, unknown>)["command"];
    return typeof cmd === "string"
      && cmd.includes("recall")
      && cmd.includes(POST_TOOL_USE_MARKER);
  });
}

// ── install ───────────────────────────────────────────────────────────────────

export interface InstallOptions {
  dryRun?: boolean;
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
}

export async function installCommand(opts: InstallOptions = {}): Promise<void> {
  const {
    dryRun         = false,
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
  } = opts;

  const paths = detectPaths();

  if (!existsSync(paths.serverJs) || !existsSync(paths.cliJs)) {
    console.error(`${RED}✗ Build artifacts not found.${RESET}`);
    console.error(`  Expected: ${DIM}${paths.serverJs}${RESET}`);
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
  const newServer  = { type: "stdio", command: "bun", args: [paths.serverJs] };
  const existing   = mcpServers["recall"] as Record<string, unknown> | undefined;
  const currentServerPath = (existing?.["args"] as string[])?.[0];

  if (!existing) {
    if (!dryRun) {
      claudeJson["mcpServers"] = { ...mcpServers, recall: newServer };
      await writeJsonFile(claudeJsonPath, claudeJson);
    }
    console.log(`${GREEN}✓${RESET} MCP server registered     ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else if (currentServerPath !== paths.serverJs) {
    if (!dryRun) {
      claudeJson["mcpServers"] = { ...mcpServers, recall: newServer };
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
  const ssHooks  = (hooks["SessionStart"] as unknown[]) ?? [];
  const ssIdx    = ssHooks.findIndex(isOurSessionStartHook);
  const newSS    = makeSessionStartEntry(paths.cliJs);

  if (ssIdx === -1) {
    hooks["SessionStart"] = [...ssHooks, newSS];
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}✓${RESET} SessionStart hook added    ${DIM}(${settingsPath})${RESET}`);
  } else {
    const currentCmd = ((ssHooks[ssIdx] as any)?.hooks?.[0]?.command as string | undefined);
    if (currentCmd !== newSS.hooks[0].command) {
      ssHooks[ssIdx] = newSS;
      hooks["SessionStart"] = ssHooks;
      settingsChanged = true;
      anyChange = true;
      console.log(`${YELLOW}↺${RESET} SessionStart hook updated   ${DIM}(${settingsPath})${RESET}`);
    } else {
      console.log(`${DIM}ℹ SessionStart hook already registered${RESET}`);
    }
  }

  // PostToolUse
  const ptuHooks = (hooks["PostToolUse"] as unknown[]) ?? [];
  const ptuIdx   = ptuHooks.findIndex(isOurPostToolUseHook);
  const newPTU   = makePostToolUseEntry(paths.cliJs);

  if (ptuIdx === -1) {
    hooks["PostToolUse"] = [...ptuHooks, newPTU];
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}✓${RESET} PostToolUse hook added     ${DIM}(${settingsPath})${RESET}`);
  } else {
    const currentCmd = ((ptuHooks[ptuIdx] as any)?.hooks?.[0]?.command as string | undefined);
    if (currentCmd !== newPTU.hooks[0].command) {
      ptuHooks[ptuIdx] = newPTU;
      hooks["PostToolUse"] = ptuHooks;
      settingsChanged = true;
      anyChange = true;
      console.log(`${YELLOW}↺${RESET} PostToolUse hook updated    ${DIM}(${settingsPath})${RESET}`);
    } else {
      console.log(`${DIM}ℹ PostToolUse hook already registered${RESET}`);
    }
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
    console.log(`    ${BOLD}mcp-recall completions zsh >> ~/.zfunc/_mcp-recall${RESET}   ${DIM}# zsh${RESET}`);
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

export interface StatusOptions {
  claudeJsonPath?: string;
  settingsPath?: string;
  claudeMdPath?: string;
}

export async function statusCommand(opts: StatusOptions = {}): Promise<void> {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath   = defaultSettingsPath(),
    claudeMdPath   = defaultClaudeMdPath(),
  } = opts;

  const recallPaths = detectPaths();

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

  // Build artifacts
  const serverExists = existsSync(recallPaths.serverJs);
  const cliExists    = existsSync(recallPaths.cliJs);

  const fullyInstalled = serverRegistered && ssRegistered && ptuRegistered && claudeMdOk && serverExists && cliExists;
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
  console.log("");
  console.log(`  ${pad("Build artifacts", 30)}`);
  console.log(`  ${pad("  dist/server.js", 30)}  ${tick(serverExists)} ${DIM}${recallPaths.serverJs}${RESET}`);
  console.log(`  ${pad("  dist/cli.js", 30)}  ${tick(cliExists)} ${DIM}${recallPaths.cliJs}${RESET}`);

  if (!fullyInstalled) {
    console.log("");
    if (!serverExists || !cliExists) {
      console.log(`  Run ${BOLD}bun run build${RESET} then ${BOLD}mcp-recall install${RESET}`);
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

  console.log("");
}
