# Profiles quickstart

Profiles tell mcp-recall how to compress output from specific MCPs — which fields to keep, how many items to show, and how to summarise responses. Without a profile, mcp-recall falls back to a generic text truncator that works but isn't as smart.

The [community profiles repo](https://github.com/sakebomb/mcp-recall-profiles) has 18+ ready-made profiles. This guide walks through getting them installed for each install method.

---

## npm / bun global install

The `mcp-recall` CLI is already on PATH. Just seed:

```bash
# Install profiles only for your currently connected MCPs (recommended first step)
# Detects which MCPs are configured in ~/.claude.json and installs matching profiles.
# Safe to re-run — skips already-installed profiles.
mcp-recall profiles seed

# Or install the entire community catalog at once (useful on a fresh machine)
mcp-recall profiles seed --all

# See what's available in the community catalog (with install status)
mcp-recall profiles available
mcp-recall profiles available --verbose   # also shows MCP server URLs

# Verify what's installed
mcp-recall profiles list

# Get full metadata for a profile (manifest-first, falls back to local data offline)
mcp-recall profiles info grafana

# Keep profiles current
mcp-recall profiles update

# Skip manifest signature verification (useful in CI without gh installed)
mcp-recall profiles seed --skip-verify
mcp-recall profiles install grafana --skip-verify
```

`npx mcp-recall` and `bunx mcp-recall` also work without a global install — useful for one-off commands.

---

## Claude Code plugin marketplace

The CLI is bundled with the plugin. Use it the same way:

```bash
mcp-recall profiles seed
mcp-recall profiles list
```

If `mcp-recall` isn't found, verify the plugin installed correctly:

```bash
claude --debug
```

---

## From source

The `bin/recall` script runs the CLI using your local Bun installation. After running `bun run build`, make it available on PATH so you can use the full `mcp-recall` command:

**Option 1 — alias (quick)**

```bash
echo 'alias mcp-recall="bun /path/to/mcp-recall/plugins/mcp-recall/dist/cli.js"' >> ~/.zshrc
source ~/.zshrc
```

**Option 2 — symlink (permanent)**

```bash
ln -sf /path/to/mcp-recall/plugins/mcp-recall/dist/cli.js ~/.local/bin/mcp-recall
# make sure ~/.local/bin is in your PATH
```

Then seed profiles normally:

```bash
mcp-recall profiles seed
mcp-recall profiles list
```

---

## Keeping community profiles updated

Community profiles live in `~/.local/share/mcp-recall/profiles/community/`. They are never overwritten by local customisations.

```bash
# Update all community profiles to latest versions
mcp-recall profiles update

# Check for pattern conflicts between installed profiles
mcp-recall profiles check
```

---

## Local customisations

Local profiles live in `~/.config/mcp-recall/profiles/` and always take precedence over community profiles. Edit freely — `mcp-recall profiles update` will never touch them.

```bash
# See which tier each profile comes from (user / community / bundled)
mcp-recall profiles list

# Short names work for most commands — "grafana" is the same as "mcp__grafana"
mcp-recall profiles info grafana
mcp-recall profiles remove grafana

# profiles test takes a full tool name, not a short name
mcp-recall profiles test mcp__grafana__search_dashboards

# Test against a specific stored item
mcp-recall profiles test mcp__grafana__search_dashboards --stored <recall_id>

# Suggest field improvements using your stored data
mcp-recall profiles retrain

# For scripting — outputs bare short names, one per line
mcp-recall profiles list --machine-readable
```

---

## Contributing a profile

If you use an MCP that isn't covered, the easiest path is:

```bash
# Generate a profile suggestion from your session data
mcp-recall learn

# Contribute it to the community repo
mcp-recall profiles feed path/to/your/profile.toml
```

→ Full guide: [AI profile guide](ai-profile-guide.md) · [Profile schema](profile-schema.md)
