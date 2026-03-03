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

## Agent commits directly to main

**Pattern**: Delegating a "commit and don't push" task to a general-purpose agent while on the `main` branch
**Mistake**: Agent committed directly to `main` instead of a feature branch, violating guardrail 2.2
**Rule**: Before delegating commit work to an agent, always either (a) be on a feature branch already, or (b) explicitly instruct the agent to create a branch. Recovery: `git checkout -b feat/...` from the bad HEAD, add remaining work, then `git checkout main && git reset --hard origin/main`.
**Date**: 2026-03-03

---

## `cp -r` double-nesting on repeated builds

**Pattern**: `cp -r src dst` where `dst` already exists as a directory
**Mistake**: Running `cp -r profiles plugins/mcp-recall/profiles` on a second build copies `profiles/` INTO the existing `plugins/mcp-recall/profiles/`, creating `plugins/mcp-recall/profiles/profiles/`
**Rule**: Always use `rm -rf dst && cp -r src dst` for build copy steps that overwrite a directory. Never assume `cp -r` replaces — it appends when the destination exists.
**Date**: 2026-03-03

---

## `mkdtempSync` vs `Date.now()` for unique test directories

**Pattern**: Creating multiple temp directories in a single test file's `beforeEach`
**Mistake**: `join(tmpdir(), \`prefix-${Date.now()}\`)` collides when called twice in the same millisecond, making `userDir === communityDir` and causing priority-tier tests to fail non-deterministically
**Rule**: Always use `mkdtempSync(join(tmpdir(), "prefix-"))` for test temp directories — it's OS-guaranteed unique.
**Date**: 2026-03-03

---

## Git

**Pattern**: Pushing commits to GitHub repos with email privacy enabled
**Mistake**: Committed with local Gmail address; GitHub rejected push with GH007
**Rule**: Both author AND committer email must use the GitHub noreply address (`<id>+<username>@users.noreply.github.com`). Amending author alone is not enough — set `GIT_COMMITTER_EMAIL` too, or configure `user.email` globally.
**Date**: 2026-03-01
