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
