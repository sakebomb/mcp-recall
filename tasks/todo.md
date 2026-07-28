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
| ~~[#202](https://github.com/sakebomb/mcp-recall/issues/202)~~ | ~~Pin the signer identity when verifying the manifest~~ | security, P1, S | ✓ **DONE** — merged PR [#206](https://github.com/sakebomb/mcp-recall/pull/206), main @ `4be445d`. GOTCHAS worth keeping: (1) `--signer-workflow` is a **prefix-anchored, unterminated** match — `…/workflows/man` passes, and it stops short of `@refs/heads/<ref>`, so it does *not* pin the branch. Use `--cert-identity` (exact SAN). (2) `--signer-workflow` also needs `<owner>/<repo>/<path>`; a bare path is rejected outright. (3) An old `gh` exits non-zero exactly like a bad signature — now detected and reported as a skip, see #208. |
| ~~[#203](https://github.com/sakebomb/mcp-recall/issues/203)~~ | ~~Stop profile tests shelling out to real `gh attestation verify`~~ | test, P2, S | ✓ **DONE** — merged PR [#210](https://github.com/sakebomb/mcp-recall/pull/210), main @ `66bd14f`. File 25s → 51ms; suite 34s → 7s. GOTCHAS: (1) `expect(spy).not.toHaveBeenCalled()` placed *after* `spy.mockRestore()` passes unconditionally — mockRestore clears the call record; count into a local. (2) A test that calls `loadConfig()` without pinning `RECALL_CONFIG_PATH` reads the *runner's* real config — use `writeConfig(mode)`. |
| [#204](https://github.com/sakebomb/mcp-recall/issues/204) | Release v1.10.0 | chore, P2, S | **Prep merged via PR [#211](https://github.com/sakebomb/mcp-recall/pull/211)** — changelog cut, all three manifests at 1.10.0, dist rebuilt. **Still to do: tag → `gh release create` → verify npm.** Gotchas: bundle embeds the version so a version-only commit needs `bun run build` + committed dist; 1.9.0's publish first failed on a stale `NPM_TOKEN` (rotate from 1Password, then `gh run rerun <id> --failed`). `publish.yml` now fails closed if the tag and `package.json` disagree. |
| [#205](https://github.com/sakebomb/mcp-recall/issues/205) | Bound pinned data so `max_size_mb` isn't silently voided | enhancement, P2, M, needs-info | **Blocked on a design call**, not capacity: 4 options (separate pin budget / pins evictable / refuse writes / warn only). Lean is a separate `max_pinned_mb`. |
| ~~[#207](https://github.com/sakebomb/mcp-recall/issues/207)~~ | ~~`gc scanDatabases` test flakes on its 5s timeout~~ | test, P2, S | ✓ **DONE** — merged PR [#209](https://github.com/sakebomb/mcp-recall/pull/209), main @ `3eea1b8`. Measured: 200 implicit transactions = **4119ms** vs **22ms** batched — 18% headroom under a 5s timeout, hence load-sensitive. File 12.83s → 5.15s. Three loops, not one: grepping `.prepare(` missed loops calling `storeOutput` (its transaction is one layer down). |
| [#208](https://github.com/sakebomb/mcp-recall/issues/208) | `verify_signature = "error"` still proceeds unverified when `gh` is unavailable | security, P2, S, needs-info | **Blocked on a design call.** `error` strengthens *failure* handling, not *availability*. Pre-existing since #134; #206 documented it rather than changing it. Options: new `require` mode / redefine `error` (breaking) / keep. Lean is redefining `error`. |

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
