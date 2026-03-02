# todo

Active work and upcoming tasks.

## In Progress

Issue #34 — housekeeping

## Planned batches

### PR A — mechanical fixes (quick wins)
- [ ] `LICENSE` file (MIT)
- [ ] `CLAUDE.md` — update phases table (all complete) + tool list (5→10)
- [ ] `tasks/todo.md` — "v3 complete" → "v6 complete"
- [ ] `package.json` — add license, repository, bugs, homepage, author, engines, keywords
- [ ] `.gitignore` — add .DS_Store, .idea/, .vscode/, *.swp etc.
- [ ] Remove dead `pin_recommendation_threshold` from `src/config.ts` (defined but never used)
- [ ] `.gitignore` note: `bun.lock` already tracked (text format); `bun.lockb` (binary) correctly ignored — close that checklist item

### PR B — JSDoc + handler headers
- [ ] JSDoc for all 19+ exported functions/types in `src/db/index.ts`
- [ ] File-level header comments for handler files that lack them

### PR C — README updates
- [ ] Document `recall__forget` input parameter schema (mode, id, tool, session, age, all, force)
- [ ] Document `recall__search` input parameters (query, tool, limit)
- [ ] Fix architecture diagram ("5 recall__* tools" → "10")
- [ ] Remove `pin_recommendation_threshold` from config docs (or keep if re-implemented)

### PR D — contributor files
- [ ] `CONTRIBUTING.md`
- [ ] `CHANGELOG.md` (v1–v6 summary)
- [ ] `bunfig.toml`
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] `.github/PULL_REQUEST_TEMPLATE.md`

### PR E — hooks dedup
- [ ] Build script copies root `hooks/hooks.json` → `plugins/mcp-recall/hooks/hooks.json`
- [ ] Delete `plugins/mcp-recall/hooks/hooks.json` as a standalone tracked file

### PR F — release tags
- [ ] Tag v1.0.0 through v1.6.0 at the appropriate commits
- [ ] Create GitHub releases for each

## Blocked

_nothing blocked_
