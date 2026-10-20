/**
 * Startup for the standalone binary built by scripts/build-binary.ts (#361).
 *
 * A `bun build --compile` binary carries its files inside itself, but the
 * profile loader reads bundled profiles from a directory. So the binary's
 * entry embeds each profile file and calls {@link runBinary}, which copies
 * them out once per version and points the loader there through
 * RECALL_BUNDLED_PROFILES_PATH. Everything else is the ordinary CLI,
 * including `serve` for the MCP server.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

/** A bundled profile: its path under profiles/, and where the binary embeds it. */
export type EmbeddedProfile = [relativePath: string, embeddedPath: string];

const COMPLETE = ".complete";

/**
 * Copies `profiles` into `<baseDir>/<version>/` unless a complete copy is
 * already there, and returns that directory. The copy is written to a temp
 * directory and renamed into place, so two processes starting together never
 * read a half-written set: the loser of the rename keeps the winner's copy.
 */
export function extractProfiles(profiles: EmbeddedProfile[], version: string, baseDir: string): string {
  const dir = join(baseDir, version);
  if (existsSync(join(dir, COMPLETE))) return dir;
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  for (const [rel, src] of profiles) {
    const out = join(tmp, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, readFileSync(src));
  }
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, COMPLETE), "");
  try {
    rmSync(dir, { recursive: true, force: true }); // an incomplete copy from a crashed run
    renameSync(tmp, dir);
  } catch {
    rmSync(tmp, { recursive: true, force: true });
    if (!existsSync(join(dir, COMPLETE))) throw new Error(`could not extract bundled profiles to ${dir}`);
  }
  return dir;
}

export function defaultProfilesBaseDir(): string {
  return join(homedir(), ".local", "share", "mcp-recall", "bundled-profiles");
}

/** The binary's entry: bundled profiles first, then the CLI. */
export async function runBinary(profiles: EmbeddedProfile[]): Promise<void> {
  if (!process.env.RECALL_BUNDLED_PROFILES_PATH) {
    const { version } = await import("../package.json");
    try {
      process.env.RECALL_BUNDLED_PROFILES_PATH = extractProfiles(profiles, version, defaultProfilesBaseDir());
    } catch (err) {
      // Fail open: without bundled profiles the handlers still run.
      process.stderr.write(`[mcp-recall] warn: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  // A literal import, so the compiler embeds the server; cli.ts imports it by
  // path to keep it out of the npm bundle.
  if (process.argv[2] === "serve") {
    await import("./server");
    return;
  }
  const { main } = await import("./cli");
  await main();
}
