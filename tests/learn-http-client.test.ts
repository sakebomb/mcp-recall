import { describe, test, expect, afterEach } from "bun:test";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Server = any;
import { listMcpToolsHttp } from "../src/learn/http-client";

// ── helpers ───────────────────────────────────────────────────────────────────

const MOCK_TOOLS = [
  { name: "list_issues", description: "List issues" },
  { name: "get_issue", description: "Get an issue" },
];

const INIT_RESULT = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  serverInfo: { name: "test-server", version: "1.0.0" },
};

function jsonRpc(id: number, result: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function sseChunk(data: string, event?: string): string {
  return (event ? `event: ${event}\ndata: ${data}\n\n` : `data: ${data}\n\n`);
}

const servers: Server[] = [];

function stopAll() {
  for (const s of servers) s.stop(true);
  servers.length = 0;
}

// ── Streamable HTTP (JSON response) ──────────────────────────────────────────

describe("listMcpToolsHttp — streamable HTTP (JSON)", () => {
  afterEach(stopAll);

  test("returns tools and transport label", async () => {
    const s = Bun.serve({
      port: 0,
      fetch(req) {
        if (req.method !== "POST") return new Response(null, { status: 405 });
        return req.json().then((body: { id?: number }) => {
          if (body.id === 1) return new Response(jsonRpc(1, INIT_RESULT), { headers: { "Content-Type": "application/json" } });
          if (body.id === 2) return new Response(jsonRpc(2, { tools: MOCK_TOOLS }), { headers: { "Content-Type": "application/json" } });
          return new Response(null, { status: 204 }); // notification
        });
      },
    });
    servers.push(s);

    const result = await listMcpToolsHttp(s.url.href, 5_000);
    expect(result.transport).toBe("streamable-http");
    expect(result.tools).toEqual(MOCK_TOOLS);
    expect(result.streamableError).toBeUndefined();
  });

  test("returns empty tools list when server returns none", async () => {
    const s = Bun.serve({
      port: 0,
      fetch(req) {
        return req.json().then((body: { id?: number }) => {
          if (body.id === 1) return new Response(jsonRpc(1, INIT_RESULT), { headers: { "Content-Type": "application/json" } });
          if (body.id === 2) return new Response(jsonRpc(2, { tools: [] }), { headers: { "Content-Type": "application/json" } });
          return new Response(null, { status: 204 });
        });
      },
    });
    servers.push(s);

    const result = await listMcpToolsHttp(s.url.href, 5_000);
    expect(result.tools).toEqual([]);
  });

  test("returns empty list when server omits tools key", async () => {
    const s = Bun.serve({
      port: 0,
      fetch(req) {
        return req.json().then((body: { id?: number }) => {
          if (body.id === 1) return new Response(jsonRpc(1, INIT_RESULT), { headers: { "Content-Type": "application/json" } });
          if (body.id === 2) return new Response(jsonRpc(2, {}), { headers: { "Content-Type": "application/json" } });
          return new Response(null, { status: 204 });
        });
      },
    });
    servers.push(s);

    const result = await listMcpToolsHttp(s.url.href, 5_000);
    expect(result.tools).toEqual([]);
  });

  test("surfaces MCP error from server", async () => {
    const s = Bun.serve({
      port: 0,
      fetch(req) {
        return req.json().then((body: { id?: number }) => {
          const err = JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "not supported" } });
          return new Response(err, { headers: { "Content-Type": "application/json" } });
        });
      },
    });
    servers.push(s);

    await expect(listMcpToolsHttp(s.url.href, 5_000)).rejects.toThrow("MCP error: not supported");
  });
});

// ── Streamable HTTP (SSE response) ────────────────────────────────────────────

describe("listMcpToolsHttp — streamable HTTP (SSE response)", () => {
  afterEach(stopAll);

  test("parses tools from SSE-streamed response", async () => {
    const s = Bun.serve({
      port: 0,
      fetch(req) {
        return req.json().then((body: { id?: number }) => {
          if (!body.id) return new Response(null, { status: 204 });
          const payload = body.id === 1
            ? jsonRpc(1, INIT_RESULT)
            : jsonRpc(2, { tools: MOCK_TOOLS });

          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sseChunk(payload, "message")));
              controller.close();
            },
          });
          return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
        });
      },
    });
    servers.push(s);

    const result = await listMcpToolsHttp(s.url.href, 5_000);
    expect(result.transport).toBe("streamable-http");
    expect(result.tools).toEqual(MOCK_TOOLS);
  });
});

// ── Legacy HTTP+SSE transport ─────────────────────────────────────────────────

describe("listMcpToolsHttp — legacy SSE", () => {
  afterEach(stopAll);

  /**
   * Builds a minimal legacy SSE MCP server:
   *   GET /sse  → SSE stream; first event is `endpoint` pointing at /messages
   *   POST /messages  → accepts JSON-RPC, pushes response back on SSE stream
   */
  function makeLegacySseServer() {
    // Channel to send JSON-RPC responses back to the SSE stream
    const responseQueue: string[] = [];
    let sseController: ReadableStreamDefaultController<Uint8Array> | null = null;

    function pushResponse(payload: string) {
      const chunk = new TextEncoder().encode(sseChunk(payload, "message"));
      if (sseController) {
        sseController.enqueue(chunk);
      } else {
        responseQueue.push(payload);
      }
    }

    const s = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);

        if (req.method === "GET" && url.pathname === "/sse") {
          const stream = new ReadableStream<Uint8Array>({
            start(ctrl) {
              sseController = ctrl;
              // Send endpoint event
              const postUrl = `/messages`;
              ctrl.enqueue(new TextEncoder().encode(sseChunk(postUrl, "endpoint")));
              // Flush any responses that arrived before the stream opened
              for (const p of responseQueue) {
                ctrl.enqueue(new TextEncoder().encode(sseChunk(p, "message")));
              }
              responseQueue.length = 0;
            },
          });
          return new Response(stream, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }

        if (req.method === "POST" && url.pathname === "/messages") {
          return req.json().then((body: { id?: number }) => {
            if (body.id === 1) pushResponse(jsonRpc(1, INIT_RESULT));
            else if (body.id === 2) pushResponse(jsonRpc(2, { tools: MOCK_TOOLS }));
            return new Response(null, { status: 202 });
          });
        }

        return new Response(null, { status: 404 });
      },
    });

    servers.push(s);
    return s;
  }

  test("returns tools via legacy SSE when streamable HTTP returns 404", async () => {
    const s = makeLegacySseServer();
    const sseUrl = new URL("/sse", s.url).href;

    // This server only handles GET /sse and POST /messages; POSTing to /sse
    // returns 404, which triggers the legacy-SSE fallback in listMcpToolsHttp.
    const result = await listMcpToolsHttp(sseUrl, 5_000);
    expect(result.transport).toBe("legacy-sse");
    expect(result.tools).toEqual(MOCK_TOOLS);
  });

  test("streamableError is populated when legacy SSE is used", async () => {
    const s = makeLegacySseServer();
    const sseUrl = new URL("/sse", s.url).href;

    const result = await listMcpToolsHttp(sseUrl, 5_000);
    expect(result.streamableError).toBeDefined();
    expect(typeof result.streamableError).toBe("string");
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe("listMcpToolsHttp — error cases", () => {
  afterEach(stopAll);

  test("throws with both failure reasons when neither transport works", async () => {
    const s = Bun.serve({
      port: 0,
      fetch() {
        return new Response(null, { status: 500 });
      },
    });
    servers.push(s);

    await expect(listMcpToolsHttp(s.url.href, 2_000)).rejects.toThrow(
      /streamable HTTP:.*legacy SSE:/
    );
  });

  test("throws when URL is unreachable", async () => {
    // Port 1 is almost always refused
    await expect(listMcpToolsHttp("http://127.0.0.1:1/mcp", 2_000)).rejects.toThrow(
      /streamable HTTP:.*legacy SSE:/
    );
  });
});
