# ⚔️ Grimoire — MCP Server (Phase 2)

Expose AppBuilder to **any MCP client** — Claude Desktop, Claude Code, Cursor,
and other Model Context Protocol hosts — so you can generate and update apps by
chatting, with your own keys.

Built on the Grimoire core (Phase 1): the server is a thin wrapper over
`grimoire.build / update / experiment / list_models / check_keys`.

## Bring-your-own-keys (no central secret)

The server reads credentials from **its own environment**, set in your MCP
client's server config — never as tool arguments, so keys never appear in the
conversation. You supply your own GitHub token and one AI provider key; generated
repos go to **your** GitHub account.

Required: `GITHUB_TOKEN`, `GITHUB_USERNAME`, and one provider key matching
`AI_PROVIDER`:

| `AI_PROVIDER` | Key needed |
|---|---|
| `github-copilot` (default) | none beyond `GITHUB_TOKEN` (GitHub Models) |
| `gemini` | `GEMINI_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |

`VERCEL_TOKEN` is optional (enables auto-deploy).

## Install

```bash
pip install -e ".[mcp]"      # from the repo — installs the `mcp` extra
```

This provides the `grimoire-mcp` command (stdio by default; `--http` for
streamable-HTTP).

## Tools

| Tool | What it does |
|------|--------------|
| `check_credentials` | Report which credentials are configured (no secrets). Call first. |
| `list_available_models` | List models per provider. |
| `build_app` | Generate an app from a prompt → new private GitHub repo (+ IMP_DOCS/). |
| `update_app` | Apply changes to an existing generated repo. |
| `experiment_app` | Try changes on a new branch (non-destructive). |

`build_app` / `update_app` / `experiment_app` accept optional `provider` and
`model` overrides.

## Register with Claude Code

```bash
claude mcp add grimoire -- grimoire-mcp \
  -e GITHUB_TOKEN=ghp_xxx \
  -e GITHUB_USERNAME=you \
  -e AI_PROVIDER=github-copilot
```

(Set the provider key too, e.g. `-e ANTHROPIC_API_KEY=sk-ant-...` with
`-e AI_PROVIDER=anthropic`.)

## Register with Claude Desktop / other clients

Add to the client's MCP servers config:

```json
{
  "mcpServers": {
    "grimoire": {
      "command": "grimoire-mcp",
      "env": {
        "GITHUB_TOKEN": "ghp_xxx",
        "GITHUB_USERNAME": "you",
        "AI_PROVIDER": "github-copilot"
      }
    }
  }
}
```

Then ask the client: *"Use grimoire to build a Flask todo app with SQLite."*

## Next phases

Phase 3 — a Claude Agent Skill over these tools; Phase 4 — a BYO-keys web app;
Phase 5 — Slack/Telegram bots. See `docs/OPEN_PLATFORM_DESIGN.md`.
