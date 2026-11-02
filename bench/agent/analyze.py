"""The pre-registered analysis for #414 (tasks/specs/414-task-success-claims.md).

Written and tested on the smoke round before any pilot run was graded. Reads a
graded run directory and prints, per model, the paired solve-rate difference
(recall minus plain) with an exact McNemar test and a paired bootstrap interval,
how often mcp-recall engaged, and paired secondary metrics.

    analyze.py --run-id pilot-hard            # markdown to stdout, analysis.json beside the run
"""

import argparse
import json
import random
import statistics
from math import comb
from pathlib import Path

RUNS = Path(__file__).resolve().parent / "runs"
ARMS = ("plain", "recall")
SEED = 414
RESAMPLES = 10_000
SECONDARY = ("cost", "in_tok", "turns", "wall_s")


def stream_engagement(stream_path):
    """Count, from the session's own events, the tool results that reached
    Claude as a mcp-recall summary and the recall__* tools Claude called.
    None when the run kept no stream (runs recorded before full evidence)."""
    summaries = calls = 0
    if not stream_path.exists():
        return None, None
    for line in stream_path.read_text().splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        content = (event.get("message") or {}).get("content")
        if not isinstance(content, list):
            continue
        for item in content:
            if not isinstance(item, dict):
                continue
            if event.get("type") == "assistant" and item.get("type") == "tool_use":
                calls += str(item.get("name", "")).startswith("mcp__recall__")
            if event.get("type") == "user" and item.get("type") == "tool_result":
                summaries += "[recall:recall_" in json.dumps(item.get("content"))
    return summaries, calls


def load_runs(run_id):
    out_dir = RUNS / run_id
    runs = []
    for rec_path in sorted(out_dir.glob("*/*/*.json")):
        rec = json.loads(rec_path.read_text())
        model, arm, iid = rec["model"], rec["arm"], rec["instance_id"]
        report = (out_dir / "logs" / "run_evaluation" / f"{run_id}-{model}-{arm}"
                  / f"{model}-{arm}" / iid / "report.json")
        c = rec["claude"]
        u = c.get("usage", {})
        has_result = c.get("type") == "result"
        if report.exists():
            resolved = json.loads(report.read_text())[iid]["resolved"]
        elif rec["patch_bytes"] == 0:
            resolved = False  # nothing to grade: an empty patch solves nothing
        else:
            resolved = None  # a patch the grader produced no report for
        stored = rec["recall_stored"] if isinstance(rec["recall_stored"], list) else []
        summaries, calls = stream_engagement(rec_path.with_suffix(".evidence") / "stream.jsonl")
        runs.append({
            "model": model, "arm": arm, "task": iid, "resolved": resolved,
            # Spec exclusion: infrastructure failure = no result event and no patch.
            "infra_failure": not has_result and rec["patch_bytes"] == 0,
            "subtype": c.get("subtype"), "cost": c.get("total_cost_usd", 0.0),
            "turns": c.get("num_turns") or 0, "wall_s": rec["wall_s"],
            "in_tok": u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0)
            + u.get("cache_creation_input_tokens", 0),
            "stored": len(stored), "summaries_delivered": summaries, "recall_calls": calls,
        })
    return runs


def mcnemar_exact(b, c):
    """Two-sided exact McNemar p-value on b and c discordant pairs."""
    n = b + c
    if n == 0:
        return 1.0
    return min(1.0, 2 * sum(comb(n, i) for i in range(min(b, c) + 1)) / 2 ** n)


def percentile(values, q):
    s = sorted(values)
    return s[min(len(s) - 1, max(0, round(q * (len(s) - 1))))]


def bootstrap_ci(n, stat, rng):
    """Percentile 95% interval of stat(indices) over task resamples."""
    draws = [stat([rng.randrange(n) for _ in range(n)]) for _ in range(RESAMPLES)]
    return percentile(draws, 0.025), percentile(draws, 0.975)


def pairs_for(runs, model):
    by_task = {}
    for r in runs:
        if r["model"] == model:
            by_task.setdefault(r["task"], {})[r["arm"]] = r
    pairs, dropped = [], {"infra_failure": [], "ungraded": [], "unpaired": []}
    for task, arms in sorted(by_task.items()):
        if set(arms) != set(ARMS):
            dropped["unpaired"].append(task)
        elif any(arms[a]["infra_failure"] for a in ARMS):
            dropped["infra_failure"].append(task)
        elif any(arms[a]["resolved"] is None for a in ARMS):
            dropped["ungraded"].append(task)
        else:
            pairs.append((arms["plain"], arms["recall"]))
    return pairs, dropped


def analyze_model(runs, model, rng):
    pairs, dropped = pairs_for(runs, model)
    n = len(pairs)
    p = [bool(pl["resolved"]) for pl, _ in pairs]
    r = [bool(rc["resolved"]) for _, rc in pairs]
    b = sum(1 for i in range(n) if p[i] and not r[i])
    c = sum(1 for i in range(n) if r[i] and not p[i])
    out = {"model": model, "n_pairs": n, "dropped": dropped,
           "plain_solved": sum(p), "recall_solved": sum(r), "plain_only": b, "recall_only": c,
           "diff": (c - b) / n if n else None, "mcnemar_p": mcnemar_exact(b, c)}
    if n:
        out["diff_ci95"] = bootstrap_ci(n, lambda ix: sum(r[i] - p[i] for i in ix) / n, rng)
        out["secondary"] = {}
        for k in SECONDARY:
            d = [rc[k] - pl[k] for pl, rc in pairs]
            out["secondary"][k] = {"median_diff": statistics.median(d),
                                   "ci95": bootstrap_ci(n, lambda ix: statistics.median(d[i] for i in ix), rng)}
    rec = [rc for _, rc in pairs]
    out["engagement"] = {k: None if any(x[k] is None for x in rec) else sum(1 for x in rec if x[k] > 0)
                         for k in ("stored", "summaries_delivered", "recall_calls")}
    engaged = [i for i in range(n) if rec[i]["stored"] > 0]
    out["engaged_subset"] = {"n": len(engaged), "plain_solved": sum(p[i] for i in engaged),
                             "recall_solved": sum(r[i] for i in engaged)}
    return out


def analyze(run_id):
    runs = load_runs(run_id)
    rng = random.Random(SEED)
    models = sorted({x["model"] for x in runs})
    per_model = [analyze_model(runs, m, rng) for m in models]
    # Secondary, pooled view: resample tasks within each model (stratified).
    strata = []
    for m in models:
        pairs, _ = pairs_for(runs, m)
        strata.append([int(bool(rc["resolved"])) - int(bool(pl["resolved"])) for pl, rc in pairs])
    total = sum(len(s) for s in strata)
    pooled = None
    if total:
        draws = []
        for _ in range(RESAMPLES):
            draws.append(sum(sum(s[rng.randrange(len(s))] for _ in s) for s in strata if s) / total)
        pooled = {"n_pairs": total, "diff": sum(map(sum, strata)) / total,
                  "ci95": (percentile(draws, 0.025), percentile(draws, 0.975))}
    return {"run_id": run_id, "seed": SEED, "resamples": RESAMPLES, "per_model": per_model,
            "pooled_stratified": pooled,
            "subtypes": sorted({f"{x['arm']}:{x['subtype']}" for x in runs})}


def pct(x):
    return "n/a" if x is None else f"{x * 100:+.1f}"


def to_markdown(res):
    lines = [f"## {res['run_id']}", "",
             "| model | pairs | plain solved | recall solved | recall − plain (pts) | 95% CI (pts) | McNemar p | dropped |",
             "|---|---|---|---|---|---|---|---|"]
    for m in res["per_model"]:
        ci = m.get("diff_ci95")
        dropped = ", ".join(f"{k} {len(v)}" for k, v in m["dropped"].items() if v) or "none"
        lines.append(f"| {m['model']} | {m['n_pairs']} | {m['plain_solved']} | {m['recall_solved']} "
                     f"| {pct(m['diff'])} | {pct(ci[0]) if ci else 'n/a'} to {pct(ci[1]) if ci else 'n/a'} "
                     f"| {m['mcnemar_p']:.3f} | {dropped} |")
    if res["pooled_stratified"]:
        ps = res["pooled_stratified"]
        lines += ["", f"Pooled across models (secondary, stratified): {pct(ps['diff'])} pts, "
                      f"95% CI {pct(ps['ci95'][0])} to {pct(ps['ci95'][1])}, {ps['n_pairs']} pairs."]
    lines += ["", "| model | recall runs that stored ≥1 | got ≥1 summary | called recall__* | engaged subset: plain · recall solved |",
              "|---|---|---|---|---|"]
    for m in res["per_model"]:
        e, s = m["engagement"], m["engaged_subset"]
        share = lambda k: "n/a (no stream)" if e[k] is None else f"{e[k]}/{m['n_pairs']}"
        lines.append(f"| {m['model']} | {share('stored')} | {share('summaries_delivered')} "
                     f"| {share('recall_calls')} | {s['plain_solved']} · {s['recall_solved']} of {s['n']} |")
    lines += ["", "| model | metric | median recall − plain | 95% CI |", "|---|---|---|---|"]
    for m in res["per_model"]:
        for k, v in m.get("secondary", {}).items():
            lines.append(f"| {m['model']} | {k} | {v['median_diff']:.4g} | {v['ci95'][0]:.4g} to {v['ci95'][1]:.4g} |")
    return "\n".join(lines) + "\n"


def compare(base, treat, model):
    """The follow-up comparisons: pair two RUN:ARM sides by task with the same
    statistics as the primary analysis. `base` takes the plain role and `treat`
    the recall role, so B minus A is reported as recall minus plain."""
    sides = []
    for spec, role in ((base, "plain"), (treat, "recall")):
        run_id, arm = spec.split(":")
        sides += [{**r, "arm": role} for r in load_runs(run_id) if r["arm"] == arm and r["model"] == model]
    res = analyze_model(sides, model, random.Random(SEED))
    return {"base": base, "treat": treat, **res}


def replicate_pairs(runs, base, treat):
    """Per task, the (base, treat) run pairs, one per run id in which both arms ran
    and were graded without an infrastructure failure."""
    cells = {}
    for r in runs:
        cells.setdefault((r["task"], r["run_id"]), {})[r["arm"]] = r
    per_task = {}
    for (task, _), arms in sorted(cells.items()):
        if base not in arms or treat not in arms:
            continue
        b, t = arms[base], arms[treat]
        if b["infra_failure"] or t["infra_failure"] or b["resolved"] is None or t["resolved"] is None:
            continue
        per_task.setdefault(task, []).append((b, t))
    return per_task


def replicate_compare(run_ids, base, treat, model):
    """The compression test (#414 follow-up 2): treat minus base solve rate with
    several runs per task. The unit is the task: each task's mean difference over its
    replicate pairs. Interval: percentile bootstrap over tasks. p: randomization test
    that swaps the two arms' labels independently within each replicate pair."""
    runs = [{**r, "run_id": rid} for rid in run_ids for r in load_runs(rid) if r["model"] == model]
    return {"model": model, "run_ids": list(run_ids), **replicate_stats(runs, base, treat)}


def replicate_stats(runs, base, treat):
    pairs = replicate_pairs(runs, base, treat)
    diffs = {task: [int(bool(t["resolved"])) - int(bool(b["resolved"])) for b, t in ps]
             for task, ps in pairs.items()}
    tasks = sorted(diffs)
    n = len(tasks)
    out = {"base": base, "treat": treat, "n_tasks": n, "n_pairs": sum(len(diffs[t]) for t in tasks)}
    if not n:
        return out
    means = [statistics.mean(diffs[t]) for t in tasks]
    obs = sum(means) / n
    rng = random.Random(SEED)
    out["diff"] = obs
    out["diff_ci95"] = bootstrap_ci(n, lambda ix: sum(means[i] for i in ix) / n, rng)
    hits = 0
    for _ in range(RESAMPLES):
        stat = sum(statistics.mean(d * rng.choice((-1, 1)) for d in diffs[t]) for t in tasks) / n
        hits += abs(stat) >= abs(obs) - 1e-12
    out["perm_p"] = (hits + 1) / (RESAMPLES + 1)
    out["tasks_changed"] = sum(1 for t in tasks if any(diffs[t]))
    paired = [pair for ps in pairs.values() for pair in ps]
    for i, arm in enumerate((base, treat)):
        out[f"{arm}_solve_rate"] = sum(bool(p[i]["resolved"]) for p in paired) / len(paired)
    treated = [t for _, t in paired]
    out["engagement"] = {k: None if any(r[k] is None for r in treated)
                         else f"{sum(1 for r in treated if r[k] > 0)}/{len(treated)}"
                         for k in ("summaries_delivered", "recall_calls")}
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--run-id")
    p.add_argument("--compare", nargs=2, metavar=("BASE_RUN:ARM", "TREAT_RUN:ARM"),
                   help="follow-up comparison, reported as TREAT minus BASE")
    p.add_argument("--model", default="claude-haiku-5-5")
    p.add_argument("--replicates", nargs="+", metavar="RUN_ID",
                   help="replicate run ids for the compression test; use with --pair")
    p.add_argument("--pair", nargs=2, metavar=("BASE_ARM", "TREAT_ARM"), default=("nohook", "recall"))
    a = p.parse_args()
    if a.replicates:
        print(json.dumps(replicate_compare(a.replicates, a.pair[0], a.pair[1], a.model), indent=1))
        return
    if a.compare:
        res = compare(a.compare[0], a.compare[1], a.model)
        ci = res.get("diff_ci95")
        print(f"| {a.compare[1]} − {a.compare[0]} | {a.model} | {res['n_pairs']} pairs | "
              f"{res['plain_solved']} → {res['recall_solved']} solved | {pct(res['diff'])} pts | "
              f"95% CI {pct(ci[0]) if ci else 'n/a'} to {pct(ci[1]) if ci else 'n/a'} | "
              f"McNemar p {res['mcnemar_p']:.3f} | discordant {res['plain_only']} · {res['recall_only']} |")
        return
    if not a.run_id:
        p.error("--run-id or --compare is required")
    res = analyze(a.run_id)
    (RUNS / a.run_id / "analysis.json").write_text(json.dumps(res, indent=1))
    print(to_markdown(res), end="")


if __name__ == "__main__":
    main()
