# ⚔️ Grimoire — Phase 1 (core package)

> *"Speak the app into existence."* Grimoire is the open, any-platform
> incarnation of AppBuilder. **Phase 1 is purely additive** — it wraps the
> existing engine in a clean, bring-your-own-keys API without changing a single
> line of `core/`, `config.py`, `discord_bot/`, or `cli/`. The Discord bot and
> the old CLI keep working exactly as before.

## Do I need a Claude / Anthropic API key? — No.

Grimoire generates apps with **your choice of provider**, none of which is
Anthropic's API:

| Provider (`AI_PROVIDER`) | What you need | Notes |
|---|---|---|
| `github-copilot` (default) | **GitHub token only** | Free via GitHub Models. Claude/GPT/Llama models are reached *through* the GitHub token. |
| `gemini` | `GEMINI_API_KEY` | Google Gemini. |
| `groq` | `GROQ_API_KEY` | Groq. |

Plus, for pushing: `GITHUB_TOKEN` + `GITHUB_USERNAME` (repos go to **your**
account, private by default). `VERCEL_TOKEN` is optional (enables auto-deploy).

**So: someone with only a GitHub token can build apps** (provider
`github-copilot`). Someone with GitHub + Gemini can use either. No Anthropic key
is ever required. Grimoire does its own **provider-aware** validation
(`grimoire keys`), so GitHub-only is not blocked.

## Install (editable, from the repo)

```bash
pip install -e .
```

## Use

```bash
grimoire keys                          # provider-aware credential check
grimoire models                        # list available models
grimoire build "a Flask todo app with SQLite and dark mode"
grimoire build --provider github-copilot -i
```

Or from Python:

```python
from grimoire import build, Credentials

creds = Credentials(
    github_token="ghp_...",
    github_username="you",
    ai_provider="github-copilot",   # GitHub-only works!
)
result = build("a REST API for a bookstore with FastAPI", creds)
print(result["repo_url"])
```

## Design notes / safety

- **BYO-keys, no central secret** — credentials are passed per call and injected
  into the engine's `config` only for that call, then restored. Safe to call
  inside the running bot.
- **Additive only** — no existing file was modified in Phase 1.
- **`update()` / `experiment()`** wrap the engine's existing functions, which
  still run the engine's stricter validation (they may expect a Gemini key for
  now). Making that provider-aware too is a small, backward-compatible follow-up.
- **Next phases:** Phase 2 wraps these functions as an MCP server; Phase 3 a
  Claude Agent Skill; Phase 4 a BYO-keys web app; Phase 5 more chat bots. See
  `docs/OPEN_PLATFORM_DESIGN.md`.
