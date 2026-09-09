export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

/**
 * Patterns for detecting secrets in tool output content.
 * Any match prevents storage regardless of denylist settings.
 *
 * ReDoS audit (2026-04-08): no catastrophic backtracking. Worst case is the
 * AWS secret pattern (.{0,20}…{0,20}) at 400 max backtracks — fully bounded.
 * All other patterns use simple character classes with no nested quantifiers.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "PEM private key",
    pattern: /-----BEGIN .{0,20}PRIVATE KEY-----/,
  },
  {
    name: "GitHub PAT (classic)",
    pattern: /ghp_[A-Za-z0-9]{36}/,
  },
  {
    name: "GitHub PAT (fine-grained)",
    pattern: /github_pat_[A-Za-z0-9_]{82}/,
  },
  {
    name: "GitHub OAuth token",
    pattern: /gho_[A-Za-z0-9]{36}/,
  },
  {
    // The tail is base62 with NO hyphen: `[\w-]` here matched any hyphenated slug
    // containing "risk-"/"task-"/"disk-" (#274) — a 97% false-positive rate against
    // a real corpus of engineering notes, and after #271 a *refusal* rather than a
    // silent skip. `sk-proj-` is the current key shape, bare `sk-` the legacy one.
    name: "OpenAI API key",
    pattern: /sk-(?:proj-)?[A-Za-z0-9]{32,}/,
  },
  {
    // Must stay adjacent to the OpenAI entry: `sk-or-v1-` keys were previously
    // caught only *by accident*, via the same over-broad character class that
    // caused #274. Tightening OpenAI without this would swap a false positive
    // for a false negative on a real credential class.
    name: "OpenRouter API key",
    pattern: /sk-or-v1-[A-Za-z0-9]{32,}/,
  },
  {
    name: "AWS access key ID",
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: "AWS secret access key",
    pattern: /aws.{0,20}secret.{0,20}[A-Za-z0-9/+=]{40}/i,
  },
  {
    name: "Anthropic API key",
    pattern: /sk-ant-[A-Za-z0-9\-_]{32,}/,
  },
  {
    name: "Generic Bearer token",
    pattern: /Bearer [A-Za-z0-9\-._~+/]{32,}/,
  },
  {
    name: "SSH private key",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/,
  },
  {
    name: "GCP service account key",
    pattern: /"type"\s*:\s*"service_account"/,
  },
  {
    name: "Azure storage connection string",
    pattern: /DefaultEndpointsProtocol=https?;AccountName=[^;]{1,100};AccountKey=[A-Za-z0-9+/=]{32,}/,
  },
  {
    name: "Stripe secret/restricted key",
    pattern: /[sr]k_(?:live|test)_[A-Za-z0-9]{24,}/,
  },
  {
    name: "SendGrid API key",
    pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/,
  },
  {
    name: "Twilio Account SID",
    pattern: /\bAC[0-9a-f]{32}\b/,
  },
  {
    name: "npm publish token",
    pattern: /npm_[A-Za-z0-9]{36}/,
  },
];

/**
 * Returns true if the content contains any known secret pattern.
 */
export function containsSecret(content: string): boolean {
  return SECRET_PATTERNS.some(({ pattern }) => pattern.test(content));
}

/**
 * Returns the names of all secret patterns matched in the content.
 * Used for logging/diagnostics without exposing the matched value.
 */
export function findSecrets(content: string): string[] {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(
    ({ name }) => name
  );
}
