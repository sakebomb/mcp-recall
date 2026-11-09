# Install and update

The README's [Quick start](../README.md#quick-start) is the short path. This page covers every install method, what to do after installing, updating, and uninstalling.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) installed
- [Bun](https://bun.sh) installed — `curl -fsSL https://bun.sh/install | bash` (not needed for the standalone binary, Option D)

## Option A — npm (recommended)

```bash
bun add -g mcp-recall    # or: npm i -g mcp-recall
mcp-recall install       # register hooks + MCP server in Claude Code
```

Install globally rather than through `npx` or `bunx`. `mcp-recall install` registers the path of the copy it runs from, and an `npx`/`bunx` copy lives in a cache that can be cleared, which would leave Claude Code pointing at files that are gone ([#455](https://github.com/sakebomb/mcp-recall/issues/455)).

`mcp-recall install` writes the MCP server entry and hooks to `~/.claude.json` and `~/.claude/settings.json`, and adds a short [instruction block](#claude-instructions) to `~/.claude/CLAUDE.md` so Claude knows how to use the recall tools. It's idempotent — safe to re-run after updates.

## Option B — Claude Code plugin marketplace

```bash
claude plugin marketplace add mcp-recall https://github.com/sakebomb/mcp-recall
claude plugin install mcp-recall@mcp-recall
```

Both hooks and the MCP server register automatically. Two things differ from Option A:

- The plugin does not write the [Claude instructions](#claude-instructions) block. Paste it into `~/.claude/CLAUDE.md` yourself.
- The plugin puts no `mcp-recall` command on your `PATH`, so the CLI steps in [After installing](#after-installing) (`profiles seed`, `status`) are not available. Don't add Option A on top: that registers the hooks twice. If you want the CLI, use Option A instead. Verify a plugin install with `claude --debug` ([#456](https://github.com/sakebomb/mcp-recall/issues/456)).

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

## After installing

1. **Restart Claude Code.** The MCP server and hooks register at startup.
2. **Check the install:** `mcp-recall status` should show every check green.
3. **Optional: install compression profiles** for the MCP servers you use. Profiles teach mcp-recall how to summarize a specific server's output.

   ```bash
   mcp-recall profiles seed        # profiles for the MCPs detected in ~/.claude.json
   mcp-recall profiles seed --all  # or the full community catalog
   mcp-recall learn                # generate profiles for MCPs the catalog doesn't cover
   ```

   See the [profiles quickstart](profiles-quickstart.md) for more.

## Claude instructions

`mcp-recall install` writes the following block to `~/.claude/CLAUDE.md`. If you installed via the plugin marketplace, or want it in a project-level `CLAUDE.md`, paste it yourself:

```markdown
<!-- BEGIN mcp-recall -->
## mcp-recall

Session context from previous sessions is automatically injected at startup (pinned items, notes, recent activity). If it was truncated, call `recall__context()` for the full view.

When a tool output was compressed by mcp-recall (you'll see a `[recall:recall_abc123 · …]` line above a summary), call `recall__retrieve({"id": "recall_abc123"})` for the content behind it, or add a `query` to see the parts that match.

Proactively:
- `recall__note("…")` — save important decisions or context worth keeping across sessions
- `recall__pin("recall_abc123")` — protect frequently-needed items from expiry and eviction
- `recall__search("query")` — find stored outputs by content when you don't have an ID
<!-- END mcp-recall -->
```

The `<!-- BEGIN mcp-recall -->` / `<!-- END mcp-recall -->` markers let `mcp-recall install` and `mcp-recall uninstall` manage the block. If you customize the content, keep the markers: updates replace only what is between them.

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

## Uninstalling

| Installed with | Uninstall |
|---|---|
| Option A — npm / bun | `mcp-recall uninstall && bun remove -g mcp-recall` (or `npm rm -g mcp-recall`) |
| Option B — plugin marketplace | `claude plugin uninstall mcp-recall@mcp-recall`, then delete the [Claude instructions](#claude-instructions) block if you pasted it |
| Option C — from source | `./bin/recall uninstall` from the clone, then delete the clone and any alias or symlink you added |
| Option D — standalone binary | `mcp-recall uninstall`, then delete the binary |

`mcp-recall uninstall` removes the MCP server entry, both hooks and the `CLAUDE.md` block. It leaves your stored output (`~/.local/share/mcp-recall/`) and your config (`~/.config/mcp-recall/`) on disk; delete those folders too to remove everything.

## Running alongside rtk

[rtk](https://github.com/rtk-ai/rtk)'s hook rewrites a Bash command before it runs (`cat f` → `rtk read f`, `git diff` → `rtk git diff`), so mcp-recall sees rtk's output, not the command's. Measured with rtk 1.0.1:

- **Reads stay reads.** `rtk read`, `rtk recall` and an rtk-run `git diff` are content reads: delivered whole up to 8 KB, body kept above it.
- **rtk's output gets the shell fallback**, never a handler for the raw command. rtk reshapes output (its `grep` prints a sample under its true total), and a parser for the raw shape would report a wrong count. So an rtk-run command is summarized less finely than mcp-recall alone would: a large `rtk git diff` gets a 25-line head (body kept) rather than a per-file summary.
- **rtk's recovery hints survive.** A summary that cuts a line holding `rtk recall <hash>` or `[full diff: rtk … --no-compact]` appends it.
- **Analytics stay per command**: fingerprints read `rtk git diff`, `rtk read`, not `rtk`.

rtk's optional PostToolUse pipeline (`rtk:posthook`) also rewrites tool output; running it alongside mcp-recall has not been tested.

---

→ [Configuration](configuration.md) · [Tools](tools.md) · [Troubleshooting](troubleshooting.md)
