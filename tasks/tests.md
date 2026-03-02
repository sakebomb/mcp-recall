# tests

Living test registry. Update when adding or removing coverage.

## Run Commands

```bash
bun test              # all tests
bun test --watch      # watch mode
bun run typecheck     # tsc --noEmit (no emit, type check only)
```

## Coverage

### `tests/config.test.ts` — 7 tests
| Test | Description |
|------|-------------|
| loads defaults when no config file exists | returns full default config |
| merges user TOML over defaults | user values override, rest stays default |
| validates compression_ratio_threshold range | rejects values outside 0–1 |
| validates max_stored_bytes positive | rejects non-positive values |
| caches config after first load | second call returns same object |
| resetConfig() clears cache | next load re-reads from disk |
| respects RECALL_CONFIG_PATH env override | reads from custom path |

### `tests/project-key.test.ts` — 6 tests
| Test | Description |
|------|-------------|
| returns git root when inside a git repo | resolves to repo root path |
| falls back to cwd outside a git repo | graceful non-git fallback |
| returns 16-char hex hash | stable SHA256 truncation |
| same path always produces same key | deterministic |
| different paths produce different keys | no collision |
| handles nested subdirectory | resolves to repo root, not subdir |

## Phases Without Tests Yet

- Phase 2: denylist, secrets
- Phase 3: compression handlers
- Phase 4: DB layer
- Phase 5: hooks
- Phase 6: MCP server tools
