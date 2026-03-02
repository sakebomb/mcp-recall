export interface CompressionResult {
  summary: string;
  originalSize: number;
}

export type Handler = (toolName: string, output: unknown) => CompressionResult;

/**
 * Extracts plain text from an MCP tool result.
 * MCP results arrive as { content: [{ type: "text", text: "..." }, ...] }.
 * Falls back to JSON serialization for unrecognized shapes.
 */
export function extractText(output: unknown): string {
  if (typeof output === "string") return output;

  if (output !== null && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (Array.isArray(obj["content"])) {
      const text = (obj["content"] as unknown[])
        .filter(
          (c): c is { type: string; text: string } =>
            typeof c === "object" &&
            c !== null &&
            (c as Record<string, unknown>)["type"] === "text" &&
            typeof (c as Record<string, unknown>)["text"] === "string"
        )
        .map((c) => c.text)
        .join("\n");
      if (text.length > 0) return text;
    }
  }

  return JSON.stringify(output);
}
