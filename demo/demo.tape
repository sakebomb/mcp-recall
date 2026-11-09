# mcp-recall demo tape: every scene is a live run of demo/demo.ts, which pushes
# real output from benchmark/corpus/ through the real hook and recall__* tools.
# Requirements: vhs (https://github.com/charmbracelet/vhs), ttyd, ffmpeg, bun
# Run from the repo root: vhs demo/demo.tape
# Output: demo/demo.gif (shown at the top of the README)

Output demo/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1320
Set Height 500
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 24

Hide
Type "export PS1='$ ' && clear"
Enter
Show

# --- Scene 1: what the agent would get without mcp-recall ---
Type "# Your agent calls a GitHub MCP tool. Without mcp-recall, all of this lands in its context:"
Enter
Sleep 800ms
Type "bun demo/demo.ts raw"
Enter
Sleep 5s

# --- Scene 2: what it gets instead ---
Hide
Type "clear"
Enter
Show
Type "# With mcp-recall, Claude Code and pi both store the full output and hand the agent a summary:"
Enter
Sleep 800ms
Type "bun demo/demo.ts agents"
Enter
Sleep 8s

# --- Scene 3: the detail is still there ---
Hide
Type "clear"
Enter
Show
Type "# Need a detail the summary cut? The agent asks for it from the stored original:"
Enter
Sleep 800ms
Type `bun demo/demo.ts retrieve "LFU expiry"`
Enter
Sleep 5s

# --- Scene 4: what it adds up to ---
Hide
Type "clear"
Enter
Show
Type "# Every output in the public benchmark corpus, through the same hook:"
Enter
Sleep 800ms
Type "bun demo/demo.ts stats"
Enter
Sleep 7s
