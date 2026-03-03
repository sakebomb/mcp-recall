import type { RecallConfig } from "./config";

/**
 * Built-in glob patterns for tools whose outputs must never be stored.
 * Uses glob syntax: * matches any sequence of characters.
 */
export const BUILTIN_PATTERNS: string[] = [
  // own tools — never intercept
  "mcp__recall__*",
  // password managers — explicit entries because PM tool names (e.g. get_item,
  // list_logins, vault read) don't always contain keyword patterns below
  "mcp__1password__*",
  "mcp__bitwarden__*",
  "mcp__lastpass__*",
  "mcp__dashlane__*",
  "mcp__keeper__*",
  "mcp__hashicorp_vault__*",
  "mcp__vault__*",
  "mcp__doppler__*",
  "mcp__infisical__*",
  // keyword patterns — catch remaining credential-adjacent tool names
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
