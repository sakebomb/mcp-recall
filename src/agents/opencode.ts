/**
 * OpenCode support for install / uninstall / status (#474).
 *
 * OpenCode loads every .ts file in its plugins dir. `install` writes
 * src/agents/opencode-plugin.ts, verbatim, to <config>/opencode/plugins/mcp-recall.ts,
 * with mcp-recall.launch.json beside it saying how to run this install of
 * mcp-recall. The plugin registers the `recall` MCP server itself, so the user's
 * opencode.json is never edited.
 */
import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
// Embedded as text so the bundle and the standalone binary can write it out.
// TypeScript types a text import as the module, which has no default export on
// purpose: OpenCode would load a default export as a second copy of the plugin.
// @ts-expect-error -- the default of a text import is the file's source
import pluginSource from "./opencode-plugin" with { type: "text" };
import type { Launch } from "./opencode-plugin";

export const OPENCODE_PLUGIN_SOURCE: string = pluginSource as unknown as string;

/** OpenCode's config dir: $XDG_CONFIG_HOME/opencode, else ~/.config/opencode, as OpenCode resolves it. */
export function defaultOpencodeDir(): string {
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode");
}

/** OpenCode counts as installed when its config dir exists. */
export function opencodeDetected(dir: string): boolean {
  return existsSync(dir);
}

export function opencodePluginPath(dir: string): string {
  return path.join(dir, "plugins", "mcp-recall.ts");
}

function launchPath(dir: string): string {
  return path.join(dir, "plugins", "mcp-recall.launch.json");
}

async function readText(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

export type OpencodeInstallResult = "added" | "updated" | "present";

/** Writes the plugin and its launch file; reports whether anything changed. */
export async function installOpencode(dir: string, launch: Launch, dryRun = false): Promise<OpencodeInstallResult> {
  const launchJson = JSON.stringify(launch, null, 2) + "\n";
  const [oldPlugin, oldLaunch] = await Promise.all([readText(opencodePluginPath(dir)), readText(launchPath(dir))]);
  if (oldPlugin === OPENCODE_PLUGIN_SOURCE && oldLaunch === launchJson) return "present";
  if (!dryRun) {
    await mkdir(path.join(dir, "plugins"), { recursive: true });
    await writeFile(opencodePluginPath(dir), OPENCODE_PLUGIN_SOURCE);
    await writeFile(launchPath(dir), launchJson);
  }
  return oldPlugin === null && oldLaunch === null ? "added" : "updated";
}

/** Removes the plugin and its launch file, and nothing else in the plugins dir; true when there was one. */
export async function uninstallOpencode(dir: string): Promise<boolean> {
  const files = [opencodePluginPath(dir), launchPath(dir)].filter((p) => existsSync(p));
  await Promise.all(files.map((p) => rm(p, { force: true })));
  return files.length > 0;
}

export interface OpencodeStatus {
  plugin: boolean;
  /** The launch file the plugin will run, or null when absent or unreadable. */
  launch: Launch | null;
  /** The installed plugin differs from this version's: re-run install. */
  stale: boolean;
}

export async function opencodeStatus(dir: string): Promise<OpencodeStatus> {
  const plugin = await readText(opencodePluginPath(dir));
  let launch: Launch | null = null;
  try {
    const parsed = JSON.parse((await readText(launchPath(dir))) ?? "") as Launch;
    if (Array.isArray(parsed.cli) && typeof parsed.server?.command === "string") launch = parsed;
  } catch { /* absent or malformed */ }
  return { plugin: plugin !== null, launch, stale: plugin !== null && plugin !== OPENCODE_PLUGIN_SOURCE };
}
