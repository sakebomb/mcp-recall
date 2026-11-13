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

## A piped test run does not gate a commit

**Pattern**: Running `bun test` and `git commit` in one Bash command
**Mistake**: `bun test | grep … ; git add … && git commit …` committed while the suite reported a failure: the pipe hands back `grep`'s exit status, and `;` runs the commit regardless. The failures were timeouts under load from another session, but the commit should not have waited on luck
**Rule**: Run the suite unpiped and chain with `&&` (`bun test && git commit …`), or set `-o pipefail` first. Read the summary in its own step. When a run fails only on timeouts while another session loads the machine, rerun the failing files alone before calling it a regression
**Date**: 2026-11-09

---

## Check the installed version before filing a bug seen live

**Pattern**: mcp-recall misbehaves during a session (screenshots stripped, JSON reduced to its keys) and the next step looks like filing an issue
**Mistake**: The hooks and MCP server ran a global install three releases old (1.18.1 vs 1.21.0). Both symptoms were already fixed (#441/#442, #403/#406), and an issue filed from them would have charged fixed bugs to current code
**Rule**: Before filing, compare `jq -r .version` of the install the hooks run (the path in `~/.claude/settings.json`) with the latest release, and re-run the stored original through main's handlers. File only what still reproduces on current code. After upgrading, restart every session: a running MCP server keeps the old code
**Date**: 2026-11-13

---

## Git

**Pattern**: Pushing commits to GitHub repos with email privacy enabled
**Mistake**: Committed with local Gmail address; GitHub rejected push with GH007
**Rule**: Both author AND committer email must use the GitHub noreply address (`<id>+<username>@users.noreply.github.com`). Amending author alone is not enough — set `GIT_COMMITTER_EMAIL` too, or configure `user.email` globally.
**Date**: 2026-03-01
