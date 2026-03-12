# todo

Active work and upcoming tasks.

## In Progress

### #122 — Friendly profile names, deconfliction, and rich metadata

Two PRs: **PR A** (core — this repo) + **PR B** (community profiles repo).

#### PR A — `mcp-recall` core (`feat/profile-friendly-names`)

**Schema changes**
- [ ] 1. Add `short_name`, `mcp_url`, `author`, `version` to `[profile]` TOML schema (Zod) — all optional; `short_name` defaults to `id.replace(/^mcp__/, "")`
- [ ] 2. Update `manifest.json` entry type in `src/profiles/loader.ts` to include new fields
- [ ] 3. Add `getShortName(profile)` helper — returns `short_name ?? id.replace(/^mcp__/, "")`

**CLI: short name resolution**
- [ ] 4. Add `resolveProfileId(nameOrId, profiles)` — exact id match wins; then short_name match; collision → TTY picker or non-TTY error list
- [ ] 5. Wire resolution into `cmdInstall`, `cmdRemove` (any command that takes a profile id arg)

**New: `profiles info <name>`**
- [ ] 6. Implement `cmdInfo(args)` — shows full metadata for one profile (installed or from manifest)
- [ ] 7. Add dispatcher entry in CLI

**New: `profiles available`**
- [ ] 8. Implement `cmdAvailable(args)` — fetches community manifest, tabulates with install status markers
- [ ] 9. Add `--verbose` flag (show URLs)
- [ ] 10. Add dispatcher entry in CLI

**`profiles list` update**
- [ ] 11. Rework output to use `short_name` as ID column, add `Description` column

**Tests**
- [ ] 12. `resolveProfileId` — exact match, short-name match, collision non-TTY error, no-match error
- [ ] 13. `cmdInfo` — installed profile, available-only profile, unknown name
- [ ] 14. `cmdAvailable` — catalog output, installed status markers, `--verbose` URLs
- [ ] 15. `profiles list` — short names, description column

#### PR B — `mcp-recall-profiles` community repo

- [ ] 16. Add `short_name`, `mcp_url`, `author`, `version` to all 18 profile TOMLs
- [ ] 17. Add same fields to `manifest.json` entries
- [ ] 18. Update `validate.ts` to enforce unique `short_name` values across the manifest

## Up Next

_nothing scheduled — see backlog below_

---

## Security: Manifest signing (sigstore — Phase 2)

**Recommended approach: GitHub Artifact Attestations**
Uses `actions/attest-build-provenance` — sigstore keyless under the hood, no key management, identity is the GitHub Actions OIDC token. Attestations stored in GitHub's store + Rekor transparency log. Client verifies with `gh attestation verify`.

**Protects against:** CDN poisoning, partial repo compromise, tampered manifests.
**Does not protect against:** Full `sakebomb` account compromise (attacker could trigger a new signed workflow run). Mitigate with pinned action SHAs.

### Tasks

**In `sakebomb/mcp-recall-profiles` (new workflow `sign-manifest.yml`):**
1. Add `permissions: id-token: write, attestations: write` to manifest-regen job
2. Add `actions/attest-build-provenance@v2` step after manifest generation, subject: `manifest.json`
3. Pin all action versions to full commit SHAs
4. Trigger: `workflow_dispatch` + push to `profiles/**` or `manifest.json`

**In `mcp-recall` client (`src/profiles/commands.ts`):**
5. Add `verifyManifest(path)` — shells out to `gh attestation verify <path> --repo sakebomb/mcp-recall-profiles`
6. Add `profiles.verify_signature` config flag: `"warn"` (default) | `"error"` | `"skip"`
   - `"warn"`: continue with warning if `gh` absent or verification fails
   - `"error"`: abort on failure
   - `"skip"`: bypass (air-gapped envs)
7. Add `--skip-verify` flag to `install`, `update`, `seed` subcommands
8. Degrade gracefully if `gh` not in PATH

**Config (`src/config.ts`):**
9. Add `profiles.verify_signature` to Zod schema, default `"warn"`

**Tests:**
10. Mock `Bun.spawnSync` for `verifyManifest` — assert warn/error/skip behavior
11. Test `gh` not found → no throw

**No new npm dependencies** — `gh` CLI already expected.

**Scope: M** (1–3 days)

---

## Open Issues (paused / backlog)

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| Claude Code | Runtime config via `/mcp` | — | On hold |
| OpenCode | `tool.execute.after` output mod | — | On hold, v2.0 |
| Layer 2 | `recall__register_profile` MCP tool | — | On hold, v2.0 — when MCPs self-describe |
