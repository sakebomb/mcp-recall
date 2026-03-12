# Troubleshooting

## Plugin not loading

```bash
claude --debug
# Look for plugin loading errors
```

Confirm Bun is installed and on your PATH:

```bash
bun --version
```

## Hook not firing

The most common cause is the hook script not being executable:

```bash
ls -la $(claude plugin path mcp-recall)/bin/recall
# Should show -rwxr-xr-x
```

If not executable, reinstall the plugin:

```bash
claude plugin uninstall mcp-recall@mcp-recall
claude plugin install mcp-recall@mcp-recall
```

If the issue persists, [open an issue](https://github.com/sakebomb/mcp-recall/issues).

## Stats showing zero after first session

The `SessionStart` hook records the first day. Stats accumulate from the second session onward. Run `recall__stats()` after any MCP tool call to confirm data is flowing.

## MCP tools not appearing in Claude

Restart Claude Code after installing the plugin. The MCP server registers at startup.

## Checking what's stored

```
recall__list_stored()
recall__stats()
```

## Wiping the store

```
recall__forget(all: true, confirmed: true)
```

Or delete the database directly:

```bash
rm -rf ~/.local/share/mcp-recall/
```

---

## Profile not matching

If a tool output is falling through to the generic handler instead of your profile, check that the pattern matches:

```bash
mcp-recall profiles list
# Verify your profile appears and the Pattern column matches the tool name
```

> **Short names**: `profiles list`, `profiles install`, `profiles remove`, `profiles info`, and `profiles test` all accept short names (e.g. `grafana` instead of `mcp__grafana`). If a short name matches multiple profiles, an interactive picker appears on TTY. On non-TTY (CI, scripts), it prints the full list and exits — use the full `id` to disambiguate.

Common causes:
- Pattern uses `mcp__myserver__*` but the tool is actually named `mcp__my-server__*` (hyphens vs underscores)
- Profile file is in the wrong location — user profiles go in `~/.config/mcp-recall/profiles/<id>/default.toml`
- TOML parse error at load time — run `mcp-recall profiles check` to surface validation failures

To confirm a profile is loaded and which tier it came from:

```bash
mcp-recall profiles list
# Columns: Name (short name), Tier (user / community / bundled), Pattern, Description
```

## `retrain` shows 0 samples

`retrain` requires at least 3 stored outputs for a tool before suggesting anything. If it reports no samples:

1. Run a few sessions where the MCP is active — mcp-recall needs stored data to analyse
2. Confirm the tool is being intercepted: `recall__list_stored()` should show items from it
3. Check the tool isn't on the denylist: `mcp-recall profiles list` — denylist blocks don't produce stored items

## Profile syntax error not reported

Profile load errors are silent by default (bad profiles are skipped, not fatal). Enable debug logging to see them:

```bash
RECALL_DEBUG=1 claude
# Look for: [recall:debug] profile load error: ...
```

## `profiles check` reports a conflict

Two profiles in the same tier have overlapping patterns. The resolver picks the more specific one (exact beats wildcard, longer prefix beats shorter), but the conflict is worth resolving to avoid ambiguity:

- If both are community profiles, one may be redundant — remove with `mcp-recall profiles remove <id>` (only community-tier profiles can be removed this way; user profiles must be deleted manually from `~/.config/mcp-recall/profiles/`)
- If one is yours (user tier), it takes precedence over community by design — no action needed unless you want to suppress the warning
