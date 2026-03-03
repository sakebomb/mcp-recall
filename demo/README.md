# demo/

Files in this directory:

| File | Purpose |
|---|---|
| `demo.gif` | Main README demo — tests passing, Playwright compression, stats, search |
| `demo.tape` | vhs script to regenerate `demo.gif` |
| `proof.gif` | Two-scene proof of real compression — raw GitHub API JSON vs. what Claude receives |
| `proof.tape` | vhs script to regenerate `proof.gif` |
| `show-compression.ts` | Script that reads a cached tool response, runs it through the handler, and prints the compact summary with before/after/reduction stats. Used by `proof.tape` |
| `bench.ts` | Compression benchmark — fetches live GitHub issues (public API, no auth) + runs fixture data through every handler. Prints a before/after table. `--summary` flag prints the GitHub summary only |
| `sample-compression.txt` | Pre-recorded Playwright compression output for `demo.tape` Scene 2 |
| `sample-stats.txt` | Pre-recorded `recall__stats` output for `demo.tape` Scene 3 |
| `sample-search.txt` | Pre-recorded `recall__search` output for `demo.tape` Scene 4 |

## demo.gif

![mcp-recall demo](demo.gif)

## proof.gif

![mcp-recall proof](proof.gif)

## Regenerating the GIFs

Requires [vhs](https://github.com/charmbracelet/vhs):

```bash
brew install vhs        # macOS
go install github.com/charmbracelet/vhs@latest  # or via Go
```

```bash
vhs demo/demo.tape      # → demo/demo.gif
vhs demo/proof.tape     # → demo/proof.gif  (requires internet: curl fetches GitHub API)
```

## Running the benchmark

```bash
bun demo/bench.ts               # compression table for all handlers
bun demo/bench.ts --summary     # print GitHub list_issues summary only
```
