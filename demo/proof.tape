# mcp-recall proof tape — real compression, live data
#
# Scene 1: what mcp__github__list_issues actually returns (raw JSON, real size)
# Scene 2: what Claude receives instead (compact summary, reduction stats)
#
# Requirements: vhs, curl, bun
# Run: vhs demo/proof.tape
# Output: demo/proof.gif

Output demo/proof.gif

Set Shell "bash"
Set FontSize 15
Set Width 1000
Set Height 520
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set Padding 24

# --- Scene 1: the raw response ---
Type "# What mcp__github__list_issues returns:"
Enter
Sleep 800ms
Type "curl -s 'https://api.github.com/repos/anthropics/anthropic-sdk-python/issues?per_page=20&state=all' -o /tmp/issues.json"
Enter
Sleep 3s
Type "wc -c /tmp/issues.json"
Enter
Sleep 1s
Type "head -c 600 /tmp/issues.json"
Enter
Sleep 6s

# --- Scene 2: what Claude sees ---
Type "clear"
Enter
Sleep 500ms
Type "# What Claude actually receives:"
Enter
Sleep 800ms
Type "bun demo/show-compression.ts /tmp/issues.json"
Enter
Sleep 3s
Sleep 6s
