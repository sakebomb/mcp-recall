import { describe, expect, it } from "bun:test";
import { loadCorpus } from "../scripts/quality";
import { facts } from "../scripts/quality-facts";
import { deliveredText } from "../scripts/quality-mcp";

describe("deliveredText", () => {
  it("is the structured content as compact JSON when a result has it, not the text beside it", () => {
    const result = { content: [{ type: "text", text: "## Operation 1\n| Type | Path |" }], structuredContent: { results: [{ index: 0, status: "success" }] } };
    expect(deliveredText(result)).toBe('{"results":[{"index":0,"status":"success"}]}');
  });

  it("joins the text blocks of a result with no structured content, dropping others", () => {
    const result = { content: [{ type: "text", text: "# repo" }, { type: "image", data: "AAAA" }, { type: "text", text: "details" }] };
    expect(deliveredText(result)).toBe("# repo\ndetails");
  });
});

describe("the MCP cases", () => {
  const cases = loadCorpus().filter((c) => c.tool);

  it("each name an MCP tool and hold compact JSON with facts", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.tool).toMatch(/^mcp__\w+__\w+$/);
      expect(JSON.stringify(JSON.parse(c.stdout))).toBe(c.stdout);
      expect(facts(c.family, c.stdout).length).toBeGreaterThan(0);
    }
  });
});
