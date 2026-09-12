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

  // #274 negative controls. These are verbatim slugs from a real corpus of
  // engineering notes, where the old /sk-(?!ant-)[\w-]{32,}/ scored a 97%
  // false-positive rate: `[\w-]` ate the hyphen, so any "risk-"/"task-"/"disk-"
  // slug looked like a key. After #271 that became a user-facing refusal, not
  // just a silent skip, so these guard a live behaviour.
  it.each([
    "risk-mitigation-through-controlled-rollout",
    "task-notification-and-output-file-tracking",
    "docs/risk-based-pr-splitting-and-continuous-review.md",
    "disk-usage-monitoring-and-alerting-playbook",
    "memoree/knowledge/2026-05-23-task-archiving-as-a-standard-practice-71c096",
    "risk-mitigation-none-526433-state-lockdown-procedures-x",
  ])("does not flag the ordinary slug %s", (slug) => {
    expect(findSecrets(slug)).toEqual([]);
    expect(containsSecret(slug)).toBe(false);
  });

  // #274 false-NEGATIVE controls. Modern OpenAI keys carry a base64url body
  // containing "-" and "_". A first attempt at this fix narrowed the body to
  // [A-Za-z0-9], which killed the slug false positives but then failed open on
  // every current key shape — trading a noisy bug for a silent one. These pin
  // the body permissive; the leading word boundary is what excludes slugs.
  it.each([
    ["sk-proj- with a hyphen early in the body", "sk-proj-Ab3-dEfGh1jKlM2nOpQr5tUvWxYz7aBcDeFgH9jKlMnOpQrStUvWxYz"],
    ["sk-proj- with an underscore early in the body", "sk-proj-Ab3_dEfGh1jKlM2nOpQr5tUvWxYz7aBcDeFgH9jKlMnOpQrStUvWxYz"],
    ["sk-svcacct- service-account key", "sk-svcacct-Ab3dEfGh1jKlM2nOpQr5tUvWxYz7aBcDeFgH9jKlMnOpQrStUv"],
    ["sk-admin- admin key", "sk-admin-Ab3dEfGh1jKlM2nOpQr5tUvWxYz7aBcDeFgH9jKlMnOpQrStUvWx"],
    ["sk-None- legacy key", "sk-None-Ab3dEfGh1jKlM2nOpQr5tUvWxYz7aBcDeFgH9jKlMnOpQrStUvWxY"],
  ])("detects %s", (_label, key) => {
    expect(findSecrets(key)).toContain("OpenAI API key");
    expect(containsSecret(`OPENAI_API_KEY=${key}`)).toBe(true);
  });

  // #276 negative controls. #275's left boundary killed the *fused* slug class
  // ("risk-"/"task-"/"disk-") but not "sk-" as a STANDALONE token followed by a
  // long hyphenated body: an initials-prefixed filename, or a branch named after
  // a two-letter Jira project key. Both match the #275 pattern on main.
  it.each([
    "sk-project-notes-draft-for-final-review.md",
    "sk-1042-add-retry-logic-to-worker-queue",
    "sk-2024-Q3-roadmap-planning-notes-for-team",
    "sk-ui-redesign-migration-checklist-v2",
  ])("does not flag the standalone sk- slug %s", (slug) => {
    expect(findSecrets(slug)).toEqual([]);
    expect(containsSecret(slug)).toBe(false);
  });

  // #276 false-NEGATIVE controls, and the reason arm 2's prefix list is not a
  // trap. Every modern OpenAI key embeds the watermark T3BlbkFJ (base64
  // "OpenAI") mid-body, which gitleaks and Semgrep both key on. Matching it
  // PREFIX-AGNOSTICALLY is what lets an unknown future `sk-<newtype>-` key be
  // caught even though it is absent from the prefix list — the exact
  // false-negative these controls exist to prevent.
  const b64url = (n: number) => {
    const cs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let out = "";
    for (let i = 0; i < n; i++) out += cs[(i * 37 + 11) % cs.length]!;
    return out;
  };
  // Mirrors a real key's anatomy: prefix + ~74 base64url + marker + ~74 base64url.
  const markerKey = (prefix: string, pad = 74) =>
    `sk-${prefix}${b64url(pad)}T3BlbkFJ${b64url(pad)}`;

  it.each([
    ["sk-proj- with watermark", markerKey("proj-")],
    ["sk-svcacct- with watermark", markerKey("svcacct-")],
    ["sk-admin- with watermark", markerKey("admin-")],
    ["legacy bare sk- with watermark", markerKey("")],
    ["an UNKNOWN future prefix with watermark", markerKey("newtype-")],
    ["an unknown prefix with the marker at the far edge", markerKey("newtype-", 74)],
    ["a short-bodied key with watermark", markerKey("proj-", 20)],
  ])("detects %s", (_label, key) => {
    expect(findSecrets(key)).toContain("OpenAI API key");
    expect(containsSecret(`OPENAI_API_KEY=${key}`)).toBe(true);
  });

  it("detects a watermarked key embedded in surrounding prose", () => {
    const key = markerKey("proj-");
    expect(findSecrets(`the key is ${key} — do not commit it`)).toContain("OpenAI API key");
  });

  it("does not flag slugs that embed a real key prefix", () => {
    // The prefix alone is not enough — "task-admin-" and "risk-proj-" contain
    // "sk-admin-" and "sk-proj-" verbatim. Only the boundary separates them.
    expect(findSecrets("task-admin-console-access-policy-and-review-doc")).toEqual([]);
    expect(findSecrets("risk-proj-alpha-beta-gamma-delta-epsilon-zeta")).toEqual([]);
    expect(findSecrets("risk-ant-icipation-and-mitigation-planning-doc-x")).toEqual([]);
  });

  it("detects an OpenRouter key (sk-or-v1-) and labels it as OpenRouter", () => {
    // Previously matched only by accident, through the same over-broad class that
    // caused #274 — so tightening OpenAI without this entry would have swapped a
    // false positive for a false negative on a real credential class.
    const key = "sk-or-v1-" + "9f3a".repeat(16);
    const hits = findSecrets(key);
    expect(hits).toContain("OpenRouter API key");
    expect(containsSecret(key)).toBe(true);
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
