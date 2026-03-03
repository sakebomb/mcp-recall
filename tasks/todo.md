# todo

Active work and upcoming tasks.

## In Progress

_nothing in progress_

## Up Next

### #58 — Hot cache / smarter SessionStart (P3)

SessionStart currently injects pinned items + notes. Enhancement: also preload the top-N most-accessed items from the last session into context, reducing cold-start retrieval latency.

Files: `src/hooks/session-start.ts`, `src/db/index.ts`

---

### `mcp-recall profiles retrain` (future)

Analyze the stored SQLite corpus for a project to improve extraction rules for existing profiles. Reads `recall_outputs` grouped by `tool_name`, samples stored content, suggests better `items_path` / `fields`.

---

## Open Issues (paused / backlog)

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| #49 | Jira community handler | P2 | Good first issue — point at CONTRIBUTING.md |
| #50 | Notion community handler | P2 | Good first issue |
| #51 | Database results handler | P2 | Good first issue |
| #52 | Sentry handler | P2 | Good first issue |
| #53 | GitLab handler | P2 | Good first issue |
| Claude Code | Runtime config via `/mcp` | — | On hold |
| OpenCode | `tool.execute.after` output mod | — | On hold, v2.0 |
| Layer 2 | `recall__register_profile` MCP tool | — | On hold, v2.0 — when MCPs self-describe |
