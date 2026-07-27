# todo

Active work and upcoming tasks.

## In Progress

_nothing in progress_

## Up Next

_nothing scheduled — see backlog below_

---

## ~~DB lifecycle hardening~~ ✓ DONE (2026-07-23) — MERGED PR #201, closed #200

Shipped: `mcp-recall gc` (orphan-DB reclamation, `--force`/`--stale-days`/`--vacuum`),
free-page reclamation on evict/prune, pin-budget stats, session-start `gc` reminder +
`status` store line + README Maintenance. 6-agent `/review-pr` pass hardened orphan
classification (unmounted-volume `unverifiable`, non-recall→`unreadable`, resolved
current-DB match, exhaustive STATUS_POLICY) before merge. Live cleanup reclaimed ~4GB
(77 DBs/5.15GB → 16/~1.1GB). 759 tests. See [[project_status]] memory for detail.

---

## ~~Security: Manifest signing (sigstore — Phase 2)~~ ✓ DONE (2026-03-12)

Shipped in PR #134 (mcp-recall) + profiles PR #7. Attestation is live.

---

## ~~Security: manifest attestation broken in production~~ ✓ DONE (2026-07-27) — profiles PR #10

Live `manifest.json` had carried **no attestation since 2026-04-08**, so every
`profiles install/seed/update/available` warned and installed against an unverified
trust root (client defaults `verify_signature` to `warn`). Cause was a cross-workflow
race, not bad signing config: `sign-manifest.yml` triggered on pushes touching
`manifest.json`, but the final content is committed by `github-actions[bot]` via the
default `GITHUB_TOKEN` — which GitHub never lets trigger workflows. Signing only ever
ran on the human commit, seconds *before* the bot replaced the file.

Fixed by folding attestation into the regenerate job and deleting `sign-manifest.yml`.
Review pass added 4 more gaps: widened paths (`manifest.json`, `scripts/manifest.ts`),
`concurrency` group, `if: github.ref == 'refs/heads/main'` on attest (a branch dispatch
could otherwise mint a repo-valid attestation for arbitrary content), and a `git push`
rebase-retry. VERIFIED: live manifest exits 0, signed by `manifest.yml@refs/heads/main`;
`profiles available` clean in both `warn` and `error` mode.

## Up Next — filed 2026-07-27

| # | Title | Labels | Notes |
|---|-------|--------|-------|
| [#202](https://github.com/sakebomb/mcp-recall/issues/202) | Pin the signer workflow when verifying the manifest | security, P1, S | **PR open.** GOTCHA: `--signer-workflow` needs `[host/]<owner>/<repo>/<path>` — a bare `.github/workflows/manifest.yml` is rejected by `gh` and fails verification outright. |
| [#203](https://github.com/sakebomb/mcp-recall/issues/203) | Stop profile tests shelling out to real `gh attestation verify` | test, P2, S | NOTE: `fetch` is already stubbed; what leaks is `verifyManifest` → real `Bun.spawnSync(["gh", …])` in the three fetch-stubbing blocks. Narrower than first thought. |
| [#204](https://github.com/sakebomb/mcp-recall/issues/204) | Release v1.10.0 | chore, P2, S | #201 sits in `[Unreleased]`; `package.json` still 1.9.0. Bundle embeds the version → `bun run build` + commit dist or `Bundle freshness` CI fails. |
| [#205](https://github.com/sakebomb/mcp-recall/issues/205) | Bound pinned data so `max_size_mb` isn't silently voided | enhancement, P2, M, needs-info | **Blocked on a design call**, not capacity: 4 options (separate pin budget / pins evictable / refuse writes / warn only). Lean is a separate `max_pinned_mb`. |

Unfiled minor nits in the **profiles** repo (low value, no issue opened): README documents
no attestation-verification steps; `checkout@v4` in `manifest.yml`/`ci.yml` vs `@v5` in
`claude.yml`.

---

## Open Issues (paused / backlog)

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| Claude Code | Runtime config via `/mcp` | — | On hold |
| OpenCode | `tool.execute.after` output mod | — | On hold, v2.0 |
| Layer 2 | `recall__register_profile` MCP tool | — | On hold, v2.0 — when MCPs self-describe |
