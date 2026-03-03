/**
 * Stripe handler — formats Stripe API responses with proper currency formatting,
 * per-object-type field selection, and both list ({data:[...]}) and single-object support.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

type JsonObject = Record<string, unknown>;

// ── Currency formatting ───────────────────────────────────────────────────────

// Stripe stores amounts in the smallest currency unit (cents for USD).
// Zero-decimal currencies use the whole unit directly.
const ZERO_DECIMAL = new Set([
  "bif", "clp", "gnf", "isk", "jpy", "kmf", "krw", "mga", "pyg",
  "rwf", "ugx", "vnd", "xaf", "xof", "xpf",
]);

function formatAmount(amount: unknown, currency: unknown): string {
  if (typeof amount !== "number") return "";
  const curr = typeof currency === "string" ? currency.toLowerCase() : "usd";
  const value = ZERO_DECIMAL.has(curr) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr.toUpperCase(),
      minimumFractionDigits: ZERO_DECIMAL.has(curr) ? 0 : 2,
    }).format(value);
  } catch {
    return `${curr.toUpperCase()} ${value.toFixed(ZERO_DECIMAL.has(curr) ? 0 : 2)}`;
  }
}

// ── Per-object summarisers ────────────────────────────────────────────────────

function summariseCustomer(item: JsonObject): string {
  const parts: string[] = [];
  if (typeof item["id"] === "string") parts.push(item["id"]);
  if (typeof item["name"] === "string" && item["name"]) parts.push(`"${item["name"]}"`);
  if (typeof item["email"] === "string") parts.push(item["email"]);
  if (typeof item["phone"] === "string" && item["phone"]) parts.push(item["phone"]);
  if (item["delinquent"] === true) parts.push("[delinquent]");
  return parts.join(" · ");
}

function summariseInvoice(item: JsonObject): string {
  const parts: string[] = [];
  if (typeof item["id"] === "string") parts.push(item["id"]);
  if (typeof item["status"] === "string") parts.push(`[${item["status"]}]`);
  const amountDue = item["amount_due"];
  const amountPaid = item["amount_paid"];
  const curr = item["currency"];
  if (typeof amountDue === "number") parts.push(`due: ${formatAmount(amountDue, curr)}`);
  if (typeof amountPaid === "number" && amountPaid > 0) parts.push(`paid: ${formatAmount(amountPaid, curr)}`);
  const name = item["customer_name"] ?? item["customer_email"];
  if (typeof name === "string" && name) parts.push(name);
  if (typeof item["billing_reason"] === "string") parts.push(`reason: ${item["billing_reason"]}`);
  return parts.join(" · ");
}

function summarisePaymentIntent(item: JsonObject): string {
  const parts: string[] = [];
  if (typeof item["id"] === "string") parts.push(item["id"]);
  parts.push(formatAmount(item["amount"], item["currency"]));
  if (typeof item["status"] === "string") parts.push(`[${item["status"]}]`);
  if (typeof item["customer"] === "string" && item["customer"]) parts.push(`customer: ${item["customer"]}`);
  if (typeof item["description"] === "string" && item["description"]) {
    parts.push(item["description"].slice(0, 100));
  }
  return parts.filter(Boolean).join(" · ");
}

function summariseSubscription(item: JsonObject): string {
  const parts: string[] = [];
  if (typeof item["id"] === "string") parts.push(item["id"]);
  if (typeof item["status"] === "string") parts.push(`[${item["status"]}]`);
  const plan = item["plan"] as JsonObject | null | undefined;
  if (plan) {
    if (typeof plan["id"] === "string") parts.push(`plan: ${plan["id"]}`);
    const planAmount = formatAmount(plan["amount"], plan["currency"] ?? item["currency"]);
    if (planAmount) parts.push(planAmount);
  }
  if (typeof item["customer"] === "string") parts.push(`customer: ${item["customer"]}`);
  if (item["cancel_at_period_end"] === true) parts.push("cancels at period end");
  return parts.join(" · ");
}

function summariseProduct(item: JsonObject): string {
  const parts: string[] = [];
  if (typeof item["id"] === "string") parts.push(item["id"]);
  if (typeof item["name"] === "string") parts.push(`"${item["name"]}"`);
  if (item["active"] === false) parts.push("[inactive]");
  if (typeof item["description"] === "string" && item["description"]) {
    parts.push(item["description"].slice(0, 100));
  }
  return parts.join(" · ");
}

function summarisePrice(item: JsonObject): string {
  const parts: string[] = [];
  if (typeof item["id"] === "string") parts.push(item["id"]);
  const amount = formatAmount(item["unit_amount"], item["currency"]);
  if (amount) parts.push(amount);
  const recurring = item["recurring"] as JsonObject | null | undefined;
  if (recurring) {
    const count = recurring["interval_count"];
    const interval = recurring["interval"];
    parts.push(count && count !== 1 ? `every ${count} ${interval}s` : `per ${interval}`);
  }
  if (typeof item["product"] === "string") parts.push(`product: ${item["product"]}`);
  return parts.join(" · ");
}

function summariseDispute(item: JsonObject): string {
  const parts: string[] = [];
  if (typeof item["id"] === "string") parts.push(item["id"]);
  const amount = formatAmount(item["amount"], item["currency"]);
  if (amount) parts.push(amount);
  if (typeof item["status"] === "string") parts.push(`[${item["status"]}]`);
  if (typeof item["reason"] === "string") parts.push(`reason: ${item["reason"]}`);
  if (typeof item["charge"] === "string") parts.push(`charge: ${item["charge"]}`);
  return parts.join(" · ");
}

function summariseBalance(obj: JsonObject): string {
  const lines: string[] = [];
  const available = obj["available"] as Array<{ amount: number; currency: string }> | undefined;
  const pending   = obj["pending"]   as Array<{ amount: number; currency: string }> | undefined;
  for (const b of available ?? []) lines.push(`available: ${formatAmount(b.amount, b.currency)}`);
  for (const b of pending   ?? []) {
    if (b.amount !== 0) lines.push(`pending: ${formatAmount(b.amount, b.currency)}`);
  }
  return lines.join(" · ") || "Balance: $0.00";
}

function summariseAccount(obj: JsonObject): string {
  const parts: string[] = [];
  if (typeof obj["id"] === "string") parts.push(obj["id"]);
  if (typeof obj["display_name"] === "string") parts.push(`"${obj["display_name"]}"`);
  if (typeof obj["email"] === "string") parts.push(obj["email"]);
  if (typeof obj["country"] === "string") parts.push(obj["country"]);
  return parts.join(" · ");
}

function summarisePaymentLink(obj: JsonObject): string {
  const parts: string[] = [];
  if (typeof obj["id"] === "string") parts.push(obj["id"]);
  if (typeof obj["url"] === "string") parts.push(obj["url"]);
  if (obj["active"] === false) parts.push("[inactive]");
  return parts.join(" · ");
}

// ── Route by tool suffix or item object type ──────────────────────────────────

function summariseByObjectType(item: JsonObject): string {
  switch (item["object"]) {
    case "customer":       return summariseCustomer(item);
    case "invoice":        return summariseInvoice(item);
    case "payment_intent": return summarisePaymentIntent(item);
    case "subscription":   return summariseSubscription(item);
    case "product":        return summariseProduct(item);
    case "price":          return summarisePrice(item);
    case "dispute":        return summariseDispute(item);
    case "payment_link":   return summarisePaymentLink(item);
    default: {
      // Fallback: id + a few key fields
      const parts: string[] = [];
      if (typeof item["id"] === "string") parts.push(item["id"]);
      if (typeof item["object"] === "string") parts.push(`[${item["object"]}]`);
      if (typeof item["status"] === "string") parts.push(`[${item["status"]}]`);
      return parts.join(" · ");
    }
  }
}

function pickSummariser(suffix: string): (item: JsonObject) => string {
  if (suffix.includes("customer"))       return summariseCustomer;
  if (suffix.includes("invoice"))        return summariseInvoice;
  if (suffix.includes("payment_intent")) return summarisePaymentIntent;
  if (suffix.includes("subscription"))   return summariseSubscription;
  if (suffix.includes("product"))        return summariseProduct;
  if (suffix.includes("price"))          return summarisePrice;
  if (suffix.includes("dispute"))        return summariseDispute;
  if (suffix.includes("payment_link"))   return summarisePaymentLink;
  // search_stripe_resources / fetch_stripe_resources — route per item by object type
  return summariseByObjectType;
}

// ── List extraction ───────────────────────────────────────────────────────────

const MAX_ITEMS = 10;

function summariseList(items: unknown[], summarise: (item: JsonObject) => string): string {
  const lines = items.slice(0, MAX_ITEMS).map((item) =>
    typeof item === "object" && item !== null ? summarise(item as JsonObject) : String(item)
  );
  const overflow = items.length > MAX_ITEMS ? `\n…and ${items.length - MAX_ITEMS} more` : "";
  return lines.join("\n") + overflow;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const stripeHandler: Handler = (
  toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  // Special cases that return non-standard shapes
  const suffix = toolName.split("__").pop() ?? "";
  if (suffix === "retrieve_balance") {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { summary: raw.slice(0, 500), originalSize }; }
    return { summary: summariseBalance(parsed as JsonObject), originalSize };
  }
  if (suffix === "get_stripe_account_info") {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { summary: raw.slice(0, 500), originalSize }; }
    return { summary: summariseAccount(parsed as JsonObject), originalSize };
  }
  if (suffix === "search_stripe_documentation") {
    return { summary: raw.slice(0, 500).trimEnd(), originalSize };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 500).trimEnd(), originalSize };
  }

  const summarise = pickSummariser(suffix);

  // Stripe list response: { object: "list", data: [...] }
  if (
    typeof parsed === "object" && parsed !== null &&
    Array.isArray((parsed as JsonObject)["data"])
  ) {
    const items = (parsed as JsonObject)["data"] as unknown[];
    if (items.length === 0) return { summary: "No items.", originalSize };
    return { summary: summariseList(items, summarise), originalSize };
  }

  // Bare array
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return { summary: "No items.", originalSize };
    return { summary: summariseList(parsed, summarise), originalSize };
  }

  // Single object (create_*, finalize_*, cancel_*, update_*)
  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summarise(parsed as JsonObject), originalSize };
  }

  return { summary: String(parsed), originalSize };
};
