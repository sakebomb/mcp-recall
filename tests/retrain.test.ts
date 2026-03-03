import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb, storeOutput, type StoreInput } from "../src/db/index";
import {
  detectItemsPath,
  collectFieldPaths,
  scoreFields,
  applyRetrainToToml,
  retrainProfile,
} from "../src/learn/retrain";
import type { LoadedProfile } from "../src/profiles/types";
import type { Database } from "bun:sqlite";

const PROJECT_KEY = "retrain_test_key";

function makeStoredOutput(db: Database, toolName: string, fullContent: string) {
  const input: StoreInput = {
    project_key: PROJECT_KEY,
    session_id: "sess-retrain",
    tool_name: toolName,
    summary: "retrain test summary",
    full_content: fullContent,
    original_size: fullContent.length,
  };
  return storeOutput(db, input);
}

function makeProfile(overrides: Partial<LoadedProfile> = {}): LoadedProfile {
  return {
    spec: {
      profile: {
        id: "mcp__test",
        version: "1.0.0",
        description: "test profile",
        mcp_pattern: "mcp__test__*",
      },
      strategy: {
        type: "json_extract",
        items_path: ["items"],
        fields: ["id", "name"],
      },
    },
    tier: "user",
    patterns: ["mcp__test__*"],
    filePath: "/tmp/test_profile.toml",
    ...overrides,
  };
}

// ── detectItemsPath ────────────────────────────────────────────────────────────

describe("detectItemsPath", () => {
  it("returns path '' when root is an array", () => {
    const result = detectItemsPath([{ id: 1 }, { id: 2 }]);
    expect(result).not.toBeNull();
    expect(result!.path).toBe("");
    expect(result!.items).toHaveLength(2);
  });

  it("finds a depth-0 array by key name", () => {
    const result = detectItemsPath({ issues: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(result!.path).toBe("issues");
    expect(result!.items).toHaveLength(3);
  });

  it("finds a depth-1 array (a.b)", () => {
    const result = detectItemsPath({ data: { nodes: [{ id: 1 }, { id: 2 }] } });
    expect(result!.path).toBe("data.nodes");
    expect(result!.items).toHaveLength(2);
  });

  it("picks the largest array when multiple exist", () => {
    const result = detectItemsPath({
      small: [1],
      large: [1, 2, 3, 4, 5],
    });
    expect(result!.path).toBe("large");
    expect(result!.items).toHaveLength(5);
  });

  it("returns null when no array is found", () => {
    expect(detectItemsPath({ key: "value", nested: { x: 1 } })).toBeNull();
    expect(detectItemsPath("string")).toBeNull();
    expect(detectItemsPath(null)).toBeNull();
  });
});

// ── collectFieldPaths ─────────────────────────────────────────────────────────

describe("collectFieldPaths", () => {
  it("collects top-level scalar fields", () => {
    const items = [{ id: "1", name: "foo" }, { id: "2", name: "bar" }];
    const result = collectFieldPaths(items, 3);
    expect(result.get("id")).toBe(2);
    expect(result.get("name")).toBe(2);
  });

  it("collects nested fields up to maxDepth", () => {
    const items = [{ a: { b: { c: "deep", d: { e: "tooDeep" } } } }];
    // maxDepth=3 → a, a.b, a.b.c collected; a.b.d and a.b.d.e NOT collected
    const result = collectFieldPaths(items, 3);
    expect(result.has("a.b.c")).toBe(true);
    expect(result.has("a.b.d.e")).toBe(false);
  });

  it("respects maxDepth=2 (a.b only)", () => {
    const items = [{ top: { mid: { leaf: "val" } } }];
    const result = collectFieldPaths(items, 2);
    expect(result.has("top.mid.leaf")).toBe(false);
    // "top" is depth-0 — we traverse into it. "top.mid" is depth-1 — we traverse into it.
    // "top.mid.leaf" is at depth-2 which equals maxDepth, so we stop.
    // Actually let's verify: depth=0 → key "top" traversed (object), depth=1 → key "mid" traversed (object), depth=2 >= maxDepth → stop
    expect(result.size).toBe(0); // leaf is at depth 2 which is >= maxDepth=2
  });

  it("skips null, undefined, and empty strings", () => {
    const items = [{ id: "1", empty: "", nothing: null }];
    const result = collectFieldPaths(items, 3);
    expect(result.has("id")).toBe(true);
    expect(result.has("empty")).toBe(false);
    expect(result.has("nothing")).toBe(false);
  });

  it("skips array values (does not recurse into arrays)", () => {
    const items = [{ tags: ["a", "b", "c"], name: "foo" }];
    const result = collectFieldPaths(items, 3);
    expect(result.has("name")).toBe(true);
    expect(result.has("tags")).toBe(false);
    expect(result.has("tags.0")).toBe(false);
  });
});

// ── scoreFields ───────────────────────────────────────────────────────────────

describe("scoreFields", () => {
  it("filters out fields below 50% frequency", () => {
    const pathMap = new Map([["common", 9], ["rare", 1]]);
    const result = scoreFields(pathMap, 10);
    expect(result.some((r) => r.path === "common")).toBe(true);
    expect(result.some((r) => r.path === "rare")).toBe(false);
  });

  it("returns exactly 50% as passing the threshold", () => {
    const pathMap = new Map([["exactly_half", 5]]);
    const result = scoreFields(pathMap, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.pct).toBe(0.5);
  });

  it("sorts by pct descending", () => {
    const pathMap = new Map([["mid", 7], ["top", 10], ["low", 6]]);
    const result = scoreFields(pathMap, 10);
    expect(result[0]!.path).toBe("top");
    expect(result[1]!.path).toBe("mid");
    expect(result[2]!.path).toBe("low");
  });

  it("returns empty array when totalItems is 0", () => {
    expect(scoreFields(new Map([["x", 3]]), 0)).toEqual([]);
  });
});

// ── applyRetrainToToml ────────────────────────────────────────────────────────

describe("applyRetrainToToml", () => {
  const baseToml = [
    `[profile]`,
    `id          = "mcp__test"`,
    `version     = "1.0.0"`,
    `description = "test"`,
    `mcp_pattern = "mcp__test__*"`,
    ``,
    `[strategy]`,
    `type       = "json_extract"`,
    `items_path = ["items"]`,
    `fields     = [`,
    `  "id",`,
    `  "name",`,
    `]`,
  ].join("\n") + "\n";

  it("adds new fields to the fields array", () => {
    const result = applyRetrainToToml(baseToml, ["status", "created_at"], "2026-03-04");
    expect(result).toContain(`"status",`);
    expect(result).toContain(`"created_at",`);
    // Existing fields still present
    expect(result).toContain(`"id",`);
    expect(result).toContain(`"name",`);
  });

  it("bumps the patch version", () => {
    const result = applyRetrainToToml(baseToml, ["status"], "2026-03-04");
    expect(result).toContain(`"1.0.1"`);
    expect(result).not.toContain(`"1.0.0"`);
  });

  it("prepends a retrain date comment", () => {
    const result = applyRetrainToToml(baseToml, ["status"], "2026-03-04");
    expect(result).toContain("# Retrained: 2026-03-04");
  });

  it("is a no-op on fields when newFields is empty", () => {
    const result = applyRetrainToToml(baseToml, [], "2026-03-04");
    // Version still bumps (retrain happened, even if no new fields)
    const fieldCount = (result.match(/^\s*"[^"]+",/gm) ?? []).length;
    expect(fieldCount).toBe(2); // "id" and "name" only
  });
});

// ── retrainProfile ────────────────────────────────────────────────────────────

describe("retrainProfile", () => {
  let db: Database;

  beforeEach(() => {
    process.env.RECALL_DB_PATH = ":memory:";
    db = getDb(":memory:");
  });

  afterEach(() => {
    delete process.env.RECALL_DB_PATH;
  });

  const jiraItem = {
    key: "PROJ-1",
    fields: {
      summary: "Fix login bug",
      status: { name: "In Progress" },
      assignee: { displayName: "Jane Doe" },
      created: "2026-01-01",
    },
  };

  it("returns no fields when samples is empty", () => {
    const result = retrainProfile([], makeProfile(), 3);
    expect(result.fields).toEqual([]);
    expect(result.newFields).toEqual([]);
    expect(result.sampleCount).toBe(0);
  });

  it("returns error when strategy is not json_extract", () => {
    const profile = makeProfile({
      spec: {
        profile: { id: "mcp__test", version: "1.0.0", description: "", mcp_pattern: "mcp__test__*" },
        strategy: { type: "json_truncate" },
      },
    });
    const stored = makeStoredOutput(db, "mcp__test__op", JSON.stringify({ issues: [jiraItem] }));
    const result = retrainProfile([stored], profile, 3);
    expect(result.strategyType).toBe("json_truncate");
    expect(result.fields).toEqual([]);
  });

  it("detects items_path from stored content", () => {
    const content = JSON.stringify({ issues: [jiraItem, jiraItem, jiraItem] });
    const stored = makeStoredOutput(db, "mcp__jira__search", content);
    const result = retrainProfile([stored], makeProfile(), 3);
    expect(result.detectedItemsPath).toBe("issues");
  });

  it("finds new fields not currently in the profile", () => {
    // Profile has only "id" and "name"; Jira items have "key", "fields.summary", etc.
    const content = JSON.stringify({ items: [jiraItem, jiraItem, jiraItem] });
    const stored = makeStoredOutput(db, "mcp__test__list", content);
    const result = retrainProfile([stored], makeProfile(), 3);
    // "key" and "fields.summary" should be NEW (not in profile's ["id","name"])
    expect(result.newFields).toContain("key");
    expect(result.newFields).toContain("fields.summary");
  });

  it("marks fields already in profile as inProfile=true", () => {
    const itemWithIdAndName = { id: "1", name: "foo", extra: "bar" };
    const content = JSON.stringify({ items: [itemWithIdAndName, itemWithIdAndName] });
    const stored = makeStoredOutput(db, "mcp__test__list", content);
    const result = retrainProfile([stored], makeProfile(), 3);
    const idField = result.fields.find((f) => f.path === "id");
    const nameField = result.fields.find((f) => f.path === "name");
    const extraField = result.fields.find((f) => f.path === "extra");
    expect(idField?.inProfile).toBe(true);
    expect(nameField?.inProfile).toBe(true);
    expect(extraField?.inProfile).toBe(false);
  });

  it("respects maxDepth when collecting fields", () => {
    const deepItem = { a: { b: { c: { d: "too deep" }, shallow: "ok" } } };
    const content = JSON.stringify({ items: [deepItem, deepItem] });
    const stored = makeStoredOutput(db, "mcp__test__list", content);
    const result = retrainProfile([stored], makeProfile(), 3);
    // a.b.shallow is at depth 3 (a=1, b=2, shallow=3) — should be found
    expect(result.fields.some((f) => f.path === "a.b.shallow")).toBe(true);
    // a.b.c.d is at depth 4 — should NOT be found with maxDepth=3
    expect(result.fields.some((f) => f.path === "a.b.c.d")).toBe(false);
  });
});
