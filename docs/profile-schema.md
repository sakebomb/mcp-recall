# mcp-recall Profile Schema

Profiles are declarative TOML files that tell mcp-recall how to compress the output of a specific MCP tool. They require no TypeScript — any user can write one, and the community shares them via [`sakebomb/mcp-recall-profiles`](https://github.com/sakebomb/mcp-recall-profiles).

## When to write a profile vs a TypeScript handler

| Situation | Use |
|-----------|-----|
| Tool returns structured JSON with named fields | Profile |
| Tool returns a flat list of objects | Profile |
| Tool returns plain text you want truncated | Profile |
| Output shape varies significantly by endpoint | TypeScript handler |
| Output requires normalization logic (e.g. integer → label) | TypeScript handler |
| Output is not JSON (HTML, DOM tree, git diff) | TypeScript handler |

## File locations

| Tier | Path | Priority |
|------|------|----------|
| User (local) | `~/.config/mcp-recall/profiles/<id>.toml` | Highest |
| Community (installed) | `~/.local/share/mcp-recall/profiles/community/<id>.toml` | Middle |
| Bundled | Shipped with mcp-recall | Lowest |

Local always wins. Install community profiles with `mcp-recall profiles seed`.

Profile files are organized in subdirectories by ID: `profiles/<id>/default.toml`. This allows a single MCP to have multiple per-tool profiles alongside each other (e.g. `profiles/mcp__jira/search.toml` and `profiles/mcp__jira/create.toml`) without naming collisions.

---

## Schema

### `[profile]` — required

```toml
[profile]
id          = "mcp__jira"          # unique slug; must be globally unique in community repo
version     = "1.0.0"             # semver
description = "..."               # one sentence: what this compresses
mcp_pattern = "mcp__jira__*"      # glob pattern — see Matching section below
```

**`mcp_pattern`** can be a string or an array of strings:

```toml
mcp_pattern = ["mcp__jira__*", "mcp__atlassian__jira__*"]
```

Optional metadata (used by community registry):

```toml
author      = "your-github-username"
mcp_docs_url = "https://github.com/..."
sample_tool  = "mcp__jira__search_issues"   # example tool this was tested against
```

---

### `[strategy]` — required

The `type` field selects the compression algorithm. One of: `json_extract`, `json_truncate`, `text_truncate`.

---

#### `json_extract`

Extracts a flat list of items from a JSON response and formats each as a compact summary line. Best for issue trackers, search results, and list endpoints.

```toml
[strategy]
type = "json_extract"

# Ordered paths to try for the items array (first match wins, dot notation).
# Use "" or omit for root-level array.
# Use "." for a root-level single object (treated as a one-item list).
items_path = ["issues", "nodes", "data.issues.nodes", "data.issue"]

# Fields to extract per item (dot notation for nested paths).
# Missing fields are silently skipped.
fields = [
  "key",
  "fields.summary",
  "fields.status.name",
  "fields.assignee.displayName",
  "fields.priority.name",
]

max_items          = 10    # cap on items shown (default: 10)
max_chars_per_field = 200  # truncate any single field value beyond this (default: 200)
fallback_chars     = 500   # chars to return when parsing fails (default: 500)
```

**Optional field labels** — displayed as `Label: value`. If omitted, the last segment of the field path is used as the label.

```toml
[strategy.labels]
"key"                         = "Key"
"fields.summary"              = "Summary"
"fields.status.name"          = "Status"
"fields.assignee.displayName" = "Assignee"
"fields.priority.name"        = "Priority"
```

**Output format:**

```
3 items:
1. Key: PROJ-1 · Summary: Fix login bug · Status: In Progress · Assignee: Alice · Priority: High
2. Key: PROJ-2 · Summary: Add dark mode · Status: Todo · Priority: Medium
3. Key: PROJ-3 · Summary: Update API docs · Status: Done · Assignee: Bob · Priority: Low
```

---

#### `json_truncate`

Renders JSON with depth and array limits. Useful for opaque JSON tool outputs where you want structure preserved but size reduced.

```toml
[strategy]
type            = "json_truncate"
max_depth       = 3    # truncate past this depth (default: 3)
max_array_items = 3    # cap array length at each level (default: 3)
fallback_chars  = 500  # chars to return when parsing fails (default: 500)
```

---

#### `text_truncate`

Returns the first N characters of the raw text. Last-resort fallback for unstructured output.

```toml
[strategy]
type      = "text_truncate"
max_chars = 500   # default: 500
```

---

## Matching rules

Pattern matching is evaluated in priority order on every hook call. **More specific patterns beat less specific ones.** Local profiles beat community profiles beat bundled profiles.

| Pattern type | Example | Specificity |
|--------------|---------|-------------|
| Exact match | `mcp__jira__search_issues` | High |
| Prefix wildcard | `mcp__jira__*` | Low |

Only `*` at the end is supported. No regex, no mid-string wildcards.

When two profiles in the **same tier** match the same tool name, the one with the exact match wins. If both are wildcards, the longer prefix wins (e.g. `mcp__jira__search*` beats `mcp__jira__*`). If still tied, the profile with the lower `id` lexicographically wins — this case should be avoided by using non-overlapping patterns.

---

## Validation rules

The profile evaluator rejects profiles that fail these checks at load time (they are skipped, not fatal):

1. `profile.id`, `profile.version`, `profile.mcp_pattern`, and `strategy.type` are all required.
2. `profile.id` must match `[a-z0-9_-]+`.
3. `profile.version` must be valid semver.
4. `strategy.type` must be one of `json_extract`, `json_truncate`, `text_truncate`.
5. `json_extract` must define at least one entry in `fields`.
6. All numeric limits (`max_items`, `max_chars_per_field`, `max_depth`, `max_array_items`, `max_chars`, `fallback_chars`) must be positive integers.

A validation CLI is available: `mcp-recall profiles check`.

---

## Full worked example — Jira

```toml
# profiles/mcp__jira/default.toml

[profile]
id          = "mcp__jira"
version     = "1.0.0"
description = "Jira issue and search results — extracts key, summary, status, assignee, priority"
mcp_pattern = "mcp__jira__*"
author      = "sakebomb"
sample_tool = "mcp__jira__search_issues"

[strategy]
type       = "json_extract"
items_path = ["issues", "nodes"]
fields     = [
  "key",
  "fields.summary",
  "fields.status.name",
  "fields.assignee.displayName",
  "fields.priority.name",
]
max_items          = 10
max_chars_per_field = 200
fallback_chars     = 500

[strategy.labels]
"key"                         = "Key"
"fields.summary"              = "Summary"
"fields.status.name"          = "Status"
"fields.assignee.displayName" = "Assignee"
"fields.priority.name"        = "Priority"
```

---

## Minimal example — plain text truncation

```toml
[profile]
id          = "mcp__myservice"
version     = "1.0.0"
description = "Truncates plain text responses from my-service MCP"
mcp_pattern = "mcp__myservice__*"

[strategy]
type      = "text_truncate"
max_chars = 600
```
