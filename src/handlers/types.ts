export interface CompressionResult {
  summary: string;
  originalSize: number;
}

export type Handler = (toolName: string, output: unknown) => CompressionResult;

/** MCP content block: `{ type: "text", text }` or `{ type: "image", … }`, etc. */
export interface McpContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

const MCP_BINARY_TYPES = new Set(["image", "image_url", "audio", "resource", "resource_link"]);

function isMcpContentBlock(c: unknown): c is McpContentBlock {
  return typeof c === "object" && c !== null && typeof (c as McpContentBlock)["type"] === "string";
}

function looksLikeMcpContentBlocks(value: unknown): value is McpContentBlock[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isMcpContentBlock)) return false;
  return value.some(
    (b) =>
      (b.type === "text" && typeof b.text === "string") || MCP_BINARY_TYPES.has(b.type)
  );
}

function blocksFromValue(value: unknown): McpContentBlock[] | null {
  if (looksLikeMcpContentBlocks(value)) return value;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const content = (value as Record<string, unknown>)["content"];
    if (looksLikeMcpContentBlocks(content)) return content;
  }
  return null;
}

/**
 * MCP content-block array, either top-level (`[{type, text}, {type: "image", …}]`)
 * or wrapped as `{ content: […] }`. Parses a JSON string of either shape.
 * Returns null for unrelated arrays (GitHub issues, etc.).
 */
export function asMcpContentBlocks(output: unknown): McpContentBlock[] | null {
  const found = blocksFromValue(output);
  if (found) return found;
  if (typeof output === "string") {
    try {
      return blocksFromValue(JSON.parse(output));
    } catch {
      return null;
    }
  }
  return null;
}

export function hasNonTextContentBlocks(output: unknown): boolean {
  const blocks = asMcpContentBlocks(output);
  return blocks !== null && blocks.some((b) => b.type !== "text");
}

export function joinTextBlocks(blocks: McpContentBlock[]): string {
  return blocks
    .filter((b): b is McpContentBlock & { text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

/** Byte size of the raw payload, including incompressible image bytes. */
export function payloadByteLength(output: unknown): number {
  if (typeof output === "string") return Buffer.byteLength(output, "utf8");
  return Buffer.byteLength(JSON.stringify(output), "utf8");
}

function isTopLevelArrayPayload(output: unknown): boolean {
  if (Array.isArray(output)) return true;
  if (typeof output === "string") {
    const trimmed = output.trimStart();
    return trimmed.startsWith("[");
  }
  return false;
}

/**
 * Extracts plain text from an MCP tool result.
 * MCP results arrive as { content: [{ type: "text", text: "..." }, ...] }
 * or as a top-level content-block array. Image/audio/resource blocks are
 * dropped so they are not stored or hashed. Falls back to JSON serialization
 * for unrecognized shapes.
 *
 * A text-only top-level array is left as JSON.stringify so jsonHandler
 * routing stays unchanged (scroll/click payloads in the same family).
 */
export function extractText(output: unknown): string {
  const blocks = asMcpContentBlocks(output);
  if (blocks) {
    const text = joinTextBlocks(blocks);
    const hasNonText = blocks.some((b) => b.type !== "text");
    // Non-text blocks: never JSON.stringify the image bytes into the store.
    if (hasNonText) return text;
    if (text.length > 0 && !isTopLevelArrayPayload(output)) return text;
  }

  if (typeof output === "string") return output;
  return JSON.stringify(output);
}
