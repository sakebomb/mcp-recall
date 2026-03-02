/**
 * GitHub handler — summarises GitHub API responses into key fields
 * (number, title, state, author, labels, body excerpt). Handles both
 * single objects and arrays.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const BODY_EXCERPT_CHARS = 200;

type JsonObject = Record<string, unknown>;

function summariseItem(item: JsonObject): string {
  const parts: string[] = [];

  if (typeof item["number"] === "number") parts.push(`#${item["number"]}`);
  if (typeof item["title"] === "string") parts.push(`"${item["title"]}"`);
  if (typeof item["state"] === "string") parts.push(`[${item["state"]}]`);
  if (typeof item["name"] === "string" && !item["title"]) parts.push(item["name"]);

  const url = item["html_url"] ?? item["url"];
  if (typeof url === "string") parts.push(url);

  const labels = item["labels"];
  if (Array.isArray(labels) && labels.length > 0) {
    const names = labels
      .map((l) =>
        typeof l === "object" && l !== null && typeof (l as JsonObject)["name"] === "string"
          ? (l as JsonObject)["name"]
          : String(l)
      )
      .join(", ");
    parts.push(`labels: ${names}`);
  }

  if (typeof item["body"] === "string" && item["body"].length > 0) {
    const excerpt = item["body"].slice(0, BODY_EXCERPT_CHARS).trimEnd();
    const truncated = item["body"].length > BODY_EXCERPT_CHARS ? "…" : "";
    parts.push(`body: ${excerpt}${truncated}`);
  }

  return parts.join(" · ");
}

export const githubHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — fall back to plain excerpt
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}\n…` : excerpt,
      originalSize,
    };
  }

  // Array of items (e.g. list_issues, list_pull_requests)
  if (Array.isArray(parsed)) {
    const items = parsed as unknown[];
    const lines = items
      .slice(0, 10)
      .map((item) =>
        typeof item === "object" && item !== null
          ? summariseItem(item as JsonObject)
          : String(item)
      );
    const more = items.length > 10 ? `\n…and ${items.length - 10} more` : "";
    return { summary: lines.join("\n") + more, originalSize };
  }

  // Single item
  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summariseItem(parsed as JsonObject), originalSize };
  }

  return { summary: String(parsed), originalSize };
};
