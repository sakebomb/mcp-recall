# mcp-recall profiles retrain

`mcp-recall profiles retrain` scans stored session data and suggests field paths to add to existing profiles, using frequency analysis across real tool outputs.

## When to use it

- A profile exists but isn't extracting all the fields you care about
- You want to see which fields actually appear in responses from a specific MCP
- You're preparing a profile to contribute to the community and want to verify field coverage

## Basic usage

```bash
# Dry run (default) — print suggestions without modifying anything
mcp-recall profiles retrain

# Apply suggestions to matching profiles
mcp-recall profiles retrain --apply
```

## Reading the output

```
mcp__jira (community) — mcp__jira__*
  Profile file: ~/.local/share/mcp-recall/profiles/community/mcp__jira/default.toml
  Samples: 12 stored outputs · 847 items analysed
  Detected items path: issues

  Fields (≥50% frequency):
    fields.summary                97%  ✓ already in profile
    fields.status.name            94%  ✓ already in profile
    fields.assignee.displayName   89%  ✓ already in profile
    fields.priority.name          82%  ✓ already in profile
    fields.description            76%  ← new
    fields.comment.total          63%  ← new
    fields.labels                 51%  ← new
```

Rows marked `✓` are already in the profile. Rows marked `←` are new suggestions. Only new fields are written when you run with `--apply`.

## Flags

| Flag | Description |
|------|-------------|
| `--apply` | Append new fields to matching profile files |
| `--depth N` | Max dot-notation depth to scan (default: 3, i.e. `a.b.c`) |
| `<pattern>` | Limit to tools matching this substring (e.g. `jira`, `github`) |

Examples:

```bash
mcp-recall profiles retrain --apply                 # apply all suggestions
mcp-recall profiles retrain --depth 4               # scan deeper
mcp-recall profiles retrain jira                    # only tools matching "jira"
mcp-recall profiles retrain --apply --depth 4 jira  # combine flags
```

## Per-profile depth

For MCPs with deeply nested JSON, set a default depth directly in the profile TOML:

```toml
[retrain]
max_depth = 4
```

This applies when running without `--depth`. CLI `--depth` always takes precedence.

→ [Profile schema reference](profile-schema.md#retrain--optional)

## What `--apply` does

- **Additive only** — new fields are appended. Existing fields are never removed or reordered.
- **Patch version is bumped** — e.g. `1.0.0` → `1.0.1`.
- **A comment is prepended** — `# Retrained: YYYY-MM-DD` marks the insertion point.
- **Only profiled tools** — only tools that already have a matching `json_extract` profile are analysed. `retrain` does not create new profiles and does not modify `json_truncate` or `text_truncate` profiles.

## Contribution workflow

`retrain` is the fastest path from user to contributor:

1. Use a MCP for a session or two (mcp-recall needs stored outputs to analyse)
2. `mcp-recall profiles retrain` — review suggestions
3. `mcp-recall profiles retrain --apply` — append the fields you want
4. `mcp-recall profiles feed <path>` — preview and copy for submission
5. Open a PR to [sakebomb/mcp-recall-profiles](https://github.com/sakebomb/mcp-recall-profiles)

→ [Contributing a profile](../CONTRIBUTING.md#contributing-a-profile)

## Minimum sample size

`retrain` requires at least **3 stored outputs** for a tool before suggesting anything. Tools with fewer samples are skipped with a note.

## Limitations

- Only `json_extract` profiles are analysed — `json_truncate` and `text_truncate` have no `fields` array to extend
- Only tools that already have a matching profile are processed — use `mcp-recall learn` to generate a starting profile for a new MCP
- Suggestions are frequency-based; review them before applying
