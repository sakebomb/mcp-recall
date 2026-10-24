/**
 * Builds the scripted cases of the public quality benchmark (#390): each one
 * sets up a repo state in a throwaway directory, runs the real command, and
 * writes what it printed to benchmark/corpus/<id>.json.
 *
 *   bun run scripts/quality-corpus.ts
 *
 * The benchmark reads the captures, never this script, so its table does not
 * depend on the installed git. Authors, dates and config are pinned, so a rerun
 * on the same git version rewrites the same bytes; `version` records which git
 * made each capture.
 */
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { dirname, join } from "path";

export interface Case {
  id: string;
  family: string;
  command: string;
  /** How the output was made: the scenario's description and the tool version. */
  source: string;
  version: string;
  stdout: string;
  stderr: string;
  /**
   * An MCP case's tool, as Claude Code names it, and its arguments; `stdout` is then
   * the text Claude Code hands on. Absent for a shell command.
   */
  tool?: string;
  input?: unknown;
}

const CORPUS = join(import.meta.dir, "..", "benchmark", "corpus");
const BASE_DATE = 1_760_000_000; // 2025-10-09, fixed so hashes and log dates are stable

interface Run { stdout: string; stderr: string; status: number }

// HOME is the throwaway repo (no user git config), so toolchains that live under the
// real HOME are pointed at explicitly; the rest pins width, hashing and colour.
const TOOL_ENV: NodeJS.ProcessEnv = {
  RUSTUP_HOME: process.env.RUSTUP_HOME ?? join(homedir(), ".rustup"), CARGO_HOME: process.env.CARGO_HOME ?? join(homedir(), ".cargo"),
  PYTHONUSERBASE: process.env.PYTHONUSERBASE ?? join(homedir(), ".local"),
  // No plugin autoload: what pytest prints must not depend on which plugins this machine has.
  PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1", COLUMNS: "80", PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1", NO_COLOR: "1", TERM: "dumb", CARGO_TERM_COLOR: "never",
};

class Repo {
  readonly dir = mkdtempSync(join(tmpdir(), "quality-corpus-"));
  private tick = 0;
  constructor() { this.git("init", "-q", "-b", "main"); }

  private env(): NodeJS.ProcessEnv {
    const date = `${BASE_DATE + 60 * this.tick} +0000`;
    return {
      PATH: process.env.PATH, HOME: this.dir, LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Ada Example", GIT_AUTHOR_EMAIL: "ada@example.com", GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: "Ada Example", GIT_COMMITTER_EMAIL: "ada@example.com", GIT_COMMITTER_DATE: date,
    };
  }

  /** Runs git with colour and the pager off; returns what it printed. */
  git(...args: string[]): Run {
    return this.run(["git", "-c", "color.ui=never", "-c", "core.pager=cat", ...args]);
  }

  /**
   * Runs any program in the repo, with paths to this directory shown as /work and
   * durations pinned, so a capture does not depend on where or how fast it ran.
   */
  run(argv: string[]): Run {
    const env = { ...this.env(), ...TOOL_ENV };
    const r = spawnSync(argv[0], argv.slice(1), { cwd: this.dir, env, encoding: "utf8" });
    if (r.error) throw r.error;
    // Cargo names test binaries with a hash of the package path, which moves with the
    // temp dir, and a Rust panic names the OS thread id.
    const clean = (s: string) => s.replaceAll(this.dir, "/work").replace(/\bin \d+(\.\d+)?s\b/g, "in 0.10s")
      .replace(/(deps\/\w+)-[0-9a-f]{16}\b/g, "$1-0123456789abcdef").replace(/^(thread '[^']+') \(\d+\)/gm, "$1 (1000)");
    return { stdout: clean(r.stdout), stderr: clean(r.stderr), status: r.status ?? 1 };
  }

  write(path: string, text: string): void {
    mkdirSync(dirname(join(this.dir, path)), { recursive: true });
    writeFileSync(join(this.dir, path), text);
  }

  commit(message: string): void {
    this.tick++;
    this.git("add", "-A");
    const r = this.git("commit", "-q", "-m", message);
    if (r.status !== 0) throw new Error(`commit failed: ${r.stderr}`);
  }

  remove(): void { rmSync(this.dir, { recursive: true, force: true }); }
}

/** A plausible source file: `n` lines that differ by `seed`, so edits make real hunks. */
const source = (name: string, n: number, seed = 0): string =>
  Array.from({ length: n }, (_, i) => `export function ${name}Step${i}(input: number): number { return input * ${i + 1} + ${(i * 7 + seed) % 13}; }`).join("\n") + "\n";

const SUBJECTS = ["fix: handle an empty config", "feat: add retry to the uploader", "refactor: split the parser", "docs: explain the cache key", "test: cover the timeout path", "chore: bump the linter"];

/** A refactor in progress: modified, deleted, renamed and untracked files across packages. */
function refactorInProgress(repo: Repo): void {
  for (let d = 0; d < 9; d++) for (let f = 0; f < 10; f++) repo.write(`packages/pkg${d}/src/file${f}.ts`, source(`p${d}f${f}`, 6));
  repo.write("legacy/old-entry.ts", source("old", 6));
  for (let i = 0; i < 4; i++) repo.write(`scripts/tool${i}.ts`, source(`tool${i}`, 4));
  repo.commit("chore: initial import");
  for (let d = 0; d < 9; d++) for (let f = 0; f < 10; f++) repo.write(`packages/pkg${d}/src/file${f}.ts`, source(`p${d}f${f}`, 6, 1));
  for (let i = 0; i < 4; i++) rmSync(join(repo.dir, `scripts/tool${i}.ts`));
  repo.git("mv", "legacy/old-entry.ts", "src/entry.ts");
  for (let i = 0; i < 25; i++) repo.write(`packages/pkg${i % 9}/test/new${i}.test.ts`, source(`t${i}`, 3));
}

/** `build` sets up the repo and returns the command to capture, program first. */
type Scenario = { id: string; family: string; source: string; build(repo: Repo): string[] };

const SCENARIOS: Scenario[] = [
  {
    id: "git-status-merge-conflict",
    family: "git-status",
    source: "a merge stopped on two conflicts, beside 41 unstaged edits, one staged file and untracked files",
    build(repo) {
      for (let i = 0; i < 6; i++) repo.write(`src/mod${i}.ts`, source(`mod${i}`, 20));
      for (let i = 0; i < 40; i++) repo.write(`lib/part${i}.ts`, source(`part${i}`, 4));
      repo.commit("chore: initial import");
      repo.git("checkout", "-q", "-b", "topic");
      repo.write("src/mod0.ts", source("mod0", 20, 5));
      repo.write("src/mod1.ts", source("mod1", 20, 5));
      repo.write("src/mod2.ts", source("mod2", 20, 5));
      repo.commit("feat: tune the topic weights");
      repo.git("checkout", "-q", "main");
      repo.write("src/mod0.ts", source("mod0", 20, 9));
      repo.write("src/mod1.ts", source("mod1", 20, 9));
      repo.commit("fix: main weights");
      repo.git("merge", "topic");
      repo.write("src/mod4.ts", source("mod4", 20, 3));
      for (let i = 0; i < 40; i++) repo.write(`lib/part${i}.ts`, source(`part${i}`, 4, 2));
      for (let i = 0; i < 12; i++) repo.write(`notes/plan${i}.md`, `resolve step ${i}\n`);
      repo.write("scratch.log", "merge attempt 1\n");
      return ["git", "status"];
    },
  },
  {
    id: "git-status-many-changes",
    family: "git-status",
    source: "a refactor in progress: 90 modified files over 9 directories, 4 deleted, 1 renamed, 25 untracked",
    build(repo) {
      refactorInProgress(repo);
      return ["git", "status"];
    },
  },
  {
    id: "git-status-short-many",
    family: "git-status",
    source: "the same refactor shown with `git status -s`",
    build(repo) {
      refactorInProgress(repo);
      return ["git", "status", "-s"];
    },
  },
  {
    id: "git-diff-many-files",
    family: "git-diff",
    source: "an unstaged edit touching 24 files, a few changed lines in each",
    build(repo) {
      for (let i = 0; i < 24; i++) repo.write(`src/area${i % 4}/unit${i}.ts`, source(`unit${i}`, 30));
      repo.commit("chore: initial import");
      for (let i = 0; i < 24; i++) {
        const lines = source(`unit${i}`, 30).split("\n");
        lines[3 + (i % 5)] = `export function unit${i}Changed(input: number): number { return input - ${i}; }`;
        lines[20] = `// reviewed in pass ${i}`;
        repo.write(`src/area${i % 4}/unit${i}.ts`, lines.join("\n"));
      }
      return ["git", "diff"];
    },
  },
  {
    id: "git-diff-one-large-file",
    family: "git-diff",
    source: "one file rewritten across many hunks",
    build(repo) {
      repo.write("src/engine.ts", source("engine", 400));
      repo.commit("chore: initial import");
      const lines = source("engine", 400).split("\n").map((l, i) => (i % 9 === 0 ? l.replace("input *", "input / 2 *") : l));
      repo.write("src/engine.ts", lines.join("\n"));
      return ["git", "diff"];
    },
  },
  {
    id: "git-log-oneline-200",
    family: "git-log",
    source: "200 commits listed one per line",
    build(repo) {
      for (let i = 0; i < 200; i++) {
        repo.write(`src/c${i % 10}.ts`, source(`c${i % 10}`, 3, i));
        repo.commit(`${SUBJECTS[i % SUBJECTS.length]} (#${1000 + i})`);
      }
      return ["git", "log", "--oneline"];
    },
  },
  {
    id: "git-log-stat-30",
    family: "git-log",
    source: "30 commits with their file stats",
    build(repo) {
      for (let i = 0; i < 30; i++) {
        repo.write(`src/c${i % 7}.ts`, source(`c${i % 7}`, 8, i));
        repo.write(`tests/c${i % 5}.test.ts`, source(`t${i % 5}`, 4, i));
        repo.commit(`${SUBJECTS[i % SUBJECTS.length]} (#${2000 + i})\n\nWhy: case ${i} needed it.`);
      }
      return ["git", "log", "--stat"];
    },
  },
  {
    id: "pytest-many-failures",
    family: "pytest",
    source: "200 tests over 20 modules, 19 failing on assertions, each with its traceback",
    build(repo) {
      repo.write("pytest.ini", "[pytest]\npythonpath = .\n");
      repo.write("calc.py", "def compute(n):\n    return n * 3 + (1 if n % 11 == 0 else 0)\n");
      for (let m = 0; m < 20; m++) {
        const tests = Array.from({ length: 10 }, (_, i) => `def test_compute_${m}_${i}():\n    n = ${m * 10 + i}\n    assert compute(n) == n * 3, f"compute({n}) drifted"\n`);
        repo.write(`tests/test_mod${m}.py`, `from calc import compute\n\n\n${tests.join("\n\n")}`);
      }
      return ["pytest", "-p", "no:cacheprovider", "--rootdir=."];
    },
  },
  {
    id: "pytest-collection-error",
    family: "pytest",
    source: "150 passing tests printed verbosely, and one module that fails to import",
    build(repo) {
      repo.write("pytest.ini", "[pytest]\npythonpath = .\n");
      repo.write("calc.py", "def compute(n):\n    return n * 3\n");
      for (let m = 0; m < 15; m++) {
        const tests = Array.from({ length: 10 }, (_, i) => `def test_compute_${m}_${i}():\n    assert compute(${i}) == ${i * 3}\n`);
        repo.write(`tests/test_mod${m}.py`, `from calc import compute\n\n\n${tests.join("\n\n")}`);
      }
      repo.write("tests/test_billing.py", "from billing.invoices import render_invoice\n\n\ndef test_render():\n    assert render_invoice(1)\n");
      return ["pytest", "-v", "-p", "no:cacheprovider", "--rootdir=.", "--continue-on-collection-errors"];
    },
  },
  {
    id: "cargo-test-failures",
    family: "cargo-test",
    source: "a crate with 80 unit tests, 5 failing on assert_eq with their panic messages",
    build(repo) {
      repo.write("Cargo.toml", '[package]\nname = "quality_case"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n');
      const tests = Array.from({ length: 80 }, (_, i) =>
        `    #[test]\n    fn scales_input_${i}() {\n        assert_eq!(scale(${i}), ${i % 16 === 7 ? i * 2 + 1 : i * 2}, "scale({}) is off", ${i});\n    }`);
      repo.write("src/lib.rs", `pub fn scale(n: u32) -> u32 {\n    n * 2\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n${tests.join("\n\n")}\n}\n`);
      // One thread: parallel tests finish, and print, in a different order each run.
      return ["cargo", "test", "--offline", "--", "--test-threads=1"];
    },
  },
  {
    id: "black-check-would-reformat",
    family: "format",
    source: "`black --check` over 120 modules, 45 of which need reformatting, exiting 1",
    build(repo) {
      for (let i = 0; i < 120; i++) {
        const body = i % 8 < 3 ? `def handler_${i}( a,b ):\n  return {'a':a,'b':b}\n` : `def handler_${i}(a, b):\n    return {"a": a, "b": b}\n`;
        repo.write(`app/handlers/h${i}.py`, body);
      }
      // One worker: black reports files as its workers finish them.
      return ["black", "--check", "--workers", "1", "app"];
    },
  },
  {
    id: "ruff-check-violations",
    family: "lint",
    source: "`ruff check` over 30 modules with unused imports and undefined names",
    build(repo) {
      for (let i = 0; i < 30; i++) {
        repo.write(`svc/mod${i}.py`, `import os\nimport json\n\n\ndef load_${i}(path):\n    return json.loads(open(path).read()) if path else fallback_${i}\n`);
      }
      return ["ruff", "check", "--no-cache", "svc"];
    },
  },
  {
    id: "python-crash-after-logs",
    family: "crash",
    source: "a script that logs 300 lines, then dies with a KeyError 12 frames deep",
    build(repo) {
      const frames = Array.from({ length: 12 }, (_, i) =>
        i === 11 ? `def step_${i}(record):\n    return record["user_id"]\n` : `def step_${i}(record):\n    return step_${i + 1}(record)\n`);
      repo.write("job.py", `import sys\n\n${frames.join("\n\n")}\n\nfor n in range(300):\n    print(f"INFO batch {n}: processed {n * 17 % 97} records", flush=True)\nstep_0({"name": "ada"})\n`);
      return ["python3", "job.py"];
    },
  },
  {
    id: "grep-todo-many-files",
    family: "grep",
    source: "`grep -rn` for TODO across 60 files, 219 matching lines",
    build(repo) {
      for (let f = 0; f < 60; f++) {
        const lines = Array.from({ length: 40 }, (_, i) => ((i * 7 + f) % 11 === 0 ? `    // TODO(${f}-${i}): handle the retry budget here` : `    const v${i} = compute(${f}, ${i});`));
        repo.write(`src/area${f % 6}/file${f}.ts`, `export function run${f}() {\n${lines.join("\n")}\n}\n`);
      }
      return ["grep", "-rn", "TODO", "src"];
    },
  },
];

const versionOf = (tool: string) => spawnSync(tool, ["--version"], { encoding: "utf8" }).stdout.split("\n")[0].trim();

function capture(s: Scenario): Case {
  const repo = new Repo();
  try {
    const argv = s.build(repo);
    const r = argv[0] === "git" ? repo.git(...argv.slice(1)) : repo.run(argv);
    return { id: s.id, family: s.family, command: argv.join(" "), source: `scripted: ${s.source}`, version: versionOf(argv[0]), stdout: r.stdout, stderr: r.stderr };
  } finally {
    repo.remove();
  }
}

if (import.meta.main) {
  mkdirSync(CORPUS, { recursive: true });
  for (const s of SCENARIOS) {
    const c = capture(s);
    writeFileSync(join(CORPUS, `${c.id}.json`), JSON.stringify(c, null, 2) + "\n");
    console.log(`${c.id}: ${Buffer.byteLength(c.stdout + c.stderr, "utf8")} B`);
  }
}
