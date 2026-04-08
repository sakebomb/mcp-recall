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
  // keyword patterns — catch credential-adjacent tool names
  // Broad patterns that rarely false-positive:
  "*secret*",
  "*password*",
  "*credential*",
  "*token*",
  // Narrowed from *key* — avoids "project_keys", "keyboard", "hotkey", "primary_key":
  "*api_key*",
  "*access_key*",
  "*private_key*",
  "*signing_key*",
  "*encrypt*key*",
  // Narrowed from *auth* — avoids "author", "get_authors":
  "*oauth*",
  "*auth_token*",
  "*authenticate*",
  // Narrowed from *env* — avoids "environments", "list_envs", "deploy_env":
  "*env_var*",
  "*dotenv*",
];

/**
 * Returns true if the tool output should not be stored.
 *
 * Pattern resolution:
 *   1. If config.denylist.allowlist matches, the tool is always allowed (not denied).
 *   2. If config.denylist.override_defaults is non-empty, it replaces BUILTIN_PATTERNS.
 *   3. config.denylist.additional is always appended regardless.
 */
export function isDenied(toolName: string, config: RecallConfig): boolean {
  // Allowlist takes priority — lets users un-block tools matched by keyword patterns
  if (config.denylist.allowlist.some((p) => matchesPattern(toolName, p))) {
    return false;
  }

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
 * Matching is case-sensitive. Compiled regexes are cached.
 */
// Bounded in practice: BUILTIN_PATTERNS is fixed and user-supplied additional
// patterns are small relative to the tool namespace.
const regexCache = new Map<string, RegExp>();

export function matchesPattern(toolName: string, pattern: string): boolean {
  let re = regexCache.get(pattern);
  if (!re) {
    const escaped = pattern
      .split("*")
      .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    re = new RegExp(`^${escaped}$`);
    regexCache.set(pattern, re);
  }
  return re.test(toolName);
}
