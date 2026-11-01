"""Paired task-success benchmark (#414): the same Claude Code agent on SWE-bench
Verified tasks, with and without mcp-recall installed.

Each run gets a fresh container from the task's prebuilt SWE-bench image, so the
two arms differ only in whether `mcp-recall install` ran inside it. The host's
`claude` binary and the release `mcp-recall` binary are mounted read-only, so
both arms run identical versions.

    bench.py run    --tasks tasks-smoke.txt --models claude-haiku-5-5 --run-id smoke1
    bench.py grade  --run-id smoke1
    bench.py report --run-id smoke1
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import cast
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
RUNS = HERE / "runs"
RECALL_BIN = HERE / "bin" / "mcp-recall-linux-x64"
ENV_FILE = Path.home() / ".config" / "mcp-recall-bench" / "litellm.env"
ARMS = ("plain", "recall")
# The SWE-bench org copy carries the image, eval_script and log_parser fields
# that swebench>=5 grades from; the older princeton-nlp copy lacks them.
DATASET = "SWE-bench/SWE-bench_Verified"

# Per-run ceiling passed to claude --max-budget-usd. The whole-run cap is
# enforced separately against the LiteLLM key's recorded spend.
RUN_BUDGET = {"claude-haiku-5-5": 1.0, "claude-sonnet-5-5": 3.0, "claude-opus-5-5": 6.0}

PROMPT = """You are working in the git repository at /testbed. Resolve the issue below by
editing the repository's non-test source files. The Python environment is already
active; you may run the existing tests to check your work. Do not modify or add
test files.{extra} When the fix is complete, stop.

<issue>
{problem}
</issue>
"""

# The same instruction goes to both arms. verify-full makes the agent produce the
# large tool outputs that medium tasks never reach (the smoke round stored 1 output
# in 12 recall-arm runs).
PROMPT_EXTRA = {
    "default": "",
    "verify-full": (" Before you finish, run the complete test file for every module you"
                    " changed, not only the tests nearest your change, and read the output."),
}


def load_tasks(path):
    from datasets import Dataset, load_dataset

    wanted = [l.strip() for l in Path(path).read_text().splitlines() if l.strip() and not l.startswith("#")]
    ds = cast(Dataset, load_dataset(DATASET, split="test"))
    rows = {r["instance_id"]: r for r in ds.to_list() if r["instance_id"] in wanted}
    missing = [w for w in wanted if w not in rows]
    if missing:
        sys.exit(f"not in {DATASET}: {missing}")
    return [rows[w] for w in wanted]


def key_spend():
    env = dict(l.split("=", 1) for l in ENV_FILE.read_text().split() if "=" in l)
    req = Request(env["ANTHROPIC_BASE_URL"].rstrip("/") + "/key/info",
                  headers={"Authorization": "Bearer " + env["ANTHROPIC_AUTH_TOKEN"]})
    with urlopen(req, timeout=30) as resp:
        return json.load(resp)["info"]["spend"]


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def run_one(task, model, arm, out_dir, a):
    iid = task["instance_id"]
    out = out_dir / model / arm
    out.mkdir(parents=True, exist_ok=True)
    if (out / f"{iid}.json").exists():
        return f"skip {model} {arm} {iid}"
    # Start only if every job now in flight could hit its own ceiling and the
    # total would still stay under the cap.
    spend = key_spend()
    if spend + a.jobs * RUN_BUDGET[model] > a.cap:
        return f"CAP {model} {arm} {iid}: spend ${spend:.2f} + in-flight worst case exceeds ${a.cap:.2f}"
    name = f"bench-{out_dir.name}-{model}-{arm}-{iid}".replace("_", "-")[:120]
    claude_bin = os.path.realpath(shutil.which("claude") or sys.exit("claude not on PATH"))
    sh(["docker", "rm", "-f", name])
    started = sh(["docker", "run", "-d", "--name", name, "--env-file", str(ENV_FILE),
                  "-e", "IS_SANDBOX=1", "-e", "DISABLE_AUTOUPDATER=1",
                  "-e", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
                  "-v", f"{claude_bin}:/usr/local/bin/claude:ro",
                  "-v", f"{RECALL_BIN}:/usr/local/bin/mcp-recall:ro",
                  task["image"], "sleep", "infinity"])
    if started.returncode:
        return f"FAIL start {iid}: {started.stderr.strip()[:200]}"
    try:
        if arm == "recall":
            inst = sh(["docker", "exec", name, "mcp-recall", "install"])
            if inst.returncode:
                return f"FAIL install {iid}: {inst.stderr.strip()[:200]}"
        prompt = PROMPT.format(extra=PROMPT_EXTRA[a.prompt], problem=task["problem_statement"])
        (out / f"{iid}.prompt.txt").write_text(prompt)
        sh(["docker", "cp", str(out / f"{iid}.prompt.txt"), f"{name}:/tmp/prompt.txt"])
        cmd = ("source /opt/miniconda3/bin/activate testbed && "
               f"claude -p \"$(cat /tmp/prompt.txt)\" --model {model} --output-format json "
               f"--dangerously-skip-permissions --max-budget-usd {RUN_BUDGET[model]}")
        t0 = time.time()
        try:
            res = sh(["docker", "exec", "-w", "/testbed", name, "bash", "-lc", cmd], timeout=a.timeout)
            raw, rc = res.stdout, res.returncode
        except subprocess.TimeoutExpired:
            raw, rc = "", "timeout"
        wall = time.time() - t0
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            result = {"is_error": True, "raw_tail": raw[-2000:]}
        # HEAD, not base_commit: each image adds its own "SWE-bench" commit on top
        # (sympy's flips every file to 755), and grading applies onto that image.
        diff = sh(["docker", "exec", "-w", "/testbed", name, "bash", "-lc",
                   "git add -A && git diff --cached HEAD -- . ':!.claude'"])
        (out / f"{iid}.patch").write_text(diff.stdout)
        stored = None
        if arm == "recall":
            q = sh(["docker", "exec", name, "python3", "-c",
                    "import sqlite3,glob,json;fs=glob.glob('/root/.local/share/mcp-recall/*.db');"
                    "print(json.dumps([list(r) for f in fs for r in sqlite3.connect(f).execute("
                    "'select tool_name, original_size, summary_size, access_count from stored_outputs')]))"])
            stored = json.loads(q.stdout) if q.returncode == 0 else q.stderr[-300:]
        record = {"instance_id": iid, "model": model, "arm": arm, "prompt": a.prompt, "rc": rc, "wall_s": round(wall, 1),
                  "patch_bytes": len(diff.stdout), "recall_stored": stored, "claude": result}
        (out / f"{iid}.json").write_text(json.dumps(record, indent=1))
        return (f"done {model} {arm} {iid}: ${result.get('total_cost_usd', 0):.3f} "
                f"{result.get('num_turns')} turns {wall:.0f}s patch={len(diff.stdout)}B")
    finally:
        sh(["docker", "rm", "-f", name])


def cmd_run(a):
    tasks = load_tasks(a.tasks)
    out_dir = RUNS / a.run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    for task in tasks:
        if sh(["docker", "image", "inspect", task["image"]]).returncode:
            print("pull", task["image"], flush=True)
            subprocess.run(["docker", "pull", "-q", task["image"]], check=True)
    for model in a.models:
        spend = key_spend()
        if spend >= a.cap:
            sys.exit(f"key spend ${spend:.2f} reached cap ${a.cap:.2f}; stopping before {model}")
        print(f"== {model} (key spend so far ${spend:.2f})", flush=True)
        jobs = [(t, model, arm) for t in tasks for arm in ARMS]
        with ThreadPoolExecutor(a.jobs) as pool:
            for line in pool.map(lambda j: run_one(j[0], j[1], j[2], out_dir, a), jobs):
                print(line, flush=True)
    print(f"key spend after run ${key_spend():.2f}")


def strip_mode_only(patch):
    """Drop file sections that change only a mode bit (no hunks, not a new or
    deleted file). Patches taken against base_commit before the HEAD fix carry
    one per file from the image's own commit."""
    sections = re.split(r"(?m)^(?=diff --git )", patch)
    return "".join(s for s in sections if not s.startswith("diff --git ")
                   or "\n@@ " in s or "GIT binary patch" in s or "\nnew file mode" in s
                   or "\ndeleted file mode" in s or "\nrename from" in s)


def cmd_grade(a):
    out_dir = RUNS / a.run_id
    for arm_dir in sorted(p for p in out_dir.glob("*/*") if p.is_dir() and p.name in ARMS):
        model, arm = arm_dir.parent.name, arm_dir.name
        preds = arm_dir / "predictions.jsonl"
        with preds.open("w") as f:
            for rec in sorted(arm_dir.glob("*.patch")):
                f.write(json.dumps({"instance_id": rec.stem, "model_name_or_path": f"{model}-{arm}",
                                    "model_patch": strip_mode_only(rec.read_text())}) + "\n")
        eval_id = f"{a.run_id}-{model}-{arm}"
        print(f"grade {model} {arm}", flush=True)
        subprocess.run([sys.executable, "-m", "swebench.harness.run_evaluation",
                        "--dataset_name", DATASET, "--predictions_path", str(preds),
                        "--run_id", eval_id, "--max_workers", str(a.jobs)],
                       cwd=out_dir, check=True)


def cmd_report(a):
    out_dir = RUNS / a.run_id
    rows = []
    for rec_path in sorted(out_dir.glob("*/*/*.json")):
        rec = json.loads(rec_path.read_text())
        model, arm, iid = rec["model"], rec["arm"], rec["instance_id"]
        report = out_dir / "logs" / "run_evaluation" / f"{a.run_id}-{model}-{arm}" / f"{model}-{arm}" / iid / "report.json"
        resolved = json.loads(report.read_text())[iid]["resolved"] if report.exists() else None
        c = rec["claude"]
        u = c.get("usage", {})
        stored = rec["recall_stored"] if isinstance(rec["recall_stored"], list) else []
        rows.append({"model": model, "arm": arm, "task": iid, "resolved": resolved,
                     "cost": c.get("total_cost_usd", 0.0), "turns": c.get("num_turns"),
                     "wall_s": rec["wall_s"], "error": c.get("is_error"), "subtype": c.get("subtype"),
                     "in_tok": u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0)
                     + u.get("cache_creation_input_tokens", 0),
                     "out_tok": u.get("output_tokens", 0), "stored": len(stored),
                     "retrieved": sum(1 for s in stored if s[3])})
    print("| model | arm | task | resolved | cost $ | turns | wall s | input tok | output tok | stored | retrieved |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['model']} | {r['arm']} | {r['task']} | {r['resolved']} | {r['cost']:.3f} | {r['turns']} "
              f"| {r['wall_s']:.0f} | {r['in_tok']} | {r['out_tok']} | {r['stored']} | {r['retrieved']} |")
    print()
    print("| model | arm | solved | total $ | mean $/task | mean turns |")
    print("|---|---|---|---|---|---|")
    for model in sorted({r["model"] for r in rows}):
        for arm in ARMS:
            g = [r for r in rows if r["model"] == model and r["arm"] == arm]
            if g:
                ungraded = sum(1 for r in g if r["resolved"] is None)
                solved = f"{sum(1 for r in g if r['resolved'])}/{len(g)}" + (f" ({ungraded} ungraded)" if ungraded else "")
                print(f"| {model} | {arm} | {solved} "
                      f"| {sum(r['cost'] for r in g):.3f} | {sum(r['cost'] for r in g) / len(g):.3f} "
                      f"| {sum(r['turns'] or 0 for r in g) / len(g):.1f} |")
    (out_dir / "rows.json").write_text(json.dumps(rows, indent=1))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--tasks", required=True)
    r.add_argument("--models", nargs="+", required=True, choices=sorted(RUN_BUDGET))
    r.add_argument("--run-id", required=True)
    r.add_argument("--cap", type=float, default=40.0,
                   help="never start a run that could take key spend past this, counting in-flight runs")
    r.add_argument("--prompt", choices=sorted(PROMPT_EXTRA), default="default")
    r.add_argument("--jobs", type=int, default=4)
    r.add_argument("--timeout", type=int, default=3600, help="seconds per agent run")
    g = sub.add_parser("grade")
    g.add_argument("--run-id", required=True)
    g.add_argument("--jobs", type=int, default=4)
    rp = sub.add_parser("report")
    rp.add_argument("--run-id", required=True)
    a = p.parse_args()
    {"run": cmd_run, "grade": cmd_grade, "report": cmd_report}[a.cmd](a)


if __name__ == "__main__":
    main()
