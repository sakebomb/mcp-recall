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
