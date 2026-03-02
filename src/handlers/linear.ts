/**
 * Linear handler — extracts identifier, title, state, priority, description
 * excerpt, and URL from Linear issue responses. Handles single objects,
 * arrays, GraphQL, and Relay connection shapes.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

type JsonObject = Record<string, unknown>;

const PRIORITY_LABEL: Record<number, string> = {
  0: "No Priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

const DESC_CHARS = 200;
const MAX_LIST_ITEMS = 10;

function priorityLabel(priority: unknown): string | null {
  if (typeof priority === "number" && priority in PRIORITY_LABEL) {
    return PRIORITY_LABEL[priority]!;
  }
  if (typeof priority === "string" && priority.length > 0) return priority;
  return null;
}

function stateLabel(state: unknown): string | null {
  if (typeof state === "object" && state !== null) {
    const name = (state as JsonObject)["name"];
    if (typeof name === "string") return name;
  }
  if (typeof state === "string") return state;
  return null;
}

function summariseIssue(issue: JsonObject, includeDesc = true): string {
  const parts: string[] = [];

  const id = issue["identifier"] ?? issue["id"];
  if (id != null) parts.push(String(id));
  if (typeof issue["title"] === "string") parts.push(`"${issue["title"]}"`);

  const state = stateLabel(issue["state"] ?? issue["stateName"]);
  if (state) parts.push(`[${state}]`);

  const priority = priorityLabel(issue["priority"]);
  if (priority) parts.push(`Priority: ${priority}`);

  const url = issue["url"] ?? issue["branchName"];
  if (typeof url === "string" && url.startsWith("http")) parts.push(url);

  const lines = [parts.join(" · ")];

  if (includeDesc) {
    const desc = issue["description"];
    if (typeof desc === "string" && desc.length > 0) {
      const excerpt = desc.slice(0, DESC_CHARS).trimEnd();
      const truncated = desc.length > DESC_CHARS ? "…" : "";
      lines.push(`Description: ${excerpt}${truncated}`);
    }
  }

  return lines.join("\n");
}

/**
 * Unwraps common Linear MCP response shapes into a flat array of issues.
 * Returns null if the shape is unrecognized.
 */
function extractIssues(parsed: unknown): JsonObject[] | null {
  if (Array.isArray(parsed)) {
    return parsed.filter((i): i is JsonObject => typeof i === "object" && i !== null);
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as JsonObject;

  // GraphQL: { data: { issue: {...} } }
  const data = obj["data"];
  if (typeof data === "object" && data !== null) {
    const d = data as JsonObject;
    if (typeof d["issue"] === "object" && d["issue"] !== null) {
      return [d["issue"] as JsonObject];
    }
    // GraphQL list: { data: { issues: { nodes: [...] } } }
    const issues = d["issues"];
    if (typeof issues === "object" && issues !== null) {
      const nodes = (issues as JsonObject)["nodes"];
      if (Array.isArray(nodes)) {
        return nodes.filter((i): i is JsonObject => typeof i === "object" && i !== null);
      }
    }
  }

  // Relay-style: { nodes: [...] }
  if (Array.isArray(obj["nodes"])) {
    return (obj["nodes"] as unknown[]).filter(
      (i): i is JsonObject => typeof i === "object" && i !== null
    );
  }

  // Single issue object (has identifier or title)
  if (obj["identifier"] != null || typeof obj["title"] === "string") {
    return [obj];
  }

  return null;
}

export const linearHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 500), originalSize };
  }

  const issues = extractIssues(parsed);
  if (!issues || issues.length === 0) {
    // Unrecognized shape — fall back to a short JSON excerpt
    return { summary: raw.slice(0, 500), originalSize };
  }

  if (issues.length === 1) {
    return { summary: summariseIssue(issues[0]!, true), originalSize };
  }

  const lines = issues
    .slice(0, MAX_LIST_ITEMS)
    .map((issue, i) => `${i + 1}. ${summariseIssue(issue, false)}`);
  const more =
    issues.length > MAX_LIST_ITEMS
      ? `\n…and ${issues.length - MAX_LIST_ITEMS} more`
      : "";

  return {
    summary: `${issues.length} Linear issues:\n${lines.join("\n")}${more}`,
    originalSize,
  };
};
