"""Paired task-success benchmark (#414): the same Claude Code agent on SWE-bench
Verified tasks, with and without mcp-recall installed.

Each run gets a fresh container from the task's prebuilt SWE-bench image, so the
two arms differ only in whether `mcp-recall install` ran inside it. The host's
`claude` binary and the release `mcp-recall` binary are mounted read-only, so
both arms run identical versions.

    bench.py run    --tasks tasks-smoke.txt --models claude-haiku-5-5 --run-id smoke1
    bench.py grade  --run-id smoke1
    bench.py report --run-id smoke1

`chain` runs tasks back to back in one resumed session, one container per task,
to let context build up the way a long working session does:

    bench.py chain  --tasks tasks-long.txt --model claude-haiku-5-5 --run-id long --prompt full-output
"""

import argparse
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, cast
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
RUNS = HERE / "runs"
RECALL_BIN = HERE / "bin" / "mcp-recall-linux-x64"
ENV_FILE = Path.home() / ".config" / "mcp-recall-bench" / "litellm.env"
# plain2 repeats plain (an A/A noise check); nohook installs mcp-recall and then
# removes its PostToolUse hook, isolating install side effects from compression.
ARMS = ("plain", "recall", "plain2", "nohook")
DEFAULT_ARMS = ("plain", "recall")
INSTALLED = ("recall", "nohook")
DROP_POST_TOOL_USE = ("import json; p='/root/.claude/settings.json'; s=json.load(open(p)); "
                      "s['hooks'].pop('PostToolUse'); json.dump(s, open(p, 'w'), indent=2)")
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
    # verify-full barely raised engagement (4 of 30 runs): agents still piped test
    # runs through tail, head or grep. full-output asks for the output unfiltered and
    # verbose, since a passing run that prints only dots is too small to summarize.
    "full-output": (" Before you finish, run the complete test file for every module you"
                    " changed, not only the tests nearest your change, with verbose output"
                    " that lists each test (pytest -v, or runtests.py -v 2). Read command output"
                    " in full: do not pipe or truncate it with head, tail, grep or similar"
                    " filters, and do not redirect it to a file to read part of it."),
}

# Opens every chained task after the first: the session carries on, the checkout does not.
CHAIN_PREFIX = ("This is a new task. /testbed now holds a different checkout, and your changes"
                " from earlier tasks are not in it.\n\n")


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


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def as_text(b):
    return b.decode(errors="replace") if isinstance(b, bytes) else (b or "")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def image_id(image):
    r = sh(["docker", "image", "inspect", "--format", "{{.Id}} {{join .RepoDigests \",\"}}", image])
    return r.stdout.strip()


def last_result_event(stream):
    """The final `result` event of a stream-json run: the same fields the json
    output format prints (cost, usage, turns, subtype)."""
    for line in reversed(stream.splitlines()):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "result":
            return event
    return {"is_error": True, "raw_tail": stream[-2000:]}


def collect_evidence(container, ev):
    """Copy out what the container would otherwise take with it: Claude Code's
    own session transcript and config (showing which hooks and MCP servers each
    arm had), and a consistent snapshot of every mcp-recall store."""
    sh(["docker", "cp", f"{container}:/root/.claude", str(ev / "claude-home")])
    sh(["docker", "cp", f"{container}:/root/.claude.json", str(ev / "claude.json")])
    snap = sh(["docker", "exec", container, "python3", "-c",
               "import sqlite3,glob,os\n"
               "os.makedirs('/tmp/recall-snap',exist_ok=True)\n"
               "for f in glob.glob('/root/.local/share/mcp-recall/*.db'):\n"
               "    sqlite3.connect(f).backup(sqlite3.connect('/tmp/recall-snap/'+os.path.basename(f)))\n"])
    if snap.returncode == 0:
        sh(["docker", "cp", f"{container}:/tmp/recall-snap", str(ev / "recall-store")])


def session_id(stream):
    """The session a stream-json run belongs to, from its first event that names one."""
    for line in stream.splitlines():
        try:
            sid = json.loads(line).get("session_id")
        except (json.JSONDecodeError, AttributeError):
            continue
        if sid:
            return sid
    return None


def restore_state(container, ev):
    """Put the previous task's session into a fresh container: Claude Code's home
    and config, and the mcp-recall store, from that task's evidence."""
    steps = [["docker", "cp", f"{ev / 'claude-home'}/.", f"{container}:/root/.claude"],
             ["docker", "cp", str(ev / "claude.json"), f"{container}:/root/.claude.json"]]
    if (ev / "recall-store").is_dir():
        steps += [["docker", "exec", container, "mkdir", "-p", "/root/.local/share/mcp-recall"],
                  ["docker", "cp", f"{ev / 'recall-store'}/.", f"{container}:/root/.local/share/mcp-recall"]]
    for step in steps:
        r = sh(step)
        if r.returncode:
            return r.stderr.strip()[:200]
    return None


def tool_versions():
    claude_bin = os.path.realpath(shutil.which("claude") or "")
    swebench = sh([sys.executable, "-c", "import swebench; print(swebench.__version__)"]).stdout.strip()
    git = lambda *args: sh(["git", "-C", str(HERE), *args]).stdout.strip()
    return {
        "claude_version": sh(["claude", "--version"]).stdout.strip(),
        "claude_sha256": sha256(claude_bin),
        "mcp_recall_version": sh([str(RECALL_BIN), "--version"]).stdout.strip(),
        "mcp_recall_sha256": sha256(RECALL_BIN),
        "swebench_version": swebench,
        "harness_commit": git("rev-parse", "HEAD"),
        "harness_dirty": bool(git("status", "--porcelain", "--", ".")),
        "bench_py_sha256": sha256(__file__),
        "docker": sh(["docker", "version", "--format", "{{.Server.Version}}"]).stdout.strip(),
        "host": " ".join(os.uname()),
    }


def append_manifest(out_dir, entry):
    path = out_dir / "manifest.json"
    stages = json.loads(path.read_text()) if path.exists() else []
    stages.append(entry)
    path.write_text(json.dumps(stages, indent=1))


def run_one(task, model, arm, out_dir, a, resume_from=None):
    """One agent run in a fresh container. With resume_from (the previous task's
    evidence directory), the run continues that task's session instead of
    starting one: its state is copied in, and install is not run again."""
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
        inst = None
        resume = ""
        if resume_from is not None:
            sid = session_id((resume_from / "stream.jsonl").read_text())
            failed = "no session id in the previous stream" if sid is None else restore_state(name, resume_from)
            if failed:
                return f"FAIL resume {iid}: {failed}"
            resume = f"--resume {sid} "
        elif arm in INSTALLED:
            inst = sh(["docker", "exec", name, "mcp-recall", "install"])
            if inst.returncode:
                return f"FAIL install {iid}: {inst.stderr.strip()[:200]}"
        if arm == "nohook" and resume_from is None:
            drop = sh(["docker", "exec", name, "python3", "-c", DROP_POST_TOOL_USE])
            if drop.returncode:
                return f"FAIL nohook {iid}: {drop.stderr.strip()[:200]}"
        prompt = PROMPT.format(extra=PROMPT_EXTRA[a.prompt], problem=task["problem_statement"])
        if resume_from is not None:
            prompt = CHAIN_PREFIX + prompt
        (out / f"{iid}.prompt.txt").write_text(prompt)
        sh(["docker", "cp", str(out / f"{iid}.prompt.txt"), f"{name}:/tmp/prompt.txt"])
        # stream-json records every event the agent saw, tool results included, so
        # the recall arm's evidence shows the summaries Claude actually received.
        cmd = ("source /opt/miniconda3/bin/activate testbed && "
               f"claude -p \"$(cat /tmp/prompt.txt)\" {resume}--model {model} --output-format stream-json --verbose "
               f"--dangerously-skip-permissions --max-budget-usd {RUN_BUDGET[model]}")
        started_at = now_utc()
        t0 = time.time()
        try:
            res = sh(["docker", "exec", "-w", "/testbed", name, "bash", "-lc", cmd], timeout=a.timeout)
            raw, rc, err = res.stdout, res.returncode, res.stderr
        except subprocess.TimeoutExpired as e:
            raw, rc, err = as_text(e.stdout), "timeout", as_text(e.stderr)
        wall = time.time() - t0
        ev = out / f"{iid}.evidence"
        ev.mkdir(exist_ok=True)
        (ev / "stream.jsonl").write_text(raw)
        (ev / "stderr.txt").write_text(err)
        if inst is not None:
            (ev / "install.log").write_text(inst.stdout + inst.stderr)
        result = last_result_event(raw)
        # HEAD, not base_commit: each image adds its own "SWE-bench" commit on top
        # (sympy's flips every file to 755), and grading applies onto that image.
        diff = sh(["docker", "exec", "-w", "/testbed", name, "bash", "-lc",
                   "git add -A && git diff --cached HEAD -- . ':!.claude'"])
        (out / f"{iid}.patch").write_text(diff.stdout)
        stored = None
        if arm in INSTALLED:
            q = sh(["docker", "exec", name, "python3", "-c",
                    "import sqlite3,glob,json;fs=glob.glob('/root/.local/share/mcp-recall/*.db');"
                    "print(json.dumps([list(r) for f in fs for r in sqlite3.connect(f).execute("
                    "'select tool_name, original_size, summary_size, access_count from stored_outputs')]))"])
            stored = json.loads(q.stdout) if q.returncode == 0 else q.stderr[-300:]
        collect_evidence(name, ev)
        record = {"instance_id": iid, "model": model, "arm": arm, "prompt": a.prompt, "rc": rc,
                  "started_at": started_at, "ended_at": now_utc(), "wall_s": round(wall, 1),
                  "image": task["image"], "image_id": image_id(task["image"]),
                  "patch_bytes": len(diff.stdout), "recall_stored": stored, "claude": result,
                  "resumed": resume_from is not None}
        (out / f"{iid}.json").write_text(json.dumps(record, indent=1))
        return (f"done {model} {arm} {iid}: ${result.get('total_cost_usd', 0):.3f} "
                f"{result.get('num_turns')} turns {wall:.0f}s patch={len(diff.stdout)}B")
    finally:
        sh(["docker", "rm", "-f", name])


def pull_images(tasks):
    for task in tasks:
        if sh(["docker", "image", "inspect", task["image"]]).returncode:
            print("pull", task["image"], flush=True)
            subprocess.run(["docker", "pull", "-q", task["image"]], check=True)


def new_stage(a, tasks, models):
    """The manifest entry pinning what a run invocation used."""
    from datasets import load_dataset
    return {"started_at": now_utc(), "argv": sys.argv, "tasks_file": a.tasks,
            "tasks_sha256": sha256(a.tasks), "models": models, "arms": a.arms, "prompt": a.prompt,
            "prompt_template": PROMPT, "prompt_extra": PROMPT_EXTRA[a.prompt],
            "run_budget_usd": RUN_BUDGET, "cap_usd": a.cap, "jobs": a.jobs, "timeout_s": a.timeout,
            "dataset": DATASET, "dataset_fingerprint": cast(Any, load_dataset(DATASET, split="test"))._fingerprint,
            "images": {t["instance_id"]: image_id(t["image"]) for t in tasks},
            "key_spend_before_usd": key_spend(), **tool_versions()}


def cmd_run(a):
    tasks = load_tasks(a.tasks)
    out_dir = RUNS / a.run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    pull_images(tasks)
    stage = new_stage(a, tasks, a.models)
    for model in a.models:
        spend = key_spend()
        if spend >= a.cap:
            sys.exit(f"key spend ${spend:.2f} reached cap ${a.cap:.2f}; stopping before {model}")
        print(f"== {model} (key spend so far ${spend:.2f})", flush=True)
        jobs = [(t, model, arm) for t in tasks for arm in a.arms]
        with ThreadPoolExecutor(a.jobs) as pool:
            for line in pool.map(lambda j: run_one(j[0], j[1], j[2], out_dir, a), jobs):
                print(line, flush=True)
                with (out_dir / "run.log").open("a") as log:
                    log.write(f"{now_utc()} {line}\n")
    stage.update(ended_at=now_utc(), key_spend_after_usd=key_spend())
    append_manifest(out_dir, stage)
    print(f"key spend after run ${stage['key_spend_after_usd']:.2f}")


def sequences(task_ids, n, length, seed):
    """n task orders of the given length, each drawn without repeats, fixed by the seed."""
    rng = random.Random(seed)
    pool = sorted(task_ids)
    return [rng.sample(pool, length) for _ in range(n)]


def run_chain(seq, tasks, arm, out_dir, a):
    """One sequence in one arm: each task resumes the previous task's session. A
    task that does not finish its run ends the chain, since the next has nothing
    to resume."""
    prev = None
    for iid in seq:
        line = run_one(tasks[iid], a.model, arm, out_dir, a, resume_from=prev)
        print(line, flush=True)
        with (out_dir / "run.log").open("a") as log:
            log.write(f"{now_utc()} {line}\n")
        if not line.startswith(("done", "skip")):
            return
        prev = out_dir / a.model / arm / f"{iid}.evidence"


def cmd_chain(a):
    by_id = {t["instance_id"]: t for t in load_tasks(a.tasks)}
    seqs = sequences(by_id, a.sequences, a.length, a.seed)
    pull_images(by_id.values())
    dirs = [RUNS / f"{a.run_id}-s{k + 1:02d}" for k in range(len(seqs))]
    stages = []
    for out_dir, seq in zip(dirs, seqs):
        out_dir.mkdir(parents=True, exist_ok=True)
        stages.append({**new_stage(a, [by_id[i] for i in seq], [a.model]),
                       "sequence": seq, "seed": a.seed, "chain_prefix": CHAIN_PREFIX})
    print(f"== {a.model} chains (key spend so far ${key_spend():.2f})", flush=True)
    jobs = [(seq, arm, out_dir) for out_dir, seq in zip(dirs, seqs) for arm in a.arms]
    with ThreadPoolExecutor(a.jobs) as pool:
        list(pool.map(lambda j: run_chain(j[0], by_id, j[1], j[2], a), jobs))
    after = key_spend()
    for out_dir, stage in zip(dirs, stages):
        append_manifest(out_dir, {**stage, "ended_at": now_utc(), "key_spend_after_usd": after})
    print(f"key spend after run ${after:.2f}")


def cmd_seal(a):
    """Fail if the API token appears anywhere under the run, then write a
    SHA256SUMS over every file so later tampering or loss is detectable."""
    out_dir = RUNS / a.run_id
    token = dict(l.split("=", 1) for l in ENV_FILE.read_text().split() if "=" in l)["ANTHROPIC_AUTH_TOKEN"]
    files = sorted(p for p in out_dir.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
    leaked = [str(p.relative_to(out_dir)) for p in files if token.encode() in p.read_bytes()]
    if leaked:
        sys.exit(f"token found in {len(leaked)} files, not sealing: {leaked[:5]}")
    (out_dir / "SHA256SUMS").write_text("".join(f"{sha256(p)}  {p.relative_to(out_dir)}\n" for p in files))
    print(f"sealed {len(files)} files, no token found")


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
    r.add_argument("--arms", nargs="+", choices=ARMS, default=list(DEFAULT_ARMS))
    r.add_argument("--jobs", type=int, default=4)
    r.add_argument("--timeout", type=int, default=3600, help="seconds per agent run")
    c = sub.add_parser("chain")
    c.add_argument("--tasks", required=True)
    c.add_argument("--model", required=True, choices=sorted(RUN_BUDGET))
    c.add_argument("--run-id", required=True, help="prefix: sequence k goes to <run-id>-sNN")
    c.add_argument("--sequences", type=int, default=6)
    c.add_argument("--length", type=int, default=6)
    c.add_argument("--seed", type=int, default=414)
    c.add_argument("--cap", type=float, default=40.0)
    c.add_argument("--prompt", choices=sorted(PROMPT_EXTRA), default="default")
    c.add_argument("--arms", nargs="+", choices=INSTALLED, default=list(INSTALLED))
    c.add_argument("--jobs", type=int, default=4)
    c.add_argument("--timeout", type=int, default=3600, help="seconds per agent run")
    g = sub.add_parser("grade")
    g.add_argument("--run-id", required=True)
    g.add_argument("--jobs", type=int, default=4)
    rp = sub.add_parser("report")
    rp.add_argument("--run-id", required=True)
    sub.add_parser("seal").add_argument("--run-id", required=True)
    a = p.parse_args()
    {"run": cmd_run, "chain": cmd_chain, "grade": cmd_grade, "report": cmd_report, "seal": cmd_seal}[a.cmd](a)


if __name__ == "__main__":
    main()
