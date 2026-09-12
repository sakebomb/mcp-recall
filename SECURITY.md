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
| PEM private key | `-----BEGIN … PRIVATE KEY-----` |
| SSH private key | `-----BEGIN OPENSSH PRIVATE KEY-----` |
| GitHub PAT (classic) | `ghp_…` |
| GitHub PAT (fine-grained) | `github_pat_…` |
| GitHub OAuth token | `gho_…` |
| OpenAI API key | the `T3BlbkFJ` watermark carried by every modern key (any prefix); `sk-proj-` / `sk-svcacct-` / `sk-admin-` / `sk-None-`; legacy hyphen-free `sk-` |
| Anthropic API key | `sk-ant-…` |
| OpenRouter API key | `sk-or-v1-…` |
| AWS access key ID | `AKIA…` |
| AWS secret access key | an `aws`-adjacent 40-char secret |
| GCP service account key | `"type": "service_account"` |
| Azure storage connection string | account key connection strings |
| Stripe secret / restricted key | `sk_live_…`, `sk_test_…`, `rk_live_…`, `rk_test_…` |
| SendGrid API key | `SG.…` |
| Twilio Account SID | `AC…` (+32 hex) |
| npm publish token | `npm_…` |
| Generic Bearer token | `Bearer …` (32+ chars) |

### Where the scan runs

Every path that can write user-controlled content into the store scans it first. There
are three, and they differ in what a match does:

| Entry point | On a match |
|-------------|------------|
| `PostToolUse` hook (intercepted tool output) | Output is skipped, nothing is written, a warning goes to stderr, and the full uncompressed output passes through to Claude unchanged. |
| `recall__note` (user-authored note text) | The note is **refused** — the tool returns an error naming the pattern. A note is authored text; silently altering or dropping it would be worse than declining it. |
| `mcp-recall import` (rows from an export dump) | The matching **row** is withheld and the rest of the dump imports normally. One bad row must not fail a large restore. The run reports how many rows were withheld and which patterns matched. |

In all three cases only the *pattern name* is ever reported. The matched value is never
logged, echoed, or written anywhere.

`import` matters in particular after a remediation: restoring a dump taken *before* you
purged a credential from your store would otherwise silently reinstate it.

## Denylist

These tool name patterns are **never stored**, regardless of content:

```
mcp__recall__*

mcp__1password__*   mcp__bitwarden__*  mcp__lastpass__*
mcp__dashlane__*    mcp__keeper__*     mcp__hashicorp_vault__*
mcp__vault__*       mcp__doppler__*    mcp__infisical__*

*secret*      *password*     *credential*   *token*
*api_key*     *access_key*   *private_key*  *signing_key*  *encrypt*key*
*oauth*       *auth_token*   *authenticate*
*env_var*     *dotenv*
```

Password managers are listed by name because their tool names — `get_item`, `list_logins`,
`vault read` — contain no credential keyword to match on.

> **These are substring patterns, not category filters.** The key and auth patterns are
> specific: `*api_key*` matches `get_api_key` but **not** `list_keys` or `rotate_key`;
> `*authenticate*` and `*auth_token*` do **not** match `auth_config`; `*env_var*` and
> `*dotenv*` do **not** match `get_env`. If a tool of yours handles credentials under a
> name that does not contain one of the strings above, it is **not** blocked by default —
> add it via `denylist.additional`.

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
