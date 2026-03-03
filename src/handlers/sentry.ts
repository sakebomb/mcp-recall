/**
 * Sentry handler — summarises Sentry error events by extracting the exception
 * type/message, the last N stack frames (innermost = most relevant), and key
 * metadata (level, environment, release, event_id).
 *
 * Drops: breadcrumbs, SDK info, full request headers, extra frames.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const MAX_FRAMES = 8;

type JsonObject = Record<string, unknown>;

interface StackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}

interface ExceptionValue {
  type?: string;
  value?: string;
  stacktrace?: { frames?: StackFrame[] };
}

function formatFrame(frame: StackFrame): string {
  const location = [frame.filename, frame.lineno ? `:${frame.lineno}` : ""].join("");
  const fn = frame.function ?? "<anonymous>";
  return `  ${location} in ${fn}`;
}

function summariseSentryEvent(event: JsonObject): string {
  const parts: string[] = [];

  // Exception type + value
  const exceptionObj = event["exception"] as JsonObject | undefined;
  const values = exceptionObj?.["values"] as ExceptionValue[] | undefined;
  const firstException = values?.[0];

  if (firstException) {
    const type = firstException.type ?? "Error";
    const msg = firstException.value ?? "(no message)";
    parts.push(`${type}: ${msg}`);
  }

  // Metadata line
  const meta: string[] = [];
  if (typeof event["level"] === "string") meta.push(`[${event["level"]}]`);
  if (typeof event["environment"] === "string") meta.push(`env:${event["environment"]}`);
  if (typeof event["release"] === "string") meta.push(`release:${event["release"]}`);
  if (typeof event["event_id"] === "string") meta.push(`id:${event["event_id"].slice(0, 8)}`);
  if (meta.length > 0) parts.push(meta.join(" "));

  // Stack frames — ordered innermost-last, so take the last MAX_FRAMES
  const frames = firstException?.stacktrace?.frames;
  if (frames && frames.length > 0) {
    const relevant = frames.slice(-MAX_FRAMES);
    const skipped = frames.length - relevant.length;
    const header =
      skipped > 0
        ? `Stack (last ${relevant.length} of ${frames.length} frames):`
        : `Stack (${frames.length} frame${frames.length === 1 ? "" : "s"}):`;
    parts.push(header);
    parts.push(...relevant.map(formatFrame));
  }

  return parts.join("\n");
}

export const sentryHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}\n…` : excerpt,
      originalSize,
    };
  }

  // Handle array of events (e.g. list_issues returns multiple events)
  if (Array.isArray(parsed)) {
    const events = parsed as unknown[];
    const lines = events
      .slice(0, 5)
      .map((e) =>
        typeof e === "object" && e !== null
          ? summariseSentryEvent(e as JsonObject)
          : String(e)
      );
    const more = events.length > 5 ? `\n…and ${events.length - 5} more` : "";
    return { summary: lines.join("\n---\n") + more, originalSize };
  }

  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summariseSentryEvent(parsed as JsonObject), originalSize };
  }

  return { summary: String(parsed), originalSize };
};
