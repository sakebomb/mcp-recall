/**
 * Minimal stdio MCP client — spawns a server process, performs the
 * initialize handshake, calls tools/list, and returns the tool schemas.
 *
 * Only supports stdio-based servers (command + args). HTTP/SSE servers
 * are skipped by the caller.
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string; // notifications have method, no id
}

/** Buffers a ReadableStream<Uint8Array> and yields complete lines. */
class LineReader {
  private buf = "";
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private dec = new TextDecoder();

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  async readLine(timeoutMs: number): Promise<string | null> {
    const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const read = this._nextLine();
    return Promise.race([read, timer]);
  }

  private async _nextLine(): Promise<string | null> {
    while (true) {
      const nl = this.buf.indexOf("\n");
      if (nl !== -1) {
        const line = this.buf.slice(0, nl).trimEnd();
        this.buf = this.buf.slice(nl + 1);
        return line;
      }
      const { done, value } = await this.reader.read();
      if (done) {
        const line = this.buf.trim();
        this.buf = "";
        return line.length > 0 ? line : null;
      }
      this.buf += this.dec.decode(value, { stream: true });
    }
  }

  release(): void {
    this.reader.releaseLock();
  }
}

/** Reads from `reader` until a JSON-RPC response with the given `id` arrives. */
async function awaitResponse(
  reader: LineReader,
  id: number,
  timeoutMs: number
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const line = await reader.readLine(remaining);
    if (line === null) throw new Error("server closed stdout");
    if (!line.startsWith("{")) continue; // skip blank/log lines
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      continue;
    }
    if (msg.id !== id) continue; // notification or different request
    if (msg.error) throw new Error(`MCP error: ${msg.error.message}`);
    return msg.result;
  }
  throw new Error("timeout waiting for MCP response");
}

/**
 * Spawns the MCP server, performs initialize + tools/list, then kills it.
 * Returns the list of tools or throws on error.
 */
export async function listMcpTools(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs = 10_000
): Promise<McpTool[]> {
  const proc = Bun.spawn([command, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, ...env } as Record<string, string>,
  });

  const reader = new LineReader(proc.stdout);

  function send(msg: unknown): void {
    proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  try {
    // 1. initialize
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-recall-learn", version: "1.0.0" },
      },
    });
    await awaitResponse(reader, 1, timeoutMs);

    // 2. initialized notification (required by spec)
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    // 3. tools/list
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const result = (await awaitResponse(reader, 2, timeoutMs)) as {
      tools?: McpTool[];
    };

    return result?.tools ?? [];
  } finally {
    reader.release();
    proc.stdin.end();
    proc.kill();
  }
}
