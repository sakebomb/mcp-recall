# todo

Active work and upcoming tasks.

## In Progress

### #55 — debug mode (`RECALL_DEBUG=1` + `config.debug.enabled`)

**Files:**

| File | Change |
|------|--------|
| `src/debug.ts` | NEW — `dbg(msg)`: checks env var OR config, writes `[recall:debug] …` to stderr |
| `src/config.ts` | Add `[debug]` section to Zod schema + defaults (`enabled: false`) |
| `src/hooks/post-tool-use.ts` | 5 `dbg()` calls: denylist skip, intercepted size, dedup hit, handler name, no-compression skip, stored |
| `src/hooks/session-start.ts` | 2 `dbg()` calls: injected Xchars / nothing to inject |
| `src/cli.ts` | In catch block: print full stack trace when `RECALL_DEBUG` set |
| `tests/debug.test.ts` | NEW — unit tests for `dbg()`: silent, env-var activation, config activation |
| `tests/hooks.test.ts` | New describe block: 5 pipeline debug output tests |
| `tests/config.test.ts` | 2 tests: `debug.enabled` reads from TOML, defaults to false |

**Key decisions:**
- Dual activation: `RECALL_DEBUG=1` (temporary) or `[debug] enabled = true` in config.toml (persistent)
- Secret warning stays always-on (security event) — no change to line 43 in post-tool-use.ts
- `handler.name` used for logging — all handlers are named const exports, no API change needed
- Never log tool input values or response content in debug output — names and sizes only

**Log format:**
```
[recall:debug] intercepted mcp__playwright__snapshot · 56.2KB
[recall:debug] handler: playwrightHandler · mcp__playwright__snapshot
[recall:debug] STORED · mcp__playwright__snapshot · id=recall_a1b2c3d4 · 56.2KB→299B (99%)

[recall:debug] SKIP denylist · mcp__1password__item_lookup
[recall:debug] CACHE HIT · mcp__github__get_pr · id=recall_a1b2c3d4 · cached 2026-03-01
[recall:debug] SKIP no-compression · mcp__small__tool · 80B ≥ 95B
[recall:debug] session-start · project=abc12345 · injected 1.4KB
```

**Branch:** `feat/debug-mode`

## Recently Completed (2026-03-02)

- Installed plugin manually: MCP server in `~/.claude.json`, hooks in `~/.claude/settings.json`
- Awaiting first restart + end-to-end test

## Open Issues

| # | Title | Priority | Size | Notes |
|---|-------|----------|------|-------|
| #35 | feat: GitHub Actions CI — tests, typecheck, bundle freshness | P2: Medium | M | Deferred — waiting on self-hosted runner setup |

## Blocked

_nothing blocked_
