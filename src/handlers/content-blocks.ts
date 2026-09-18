/**
 * Content-block handler — strips incompressible non-text MCP blocks
 * (screenshots, audio, embedded resources) and keeps the text.
 *
 * originalSize is the pre-strip payload, including image bytes. Measuring
 * extractText after the drop makes summarySize ≥ originalSize, so the
 * PostToolUse skip-if-not-smaller guard returns {} and the screenshot
 * still lands in the model window (#270).
 */
import type { CompressionResult, Handler } from "./types";
import {
  asMcpContentBlocks,
  extractText,
  joinTextBlocks,
  payloadByteLength,
} from "./types";

export const contentBlockHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const originalSize = payloadByteLength(output);
  const blocks = asMcpContentBlocks(output);
  const text = blocks ? joinTextBlocks(blocks) : extractText(output);
  const stripped = blocks?.filter((b) => b.type !== "text") ?? [];
  if (stripped.length === 0) {
    return { summary: text, originalSize };
  }
  const types = [...new Set(stripped.map((b) => b.type))];
  const label = types.length === 1 ? types[0] : "non-text";
  const note = `[stripped ${stripped.length} ${label} content block${stripped.length === 1 ? "" : "s"}]`;
  const summary = text.length > 0 ? `${text}\n${note}` : note;
  return { summary, originalSize };
};
