# Quickstart

Get mcp-recall working in under 2 minutes.

---

## 1. Install

**npm / bun (recommended):**

```bash
bun add -g mcp-recall    # or: npm install -g mcp-recall
mcp-recall install
```

`mcp-recall install` registers the MCP server and hooks in Claude Code, and adds a short instruction block to `~/.claude/CLAUDE.md` so Claude knows how to use the recall tools.

**Claude Code plugin marketplace:**

```bash
claude plugin marketplace add mcp-recall https://github.com/sakebomb/mcp-recall
claude plugin install mcp-recall@mcp-recall
```

For marketplace installs, add the [Claude instructions](#claude-instructions) manually (see below).

---

## 2. Install compression profiles

Profiles teach mcp-recall how to compress output from specific MCPs. Install community profiles for the MCPs you use:

```bash
mcp-recall profiles seed        # installs profiles for MCPs detected in ~/.claude.json
mcp-recall profiles seed --all  # or install the full community catalog
```

If your MCP isn't in the community catalog, generate a profile from your session data:

```bash
mcp-recall learn   # analyses your installed MCPs and generates TOML profiles automatically
```

---

## 3. Restart Claude Code

The MCP server and hooks register at startup. Restart once after installing.

---

## 4. Verify

```bash
mcp-recall status
```

You should see all green checkmarks. That's it — mcp-recall is active.

---

## Claude instructions

`mcp-recall install` automatically writes the following block to `~/.claude/CLAUDE.md`. If you installed via the plugin marketplace, or want to add it to a project-level `CLAUDE.md`, paste it manually:

```markdown
<!-- BEGIN mcp-recall -->
## mcp-recall

Session context from previous sessions is automatically injected at startup (pinned items, notes, recent activity). If it was truncated, call `recall__context()` for the full view.

When a tool output was compressed by mcp-recall (you'll see a summary with a recall ID like `recall_abc123`), call `recall__retrieve("recall_abc123")` when you need the full content.

Proactively:
- `recall__note("…")` — save important decisions or context worth keeping across sessions
- `recall__pin("recall_abc123")` — protect frequently-needed items from expiry and eviction
- `recall__search("query")` — find stored outputs by content when you don't have an ID
<!-- END mcp-recall -->
```

The `<!-- BEGIN mcp-recall -->` / `<!-- END mcp-recall -->` markers let `mcp-recall install` and `mcp-recall uninstall` manage the block automatically. If you customize the content, keep the markers — updates will replace only the content between them.

---

→ [Configuration](../README.md#configuration) · [Tools](tools.md) · [Profiles quickstart](profiles-quickstart.md) · [Troubleshooting](troubleshooting.md)
