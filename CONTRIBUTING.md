# Contributing to mcp-recall

Issues and PRs welcome. For significant changes, open an issue first to discuss the approach.

## Setup

```bash
git clone https://github.com/sakebomb/mcp-recall
cd mcp-recall
bun install        # installs deps and wires the pre-commit hook via 'prepare'
bun test           # verify everything passes
```

**Prerequisites**: [Bun](https://bun.sh) ≥ 1.1.0.

## Development workflow

- `bun test` — run all tests
- `bun test --watch` — watch mode
- `bun run typecheck` — `tsc --noEmit`
- `bun run build` — bundle `src/` → `plugins/mcp-recall/dist/` (required before commit if you change `src/`)
- `bun run dev` — MCP server in watch mode

The pre-commit hook (`bun install` wires it automatically) detects staged `src/` changes and runs `bun run build` + stages the updated `dist/` files. You won't need to run it manually.

## Branch naming

| Prefix | Use |
|--------|-----|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `refactor/` | Code change with no behaviour change |
| `test/` | Test-only change |
| `chore/` | Tooling, docs, config |

## Testing

- New features require tests. Bug fixes require regression tests.
- Test files: `tests/<module>.test.ts` using Bun's native test runner.
- Name tests: `"<what> <expected>"` — e.g. `"storeOutput returns hydrated row"`.
- All tests must pass before opening a PR (`bun test`).
- Call `resetConfig()` in `afterEach` for config tests to prevent cache bleed.
- Use `":memory:"` for DB tests and call `closeDb()` in `afterEach`.

## Error contract

mcp-recall must never break a tool call under any failure condition. Every new code path that can fail must degrade gracefully to the original uncompressed output. See the Error contract section in the README.

## PR checklist

- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run build` run if any `src/` files changed (pre-commit hook does this automatically)
- [ ] New tests added for new behaviour
- [ ] PR title < 70 characters
- [ ] PR body includes `## Summary` and `## Test plan`

## Contributing a profile

The easier contribution path — declarative TOML, no TypeScript, no clone of this repo needed. Profiles live in [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles).

### Option A — use `retrain` to generate suggestions from your own usage data

If you've been using an MCP with mcp-recall already, it likely has stored outputs you can analyse:

```bash
mcp-recall profiles retrain          # see what fields appear frequently
mcp-recall profiles retrain --apply  # append suggestions to matching profiles
```

Verify the updated profile compresses as expected:

```bash
mcp-recall profiles test mcp__myservice__some_tool --stored <recall_id>
```

Then prepare for submission:

```bash
mcp-recall profiles feed ~/.config/mcp-recall/profiles/mcp__myservice/default.toml
```

→ [Full retrain guide](docs/retrain.md)

### Option B — write a profile from scratch

See [docs/profile-schema.md](docs/profile-schema.md) for the full schema and [sakebomb/mcp-recall-profiles/CONTRIBUTING.md](https://github.com/sakebomb/mcp-recall-profiles/blob/main/CONTRIBUTING.md) for the submission checklist.

---

## Adding a compression handler

Handlers are the best way to contribute. Each one targets a specific MCP tool (or family of tools) and reduces its output to an actionable summary. Check the [open issues](https://github.com/sakebomb/mcp-recall/issues?q=is%3Aopen+label%3Afeature) for handler requests, or open one yourself. Comment on an issue to claim it before starting.

> **Profiles first**: before writing a TypeScript handler, check whether a TOML profile would suffice. See [docs/profile-schema.md](docs/profile-schema.md#when-to-write-a-profile-vs-a-typescript-handler) for the decision table. Profiles are easier to write, review, and maintain.

### The contract

```ts
// src/handlers/types.ts
export interface CompressionResult {
  summary: string;     // what Claude sees instead of the full output
  originalSize: number; // byte size of the full content (always from extractText)
}

export type Handler = (toolName: string, output: unknown) => CompressionResult;
```

A handler receives the raw MCP `output` (which may be a `{ content: [{ type: "text", text: "..." }] }` wrapper or a plain string) and returns a compressed `summary` plus the `originalSize`.

**Rules:**
- Always call `extractText(output)` first and use its result for `originalSize`. Never measure the raw `output` object.
- **Never throw.** If `JSON.parse()` fails, a field is missing, or the shape is unexpected — return a graceful fallback (e.g. `{ summary: raw.slice(0, 500), originalSize }`). The handler is called inside a live hook; an unhandled exception breaks the tool call for the user.
- Return a result for every code path — no `undefined`, no `null`.
- Keep `summary` under ~1 KB for typical inputs. The goal is to give Claude enough to reason with, not a full reproduction.
- The function must be a named `const` export (e.g. `export const jiraHandler: Handler = ...`). The name shows up in `[recall:debug]` logs.

### Step 1 — Create the handler file

Use `src/handlers/slack.ts` as your reference — it's the simplest real-world example.

```ts
// src/handlers/jira.ts
/**
 * Jira handler — summarises issue and search results from the Jira MCP.
 * Extracts key, summary, status, assignee, and priority. Discards
 * description bodies, comment threads, and raw field metadata.
 */
import type { CompressionResult, Handler } from "./types";
import { extractText } from "./types";

const MAX_ISSUES = 10;

export const jiraHandler: Handler = (
  _toolName: string,
  output: unknown
): CompressionResult => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — fall back to a plain text excerpt
    return { summary: raw.slice(0, 500), originalSize };
  }

  // ... extract the fields you care about ...

  return { summary: "...", originalSize };
};
```

### Step 2 — Register in the dispatcher

Open `src/handlers/index.ts`. Add your import and a match condition in the dispatch function. Conditions are checked top-to-bottom — put more specific matches above generic ones.

```ts
// import
import { jiraHandler } from "./jira";

// inside getHandler(), before the content-based fallbacks:
if (toolName.includes("jira")) {
  return jiraHandler;
}
```

Add a numbered comment to the dispatch table JSDoc to keep it in sync.

### Step 3 — Capture a real fixture

The easiest way to write tests is to capture a real tool output first.

```bash
# Start Claude with debug logging
RECALL_DEBUG=1 claude

# Run the MCP tool you're targeting (e.g. ask Claude to search Jira)
# The hook logs will show: [recall:debug] intercepted mcp__jira__search_issues · 14.2KB
# If it falls through to genericHandler, the output isn't being matched yet

# Alternatively: add a temporary console.log in the handler during dev,
# or paste a real API response from the MCP tool's docs into a fixture file.
```

Save the captured output as a `const` in your test file — see the `LARGE_GITHUB_RESPONSE` fixture in `tests/hooks.test.ts` as a pattern.

### Step 4 — Write tests

Add a `describe` block to `tests/handlers.test.ts`. Aim for at least 5 tests:

```ts
import { jiraHandler } from "../src/handlers/jira";
import { getHandler } from "../src/handlers/index";

const JIRA_ISSUE = JSON.stringify({
  issues: [
    { key: "PROJ-1", fields: { summary: "Fix login bug", status: { name: "In Progress" }, assignee: { displayName: "Alice" }, priority: { name: "High" } } },
    { key: "PROJ-2", fields: { summary: "Add dark mode", status: { name: "Todo" }, assignee: null, priority: { name: "Medium" } } },
  ],
  total: 2,
});

describe("jiraHandler", () => {
  it("extracts issue key and summary", () => {
    const { summary } = jiraHandler("mcp__jira__search_issues", JIRA_ISSUE);
    expect(summary).toContain("PROJ-1");
    expect(summary).toContain("Fix login bug");
  });

  it("includes status and assignee", () => {
    const { summary } = jiraHandler("mcp__jira__search_issues", JIRA_ISSUE);
    expect(summary).toContain("In Progress");
    expect(summary).toContain("Alice");
  });

  it("reports originalSize in bytes", () => {
    const { originalSize } = jiraHandler("mcp__jira__search_issues", JIRA_ISSUE);
    expect(originalSize).toBe(Buffer.byteLength(JIRA_ISSUE, "utf8"));
  });

  it("handles MCP content wrapper", () => {
    const output = { content: [{ type: "text", text: JIRA_ISSUE }] };
    const { summary } = jiraHandler("mcp__jira__search_issues", output);
    expect(summary).toContain("PROJ-1");
  });

  it("returns fallback for non-JSON output", () => {
    const { summary } = jiraHandler("mcp__jira__search_issues", "plain text output");
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("is routed by getHandler for mcp__jira__ tools", () => {
    const handler = getHandler("mcp__jira__search_issues", JIRA_ISSUE);
    expect(handler).toBe(jiraHandler);
  });
});
```

### Step 5 — Update the README

Add a row to the Compression handlers table in `README.md`:

```
│  Jira       → issues  │
```

### PR checklist for handlers

- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] Handler is a named `const` export
- [ ] `extractText` used for `originalSize`
- [ ] No throws — every code path returns a `CompressionResult`
- [ ] ≥ 5 tests including: basic extraction, MCP wrapper, `originalSize`, fallback, dispatcher routing
- [ ] Row added to README compression handler table
- [ ] Issue number referenced in PR title (e.g. `feat: Jira compression handler (#49)`)
