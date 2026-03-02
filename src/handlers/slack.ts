/**
 * Slack handler — formats messages as `#channel [timestamp] user: text`,
 * capping text at 200 chars and the message list at 10. Handles
 * `{ ok, messages }` API responses, bare arrays, and single message objects.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

type JsonObject = Record<string, unknown>;

const MSG_CHARS = 200;
const MAX_MESSAGES = 10;

function formatSlackTs(ts: unknown): string {
  if (typeof ts !== "string" && typeof ts !== "number") return "";
  const secs = typeof ts === "string" ? parseFloat(ts) : ts;
  if (isNaN(secs)) return "";
  return new Date(secs * 1000).toISOString().slice(0, 16).replace("T", " ");
}

function resolveUser(msg: JsonObject): string {
  // Prefer display name over raw ID
  const profile = msg["user_profile"] ?? msg["profile"];
  if (typeof profile === "object" && profile !== null) {
    const p = profile as JsonObject;
    const name = p["display_name"] ?? p["real_name"] ?? p["name"];
    if (typeof name === "string" && name.length > 0) return name;
  }
  return (
    (typeof msg["username"] === "string" ? msg["username"] : null) ??
    (typeof msg["user"] === "string" ? msg["user"] : null) ??
    "unknown"
  );
}

function summariseMessage(msg: JsonObject): string {
  const ts = formatSlackTs(msg["ts"]);
  const user = resolveUser(msg);
  const text = typeof msg["text"] === "string" ? msg["text"] : "";
  const excerpt = text.slice(0, MSG_CHARS).replace(/\n/g, " ").trimEnd();
  const truncated = text.length > MSG_CHARS ? "…" : "";
  const prefix = ts ? `[${ts}] ` : "";
  return `${prefix}${user}: ${excerpt}${truncated}`;
}

function resolveChannel(obj: JsonObject): string | null {
  // { channel: "C12345" } or { channel: { name: "general" } }
  const ch = obj["channel"];
  if (typeof ch === "string") return ch;
  if (typeof ch === "object" && ch !== null) {
    const name = (ch as JsonObject)["name"] ?? (ch as JsonObject)["id"];
    if (typeof name === "string") return `#${name}`;
  }
  // { channelId: "..." }
  if (typeof obj["channelId"] === "string") return obj["channelId"];
  return null;
}

/**
 * Extracts messages array from common Slack MCP response shapes.
 */
function extractMessages(parsed: unknown): { messages: JsonObject[]; channel: string | null } | null {
  if (Array.isArray(parsed)) {
    const msgs = parsed.filter((m): m is JsonObject => typeof m === "object" && m !== null);
    if (msgs.length > 0 && (msgs[0]!["ts"] != null || msgs[0]!["text"] != null)) {
      return { messages: msgs, channel: null };
    }
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as JsonObject;

  // Single message
  if (obj["ts"] != null && obj["text"] != null) {
    return { messages: [obj], channel: resolveChannel(obj) };
  }

  // Wrapper: { messages: [...] } or { ok: true, messages: [...] }
  if (Array.isArray(obj["messages"])) {
    const msgs = (obj["messages"] as unknown[]).filter(
      (m): m is JsonObject => typeof m === "object" && m !== null
    );
    return { messages: msgs, channel: resolveChannel(obj) };
  }

  return null;
}

export const slackHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 500), originalSize };
  }

  const result = extractMessages(parsed);
  if (!result || result.messages.length === 0) {
    return { summary: raw.slice(0, 500), originalSize };
  }

  const { messages, channel } = result;
  const channelPrefix = channel ? `${channel} — ` : "";
  const count = messages.length;

  const lines = messages
    .slice(0, MAX_MESSAGES)
    .map((msg, i) => `${i + 1}. ${summariseMessage(msg)}`);
  const more =
    count > MAX_MESSAGES ? `\n…and ${count - MAX_MESSAGES} more messages` : "";

  return {
    summary: `${channelPrefix}${count} message${count === 1 ? "" : "s"}:\n${lines.join("\n")}${more}`,
    originalSize,
  };
};
