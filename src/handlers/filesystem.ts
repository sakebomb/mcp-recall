import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const HEAD_LINES = 50;

export const filesystemHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  const lines = raw.split("\n");
  const totalLines = lines.length;
  const head = lines.slice(0, HEAD_LINES).join("\n");
  const truncated = totalLines > HEAD_LINES;

  const header = `[${totalLines} line${totalLines === 1 ? "" : "s"}${truncated ? `, showing first ${HEAD_LINES}` : ""}]`;
  const summary = `${header}\n${head}${truncated ? "\n…" : ""}`;

  return { summary, originalSize };
};
