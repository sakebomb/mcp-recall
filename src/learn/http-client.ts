/**
 * HTTP MCP client — supports both current Streamable HTTP and legacy HTTP+SSE
 * transports. Used by `mcp-recall learn` to introspect remote MCP servers.
 *
 * Transport selection:
 *   1. Try Streamable HTTP (POST JSON-RPC, JSON or SSE response) — current spec.
 *   2. On failure, fall back to legacy HTTP+SSE (GET SSE stream, POST to
 *      dynamically provided endpoint URL) — deprecated but still common.
 */

import type { McpTool } from "./client";

/**
 * Thrown when the MCP server returns a JSON-RPC error (protocol-level failure).
 * These are not transport errors and must not trigger the legacy-SSE fallback.
 */
class McpProtocolError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "McpProtocolError";
  }
}

export type HttpTransport = "streamable-http" | "legacy-sse";

export interface HttpListResult {
  tools: McpTool[];
  transport: HttpTransport;
  /** Set when streamable HTTP failed and legacy SSE was used instead. */
  streamableError?: string;
}

interface JsonRpcMsg {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string;
  params?: unknown;
}

// ── SSE stream parser ─────────────────────────────────────────────────────────

interface SseEvent {
  event?: string;
  data: string;
}

/** Yields complete SSE events from a ReadableStream. */
async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  try {
    while (!signal.aborted) {
      let done: boolean, value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch {
        break; // stream cancelled (e.g. AbortSignal fired)
      }
      if (done) break;
      buf += dec.decode(value, { stream: true });

      // Events are separated by blank lines
      const blocks = buf.split("\n\n");
      buf = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        let eventType: string | undefined;
        const dataLines: string[] = [];

        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
          else if (line === "data") dataLines.push("");
        }

        if (dataLines.length > 0) {
          yield { event: eventType, data: dataLines.join("\n") };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Reads an SSE stream looking for a JSON-RPC response matching `id`. */
async function awaitSseResult(
  stream: AsyncGenerator<SseEvent>,
  id: number
): Promise<unknown> {
  for await (const { data } of stream) {
    let msg: JsonRpcMsg;
    try {
      msg = JSON.parse(data) as JsonRpcMsg;
    } catch {
      continue;
    }
    if (msg.id !== id) continue;
    if (msg.error) throw new McpProtocolError(`MCP error: ${msg.error.message}`);
    return msg.result;
  }
  throw new Error("SSE stream ended without a matching response");
}

// ── Streamable HTTP transport ─────────────────────────────────────────────────

const INIT_PARAMS = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "mcp-recall-learn", version: "1.0.0" },
};

/**
 * Posts a single JSON-RPC request and returns the result.
 * Response may be plain JSON or an SSE stream (both are valid per spec).
 * Notifications (no `id`) are fire-and-forget.
 */
async function streamableRpc(
  url: string,
  body: JsonRpcMsg,
  signal: AbortSignal
): Promise<unknown> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  if (body.id === undefined) return; // notification — no result expected

  const ct = resp.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    const msg = (await resp.json()) as JsonRpcMsg;
    if (msg.error) throw new McpProtocolError(`MCP error: ${msg.error.message}`);
    return msg.result;
  }

  if (ct.includes("text/event-stream")) {
    const stream = parseSseStream(resp.body!, signal);
    return awaitSseResult(stream, body.id);
  }

  throw new Error(`Unexpected Content-Type: ${ct}`);
}

async function tryStreamableHttp(url: string, timeoutMs: number): Promise<McpTool[]> {
  const signal = AbortSignal.timeout(timeoutMs);

  await streamableRpc(
    url,
    { jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS },
    signal
  );
  await streamableRpc(
    url,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    signal
  );
  const result = (await streamableRpc(
    url,
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    signal
  )) as { tools?: McpTool[] };

  return result?.tools ?? [];
}

// ── Legacy HTTP+SSE transport ─────────────────────────────────────────────────

async function tryLegacySse(url: string, timeoutMs: number): Promise<McpTool[]> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error("timeout")), timeoutMs);

  try {
    const sseResp = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: abort.signal,
    });
    if (!sseResp.ok) throw new Error(`HTTP ${sseResp.status}`);

    const ct = sseResp.headers.get("content-type") ?? "";
    if (!ct.includes("text/event-stream")) {
      throw new Error(`Expected SSE stream, got Content-Type: ${ct}`);
    }

    // Responses arrive on the SSE stream; requests are POSTed to postUrl.
    // We buffer pending promises keyed by request id.
    const pending = new Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >();
    let postUrl: string | null = null;
    const postUrlResolve = Promise.withResolvers<string>();

    // Background reader — wires SSE events to pending promises
    const sseStream = parseSseStream(sseResp.body!, abort.signal);
    const readerDone = (async () => {
      for await (const { event, data } of sseStream) {
        if (event === "endpoint") {
          // Resolve relative paths against the base URL
          const resolved = new URL(data.trim(), url).href;
          postUrlResolve.resolve(resolved);
          postUrl = resolved;
          continue;
        }
        // Default event = JSON-RPC message
        let msg: JsonRpcMsg;
        try {
          msg = JSON.parse(data) as JsonRpcMsg;
        } catch {
          continue;
        }
        if (msg.id === undefined) continue;
        const p = pending.get(msg.id);
        if (!p) continue;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`MCP error: ${msg.error.message}`));
        else p.resolve(msg.result);
      }
      // Stream closed — reject any still-pending requests
      for (const { reject } of pending.values()) {
        reject(new Error("SSE stream closed before response received"));
      }
    })();

    postUrl = await postUrlResolve.promise;

    const post = (body: JsonRpcMsg): Promise<unknown> => {
      const req = fetch(postUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      if (body.id === undefined) return req.then(() => undefined);

      return new Promise((resolve, reject) => {
        pending.set(body.id!, { resolve, reject });
        req.catch(reject);
      });
    };

    await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS });
    await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    const result = (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as {
      tools?: McpTool[];
    };

    abort.abort();
    await readerDone.catch(() => {}); // ignore — we triggered the abort intentionally

    return result?.tools ?? [];
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Lists tools from an HTTP MCP server.
 *
 * Tries Streamable HTTP first. If that fails, falls back to legacy HTTP+SSE.
 * Returns both the tool list and the transport that succeeded so callers can
 * report it. Throws with both failure reasons if neither transport works.
 */
export async function listMcpToolsHttp(
  url: string,
  timeoutMs = 10_000
): Promise<HttpListResult> {
  let streamableError: string | null = null;

  try {
    const tools = await tryStreamableHttp(url, timeoutMs);
    return { tools, transport: "streamable-http" };
  } catch (e) {
    if (e instanceof McpProtocolError) throw e; // protocol error, not a transport problem
    streamableError = e instanceof Error ? e.message : String(e);
  }

  try {
    const tools = await tryLegacySse(url, timeoutMs);
    return { tools, transport: "legacy-sse", streamableError: streamableError ?? undefined };
  } catch (e) {
    const sseError = e instanceof Error ? e.message : String(e);
    throw new Error(`streamable HTTP: ${streamableError}; legacy SSE: ${sseError}`);
  }
}
