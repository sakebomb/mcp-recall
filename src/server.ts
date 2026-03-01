/**
 * mcp-recall MCP server.
 * Tools fully implemented in Phase 6.
 *
 * Tools exposed:
 *   recall__retrieve     — fetch stored content, FTS-scoped
 *   recall__search       — FTS across all stored outputs
 *   recall__forget       — delete stored items
 *   recall__list_stored  — paginated item browser
 *   recall__stats        — aggregate session efficiency report
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "recall",
  version: "1.0.0",
});

// Phase 6: implement all recall__* tools here

server.tool(
  "recall__retrieve",
  "Fetch stored content from a previous tool call. Pass a query to return only relevant sections via FTS. Use when you need more detail from a compressed result.",
  {
    id: z.string().describe("8-char or full item ID"),
    query: z.string().optional().describe("FTS query to narrow the result"),
    max_bytes: z
      .number()
      .optional()
      .describe("Override default 8KB cap on returned bytes"),
  },
  async (_args) => ({
    content: [{ type: "text", text: "[recall: not yet implemented — Phase 6]" }],
  })
);

server.tool(
  "recall__search",
  "Search across all stored tool outputs by content. Use when you don't have an ID but know what you're looking for. Returns matching items with IDs for retrieval.",
  {
    query: z.string().describe("FTS search query"),
    tool: z.string().optional().describe("Filter by tool name pattern (regex)"),
    limit: z.number().optional().describe("Max results to return (default 5)"),
  },
  async (_args) => ({
    content: [{ type: "text", text: "[recall: not yet implemented — Phase 6]" }],
  })
);

server.tool(
  "recall__forget",
  "Delete stored items by ID, tool pattern, session, age, or clear all. Always confirm before clearing all.",
  {
    id: z.string().optional().describe("Delete a single item by ID"),
    tool: z.string().optional().describe("Delete all items matching tool name regex"),
    session_id: z.string().optional().describe("Delete all items from a session"),
    older_than_days: z
      .number()
      .optional()
      .describe("Delete non-pinned items older than N session days"),
    all: z.boolean().optional().describe("Clear entire store (requires confirmed: true)"),
    confirmed: z.boolean().optional().describe("Required to execute all: true"),
  },
  async (_args) => ({
    content: [{ type: "text", text: "[recall: not yet implemented — Phase 6]" }],
  })
);

server.tool(
  "recall__list_stored",
  "Browse stored items by recency, access frequency, or size. Use to find a specific item to retrieve or forget.",
  {
    limit: z.number().optional().describe("Items per page (default 10)"),
    offset: z.number().optional().describe("Pagination offset"),
    tool: z.string().optional().describe("Filter by tool name pattern"),
    sort: z
      .enum(["recent", "accessed", "size"])
      .optional()
      .describe("Sort order (default: recent)"),
  },
  async (_args) => ({
    content: [{ type: "text", text: "[recall: not yet implemented — Phase 6]" }],
  })
);

server.tool(
  "recall__stats",
  "Aggregate session efficiency stats — total savings, compression ratio, token savings, top tools by volume. Use to understand the big picture.",
  {},
  async () => ({
    content: [{ type: "text", text: "[recall: not yet implemented — Phase 6]" }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
