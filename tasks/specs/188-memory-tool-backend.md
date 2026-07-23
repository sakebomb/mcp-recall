# Spec: Anthropic memory-tool backend (#188)

> Status: **DRAFT — awaiting sign-off.** No code until approved.
> Larger scope (L). This is an expansion of the addressable surface, not a fix.

## What

Expose mcp-recall's SQLite+FTS store as a backend for Anthropic's
**`memory_20250818`** tool, so any memory-tool-aware client (not just Claude Code
via hooks) can persist and retrieve through recall.

## Why

Today mcp-recall reaches users only through the Claude Code PostToolUse hook. The
memory tool is a GA, client-agnostic interface where the developer supplies the
storage backend (`view`/`create`/`str_replace`/`insert`/`delete`/`rename` over a
`/memories` namespace). Implementing that interface on top of the recall store
makes mcp-recall usable as an FTS-backed memory layer from the Messages API,
other agent runtimes, etc. — positioning it as the MCP-output layer that sits
*ahead of* native compaction rather than a Claude-Code-only plugin.

## Success criteria

- A documented adapter that satisfies the `memory_20250818` command surface
  against the recall SQLite store.
- A non-Claude-Code client (e.g. a Messages API script) can create, read, edit,
  and delete memory entries that persist across sessions via recall.
- The existing hook-based pipeline is untouched and unaffected.
- Local-first / zero-hosted-dependency posture preserved.

## Approach (proposed, to be validated against the current tool contract)

1. **Confirm the live contract first** (per repo policy: verify the SDK/tool
   surface before coding). Pull the current `memory_20250818` command set and
   payload shapes from platform docs; do not assume from memory.
2. **Map the file model to the store.** The memory tool is path-oriented
   (`/memories/<path>`); recall is id + FTS + project-scoped. Proposed mapping:
   treat a memory path as a stable key (its own column or reuse `input_hash`
   semantics), content as `full_content`, and surface `view` over a directory as
   a listing. `str_replace`/`insert` edit `full_content` and re-chunk/re-index.
3. **New entrypoint**, not a change to `server.ts`'s recall__ tools — a separate
   adapter module + a thin CLI/exported handler so it composes without touching
   the hook path.
4. **Reuse** storeOutput/retrieve/search/forget; add only the path↔id mapping.

## Risks / trade-offs

- Impedance mismatch: the tool's mutable-file model vs recall's
  append-and-retrieve model. Editing (`str_replace`) implies in-place mutation +
  re-chunk + FTS refresh — more than the current write-once flow.
- Contract drift: the tool is newer; the spec must be re-validated against live
  docs at implementation time.
- Scope: risk of half-implementing the surface. Define the minimal viable command
  subset first (view/create/delete), defer edit ops if needed.

## Open questions for sign-off

1. Is broadening beyond the Claude Code plugin niche a direction you want now, or
   park this until the in-plugin features settle?
2. Minimum viable command subset for a first cut (view/create/delete only)?
3. Path↔id mapping: new `mem_path` column vs a dedicated table — preference?
