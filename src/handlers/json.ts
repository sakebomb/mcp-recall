/**
 * JSON handler — the fallback for unrecognised JSON tool outputs. Spends a
 * character budget over the document instead of cutting at a fixed depth
 * (#403): wrapper levels cost only their keys, a string is cut rather than
 * dropped and says how much it lost, an array shows as many items as fit and
 * counts the rest, and fields every item of an array shares are stated once.
 * Numbers, booleans and null are always kept. The summary is compact JSON.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

/** The summary's size, in characters of compact JSON. */
export const JSON_BUDGET = 4096;
// Each array item or field gets at least this much of what is left, so short
// items show whole instead of every item being starved to a stub.
const SHARE_FLOOR = 512;
// Below this an item or field is not started; the rest are counted instead.
const MIN_PART = 24;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const size = (v: unknown): number => JSON.stringify(v).length;
const isObject = (v: Json): v is { [key: string]: Json } => v !== null && typeof v === "object" && !Array.isArray(v);

function fitString(s: string, budget: number): string {
  if (size(s) <= budget) return s;
  // Escapes make the JSON longer than the string, so shrink until it fits.
  let keep = Math.max(0, budget - 24);
  for (;;) {
    const cut = `${s.slice(0, keep)}…[+${s.length - keep} chars]`;
    if (size(cut) <= budget || keep === 0) return cut;
    keep = Math.max(0, keep - Math.max(1, size(cut) - budget));
  }
}

/** The share of `remaining` the next of `rest` parts may use. */
const share = (remaining: number, rest: number) => Math.max(remaining / rest, Math.min(remaining, SHARE_FLOOR));

/** Fields with the same value in every item of an array of objects, when there are any. */
function sharedFields(items: Json[]): { [key: string]: Json } | null {
  if (items.length < 2 || !items.every(isObject)) return null;
  const [first, ...rest] = items as { [key: string]: Json }[];
  const shared: { [key: string]: Json } = {};
  for (const [k, v] of Object.entries(first)) {
    const json = JSON.stringify(v);
    if (rest.every((item) => k in item && JSON.stringify(item[k]) === json)) shared[k] = v;
  }
  return Object.keys(shared).length > 0 ? shared : null;
}

function fitArray(items: Json[], budget: number): Json[] {
  const shared = sharedFields(items);
  const out: Json[] = shared ? [{ [`…each of ${items.length} items has`]: shared }] : [];
  const parts = shared
    ? items.map((item) => Object.fromEntries(Object.entries(item as object).filter(([k]) => !(k in shared))) as Json)
    : items;
  // Brackets, plus room for the "…N more" note.
  let remaining = budget - size(out) - 16;
  let shown = 0;
  for (; shown < parts.length && remaining >= MIN_PART; shown++) {
    const itemBudget = share(remaining, parts.length - shown) - 1;
    // Near the end of the budget an item that does not fit whole would be a stub; count it instead.
    if (size(parts[shown]) > itemBudget && itemBudget < SHARE_FLOOR) break;
    const fitted = fit(parts[shown], itemBudget);
    const used = size(fitted) + 1;
    if (used > remaining) break;
    out.push(fitted);
    remaining -= used;
  }
  if (shown < parts.length) out.push(`…${parts.length - shown} more`);
  return out;
}

/**
 * Each field's budget, filling from the smallest: a field that needs less than
 * an even split takes only what it needs and leaves the rest to larger ones, so
 * a wrapper's one big field gets nearly all of it.
 */
function allocate(needs: number[], budget: number): number[] {
  const out = new Array<number>(needs.length);
  let remaining = budget;
  const order = needs.map((need, i) => ({ need, i })).sort((a, b) => a.need - b.need);
  order.forEach(({ need, i }, n) => {
    out[i] = Math.min(need, remaining / (order.length - n));
    remaining -= out[i];
  });
  return out;
}

function fitObject(obj: { [key: string]: Json }, budget: number): { [key: string]: Json } {
  const entries = Object.entries(obj);
  const keyCosts = entries.map(([k]) => size(k) + 2); // key, colon and comma
  const needs = entries.map(([, v], i) => keyCosts[i] + size(v));
  // Braces, plus room for the "…more fields" note.
  const available = budget - 2 - 24;
  const budgets = allocate(needs, available);
  // Too many fields to give each a usable share: show them in order, as an array does.
  if (budgets.some((b, i) => b < needs[i] && b - keyCosts[i] < MIN_PART)) return fitFieldsInOrder(entries, available);
  return Object.fromEntries(entries.map(([k, v], i) => [k, fit(v, budgets[i] - keyCosts[i])]));
}

function fitFieldsInOrder(entries: [string, Json][], budget: number): { [key: string]: Json } {
  const out: { [key: string]: Json } = {};
  let remaining = budget;
  let shown = 0;
  for (; shown < entries.length && remaining >= MIN_PART; shown++) {
    const [k, v] = entries[shown];
    const keyCost = size(k) + 2;
    const valueBudget = share(remaining, entries.length - shown) - keyCost;
    if (size(v) > valueBudget && valueBudget < SHARE_FLOOR) break;
    const fitted = fit(v, valueBudget);
    const used = keyCost + size(fitted);
    if (used > remaining) break;
    out[k] = fitted;
    remaining -= used;
  }
  if (shown < entries.length) out["…more fields"] = entries.length - shown;
  return out;
}

/** `value` within `budget` characters of compact JSON, or as close as its scalars allow. */
function fit(value: Json, budget: number): Json {
  if (size(value) <= budget) return value;
  if (typeof value === "string") return fitString(value, budget);
  if (Array.isArray(value)) return fitArray(value, budget);
  if (isObject(value)) return fitObject(value, budget);
  return value;
}

export const jsonHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  let parsed: Json;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}\n…` : excerpt,
      originalSize,
    };
  }

  // Compact (no indentation) — smaller inline summary, still fully readable by
  // the model. Keys are kept verbatim rather than abbreviated, so no decode
  // dictionary is needed.
  const summary = JSON.stringify(fit(parsed, JSON_BUDGET));
  return { summary, originalSize };
};
