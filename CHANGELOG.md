# Changelog

All notable changes to mcp-recall are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Added

- **Command-aware Bash compression for compilers, typecheckers, and linters.** `cargo build`/`check`/`clippy`, `go build`/`vet`, `tsc`, `eslint`, `ruff`, and `npm`/`pnpm`/`yarn`/`bun run typecheck`/`lint`/`build` now route to a diagnostics handler that collapses verbose build output to a headline error/warning count plus the individual diagnostics (errors first, capped, with `file:line` locations) — measured at ~94% byte reduction on a large `tsc` run — while the full output stays retrievable via `recall__*`. The handler never reports success when the command exited non-zero, and falls back to the raw shell handler whenever it cannot recognise any diagnostics, so an unparsed failure is shown head/tail rather than hidden.

### Fixed

- **`stderr` is no longer dropped from Bash tool output.** Native Bash responses arrive as a JSON string (`{exit_code, stdout, stderr}`), but the shared `extractStderr` helper only handled the object shape and returned `""` for the string form — so every CLI-aware Bash handler (build, package-install, test-runner) silently lost `stderr`, where compilers and many tools write their errors. It now parses the JSON-string shape symmetrically with `extractStdout`.

## [1.12.0] — 2026-08-02

### Added

- **`recall__forget` and `recall__list_stored` accept a `project_key` override to reach rows stranded under a foreign key.** The removed `import --keep-project-key` flag (#226) could leave rows stamped with a foreign project key; every `forget`/`list_stored` branch is scoped to the current key, so those rows were only reachable via raw `sqlite3`. Both tools now take an optional explicit `project_key` that retargets the operation to that one key, and a default `recall__list_stored` appends a footer naming any foreign keys present (with row counts) so they can be discovered. The override requires a non-empty explicit key — there is no all-projects wildcard — must be paired with a selector (`all`+`confirmed`, or `id`/`tool`/`session_id`/`older_than_days`) rather than silently no-opping, and `all: true` still requires `confirmed: true` under it, so scope can never be widened by accident. A foreign-key operation that matches nothing names the keys that do exist, so a mistyped key isn't mistaken for "nothing there". Default current-project deletes and listings are unchanged; the only default-path change is the new discovery footer, shown solely when foreign-keyed rows are present (#237)
- **`store.max_pinned_mb` bounds pinned data (default: half of `max_size_mb`).** Pinned items are exempt from eviction, so without a separate cap an unbounded number of pins silently voids `store.max_size_mb` — observed in dogfooding when a store reached 99% pinned. `recall__pin` now enforces this cap *at pin time*: a pin that would push total pinned bytes past `max_pinned_mb` is refused with a message naming what to do (unpin, raise the cap, or `recall__forget`), and the bound holds even if the caller ignores the error, since the row is never marked pinned. Unpinning and re-pinning an already-pinned item are never budget-checked. The cap defaults to half of the effective `max_size_mb` (so lowering the total cap alone never creates a contradiction) and must not exceed it (a config that sets it higher is rejected to defaults). Existing over-cap pins are never auto-deleted; `recall__stats` reports pinned usage against the new cap (#205)

### Fixed

- **`eviction_half_life_days = inf` no longer silently disables decay eviction.** `inf` is legal TOML and passed the bare `z.number().positive()` check (since `Infinity > 0`), so the loader accepted it; `Math.max(1, Infinity)` then made every recency factor `1`, quietly degrading eviction from recency-weighted to plain LFU with no error. The config schema now rejects non-finite values (`.finite()`), so such a config falls back to the default `7`, and `evictIfNeeded` guards its half-life with `Number.isFinite` as defense in depth against a direct caller passing `Infinity` or `NaN` (#228)

## [1.11.0] — 2026-08-01

### Changed

- **BREAKING (non-default mode): `verify_signature = "error"` now hard-fails when signature verification cannot run.** `error` previously governed only how a *failed* signature was handled — if `gh` was absent from `PATH`, or too old for the flags we verify with, it wrote a line to stderr and proceeded against an **unverified** manifest, the opposite of what a user setting `error` to guarantee verification expects. `error` now means verification must *succeed*: a missing or unusable `gh` is fatal for `profiles install/seed/update`, with a message distinct from a signature failure (an unusable tool is not evidence of tampering) that names `--skip-verify` as the escape hatch. `warn` (the default) and `skip` are unchanged. If you run `error` in an environment without a usable `gh` (a slim container image, for instance) and intend to proceed, pass `--skip-verify` or set `verify_signature = "warn"` (#208)

### Fixed

- **`mcp-recall profiles info` no longer masks a verification failure as being offline.** `info` fetches the community manifest to enrich its output and wrapped the fetch in a bare `catch` that reported *any* failure as "(offline — showing local data only)". Because the fetch also verifies the manifest's signature, that `catch` swallowed verification throws too: with `verify_signature = "error"`, `info` never hard-failed — a signature that did not verify, or (after #208) verification that could not run, both collapsed into the same "offline" line as a genuine network error, so a user relying on `error` got no signal that verification had failed on this path and could not tell tampering from being offline. Verification failures now propagate (hard-failing in `error` mode, consistent with `install/seed/update`) via a typed `ManifestVerificationError`, while a real network/fetch error still degrades to the local-only view. `info` installs nothing, so the exposure was lower than the write commands — hence a distinct, lower-severity fix from #208 (#234)
- **`mcp-recall import --keep-project-key` is rejected instead of silently stranding data.** The flag stamped each imported row with the dump's original project key but still wrote the rows to the *current* project's database. Because every project-scoped path (`search`, `list_stored`, `stats`, `suggest`, `recall__forget`, and the `store.max_size_mb` accounting) filters on the current key, those rows were readable only by `recall__retrieve`-by-id and otherwise inert — invisible to discovery, undeletable through the tool layer, and never evicted — while the CLI reported success and even suggested `recall__search` to verify. `import` now errors on the flag, explaining that the store is always the current project and pointing at a recovery procedure; a plain `import` re-stamps rows with the current key so they are reachable and deletable as normal. To clean up rows already stranded by the old flag, see [Recovering rows stranded by the old import flag](docs/troubleshooting.md#recovering-rows-stranded-by-the-old-import-flag) in the troubleshooting guide (#226)
- **The recorded project path is now always absolute.** `session-start` stores a `project_path` that `mcp-recall gc` uses to classify each project database, but it was taken verbatim from the hook payload's `cwd`, which is never validated — so a relative or empty value could be stored. `gc` cannot root such a path, so it classified those databases `unverifiable`: never deleted, but also never reclaimable, even by `--vacuum`. The path is now absolutised at its source, and one that does not resolve to a real directory is not recorded at all rather than recorded as a guess, so this can no longer happen for newly recorded paths. Nothing rewrites an existing one: a database that already recorded a relative path keeps it, stays `unverifiable`, and must be removed by hand. Note for anyone whose hook payload supplied a *relative* `cwd`: the project key is a hash of this value, so it changes — that project starts a new database and its earlier history becomes unreachable (nothing is deleted). Claude Code supplies an absolute `cwd`, so this is not expected in normal use (#213)

## [1.10.1] — 2026-07-28

### Fixed

- **The `mcp-recall` CLI works again when installed from npm.** `bin/recall` located `src/cli.ts` with `dirname "$0"`, which does not follow symlinks — and npm and bun install a `bin` entry as a symlink, so `npx mcp-recall`, `bunx mcp-recall`, and a global install all failed with `Module not found .../node_modules/.bin/../src/cli.ts` while a direct call to `bin/recall` worked. Since `mcp-recall install` is how hooks and the MCP server get registered, npm users could not complete setup. Present in 1.9.0 and 1.10.0 (#216)

## [1.10.0] — 2026-07-28

### Added

- **`mcp-recall gc` command** — reclaims disk from the per-project database store. Lists every project DB with a status (active / orphaned / legacy) and its reclaimable size; deletes orphaned DBs (recorded project path no longer exists on disk) and stale legacy DBs on `--force`. Defaults to a dry run. Flags: `--force`, `--stale-days N` (default 90), `--vacuum` (full-VACUUM survivors to reclaim free pages and upgrade legacy `auto_vacuum=NONE` databases). The active project's DB is never a deletion candidate (#200)
- **Project-path metadata** — session start records the resolved project path in a per-DB `meta` table, enabling orphan detection in `gc` (#200)
- **Pin-budget awareness in `recall__stats`** — reports pinned item count and pinned bytes, and warns when pinned data (which is exempt from eviction) reaches a high fraction of the `store.max_size_mb` cap (#200)
- **Store-maintenance reminder** — when the on-disk store grows past `store.gc_reminder_mb` (default 2048; 0 disables), session start injects a one-line hint to run `mcp-recall gc`, and `mcp-recall status` shows the store's total size and database count. Detection is a cheap `stat` (no databases opened); nothing is ever deleted automatically (#200)

### Changed

- **An outdated `gh` no longer looks like a tampered manifest.** A `gh` too old to support the flags we verify with — or, older still, with no `attestation` subcommand at all — exits non-zero exactly as a bad signature does; that case is now reported as a skipped verification telling you to upgrade `gh`, instead of a signature failure (which in `error` mode would have hard-failed `profiles install/seed/update`) (#202)

### Fixed

- **Free pages are now reclaimed after automatic deletes** — `evictIfNeeded` and the session-start prune invoke `incremental_vacuum` (previously only manual `recall__forget` did), so routine eviction returns disk to the OS on `auto_vacuum=INCREMENTAL` databases (#200)

### Security

- **Manifest verification now pins the exact signing identity.** Previously the attestation was verified with repo scope only, so an attestation from *any* workflow in the profiles repository was accepted as a valid trust root. Verification now enforces `--cert-identity`, requiring the specific workflow *and* ref that regenerates and attests the manifest. (`--signer-workflow` alone was insufficient: it compiles to a prefix-anchored match that stops short of the `@ref` suffix, so an attestation signed from any branch would still have matched.) (#202)
- **Manifest attestation is signed again.** Between 2026-04-08 and 2026-07-27 the published community manifest carried **no attestation at all**, so `profiles install / seed / update / available` printed `signature verification failed` and then proceeded against an unverified trust root. The signing workflow ran on the human commit and attested the manifest *before* a bot regenerated it — and pushes made with the default `GITHUB_TOKEN` cannot trigger workflows, so the regenerated file was never signed. Fixed in the profiles repository by attesting inside the job that regenerates and commits the manifest ([profiles#10](https://github.com/sakebomb/mcp-recall-profiles/pull/10)). No client upgrade is needed for this part — verification of the live manifest works again on 1.9.0 too. Per-profile SHA256 checks were unaffected throughout, but they validate *against* the manifest, which was the unverified root.

---

## [1.9.0] — 2026-07-23

### Added

- **Retrieval hints in the recall header** — each compressed result's header now ends with a few salient `search:` terms extracted from the stored content, so Claude's first `recall__search` lands instead of guessing keywords. Deterministic, no LLM (#193)
- **Graduated retrieval** — `recall__retrieve` gains a `mode` parameter (`summary` | `peek` | `full`). `peek` returns a bounded context window (top matching chunks, or head chunks without a query) — a middle tier between the search index and full content. Backward-compatible: with no `mode`, a query still defaults to a focused excerpt (#194)
- **Content-hash output dedup** — a `sha256(content)` (`output_hash`) is stored and checked alongside the input hash, so identical output from a different call — or a call with no `tool_input` to hash — reuses the stored item instead of duplicating (#196)
- **`store.eviction_half_life_days`** config option (default 7) controlling decay-based eviction (#195)
- **`recall__suggest` tool** — surfaces pin candidates (frequently accessed) and stale items (never accessed) with actionable commands (#174)
- **HTTP/SSE transport support** in `mcp-recall learn` (#175)
- **`mcp-recall import` command** — restore from a `recall__export` dump; flags `--overwrite`, `--keep-project-key`, `--dry-run` (#176)
- **Claude Code GitHub Action** (keyless WIF auth) for automated PR review (#180)

### Changed

- **Eviction is now recency-weighted (decay)** instead of pure LFU: items are scored by `(access_count + 1)` decayed on an exponential half-life over time since last access, so a steadily-used recent item outranks one hit many times long ago. Pinned items remain exempt (#195)
- **Structure-aware fallback compression** — the generic (last-resort) handler now summarizes long multi-line output as head + tail lines with error/warn lines surfaced from the elided middle, and long single-block output as a head + tail window, instead of a blind first-500-chars truncation. Deterministic, no LLM. Small error-dense logs pass through in full (#198, closes #187)
- **Compact generic-JSON summaries** — the JSON fallback emits its truncated summary without pretty-print indentation (smaller payload, still fully readable; keys kept verbatim) (#196)
- **README repositioned** around mcp-recall's MCP-specific niche, with accurate framing against Claude's native context tooling (Claude Code microcompaction; API context editing, compaction, memory tool) (#192)
- `src/db/index.ts` (899 lines) split into five focused modules (`types`, `schema`, `chunking`, `queries`, `analytics`); barrel re-export, callers unchanged (#170)
- `src/profiles/commands.ts` (901 lines) split into `shared` / `cmd-local` / `cmd-catalog` / `cmd-test` with a thin dispatcher; callers unchanged
- `src/handlers/bash.ts` (699 lines) split into focused per-tool modules (#177, #179)
- Replaced magic numbers and weak error types across the codebase (#178)
- `CLAUDE.md` updated to reflect current architecture (`log.ts`, `format.ts`, `tools.ts`, `install/`, `learn/`, `profiles/`) and CLI commands
- CI pins Bun to 1.3.14 for reproducibility (#181)

### Docs

- Design specs recorded for the deferred/decided roadmap items: #187 (shipped as the fallback change above), #188 (Anthropic memory-tool backend — deferred), #189 (hybrid FTS + embeddings — deferred) (#197)

---

## [1.8.0] — 2026-04-08

### Added

- Bash handler: `gh` CLI routing — list output compressed to count + first 10 rows, check output to pass/fail summary, view output to key-value metadata (#143)
- Bash handler: JSON stdout detection — any command whose stdout is valid JSON is routed through the JSON handler instead of the generic shell cap (#143)
- Six new secret detection patterns: GCP service account key, Azure storage connection string, Stripe secret/restricted key, SendGrid API key, Twilio Account SID, npm publish token (#158)
- `src/log.ts` — unified `log.info/warn/error/debug` interface writing to stderr with consistent `[mcp-recall] level:` prefix; `log.debug` is gated on `RECALL_DEBUG=1` (#159)
- Concurrent DB access tests covering two-writer data integrity, reader-during-delete non-blocking, and busy timeout behaviour (#162)
- Stress tests for 1,000 item eviction, 2 MB payload chunking, 500-item dedup, and near-zero size cap — gated behind `RECALL_STRESS=1` (#163)

### Changed

- Handler dispatch refactored from a 13-branch `if/else` chain to a `HANDLER_REGISTRY` array — adding a new handler is now a single entry, priority is explicit via array order (#161)
- `PRAGMA busy_timeout=5000` added to `getDb()` — writers now retry for up to 5 s under lock contention instead of failing immediately with `SQLITE_BUSY` (#162)

### Fixed

- Guard hook handlers against malformed or empty JSON input — hooks that receive bad JSON now fail open (empty `{}` response) rather than crashing (#156)
- Hardened error handling in DB migrations, VACUUM, install, and MCP server exit — stale lock files cleaned up on exit (#157)
- Diagnostic log format standardised across all call sites — replaced ad-hoc `process.stderr.write('[recall] ...')` calls with `log.*` (#159)
- `PRAGMA auto_vacuum=INCREMENTAL` set at DB open; bulk deletes now call `PRAGMA incremental_vacuum` instead of blocking `VACUUM` (#160)

---

## [1.7.0] — 2026-03-13

### Fixed

- Renamed `saveToCommunitDir` → `saveToCommunityDir` (typo)
- Corrected community profile path in `docs/profile-schema.md` (`<id>.toml` → `<id>/default.toml`) (#135)

### Added

- `mcp-recall install` now writes a `<!-- BEGIN mcp-recall -->` instruction block to `~/.claude/CLAUDE.md` so Claude knows to call `recall__context()`, `recall__retrieve()`, `recall__search()`, `recall__note()`, and `recall__pin()` appropriately (#136)
- `mcp-recall uninstall` removes the CLAUDE.md block cleanly (#136)
- `mcp-recall status` shows a `~/.claude/CLAUDE.md` row and includes it in the fully-installed check (#136)
- New `docs/quickstart.md` — 2-minute getting-started guide with manual CLAUDE.md snippet for marketplace installs (#136)
- `README.md`: `mcp-recall status` output example; new Updating section; `[profiles] verify_signature` config block; `recall__` prefix convention explained; quickstart link (#135, #136, #137)
- `docs/profile-schema.md`: `description` as required field; numeric ceiling limits; Manifest signature verification section for `profiles.verify_signature` and `--skip-verify` (#135)
- `docs/profiles-quickstart.md`: `--skip-verify` examples (#135)
- `docs/troubleshooting.md`: new entry for stale binary path after upgrade (#135)

---

## [1.6.0] — 2026-03-12

### Added

- Five new Bash tool handlers: git status, package install (npm/bun/yarn/pnpm/pip), test runners (pytest, jest, bun test, vitest, go test), docker ps, and build tools (make/just) — compressed output instead of raw terminal walls (#119)
- `profiles info <name>` — full metadata for any profile: version, description, mcp_pattern, author, mcp_url, source tier, file path; manifest-first with local fallback for offline use (#122)
- `profiles available` — lists community catalog with install status and optional `--verbose` for mcp_url (#122)
- Friendly short names throughout: `profiles list`, `profiles install`, `profiles remove` all accept short names (e.g. `grafana` instead of `mcp__grafana`); TTY-aware picker on ambiguous match (#122)
- `--help` and `--version` flags, `completions` subcommand, `profiles list --machine-readable` (#123)
- `--all` flag for `profiles seed` (#125)
- Profile seeding discoverability improvements (#126)
- `recall__context` output now includes generated-at timestamp (#128)

---

## [1.5.1] — 2026-03-10

### Security

- Profile install now validates `id` and `file` fields from manifest against strict patterns — prevents path traversal and URL injection (#111)
- `profiles test` now checks denylist before processing — denylist-protected tools can no longer be passed to `getHandler` (#111)
- TOML strategy numeric fields (`max_depth`, `max_items`, `max_array_items`, `max_chars`, `max_chars_per_field`, `fallback_chars`) now enforce upper bounds at load time — prevents stack overflow or heap exhaustion via crafted profiles (#111)
- Terminal output in `profiles list` now strips ANSI escape sequences and control characters — prevents escape injection via malicious profile metadata (#111)
- Downloaded profile content verified against SHA256 hashes in manifest before writing to disk (#111)

### Fixed

- AWS secret regex used PCRE `(?i:...)` syntax that silently never matched in JavaScript — now uses `/i` flag (#103)
- MCP server tool handlers now catch errors and return text instead of crashing (#103)
- FTS5 queries sanitized to prevent syntax errors from user input (#103)
- `PRAGMA optimize` moved from DB open (no-op) to close (#103)
- MCP server version synced with package.json (was hardcoded 1.0.0) (#103)

### Changed

- README: new tagline — "Your context window is finite. MCP tool outputs aren't. mcp-recall bridges the gap." (#110)
- README: new "The full context stack" section positions mcp-recall in the broader MCP ecosystem (#110)
- README: simplified *How it works* diagram — 4-node overview with detailed pipeline in collapsible section (#110)
- Denylist regex patterns cached — eliminated ~17 compilations per hook call (#103)
- `getProjectKey` result cached — eliminated `spawnSync` per hook call (#103)
- Store + chunk inserts wrapped in a transaction for atomicity and write perf (#103)
- Deduplicated `formatBytes` into shared `src/format.ts` (#103)
- Secret scan consolidated from two passes to one (#103)

---

## [1.5.0] — 2026-03-03

### `mcp-recall install` / `uninstall` / `status`

Removes the biggest install friction — no more manually editing `~/.claude.json` and `~/.claude/settings.json`.

```bash
mcp-recall install [--dry-run]   # write MCP server + hooks, idempotent
mcp-recall uninstall             # remove all entries, leave other hooks intact
mcp-recall status                # verify config entries + build artifacts exist
```

Writes are atomic (temp file → rename). Existing hooks from other tools are never touched. Re-running after a `bun run build` updates stale paths in place.

### Stripe compression handler

New TypeScript handler for all `mcp__stripe__*` tools. Formats amounts correctly — Stripe stores values in the smallest currency unit (`250000` = **$2,500.00**, not `250000`). Zero-decimal currencies (JPY, KRW, etc.) handled separately.

Per-tool routing: customers, invoices, payment intents, subscriptions, products, prices, disputes, payment links, balance, account info. Mixed `search_stripe_resources` results routed per item by `object` field. Handles both Stripe list responses (`{ object: "list", data: [...] }`) and single-object responses from create/update/cancel tools.

---

## [1.4.0] — 2026-03-03

### Three new TypeScript compression handlers

**GitLab** (`mcp__gitlab__*`) — mirrors the GitHub handler with GitLab field names: `iid` (internal ID), `title`, `state`, `description` excerpt (200 chars), `labels` (plain string array), `web_url`. Single items and arrays (first 10 + overflow count).

**Database query results** (tool name contains `postgres`, `mysql`, `sqlite`, or `database`) — handles three common response shapes: node-postgres `{rows, fields}`, bare array of row objects, and `{results}` wrapper. Emits row/column count header, column names, and first 10 rows as `col=value` pairs.

**Sentry error events** (tool name contains `sentry`) — extracts exception type + message, level, environment, release, and abbreviated event ID. Shows the last 8 stack frames (innermost/most relevant). Drops breadcrumbs, SDK metadata, and full request headers — typically reduces 15–50 KB events by 95%+.

---

## [1.3.0] — 2026-03-03

### `mcp-recall profiles test`

New subcommand to apply a profile to real input and inspect the result — completes the contributor loop.

```bash
mcp-recall profiles test mcp__jira__search_issues --stored recall_abc123
mcp-recall profiles test mcp__stripe__list_customers --input fixture.json
```

Shows which profile matched (ID, tier, pattern, file, strategy), input and output sizes, compression percentage, and the full summary as Claude would receive it. Accepts input from a stored item (`--stored <id>`) or a local file (`--input <file>`).

### Password manager denylist hardening

Eight additional password managers added to the built-in denylist: `mcp__bitwarden__*`, `mcp__lastpass__*`, `mcp__dashlane__*`, `mcp__keeper__*`, `mcp__hashicorp_vault__*`, `mcp__vault__*`, `mcp__doppler__*`, `mcp__infisical__*`. These use tool names like `get_item`, `list_logins`, and `vault read` that don't contain `*secret*`/`*credential*` keywords — explicit entries ensure they're always blocked.

---

## [1.2.0] — 2026-03-03

### Hot cache in `recall__context`

The context snapshot injected at session start now includes a **"Hot from last session"** section: the top accessed items from the previous session, ordered by access count. Items already in pinned, notes, or recent are excluded so nothing appears twice. Helps orient Claude toward the output it retrieved most heavily in the previous session.

### Per-tool breakdown in `recall__stats`

`recall__stats` now includes a **"By tool"** table sorted by original size, showing item count, raw → compressed sizes, and reduction percentage for every tool in the store. Makes it easy to see which MCPs are generating the most context pressure.

### `mcp-recall profiles retrain`

New subcommand: scans stored session data and suggests field paths to add to existing `json_extract` profiles, using frequency analysis across real tool outputs.

```bash
mcp-recall profiles retrain            # dry-run — print suggestions
mcp-recall profiles retrain --apply    # append new fields to matching profiles
mcp-recall profiles retrain --depth 4  # scan deeper (default: 3 levels, a.b.c)
mcp-recall profiles retrain jira       # limit to tools matching "jira"
```

Suggestions require ≥3 stored outputs. Fields appearing in ≥50% of outputs are shown with frequency percentages. `--apply` is additive (never removes existing fields) and bumps the patch version automatically.

Per-profile depth override: add `[retrain] max_depth = N` to any profile TOML.

→ [Full retrain guide](docs/retrain.md)

### Community profiles

Three new profiles added to [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles): **Vercel**, **HubSpot**, **Google Calendar**. Total: 9 profiles.

### Stats

431 tests, 0 failures (+35 new tests).

---

## [1.1.0] — 2026-03-03

### TOML profile system

Declarative TOML profiles extend compression to any MCP — no TypeScript required. Three strategies: `json_extract` (extract specific fields), `json_truncate` (depth-limited rendering), `text_truncate` (character cap). Priority chain: user → community → bundled → TypeScript handlers → generic.

User profiles: `~/.config/mcp-recall/profiles/<id>/default.toml`

### `mcp-recall profiles` CLI

Seven subcommands for managing profiles:

```bash
mcp-recall profiles list              # show all installed profiles
mcp-recall profiles seed              # install community profiles for detected MCPs
mcp-recall profiles install <id>      # install a specific community profile
mcp-recall profiles update            # update all installed community profiles
mcp-recall profiles remove <id>       # remove a community profile
mcp-recall profiles feed profile.toml # contribute a profile to the community
mcp-recall profiles check             # detect pattern conflicts
```

### `mcp-recall learn`

Auto-generates TOML profile templates by spawning each MCP server, calling `tools/list`, and inferring field names from tool names and descriptions.

```bash
mcp-recall learn            # generate profiles for all MCPs in ~/.claude.json
mcp-recall learn --dry-run  # preview without writing
mcp-recall learn jira       # generate for a specific server
```

### Bundled Jira profile

`profiles/mcp__jira/default.toml` ships with mcp-recall — Jira compression works with no install step.

### Community profiles repo

Shared profiles at [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles). Launch profiles: Jira (bundled), Confluence, Gmail, AWS, GCP, Figma.

### Stats

396 tests, 0 failures (+51 new tests).

---

## [1.0.0] — 2026-03-02

Initial public release.

### Hook pipeline

- **PostToolUse hook** intercepts all `mcp__*` tool outputs and the native `Bash` tool. Compresses, stores full content in SQLite, and returns a brief summary to Claude. Deduplicates identical calls via `sha256(tool_name + input)` — repeated calls return a `[cached]` header without re-compression.
- **SessionStart hook** records each active day, prunes expired entries, and injects a compact context snapshot before the first message (pinned items, notes, recently accessed items). Capped at 2000 chars with a truncation notice.
- **Denylist** — built-in glob patterns block credential tools (`*secret*`, `*token*`, `*password*`, `*key*`, `*auth*`, `mcp__1password__*`, etc.). Configurable via `denylist.additional` and `denylist.override_defaults`.
- **Secret detection** — 10 patterns (PEM headers, SSH private keys, GitHub PATs, OpenAI, Anthropic, AWS, Bearer tokens). Outputs matching any pattern are skipped and logged.
- **Project key** — stable 16-char SHA256 hash of the git root path; falls back to CWD.
- **Config** — TOML at `~/.config/mcp-recall/config.toml` (Zod-validated); override via `RECALL_CONFIG_PATH`.

### Compression handlers

| Handler | Matches | Strategy |
|---------|---------|----------|
| Bash | native `Bash` tool | CLI-aware: git diff → file-level stats; git log → 20-commit cap; terraform plan → resource actions; fallback → shell |
| Playwright | `playwright` + `snapshot` in tool name | Interactive elements, visible text, headings. Drops aria noise. |
| GitHub | `mcp__github__*` | Number, title, state, body (200 chars), labels, URL. First 10 + overflow. |
| Shell | `bash`, `shell`, `terminal`, `run_command`, `ssh_exec`, `exec_command`, `remote_exec`, `container_exec` | ANSI + SSH noise stripping. Structured JSON support. 50-line stdout cap, 20-line stderr cap. |
| Linear | `linear` in tool name | Identifier, title, state, priority, description (200 chars), URL. |
| Slack | `slack` in tool name | Channel, timestamp, user, message text (200 chars). First 10 + overflow. |
| Tavily | `tavily` in tool name | Query, synthesized answer, per-result title/URL/150-char snippet. Drops raw_content/score. First 10 + overflow. |
| Filesystem | `mcp__filesystem__*` or `read_file`/`get_file` | Line count + first 50 lines. |
| CSV | `csv` in tool name or content-based | Headers + first 5 data rows + row/col count. |
| Generic JSON | Unmatched JSON output | Depth-3 limit, arrays capped at 3 items. |
| Generic text | Everything else | First 500 chars. |

### MCP server tools

Ten `recall__*` tools available in every Claude session:

- **`recall__retrieve`** — fetch stored content by ID; pass `query` for an FTS excerpt focused on the relevant section
- **`recall__search`** — FTS search (BM25) across all stored outputs; each result includes a content snippet
- **`recall__forget`** — delete by id / tool / session / age / all; `force: true` overrides pin protection
- **`recall__list_stored`** — paginated browse; sortable by recent, accessed count, or size
- **`recall__stats`** — aggregate efficiency report with pin suggestions and stale item alerts
- **`recall__pin`** — pin/unpin items; pinned items are exempt from expiry and LFU eviction
- **`recall__note`** — store arbitrary text as project memory; searchable like any stored item
- **`recall__export`** — JSON dump of all stored items, oldest-first
- **`recall__session_summary`** — per-session digest: tool breakdown, top accessed, pinned items, notes
- **`recall__context`** — session orientation: pinned items, notes, recently accessed, last session headline

### Storage

- SQLite + FTS5 at `~/.local/share/mcp-recall/<project-key>.db`
- FTS chunking — content split into overlapping 512-char chunks for precise snippet retrieval on long documents
- Access tracking — `access_count` and `last_accessed` per item; LFU eviction when store exceeds `max_size_mb`
- Session-day expiry — counts active Claude Code days, not calendar days; vacations don't drain your stored context

---

[Unreleased]: https://github.com/sakebomb/mcp-recall/compare/v1.11.0...HEAD
[1.11.0]: https://github.com/sakebomb/mcp-recall/compare/v1.10.1...v1.11.0
[1.10.1]: https://github.com/sakebomb/mcp-recall/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/sakebomb/mcp-recall/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/sakebomb/mcp-recall/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/sakebomb/mcp-recall/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/sakebomb/mcp-recall/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/sakebomb/mcp-recall/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/sakebomb/mcp-recall/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/sakebomb/mcp-recall/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/sakebomb/mcp-recall/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/sakebomb/mcp-recall/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/sakebomb/mcp-recall/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/sakebomb/mcp-recall/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sakebomb/mcp-recall/releases/tag/v1.0.0
