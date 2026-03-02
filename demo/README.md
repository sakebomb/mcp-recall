# Demo

To generate `demo.gif`:

1. Install [vhs](https://github.com/charmbracelet/vhs):
   ```bash
   brew install vhs        # macOS
   # or
   go install github.com/charmbracelet/vhs@latest
   ```

2. Run the tape:
   ```bash
   vhs demo/demo.tape
   ```

3. The output is `demo/demo.gif` — add it to the README:
   ```markdown
   ![mcp-recall demo](demo/demo.gif)
   ```

The tape shows three scenes:
1. `bun test` — 329 tests passing
2. A Playwright snapshot compressed from 56.2KB → 299B (99% reduction)
3. `recall__stats` and `recall__search` output

**Note**: The sample output files (`sample-stats.txt`, `sample-search.txt`) use realistic but
pre-recorded data. For a live demo showing real Claude session compression, screen-record an
actual session using OBS or macOS screen recording, then trim to the relevant moments.
