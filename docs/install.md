# Install and update

The [quickstart](quickstart.md) is the two-minute path. This page covers every install method, updating, and uninstalling.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) installed
- [Bun](https://bun.sh) installed — `curl -fsSL https://bun.sh/install | bash`

## Option A — npm (recommended)

No global install required — run directly with npx or bunx:

```bash
npx mcp-recall install   # or: bunx mcp-recall install
```

Or install globally for faster subsequent runs:

```bash
bun add -g mcp-recall    # or: npm i -g mcp-recall
mcp-recall install       # register hooks + MCP server in Claude Code
mcp-recall status        # verify
```

`mcp-recall install` writes the MCP server entry and hooks to `~/.claude.json` and `~/.claude/settings.json`, and adds a short instruction block to `~/.claude/CLAUDE.md` so Claude knows how to use the recall tools. It's idempotent — safe to re-run after updates.

Update: `bun update -g mcp-recall && mcp-recall install`

Uninstall: `mcp-recall uninstall && bun remove -g mcp-recall`

## Option B — Claude Code plugin marketplace

```bash
claude plugin marketplace add mcp-recall https://github.com/sakebomb/mcp-recall
claude plugin install mcp-recall@mcp-recall
```

Both hooks and the MCP server register automatically. Verify with `claude --debug`.

## Option C — from source

```bash
git clone https://github.com/sakebomb/mcp-recall
cd mcp-recall
bun install
bun run build
./bin/recall install
```

The `mcp-recall` binary is not on PATH for source installs. Add an alias so the CLI works everywhere:

```bash
echo 'alias mcp-recall="bun /path/to/mcp-recall/plugins/mcp-recall/dist/cli.js"' >> ~/.zshrc
source ~/.zshrc
```

Or symlink it:

```bash
ln -sf /path/to/mcp-recall/plugins/mcp-recall/dist/cli.js ~/.local/bin/mcp-recall
```

## Updating

### Option A — npm / bun global install

```bash
bun update -g mcp-recall && mcp-recall install
```

`mcp-recall install` is idempotent — it updates hook paths and the MCP server entry in place without touching your stored data or config.

### Option B — Claude Code plugin marketplace

```bash
claude plugin update mcp-recall@mcp-recall
```

### Option C — from source

```bash
git pull
bun install
bun run build
mcp-recall install   # re-registers hooks with the new binary path
```

### After updating

Run `mcp-recall status` to confirm the new version is active and hooks are registered correctly. Then update community profiles to pick up any new or revised ones:

```bash
mcp-recall profiles update
```

---

→ [Quickstart](quickstart.md) · [Configuration](configuration.md) · [Troubleshooting](troubleshooting.md)
