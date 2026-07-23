/**
 * Retrieval hints — deterministic, zero-dependency extraction of a few salient
 * search terms from stored tool output.
 *
 * The hints are emitted in the recall header returned to Claude so its first
 * `recall__search` query lands on a real term instead of guessing keywords
 * (the guess → miss → retry loop). Terms are drawn from the full content, which
 * the FTS index covers (`outputs_fts` indexes `full_content`), so every hint is
 * guaranteed to match the stored item on search.
 *
 * No LLM, no network — pure frequency-and-shape heuristics.
 */

const DEFAULT_MAX_HINTS = 5;
const MIN_TOKEN_LEN = 3;
const MAX_TOKEN_LEN = 40;
const IDENTIFIER_BOOST = 2;
const PROPER_NOUN_BOOST = 1;

/** Tokens start with a letter; allow digits/underscore so identifiers survive. */
const TOKEN_RE = /[A-Za-z][A-Za-z0-9_]*/g;

/** camelCase / PascalCase boundary, e.g. the "nT" in "sessionToken". */
const CAMEL_RE = /[a-z][A-Z]/;

/**
 * Non-discriminating tokens: articles, conjunctions, pronouns, common
 * auxiliaries, and literal values. Kept intentionally small — pruning genuine
 * domain terms would defeat the purpose.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "are", "with", "this", "that", "from", "into", "over",
  "has", "have", "had", "was", "were", "will", "would", "should", "could",
  "not", "but", "you", "your", "yours", "all", "any", "can", "use", "used",
  "using", "its", "out", "per", "via", "one", "two", "get", "set", "new",
  "null", "true", "false", "none", "nan", "undefined",
]);

interface TokenAcc {
  display: string;
  count: number;
  identifier: boolean;
  proper: boolean;
}

function isIdentifier(token: string): boolean {
  return token.includes("_") || CAMEL_RE.test(token);
}

/**
 * Extract up to `maxHints` salient search terms from `content`, ranked by
 * frequency with a boost for identifier-shaped and capitalized tokens.
 * Deterministic: equal-scoring tokens are ordered alphabetically.
 */
export function extractHints(content: string, maxHints = DEFAULT_MAX_HINTS): string[] {
  if (maxHints <= 0) return [];

  const acc = new Map<string, TokenAcc>();
  // matchAll iterates lazily — it never materializes a full token array and
  // does not mutate TOKEN_RE.lastIndex, so this is safe to call repeatedly on
  // large content without a peak-memory spike.
  for (const match of content.matchAll(TOKEN_RE)) {
    const raw = match[0];
    if (raw.length < MIN_TOKEN_LEN || raw.length > MAX_TOKEN_LEN) continue;
    const key = raw.toLowerCase();
    if (STOPWORDS.has(key)) continue;

    const existing = acc.get(key);
    if (existing) {
      existing.count++;
    } else {
      acc.set(key, {
        display: raw,
        count: 1,
        identifier: isIdentifier(raw),
        proper: raw[0] >= "A" && raw[0] <= "Z",
      });
    }
  }

  return [...acc.values()]
    .map((t) => ({
      display: t.display,
      key: t.display.toLowerCase(),
      score:
        t.count +
        (t.identifier ? IDENTIFIER_BOOST : 0) +
        (t.proper ? PROPER_NOUN_BOOST : 0),
    }))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, maxHints)
    .map((t) => t.display);
}
