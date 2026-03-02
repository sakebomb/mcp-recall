# lessons

Learnings captured after corrections. Updated after any mistake or course correction.

## Format

**Pattern**: what situation triggers this
**Mistake**: what went wrong
**Rule**: the corrected behavior
**Date**: YYYY-MM-DD

---

## Claude Code Plugin Installation

**Pattern**: Installing a local Claude Code plugin not yet in a marketplace
**Mistake**: `claude plugin install ./path` only works for marketplace-registered plugins — fails with "Plugin not found in any configured marketplace"
**Rule**: For local installs, add MCP server to `~/.claude.json` under `mcpServers`, and add hooks to `~/.claude/settings.json` under `hooks`. Use absolute paths (no `CLAUDE_PLUGIN_ROOT`). MCP server schema: `{type:"stdio", command:"bun", args:["/abs/path/dist/server.js"]}`.
**Date**: 2026-03-02

---

## Git

**Pattern**: Pushing commits to GitHub repos with email privacy enabled
**Mistake**: Committed with local Gmail address; GitHub rejected push with GH007
**Rule**: Both author AND committer email must use the GitHub noreply address (`<id>+<username>@users.noreply.github.com`). Amending author alone is not enough — set `GIT_COMMITTER_EMAIL` too, or configure `user.email` globally.
**Date**: 2026-03-01
