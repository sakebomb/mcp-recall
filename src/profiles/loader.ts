/**
 * Profile loader — discovers and parses TOML profiles from three tiers:
 *   user     → ~/.config/mcp-recall/profiles/
 *   community → ~/.local/share/mcp-recall/profiles/community/
 *   bundled  → <dist|src>/../../profiles/
 *
 * Profiles are cached in memory by file path + mtime. A changed file on disk
 * is re-parsed on the next hook call with negligible overhead.
 */
import { parse } from "smol-toml";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { LoadedProfile, ProfileSpec, ProfileTier } from "./types";
import { dbg } from "../debug";

// ── path resolution ──────────────────────────────────────────────────────────

function getUserProfilesDir(): string {
  return (
    process.env.RECALL_USER_PROFILES_PATH ??
    join(homedir(), ".config", "mcp-recall", "profiles")
  );
}

function getCommunityProfilesDir(): string {
  return (
    process.env.RECALL_COMMUNITY_PROFILES_PATH ??
    join(homedir(), ".local", "share", "mcp-recall", "profiles", "community")
  );
}

function getBundledProfilesDir(): string {
  if (process.env.RECALL_BUNDLED_PROFILES_PATH) {
    return process.env.RECALL_BUNDLED_PROFILES_PATH;
  }
  // Dev:  src/profiles/ → root profiles/
  // Dist: plugins/mcp-recall/dist/ → plugins/mcp-recall/profiles/
  const devPath = join(import.meta.dir, "../../profiles");
  const distPath = join(import.meta.dir, "../profiles");
  try {
    statSync(devPath);
    return devPath;
  } catch {
    return distPath;
  }
}

// ── per-file mtime cache ─────────────────────────────────────────────────────

interface CacheEntry {
  mtime: number;
  spec: ProfileSpec;
}

const fileCache = new Map<string, CacheEntry>();

function loadSpec(filePath: string): ProfileSpec | null {
  let mtime: number;
  try {
    mtime = statSync(filePath).mtimeMs;
  } catch {
    fileCache.delete(filePath);
    return null;
  }

  const cached = fileCache.get(filePath);
  if (cached && cached.mtime === mtime) return cached.spec;

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (e) {
    dbg(`profile parse error · ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }

  const spec = validateSpec(parsed, filePath);
  if (!spec) return null;

  fileCache.set(filePath, { mtime, spec });
  return spec;
}

// ── validation ───────────────────────────────────────────────────────────────

const VALID_TYPES = new Set(["json_extract", "json_truncate", "text_truncate"]);

function validateSpec(raw: unknown, filePath: string): ProfileSpec | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const profile = obj["profile"] as Record<string, unknown> | undefined;
  const strategy = obj["strategy"] as Record<string, unknown> | undefined;

  if (!profile || !strategy) {
    dbg(`profile skip · missing [profile] or [strategy] · ${filePath}`);
    return null;
  }

  if (
    typeof profile["id"] !== "string" ||
    typeof profile["version"] !== "string" ||
    typeof profile["description"] !== "string" ||
    (typeof profile["mcp_pattern"] !== "string" && !Array.isArray(profile["mcp_pattern"]))
  ) {
    dbg(`profile skip · missing required fields · ${filePath}`);
    return null;
  }

  const type = strategy["type"];
  if (!VALID_TYPES.has(type as string)) {
    dbg(`profile skip · unknown strategy.type "${type}" · ${filePath}`);
    return null;
  }

  if (type === "json_extract") {
    const fields = strategy["fields"];
    if (!Array.isArray(fields) || fields.length === 0) {
      dbg(`profile skip · json_extract missing fields · ${filePath}`);
      return null;
    }
  }

  const numericCeilings: Array<[string, number]> = [
    ["max_depth", 20],
    ["max_items", 1000],
    ["max_array_items", 1000],
    ["max_chars", 1_000_000],
    ["max_chars_per_field", 100_000],
    ["fallback_chars", 100_000],
  ];
  for (const [field, ceiling] of numericCeilings) {
    const val = strategy[field];
    if (val !== undefined && typeof val === "number" && val > ceiling) {
      dbg(`profile skip · ${field} exceeds maximum allowed value of ${ceiling} · ${filePath}`);
      return null;
    }
  }

  return raw as ProfileSpec;
}

// ── directory scanning ───────────────────────────────────────────────────────

function scanDir(dir: string, tier: ProfileTier): LoadedProfile[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const results: LoadedProfile[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...scanDir(full, tier));
    } else if (entry.endsWith(".toml")) {
      const spec = loadSpec(full);
      if (!spec) continue;
      const raw = spec.profile.mcp_pattern;
      const patterns = Array.isArray(raw) ? raw : [raw];
      results.push({ spec, tier, patterns, filePath: full });
    }
  }
  return results;
}

// ── exported loader ──────────────────────────────────────────────────────────

/** Returns all loaded profiles sorted by tier priority (user first). */
export function loadProfiles(): LoadedProfile[] {
  return [
    ...scanDir(getUserProfilesDir(), "user"),
    ...scanDir(getCommunityProfilesDir(), "community"),
    ...scanDir(getBundledProfilesDir(), "bundled"),
  ];
}

/** Exposed for testing only. */
export function clearProfileCache(): void {
  fileCache.clear();
}

/**
 * Returns the short, user-friendly name for a profile.
 * Uses the explicit `short_name` field if set, otherwise strips the `mcp__` prefix from the id.
 */
export function getShortName(spec: { profile: { id: string; short_name?: string } }): string {
  return spec.profile.short_name ?? spec.profile.id.replace(/^mcp__/, "");
}
