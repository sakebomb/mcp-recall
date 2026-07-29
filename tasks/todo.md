# todo

Active work and upcoming tasks.

## In Progress

**Phase 13 — stabilize + document.** No new features until it lands. Plan and phase table
are in `CLAUDE.md`; #208 and #205 stay open deliberately.

| Step | State |
|------|-------|
| A — CLAUDE.md accuracy | ✓ DONE, PR [#220](https://github.com/sakebomb/mcp-recall/pull/220) @ `709c780` |
| B — full docs re-read | ✓ DONE — both passes, all 12 surfaces, review-hardened |
| C — `docs/architecture.md` for contributors | not started ← resume here |
| D — `ROADMAP.md` with explicit non-goals | not started |

### Step B pass 1 — what was fixed (2026-07-28)

Every claim below was verified against code before changing, and the three inventories
(tools, config keys, env vars) now cross-check clean against `src/`.

**Stale counts** — `recall__suggest` shipped but was absent from `README.md` *and*
`docs/tools.md`, and both said "Ten tools"; `9 releases` → 13; `18 community profiles` → 26
(counted from the live manifest, twice in README); "over 40 days" → "since March 2026".

**Silence** — added a README CLI reference (`import` and `completions` were documented
nowhere), an environment-variable table (all 6, none were user-facing), `[debug] enabled`
in the config block, and a full `recall__suggest` section in `docs/tools.md`.

**Wrong, not merely absent** — the README documented 4 `gc` statuses when `STATUS_POLICY`
has 7, and called one "legacy" (really `legacy-fresh`/`legacy-stale`); `unverifiable` and
`unreadable` were undocumented despite being the safety-critical never-delete cases. Now a
table with the deletable flag per status. `CONTRIBUTING.md` Step 2 still told contributors
to register handlers with inline `if` statements — the code has used a `HANDLER_REGISTRY`
array for some time, so the instructions produced code that wouldn't dispatch. Step 5 told
them to add ASCII art to a markdown table.

**Code fix that belonged with the docs** — `profiles available` and `profiles info` are
implemented (`src/profiles/commands.ts:41,44`) and documented in the README, but were
missing from `mcp-recall --help`.

GOTCHAS confirmed again, both predicted by Phase A:
- A grep for `"ten tools"` missed `README.md:372` ("Ten `recall__*` tools"). Only the
  per-file read caught it. Do not trust an aggregate grep to find a count claim.
- Writing the env-var table, I asserted the community-profiles default from inference and
  got it wrong (`…/profiles/` vs the real `…/profiles/community/`, `src/profiles/loader.ts:29`).
  Caught only by verifying after writing — i.e. the fix pass introduced a fresh false claim,
  exactly the Phase A pattern. Verify every default you write, including your own.

Verified correct, NOT findings (checked, left alone): the `quickstart.md` CLAUDE.md block
matches `install/index.ts:98` verbatim; `CONTRIBUTING.md`'s `Handler` type matches
`types.ts:6`; `slack.ts`, the `LARGE_GITHUB_RESPONSE` fixture, and Bun `>=1.1.0` all exist as
described; every percentage in the Results table is arithmetically consistent. The
"88–97% context savings" claim pass 2 flagged as testable is not in the current README.
Stripe is both a built-in handler and a community profile — legitimate, since profiles
outrank the registry — so the README mentioning both is not a contradiction.

### The review round found more than the writing round (PR #225)

The first commit claimed to close pass 1 while only 5 of the 12 scoped surfaces had been
read in full; the other 7 had a targeted grep and nothing else. The review caught that, and
reading the remaining 7 produced the most serious findings of the whole phase. **Do not
count a grep as a read.**

- **`SECURITY.md` overstated the protection the code provides** — the worst direction for
  that file to be wrong in. It listed bare `*key*`, `*auth*`, `*env*` denylist patterns; the
  real ones are specific (`*api_key*`, `*oauth*`, `*env_var*`, …), so `list_keys`,
  `rotate_key`, `auth_config` and `get_env` are all stored. Proven by running `isDenied` on
  each. It also claimed AWS `ASIA*` detection (only `AKIA` exists), listed 7 of 16 secret
  patterns, and named 1 of 9 password managers.
- **`docs/profile-schema.md` + `docs/ai-profile-guide.md` both mis-stated the loader's
  validation rules** — the checklists that exist precisely to stop profiles being silently
  skipped. `version` is *not* semver-validated and `id` is *not* regex-checked at load
  (that guards install/remove paths); the guide also omitted `description` from the required
  list, which is the easiest way to get a profile silently dropped. Verified by loading a
  crafted profile: no `description` → skipped; `version = "not-semver-at-all"` → loads fine.
- **README `max_size_mb` called a "hard cap"** — `evictIfNeeded` only considers `pinned = 0`
  and returns early when all candidates are pinned (#205). And eviction was described as
  least-frequently-used directly above a correct description of the decay formula.
- **`legacy-fresh`/`legacy-stale` glossed as "created before path tracking"** — session-start
  records a path only when it resolves, so a *current* DB whose path never resolved is also
  pathless and deletable after 90 untouched days. That was my own new text.
- **`profiles available` / `info` were missing from all three completion scripts, and
  `import` from all three top-level lists** — same undiscoverable-surface defect as the help
  text. The subcommand set now lives in one constant asserted against help output and every
  completion script, guard-checked by removing each addition and confirming red.

The review also turned up a **code** bug, not a docs one:
[#226](https://github.com/sakebomb/mcp-recall/issues/226) — `import --keep-project-key`
stamps rows with the dump's original project key but still writes them to the *current*
project's database, while almost everything else is project-scoped. The CLI reports success
and then suggests `recall__search`, which finds nothing.

First wording of this entry said the rows are "unreachable" — **wrong, and it understated the
damage.** `retrieveOutput` is `SELECT * … WHERE id = ?` (`queries.ts:111`) with no project
filter, so they *are* readable by id. What is actually broken: `forgetOutputs` scopes every
branch including `all` (`queries.ts:434-444`), so they cannot be deleted through the tool at
all; and `evictIfNeeded` both totals and selects candidates project-scoped (`:202-216`), so
they escape `max_size_mb` and are never evicted — permanent disk the accounting can't see.
`export` is project-scoped too (`tools.ts:232-236`), so the original dump is the only
remaining record of their ids. The fix needs a decision (route by key / reject the flag), must
handle a dump holding several project keys, and now also needs a cleanup path for anyone who
already used the flag. Not fixed in #225 — Phase 13 is
documentation-only and this changes where data lands.

Method note for Step C: no CI job validates documentation — `ci.yml` is typecheck, tests,
bundle freshness, packaged CLI. Green CI says nothing about doc accuracy, which is the
entire substance of a docs PR. The three inventories (tools, config keys, env vars) are
mechanically checkable and would make a cheap CI guard; worth filing before Phase 13 closes.

### Step B needs TWO passes — they find disjoint classes of problem

1. **Self-consistency** (does the doc contradict itself or a sibling doc?) — cheap, high
   yield, but *structurally blind* to anything never written down. Run it **while writing**,
   per document, not as a final proofread: in Phase A, three of the four contradictions were
   introduced by the very commit that fixed another one.
2. **Inventory vs code** (is every real surface documented at all?) — the only pass that
   finds silence, which is what shipped a broken `npx` for two releases (#216).

### Pass 2 findings — the work-list for pass 1's fixes

- `recall__suggest` — missing from **both** `docs/tools.md` and `README.md` (shipped tool)
- `mcp-recall import` — missing from `README.md`
- `mcp-recall completions` — missing from `README.md`
- `debug.enabled` config key — documented nowhere user-facing (only `RECALL_DEBUG` is, in
  `docs/troubleshooting.md`)
- **No environment-variable reference exists anywhere in user docs.** `RECALL_CONFIG_PATH`
  and `RECALL_DB_PATH` appear only in `CLAUDE.md` (agent-facing); `RECALL_USER_PROFILES_PATH`,
  `RECALL_COMMUNITY_PROFILES_PATH`, `RECALL_BUNDLED_PROFILES_PATH` appear nowhere. Verified
  these are production overrides in `src/`, not test seams — `src/db/schema.ts:94` documents
  `RECALL_DB_PATH` as supported in a code comment.

Verified correctly documented, NOT gaps: all three `gc` flags; all three `recall__retrieve`
modes in `docs/tools.md`.

### Pass 1 scope when resuming

2,244 lines across 12 surfaces: `README.md` 520, `CONTRIBUTING.md` 259, `docs/profile-schema.md`
289, `docs/ai-profile-guide.md` 229, `docs/tools.md` 238, `docs/troubleshooting.md` 176,
`docs/profiles-quickstart.md` 141, `docs/retrain.md` 99, `docs/quickstart.md` 85,
`SECURITY.md` 66, plus `CODE_OF_CONDUCT.md` and `demo/README.md`. Verify claims empirically —
the README asserts things like "88–97% context savings" that are testable.

GOTCHA from Phase A: my own audit loops produced false results twice (a `grep -q "$d"` without
a trailing slash matched prose and hid `src/import/`; a `grep -c` aggregation wrongly reported
two env vars as undocumented everywhere). Re-verify per-file before believing loop output.

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

## ~~Release 1.10.0 + 1.10.1~~ ✓ DONE (2026-07-28)

**v1.10.0** (tag `f0c8f33`) then **v1.10.1** (tag `c704dbc`), both live on npm with SLSA
provenance; `latest` = 1.10.1. Closed #204.

1.10.1 exists because post-publish verification of 1.10.0 found the npm CLI had **never**
worked through a `.bin` symlink (#216): `bin/recall` used `dirname "$0"`, which doesn't
follow symlinks, so `npx mcp-recall install` — the README's primary onboarding — failed with
`Module not found .../node_modules/.bin/../src/cli.ts`. Pre-existing in 1.9.0 too, so it was
broken for two releases. A green suite plus a direct `bin/recall` call both looked fine;
nothing ran the *packaged* artifact. See [[verify-the-packaged-artifact]].

Two permanent guards added: `publish.yml` fails closed if the release tag and `package.json`
disagree (fired correctly on both releases), and a `Packaged CLI` CI job packs the tarball,
installs it, and runs the CLI through `.bin` + `npx` + `install --dry-run`.

---

## Up Next — filed 2026-07-27

| # | Title | Labels | Notes |
|---|-------|--------|-------|
| ~~[#202](https://github.com/sakebomb/mcp-recall/issues/202)~~ | ~~Pin the signer identity when verifying the manifest~~ | security, P1, S | ✓ **DONE** — merged PR [#206](https://github.com/sakebomb/mcp-recall/pull/206), main @ `4be445d`. GOTCHAS worth keeping: (1) `--signer-workflow` is a **prefix-anchored, unterminated** match — `…/workflows/man` passes, and it stops short of `@refs/heads/<ref>`, so it does *not* pin the branch. Use `--cert-identity` (exact SAN). (2) `--signer-workflow` also needs `<owner>/<repo>/<path>`; a bare path is rejected outright. (3) An old `gh` exits non-zero exactly like a bad signature — now detected and reported as a skip, see #208. |
| ~~[#203](https://github.com/sakebomb/mcp-recall/issues/203)~~ | ~~Stop profile tests shelling out to real `gh attestation verify`~~ | test, P2, S | ✓ **DONE** — merged PR [#210](https://github.com/sakebomb/mcp-recall/pull/210), main @ `66bd14f`. File 25s → 51ms; suite 34s → 7s. GOTCHAS: (1) `expect(spy).not.toHaveBeenCalled()` placed *after* `spy.mockRestore()` passes unconditionally — mockRestore clears the call record; count into a local. (2) A test that calls `loadConfig()` without pinning `RECALL_CONFIG_PATH` reads the *runner's* real config — use `writeConfig(mode)`. |
| ~~[#204](https://github.com/sakebomb/mcp-recall/issues/204)~~ | ~~Release v1.10.0~~ | chore, P2, S | ✓ **DONE** — released 1.10.0 *and* 1.10.1. Prep was PR [#211](https://github.com/sakebomb/mcp-recall/pull/211) — changelog cut, all three manifests at 1.10.0, dist rebuilt. **Still to do: tag → `gh release create` → verify npm.** Gotchas: bundle embeds the version so a version-only commit needs `bun run build` + committed dist; 1.9.0's publish first failed on a stale `NPM_TOKEN` (rotate from 1Password, then `gh run rerun <id> --failed`). `publish.yml` now fails closed if the tag and `package.json` disagree. |
| [#205](https://github.com/sakebomb/mcp-recall/issues/205) | Bound pinned data so `max_size_mb` isn't silently voided | enhancement, P2, M, needs-info | **Blocked on a design call**, not capacity: 4 options (separate pin budget / pins evictable / refuse writes / warn only). Lean is a separate `max_pinned_mb`. |
| ~~[#207](https://github.com/sakebomb/mcp-recall/issues/207)~~ | ~~`gc scanDatabases` test flakes on its 5s timeout~~ | test, P2, S | ✓ **DONE** — merged PR [#209](https://github.com/sakebomb/mcp-recall/pull/209), main @ `3eea1b8`. Measured: 200 implicit transactions = **4119ms** vs **22ms** batched — 18% headroom under a 5s timeout, hence load-sensitive. File 12.83s → 5.15s. Three loops, not one: grepping `.prepare(` missed loops calling `storeOutput` (its transaction is one layer down). |
| [#208](https://github.com/sakebomb/mcp-recall/issues/208) | `verify_signature = "error"` still proceeds unverified when `gh` is unavailable | security, P2, S, needs-info | **Blocked on a design call.** `error` strengthens *failure* handling, not *availability*. Pre-existing since #134; #206 documented it rather than changing it. Options: new `require` mode / redefine `error` (breaking) / keep. Lean is redefining `error`. |

### From the pre-tag review of 1.10.0 (2026-07-28)

Reviewed the release surface before tagging. Found and fixed one **data-loss defect** in
`gc`, merged as PR [#212](https://github.com/sakebomb/mcp-recall/pull/212) (main @ `c12ce9c`):
`classify` inferred "orphaned, safe to delete" from *path gone but parent exists*, which is
only valid for an absolute path — `dirname("")` and `dirname("bare-name")` are both `"."`,
which always exists, so `gc --force` deleted those databases. Reachable via a hook payload
with `cwd: ""`, since `resolveProjectPath` falls back to `cwd` verbatim and `cwd` is never
validated. Review round 2 also caught that the guard sat *after* `existsSync`, so a relative
path resolving against the invocation cwd classified as `active` — status depended on where
`gc` ran. No changelog entry: `gc` ships for the first time in 1.10.0, so it never reached users.

Also verified clean, no changes needed: the real v1.9.0 → v1.10.0 upgrade path (built a DB
with the tagged code in a worktree — `meta` is created, data intact), and that `gc` never
deletes the current DB, a foreign sqlite file, a corrupt file, an empty file, a directory
named `*.db`, or a symlink's out-of-store target.

| # | Title | Labels | Notes |
|---|-------|--------|-------|
| [#213](https://github.com/sakebomb/mcp-recall/issues/213) | Make the recorded project path absolute at the source | bug, P2, S | `resolve(cwd)` in `resolveProjectPath` is the single chokepoint — fixes the class; `post-tool-use.ts` inherits it. Keep #212's guard as defence in depth. |
| [#214](https://github.com/sakebomb/mcp-recall/issues/214) | `unverifiable` DBs are never reclaimable | enhancement, P3, S | Fall through to the pathless staleness rule so reclamation rests on "untouched > stale-days", never on a deleted-project inference. Bounded population once #213 lands. |

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
