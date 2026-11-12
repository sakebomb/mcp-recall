# Roadmap

What mcp-recall is aiming at, what it is deliberately *not* becoming, and where the
two long-horizon ideas sit. This is a statement of **direction**, not a
dated plan — a solo open-source project makes no delivery promises. For detailed
per-phase status, see the phase table in [CLAUDE.md](CLAUDE.md); for the shape of
the system, [docs/architecture.md](docs/architecture.md).

## Status: maintenance mode (since 2026-11-04)

mcp-recall is maintained, not extended. Releases keep shipping on the weekly
train ([CONTRIBUTING.md](CONTRIBUTING.md#releases)) with bug, security,
compatibility and install fixes, and with handler fixes where a summary drops
what Claude needs. New features are not planned.

One exception, opened deliberately in
[#458](https://github.com/sakebomb/mcp-recall/issues/458): running under coding
agents other than Claude Code. The same hook pipeline serves each agent through
a thin adapter that translates shapes and adds no logic: pi, grok and OpenCode so
far. An agent qualifies only if it can rewrite a tool's output before the model
sees it; [#473](https://github.com/sakebomb/mcp-recall/issues/473) records which
others do, and the README's [Where it runs](README.md#where-it-runs) table gives
each agent's status. An agent whose documented hooks qualify but that no
maintainer can test, such as Copilot CLI, is built on request.

The decision follows the paired task-success studies in
[#414](https://github.com/sakebomb/mcp-recall/issues/414), with an exit rule
agreed before they ran. Where sessions were long enough to compact, mcp-recall
made them compact less often, and on Haiku it made them cheaper. No study found a
change in solved tasks that could be told apart from chance, in either
direction: the one harm signal, in the first pilot, did not recur. Agents almost never
called a `recall__*` tool to fetch stored output. The summaries do the work; the
retrieval side has not shown that it earns more investment.

## The bet

mcp-recall occupies one specific gap: **layer ③ of the context stack** (see the
[README](README.md#how-it-compares)). Claude Code delivers an **MCP** result
below its limit (25,000 tokens or 50,000 characters) into the window whole. A
larger one is saved to a file that Claude must read in chunks. Neither is
searchable in a later session. mcp-recall intercepts MCP (and Bash) output
*before* it reaches the window. It delivers a summary instead, stores the full
payload locally, and keeps it retrievable by full-text search across sessions.

Everything below is judged against that bet. A change that sharpens the
MCP-output-capture-and-retrieval story is in scope; a change that turns the
project into a different kind of tool is not — however useful that other tool
might be.

## What maintenance covers

Work still lands in these areas; anything outside them is a feature, and is not
planned.

- **Robustness & store lifecycle** — the store must be safe to leave running for
  months: correct eviction, disk reclamation (`gc`), dedup, and no silent
  data-loss edges. Correctness of the delete path outranks everything else.
- **Summary quality** — a summary is judged on what Claude can still act on, not
  on bytes saved. A handler that keeps less of what Claude went on to use than a
  same-size cut of the raw output (`bun run fidelity`, `bun run quality`,
  [docs/benchmarks.md](docs/benchmarks.md)) is a bug to fix, not a feature to add.
- **Compatibility** — keeping up with Claude Code's hook and tool-output formats,
  Bun, and the MCP servers whose output the handlers parse.
- **Docs accuracy** — the docs should never overstate what the code does.
- **Profiles** — community profiles are data in their own repository, so new and
  corrected profiles stay welcome.

## On the horizon (not planned)

Two filed ideas are genuine extensions of the bet. Neither is being built while
the project is in maintenance mode; if one ever ships, it ships as described here.

- **Anthropic memory-tool backend** ([#188](https://github.com/sakebomb/mcp-recall/issues/188))
  — expose mcp-recall's verbatim + FTS store as a backend behind the API memory
  tool. A natural fit: the memory tool is a model-managed *summary* scratchpad with
  no verbatim retrieval, which is exactly what mcp-recall already provides. Deferred
  on effort, not on scope.
- **Optional local hybrid FTS + embeddings**
  ([#189](https://github.com/sakebomb/mcp-recall/issues/189)) — semantic recall
  alongside the deterministic FTS index. **Opt-in only, never a default
  requirement** — the default retrieval path stays zero-heavy-dependency (see
  non-goal 4). If it lands, it is a flag, not a baseline.

## Non-goals

The boundaries that keep the project focused. Each is a door deliberately left
closed; reopening one is a direction change, not a feature request.

1. **Not conversational or semantic memory.** mcp-recall stores *raw tool outputs*
   verbatim — it does not distill a model of the conversation, build a knowledge
   graph, or summarize what happened. That is a different product (mem0, Letta,
   Zep, and similar occupy it). Keeping to raw-output capture is what makes
   verbatim retrieval and secret-safe storage tractable. `recall__note`,
   `recall__pin` and `recall__context` stay as they are: small per-project
   markers beside the stored output, not a memory layer. Long-term memory
   belongs in a dedicated memory tool, and these will not grow toward one.
2. **Won't intercept the built-in `Read` / `Grep` / `Glob` tools.** Claude Code's
   `PostToolUse` output-replacement only supports MCP tools and `Bash`; the other
   built-ins can't be intercepted, and Claude Code already manages their output
   natively. Scope is MCP + Bash, by platform and by design — mcp-recall does not try
   to beat the native path for built-ins.
3. **No cloud, hosted service, telemetry, or accounts.** Local-first, per-project
   SQLite, no server to run and no phone-home. There is no plan for a sync backend
   or a hosted tier; your stored output stays on your disk.
4. **The default retrieval path stays zero-heavy-dependency.** Deterministic
   SQLite FTS5, no required embeddings model or ML runtime to install or run. Any
   semantic-search support (see #189) is opt-in and additive — it never becomes a
   precondition for using mcp-recall.

## Proposing a change of direction

A non-goal is not permanent, but changing one is a deliberate decision, not a
drive-by PR. Open an issue that names the non-goal and argues why the bet has
changed. The same goes for leaving maintenance mode: bring evidence the studies
in #414 did not have. Fixes inside what maintenance covers are welcome without
ceremony; see [CONTRIBUTING.md](CONTRIBUTING.md).
