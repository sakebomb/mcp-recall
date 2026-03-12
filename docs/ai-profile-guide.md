# How to write a mcp-recall profile (AI reference)

This guide is structured for AI assistants. When a user asks you to help write a profile for their MCP, follow these steps.

---

## Step 1 — See the actual output

The profile must match the real JSON shape. Get a sample before writing anything.

If the user has mcp-recall installed and has used the MCP at least once:

```
recall__list_stored(tool: "mcp__<server>__<tool>")   → get a stored ID
recall__retrieve("<id>")                              → see the full output
```

If they don't have a sample yet, ask them to paste the raw tool response, or to run the tool once and then call `recall__retrieve`.

---

## Step 2 — Pick a strategy

| Situation | Strategy |
|-----------|----------|
| JSON with **consistent, named fields** across all tool responses | `json_extract` |
| JSON where **field names vary** per instance (user-defined schemas, e.g. Airtable, Notion databases) | `json_truncate` |
| JSON structure **varies significantly** by endpoint (e.g. AWS) | `json_truncate` |
| Plain text, markdown, or HTML | `text_truncate` |

`json_extract` is the right choice for ~80% of MCPs. Use `json_truncate` only when you genuinely cannot predict the field names.

---

## Step 3 — Find the items array (`items_path`, json_extract only)

Most list endpoints wrap results in an array. You need to tell the profile where that array lives.

| Response shape | `items_path` |
|---------------|-------------|
| `[{...}, {...}]` — root-level array | `[""]` or omit |
| `{"issues": [{...}]}` | `["issues"]` |
| `{"data": {"nodes": [{...}]}}` | `["data.nodes"]` |
| `{"results": [...], "contacts": [...]}` | `["results", "contacts"]` — first match wins |
| Single object, not a list | `["."]` |

Include multiple candidates when the MCP returns different shapes for different tools (e.g. HubSpot returns `results` for contacts and `deals` for deals).

---

## Step 4 — Choose fields (json_extract only)

Ask: **what does Claude actually need to take action or make a decision?**

Keep the field list short — 5 to 10 fields is usually right. The generic JSON handler will pick up anything the profile misses.

Use **dot notation** for nested paths:

```
"fields.status.name"          → response.fields.status.name
"from.user.displayName"       → response.from.user.displayName
"properties.firstname"        → HubSpot-style nested properties
```

**Omit:**
- Long text blobs (descriptions, body HTML, raw content) — truncate with `max_chars_per_field` if needed
- Metadata only relevant to the API client (etags, cursors, self-links, audit timestamps)
- Deeply duplicated fields (e.g. both `id` and `node_id` for the same thing)

**Always include:**
- The primary identifier (`id`, `key`, `number`, `uid`, `InvoiceID`, etc.)
- Human-readable name or title
- Status or state
- URL or permalink if available

---

## Step 5 — Fill in the template

### json_extract (most MCPs)

```toml
[profile]
id          = "mcp__<server>"           # e.g. "mcp__stripe"
short_name  = "<server>"               # e.g. "stripe" — used in CLI commands
version     = "1.0.0"
description = "<MCP name> <objects> — extracts <fields>"
mcp_pattern = "mcp__<server>__*"        # or array for alt names
author      = "<github-username>"
mcp_url     = "https://github.com/..."  # link to MCP server repo or docs
sample_tool = "mcp__<server>__<tool>"

[strategy]
type       = "json_extract"
items_path = ["<array_key>"]            # where results live
fields     = [
  "id",
  "status",
  "name",
  # add 3-7 more
]
max_items           = 10    # cap on items shown
max_chars_per_field = 200   # truncate long strings
fallback_chars      = 500   # used when JSON parse fails

[strategy.labels]            # optional — human-readable column names
"id"     = "ID"
"status" = "Status"
"name"   = "Name"
```

### json_truncate (variable schemas)

```toml
[profile]
id          = "mcp__<server>"
short_name  = "<server>"
version     = "1.0.0"
description = "<MCP name> — depth-limited JSON truncation"
mcp_pattern = "mcp__<server>__*"
author      = "<github-username>"

[strategy]
type            = "json_truncate"
max_depth       = 3    # good default; increase to 4 for deeply nested APIs
max_array_items = 5    # items shown per array at each level
fallback_chars  = 500
```

### text_truncate (plain text / HTML)

```toml
[profile]
id          = "mcp__<server>"
short_name  = "<server>"
version     = "1.0.0"
description = "<MCP name> — text truncation"
mcp_pattern = "mcp__<server>__*"
author      = "<github-username>"

[strategy]
type      = "text_truncate"
max_chars = 600
```

---

## Step 6 — Handle alternate MCP server names

Some MCPs ship under different names (e.g. `hubspot` vs `hubspot_crm`). Use an array:

```toml
mcp_pattern = ["mcp__hubspot__*", "mcp__hubspot_crm__*"]
```

Common variants to consider:
- `mcp__<name>__*` and `mcp__<name>_mcp__*`
- `mcp__google_<name>__*` and `mcp__<name>__*`
- `mcp__<company>_<product>__*` and `mcp__<product>__*`

---

## Step 7 — Validation requirements

The profile loader will silently skip invalid profiles. Check these:

1. `id`, `version`, `mcp_pattern`, `strategy.type` — all required
2. `id` must match `[a-z0-9_-]+`
3. `version` must be valid semver (e.g. `1.0.0`)
4. `strategy.type` must be `json_extract`, `json_truncate`, or `text_truncate`
5. `json_extract` must have at least one entry in `fields`
6. All numeric limits must be positive integers

Run `mcp-recall profiles check` to surface errors.

---

## Step 8 — Save and test

**Save location** (user tier — highest priority):
```
~/.config/mcp-recall/profiles/<id>/default.toml
```

Example: `~/.config/mcp-recall/profiles/mcp__stripe/default.toml`

**Test it:**
```bash
# With a stored item
mcp-recall profiles test mcp__<server>__<tool> --stored <recall_id>

# With a local fixture file
mcp-recall profiles test mcp__<server>__<tool> --input sample.json
```

This shows: which profile matched, handler name, input → output sizes, compression %, and the full summary Claude would see.

**Check for conflicts:**
```bash
mcp-recall profiles check
```

---

## Step 9 — Share it (optional)

If the profile is useful, contribute it to the community:

```bash
mcp-recall profiles feed ~/.config/mcp-recall/profiles/<id>/default.toml
```

This previews the profile and copies it to clipboard for submission as a PR to [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles).

→ [Full profile schema](profile-schema.md) · [retrain guide](retrain.md) · [Contributing](../CONTRIBUTING.md#contributing-a-profile)

---

## Quick reference

| Field | Rule |
|-------|------|
| `id` | `mcp__<server>` — lowercase, underscores, no spaces |
| `mcp_pattern` | `mcp__<server>__*` — trailing `*` only |
| `items_path` | First matching key wins; omit `""` for root array |
| `fields` | Dot notation for nesting; missing fields silently skipped |
| `max_items` | Default 10 — increase if user needs more coverage |
| `max_chars_per_field` | Default 200 — lower for noisy text fields |
| `max_depth` (truncate) | Default 3 — increase for deeply nested APIs |
