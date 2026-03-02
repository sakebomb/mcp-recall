import type { RecallConfig } from "./config";

/**
 * Built-in glob patterns for tools whose outputs must never be stored.
 * Uses glob syntax: * matches any sequence of characters.
 */
export const BUILTIN_PATTERNS: string[] = [
  "mcp__recall__*",
  "mcp__1password__*",
  "*secret*",
  "*token*",
  "*password*",
  "*credential*",
  "*key*",
  "*auth*",
  "*env*",
];

/**
 * Returns true if the tool output should not be stored.
 *
 * Pattern resolution:
 *   - If config.denylist.override_defaults is non-empty, it replaces BUILTIN_PATTERNS.
 *   - config.denylist.additional is always appended regardless.
 */
export function isDenied(toolName: string, config: RecallConfig): boolean {
  const base =
    config.denylist.override_defaults.length > 0
      ? config.denylist.override_defaults
      : BUILTIN_PATTERNS;

  const patterns = [...base, ...config.denylist.additional];
  return patterns.some((p) => matchesPattern(toolName, p));
}

/**
 * Matches a tool name against a glob pattern.
 * Supports * as a wildcard matching any sequence of characters.
 * Matching is case-sensitive.
 */
export function matchesPattern(toolName: string, pattern: string): boolean {
  const escaped = pattern
    .split("*")
    .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(toolName);
}
