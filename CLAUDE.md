# CLAUDE.md – mcp-recall

Project-level conventions. Global `~/.claude/CLAUDE.md` guardrails always take precedence on conflicts.

## Project Overview

**mcp-recall** is a Claude Code plugin that intercepts large MCP tool outputs (Playwright snapshots, GitHub API responses, large file reads), compresses them, stores full versions in SQLite with FTS, and delivers brief summaries to Claude. When Claude needs detail, it retrieves via `recall__*` tools. Goal: enable 3+ hour sessions by preventing context window exhaustion.

## Tech Stack

- **Runtime**: Bun (package manager + test runner — use `bun` not `npm`)
- **Language**: TypeScript strict mode, ESNext target
- **Database**: SQLite with FTS5 (built into Bun via `bun:sqlite`)
- **Schema validation**: Zod
- **Config format**: TOML (`smol-toml`)

## Commands

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun run typecheck     # tsc --noEmit
bun run start         # MCP server
bun run dev           # MCP server in watch mode
```

No `just` / `make` in this project. Use `bun test` directly (not `just test`).

## Architecture

```
bin/recall              Shell entrypoint for hooks (session-start, post-tool-use)
src/
  server.ts             MCP server — exposes 5 recall__* tools
  cli.ts                Hook CLI dispatcher
  config.ts             TOML config loader (Zod-validated, cached)
  project-key.ts        Git root detection + SHA256 path hash
  db/                   SQLite + FTS layer (Phase 4)
  handlers/             Compression handlers per tool type (Phase 3)
  hooks/                Hook implementations (Phase 5)
  denylist.ts           Built-in + configurable denylist (Phase 2)
  secrets.ts            Secret pattern detection before any write (Phase 2)
tests/                  Bun tests, co-located by module name
.claude-plugin/plugin.json   Claude Code plugin manifest
hooks/hooks.json        Hook definitions (SessionStart + PostToolUse)
```

**Hook flow**: `PostToolUse` intercepts all `mcp__*` tools (except `mcp__recall__*`) → denylist check → secret scan → compress → store in SQLite → return summary to Claude.

**MCP server tools** (all `recall__` prefixed):
- `recall__retrieve` — fetch stored content by ID, FTS-scoped
- `recall__search` — FTS across stored outputs
- `recall__forget` — delete by ID / tool / session / age / all
- `recall__list_stored` — browse stored items
- `recall__stats` — session efficiency report

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Scaffold, config, project-key | Complete (feat/phase-1-scaffold) |
| 2 | Denylist + secret detection | Planned |
| 3 | Compression handlers | Planned |
| 4 | SQLite + FTS DB layer | Planned |
| 5 | Hook implementations | Planned |
| 6 | MCP server tools | Planned |

## Testing Conventions

- Test files: `tests/<module>.test.ts`
- Tests use Bun's native test runner (`import { test, expect, describe } from "bun:test"`)
- No external test frameworks
- Name tests: `"<what> <expected>"` (e.g., `"merges user config over defaults"`)
- `resetConfig()` must be called in `afterEach` for config tests to avoid cache bleed

## Key Config Paths

- Default config: `~/.config/mcp-recall/config.toml`
- Override via: `RECALL_CONFIG_PATH` env var
- SQLite DB: excluded from git via `.gitignore` (`*.db*`)

## Denylist Defaults (never store outputs from)

- `mcp__1password__.*`
- Tool names matching: `*secret*`, `*token*`, `*password*`, `*credential*`, `*key*`, `*auth*`, `*env*`
- `mcp__recall__.*` (never intercept own tools)
