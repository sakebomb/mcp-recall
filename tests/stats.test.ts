import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initSchema, storeOutput, type StoreInput } from "../src/db/index";
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

/** A store file on disk holding the given rows; closed, so the report opens it itself. */
function storeWith(name: string, rows: Partial<StoreInput>[]): string {
  const file = join(dir, name);
  const db = new Database(file);
  initSchema(db);
  for (const r of rows) storeOutput(db, input(r));
  db.close();
  return file;
}

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
    const m = mergeStats([a, b, { ...a, items: 0, original_bytes: 0, delivered_bytes: 0, tools: [], stores: 0, unreadable: 1 }]);

    expect(m).toMatchObject({ items: 3, original_bytes: 3500, stores: 2, unreadable: 1 });
    expect(m.tools.map((t) => [t.tool_name, t.items, t.original_bytes])).toEqual([
      ["Bash", 2, 3000],
      ["mcp__x__y", 1, 500],
    ]);
  });
});

describe("formatStats", () => {
  const empty: StatsReport = { items: 0, original_bytes: 0, delivered_bytes: 0, tools: [], stores: 1, unreadable: 0 };

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
    expect(out).toContain("too small to summarize is never stored");
  });

  it("folds tools past the row cap into one line", () => {
    const rows = Array.from({ length: MAX_TOOL_ROWS + 2 }, (_, i) => ({ tool_name: `mcp__t${i}__x`, original_size: 1000 + i }));
    const out = formatStats(readStatsStore(storeWith("a.db", rows)), true);

    expect(out).toContain("… 2 more tools with less output");
    expect(out).not.toContain("mcp__t0__x"); // the smallest are the ones folded
    expect(out).toContain(`mcp__t${MAX_TOOL_ROWS + 1}__x`);
  });

  it("says how many stores were left out", () => {
    expect(formatStats({ ...empty, unreadable: 2 }, true)).toContain("2 stores could not be read");
  });
});
