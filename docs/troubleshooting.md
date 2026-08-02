# Troubleshooting

## Version not updating after upgrade

If `mcp-recall --version` still shows the old version after upgrading, the hook script is pointing at a stale binary path. Re-run the install step to fix it:

```bash
# npm / bun global install
bun update -g mcp-recall && mcp-recall install

# from source
git pull && bun install && bun run build && mcp-recall install
```

`mcp-recall install` is idempotent — it rewrites the hook and MCP server paths without touching stored data or config. Restart Claude Code afterward so the MCP server picks up the new binary.

---

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

## Recovering rows stranded by the old import flag

`mcp-recall import --keep-project-key` (removed in [#226](https://github.com/sakebomb/mcp-recall/issues/226)) could write rows into the current project's database stamped with a *foreign* project key. Such rows are invisible to `recall__search`, `stats`, and `suggest`, and by default `recall__list_stored` and `recall__forget` only see the current project's key. As of [#237](https://github.com/sakebomb/mcp-recall/issues/237) you can enumerate and delete them through the tool layer with a `project_key` override — no raw `sqlite3` needed:

1. **Discover the foreign key.** Run `recall__list_stored` with no arguments. If any rows carry a foreign key, a footer names each key and its row count.
2. **Inspect the stranded rows** (optional): `recall__list_stored` with `project_key="<foreign-key>"`.
3. **Delete them:** `recall__forget` with `project_key="<foreign-key>"` and `all: true, confirmed: true` (or scope the delete further with `tool` / `session_id` / `older_than_days` / `id`). The `all`+`confirmed` guard still applies, and the override always names exactly one key — there is no all-projects wildcard.

Then re-import the dump **without** `--keep-project-key` so the items land under the current project's key and behave normally.

If you prefer to edit the database directly, the equivalent `sqlite3` commands still work (the `AFTER DELETE` triggers cascade to the FTS index and content chunks automatically):

```bash
# The database is ~/.local/share/mcp-recall/<project-key>.db
# (or your RECALL_DB_PATH override). List distinct keys to spot the foreign one:
sqlite3 "$db" 'SELECT project_key, count(*) FROM stored_outputs GROUP BY project_key;'

# Delete the rows carrying the foreign key:
sqlite3 "$db" "DELETE FROM stored_outputs WHERE project_key = '<foreign-key>';"
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
- TOML parse error at load time — run with `RECALL_DEBUG=1` to see the reason. `mcp-recall profiles check` cannot help here: it only compares patterns between profiles that *loaded*, and an unparseable file is already gone by then

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

## Tool output not being stored

If a tool is running but nothing appears in `recall__list_stored()`:

**1. Check the denylist:**

```bash
RECALL_DEBUG=1 claude
# Look for: [recall:debug] SKIP denylist · mcp__myservice__get_item
```

Common causes — the tool name matches a built-in keyword pattern (`*token*`, `*secret*`, `*api_key*`, etc.) or an explicit entry (`mcp__1password__*`, etc.). If the tool is legitimate, add it to the allowlist in `~/.config/mcp-recall/config.toml`:

```toml
[denylist]
allowlist = ["mcp__myservice__get_item"]
```

**2. Check for secret detection:**

If a secret pattern (PEM header, AWS key, etc.) is found in the output, the item is skipped with a warning written to stderr — no debug flag needed:

```
[recall] skipped mcp__myservice__get_item: detected aws_access_key, pem_header
```

**3. Check the tool is actually going through the hook:**

HTTP transport MCPs are not intercepted — only stdio MCPs and the Bash tool go through `PostToolUse`. Verify the MCP is registered as a stdio server in `~/.claude.json`.

---

## `mcp-recall` command not found (from-source install)

If you installed from source and `mcp-recall` is not on PATH:

```bash
# Option 1 — alias
echo 'alias mcp-recall="bun /path/to/mcp-recall/plugins/mcp-recall/dist/cli.js"' >> ~/.zshrc
source ~/.zshrc

# Option 2 — symlink
ln -sf /path/to/mcp-recall/plugins/mcp-recall/dist/cli.js ~/.local/bin/mcp-recall
# Ensure ~/.local/bin is in your PATH
```

If the dist files don't exist yet, run `bun run build` first.

→ See [profiles quickstart — from source](profiles-quickstart.md#from-source) for the full setup.

---

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
