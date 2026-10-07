# Install and update

The [quickstart](quickstart.md) is the two-minute path. This page covers every install method, updating, and uninstalling.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) installed
- [Bun](https://bun.sh) installed — `curl -fsSL https://bun.sh/install | bash` (not needed for the standalone binary, Option D)

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
mkdir -p ~/.local/bin
ln -sf /path/to/mcp-recall/plugins/mcp-recall/dist/cli.js ~/.local/bin/mcp-recall
```

## Option D — standalone binary (no Bun)

One file runs the CLI, both hooks and the MCP server (`mcp-recall serve`), with no Bun or Node installed. Releases after 1.17.0 attach a binary for each platform and a `SHA256SUMS`:

| Platform | File |
|---|---|
| Linux x64 / arm64 | `mcp-recall-linux-x64`, `mcp-recall-linux-arm64` |
| macOS Apple silicon / Intel | `mcp-recall-darwin-arm64`, `mcp-recall-darwin-x64` |
| Windows x64 | `mcp-recall-windows-x64.exe` |

```bash
F=mcp-recall-linux-x64   # pick yours from the table
curl -fLO https://github.com/sakebomb/mcp-recall/releases/latest/download/$F
curl -fLO https://github.com/sakebomb/mcp-recall/releases/latest/download/SHA256SUMS
grep " $F\$" SHA256SUMS | sha256sum -c       # macOS: … | shasum -a 256 -c
mkdir -p ~/.local/bin                        # absent on a default macOS account
install -m 755 $F ~/.local/bin/mcp-recall
~/.local/bin/mcp-recall install              # registers the binary itself as hooks and server
```

The hooks and server use the binary's full path, so they work without `~/.local/bin` on your `PATH`. Add it to `PATH` only to type `mcp-recall` yourself.

To build one from source instead: `bun run build:binary` (this platform) or `bun run build:binary --all`, into `dist/bin/`.

A binary is 60–95 MB, since it carries the Bun runtime. Its bundled profiles are inside it, and are copied out once per version to `~/.local/share/mcp-recall/bundled-profiles/`. The hooks name the binary's path, so run `mcp-recall install` again if you move it. CI runs every binary on its own OS. The macOS binaries are not notarized: `curl` leaves them runnable, but Gatekeeper blocks one downloaded through a browser until you clear the quarantine flag with `xattr -d com.apple.quarantine ~/.local/bin/mcp-recall`.

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

### Option D — standalone binary

Download the new release's file over the old one, as in [Option D](#option-d--standalone-binary-no-bun) above, then run `mcp-recall install`. It is a no-op unless the binary's path changed.

### After updating

Run `mcp-recall status` to confirm the new version is active and hooks are registered correctly. Then update community profiles to pick up any new or revised ones:

```bash
mcp-recall profiles update
```

---

→ [Quickstart](quickstart.md) · [Configuration](configuration.md) · [Troubleshooting](troubleshooting.md)
