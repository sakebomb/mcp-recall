# todo

Active work and upcoming tasks.

## In Progress

_nothing in progress_

## Backlog

### Phase 2 — Denylist + Secret Detection
- [ ] Implement `src/denylist.ts` — built-in patterns + config-extensible denylist
- [ ] Implement `src/secrets.ts` — PEM, GitHub PAT, OpenAI key, etc. detection
- [ ] Unit tests for both modules
- [ ] Integrate into hook pipeline

### Phase 3 — Compression Handlers
- [ ] `handlers/playwright.ts` — interactive elements + visible text
- [ ] `handlers/github.ts` — number, title, state, body excerpt, labels
- [ ] `handlers/filesystem.ts` — line count + first 50 lines
- [ ] `handlers/json.ts` — 3-level depth limit, 3-item array samples
- [ ] `handlers/generic.ts` — first 500 chars fallback
- [ ] Unit tests for each handler

### Phase 4 — SQLite + FTS DB Layer
- [ ] Schema design: stored outputs, sessions, stats
- [ ] FTS5 index for full-text search
- [ ] CRUD + query operations
- [ ] Session-scoped expiry logic
- [ ] Integration tests

### Phase 5 — Hook Implementations
- [ ] `hooks/session-start.ts` — record active session day
- [ ] `hooks/post-tool-use.ts` — full intercept pipeline (denylist → secrets → compress → store)
- [ ] Wire `bin/recall` CLI to hook modules
- [ ] Integration tests

### Phase 6 — MCP Server Tools
- [ ] `recall__retrieve` — fetch by ID with optional FTS scoping
- [ ] `recall__search` — FTS across all stored outputs
- [ ] `recall__forget` — delete by ID / tool / session / age / all
- [ ] `recall__list_stored` — paginated browse
- [ ] `recall__stats` — session efficiency report
- [ ] Integration tests

## Blocked

_nothing blocked_
