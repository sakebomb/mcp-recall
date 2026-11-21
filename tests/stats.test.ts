import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initSchema, storeOutput, recordCall, forgetOutputs, type StoreInput, type CallRecord } from "../src/db/index";
import { readStatsStore, mergeStats, formatStats, MAX_TOOL_ROWS, type StatsReport } from "../src/stats/index";

function input(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: "statsA",
    session_id: "s1",
    tool_name: "Bash",
    summary: "s".repeat(100),
    full_content: "body",
    original_size: 1000,
    ...overrides,
  };
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "recall-stats-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    project_key: "statsA", tool_name: "Bash", command_fp: "git log",
    outcome: "too_small", original_bytes: 100, delivered_bytes: 100, ...overrides,
  };
}

/** A store file on disk holding the given rows and calls; closed, so the report opens it itself. */
function storeWith(name: string, rows: Partial<StoreInput>[], calls: Partial<CallRecord>[] = []): string {
  const file = join(dir, name);
  const db = new Database(file);
  initSchema(db);
  for (const r of rows) storeOutput(db, input(r));
  for (const c of calls) recordCall(db, call(c));
  db.close();
  return file;
}

describe("call counts (#495 part 2)", () => {
  it("adds repeat calls of the same tool, command and outcome into one row", () => {
    const r = readStatsStore(storeWith("a.db", [], [
      { outcome: "too_small", original_bytes: 100, delivered_bytes: 100 },
      { outcome: "too_small", original_bytes: 300, delivered_bytes: 300 },
      { outcome: "summarized", original_bytes: 9000, delivered_bytes: 900 },
      { outcome: "content_read", command_fp: "cat", original_bytes: 50, delivered_bytes: 50 },
    ]), "statsA");

    expect(r.calls.map((c) => [c.tool_name, c.command_fp, c.calls])).toEqual([
      ["Bash", "git log", { summarized: 1, cached: 0, too_small: 2, content_read: 0 }],
      ["Bash", "cat", { summarized: 0, cached: 0, too_small: 0, content_read: 1 }],
    ]);
    expect(r.calls[0].original_bytes - r.calls[0].delivered_bytes).toBe(8100);
    expect(r.callsSince).toBe(new Date().toISOString().slice(0, 10));
  });

  it("reports a project whose every call passed through, which has no stored rows", () => {
    const file = storeWith("a.db", [{ project_key: "statsA" }], [{ project_key: "onlyPassed" }]);
    expect(readStatsStore(file, "onlyPassed").calls).toHaveLength(1);
    expect(readStatsStore(file).calls).toHaveLength(1); // --all reaches it through the key union
  });

  it("keeps a store with no counters yet readable, and says so", () => {
    const file = storeWith("a.db", [{ original_size: 1000 }]);
    const db = new Database(file);
    db.run("DROP TABLE call_counts");
    db.close();
    const r = readStatsStore(file, "statsA");

    expect(r).toMatchObject({ items: 1, unreadable: 0, uncounted: 1, calls: [] });
    expect(formatStats(r, false)).toContain("Calls are not counted yet");
  });

  it("forget all clears the project's counters and no other project's", () => {
    const file = storeWith("a.db", [], [{ project_key: "statsA" }, { project_key: "statsB" }]);
    const db = new Database(file);
    forgetOutputs(db, "statsA", { all: true });
    const left = db.prepare("SELECT project_key FROM call_counts").all();
    db.close();
    expect(left).toEqual([{ project_key: "statsB" }]);
  });

  it("explains a project where every call passed through instead of saying nothing happened", () => {
    const r = readStatsStore(storeWith("a.db", [], [
      { outcome: "too_small" }, { outcome: "too_small" }, { outcome: "content_read", command_fp: "cat" },
    ]), "statsA");
    const out = formatStats(r, false);

    expect(out).toMatch(/Calls seen since \d{4}-\d{2}-\d{2}: 3/);
    expect(out).toMatch(/too small\s+2\s+passed through: a summary would not have saved a quarter/);
    expect(out).toMatch(/short reads\s+1\s+passed through whole/);
    expect(out).toContain("Bash: git log");
    expect(out).not.toContain("Nothing summarized yet");
    expect(out).not.toContain("In the store now:");
  });
});

describe("readStatsStore", () => {
  it("sums every project key in a store and breaks it down by tool", () => {
    const file = storeWith("a.db", [
      { tool_name: "Bash", original_size: 1000 },
      { tool_name: "Bash", original_size: 3000 },
      { tool_name: "mcp__github__list_issues", original_size: 5000, project_key: "statsB" },
    ]);
    const r = readStatsStore(file);

    expect(r.items).toBe(3);
    expect(r.original_bytes).toBe(9000);
    expect(r.delivered_bytes).toBe(300);
    expect(r.stores).toBe(1);
    expect(r.tools.map((t) => [t.tool_name, t.items, t.original_bytes])).toEqual([
      ["mcp__github__list_issues", 1, 5000],
      ["Bash", 2, 4000],
    ]);
  });

  it("counts only the given project key, as recall__stats does", () => {
    const file = storeWith("shared.db", [
      { tool_name: "Bash", original_size: 1000, project_key: "statsA" },
      { tool_name: "Bash", original_size: 7000, project_key: "statsB" },
    ]);
    const r = readStatsStore(file, "statsA");

    expect(r.items).toBe(1);
    expect(r.original_bytes).toBe(1000);
    expect(r.tools.map((t) => [t.tool_name, t.items])).toEqual([["Bash", 1]]);
  });

  it("leaves recall__note memory out of the totals and the tool list", () => {
    const file = storeWith("a.db", [
      { tool_name: "Bash", original_size: 1000 },
      { tool_name: "recall__note", original_size: 50_000 },
    ]);
    const r = readStatsStore(file);

    expect(r.items).toBe(1);
    expect(r.original_bytes).toBe(1000);
    expect(r.tools.map((t) => t.tool_name)).toEqual(["Bash"]);
  });

  it("counts a store it cannot read as unreadable instead of dropping it", () => {
    const garbage = join(dir, "garbage.db");
    writeFileSync(garbage, "not a sqlite file");
    expect(readStatsStore(garbage)).toMatchObject({ items: 0, stores: 0, unreadable: 1 });
  });

  it("counts a store from before delivered_size as unreadable", () => {
    const file = storeWith("old.db", [{ original_size: 1000 }]);
    const db = new Database(file);
    db.run("ALTER TABLE stored_outputs DROP COLUMN delivered_size");
    db.close();
    expect(readStatsStore(file)).toMatchObject({ items: 0, unreadable: 1 });
  });

  it("ignores a SQLite file that is not a recall store", () => {
    const file = join(dir, "other.db");
    const db = new Database(file);
    db.run("CREATE TABLE unrelated (x INTEGER)");
    db.close();
    expect(readStatsStore(file)).toMatchObject({ items: 0, stores: 0, unreadable: 0 });
  });
});

describe("mergeStats", () => {
  it("adds totals and folds rows for the same tool across stores", () => {
    const a = readStatsStore(storeWith("a.db", [{ tool_name: "Bash", original_size: 1000 }]));
    const b = readStatsStore(storeWith("b.db", [
      { tool_name: "Bash", original_size: 2000 },
      { tool_name: "mcp__x__y", original_size: 500 },
    ]));
    const m = mergeStats([a, b, { ...a, items: 0, original_bytes: 0, delivered_bytes: 0, tools: [], calls: [], stores: 0, unreadable: 1 }]);

    expect(m).toMatchObject({ items: 3, original_bytes: 3500, stores: 2, unreadable: 1 });
    expect(m.tools.map((t) => [t.tool_name, t.items, t.original_bytes])).toEqual([
      ["Bash", 2, 3000],
      ["mcp__x__y", 1, 500],
    ]);
  });
});

describe("formatStats", () => {
  const empty: StatsReport = {
    items: 0, original_bytes: 0, delivered_bytes: 0, tools: [],
    calls: [], callsSince: null, uncounted: 0, stores: 1, unreadable: 0,
  };

  it("explains an empty store instead of printing zeros", () => {
    const out = formatStats(empty, false);
    expect(out).toContain("Nothing summarized yet for this project.");
    expect(out).toContain("no warm-up");
    expect(out).toContain("#quick-start");
    expect(out).not.toContain("By tool");
  });

  it("reports totals, reduction and the per-tool table", () => {
    const r = mergeStats([readStatsStore(storeWith("a.db", [
      { tool_name: "Bash", original_size: 10_000, summary: "s".repeat(1000) },
    ]))]);
    const out = formatStats(r, false);

    expect(out).toMatch(/Outputs summarized:\s+1\n/);
    expect(out).toContain("90% smaller");
    expect(out).toMatch(/Bash\s+1\s+9\.8KB\s+1000B\s+90%/);
    expect(out).toContain("In the store now:");
    expect(out).toContain("the call counts keep every call");
  });

  it("folds tools past the row cap into one line", () => {
    const rows = Array.from({ length: MAX_TOOL_ROWS + 2 }, (_, i) => ({ tool_name: `mcp__t${i}__x`, original_size: 1000 + i }));
    const out = formatStats(readStatsStore(storeWith("a.db", rows)), true);

    expect(out).toContain("… 2 more tools with less output");
    expect(out).not.toContain("mcp__t0__x"); // the smallest are the ones folded
    expect(out).toContain(`mcp__t${MAX_TOOL_ROWS + 1}__x`);
  });

  it("says how many stores were left out, with the verb matching the count", () => {
    expect(formatStats({ ...empty, unreadable: 2 }, true)).toContain("2 stores could not be read");
    expect(formatStats({ ...empty, unreadable: 2 }, true)).toContain("are not included");
    expect(formatStats({ ...empty, unreadable: 1 }, true)).toContain("1 store could not be read");
    expect(formatStats({ ...empty, unreadable: 1 }, true)).toContain("is not included");
  });

  it("does not call an unreadable store normal right after install", () => {
    const out = formatStats({ ...empty, stores: 0, unreadable: 1 }, false);
    expect(out).toContain("this project's store could not be read");
    expect(out).not.toContain("normal right after install");
  });
});
