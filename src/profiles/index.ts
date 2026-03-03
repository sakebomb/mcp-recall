/**
 * Profile evaluator — resolves a matching TOML profile for a tool name and
 * returns a Handler that applies the declared compression strategy.
 *
 * Priority order (within each tier: exact match > wildcard; longer prefix > shorter):
 *   user > community > bundled
 */
import type { Handler } from "../handlers/types";
import type { LoadedProfile, ProfileTier } from "./types";
import { loadProfiles } from "./loader";
import { applyJsonExtract, applyJsonTruncate, applyTextTruncate } from "./strategies";
import { dbg } from "../debug";

// ── pattern matching ──────────────────────────────────────────────────────────

function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern.endsWith("*")) return toolName.startsWith(pattern.slice(0, -1));
  return toolName === pattern;
}

/** Higher = more specific. Exact match → Infinity; wildcard → prefix length. */
function patternSpecificity(pattern: string): number {
  return pattern.endsWith("*") ? pattern.length - 1 : Infinity;
}

/** Best specificity score across all patterns in a profile. */
function profileSpecificity(profile: LoadedProfile, toolName: string): number {
  return Math.max(
    ...profile.patterns
      .filter((p) => matchesPattern(toolName, p))
      .map(patternSpecificity)
  );
}

const TIER_ORDER: ProfileTier[] = ["user", "community", "bundled"];

// ── resolver ──────────────────────────────────────────────────────────────────

export function resolveProfile(
  toolName: string,
  profiles: LoadedProfile[],
  tiers: ProfileTier[] = TIER_ORDER
): LoadedProfile | null {
  const candidates = profiles.filter(
    (p) => tiers.includes(p.tier) && p.patterns.some((pat) => matchesPattern(toolName, pat))
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, cur) => {
    const bestTierIdx = TIER_ORDER.indexOf(best.tier);
    const curTierIdx = TIER_ORDER.indexOf(cur.tier);
    if (curTierIdx !== bestTierIdx) return curTierIdx < bestTierIdx ? cur : best;
    const bestScore = profileSpecificity(best, toolName);
    const curScore = profileSpecificity(cur, toolName);
    return curScore > bestScore ? cur : best;
  });
}

// ── handler factory ───────────────────────────────────────────────────────────

function makeHandler(profile: LoadedProfile): Handler {
  const { spec } = profile;
  const handlerName = `profile:${spec.profile.id}`;
  const handler = function profileHandler(toolName: string, output: unknown) {
    const { strategy } = spec;
    switch (strategy.type) {
      case "json_extract": return applyJsonExtract(strategy, toolName, output);
      case "json_truncate": return applyJsonTruncate(strategy, toolName, output);
      case "text_truncate": return applyTextTruncate(strategy, toolName, output);
    }
  };
  Object.defineProperty(handler, "name", { value: handlerName });
  return handler;
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Returns a compression Handler if a profile matches the tool name for the
 * given tiers, or null if no profile matches.
 */
export function getProfileHandler(
  toolName: string,
  tiers: ProfileTier[] = TIER_ORDER
): Handler | null {
  const profiles = loadProfiles();
  const match = resolveProfile(toolName, profiles, tiers);
  if (!match) return null;
  dbg(`profile match · ${match.spec.profile.id} (${match.tier}) · ${toolName}`);
  return makeHandler(match);
}

export { loadProfiles, clearProfileCache } from "./loader";
