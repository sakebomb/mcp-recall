# FAQ

Short answers for deciding whether to install. Each one links to the page that covers it in full.

### Does it work outside Claude Code?

Yes, with [pi](https://pi.dev) and xAI's `grok` CLI, when you install with `mcp-recall install` rather than the plugin marketplace. Install sets up pi when it finds pi's config, and grok reads the Claude Code config that install writes, so it needs no step of its own. See [pi](install.md#pi) and [grok](install.md#grok). Other agents don't run mcp-recall's hook, so nothing would be compressed or stored.

### Will it make Claude better at my tasks?

Not shown. In paired runs with and without it, no study found a difference in solved tasks larger than chance. What it changed was compaction and cost: in the browser studies, sessions compacted less often, and in two Haiku studies, runs cost about a quarter less. [Is it for you?](../README.md#is-it-for-you) says who it helps, and the [task-success benchmark](benchmarks.md#task-success-benchmark) has every study and its limits.

### Will it hide something Claude needs?

The summary keeps what matters most for the shape of output, such as failures and errors first for test runs and compilers. The full output stays in the store, and Claude can fetch it with `recall__retrieve`. Some output is never summarized: a Bash file read of 8 KB or less, a result carrying an image, and anything a summary can't shrink by at least a quarter. See [How it works](../README.md#how-it-works) and the [handler reference](handlers.md) for what each summary keeps.

One exception: by default, output a command can reproduce, such as a test run, is stored as its summary only, and Claude is told to re-run the command for the rest. [`store.retention`](configuration.md) changes that, and the [tool reference](tools.md) says what `recall__retrieve` returns for such an item.

### Does anything leave my machine?

No. The store is a SQLite file per project under `~/.local/share/mcp-recall/`, and nothing is sent anywhere. Credentials are never stored: password-manager tools are blocked, and every output is scanned for secrets before it is written. See [Safety and privacy](../README.md#safety-and-privacy).

### Can it break a tool call?

No. If anything in mcp-recall fails, the original output reaches Claude unchanged. See the [error contract](../README.md#error-contract).

### How much disk does it use?

Each project's store is held near `store.max_size_mb`, 500 MB by default, by removing the least-used items first. Items also expire after 30 days of using Claude Code on that project. See [Configuration](configuration.md). `mcp-recall gc` reclaims stores for projects you deleted or stopped using: see [Maintenance](maintenance.md).

### What happens to my data if I uninstall?

Uninstalling removes the hooks and the MCP server and leaves your data. The stored output stays in `~/.local/share/mcp-recall/` and your config in `~/.config/mcp-recall/` until you delete those folders. See [Uninstalling](install.md#uninstalling).
