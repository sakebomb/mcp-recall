export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

/**
 * Patterns for detecting secrets in tool output content.
 * Any match prevents storage regardless of denylist settings.
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
    name: "OpenAI API key",
    pattern: /sk-[A-Za-z0-9]{32,}/,
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
