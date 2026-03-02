# mcp-recall demo tape
# Requirements: vhs (https://github.com/charmbracelet/vhs)
# Install: brew install vhs  OR  go install github.com/charmbracelet/vhs@latest
# Run: vhs demo/demo.tape
# Output: demo/demo.gif  (add to README as: ![demo](demo/demo.gif))

Output demo/demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 900
Set Height 550
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20

# --- Tests passing ---
Type "bun test"
Enter
Sleep 2s

# --- What compression looks like ---
Sleep 500ms
Type "clear"
Enter
Sleep 300ms

Type "# A Playwright snapshot arrives as 56 KB..."
Enter
Sleep 800ms
Type "# mcp-recall delivers this to Claude instead:"
Enter
Sleep 500ms
Type "echo '[recall:recall_a1b2c3d4 · 56.2KB→299B (99% reduction)]'"
Enter
Sleep 400ms
Type "echo 'Page: Dashboard'"
Enter
Type "echo '  [button \"Save changes\"]  [button \"Cancel\"]'"
Enter
Type "echo '  [textbox \"Email address\"]  [link \"Forgot password?\"]'"
Enter
Type "echo '  Heading: Account settings'"
Enter
Sleep 1.5s

# --- Stats ---
Type "clear"
Enter
Sleep 300ms
Type "# After a full session, recall__stats() shows:"
Enter
Sleep 500ms
Type "cat demo/sample-stats.txt"
Enter
Sleep 2s

# --- Search ---
Type "clear"
Enter
Sleep 300ms
Type "# Find anything stored — no ID needed:"
Enter
Sleep 500ms
Type "# recall__search(\"login form\")"
Enter
Sleep 500ms
Type "cat demo/sample-search.txt"
Enter
Sleep 2.5s
