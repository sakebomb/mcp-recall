# Spec: What the task-success pilot may claim (#414)

> Status: **APPROVED (2026-11-01), committed before any pilot run was graded.**
> The pilot had started: progress lines (cost, turns, patch size) were visible,
> but no patch had been graded and no solve outcome had been read. This file
> fixes the claims, the analysis and the loss rule before those outcomes exist.
> Changing any of it afterwards must be stated in the report as a deviation.

## What

A paired comparison: the same Claude Code agent (2.1.305) on the same SWE-bench
Verified tasks, once with mcp-recall 1.19.0 installed and once without, on three
models (Haiku 5.5, Sonnet 5.5, Opus 5.5). Harness and evidence layout:
`bench/agent/README.md`.

- **Hard set** (primary): the 45 tasks rated "1-4 hours" or ">4 hours"
  (`bench/agent/tasks-hard.txt`), default prompt.
- **Large-output set** (secondary): 10 of them (`tasks-heavy.txt`) with the
  `verify-full` prompt, which makes both arms run complete test files.

## Why

Every published number for mcp-recall so far measures its output (bytes kept,
facts kept), not the agent. A reader who doubts compression wants to know whether
the agent still solves the task. That is the claim this pilot can test.

## The claims we expect to make

- **Primary:** per model, the recall arm's solve rate minus the plain arm's on the
  hard set, with a 95% interval. We expect the interval to include 0, and the
  claim will then be "no measurable effect on solve rate", quoting the interval's
  lower bound as the largest harm the data still allows.
- **How often mcp-recall engaged:** share of recall-arm runs that stored at least
  one output, and that retrieved one, per model and task set. The smoke round
  stored 1 output in 12 runs, so this is reported whatever it shows. A null
  result from a plugin that rarely engaged is a statement about the tasks, and
  the report says so.
- **Secondary, descriptive:** paired differences in cost, input tokens, turns and
  wall time per task, as medians with 95% intervals. No claim of savings unless
  the interval excludes 0.

## Claims we will not make

- That mcp-recall makes Claude solve more tasks, unless the interval for a model
  lies entirely above 0. Even then it is one model on one task set, said as such.
- Anything about models, agents, harnesses or task types we did not run.
- Any reduction percentage as evidence of task quality.
- A pooled "across models" result as the headline. Pooling (stratified by model)
  is a secondary view only.

## Power, stated up front

Simulated exact McNemar test, alpha 0.05, plain solve rate 0.4, 45 paired tasks:

| True difference | Power, noise discordance 0.1 | Power, noise discordance 0.2 |
|---|---|---|
| 10 points | 0.16 | 0.09 |
| 15 points | 0.40 | 0.27 |
| 20 points | 0.69 | 0.52 |
| 25 points | 0.88 | 0.78 |

"Noise discordance" is the share of tasks where two runs of the same arm would
disagree; the smoke round showed it is real (2x swings in turns with the plugin
inert). So the pilot reliably detects only a difference of about 20-25 points per
model. Smaller effects can exist and go unseen, and the report must say so. The
#414 plan comment said 15-20 points; this table corrects it.

## Analysis, fixed now

- **Unit:** a task, paired across arms within one model.
- **Primary test:** exact two-sided McNemar on discordant pairs, per model.
- **Interval:** paired bootstrap over tasks, 10,000 resamples, percentile 95%.
- **Grading:** the official SWE-bench harness (`swebench` 5.0.2) on the patch
  taken against the image's HEAD. A run that hit its `--max-budget-usd` ceiling or
  the timeout is graded on whatever patch it left.
- **Exclusions:** only infrastructure failures (the container or `mcp-recall
  install` failed, or no result event and no patch). Such a pair is dropped from
  that model's primary analysis and counted in the report. Nothing is excluded
  for being slow, expensive or unsolved.
- **Engaged subset:** solve rates on tasks where the recall arm stored at least
  one output are reported as exploratory only, because engagement is observed in
  one arm and is not randomized.

## What counts as a loss

For any model, a hard-set interval lying entirely below 0 is a measured harm. It
is published in `docs/benchmarks.md` and the report as the headline for that
model, with the event streams of the discordant tasks examined in the report.

## Where it lands

| Place | Content |
|---|---|
| `docs/research/task-success-2026-11.md` | The full report: method, results, worked examples from the event streams, limits, deviations from this spec. A dated record, never rewritten |
| `docs/benchmarks.md` | A "Task success" section: the per-model result and interval, linking the report |
| `README.md` | One or two sentences and a link |
| HF dataset `sakebomb/mcp-recall-task-success` | The sealed evidence (`SHA256SUMS`), its layout, how to verify and rerun. Private until the report is approved |

## Already disclosed

- The smoke round (`runs/smoke1`, 4 medium tasks) predates full recording; it is
  cited only as the costing round, never pooled with the pilot.
- A first pilot attempt was stopped after 144 runs because it kept no transcripts
  (`runs/superseded/`). Its outcomes were never graded. The pilot was rerun in full.
