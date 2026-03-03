/**
 * Strategy implementations for TOML-defined compression profiles.
 */
import type { CompressionResult } from "../handlers/types";
import { extractText } from "../handlers/types";
import type { ProfileStrategy } from "./types";

// ── shared helpers ────────────────────────────────────────────────────────────

function resolvePath(obj: unknown, path: string): unknown {
  if (path === "" || path === ".") return obj;
  return path.split(".").reduce((cur: unknown, key: string) => {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

function getLabel(fieldPath: string, labels?: Record<string, string>): string {
  if (labels?.[fieldPath]) return labels[fieldPath]!;
  const parts = fieldPath.split(".");
  return parts[parts.length - 1] ?? fieldPath;
}

function fieldValue(obj: unknown, fieldPath: string, maxChars: number): string {
  const val = resolvePath(obj, fieldPath);
  if (val === undefined || val === null) return "";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return str.length > maxChars ? str.slice(0, maxChars) + "…" : str;
}

// ── json_extract ──────────────────────────────────────────────────────────────

function resolveItems(parsed: unknown, itemsPaths: string[]): unknown[] | null {
  const pathsToTry = itemsPaths.length > 0 ? itemsPaths : [""];
  for (const path of pathsToTry) {
    const val = resolvePath(parsed, path);
    if (Array.isArray(val)) return val;
    if (val !== null && val !== undefined && typeof val === "object") return [val];
  }
  // Root fallback
  if (Array.isArray(parsed)) return parsed;
  if (parsed !== null && typeof parsed === "object") return [parsed];
  return null;
}

export function applyJsonExtract(
  strategy: ProfileStrategy,
  _toolName: string,
  output: unknown
): CompressionResult {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const fallbackChars = strategy.fallback_chars ?? 500;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, fallbackChars), originalSize };
  }

  const items = resolveItems(parsed, strategy.items_path ?? []);
  if (!items || items.length === 0) {
    return { summary: raw.slice(0, fallbackChars), originalSize };
  }

  const fields = strategy.fields ?? [];
  const maxItems = strategy.max_items ?? 10;
  const maxCharsPerField = strategy.max_chars_per_field ?? 200;
  const labels = strategy.labels;
  const count = items.length;

  const lines = items.slice(0, maxItems).map((item, i) => {
    const parts = fields
      .map((f) => {
        const val = fieldValue(item, f, maxCharsPerField);
        return val ? `${getLabel(f, labels)}: ${val}` : null;
      })
      .filter(Boolean);
    return `${i + 1}. ${parts.join(" · ")}`;
  });

  const more = count > maxItems ? `\n…and ${count - maxItems} more` : "";
  const summary = `${count} item${count === 1 ? "" : "s"}:\n${lines.join("\n")}${more}`;
  return { summary, originalSize };
}

// ── json_truncate ─────────────────────────────────────────────────────────────

function truncateJson(value: unknown, depth: number, maxDepth: number, maxArrayItems: number): unknown {
  if (depth > maxDepth) return "…";
  if (Array.isArray(value)) {
    const items = value.slice(0, maxArrayItems).map((v) => truncateJson(v, depth + 1, maxDepth, maxArrayItems));
    if (value.length > maxArrayItems) items.push(`…${value.length - maxArrayItems} more` as unknown);
    return items;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = truncateJson(v, depth + 1, maxDepth, maxArrayItems);
    }
    return result;
  }
  return value;
}

export function applyJsonTruncate(
  strategy: ProfileStrategy,
  _toolName: string,
  output: unknown
): CompressionResult {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const fallbackChars = strategy.fallback_chars ?? 500;
  const maxDepth = strategy.max_depth ?? 3;
  const maxArrayItems = strategy.max_array_items ?? 3;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, fallbackChars).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}\n…` : excerpt,
      originalSize,
    };
  }

  const truncated = truncateJson(parsed, 0, maxDepth, maxArrayItems);
  return { summary: JSON.stringify(truncated, null, 2), originalSize };
}

// ── text_truncate ─────────────────────────────────────────────────────────────

export function applyTextTruncate(
  strategy: ProfileStrategy,
  _toolName: string,
  output: unknown
): CompressionResult {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const maxChars = strategy.max_chars ?? 500;
  const excerpt = raw.slice(0, maxChars).trimEnd();
  return {
    summary: raw.length > maxChars ? `${excerpt}\n…` : excerpt,
    originalSize,
  };
}
