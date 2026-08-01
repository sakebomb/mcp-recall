# Roadmap

What mcp-recall is aiming at, what it is deliberately *not* becoming, and where the
two open long-horizon ideas sit. This is a statement of **direction**, not a
dated plan — a solo open-source project makes no delivery promises. For detailed
per-phase status, see the phase table in [CLAUDE.md](CLAUDE.md); for the shape of
the system, [docs/architecture.md](docs/architecture.md).

## The bet

mcp-recall occupies one specific gap: **layer ③ of the context stack** (see the
[README](README.md#the-full-context-stack)). Claude Code's native microcompaction
offloads *built-in* tool output, but **MCP** tool output is truncated at a
25k-token ceiling and discarded. mcp-recall intercepts MCP (and Bash) output
*before* it reaches the window, stores the full payload locally, and keeps it
retrievable by full-text search across sessions.

Everything below is judged against that bet. A change that sharpens the
MCP-output-capture-and-retrieval story is in scope; a change that turns the
project into a different kind of tool is not — however useful that other tool
might be.

## Directions (themes, not commitments)

These are the areas active work tends to land in. No dates, no ordering promises —
they describe *where* effort goes when it goes somewhere.

- **Retrieval quality** — making Claude's first recall land on the right content:
  better summary hints, graduated/peek retrieval, structure-aware fallbacks. The
  store is only as good as the odds a single query finds what's needed.
- **Robustness & store lifecycle** — the store must be safe to leave running for
  months: correct eviction, disk reclamation (`gc`), dedup, and no silent
  data-loss edges. Correctness of the delete path outranks any feature.
- **Contributor experience & docs accuracy** — handlers and profiles should be
  cheap to add and the docs should never overstate what the code does. Phase 13
  exists entirely for this.
- **Profile ecosystem** — the community-profile tier is how coverage scales
  without a TypeScript change per MCP; lowering the cost of contributing and
  trusting a profile stays a throughline.

## On the horizon (deferred, not committed)

Two filed ideas are genuine extensions of the bet but are not being built now.
They are deferred, not rejected — if they ship, they ship as described here.

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
   verbatim retrieval and secret-safe storage tractable.
2. **Won't intercept the built-in `Read` / `Grep` / `Glob` tools.** Claude Code's
   `PostToolUse` output-replacement only supports MCP tools and `Bash`; the other
   built-ins can't be intercepted, and native microcompaction already offloads
   them. Scope is MCP + Bash, by platform and by design — mcp-recall does not try
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
changed. Everything else — new handlers, profiles, retrieval and lifecycle
improvements — is welcome without ceremony; see
[CONTRIBUTING.md](CONTRIBUTING.md).
