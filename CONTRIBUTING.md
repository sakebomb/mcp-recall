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

## Adding a compression handler

1. Create `src/handlers/<name>.ts` — export a `Handler` and add a file-level JSDoc comment.
2. Register it in `src/handlers/index.ts` with a tool-name match condition and a comment in the dispatch table.
3. Add tests to `tests/handlers.test.ts` (aim for ≥ 5 tests: basic compression, edge cases, dispatcher routing).
4. Add a row to the Compression handlers table in the README.
