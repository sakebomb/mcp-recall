/**
 * Playwright handler — turns a page snapshot into a flat outline the agent can
 * still act on: every visible name and text, each element's ref, and each link's
 * target, without the wrappers, nesting and cursor flags that make up most of it.
 *
 * Playwright MCP answers browser_snapshot, every action (navigate, click, …) and
 * browser_evaluate in "### " sections: the result, the code it ran, the page URL
 * and title, a "### Snapshot" ```yaml block and the console events. The
 * snapshot becomes an outline and the events are trimmed; every other section
 * is kept as it is (#424) up to SECTION_BYTES, then cut to its head (#434), so a
 * large evaluate or network result does not pass through whole.
 */
import { formatBytes } from "../format";
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const SNAPSHOT_HEADING = "### Snapshot";
const EVENTS_HEADING = "### Events";
const EVENT_LINES = 5;
/** Kept of any other section; the full output stays stored for recall__retrieve. */
const SECTION_BYTES = 4096;
const EMPTY = "[snapshot: no interactive elements or visible text extracted]";

/** Sections that open a Playwright MCP page response: an action, an evaluate, or a snapshot. */
const PAGE_SECTION = /^### (Snapshot|Result|Ran Playwright code)$/m;

/** Roles kept with no name or text: the agent acts on them, or they group what follows. */
const KEEP_BARE = new Set([
  "article", "row", "dialog", "form", "table", "alert",
  "button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio",
  "slider", "spinbutton", "switch", "tab", "menuitem", "option",
]);

/** Attributes kept as states. ref is kept on its own; cursor, active and level are dropped. */
const STATES = new Set(["checked", "disabled", "expanded", "selected", "pressed", "required"]);

// role "name" [attr] [attr=v]: text
const LINE = /^([a-z][\w-]*)(?:\s+"((?:[^"\\]|\\.)*)")?((?:\s+\[[^\]]*\])*)\s*(?::\s*(.*))?$/i;

type Node = { role: string; name: string; ref: string; states: string[]; text: string; clickable: boolean };

function isPlaywrightPage(text: string): boolean {
  return PAGE_SECTION.test(text);
}

export function isPlaywrightResponse(output: unknown): boolean {
  return isPlaywrightPage(extractText(output));
}

/** YAML single-quotes a line holding ": " or a quote: `'heading "''x'': y" [ref=e1]':`. */
function unquoteYaml(s: string): string {
  const m = s.match(/^'(.*)'(:?)$/);
  return m ? m[1].replace(/''/g, "'") + m[2] : s;
}

function unquoteValue(v: string): string {
  const t = v.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function parseLine(raw: string): Node | { url: string } | null {
  const s = raw.trim();
  if (!s.startsWith("- ")) return null;
  const body = unquoteYaml(s.slice(2).trim());
  if (body.startsWith("/url:")) return { url: unquoteValue(body.slice(5)) };
  const m = body.match(LINE);
  if (!m) return null;
  const [, role, name = "", attrs = "", text = ""] = m;
  let ref = "";
  let clickable = false;
  const states: string[] = [];
  for (const [, attr] of attrs.matchAll(/\[([^\]]*)\]/g)) {
    const [key, value] = attr.split("=");
    if (key === "ref") ref = value ?? "";
    else if (key === "cursor") clickable = value === "pointer";
    else if (STATES.has(key)) states.push(attr);
  }
  return { role, name, ref, states, text: unquoteValue(text), clickable };
}

function render(n: Node): string {
  const head = [n.role, n.name && `"${n.name}"`, n.ref, ...n.states].filter(Boolean).join(" ");
  return n.text ? `${head}: ${n.text}` : head;
}

/** One line per element worth reading or acting on, in page order, unindented. */
function outline(tree: string): string[] {
  const out: string[] = [];
  let linkAt = -1;
  let lastSaid = "";
  for (const line of tree.split("\n")) {
    const node = parseLine(line);
    if (!node) continue;
    if ("url" in node) {
      if (linkAt >= 0 && linkAt === out.length - 1) out[linkAt] += ` → ${node.url}`;
      continue;
    }
    // A bare wrapper nobody clicks, or a line that repeats the one above (a strong inside its link).
    if (!node.name && !node.text && !node.clickable && !KEEP_BARE.has(node.role)) continue;
    if (!node.name && node.text && node.text === lastSaid) continue;
    out.push(render(node));
    lastSaid = node.name || node.text;
    linkAt = node.role === "link" ? out.length - 1 : -1;
  }
  return out;
}

/** The YAML tree inside a snapshot section's ```yaml fence. */
function snapshotTree(section: string): string {
  const open = section.indexOf("```yaml");
  const from = open >= 0 ? open + "```yaml".length : SNAPSHOT_HEADING.length;
  const close = section.indexOf("\n```", from);
  return section.slice(from, close >= 0 ? close : undefined);
}

function renderSnapshot(tree: string): string {
  const lines = outline(tree);
  return lines.length > 0
    ? `${SNAPSHOT_HEADING} (outline: one line per element, refs as on the page)\n${lines.join("\n")}`
    : "";
}

/** The first few events and every error; the rest is console noise (hundreds of warnings). */
function trimEvents(section: string): string {
  const [heading, ...lines] = section.split("\n").filter((l) => l.trim());
  const kept = lines.filter((l, i) => i < EVENT_LINES || l.includes("[ERROR]"));
  const more = lines.length - kept.length;
  return [heading, ...kept, ...(more > 0 ? [`… (+${more} more event lines)`] : [])].join("\n");
}

/** A section up to SECTION_BYTES, else its head, ending on a line break where one is near. */
function capSection(section: string): string {
  const text = section.trim();
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= SECTION_BYTES) return text;
  // Decoding a byte slice can end in U+FFFD where it splits a character; drop it.
  let head = buf.subarray(0, SECTION_BYTES).toString("utf8").replace(/�$/, "");
  const lineEnd = head.lastIndexOf("\n");
  if (lineEnd > SECTION_BYTES / 2) head = head.slice(0, lineEnd);
  const cut = buf.length - Buffer.byteLength(head, "utf8");
  return `${head}\n… (+${formatBytes(cut)} more in this section)`;
}

export const playwrightHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  // A bare tree, with none of the sections a page response carries.
  if (!isPlaywrightPage(raw)) {
    return { summary: renderSnapshot(raw) || EMPTY, originalSize };
  }
  const summary = raw
    .split(/^(?=### )/m)
    .map((section) => {
      if (section.startsWith(SNAPSHOT_HEADING)) return renderSnapshot(snapshotTree(section));
      if (section.startsWith(EVENTS_HEADING)) return trimEvents(section);
      return capSection(section);
    })
    .filter(Boolean)
    .join("\n");
  return { summary: summary || EMPTY, originalSize };
};
