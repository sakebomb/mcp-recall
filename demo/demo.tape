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

# --- Scene 1: tests passing ---
Type "bun test"
Enter
Sleep 3s

# --- Scene 2: compression ---
Type "clear"
Enter
Sleep 300ms
Type "# A 56KB Playwright snapshot arrives..."
Enter
Sleep 800ms
Type "# mcp-recall delivers this to Claude instead:"
Enter
Sleep 600ms
Type "cat demo/sample-compression.txt"
Enter
Sleep 2s

# --- Scene 3: stats ---
Type "clear"
Enter
Sleep 300ms
Type "# After a full session:"
Enter
Sleep 500ms
Type "cat demo/sample-stats.txt"
Enter
Sleep 2s

# --- Scene 4: search ---
Type "clear"
Enter
Sleep 300ms
Type "# Find anything stored, no ID needed:"
Enter
Sleep 500ms
Type "cat demo/sample-search.txt"
Enter
Sleep 2.5s
