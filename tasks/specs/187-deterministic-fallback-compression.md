# Spec: Deterministic fallback compression (#187)

> Status: **APPROVED — build next (2026-07-23).** Deterministic-only, no LLM/network.
> Fixed sensible window sizes (config deferred per YAGNI); scoped to the
> auto-intercept fallback path. Keeps the zero-dependency, local-first guarantee.

## What

Improve the summary quality for tool outputs that match **no** dedicated handler
or profile and currently fall through to the generic `text`/`json` handlers,
which essentially head-truncate. Replace naive truncation with a structure-aware
deterministic summarizer.

## Why

The 15 handlers cover known tools well, but the long tail of unrecognized MCP
outputs gets a low-value summary (first N chars). Better fallback summaries mean
Claude retrieves less often and orients faster — the same goal as the dedicated
handlers, extended to the tools we don't have a profile for yet. Doing this
deterministically preserves the product's core "local, no API" invariant (the
reason we rejected the opt-in-LLM alternative).

## Success criteria

- Unrecognized outputs get a summary that surfaces structure (shape, key lines,
  head+tail, counts) rather than a blind prefix.
- Zero new runtime dependencies; no network; fully deterministic (same input →
  same summary), so it's unit-testable.
- Never larger than the current fallback; measurable byte reduction on a sample
  corpus of real unrecognized outputs.
- Existing handler dispatch and all current tests unchanged.

## Approach (proposed)

A `fallbackSummarize(content)` that classifies the payload cheaply and applies a
matching strategy:

1. **Log / line-oriented** (many newlines): keep first K + last K lines, plus any
   lines matching `error|warn|fail|exception` (capped), with an elided-count note.
2. **Tabular / delimited** (consistent delimiters per line): header row + row
   count + first few rows (defer to CSV handler heuristics where they already exist).
3. **Deeply-nested JSON not caught upstream**: reuse the existing depth/array
   truncation (already compact after #191).
4. **Prose / unknown**: head + tail window with a middle-elision marker, instead
   of head-only.

Selection is a small ordered set of predicates; each strategy is a pure function
with its own tests. Wire in as the `text` handler's replacement (or a pre-step
before it) so dispatch order is unchanged.

## Risks / trade-offs

- Heuristic misclassification → a suboptimal (never incorrect) summary; mitigated
  by always falling back to head+tail.
- Scope creep toward re-implementing every handler; kept in check by only
  handling the genuinely-unrecognized path.

## Open questions for sign-off

1. Head/tail window sizes and error-line cap — pick defaults or make them config?
2. Should this also feed the `recall__note`/manual paths, or strictly the
   auto-intercept fallback?
3. Is a sample corpus of "unrecognized" outputs available to benchmark against,
   or should I synthesize one?
