/**
 * Generic handler — last-resort fallback for plain text output.
 * Delivers the first 500 characters with a truncation note if longer.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const MAX_CHARS = 500;

export const genericHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  const excerpt = raw.slice(0, MAX_CHARS).trimEnd();
  const truncated = raw.length > MAX_CHARS;
  const summary = truncated ? `${excerpt}\n…` : excerpt;

  return { summary, originalSize };
};
