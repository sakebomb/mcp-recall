/**
 * pi support for install / uninstall / status (#458).
 *
 * pi has no settings file to register hooks in. An extension does that job:
 * `install` writes src/agents/pi-extension.ts, verbatim, to
 * <pi dir>/extensions/mcp-recall/index.ts, with a launch.json beside it that
 * says how to run this install of mcp-recall. The extension registers the
 * `recall` MCP server itself, so pi's mcp.json is never edited.
 */
import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
// Embedded as text so the bundle and the standalone binary can write it out.
import extensionSource from "./pi-extension" with { type: "text" };
import type { Launch } from "./pi-extension";

/** pi's config dir: PI_CODING_AGENT_DIR when set, else ~/.pi/agent, as pi resolves it. */
export function defaultPiDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}

/** pi counts as installed when its config dir exists. */
export function piDetected(piDir: string): boolean {
  return existsSync(piDir);
}

export function piExtensionDir(piDir: string): string {
  return path.join(piDir, "extensions", "mcp-recall");
}

export const PI_EXTENSION_SOURCE: string = extensionSource as unknown as string;

/** launch.json for a launch, in the shape the extension reads. */
export function piLaunch(cliWords: string[], server: { command: string; args: string[] }): Launch {
  return { cli: cliWords, server: { command: server.command, args: server.args } };
}

async function readText(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

export type PiInstallResult = "added" | "updated" | "present";

/** Writes the extension and its launch.json; reports whether anything changed. */
export async function installPi(piDir: string, launch: Launch, dryRun = false): Promise<PiInstallResult> {
  const dir = piExtensionDir(piDir);
  const indexPath = path.join(dir, "index.ts");
  const launchPath = path.join(dir, "launch.json");
  const launchJson = JSON.stringify(launch, null, 2) + "\n";
  const [oldIndex, oldLaunch] = await Promise.all([readText(indexPath), readText(launchPath)]);
  if (oldIndex === PI_EXTENSION_SOURCE && oldLaunch === launchJson) return "present";
  if (!dryRun) {
    await mkdir(dir, { recursive: true });
    await writeFile(indexPath, PI_EXTENSION_SOURCE);
    await writeFile(launchPath, launchJson);
  }
  return oldIndex === null && oldLaunch === null ? "added" : "updated";
}

/** Removes the extension dir; true when there was one. */
export async function uninstallPi(piDir: string): Promise<boolean> {
  const dir = piExtensionDir(piDir);
  if (!existsSync(dir)) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}

export interface PiStatus {
  extension: boolean;
  /** The launch.json the extension will run, or null when absent or unreadable. */
  launch: Launch | null;
  /** The installed extension differs from this version's: re-run install. */
  stale: boolean;
}

export async function piStatus(piDir: string): Promise<PiStatus> {
  const dir = piExtensionDir(piDir);
  const index = await readText(path.join(dir, "index.ts"));
  let launch: Launch | null = null;
  try {
    const parsed = JSON.parse((await readText(path.join(dir, "launch.json"))) ?? "") as Launch;
    if (Array.isArray(parsed.cli) && typeof parsed.server?.command === "string") launch = parsed;
  } catch { /* absent or malformed */ }
  return { extension: index !== null, launch, stale: index !== null && index !== PI_EXTENSION_SOURCE };
}
