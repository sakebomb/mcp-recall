# todo

Active work and upcoming tasks.

## In Progress

_nothing in progress_

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
