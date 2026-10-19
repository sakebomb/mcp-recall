import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  initSchema,
  storeOutput,
  recordAccess,
  getFallbackRoutes,
  getHandlerBreakdown,
  countUnrecordedHandler,
  type StoreInput,
} from "../src/db/index";
import { readStore, mergeReports, formatReport, parseSince } from "../src/discover/index";

const KEY = "discovertest123";

function input(overrides: Partial<StoreInput> = {}): StoreInput {
  return {
    project_key: KEY,
    session_id: "s1",
    tool_name: "Bash",
    summary: "s".repeat(100),
    full_content: "body",
    original_size: 1000,
    ...overrides,
  };
}

function freshDb(path = ":memory:"): Database {
  const db = new Database(path);
  initSchema(db);
  return db;
}

describe("handler column migration (#341)", () => {
  it("adds the column to a store that predates it, leaving existing rows NULL", () => {
    const db = freshDb();
    db.run("ALTER TABLE stored_outputs DROP COLUMN handler");
    const old = storeOutputWithoutHandler(db);
    initSchema(db);
    const row = db.prepare("SELECT handler FROM stored_outputs WHERE id = ?").get(old) as { handler: string | null };
    expect(row.handler).toBeNull();
  });

  it("is idempotent", () => {
    const db = freshDb();
    initSchema(db);
    initSchema(db);
    const cols = (db.prepare("PRAGMA table_info(stored_outputs)").all() as Array<{ name: string }>)
      .filter((c) => c.name === "handler");
    expect(cols).toHaveLength(1);
  });
});

/** Inserts a row into a store whose schema has no handler column. */
function storeOutputWithoutHandler(db: Database): string {
  db.run(
    `INSERT INTO stored_outputs (id, project_key, session_id, tool_name, summary, full_content,
       original_size, summary_size, created_at) VALUES ('recall_old', ?, 's0', 'Bash', 'x', 'y', 500, 1, 1)`,
    [KEY]
  );
  return "recall_old";
}

describe("getFallbackRoutes", () => {
  let db: Database;
  beforeEach(() => {
    db = freshDb();
  });

  it("ranks fallback-routed tools and command families by original bytes", () => {
    storeOutput(db, input({ handler: "shellHandler", command_fp: "ssh", original_size: 9000 }));
    storeOutput(db, input({ handler: "shellHandler", command_fp: "ssh", original_size: 1000 }));
    storeOutput(db, input({ handler: "shellHandler", command_fp: "pct", original_size: 4000 }));
    storeOutput(db, input({ tool_name: "mcp__x__get", handler: "jsonHandler", original_size: 6000 }));
    const routes = getFallbackRoutes(db, KEY);
    expect(routes.map((r) => [r.tool_name, r.command_fp, r.handler, r.items, r.original_bytes])).toEqual([
      ["Bash", "ssh", "shellHandler", 2, 10000],
      ["mcp__x__get", null, "jsonHandler", 1, 6000],
      ["Bash", "pct", "shellHandler", 1, 4000],
    ]);
  });

  it("leaves out dedicated handlers, notes, and rows with no recorded handler", () => {
    storeOutput(db, input({ handler: "gitDiffHandler", command_fp: "git diff", original_size: 50000 }));
    storeOutput(db, input({ tool_name: "recall__note", handler: "genericHandler", original_size: 50000 }));
    storeOutput(db, input({ handler: null, command_fp: "ssh", original_size: 50000 }));
    storeOutput(db, input({ handler: "genericHandler", command_fp: "cat", original_size: 10 }));
    expect(getFallbackRoutes(db, KEY).map((r) => r.command_fp)).toEqual(["cat"]);
  });

  it("counts an item retrieved once as retrieved, and only those", () => {
    const a = storeOutput(db, input({ handler: "shellHandler", command_fp: "ssh" }));
    storeOutput(db, input({ handler: "shellHandler", command_fp: "ssh" }));
    recordAccess(db, a.id);
    recordAccess(db, a.id);
    const [route] = getFallbackRoutes(db, KEY);
    expect(route.items).toBe(2);
    expect(route.retrieved).toBe(1);
  });

  it("labels an untagged Bash row unknown", () => {
    storeOutput(db, input({ handler: "shellHandler", command_fp: null }));
    expect(getFallbackRoutes(db, KEY)[0].command_fp).toBe("unknown");
  });

  it("filters by since", () => {
    storeOutput(db, input({ handler: "shellHandler", command_fp: "ssh" }));
    db.run("UPDATE stored_outputs SET created_at = 100");
    storeOutput(db, input({ handler: "shellHandler", command_fp: "pct" }));
    expect(getFallbackRoutes(db, KEY, { since: 1000 }).map((r) => r.command_fp)).toEqual(["pct"]);
  });
});

describe("getHandlerBreakdown / countUnrecordedHandler", () => {
  it("groups by handler and counts NULL-handler rows apart, never as a handler", () => {
    const db = freshDb();
    storeOutput(db, input({ handler: "gitDiffHandler", original_size: 3000 }));
    storeOutput(db, input({ handler: "shellHandler", original_size: 2000 }));
    storeOutput(db, input({ handler: null }));
    storeOutput(db, input({ tool_name: "recall__note", handler: null }));
    expect(getHandlerBreakdown(db, KEY).map((r) => r.handler)).toEqual(["gitDiffHandler", "shellHandler"]);
    expect(countUnrecordedHandler(db, KEY)).toBe(1); // the note is not intercepted output
  });
});

describe("readStore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recall-discover-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads a store that predates the column without migrating it", () => {
    const file = join(dir, "old.db");
    const db = freshDb(file);
    db.run("ALTER TABLE stored_outputs DROP COLUMN handler");
    storeOutputWithoutHandler(db);
    db.close();

    const report = readStore(file);
    expect(report).toMatchObject({ routes: [], handlers: [], unrecorded: 1, stores: 1 });

    const after = new Database(file, { readonly: true });
    const cols = (after.prepare("PRAGMA table_info(stored_outputs)").all() as Array<{ name: string }>).map((c) => c.name);
    after.close();
    expect(cols).not.toContain("handler");
  });

  it("covers every project key a store holds", () => {
    const file = join(dir, "multi.db");
    const db = freshDb(file);
    storeOutput(db, input({ handler: "shellHandler", command_fp: "ssh" }));
    storeOutput(db, input({ project_key: "otherproject456", handler: "shellHandler", command_fp: "ssh" }));
    db.close();
    expect(readStore(file).routes[0].items).toBe(2);
  });

  it("returns an empty report for a file that is not a store", () => {
    const file = join(dir, "junk.db");
    new Database(file).close();
    expect(readStore(file)).toMatchObject({ routes: [], unrecorded: 0, stores: 0 });
  });
});

describe("mergeReports", () => {
  it("sums matching routes and handlers across stores", () => {
    const route = {
      tool_name: "Bash", command_fp: "ssh", handler: "shellHandler",
      items: 1, original_bytes: 100, summary_bytes: 10, retrieved: 1,
    };
    const merged = mergeReports([
      { routes: [route], handlers: [route], unrecorded: 2, stores: 1 },
      { routes: [{ ...route, original_bytes: 300 }], handlers: [], unrecorded: 3, stores: 1 },
    ]);
    expect(merged.routes).toEqual([{ ...route, items: 2, original_bytes: 400, summary_bytes: 20, retrieved: 2 }]);
    expect(merged.unrecorded).toBe(5);
    expect(merged.stores).toBe(2);
  });
});

describe("formatReport", () => {
  const route = {
    tool_name: "Bash", command_fp: "ssh", handler: "shellHandler",
    items: 4, original_bytes: 10240, summary_bytes: 2048, retrieved: 1,
  };

  it("shows each route with its reduction and retrieval rate", () => {
    const out = formatReport({ routes: [route], handlers: [route], unrecorded: 0, stores: 1 });
    expect(out).toMatch(/Bash: ssh\s+shellHandler\s+4\s+10\.0KB\s+2\.0KB\s+80%\s+25%/);
    expect(out).not.toContain("stored before handlers were recorded");
  });

  it("says so when nothing is recorded, and counts the older rows", () => {
    const out = formatReport({ routes: [], handlers: [], unrecorded: 7, stores: 1 });
    expect(out).toContain("none recorded");
    expect(out).toContain("7 items stored before handlers were recorded");
  });

  it("caps the list at the limit and says how many are hidden", () => {
    const routes = [1, 2, 3].map((i) => ({ ...route, command_fp: `cmd${i}` }));
    const out = formatReport({ routes, handlers: [], unrecorded: 0, stores: 1 }, 2);
    expect(out).toContain("cmd2");
    expect(out).not.toContain("cmd3");
    expect(out).toContain("1 more");
  });
});

describe("parseSince", () => {
  it("parses a date to local midnight", () => {
    expect(parseSince("2026-10-19")).toBe(Math.floor(new Date(2026, 9, 19).getTime() / 1000));
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseSince("")).toBeNull();
    expect(parseSince("2026-10")).toBeNull();
    expect(parseSince("2026-02-30")).toBeNull();
  });
});
