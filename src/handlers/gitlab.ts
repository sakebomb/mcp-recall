/**
 * GitLab handler — summarises GitLab API responses into key fields
 * (iid, title, state, description excerpt, labels, web_url). Handles both
 * single objects and arrays. Field names differ from GitHub: iid not number,
 * description not body, web_url not html_url, labels is a plain string array.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const DESCRIPTION_EXCERPT_CHARS = 200;

type JsonObject = Record<string, unknown>;

function summariseItem(item: JsonObject): string {
  const parts: string[] = [];

  if (typeof item["iid"] === "number") parts.push(`!${item["iid"]}`);
  else if (typeof item["id"] === "number" && !item["iid"]) parts.push(`#${item["id"]}`);

  if (typeof item["title"] === "string") parts.push(`"${item["title"]}"`);
  if (typeof item["state"] === "string") parts.push(`[${item["state"]}]`);
  if (typeof item["name"] === "string" && !item["title"]) parts.push(item["name"]);

  if (typeof item["web_url"] === "string") parts.push(item["web_url"]);

  const labels = item["labels"];
  if (Array.isArray(labels) && labels.length > 0) {
    const names = labels.map((l) => String(l)).join(", ");
    parts.push(`labels: ${names}`);
  }

  const body = item["description"] ?? item["body"];
  if (typeof body === "string" && body.length > 0) {
    const excerpt = body.slice(0, DESCRIPTION_EXCERPT_CHARS).trimEnd();
    const truncated = body.length > DESCRIPTION_EXCERPT_CHARS ? "…" : "";
    parts.push(`description: ${excerpt}${truncated}`);
  }

  return parts.join(" · ");
}

export const gitlabHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}\n…` : excerpt,
      originalSize,
    };
  }

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

  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summariseItem(parsed as JsonObject), originalSize };
  }

  return { summary: String(parsed), originalSize };
};
