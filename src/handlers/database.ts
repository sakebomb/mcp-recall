/**
 * Database handler — summarises query results from postgres, mysql, sqlite MCPs.
 * Handles three common response shapes:
 *   1. node-postgres: { rows: [...], fields: [{ name: "col" }, ...] }
 *   2. bare array of row objects: [{ col: val, ... }, ...]
 *   3. results wrapper: { results: [...] }
 *
 * Emits: row/column count header, column names, first 10 rows as col=value pairs,
 * and a truncation notice when more rows exist.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const MAX_PREVIEW_ROWS = 10;
const MAX_COLS_DISPLAY = 8;

type RowObject = Record<string, unknown>;

function formatRow(index: number, row: RowObject, cols: string[]): string {
  const pairs = cols
    .slice(0, MAX_COLS_DISPLAY)
    .map((col) => {
      const val = row[col];
      const str = val === null || val === undefined ? "NULL" : String(val);
      return `${col}=${str.length > 50 ? str.slice(0, 50) + "…" : str}`;
    })
    .join(", ");
  const overflow = cols.length > MAX_COLS_DISPLAY ? ` [+${cols.length - MAX_COLS_DISPLAY} cols]` : "";
  return `  row ${index + 1}: ${pairs}${overflow}`;
}

function extractRows(parsed: unknown): { rows: RowObject[]; cols: string[] } | null {
  // node-postgres shape: { rows: [...], fields: [{ name: "..." }, ...] }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>)["rows"])
  ) {
    const obj = parsed as Record<string, unknown>;
    const rows = (obj["rows"] as unknown[]).filter(
      (r): r is RowObject => typeof r === "object" && r !== null
    );
    const fields = obj["fields"];
    let cols: string[];
    if (Array.isArray(fields) && fields.length > 0) {
      cols = (fields as unknown[])
        .map((f) =>
          typeof f === "object" && f !== null && typeof (f as Record<string, unknown>)["name"] === "string"
            ? String((f as Record<string, unknown>)["name"])
            : ""
        )
        .filter(Boolean);
    } else {
      cols = rows.length > 0 ? Object.keys(rows[0]!) : [];
    }
    return { rows, cols };
  }

  // results wrapper: { results: [...] }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>)["results"])
  ) {
    const rows = ((parsed as Record<string, unknown>)["results"] as unknown[]).filter(
      (r): r is RowObject => typeof r === "object" && r !== null
    );
    const cols = rows.length > 0 ? Object.keys(rows[0]!) : [];
    return { rows, cols };
  }

  // bare array of row objects
  if (Array.isArray(parsed)) {
    const rows = (parsed as unknown[]).filter(
      (r): r is RowObject => typeof r === "object" && r !== null
    );
    const cols = rows.length > 0 ? Object.keys(rows[0]!) : [];
    return { rows, cols };
  }

  return null;
}

export const databaseHandler: Handler = (
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

  const extracted = extractRows(parsed);
  if (!extracted) {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}\n…` : excerpt,
      originalSize,
    };
  }

  const { rows, cols } = extracted;

  if (rows.length === 0) {
    return { summary: `[0 rows × ${cols.length} cols]\n(empty result set)`, originalSize };
  }

  const colHeader =
    `headers: ${cols.slice(0, MAX_COLS_DISPLAY).join(", ")}` +
    (cols.length > MAX_COLS_DISPLAY ? ` [+${cols.length - MAX_COLS_DISPLAY} more]` : "");

  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS).map((row, i) => formatRow(i, row, cols));

  const more =
    rows.length > MAX_PREVIEW_ROWS
      ? `\n[…${rows.length - MAX_PREVIEW_ROWS} more rows]`
      : "";

  const summary = [
    `[${rows.length} rows × ${cols.length} cols]`,
    colHeader,
    ...previewRows,
  ].join("\n") + more;

  return { summary, originalSize };
};
