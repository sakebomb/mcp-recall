# Profiles quickstart

Profiles tell mcp-recall how to compress output from specific MCPs — which fields to keep, how many items to show, and how to summarise responses. Without a profile, mcp-recall falls back to a generic text truncator that works but isn't as smart.

The [community profiles repo](https://github.com/sakebomb/mcp-recall-profiles) has 18+ ready-made profiles. This guide walks through getting them installed for each install method.

---

## npm / bun global install

The `mcp-recall` CLI is already on PATH. Just seed:

```bash
# Install profiles for your currently connected MCPs
mcp-recall profiles seed

# Or install the entire community catalog at once
mcp-recall profiles seed --all

# Verify
mcp-recall profiles list

# Keep profiles current
mcp-recall profiles update
```

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

# Test a profile against real stored output
mcp-recall profiles test mcp__grafana__search_dashboards

# Suggest field improvements using your stored data
mcp-recall profiles retrain
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
