# recall__* tool reference

Eleven tools are available to Claude in every session. All are prefixed `recall__`.

The `recall__` prefix is a naming convention for MCP tools — it namespaces them so Claude and users can tell at a glance which plugin owns them. You don't type these names yourself; Claude calls them automatically as part of normal tool use.

---

## `recall__context`

Session orientation — call this at the start of every session.

```
recall__context(days?, limit?)
```

- Returns pinned items, unpinned notes, recently accessed items, hot items from the last session, and a one-line last-session headline
- Each item appears in exactly one section — nothing is duplicated across sections
- `days` — lookback window for recently accessed items (default: 7)
- `limit` — max recently accessed items to show (default: 5)

Example output:

```
Context — 2026-03-02
════════════════════════════════════

Pinned (1):
  📌 recall_ab12  recall__note                          2026-03-01
    Auth flow: use JWT with 1h expiry, refresh at 80%…

Notes (1):
  recall_cd34  2026-03-01
    Deploy checklist: run migrations, restart workers…

Recently accessed (last 7 days, 2 items):
  recall_ef56  mcp__github__list_issues    2026-03-02  ×3
    #42 "Add session summary" [open]…

Hot from last session (2026-03-01, 2 items):
  recall_gh78  mcp__playwright__browser_snapshot  2026-03-01  ×4
    Page: Dashboard · 12 interactive elements…

Last session (2026-03-01):
  12 items stored · 847KB → 23KB (97% reduction)
```

---

## `recall__retrieve`

Fetch stored content from a previous tool call.

```
recall__retrieve(id, query?, mode?, max_bytes?)
```

Graduated retrieval across three tiers — escalate only as far as you need:

| `mode` | Returns | Default when |
|---|---|---|
| `summary` | The compressed summary (cheapest) | no `query` given |
| `peek` | A bounded context window — the top matching chunks for a `query`, or the head chunks without one — much smaller than the full document | a `query` is given |
| `full` | The verbatim content, capped at `max_bytes` (default 8 KB) | — |

- `mode` is optional and backward-compatible: with no `mode`, a `query` defaults to `peek` and its absence to `summary`.
- `peek` with a `query` falls back to full content if the item has no matching chunks (e.g. rows stored before chunking).
- `peek` is bounded independently of `max_bytes` (a few chunks); `max_bytes` caps only `mode: "full"`.
- Override `max_bytes` when you need more than the default 8 KB from `mode: "full"`.
- **Summary-only rows:** under `store.retention` (default `balanced`), reproducible Bash/git/test output is stored without its verbatim body. `summary` mode is unaffected; `peek`/`full` on such a row return the summary plus a note to re-run the command for current output. See [`store.retention`](../README.md#configuration).
- Every call records an access, which informs `sort: "accessed"` and eviction order (a recency-decayed access score, tunable via `eviction_half_life_days` in the [`[store]` config](../README.md#configuration)).

---

## `recall__search`

Search across all stored outputs by content.

```
recall__search(query, tool?, limit?)
```

- FTS search (BM25 ranking) across all stored tool outputs for the current project
- Each result includes a `> …excerpt…` snippet from the matching content
- Filter by tool name with `tool` (substring match — e.g. `"github"` matches all `mcp__github__*` tools)
- Default `limit`: 5 results
- When you already know the item ID, use `recall__retrieve(id, query?)` instead — it returns the full content or a focused excerpt without scanning the whole index

---

## `recall__pin`

Pin an item to protect it from expiry and eviction.

```
recall__pin(id, pinned?)
```

- `pinned` defaults to `true`; pass `false` to unpin
- Pinned items are excluded from `pruneExpired`, eviction, and `forget(all: true)` (unless `force: true`)

---

## `recall__note`

Store arbitrary text as a recall note.

```
recall__note(text, title?)
```

- Stores as `tool_name = "recall__note"` — searchable and retrievable like any other item
- Use for conclusions, findings, and context that should survive a context reset
- `title` appears in list/search output; defaults to `(note)`

---

## `recall__stats`

Aggregate session efficiency report. The savings figures (items, sizes,
reduction, tokens saved) cover **intercepted tool output only**; `recall__note`
memory is reported on its own `Notes/memory` line so a bulk note backend can't
dilute the compression number. Pinned-budget accounting stays store-wide, since
notes are pinned and do count against `store.max_pinned_mb`.

A `By Bash command` section attributes the aggregate `Bash` figure to command
families (`git diff`, `rg`, `cat`, …) so low-reduction families — the compression
leaks — are visible. Families come from a privacy-safe fingerprint (the leading
command verb/subcommand only; never an argument or secret); rows written before
this feature, or with no bare command verb, fold into an `unknown` bucket.

```
recall__stats()
```

Example output:

```
Session stats for current project:
  Intercepted items: 23
  Original size:     342KB
  Compressed size:   6.1KB
  Saved:             98.2% reduction
  ~Tokens saved:     ~84,000
  Session days:      4
  Notes/memory:      5 items (18KB) — stored memory, not interception

By tool (sorted by original size):
  mcp__playwright__browser_snapshot    4 items    215KB →  1.2KB    99%
  mcp__github__list_issues             3 items    106KB →  3.3KB    97%
  Bash                                 6 items     88KB →   53KB    40%

By Bash command (sorted by original size):
  rg           3 items     42KB →  7.1KB    83%
  git diff     2 items     34KB →   11KB    68%
  cat          1 item      12KB →   11KB    12%

Suggestions:
  📌 Consider pinning:
     recall_ab12  mcp__playwright__browser_snapshot    accessed 6×
  🗑  Never accessed (consider forgetting):
     recall_cd34  mcp__github__list_issues             created 4 days ago
```

The Suggestions section is omitted when nothing qualifies. Thresholds are configurable via `pin_recommendation_threshold` and `stale_item_days`.

---

## `recall__session_summary`

Digest of a single session's activity.

```
recall__session_summary(session_id?, date?)
```

- Defaults to today (UTC). Pass `date` (YYYY-MM-DD) for a specific day, or `session_id` for a specific Claude session.
- Session IDs appear in `recall__context` output and in the `recall__list_stored` table — look for the `session` column.
- Shows: items stored, compression savings, tool breakdown, most-accessed items, pinned items, notes.

Example output:

```
Session Summary — 2026-03-02
────────────────────────────────────
Stored: 12 items · 847KB → 23KB (97% reduction)
Retrieved: 5 items · 8 total accesses

Tools stored:
  mcp__playwright__browser_snapshot            ×4
  mcp__github__list_issues                     ×3
  mcp__filesystem__read_file                   ×2
  recall__note                                 ×1
  + 2 more

Most accessed:
  recall_ab12cd (×3) mcp__playwright__browser_snapshot
    Page: Dashboard · 12 interactive elements…

Pinned: 1
  📌 recall_ef34gh  recall__note
    Auth flow: use JWT with 1h expiry…
```

---

## `recall__list_stored`

Browse stored items.

```
recall__list_stored(limit?, offset?, tool?, sort?)
```

- Default `limit`: 10
- `sort`: `"recent"` (default) | `"accessed"` | `"size"`
  - `"accessed"` orders by access count descending — most-used items first
- `tool` uses substring matching — `"playwright"` matches all Playwright tools
- Returns a compact table with recall IDs, tool names, dates, size/reduction info, and 📌 for pinned items

---

## `recall__forget`

Delete stored items.

```
recall__forget(id?, tool?, session_id?, older_than_days?, all?, confirmed?, force?)
```

| Usage | Effect |
|---|---|
| `forget(id: "recall_abc12345")` | Delete one item |
| `forget(tool: "mcp__github__list_issues")` | Delete all items from that tool |
| `forget(session_id: "xyz")` | Delete everything from a specific session |
| `forget(older_than_days: 3)` | Delete items older than 3 calendar days |
| `forget(all: true, confirmed: true)` | Wipe the entire store (pinned items skipped) |
| `forget(all: true, confirmed: true, force: true)` | Wipe including pinned items |

All modes return `[recall: deleted N item(s)]`. Calling `forget(all: true)` without `confirmed: true` returns `[recall: clearing all stored items requires confirmed: true]`.

Pinned items are skipped by default. Pass `force: true` to override.

---

## `recall__export`

Export all stored items as JSON.

```
recall__export()
```

- Returns a JSON array of all stored items for the current project, ordered oldest-first
- Useful before `forget(all: true)` to preserve data
- Restore a dump with the [`mcp-recall import`](../README.md#cli-reference) CLI command

---

## `recall__suggest`

Surface actionable maintenance suggestions — what's worth pinning, and what's worth deleting.

```
recall__suggest(pin_threshold?, stale_days?, limit?)
```

- **Pin candidates** — frequently accessed but not yet pinned, so they're still exposed to expiry and eviction
- **Stale items** — never accessed since being stored, and old enough to be worth forgetting
- `pin_threshold` — min access count to qualify as a pin candidate (default: `store.pin_recommendation_threshold`, 5)
- `stale_days` — zero-access items older than this many days are stale (default: `store.stale_item_days`, 3)
- `limit` — max items per category (default 3)
- Each suggestion includes the command to act on it
- Returns `[recall: no suggestions …]` when nothing qualifies

`recall__stats` reports the same two categories inline as part of its efficiency report; `recall__suggest` is the focused, tunable view.

Example output:

```
Recall suggestions:

Pin candidates (frequently accessed, not yet pinned):
  recall_ab12cd  (accessed 7×)  mcp__playwright__browser_snapshot
    Page: Dashboard · 12 interactive elements…
    → recall__pin id="recall_ab12cd"

Stale items (never accessed, consider forgetting):
  recall_ef34gh  (9 days old)  mcp__github__list_issues
    #42 "Add session summary" [open]…
    → recall__forget id="recall_ef34gh"
```
