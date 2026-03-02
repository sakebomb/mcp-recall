# tests

Living test registry. Update when adding or removing coverage.

## Run Commands

```bash
bun test              # all tests
bun test --watch      # watch mode
bun run typecheck     # tsc --noEmit (no emit, type check only)
```

## Summary

**148 tests across 8 files, 0 failures.**

| File | Tests | Phase |
|------|-------|-------|
| `tests/config.test.ts` | 7 | 1 |
| `tests/project-key.test.ts` | 6 | 1 |
| `tests/denylist.test.ts` | 14 | 2 |
| `tests/secrets.test.ts` | 8 | 2 |
| `tests/handlers.test.ts` | 34 | 3 |
| `tests/db.test.ts` | 32 | 4 |
| `tests/hooks.test.ts` | 13 | 5 |
| `tests/tools.test.ts` | 24 | 6 |

## Coverage

### `tests/config.test.ts` — 7 tests
| Test | Description |
|------|-------------|
| returns defaults when no config file exists | returns full default config |
| returns the same instance on repeated calls (cached) | caching works |
| resets cache after resetConfig() | next load re-reads from disk |
| merges partial TOML override with defaults | user values override, rest stays default |
| falls back to defaults when config has an invalid value | Zod validation rejects bad enum |
| falls back to defaults on malformed TOML | parse error is swallowed |
| strips unknown keys from TOML | unknown fields do not bleed through |

### `tests/project-key.test.ts` — 6 tests
| Test | Description |
|------|-------------|
| returns git root when inside a git repo | resolves to repo root path |
| falls back to cwd outside a git repo | graceful non-git fallback |
| returns 16-char hex hash | stable SHA256 truncation |
| same path always produces same key | deterministic |
| different paths produce different keys | no collision |
| handles nested subdirectory | resolves to repo root, not subdir |

### `tests/denylist.test.ts` — 14 tests
| Test | Description |
|------|-------------|
| exact match with no wildcards | literal pattern matching |
| trailing wildcard matches prefix | `mcp__recall__*` hits `mcp__recall__search` |
| trailing wildcard does not match different prefix | no false positives |
| surrounding wildcards match substring | `*secret*` hits `mcp__get_secret_value` |
| surrounding wildcards do not match unrelated names | no false positives |
| leading wildcard matches suffix | `*password` hits `get_password` |
| escapes regex special characters in non-wildcard segments | dot is literal |
| BUILTIN_PATTERNS includes mcp__recall__* | self-protection present |
| BUILTIN_PATTERNS includes mcp__1password__* | secrets manager protected |
| denies recall tools via builtin | self-protection works |
| denies 1password tools via builtin | secrets manager blocked |
| denies tools matching sensitive name patterns | secret/token/credential/etc. |
| allows tools not matching any builtin pattern | playwright, github pass through |
| additional patterns extend builtins | config.denylist.additional works |
| override_defaults replaces builtins but additional still applies | full override semantics |
| empty override_defaults falls back to builtins | empty array = no override |

### `tests/secrets.test.ts` — 8 tests
| Test | Description |
|------|-------------|
| returns false for clean content | no false positives on normal text |
| detects PEM private key header | RSA/EC/generic PRIVATE KEY |
| detects SSH private key header | OPENSSH PRIVATE KEY |
| detects GitHub PAT classic (ghp_) | 36-char suffix |
| detects GitHub PAT fine-grained (github_pat_) | 82-char suffix |
| detects GitHub OAuth token (gho_) | 36-char suffix |
| detects OpenAI API key (sk-) | 32+ char suffix |
| detects Anthropic API key (sk-ant-) | 32+ char suffix |
| detects AWS access key ID | AKIA prefix |
| detects generic Bearer token | 32+ char token |
| does not flag short Bearer values | minimum length enforced |
| findSecrets returns empty array for clean content | no names returned |
| findSecrets returns matched pattern names | named matches returned |
| findSecrets returns multiple matches | handles multiple patterns |
| findSecrets does not include unmatched pattern names | no extra names |

### `tests/handlers.test.ts` — 34 tests
| Test | Description |
|------|-------------|
| extractText: returns string as-is | passthrough for plain strings |
| extractText: extracts text from MCP content array | `content[].text` joined |
| extractText: ignores non-text content items | image items skipped |
| extractText: falls back to JSON.stringify | unknown shapes serialized |
| playwrightHandler: extracts interactive elements | buttons, inputs, links |
| playwrightHandler: extracts visible text | headings, statictext |
| playwrightHandler: reports originalSize in bytes | byte count accurate |
| playwrightHandler: handles MCP content wrapper | content array unwrapped |
| playwrightHandler: returns fallback for empty snapshot | graceful empty case |
| playwrightHandler: caps interactive elements at 20 | overflow capped |
| githubHandler: summarises a single issue object | number/title/state/labels/body |
| githubHandler: summarises an array of items | list mapped to summaries |
| githubHandler: truncates arrays longer than 10 | overflow count shown |
| githubHandler: truncates long body excerpts | 200-char cap with ellipsis |
| githubHandler: falls back gracefully for non-JSON text | plain text passthrough |
| githubHandler: reports originalSize in bytes | byte count accurate |
| filesystemHandler: includes line count header | line count shown |
| filesystemHandler: shows all lines when under limit | no truncation |
| filesystemHandler: truncates and marks when over 50 lines | first 50 + ellipsis |
| filesystemHandler: handles single-line content | singular "line" label |
| filesystemHandler: reports originalSize in bytes | byte count accurate |
| jsonHandler: pretty-prints JSON at depth limit | depth-4 values replaced with … |
| jsonHandler: truncates arrays to 3 items with count | overflow count appended |
| jsonHandler: preserves short arrays unchanged | under-limit arrays untouched |
| jsonHandler: falls back to plain excerpt for non-JSON | graceful non-JSON case |
| jsonHandler: reports originalSize in bytes | byte count accurate |
| genericHandler: returns content under 500 chars unchanged | no truncation |
| genericHandler: truncates at 500 chars and appends ellipsis | cap enforced |
| genericHandler: reports originalSize in bytes | byte count accurate |
| getHandler: routes playwright snapshot | name-based dispatch |
| getHandler: routes github tools | prefix-based dispatch |
| getHandler: routes filesystem tools | name-based dispatch |
| getHandler: routes JSON output to json handler | content-based fallback |
| getHandler: routes plain text to generic handler | final fallback |

### `tests/db.test.ts` — 32 tests
| Test | Description |
|------|-------------|
| storeOutput: returns a stored output with generated id | `recall_` + 8 hex chars |
| storeOutput: computes summary_size from summary bytes | byte length accurate |
| storeOutput: sets created_at to a recent unix timestamp | within test window |
| storeOutput: generates unique IDs for multiple inserts | no collision |
| retrieveOutput: retrieves a stored output by id | round-trip works |
| retrieveOutput: returns null for unknown id | missing ID handled |
| searchOutputs: finds items matching query in summary | FTS on summary |
| searchOutputs: finds items matching query in full_content | FTS on full content |
| searchOutputs: returns empty array when nothing matches | no false positives |
| searchOutputs: filters by tool name | exact tool filter |
| searchOutputs: respects limit option | cap enforced |
| searchOutputs: does not return results from a different project | project isolation |
| listOutputs: newest-first by default | created_at DESC |
| listOutputs: oldest-first when sort=oldest | created_at ASC |
| listOutputs: filters by tool name | exact tool filter |
| listOutputs: paginates with limit and offset | two pages differ |
| listOutputs: does not return outputs from a different project | project isolation |
| forgetOutputs: deletes by id | single item deleted |
| forgetOutputs: deletes by tool name | all matching deleted |
| forgetOutputs: deletes by session_id | session-scoped delete |
| forgetOutputs: deletes all when all=true | full clear |
| forgetOutputs: does not delete from a different project | project isolation |
| forgetOutputs: returns 0 when no options match | no-op case |
| forgetOutputs: cleans up FTS index on delete | trigger verified via search |
| getStats: returns zeros for empty project | empty state |
| getStats: accumulates totals | multi-item aggregate |
| getStats: does not include stats from other projects | project isolation |
| pruneExpired: removes outputs older than given days | backdated row deleted |
| pruneExpired: returns 0 when nothing is expired | no-op case |
| recordSession: records a session date | date persisted |
| recordSession: is idempotent | duplicate ignored |
| getSessionDays: returns dates in descending order | newest first |

### `tests/hooks.test.ts` — 13 tests
| Test | Description |
|------|-------------|
| handleSessionStart: records today's date in sessions table | date written |
| handleSessionStart: is idempotent | duplicate ignored |
| handleSessionStart: does not throw on valid input | no crash |
| handlePostToolUse: returns {} for denied tools (recall) | self-protection |
| handlePostToolUse: returns {} for denied tools (1password) | secrets manager blocked |
| handlePostToolUse: returns {} when content contains a secret | PEM detected |
| handlePostToolUse: returns {} when output too small to compress | no-benefit passthrough |
| handlePostToolUse: compresses large output and returns updatedMCPToolOutput | happy path |
| handlePostToolUse: updatedMCPToolOutput contains recall ID header | `recall_` prefix present |
| handlePostToolUse: updatedMCPToolOutput contains size and reduction info | stats in header |
| handlePostToolUse: stores the output in the DB | DB write confirmed |
| handlePostToolUse: stored output preserves session_id | Claude Code session ID saved |
| handlePostToolUse: stored full_content is extracted text | MCP wrapper stripped |

### `tests/tools.test.ts` — 24 tests
| Test | Description |
|------|-------------|
| toolRetrieve: returns not-found message for unknown id | missing ID handled |
| toolRetrieve: returns summary with header when no query | summary path |
| toolRetrieve: returns full_content when query given | detail path |
| toolRetrieve: applies max_bytes cap to full_content | truncation enforced |
| toolRetrieve: includes size info in header | KB shown |
| toolSearch: returns no-results message when nothing matches | empty state |
| toolSearch: finds items matching the query | FTS works |
| toolSearch: filters by tool name substring | LIKE filter works |
| toolSearch: respects limit | cap enforced |
| toolForget: requires confirmed: true when all: true | safety gate |
| toolForget: deletes all when all: true and confirmed: true | full clear |
| toolForget: deletes by id | single item |
| toolForget: deletes by tool name | multi-item |
| toolForget: returns nothing-deleted message when no match | no-op case |
| toolListStored: returns no-items message when empty | empty state |
| toolListStored: lists items with ID, tool, date, size | table format |
| toolListStored: paginates with limit and offset | two pages differ |
| toolListStored: returns no-more-items when offset exceeds store | overflow case |
| toolListStored: filters by tool substring | LIKE filter works |
| toolListStored: sorts by size descending when sort=size | largest first |
| toolStats: returns no-data message when empty | empty state |
| toolStats: shows item count, sizes, and reduction | aggregate correct |
| toolStats: shows session days count | session days shown |
| toolStats: shows token savings estimate | ~tokens shown |
