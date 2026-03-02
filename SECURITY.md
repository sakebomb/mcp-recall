# Security Policy

## What mcp-recall stores

All stored data lives locally at `~/.local/share/mcp-recall/`. Nothing is sent to any
external service. The SQLite database contains full MCP tool outputs — treat it with the
same care as your shell history.

To wipe stored data:

```
recall__forget(all: true, confirmed: true)
```

Or directly:

```bash
rm -rf ~/.local/share/mcp-recall/
```

## Secret detection

Before writing any tool output to disk, mcp-recall scans the content for these patterns:

| Pattern | Catches |
|---------|---------|
| PEM headers | `-----BEGIN RSA PRIVATE KEY-----` etc. |
| SSH private keys | OpenSSH private key blocks |
| GitHub PATs | `ghp_*`, `github_pat_*` (classic and fine-grained) |
| OpenAI API keys | `sk-*` |
| Anthropic API keys | `sk-ant-*` |
| AWS access key IDs | `AKIA*`, `ASIA*` |
| Generic Bearer tokens | `Authorization: Bearer ...` |

On a match: the output is skipped, nothing is written to disk, a warning is logged to
stderr, and the full uncompressed output passes through to Claude unchanged.

## Denylist

These tool name patterns are **never stored**, regardless of content:

`mcp__recall__*`, `mcp__1password__*`, `*secret*`, `*token*`, `*password*`,
`*credential*`, `*key*`, `*auth*`, `*env*`

To add your own patterns:

```toml
[denylist]
additional = ["mcp__myservice__get_credentials"]
```

## Limitations

Detection is pattern-based. It won't catch:

- Custom or internal secret formats
- Secrets encoded in base64 or other encodings
- Secrets embedded in structured fields (e.g. a JSON value that happens to be a password)

When in doubt, add the tool to the denylist rather than relying on content scanning.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/sakebomb/mcp-recall/security/advisories/new).

For non-sensitive issues, open a regular [GitHub issue](https://github.com/sakebomb/mcp-recall/issues).
