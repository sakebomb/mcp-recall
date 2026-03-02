import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "input",
  "checkbox",
  "radio",
  "select",
  "combobox",
  "menuitem",
  "tab",
  "searchbox",
  "spinbutton",
  "slider",
  "switch",
]);

const TEXT_ROLES = new Set([
  "heading",
  "paragraph",
  "statictext",
  "text",
  "label",
  "status",
  "alert",
  "cell",
  "columnheader",
  "rowheader",
]);

const MAX_INTERACTIVE = 20;
const MAX_TEXT_CHARS = 400;

export const playwrightHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  const interactive: string[] = [];
  const textChunks: string[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Accessibility tree lines look like:  - role "label" [attr=val]
    const match = trimmed.match(/^-\s+(\w+)\s+"([^"]*)"(.*)$/i);
    if (!match) continue;

    const [, role, label] = match;
    const roleLower = role.toLowerCase();

    if (INTERACTIVE_ROLES.has(roleLower) && interactive.length < MAX_INTERACTIVE) {
      interactive.push(`[${roleLower} "${label}"]`);
    } else if (TEXT_ROLES.has(roleLower) && label.trim().length > 0) {
      textChunks.push(label.trim());
    }
  }

  const textContent = textChunks
    .join(" ")
    .slice(0, MAX_TEXT_CHARS)
    .trimEnd();

  const parts: string[] = [];
  if (interactive.length > 0) {
    parts.push(`Interactive: ${interactive.join(", ")}`);
  }
  if (textContent.length > 0) {
    parts.push(`Visible text: ${textContent}`);
  }

  const summary =
    parts.length > 0
      ? parts.join("\n")
      : "[snapshot: no interactive elements or visible text extracted]";

  return { summary, originalSize };
};
