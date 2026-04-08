import { describe, it, expect } from "bun:test";
import { containsSecret, findSecrets } from "../src/secrets";

describe("containsSecret", () => {
  it("returns false for clean content", () => {
    expect(containsSecret("Hello, world!")).toBe(false);
    expect(containsSecret("some normal tool output with numbers 12345")).toBe(false);
    expect(containsSecret("")).toBe(false);
  });

  it("detects PEM private key header", () => {
    expect(containsSecret("-----BEGIN RSA PRIVATE KEY-----\nMIIE...")).toBe(true);
    expect(containsSecret("-----BEGIN PRIVATE KEY-----\nMIIE...")).toBe(true);
    expect(containsSecret("-----BEGIN EC PRIVATE KEY-----\nMIIE...")).toBe(true);
  });

  it("detects SSH private key header", () => {
    expect(containsSecret("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC...")).toBe(true);
  });

  it("detects GitHub PAT classic (ghp_)", () => {
    const token = "ghp_" + "A".repeat(36);
    expect(containsSecret(`token: ${token}`)).toBe(true);
  });

  it("detects GitHub PAT fine-grained (github_pat_)", () => {
    const token = "github_pat_" + "A".repeat(82);
    expect(containsSecret(`Authorization: ${token}`)).toBe(true);
  });

  it("detects GitHub OAuth token (gho_)", () => {
    const token = "gho_" + "A".repeat(36);
    expect(containsSecret(token)).toBe(true);
  });

  it("detects OpenAI API key (sk-)", () => {
    const key = "sk-" + "A".repeat(32);
    expect(containsSecret(`OPENAI_API_KEY=${key}`)).toBe(true);
  });

  it("detects OpenAI project key (sk-proj-)", () => {
    const key = "sk-proj-" + "A".repeat(40);
    expect(containsSecret(`OPENAI_API_KEY=${key}`)).toBe(true);
    const hits = findSecrets(key);
    expect(hits).toContain("OpenAI API key");
  });

  it("OpenAI pattern does not false-positive on Anthropic keys (sk-ant-)", () => {
    // sk-ant- keys must be caught by the Anthropic pattern, not reported as OpenAI
    const key = "sk-ant-" + "A".repeat(32);
    const hits = findSecrets(key);
    expect(hits).toContain("Anthropic API key");
    expect(hits).not.toContain("OpenAI API key");
  });

  it("detects Anthropic API key (sk-ant-)", () => {
    const key = "sk-ant-" + "A".repeat(32);
    expect(containsSecret(`ANTHROPIC_API_KEY=${key}`)).toBe(true);
  });

  it("detects AWS access key ID", () => {
    expect(containsSecret("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE")).toBe(true);
  });

  it("detects generic Bearer token", () => {
    const token = "Bearer " + "A".repeat(32);
    expect(containsSecret(`Authorization: ${token}`)).toBe(true);
  });

  it("does not flag short Bearer values", () => {
    expect(containsSecret("Authorization: Bearer short")).toBe(false);
  });
});

describe("containsSecret — new patterns", () => {
  it("detects GCP service account JSON", () => {
    expect(containsSecret('{"type": "service_account", "project_id": "my-proj"}')).toBe(true);
    expect(containsSecret('{"type":"service_account"}')).toBe(true);
  });

  it("does not flag non-service-account type fields", () => {
    expect(containsSecret('{"type": "user"}')).toBe(false);
    expect(containsSecret('{"type": "authorized_user"}')).toBe(false);
  });

  it("detects Azure storage connection string", () => {
    const key = "A".repeat(88) + "==";
    expect(containsSecret(`DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=${key}`)).toBe(true);
  });

  it("does not flag Azure string missing AccountKey", () => {
    expect(containsSecret("DefaultEndpointsProtocol=https;AccountName=myaccount")).toBe(false);
  });

  it("detects Stripe live secret key (sk_live_)", () => {
    const key = "sk_live_" + "A".repeat(24);
    expect(containsSecret(`STRIPE_SECRET_KEY=${key}`)).toBe(true);
  });

  it("detects Stripe restricted key (rk_live_)", () => {
    const key = "rk_live_" + "A".repeat(24);
    expect(containsSecret(key)).toBe(true);
  });

  it("detects Stripe test secret key (sk_test_)", () => {
    const key = "sk_test_" + "A".repeat(24);
    expect(containsSecret(key)).toBe(true);
  });

  it("does not flag Stripe publishable keys (pk_)", () => {
    const key = "pk_live_" + "A".repeat(24);
    expect(containsSecret(key)).toBe(false);
  });

  it("detects SendGrid API key", () => {
    const key = "SG." + "A".repeat(22) + "." + "B".repeat(43);
    expect(containsSecret(`SENDGRID_API_KEY=${key}`)).toBe(true);
  });

  it("does not flag short SG. values", () => {
    expect(containsSecret("SG.short.value")).toBe(false);
  });

  it("detects Twilio Account SID", () => {
    const sid = "AC" + "a".repeat(32);
    expect(containsSecret(`TWILIO_ACCOUNT_SID=${sid}`)).toBe(true);
  });

  it("does not flag short AC hex strings", () => {
    expect(containsSecret("AC" + "a".repeat(31))).toBe(false);
  });

  it("detects npm publish token", () => {
    const token = "npm_" + "A".repeat(36);
    expect(containsSecret(`NPM_TOKEN=${token}`)).toBe(true);
  });

  it("does not flag short npm_ strings", () => {
    expect(containsSecret("npm_" + "A".repeat(35))).toBe(false);
  });
});

describe("findSecrets", () => {
  it("returns empty array for clean content", () => {
    expect(findSecrets("normal output")).toEqual([]);
  });

  it("returns matched pattern names", () => {
    const content = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...";
    const matches = findSecrets(content);
    expect(matches).toContain("PEM private key");
  });

  it("returns multiple matches when multiple patterns hit", () => {
    const pem = "-----BEGIN PRIVATE KEY-----";
    const awsKey = "AKIAIOSFODNN7EXAMPLE";
    const matches = findSecrets(`${pem}\n${awsKey}`);
    expect(matches).toContain("PEM private key");
    expect(matches).toContain("AWS access key ID");
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does not include unmatched pattern names", () => {
    const token = "ghp_" + "A".repeat(36);
    const matches = findSecrets(token);
    expect(matches).toContain("GitHub PAT (classic)");
    expect(matches).not.toContain("PEM private key");
    expect(matches).not.toContain("AWS access key ID");
  });
});
