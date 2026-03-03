# mcp-recall proof tape — real compression numbers
# Scene 1: benchmark table (GitHub fetched live, others fixture)
# Scene 2: what Claude actually receives for GitHub list_issues
# Run: vhs demo/proof.tape
# Output: demo/proof.gif

Output demo/proof.gif

Set Shell "bash"
Set FontSize 14
Set Width 1000
Set Height 460
Set Theme "Catppuccin Mocha"
Set Padding 24

# --- Scene 1: benchmark table ---
Type "bun demo/bench.ts"
Enter
Sleep 6s
Sleep 5s

# --- Scene 2: what Claude actually receives ---
Type "clear"
Enter
Sleep 300ms
Type "bun demo/bench.ts --summary"
Enter
Sleep 5s
Sleep 4s
