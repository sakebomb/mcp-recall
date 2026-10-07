# Maintenance: reclaiming disk, export and import

## Reclaiming disk with `gc`

mcp-recall keeps a separate SQLite database per project under `~/.local/share/mcp-recall/`. Over time, projects you delete leave their databases behind, and databases accumulate free pages. `mcp-recall gc` reclaims both:

```bash
# Review what would be reclaimed — dry run, deletes nothing
mcp-recall gc

# Actually delete orphaned + stale databases
mcp-recall gc --force

# Also compact the databases you keep (reclaims free pages;
# rewrites each file, so it can take a moment on a large store)
mcp-recall gc --force --vacuum
```

Each database is classified by whether its recorded project path still exists on disk. Only databases untouched past the stale window, or a project directory confirmed deleted, are ever removed:

| Status | Meaning | `--force` deletes? |
|---|---|---|
| **current** | The active project's database | never |
| **active** | Recorded project path still exists | never |
| **orphaned** | Project directory gone, but its parent survives — a real deletion | **yes** |
| **legacy-fresh** | No recorded project path, touched within `--stale-days` | never |
| **legacy-stale** | No recorded project path, untouched longer than `--stale-days N` (default 90) | **yes** |
| **unrooted-fresh** | Un-rootable relative recorded path, touched within `--stale-days` | never |
| **unrooted-stale** | Un-rootable relative recorded path, untouched longer than `--stale-days N` | **yes** |
| **unverifiable** | Absolute path whose parent directory is also missing — usually an unmounted volume, not a deleted project | never |
| **unreadable** | Not a readable recall database | never |

The `orphaned` rule requires the *parent* directory to survive, so an absolute path on an unmounted volume reads as `unverifiable` — the volume may return with its project intact, so it is never deleted regardless of age. A database with a *relative* recorded path can't be rooted against any directory, so it is never deleted on a deleted-project inference; instead it falls through to the same "untouched for `--stale-days`" rule as pathless legacy databases (`unrooted-fresh` before the window, `unrooted-stale` after).

A database has no recorded project path either because it predates path tracking, or because its path never resolved to a real directory when a session started — session start records a path only once it confirms one exists, so it never overwrites good evidence with a guess. Either way the `legacy-*` and `unrooted-*` classifications rest solely on "untouched for `--stale-days`", never on inferring that a project was deleted.

The active project's database is always protected. When the store grows past `store.gc_reminder_mb` (default 2 GB), session start injects a one-line reminder to run `gc`, and `mcp-recall status` shows the store's size. There's no automatic deletion — reclaiming is always an explicit command.

## Restoring an export

**Restoring an export.** `recall__export()` produces a JSON dump; `import` reads it back:

```bash
mcp-recall import dump.json                  # skips items whose IDs already exist
mcp-recall import dump.json --overwrite      # replace existing items instead
mcp-recall import dump.json --dry-run        # report what would be imported
```

Items are imported into the **current** project's store — run `import` from the project you want them in.

Rows carrying a credential are **withheld, not imported** ([#273](https://github.com/sakebomb/mcp-recall/issues/273)). `import` writes through its own INSERT, bypassing the PostToolUse hook that scans intercepted tool output, so it runs the same [secret patterns](../SECURITY.md) over each row's summary and body itself. A match withholds that row and the run reports the count and the pattern names — never the matched value:

```
Withheld 2 row(s) containing secrets (AWS access key ID, GitHub PAT (classic)). They were NOT imported.
```

Clean rows in the same dump import normally — one bad row does not fail a restore — and `--dry-run` reports what *would* be withheld. This matters most when restoring a dump taken before a credential was purged from your store: without the scan, the purge would be silently undone.

> **`--keep-project-key` was removed** ([#226](https://github.com/sakebomb/mcp-recall/issues/226)). It retained the dump's original project key on each row but still wrote them to the *current* project's database, where almost everything is scoped by project key. `recall__retrieve` looks an item up by id alone, but everything else is scoped — so rows imported with the flag were readable if you still knew their id and otherwise inert: absent from `search`, `list_stored`, `stats`, `context`, `session_summary`, `suggest` and `export`; impossible to delete via `recall__forget`, even with `all: true`; not pinnable; never expired; and invisible to the `store.max_size_mb` accounting. The flag now exits with an error naming this. Import **without** it — the items land in the current project and behave normally. To recover rows already stranded by the old flag, see [Recovering rows stranded by the old import flag](troubleshooting.md#recovering-rows-stranded-by-the-old-import-flag).

---

→ [README](../README.md) · [Configuration](configuration.md) · [Troubleshooting](troubleshooting.md)
