export const CHUNK_SIZE = 512;
export const CHUNK_OVERLAP = 64;

/**
 * Splits text into overlapping fixed-size chunks for precise FTS retrieval.
 * Short texts (≤ CHUNK_SIZE) are returned as a single-element array.
 */
export function chunkText(text: string): string[] {
  if (text.length === 0) return [];
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  for (let pos = 0; pos < text.length; pos += step) {
    chunks.push(text.slice(pos, pos + CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Escapes an FTS5 query to prevent syntax errors from user input.
 * Wraps each whitespace-separated term in double-quotes so FTS5
 * treats special characters (AND, OR, NOT, NEAR, brackets) as literals.
 */
export function sanitizeFtsQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) return '""';
  return trimmed
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" ");
}
