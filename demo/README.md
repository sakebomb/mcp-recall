# demo/

Files in this directory:

| File | Purpose |
|---|---|
| `demo.gif` | Main README demo: a GitHub MCP result raw, the summary Claude receives, a retrieve, and stats over the whole public corpus |
| `demo.tape` | vhs script to regenerate `demo.gif` |
| `demo.ts` | The scenes `demo.tape` records. Each runs real output from `benchmark/corpus/` through the real hook and `recall__*` tools on a throwaway store, so re-recording after a handler change keeps the GIF true |
| `proof.gif` | Two-scene proof of real compression — raw GitHub API JSON vs. what Claude receives |
| `proof.tape` | vhs script to regenerate `proof.gif` |
| `show-compression.ts` | Script that reads a cached tool response, runs it through the handler, and prints the compact summary with before/after/reduction stats. Used by `proof.tape` |
| `bench.ts` | Compression benchmark — fetches live GitHub issues (public API, no auth) + runs fixture data through every handler. Prints a before/after table. `--summary` flag prints the GitHub summary only |

## demo.gif

![mcp-recall demo](demo.gif)

## proof.gif

![mcp-recall proof](proof.gif)

## Regenerating the GIFs

Requires [vhs](https://github.com/charmbracelet/vhs), which needs `ttyd` and `ffmpeg` on the `PATH`:

```bash
brew install vhs        # macOS (pulls in ttyd and ffmpeg)
go install github.com/charmbracelet/vhs@latest  # or via Go, or a release binary
```

Run them from the repository root. `demo.tape` needs no network.

```bash
vhs demo/demo.tape      # → demo/demo.gif
vhs demo/proof.tape     # → demo/proof.gif  (requires internet: curl fetches GitHub API)
```

## Running the benchmark

```bash
bun demo/bench.ts               # compression table for all handlers
bun demo/bench.ts --summary     # print GitHub list_issues summary only
```
