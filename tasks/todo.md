# todo

Active work and upcoming tasks.

## In Progress

_nothing in progress_

## Up Next — post v1.1 merge

### Immediate (after PR #71 merges)

- [ ] Close GitHub issues #59, #60, #61, #62, #63 as resolved by profile system (TOML profiles shipped)
- [ ] Close #67 (user-extensible handlers) as resolved by profile system
- [ ] Tag v1.1.0 release (`gh release create v1.1.0 --title "v1.1.0 — MCP-agnostic profile system"`)

---

### Seed profiles for Vercel, HubSpot, Calendar (#64–#66)

Add TOML profiles to `sakebomb/mcp-recall-profiles` (clone to `/home/sakebomb/git/mcp-recall-profiles`):

- `profiles/mcp__vercel/default.toml` — `json_extract`, deployments/projects list
- `profiles/mcp__hubspot/default.toml` — `json_extract`, contacts/deals/companies list
- `profiles/mcp__google_calendar/default.toml` — `json_extract`, events list (`items`, `events` paths)

After writing: `bun run validate && bun run manifest`, commit, push to main.

---

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
