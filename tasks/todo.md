# todo

Active work and upcoming tasks.

## In Progress

### v2 — Phase 2b: Hook Updates
- [ ] `post-tool-use`: compute `input_hash` from `tool_name + tool_input`, check dedup before compressing
- [ ] `post-tool-use`: return cached summary with `[recall:id · cached · <date>]` header on hit
- [ ] `post-tool-use`: call `evictIfNeeded` after storing
- [ ] Tests

## Backlog

### v2 — Phase 2c: MCP Tools
- [ ] `recall__pin(id, pinned?)` — pin/unpin an item, protect from expiry and eviction
- [ ] `recall__note(text, title?)` — store arbitrary text as `tool_name = "recall__note"`
- [ ] `recall__export` — JSON dump of all stored items for current project
- [ ] Update `recall__retrieve` — use `retrieveSnippet()` when query provided; call `recordAccess`
- [ ] Update `recall__list_stored` — add `sort: "accessed"` using access_count + last_accessed
- [ ] Update `recall__forget` — skip pinned items; add `force` param to override
- [ ] Tests for all new/updated tools

### v2 — Phase 2d: Additional Handlers
- [ ] `handlers/csv.ts` — header row + first 5 rows + row count
- [ ] `handlers/linear.ts` — issue number, title, state, priority, description excerpt
- [ ] `handlers/slack.ts` — channel, user, timestamp, message text excerpt
- [ ] Update dispatcher in `handlers/index.ts`
- [ ] Tests for each handler

## Blocked

_nothing blocked_
