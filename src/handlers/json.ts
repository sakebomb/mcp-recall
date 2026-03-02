import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const MAX_DEPTH = 3;
const MAX_ARRAY_ITEMS = 3;

function truncate(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "…";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((v) => truncate(v, depth + 1));
    const more = value.length - MAX_ARRAY_ITEMS;
    if (more > 0) items.push(`…${more} more` as unknown);
    return items;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = truncate(v, depth + 1);
    }
    return result;
  }

  return value;
}

export const jsonHandler: Handler = (
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

  const truncated = truncate(parsed, 0);
  const summary = JSON.stringify(truncated, null, 2);
  return { summary, originalSize };
};
