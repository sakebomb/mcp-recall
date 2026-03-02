/**
 * Tavily handler — summarises web search/research/extract results.
 * Keeps the synthesized answer in full, extracts title + URL + 150-char
 * content snippet per result. Drops raw_content, score, and response_time
 * entirely. Caps at 10 results.
 *
 * Handles: tavily_search, tavily_research, tavily_extract, tavily_crawl.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const SNIPPET_CHARS = 150;
const MAX_RESULTS = 10;

type JsonObject = Record<string, unknown>;

function summariseResult(result: JsonObject): string {
  const parts: string[] = [];
  if (typeof result["title"] === "string" && result["title"].length > 0) {
    parts.push(result["title"]);
  }
  if (typeof result["url"] === "string") {
    parts.push(result["url"]);
  }
  const content = typeof result["content"] === "string" ? result["content"] : "";
  if (content.length > 0) {
    const snippet = content.slice(0, SNIPPET_CHARS).trimEnd();
    const truncated = content.length > SNIPPET_CHARS ? "…" : "";
    parts.push(`${snippet}${truncated}`);
  }
  return parts.join(" · ");
}

export const tavilyHandler: Handler = (
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

  if (typeof parsed !== "object" || parsed === null) {
    return { summary: String(parsed), originalSize };
  }

  const obj = parsed as JsonObject;
  const lines: string[] = [];

  // Query header
  if (typeof obj["query"] === "string" && obj["query"].length > 0) {
    lines.push(`Query: ${obj["query"]}`);
  }

  // Synthesized answer — include in full, it's already a summary
  if (typeof obj["answer"] === "string" && obj["answer"].length > 0) {
    lines.push(`Answer: ${obj["answer"]}`);
  }

  // Results array
  const results = Array.isArray(obj["results"]) ? (obj["results"] as unknown[]) : [];
  if (results.length > 0) {
    const shown = results.slice(0, MAX_RESULTS);
    const more = results.length > MAX_RESULTS ? results.length - MAX_RESULTS : 0;
    lines.push(`Results (${results.length}):`);
    for (const result of shown) {
      if (typeof result === "object" && result !== null) {
        lines.push(`  ${summariseResult(result as JsonObject)}`);
      }
    }
    if (more > 0) {
      lines.push(`  …and ${more} more`);
    }
  }

  // Graceful fallback if shape was unexpected
  if (lines.length === 0) {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}\n…` : excerpt,
      originalSize,
    };
  }

  return { summary: lines.join("\n"), originalSize };
};
