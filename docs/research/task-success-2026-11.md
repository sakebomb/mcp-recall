# Does mcp-recall change whether an agent solves the task?

*A paired task-success pilot on SWE-bench Verified, November 2026. This is a dated record: later
results go in a new report, not into this one. Tracks [#414](https://github.com/sakebomb/mcp-recall/issues/414).*

**DRAFT.** The results sections are filled in from `bench/agent/analyze.py` output only. Nothing
here is published until the maintainer approves it.

## Summary

*(Written last, from the results below.)*

## The question

mcp-recall replaces large tool output with a summary and keeps the full output searchable. Every
earlier measurement of it scored the output: bytes saved, and facts kept against a same-size head cut
([Benchmarks](../benchmarks.md)). None ran an agent. This pilot asks the question those numbers can't
answer: **with mcp-recall installed, does the same agent solve the same tasks as often?**

What the pilot may claim, how it is analyzed, and what counts as a loss were fixed before any run was
graded, in [`tasks/specs/414-task-success-claims.md`](../../tasks/specs/414-task-success-claims.md).
Any deviation from that file is listed under [Deviations](#deviations).

## Setup

| | |
|---|---|
| Agent | Claude Code 2.1.305, headless (`claude -p`), `--dangerously-skip-permissions`, stream-json output |
| Arms | `plain`: no plugin. `recall`: mcp-recall 1.19.0 (release binary, SHA-256 in each run's `manifest.json`), installed with `mcp-recall install` inside the container, default config |
| Models | Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5, via a budget-capped API key |
| Tasks | SWE-bench Verified: the 45 tasks rated "1-4 hours" or ">4 hours" (hard set), and 10 of them again with a prompt that requires running each changed module's full test file (large-output set) |
| Isolation | One fresh container per run, from the task's prebuilt SWE-bench image; the two arms differ only in whether `mcp-recall install` ran |
| Grading | The official SWE-bench harness (`swebench` 5.0.2), on the patch taken against the image's HEAD |
| Limits per run | `--max-budget-usd` 1 (Haiku), 3 (Sonnet), 6 (Opus); 3,600 s timeout |

Both arms get the same prompt, which asks the agent to fix the issue by editing non-test source files.
The large-output prompt adds one sentence: run the complete test file for every changed module and read
the output. It exists because a smoke round on medium tasks showed mcp-recall almost never engaged:
across 12 recall-arm runs it stored one output.

## Evidence

Every run keeps its complete event stream (each tool result exactly as the agent received it), Claude
Code's own transcript and config from inside the container, a snapshot of the mcp-recall store, the
graded patch, the exact prompt, and the SWE-bench grading log. Each `run` invocation appends a manifest
entry pinning the harness commit, binary hashes, image digests and the dataset fingerprint. After
grading, `bench.py seal` checks that the API key appears in no file and writes `SHA256SUMS`.

The archive is the Hugging Face dataset `sakebomb/mcp-recall-task-success`. Layout and verification:
[`bench/agent/README.md`](../../bench/agent/README.md).

## Analysis

As fixed in the spec: per model, the recall arm's solve rate minus the plain arm's on the hard set, an
exact two-sided McNemar test on discordant pairs, and a paired bootstrap 95% interval (10,000 resamples
over tasks, seed 414). The large-output set is secondary. A pair is dropped only for an infrastructure
failure (no result event and no patch). The code is `bench/agent/analyze.py`, with its checks in
`check_analyze.py`.

**Power.** With 45 pairs per model, the pilot reliably detects only a difference of about 20-25 points
(simulated in the spec). A smaller effect in either direction can exist and not show.

## Results

*(From `analyze.py --run-id pilot-hard` and `--run-id pilot-heavy`.)*

### Solve rate

### How often mcp-recall engaged

### Cost, tokens, turns and time

### Worked examples

*(Discordant tasks, read from their event streams.)*

## Limits

- **One pilot, one task source.** SWE-bench Verified Python repositories, 22 of the 45 tasks from Django. Not other
  languages, not long multi-task sessions, not MCP-heavy work such as browser automation.
- **One agent and one version of each component.** Claude Code 2.1.305 and mcp-recall 1.19.0.
- **Power** as above: a null result here is not proof of no effect.
- **One run per task per arm.** The smoke round showed large run-to-run variance with the plugin inert,
  which is noise both arms share but which widens every interval.
- **Engagement is observed, not assigned.** The engaged-subset numbers are exploratory: whether
  mcp-recall engages depends on what the agent did in that run.

## Deviations

- The analysis code was committed 47 seconds after grading began; both files were final before it.
  Details in the spec.

*(Any further deviation from the spec is listed here.)*
