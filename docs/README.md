# Documentation

Start with the [README](../README.md): what mcp-recall does, whether it suits your work, and a real example. The pages below go deeper, grouped by what you came to do.

## Using mcp-recall

| Page | Read it when |
|---|---|
| [Install and update](install.md) | You want an install method beyond the README's Quick start (plugin marketplace, from source, standalone binary), or want to update or uninstall |
| [Tool reference](tools.md) | You want to know what each `recall__*` tool does and takes |
| [Configuration](configuration.md) | You want to change store size, expiry, retention or the denylist, or look up an environment variable |
| [Handlers](handlers.md) | You want to know how each kind of output is summarized and what is kept |
| [Maintenance](maintenance.md) | You want to reclaim disk with `gc`, or export and import a store |
| [Troubleshooting](troubleshooting.md) | Something isn't working |
| [Benchmarks](benchmarks.md) | You want the measurements: size, what summaries keep, and whether Claude still solves the task |

## Writing profiles

A profile is a TOML file that tells mcp-recall how to summarize one MCP server's output. No TypeScript needed.

| Page | Read it when |
|---|---|
| [Profiles quickstart](profiles-quickstart.md) | You want the community profiles for the MCP servers you use |
| [Profile schema](profile-schema.md) | You are writing or editing a profile by hand |
| [AI profile guide](ai-profile-guide.md) | You want an AI assistant to write the profile; point it at this page |
| [Retrain](retrain.md) | You want suggestions for improving a profile from your own stored output |

## Contributing

| Page | Read it when |
|---|---|
| [CONTRIBUTING](../CONTRIBUTING.md) | You are opening a PR: workflow, tests, sign-off, releases |
| [Architecture](architecture.md) | You are changing the code: the pipeline, the module map, and the invariants a change must not break |
| [ROADMAP](../ROADMAP.md) | You want to know what is in scope, and what mcp-recall deliberately won't become |

## Research reports

Dated records of the task-success studies. Later results go in new reports; [Benchmarks](benchmarks.md#task-success-benchmark) has the current summary.

- [Task-success pilot](research/task-success-2026-11.md): does mcp-recall change whether an agent solves the task?
- [Compression test](research/compression-test-2026-11.md): the same question, replicated with the hook on and off
- [Long sessions and browser output](research/long-session-and-mcp-2026-11.md): four studies of long sessions and Playwright tasks

## Glossary

| Term | Meaning here |
|---|---|
| **Summary** | What Claude receives in place of a large tool output: a `[recall:…]` header line, then the parts of the output a handler or profile keeps |
| **Header** | The first line of a summary. It names the stored item, its size before and after, and a few `search:` terms for a later `recall__search` |
| **Handler** | Built-in TypeScript code that summarizes one shape of output, such as `git diff`, test runs or GitHub API results. [Handlers](handlers.md) lists them |
| **Profile** | A TOML file that summarizes one MCP server's output without code. A profile you install, your own or a community one, takes priority over the built-in handler for that tool |
| **Fallback** | The generic summary used when no handler or profile matches the output |
| **Pass through** | Output delivered to Claude unchanged and not stored: a summary that wouldn't save at least a quarter, a small Bash file read, a result carrying an image, output from a denied tool, or output that looks like it contains a secret |
| **Store** | The SQLite database that holds full outputs and their search index, one per project, under `~/.local/share/mcp-recall/` |
| **Project key** | A hash of the project's git root, or of the working directory outside a git repo. It picks which store a session writes to |
| **Retention** | Whether a stored item keeps its full body or only its summary: `full`, `balanced` (the default) or `minimal`. See [Configuration](configuration.md) |
| **Expiry** | By default, items expire after 30 days of actually using Claude Code on the project. Days away don't count |
| **Eviction** | When the store grows past its size limit, unpinned items are removed lowest score first, where the score weighs how often and how recently each was used |
| **Pin** | A mark that exempts an item from expiry and eviction |
| **Note** | A short piece of text Claude saves with `recall__note`, shown again by `recall__context`. A marker, not a memory system |
| **Dedup** | When the same tool and command return byte-identical output again, Claude gets the cached header instead of a second copy |
| **Compaction** | Claude Code's own step of summarizing the conversation when the context window fills. mcp-recall doesn't do this; in the studies, sessions long enough to compact did so less often with it |
