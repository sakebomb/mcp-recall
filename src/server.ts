/**
 * mcp-recall MCP server.
 *
 * Tools exposed:
 *   recall__retrieve         — fetch stored content, FTS-scoped
 *   recall__search           — FTS across all stored outputs
 *   recall__pin              — pin/unpin an item from expiry and eviction
 *   recall__note             — store arbitrary text as a recall note
 *   recall__export           — JSON dump of all stored items
 *   recall__forget           — delete stored items
 *   recall__list_stored      — paginated item browser
 *   recall__stats            — aggregate session efficiency report
 *   recall__session_summary  — digest of a single session's activity
 *   recall__context          — session orientation: pinned, notes, recent, last session
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getProjectKey } from "./project-key";
import { getDb, defaultDbPath } from "./db/index";
import { loadConfig } from "./config";
import {
  toolRetrieve,
  toolSearch,
  toolPin,
  toolNote,
  toolExport,
  toolForget,
  toolListStored,
  toolStats,
  toolSessionSummary,
  toolContext,
} from "./tools";

const projectKey = getProjectKey(process.cwd());
const db = getDb(defaultDbPath(projectKey));

/** Wraps a tool callback so errors return a text error instead of crashing. */
function safeTool<T>(fn: (args: T) => { content: Array<{ type: "text"; text: string }> }) {
  return async (args: T) => {
    try {
      return fn(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `[recall: error] ${msg}` }] };
    }
  };
}

const { version } = await import("../package.json");

const server = new McpServer({
  name: "recall",
  version,
});

server.tool(
  "recall__retrieve",
  "Fetch stored content from a previous tool call. Pass a query to return the most relevant excerpt via FTS. Use when you need more detail from a compressed result.",
  {
    id: z.string().describe("8-char or full item ID"),
    query: z.string().optional().describe("FTS query to return a focused excerpt"),
    max_bytes: z
      .number()
      .optional()
      .describe("Override default 8KB cap on returned bytes (used when FTS returns no match)"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolRetrieve(db, args) }],
  }))
);

server.tool(
  "recall__search",
  "Search across all stored tool outputs by content. Use when you don't have an ID but know what you're looking for. Returns matching items with IDs for retrieval.",
  {
    query: z.string().describe("FTS search query"),
    tool: z.string().optional().describe("Filter by tool name (substring match)"),
    limit: z.number().optional().describe("Max results to return (default 5)"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolSearch(db, projectKey, args) }],
  }))
);

server.tool(
  "recall__pin",
  "Pin an item to protect it from expiry and eviction. Use for important results you want to keep indefinitely. Pass pinned: false to unpin.",
  {
    id: z.string().describe("Item ID to pin or unpin"),
    pinned: z.boolean().optional().describe("true to pin (default), false to unpin"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolPin(db, projectKey, args) }],
  }))
);

server.tool(
  "recall__note",
  "Store arbitrary text as a recall note — conclusions, findings, context that should survive context resets. Use for project memory.",
  {
    text: z.string().describe("Note content to store"),
    title: z.string().optional().describe("Short title for the note (shown in list/search)"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolNote(db, projectKey, args) }],
  }))
);

server.tool(
  "recall__export",
  "Export all stored items for this project as JSON. Use before a full clear to preserve data.",
  {},
  safeTool(() => ({
    content: [{ type: "text", text: toolExport(db, projectKey) }],
  }))
);

server.tool(
  "recall__forget",
  "Delete stored items by ID, tool pattern, session, age, or clear all. Pinned items are skipped unless force: true.",
  {
    id: z.string().optional().describe("Delete a single item by ID"),
    tool: z.string().optional().describe("Delete all items matching tool name substring"),
    session_id: z.string().optional().describe("Delete all items from a session"),
    older_than_days: z
      .number()
      .optional()
      .describe("Delete items older than N calendar days"),
    all: z.boolean().optional().describe("Clear entire store (requires confirmed: true)"),
    confirmed: z.boolean().optional().describe("Required to execute all: true"),
    force: z.boolean().optional().describe("Override pin protection and delete pinned items too"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolForget(db, projectKey, args) }],
  }))
);

server.tool(
  "recall__list_stored",
  "Browse stored items by recency, access frequency, or size. Use to find a specific item to retrieve or forget.",
  {
    limit: z.number().optional().describe("Items per page (default 10)"),
    offset: z.number().optional().describe("Pagination offset"),
    tool: z.string().optional().describe("Filter by tool name substring"),
    sort: z
      .enum(["recent", "accessed", "size"])
      .optional()
      .describe("Sort order: recent (default), accessed (most-used first), size (largest first)"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolListStored(db, projectKey, args) }],
  }))
);

server.tool(
  "recall__stats",
  "Aggregate session efficiency stats — total savings, compression ratio, token savings, session days. Use to understand the big picture.",
  {},
  safeTool(() => {
    const config = loadConfig();
    return {
      content: [{ type: "text", text: toolStats(db, projectKey, {
        pin_threshold: config.store.pin_recommendation_threshold,
        stale_days: config.store.stale_item_days,
      }) }],
    };
  })
);

server.tool(
  "recall__session_summary",
  "Digest of a single session's activity — tools called, compression savings, most-accessed items, pinned items, notes. Defaults to today. Use at session start for orientation or handoff.",
  {
    session_id: z
      .string()
      .optional()
      .describe("Filter by specific Claude session ID (exact match)"),
    date: z
      .string()
      .optional()
      .describe("Filter by date in YYYY-MM-DD format (defaults to today)"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolSessionSummary(db, projectKey, args) }],
  }))
);

server.tool(
  "recall__context",
  "Session orientation: pinned items, recent notes, recently accessed items, and last session headline. Call at the start of a session to quickly re-orient to prior work.",
  {
    days: z
      .number()
      .optional()
      .describe("Lookback window for recently accessed items in days (default 7)"),
    limit: z
      .number()
      .optional()
      .describe("Max recently accessed items to show (default 5)"),
  },
  safeTool((args) => ({
    content: [{ type: "text", text: toolContext(db, projectKey, args) }],
  }))
);

const transport = new StdioServerTransport();
await server.connect(transport);
