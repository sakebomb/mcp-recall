/**
 * `mcp-recall profiles retrain` — analyze the stored output corpus to suggest
 * improved `items_path` and `fields` for existing TOML profiles.
 *
 * Usage:
 *   mcp-recall profiles retrain              # analyze all profiled tools (dry-run)
 *   mcp-recall profiles retrain jira         # filter to tools matching "jira"
 *   mcp-recall profiles retrain --apply      # write changes to profile files
 *   mcp-recall profiles retrain --depth 4    # discover fields up to depth 4
 */
import { readFileSync, writeFileSync } from "fs";
import { getDb, defaultDbPath, sampleOutputs, getToolBreakdown } from "../db/index";
import { getProjectKey } from "../project-key";
import { loadProfiles, clearProfileCache } from "../profiles/loader";
import { resolveProfile } from "../profiles/index";
import type { LoadedProfile, ProfileTier } from "../profiles/types";
import type { StoredOutput } from "../db/index";

// ── constants ────────────────────────────────────────────────────────────────

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 5;
const DEFAULT_DEPTH = 3;
const MIN_FIELD_PCT = 0.5;
const ALL_TIERS: ProfileTier[] = ["user", "community", "bundled"];

// ── public types ─────────────────────────────────────────────────────────────

export interface FieldSuggestion {
  path: string;
  pct: number;
  inProfile: boolean;
}

export interface RetrainResult {
  toolName: string;
  profileId: string;
  profileTier: string;
  profileFilePath: string;
  strategyType: string;
  sampleCount: number;
  itemCount: number;
  detectedItemsPath: string | null;
  currentItemsPath: string[];
  fields: FieldSuggestion[];
  newFields: string[];
  error?: string;
}

// ── core analysis ─────────────────────────────────────────────────────────────

/**
 * Scans a parsed JSON value for the largest array at depth 0 or 1.
 * Returns the dot-notation path and the array itself, or null if none found.
 */
export function detectItemsPath(
  parsed: unknown
): { path: string; items: unknown[] } | null {
  if (Array.isArray(parsed)) return { path: "", items: parsed };
  if (parsed === null || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  let best: { path: string; items: unknown[]; score: number } | null = null;

  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val) && val.length > (best?.score ?? 0)) {
      best = { path: key, items: val, score: val.length };
    }
    // Depth-1: look inside nested objects
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      for (const [key2, val2] of Object.entries(val as Record<string, unknown>)) {
        if (Array.isArray(val2) && val2.length > (best?.score ?? 0)) {
          best = { path: `${key}.${key2}`, items: val2, score: val2.length };
        }
      }
    }
  }

  return best ? { path: best.path, items: best.items } : null;
}

/** Recursive helper: collect dot-notation paths to scalar values. */
function traverseObject(
  obj: Record<string, unknown>,
  prefix: string,
  depth: number,
  maxDepth: number,
  paths: Set<string>
): void {
  if (depth >= maxDepth) return;
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      if (val !== "") paths.add(path);
    } else if (typeof val === "object" && !Array.isArray(val)) {
      traverseObject(val as Record<string, unknown>, path, depth + 1, maxDepth, paths);
    }
    // Arrays: skip — we don't try to index into them
  }
}

/**
 * Collects dot-notation paths to scalar values across all items, up to
 * `maxDepth` levels. Returns a Map from path → number of items that contain it.
 */
export function collectFieldPaths(
  items: unknown[],
  maxDepth: number
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const paths = new Set<string>();
    traverseObject(item as Record<string, unknown>, "", 0, maxDepth, paths);
    for (const p of paths) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}

/**
 * Filters to paths meeting the minimum frequency threshold and sorts desc by
 * frequency. `totalItems` is the denominator for the percentage calculation.
 */
export function scoreFields(
  pathMap: Map<string, number>,
  totalItems: number
): Array<{ path: string; pct: number }> {
  if (totalItems === 0) return [];
  return Array.from(pathMap.entries())
    .map(([path, count]) => ({ path, pct: count / totalItems }))
    .filter(({ pct }) => pct >= MIN_FIELD_PCT)
    .sort((a, b) => b.pct - a.pct);
}

// ── TOML manipulation ─────────────────────────────────────────────────────────

function bumpPatch(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return version;
  return `${parts[0]}.${parts[1]}.${(parts[2]!) + 1}`;
}

/**
 * Adds new fields to the `fields = [...]` array in a profile TOML string,
 * bumps the patch version, and prepends a retrain timestamp comment.
 * Returns the modified TOML. Pure function — does not write files.
 */
export function applyRetrainToToml(
  tomlContent: string,
  newFields: string[],
  date: string
): string {
  let result = tomlContent;

  // Prepend retrain comment (after any existing leading comments/blank lines)
  const firstContentIdx = result.search(/^[^\s#]/m);
  const retrainLine = `# Retrained: ${date}\n`;
  if (firstContentIdx <= 0) {
    result = retrainLine + result;
  } else {
    result = result.slice(0, firstContentIdx) + retrainLine + result.slice(firstContentIdx);
  }

  // Append new fields to the fields = [...] block
  if (newFields.length > 0) {
    const openMatch = result.match(/^(\s*fields\s*=\s*\[)/m);
    if (openMatch?.index !== undefined) {
      const afterOpen = openMatch.index + openMatch[0].length;
      const closeIdx = result.indexOf("]", afterOpen);
      if (closeIdx !== -1) {
        // Detect indentation from the block content
        const block = result.slice(afterOpen, closeIdx);
        const indentMatch = block.match(/^(\s+)/m);
        const indent = indentMatch ? indentMatch[1] : "  ";
        const newLines = newFields.map((f) => `${indent}"${f}",`).join("\n");
        result = result.slice(0, closeIdx) + newLines + "\n" + result.slice(closeIdx);
      }
    }
  }

  // Bump patch version
  result = result.replace(
    /^(\s*version\s*=\s*")([^"]+)(")/m,
    (_, before, ver, after) => `${before}${bumpPatch(ver)}${after}`
  );

  return result;
}

// ── profile analysis ──────────────────────────────────────────────────────────

/**
 * Analyzes stored samples for a single tool against its current profile,
 * returning field suggestions and diff information.
 */
export function retrainProfile(
  samples: StoredOutput[],
  profile: LoadedProfile,
  maxDepth: number
): RetrainResult {
  const base: Omit<RetrainResult, "fields" | "newFields" | "detectedItemsPath" | "itemCount"> = {
    toolName: samples[0]?.tool_name ?? "",
    profileId: profile.spec.profile.id,
    profileTier: profile.tier,
    profileFilePath: profile.filePath,
    strategyType: profile.spec.strategy.type,
    sampleCount: samples.length,
    currentItemsPath: profile.spec.strategy.items_path ?? [],
  };

  if (profile.spec.strategy.type !== "json_extract") {
    return { ...base, fields: [], newFields: [], detectedItemsPath: null, itemCount: 0 };
  }

  const currentFields = new Set(profile.spec.strategy.fields ?? []);
  const allItems: unknown[] = [];
  let detectedPath: string | null = null;
  let detectedPathCount = 0;

  for (const sample of samples) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(sample.full_content);
    } catch {
      continue;
    }
    const detected = detectItemsPath(parsed);
    if (detected) {
      allItems.push(...detected.items);
      if (detected.path === (detectedPath ?? detected.path)) {
        detectedPathCount++;
        detectedPath = detected.path;
      }
    }
  }

  if (allItems.length === 0) {
    return {
      ...base,
      fields: [],
      newFields: [],
      detectedItemsPath: detectedPath,
      itemCount: 0,
      error: "no parseable JSON items found in samples",
    };
  }

  const pathMap = collectFieldPaths(allItems, maxDepth);
  const scored = scoreFields(pathMap, allItems.length);

  const fields: FieldSuggestion[] = scored.map(({ path, pct }) => ({
    path,
    pct,
    inProfile: currentFields.has(path),
  }));

  const newFields = fields.filter((f) => !f.inProfile).map((f) => f.path);

  return {
    ...base,
    detectedItemsPath: detectedPathCount >= Math.ceil(samples.length / 2) ? detectedPath : null,
    itemCount: allItems.length,
    fields,
    newFields,
  };
}

// ── output formatting ─────────────────────────────────────────────────────────

function printResult(result: RetrainResult, apply: boolean): void {
  const header = `${result.toolName} (${result.sampleCount} sample${result.sampleCount === 1 ? "" : "s"} · ${result.itemCount} item${result.itemCount === 1 ? "" : "s"}):`;
  console.log(`\n${header}`);

  if (result.error) {
    console.log(`  ⚠ ${result.error}`);
    return;
  }

  if (result.strategyType !== "json_extract") {
    console.log(`  Strategy is ${result.strategyType} — field extraction not applicable.`);
    console.log(`  Tip: if this tool returns structured lists, consider switching to json_extract.`);
    return;
  }

  // Items path
  if (result.detectedItemsPath !== null) {
    const inProfile = result.currentItemsPath.includes(result.detectedItemsPath);
    const status = inProfile ? "✓ matches profile" : "⚠ not in current profile items_path";
    console.log(`  items_path: "${result.detectedItemsPath}"  ${status}`);
  }

  if (result.fields.length === 0) {
    console.log(`  No fields found at ≥50% frequency.`);
    return;
  }

  console.log(`  Fields (≥50% frequency):`);
  const colW = Math.min(45, Math.max(...result.fields.map((f) => f.path.length)) + 2);
  for (const f of result.fields) {
    const pctStr = `${(f.pct * 100).toFixed(0)}%`.padStart(4);
    const tag = f.inProfile ? "in profile" : "NEW";
    console.log(`    ${`"${f.path}"`.padEnd(colW)}  ${pctStr}  ${tag}`);
  }

  if (result.newFields.length === 0) {
    console.log(`  ✓ Profile is up to date.`);
  } else if (!apply) {
    console.log(`  ${result.newFields.length} new field(s) found. Run with --apply to update.`);
  }
}

function applyResult(result: RetrainResult, date: string): void {
  if (result.newFields.length === 0) return;
  let toml: string;
  try {
    toml = readFileSync(result.profileFilePath, "utf8");
  } catch (e) {
    console.log(`  ✗ Could not read ${result.profileFilePath}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const oldVersion = toml.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "?";
  const updated = applyRetrainToToml(toml, result.newFields, date);
  const newVersion = updated.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "?";
  writeFileSync(result.profileFilePath, updated);
  console.log(`  ✓ Updated: ${result.profileFilePath} (${oldVersion} → ${newVersion})`);
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

export async function handleRetrainCommand(args: string[]): Promise<void> {
  const apply = args.includes("--apply");

  let cliDepth: number | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--depth" && args[i + 1]) {
      cliDepth = parseInt(args[i + 1]!);
      break;
    }
    if (args[i]?.startsWith("--depth=")) {
      cliDepth = parseInt(args[i]!.slice("--depth=".length));
      break;
    }
  }

  const targets = args.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));

  const cwd = process.cwd();
  const projectKey = getProjectKey(cwd);
  const db = getDb(defaultDbPath(projectKey));

  const breakdown = getToolBreakdown(db, projectKey).filter((r) => r.items >= MIN_SAMPLES);
  if (breakdown.length === 0) {
    console.log(`No tools with ≥${MIN_SAMPLES} stored samples. Run some MCP tools first.`);
    return;
  }

  const profiles = loadProfiles();

  const qualifying = breakdown.filter((r) => {
    if (targets.length > 0 && !targets.some((t) => r.tool_name.includes(t))) return false;
    return resolveProfile(r.tool_name, profiles, ALL_TIERS) !== null;
  });

  if (qualifying.length === 0) {
    console.log("No profiled tools with enough data found.");
    if (targets.length > 0) console.log(`(filter: ${targets.join(", ")})`);
    return;
  }

  console.log(`\nRetraining from stored corpus…`);

  const date = new Date().toISOString().slice(0, 10);
  let analyzed = 0;
  let totalNew = 0;
  let applied = 0;

  for (const row of qualifying) {
    const profile = resolveProfile(row.tool_name, profiles, ALL_TIERS)!;
    const maxDepth = cliDepth ?? profile.spec.retrain?.max_depth ?? DEFAULT_DEPTH;
    const samples = sampleOutputs(db, projectKey, row.tool_name, MAX_SAMPLES);
    const result = retrainProfile(samples, profile, maxDepth);

    printResult(result, apply);

    if (apply && result.newFields.length > 0 && !result.error) {
      applyResult(result, date);
      applied++;
    }

    analyzed++;
    totalNew += result.newFields.length;
  }

  console.log(`\n${"─".repeat(54)}`);

  if (apply) {
    console.log(`${analyzed} profile(s) analyzed · ${totalNew} new field(s) · ${applied} profile(s) updated.`);
    if (applied > 0) clearProfileCache();
  } else {
    console.log(`${analyzed} profile(s) analyzed · ${totalNew} new field(s) found.`);
    if (totalNew > 0) console.log(`Run with --apply to update profiles.`);
  }
}
