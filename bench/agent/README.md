# Paired task-success benchmark

Runs the same headless Claude Code agent on SWE-bench Verified tasks twice per
task, once with mcp-recall installed and once without, and grades both patches
with the official SWE-bench harness. Tracks #414.

## How a run is isolated

Every (task, model, arm) gets a fresh container from the task's prebuilt
SWE-bench image. The host's `claude` binary and the release `mcp-recall` binary
are mounted read-only, so both arms run the same versions. The `recall` arm runs
`mcp-recall install` inside its container before the agent starts; the `plain`
arm does not. Nothing from the host's own `~/.claude` reaches either arm.

## Setup

```bash
cd bench/agent
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python swebench==5.0.2
mkdir -p bin && gh release download v1.19.0 -p mcp-recall-linux-x64 -p SHA256SUMS -D bin
(cd bin && grep linux-x64 SHA256SUMS | sha256sum -c - && chmod +x mcp-recall-linux-x64)
```

Model access comes from `~/.config/mcp-recall-bench/litellm.env`
(`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`), passed to the container with
`--env-file`. The token is never printed.

## Run

```bash
.venv/bin/python bench.py run --tasks tasks-smoke.txt \
  --models claude-haiku-5-5 claude-sonnet-5-5 claude-opus-5-5 --run-id smoke1 --cap 40
.venv/bin/python bench.py grade  --run-id smoke1
.venv/bin/python bench.py report --run-id smoke1
```

`run` is resumable: a (task, model, arm) that already has a result is skipped.
`--cap` stops before starting the next model once the key's recorded spend
reaches it; each agent run is also capped by `--max-budget-usd` (`RUN_BUDGET`).

Output lands in `runs/<run-id>/` (gitignored):

| Path | What it records |
|---|---|
| `manifest.json` | One entry per `run` invocation: argv, prompt template, budgets, cap, dataset fingerprint, image digests, Claude Code and mcp-recall versions and SHA-256, harness commit, key spend before and after |
| `run.log` | Every run's outcome line, timestamped |
| `<model>/<arm>/<task>.json` | The run record: start and end time, image id, exit code, Claude's final `result` event (cost, usage, turns), what mcp-recall stored |
| `<model>/<arm>/<task>.patch`, `.prompt.txt` | The patch that was graded and the exact prompt |
| `<task>.evidence/stream.jsonl` | Every event of the session, tool results included: in the `recall` arm, the summaries Claude actually received |
| `<task>.evidence/claude-home/`, `claude.json` | Claude Code's own transcript and config inside the container, showing which hooks and MCP servers the arm had |
| `<task>.evidence/recall-store/` | A consistent snapshot of every mcp-recall store, full stored content included |
| `logs/run_evaluation/` | The SWE-bench harness's per-instance grading logs and `report.json` |
| `SHA256SUMS` | Written by `bench.py seal`, which first refuses if the API token appears in any file |
