/**
 * User-facing `mcp-recall profiles <subcommand>` commands.
 *
 * Subcommands:
 *   list              — show all installed profiles across all tiers
 *   install <id>      — download a community profile by ID
 *   update            — update all installed community profiles
 *   remove <id>       — delete an installed community profile
 *   seed              — install community profiles for all detected MCPs
 *   feed [path]       — contribute a local profile back to the community repo
 *   check             — detect pattern conflicts between installed profiles
 *   test <name>       — apply a profile to a stored or file input and show the result
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { parse } from "smol-toml";
import { loadProfiles, clearProfileCache } from "./loader";
import { resolveProfile } from "./index";
import { getHandler } from "../handlers/index";
import { getDb, defaultDbPath } from "../db/index";
import { getProjectKey } from "../project-key";
import type { LoadedProfile } from "./types";
import { handleRetrainCommand } from "../learn/retrain";
import { isDenied } from "../denylist";
import { loadConfig } from "../config";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/manifest.json";
const PROFILE_BASE_URL =
  "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/";
const COMMUNITY_REPO = "sakebomb/mcp-recall-profiles";

// ── input validation helpers ──────────────────────────────────────────────────

const SAFE_ID_RE = /^[a-z0-9_-]+$/;
const SAFE_FILE_RE = /^profiles\/[a-z0-9_-]+\/[a-z0-9_.-]+\.toml$/;

function assertSafeId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(
      `Invalid profile id "${id}": must match /^[a-z0-9_-]+$/ (no path separators or special characters).`
    );
  }
}

function assertSafeFile(file: string): void {
  if (!SAFE_FILE_RE.test(file)) {
    throw new Error(
      `Invalid profile file path "${file}": must match profiles/<id>/<name>.toml and contain no path traversal.`
    );
  }
}

/** Strip ANSI escape sequences and non-printable control characters. */
function sanitize(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]|\x9B|\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

// ── directory helpers ─────────────────────────────────────────────────────────

function communityDir(): string {
  return (
    process.env.RECALL_COMMUNITY_PROFILES_PATH ??
    join(homedir(), ".local", "share", "mcp-recall", "profiles", "community")
  );
}

function userDir(): string {
  return (
    process.env.RECALL_USER_PROFILES_PATH ??
    join(homedir(), ".config", "mcp-recall", "profiles")
  );
}

// ── manifest types + fetch ────────────────────────────────────────────────────

interface ManifestEntry {
  id: string;
  version: string;
  description: string;
  mcp_pattern: string | string[];
  file: string;
  sha256?: string;
  author?: string;
}

async function fetchManifest(): Promise<ManifestEntry[]> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { profiles: ManifestEntry[] };
  return data.profiles;
}

async function fetchProfileContent(filePath: string): Promise<string> {
  const res = await fetch(`${PROFILE_BASE_URL}${filePath}`);
  if (!res.ok) throw new Error(`profile fetch failed (${filePath}): ${res.status}`);
  return res.text();
}

function verifyHash(content: string, expected: string | undefined, id: string): void {
  if (!expected) {
    // Older manifest without sha256 — skip verification
    return;
  }
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `Profile ${id}: hash mismatch (expected ${expected.slice(0, 8)}…, got ${actual.slice(0, 8)}…)`
    );
  }
}

function saveToCommunitDir(profileId: string, content: string): string {
  const dir = join(communityDir(), profileId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "default.toml");
  writeFileSync(filePath, content);
  return filePath;
}

// ── installed community profile index ────────────────────────────────────────

function installedCommunityMap(): Map<string, string> {
  const map = new Map<string, string>(); // id → version
  let entries: string[];
  try {
    entries = readdirSync(communityDir());
  } catch {
    return map;
  }
  for (const entry of entries) {
    const toml = join(communityDir(), entry, "default.toml");
    try {
      const p = parse(readFileSync(toml, "utf8")) as Record<string, unknown>;
      const version = (p["profile"] as Record<string, unknown>)["version"] as string;
      map.set(entry, version ?? "0.0.0");
    } catch {
      /* skip */
    }
  }
  return map;
}

// ── pattern overlap detection ─────────────────────────────────────────────────

export function patternsOverlap(a: string, b: string): boolean {
  const aExact = !a.endsWith("*");
  const bExact = !b.endsWith("*");
  if (aExact && bExact) return a === b;
  if (aExact) return a.startsWith(b.slice(0, -1));
  if (bExact) return b.startsWith(a.slice(0, -1));
  const aPrefix = a.slice(0, -1);
  const bPrefix = b.slice(0, -1);
  return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
}

// ── list ──────────────────────────────────────────────────────────────────────

export function cmdList(args: string[]): void {
  const machineReadable = args.includes("--machine-readable");
  const profiles = loadProfiles();

  if (machineReadable) {
    for (const p of profiles) {
      process.stdout.write(sanitize(p.spec.profile.id) + "\n");
    }
    return;
  }

  if (profiles.length === 0) {
    console.log("No profiles installed.");
    console.log("Run: mcp-recall profiles seed");
    return;
  }

  const COL = { id: 28, tier: 10, pattern: 22 };
  const header =
    "ID".padEnd(COL.id) +
    "  " +
    "Tier".padEnd(COL.tier) +
    "  " +
    "Pattern".padEnd(COL.pattern) +
    "  Description";

  console.log(`\n${header}`);
  console.log("─".repeat(Math.min(header.length, 100)));

  for (const p of profiles) {
    const id = sanitize(p.spec.profile.id).slice(0, COL.id - 1).padEnd(COL.id);
    const tier = p.tier.padEnd(COL.tier);
    const pattern = (p.patterns[0] ?? "").slice(0, COL.pattern - 1).padEnd(COL.pattern);
    const desc = sanitize(p.spec.profile.description).slice(0, 55);
    console.log(`${id}  ${tier}  ${pattern}  ${desc}`);
  }

  const counts = profiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.tier] = (acc[p.tier] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([t, n]) => `${n} ${t}`)
    .join(", ");
  console.log(`\n${profiles.length} total (${summary})\n`);
}

// ── install ───────────────────────────────────────────────────────────────────

async function cmdInstall(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("Usage: mcp-recall profiles install <id>");
    process.exit(1);
  }

  process.stdout.write("Fetching manifest… ");
  const entries = await fetchManifest();
  const entry = entries.find((e) => e.id === id);
  console.log("done");

  if (!entry) {
    console.error(`Profile "${id}" not found.`);
    console.log(`Available:\n${entries.map((e) => `  ${e.id}`).join("\n")}`);
    process.exit(1);
  }

  assertSafeId(entry.id);
  assertSafeFile(entry.file);
  process.stdout.write(`Installing ${sanitize(entry.id)} v${sanitize(entry.version)}… `);
  const content = await fetchProfileContent(entry.file);
  verifyHash(content, entry.sha256, entry.id);
  const filePath = saveToCommunitDir(entry.id, content);
  clearProfileCache();
  console.log(`done\n✓ ${filePath}`);
}

// ── update ────────────────────────────────────────────────────────────────────

async function cmdUpdate(): Promise<void> {
  const installed = installedCommunityMap();
  if (installed.size === 0) {
    console.log("No community profiles installed.");
    return;
  }

  process.stdout.write("Fetching manifest… ");
  const entries = await fetchManifest();
  console.log("done\n");

  let updated = 0;
  for (const [id, currentVersion] of installed) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      console.log(`  ${id}: not in registry (skipped)`);
      continue;
    }
    if (entry.version === currentVersion) {
      console.log(`  ${id}: up to date (${currentVersion})`);
      continue;
    }
    assertSafeId(entry.id);
    assertSafeFile(entry.file);
    const content = await fetchProfileContent(entry.file);
    verifyHash(content, entry.sha256, entry.id);
    saveToCommunitDir(id, content);
    console.log(`  ✓ ${id}: ${currentVersion} → ${entry.version}`);
    updated++;
  }

  clearProfileCache();
  console.log(`\n${updated} profile(s) updated.`);
}

// ── remove ────────────────────────────────────────────────────────────────────

function cmdRemove(args: string[]): void {
  const id = args[0];
  if (!id) {
    console.error("Usage: mcp-recall profiles remove <id>");
    process.exit(1);
  }

  assertSafeId(id);

  const dir = join(communityDir(), id);
  try {
    statSync(dir);
  } catch {
    console.error(`"${id}" is not installed.`);
    process.exit(1);
  }

  rmSync(dir, { recursive: true });
  clearProfileCache();
  console.log(`✓ Removed ${id}`);
}

// ── seed ──────────────────────────────────────────────────────────────────────

export async function cmdSeed(args: string[]): Promise<void> {
  const all = args.includes("--all");

  process.stdout.write("Fetching manifest… ");
  const entries = await fetchManifest();
  console.log("done\n");

  const installed = installedCommunityMap();
  let installCount = 0;
  let alreadyCount = 0;

  if (all) {
    for (const entry of entries) {
      if (installed.has(entry.id)) {
        console.log(`    ${entry.id}: already installed`);
        alreadyCount++;
        continue;
      }
      assertSafeId(entry.id);
      assertSafeFile(entry.file);
      const content = await fetchProfileContent(entry.file);
      verifyHash(content, entry.sha256, entry.id);
      saveToCommunitDir(entry.id, content);
      console.log(`  ✓ ${entry.id} installed`);
      installCount++;
    }
    clearProfileCache();
    console.log(`\n${installCount} profile(s) installed (${alreadyCount} already installed, ${entries.length} total available)`);
    return;
  }

  let serverKeys: string[] = [];
  try {
    const raw = JSON.parse(
      readFileSync(join(homedir(), ".claude.json"), "utf8")
    ) as Record<string, unknown>;
    const mcpServers = raw["mcpServers"] as Record<string, unknown> | undefined;
    serverKeys = Object.keys(mcpServers ?? {}).filter((k) => k !== "recall");
  } catch {
    console.log("Could not read ~/.claude.json — no MCPs detected.");
    return;
  }

  if (serverKeys.length === 0) {
    console.log("No MCP servers found in ~/.claude.json (other than recall).");
    return;
  }

  console.log(`Detected MCPs: ${serverKeys.join(", ")}`);

  for (const key of serverKeys) {
    const prefix = `mcp__${key.replace(/-/g, "_")}__`;
    const matches = entries.filter((e) => {
      const patterns = Array.isArray(e.mcp_pattern) ? e.mcp_pattern : [e.mcp_pattern];
      return patterns.some((pat) => {
        const stripped = pat.endsWith("*") ? pat.slice(0, -1) : pat;
        return stripped === prefix || prefix.startsWith(stripped);
      });
    });

    if (matches.length === 0) {
      console.log(`  ${key}: no community profile available`);
      continue;
    }

    for (const entry of matches) {
      if (installed.has(entry.id)) {
        console.log(`  ${entry.id}: already installed`);
        alreadyCount++;
        continue;
      }
      assertSafeId(entry.id);
      assertSafeFile(entry.file);
      const content = await fetchProfileContent(entry.file);
      verifyHash(content, entry.sha256, entry.id);
      saveToCommunitDir(entry.id, content);
      console.log(`  ✓ ${entry.id} installed (matched ${key})`);
      installCount++;
    }
  }

  clearProfileCache();
  console.log(`\n${installCount} profile(s) installed.`);
}

// ── feed ──────────────────────────────────────────────────────────────────────

function cmdFeed(args: string[]): void {
  const profilePath = args[0];

  if (!profilePath) {
    const dir = userDir();
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith(".toml")) files.push(join(dir, entry));
      }
    } catch {
      /* dir doesn't exist */
    }
    console.log("Usage: mcp-recall profiles feed <path-to-profile.toml>");
    if (files.length > 0) {
      console.log("\nYour local profiles:");
      for (const f of files) console.log(`  ${f}`);
    }
    return;
  }

  let content: string;
  try {
    content = readFileSync(profilePath, "utf8");
  } catch {
    console.error(`Cannot read: ${profilePath}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (e) {
    console.error(`Invalid TOML: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const meta = (parsed as Record<string, unknown>)["profile"] as
    | Record<string, unknown>
    | undefined;
  if (!meta?.["id"] || !meta?.["version"] || !meta?.["mcp_pattern"]) {
    console.error("Profile missing required fields (id, version, mcp_pattern).");
    process.exit(1);
  }

  const id = meta["id"] as string;
  const patterns = Array.isArray(meta["mcp_pattern"])
    ? (meta["mcp_pattern"] as string[]).join(", ")
    : (meta["mcp_pattern"] as string);

  console.log(`\nProfile: ${id} (v${meta["version"]})`);
  console.log(`Pattern: ${patterns}`);
  console.log(`\nTo submit to the community repo:`);
  console.log(`  1. Fork https://github.com/${COMMUNITY_REPO}`);
  console.log(`  2. Add your file as: profiles/${id}/default.toml`);
  console.log(
    `  3. gh pr create --repo ${COMMUNITY_REPO} --title "feat: ${id} profile" --body "..."`
  );

  // Try to copy content to clipboard
  const cmds: [string, string[]][] = [
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
    ["pbcopy", []],
  ];
  for (const [bin, cargs] of cmds) {
    try {
      const proc = Bun.spawnSync([bin, ...cargs], {
        stdin: new TextEncoder().encode(content),
      });
      if (proc.exitCode === 0) {
        console.log(`\n✓ Profile content copied to clipboard.`);
        return;
      }
    } catch {
      /* not available */
    }
  }

  console.log(`\nProfile content (copy manually):\n\n${content}`);
}

// ── check ─────────────────────────────────────────────────────────────────────

function cmdCheck(): void {
  const profiles = loadProfiles();
  if (profiles.length === 0) {
    console.log("No profiles installed.");
    return;
  }

  interface Conflict {
    a: LoadedProfile;
    b: LoadedProfile;
    patA: string;
    patB: string;
  }

  const conflicts: Conflict[] = [];

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i]!;
      const b = profiles[j]!;
      if (a.tier !== b.tier) continue;
      for (const patA of a.patterns) {
        for (const patB of b.patterns) {
          if (patternsOverlap(patA, patB)) {
            conflicts.push({ a, b, patA, patB });
          }
        }
      }
    }
  }

  if (conflicts.length === 0) {
    console.log(`✓ No conflicts across ${profiles.length} profile(s).`);
    return;
  }

  console.log(`\n${conflicts.length} conflict(s):\n`);
  for (const { a, b, patA, patB } of conflicts) {
    console.log(`  [${a.tier}] ${a.spec.profile.id} (${patA})`);
    console.log(`  [${b.tier}] ${b.spec.profile.id} (${patB})`);
    console.log(`  → resolved by specificity (exact > wildcard, longer prefix > shorter)\n`);
  }
}

// ── test ──────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface TestResult {
  toolName: string;
  matchedProfile: LoadedProfile | null;
  handlerName: string;
  inputBytes: number;
  outputBytes: number;
  reductionPct: number;
  summary: string;
}

/** Core logic — exported for testing. */
export function testProfile(toolName: string, content: string): TestResult {
  const profiles = loadProfiles();
  const matchedProfile = resolveProfile(toolName, profiles);
  const handler = getHandler(toolName, content);
  const { summary, originalSize } = handler(toolName, content);
  const outputBytes = Buffer.byteLength(summary, "utf8");
  const reductionPct =
    originalSize > 0 ? Math.round((1 - outputBytes / originalSize) * 100) : 0;
  return { toolName, matchedProfile, handlerName: handler.name, inputBytes: originalSize, outputBytes, reductionPct, summary };
}

function cmdTest(args: string[]): void {
  let toolName: string | undefined;
  let storedId: string | undefined;
  let inputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--stored" && args[i + 1]) {
      storedId = args[++i];
    } else if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[++i];
    } else if (!args[i].startsWith("-")) {
      toolName = args[i];
    }
  }

  if (!toolName) {
    console.error("Usage: mcp-recall profiles test <tool_name> [--stored <id>] [--input <file>]");
    console.error("\nExamples:");
    console.error("  mcp-recall profiles test mcp__jira__search_issues --stored recall_abc123");
    console.error("  mcp-recall profiles test mcp__stripe__list_customers --input fixture.json");
    process.exit(1);
  }

  if (!storedId && !inputFile) {
    console.error("Provide --stored <recall_id> or --input <file>\n");
    console.error(`To find a stored item:  recall__list_stored(tool: "${toolName}")`);
    process.exit(1);
  }

  let content: string;
  let contentSource: string;

  if (storedId) {
    const projectKey = getProjectKey(process.cwd());
    const db = getDb(defaultDbPath(projectKey));
    const row = db
      .prepare("SELECT full_content FROM stored_outputs WHERE id = ?")
      .get(storedId) as { full_content: string } | null;
    if (!row) {
      console.error(`No stored item found: ${storedId}`);
      process.exit(1);
    }
    content = row.full_content;
    contentSource = `stored:${storedId}`;
  } else {
    try {
      content = readFileSync(inputFile!, "utf8");
    } catch {
      console.error(`Cannot read: ${inputFile}`);
      process.exit(1);
    }
    contentSource = inputFile!;
  }

  const config = loadConfig();
  if (isDenied(toolName, config)) {
    console.log(`Tool "${toolName}" is on the denylist — output will not be processed or stored.`);
    return;
  }

  const result = testProfile(toolName, content);

  if (result.matchedProfile) {
    const p = result.matchedProfile;
    console.log(`\nProfile:  ${p.spec.profile.id} (${p.tier}) — ${p.patterns.join(", ")}`);
    console.log(`File:     ${p.filePath}`);
    console.log(`Strategy: ${p.spec.strategy.type}`);
  } else {
    console.log(`\nNo profile match for ${toolName}`);
    console.log(`Handler:  ${result.handlerName} (TypeScript fallback)`);
    console.log(`\nTo add a profile:`);
    console.log(`  mcp-recall learn`);
    console.log(`  https://github.com/sakebomb/mcp-recall/blob/main/docs/profile-schema.md`);
  }

  console.log(`\nInput:  ${formatBytes(result.inputBytes)}  (${contentSource})`);
  console.log("─".repeat(60));
  console.log(result.summary);
  console.log("─".repeat(60));
  console.log(`Output: ${formatBytes(result.outputBytes)}  (${result.reductionPct}% reduction)\n`);
}

// ── dispatcher ────────────────────────────────────────────────────────────────

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
      await cmdUpdate();
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
    case "test":
      cmdTest(rest);
      break;
    default:
      console.error(`Unknown subcommand: ${cmd ?? "(none)"}\n`);
      console.error("Usage: mcp-recall profiles <command>\n");
      console.error("Commands:");
      console.error("  list              Show all installed profiles");
      console.error("  install <id>      Install a community profile by ID");
      console.error("  update            Update all installed community profiles");
      console.error("  remove <id>       Remove a community profile");
      console.error("  seed [--all]      Install profiles for all detected MCPs (--all for entire catalog)");
      console.error("  feed [path]       Contribute a local profile to the community");
      console.error("  check             Detect pattern conflicts");
      console.error("  retrain [--apply] [--depth N] [filter]  Suggest profile improvements from stored corpus");
      console.error("  test <tool> [--stored <id>] [--input <file>]  Test a profile against real input");
      process.exit(1);
  }
}
