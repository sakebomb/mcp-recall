import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const MAX_PREVIEW_ROWS = 5;

/**
 * Splits a single CSV row, handling double-quoted fields with embedded commas.
 */
function splitCsvRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of row) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

export const csvHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { summary: "(empty CSV)", originalSize };
  }

  const headerCols = splitCsvRow(lines[0]!);
  const dataRows = lines.slice(1);
  const totalRows = dataRows.length;

  const previewLines = dataRows.slice(0, MAX_PREVIEW_ROWS).map((line, i) => {
    const vals = splitCsvRow(line);
    // Show as key: value pairs for readability (up to 5 cols)
    const pairs = headerCols
      .slice(0, 5)
      .map((col, ci) => `${col}=${vals[ci] ?? ""}`)
      .join(", ");
    const overflow = headerCols.length > 5 ? ` [+${headerCols.length - 5} cols]` : "";
    return `  row ${i + 1}: ${pairs}${overflow}`;
  });

  const more =
    totalRows > MAX_PREVIEW_ROWS
      ? `\n[…${totalRows - MAX_PREVIEW_ROWS} more rows]`
      : "";

  const summary = [
    `[${totalRows} rows × ${headerCols.length} cols]`,
    `headers: ${headerCols.slice(0, 10).join(", ")}${headerCols.length > 10 ? ` [+${headerCols.length - 10} more]` : ""}`,
    ...previewLines,
  ].join("\n") + more;

  return { summary, originalSize };
};

/**
 * Returns true if the text looks like a CSV file:
 * at least 3 non-empty lines, first line has 2+ commas.
 */
export function looksLikeCsv(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 3) return false;
  const firstLineCommas = (lines[0]!.match(/,/g) ?? []).length;
  return firstLineCommas >= 2;
}
