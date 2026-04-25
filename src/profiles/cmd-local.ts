import { readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { parse } from "smol-toml";
import { loadProfiles, clearProfileCache, getShortName } from "./loader";
import { sanitize, communityDir, userDir, assertSafeId, COMMUNITY_REPO } from "./shared";
import type { LoadedProfile } from "./types";

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
      process.stdout.write(sanitize(getShortName(p.spec)) + "\n");
    }
    return;
  }

  if (profiles.length === 0) {
    console.log("No profiles installed.");
    console.log("Run: mcp-recall profiles seed");
    return;
  }

  const COL = { name: 20, tier: 10, pattern: 26 };
  const header =
    "Name".padEnd(COL.name) +
    "  " +
    "Tier".padEnd(COL.tier) +
    "  " +
    "Pattern".padEnd(COL.pattern) +
    "  Description";

  console.log(`\n${header}`);
  console.log("─".repeat(Math.min(header.length, 100)));

  for (const p of profiles) {
    const name = sanitize(getShortName(p.spec)).slice(0, COL.name - 1).padEnd(COL.name);
    const tier = p.tier.padEnd(COL.tier);
    const pattern = (p.patterns[0] ?? "").slice(0, COL.pattern - 1).padEnd(COL.pattern);
    const desc = sanitize(p.spec.profile.description).slice(0, 55);
    console.log(`${name}  ${tier}  ${pattern}  ${desc}`);
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

// ── remove ────────────────────────────────────────────────────────────────────

export function cmdRemove(args: string[]): void {
  const nameOrId = args[0];
  if (!nameOrId) {
    console.error("Usage: mcp-recall profiles remove <name>");
    process.exit(1);
  }

  const allInstalled = loadProfiles();
  const target =
    allInstalled.find((p) => p.spec.profile.id === nameOrId) ??
    allInstalled.find((p) => getShortName(p.spec) === nameOrId);

  if (!target) {
    console.error(`"${nameOrId}" is not installed.`);
    process.exit(1);
  }

  if (target.tier !== "community") {
    console.error(`"${nameOrId}" is a ${target.tier} profile and cannot be removed via this command.`);
    process.exit(1);
  }

  const id = target.spec.profile.id;
  assertSafeId(id);
  rmSync(join(communityDir(), id), { recursive: true });
  clearProfileCache();
  console.log(`✓ Removed ${id}`);
}

// ── feed ──────────────────────────────────────────────────────────────────────

export function cmdFeed(args: string[]): void {
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

  console.log(`\nProfile content (copy manually):\n\n${sanitize(content)}`);
}

// ── check ─────────────────────────────────────────────────────────────────────

export function cmdCheck(): void {
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
