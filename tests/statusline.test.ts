import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  initSchema, recordCall, foldCallLog, callLogPath, localDay, type CallRecord,
} from "../src/db/index";
import { readDayTotals, formatStatusline, sessionDir, statuslineText, STDIN_TIMEOUT_MS } from "../src/stats/statusline";
import { getProjectKey } from "../src/project-key";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

// `mcp-recall statusline` prints one line for Claude Code's statusLine setting
// (#495): today's counted calls and the bytes kept out of context, for one
// project. It runs on every status refresh, so it must never write the store
// and never fail loudly.

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    project_key: "slA", tool_name: "Bash", command_fp: "git log",
    outcome: "summarized", original_bytes: 5000, delivered_bytes: 1000, ...overrides,
  };
}

let dir: string;
let file: string;
let db: Database;
const today = localDay();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recall-statusline-"));
  file = join(dir, "store.db");
  db = new Database(file);
  initSchema(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A logged call dated `day`, written the way recordCall appends one. */
function logOn(day: string, overrides: Partial<CallRecord> = {}): void {
  appendFileSync(callLogPath(file)!, JSON.stringify({ ...call(overrides), day }) + "\n");
}

describe("localDay", () => {
  it("is the local calendar date, not the UTC one", () => {
    // Pinned zones, so this fails on a UTC date wherever it runs (CI is UTC):
    // 23:30 in New York is already the next day in UTC, and 00:30 in Tokyo is
    // still the previous one.
    const tz = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      expect(localDay(new Date(2026, 2, 5, 23, 30))).toBe("2026-03-05");
      process.env.TZ = "Asia/Tokyo";
      expect(localDay(new Date(2026, 2, 5, 0, 30))).toBe("2026-03-05");
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("is the day recordCall files a call under", () => {
    recordCall(db, call());

    expect(readDayTotals(file, "slA", localDay())).toEqual({ calls: 1, saved_bytes: 4000 });
  });
});

describe("readDayTotals", () => {
  it("sums folded counts and calls still in the log", () => {
    recordCall(db, call());
    foldCallLog(db);
    recordCall(db, call({ outcome: "too_small", original_bytes: 300, delivered_bytes: 300 }));

    expect(readDayTotals(file, "slA", today)).toEqual({ calls: 2, saved_bytes: 4000 });
  });

  it("leaves out other days, folded or logged", () => {
    logOn("2020-01-01");
    foldCallLog(db);
    logOn("2020-01-02");
    recordCall(db, call());

    expect(readDayTotals(file, "slA", today)).toEqual({ calls: 1, saved_bytes: 4000 });
  });

  it("leaves out other projects in the same store", () => {
    recordCall(db, call({ project_key: "slB" }));
    foldCallLog(db);
    recordCall(db, call({ project_key: "slB" }));

    expect(readDayTotals(file, "slA", today)).toEqual({ calls: 0, saved_bytes: 0 });
  });

  it("is zero for a store that does not exist yet", () => {
    expect(readDayTotals(join(dir, "absent.db"), "slA", today)).toEqual({ calls: 0, saved_bytes: 0 });
  });

  it("is zero for a store from before call counts", () => {
    db.run("DROP TABLE call_counts");

    expect(readDayTotals(file, "slA", today)).toEqual({ calls: 0, saved_bytes: 0 });
  });

  it("is null for a file that is not a store", () => {
    const junk = join(dir, "junk.db");
    writeFileSync(junk, "not a sqlite file, long enough to be read as a header ".repeat(4));

    expect(readDayTotals(junk, "slA", today)).toBeNull();
  });

  it("does not write the store or fold its log", () => {
    recordCall(db, call());
    const before = db.prepare("SELECT COUNT(*) AS n FROM call_counts").get() as { n: number };

    readDayTotals(file, "slA", today);

    expect(db.prepare("SELECT COUNT(*) AS n FROM call_counts").get()).toEqual(before);
    expect(readDayTotals(file, "slA", today)).toEqual({ calls: 1, saved_bytes: 4000 });
  });
});

describe("formatStatusline", () => {
  it("reports bytes kept out and calls seen", () => {
    expect(formatStatusline({ calls: 31, saved_bytes: 2.4 * 1024 * 1024 })).toBe("recall: 2.4MB kept out today · 31 calls");
  });

  it("says one call in the singular", () => {
    expect(formatStatusline({ calls: 1, saved_bytes: 4000 })).toBe("recall: 3.9KB kept out today · 1 call");
  });

  it("says calls were seen when every one passed through", () => {
    expect(formatStatusline({ calls: 4, saved_bytes: 0 })).toBe("recall: 4 calls today, none large enough to summarize");
  });

  it("says no calls yet when none were seen", () => {
    expect(formatStatusline({ calls: 0, saved_bytes: 0 })).toBe("recall: no calls yet today");
  });

  it("is empty when the store could not be read", () => {
    expect(formatStatusline(null)).toBe("");
  });
});

describe("sessionDir", () => {
  it("takes the project directory Claude Code sends", () => {
    const raw = JSON.stringify({ cwd: "/a/sub", workspace: { current_dir: "/a/sub", project_dir: "/a" } });

    expect(sessionDir(raw, "/fallback")).toBe("/a");
  });

  it("falls back to the current directory, then cwd, when fields are missing", () => {
    expect(sessionDir(JSON.stringify({ cwd: "/c", workspace: { current_dir: "/b" } }), "/fallback")).toBe("/b");
    expect(sessionDir(JSON.stringify({ cwd: "/c" }), "/fallback")).toBe("/c");
  });

  it("falls back when stdin is empty, not JSON, or the wrong shape", () => {
    expect(sessionDir("", "/fallback")).toBe("/fallback");
    expect(sessionDir("{not json", "/fallback")).toBe("/fallback");
    expect(sessionDir(JSON.stringify({ workspace: { project_dir: 7 } }), "/fallback")).toBe("/fallback");
    expect(sessionDir("null", "/fallback")).toBe("/fallback");
  });
});

describe("statuslineText", () => {
  it("reads the store for the directory on stdin", () => {
    recordCall(db, call());

    const text = statuslineText(JSON.stringify({ workspace: { project_dir: dir } }), {
      storeFor: (cwd) => (cwd === dir ? { file, projectKey: "slA" } : { file: join(dir, "absent.db"), projectKey: "x" }),
    });

    expect(text).toBe("recall: 3.9KB kept out today · 1 call");
  });

  it("is empty, never a throw, when locating the store fails", () => {
    const text = statuslineText("{}", { storeFor: () => { throw new Error("no home directory"); } });

    expect(text).toBe("");
  });
});

describe("mcp-recall statusline", () => {
  /** Runs the real CLI as Claude Code does: session JSON on stdin, one store. */
  function run(stdin: string, store: string) {
    const proc = Bun.spawnSync([process.execPath, "run", CLI, "statusline"], {
      stdin: Buffer.from(stdin),
      env: { ...process.env, RECALL_DB_PATH: store },
    });
    return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
  }

  it("prints the line for the store's project and exits 0", () => {
    recordCall(db, call({ project_key: getProjectKey(dir) }));

    const { code, out } = run(JSON.stringify({ workspace: { project_dir: dir } }), file);

    expect(out).toBe("recall: 3.9KB kept out today · 1 call\n");
    expect(code).toBe(0);
  });

  it("prints nothing and still exits 0 when the store cannot be read", () => {
    const junk = join(dir, "junk.db");
    writeFileSync(junk, "not a sqlite file, long enough to be read as a header ".repeat(4));

    const { code, out, err } = run("not json", junk);

    expect(out).toBe("");
    expect(err).toBe("");
    expect(code).toBe(0);
  });

  it("exits 0 without a stack when stdin cannot be read", () => {
    // A directory as stdin: the read fails with EISDIR.
    const proc = Bun.spawnSync(["sh", "-c", 'exec "$0" run "$1" statusline < "$2"', process.execPath, CLI, dir], {
      env: { ...process.env, RECALL_DB_PATH: file },
    });

    expect(proc.stderr.toString()).toBe("");
    expect(proc.stdout.toString()).toBe("recall: no calls yet today\n");
    expect(proc.exitCode).toBe(0);
  });

  it("does not wait on a stdin that never closes", async () => {
    const proc = Bun.spawn([process.execPath, "run", CLI, "statusline"], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, RECALL_DB_PATH: file },
    });
    const hung = setTimeout(() => proc.kill(), 3 * STDIN_TIMEOUT_MS);
    try {
      // The pipe stays open: nothing is written and it is never ended.
      expect(await proc.exited).toBe(0);
      expect(await new Response(proc.stdout).text()).toBe("recall: no calls yet today\n");
    } finally {
      clearTimeout(hung);
      proc.stdin.end();
    }
  }, 10_000);
});
