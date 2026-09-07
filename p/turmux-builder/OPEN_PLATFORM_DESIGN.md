# AppBuilder — Open-Platform Design (v1 · 2026-07-04)

> **Status: proposal for approval.** This doc plans how to turn AppBuilder
> (`turmux_builder`) from a Discord-bot-first tool into an **open-source,
> bring-your-own-keys** capability that can be invoked smoothly on **any
> platform** — MCP clients, Claude (Agent Skill), a public web app, and more
> chat bots. It is a design/plan only; no code changes yet.

---

## 1. Goal & constraints

**Goal:** one engine, many front doors — anyone can invoke "describe an app →
get a pushed GitHub repo (+ optional deploy)" from wherever they already are.

**Decided constraints (from review):**
- **Distribution: open-source, BYO-keys.** Users supply their *own* GitHub token
  and AI key(s); generated repos go to *their* GitHub. No central secret, no
  hosted AI spend, infinite scale, minimal abuse surface.
- **Surfaces: all four** — MCP server, Claude Agent Skill, public web app, more
  chat bots (Slack/Telegram beyond Discord).

**The one hard constraint that shapes everything:** the engine needs a GitHub
token (to push) and an AI key (to generate). In a BYO-keys model, **every
surface must get those keys from the user, never from a server we run.** This is
the rule that makes "public" safe and cheap.

---

## 2. Where we are today

```
              ┌─────────── run_pipeline(prompt, ai_provider) ───────────┐
 CLI ─────────┤  AppGenerator (plan→generate, provider-pluggable)        │
 Discord bot ─┤  → GitHubPusher (create private repo, push via API)      │──► repo_url
 (Termux) ────┤  → VercelDeployer (optional)                             │
              └──────────────────────────────────────────────────────────┘
   also: update_pipeline(repo_url, changes)   experiment_pipeline(repo_url, branch, changes)
```

- **Strengths:** the engine is already a clean, single-import API
  (`core.pipeline`), provider-pluggable (Gemini / GitHub Models / Groq), and
  pushes via the GitHub Contents API (no local git — phone-friendly). Frontends
  are thin.
- **What blocks "open to public":**
  1. **Config is process-global & single-owner.** `config.py` reads one
     `.env`; `GITHUB_USERNAME`/`GITHUB_TOKEN` are one account. Model selection is
     module-level global state in `model_manager.py` — fine for one bot, wrong
     for multi-user.
  2. **Not installable.** No `pyproject.toml`/package; you clone the repo. Hard
     to `pip install` or `uvx`.
  3. **Naming drift** — `turmux_builder` (repo), `AppBuilder` (README),
     `turmu_builder` (skills). Pick one public name before going wide.
  4. **Secrets assume a trusted single operator.** No per-request/per-user key
     passing.

---

## 3. Target architecture — "core + adapters"

Refactor into one installable **core package** with a **stateless, key-injected
API**, and make every surface a thin adapter over it.

```
                         ┌──────────────────────────────────────┐
   MCP server  ─────────►│                                       │
   Agent Skill ─────────►│   appbuilder-core (pip package)       │
   Web app (BYO-keys) ──►│   build() / update() / experiment()   │──► {repo_url,...}
   Discord / Slack / TG ►│   deploy() / list_models()            │
   CLI (existing) ──────►│   — all take an explicit Credentials  │
                         │     object; NO global config/state    │
                         └──────────────────────────────────────┘
```

### 3.1 Core refactor (the enabler for everything else)
- **Introduce a `Credentials` object** passed into each call:
  `Credentials(github_token, github_username, ai_provider, ai_key, vercel_token=None)`.
  Replace reads of module-global `config`/`model_manager` in the hot path with
  this per-call object. Keep `config.py` only as a convenience default loader
  (env → Credentials) for the CLI/bot.
- **Make model selection per-call, not global** — pass `ai_provider`/`model`
  into `build()` instead of mutating `model_manager` singletons.
- **Package it:** add `pyproject.toml`, expose `appbuilder.build(...)`,
  `appbuilder.update(...)`, `appbuilder.experiment(...)`, `appbuilder.deploy(...)`,
  `appbuilder.list_models()`. This is the ~80% of the work; every adapter is
  small once this exists.
- **Backwards-compat shim:** keep `run_pipeline(prompt, ai_provider)` working
  (it builds a `Credentials` from env and calls `build()`), so the Discord bot
  and CLI keep running unchanged during migration.

### 3.2 Public API (what adapters call)
| Function | Purpose | Key inputs |
| --- | --- | --- |
| `build(prompt, creds, *, model=None, private=True)` | NL → new repo | prompt, creds |
| `update(repo_url, changes, creds, *, model=None)` | modify existing repo | repo_url, changes |
| `experiment(repo_url, branch, changes, creds)` | changes on a branch | repo_url, branch |
| `deploy(repo_url, creds)` | Vercel/Fly deploy | repo_url, vercel_token |
| `list_models(creds)` / `check_keys(creds)` | discovery / validation | creds |

Return stays the current dict (`repo_url, repo_name, file_count, tech_stack,
how_to_run`) — a stable contract every surface renders.

---

## 4. Surface designs (all thin adapters)

### 4.1 MCP server  — *the "any platform" backbone*  ★ build first
- **Tools:** `build_app`, `update_app`, `experiment_app`, `deploy_repo`,
  `list_models`, `check_keys` — 1:1 with the core API.
- **Transport:** `stdio` for local clients (Claude Desktop, Claude Code, Cursor)
  and streamable-HTTP for optional remote/self-host.
- **BYO-keys:** the client injects `GITHUB_TOKEN` / `AI_KEY` via the MCP server's
  **env config block** in the client's own config file (never our server). For
  remote HTTP, keys come per-session from the caller — we hold nothing.
- **Distribution:** `uvx appbuilder-mcp` / `pipx run`, plus a one-line
  `claude mcp add` snippet. Publish to the MCP registry.
- **Why first:** it satisfies *most* of "any platform" immediately (every
  MCP-capable agent) and the Skill can just ride on top of it.

### 4.2 Claude Agent Skill  — *the workflow/knowledge layer*
- Per Anthropic's "Skills + MCP" model: **MCP = connectivity, Skill = how to use
  it well.** The Skill teaches Claude to gather the app spec, pick a model, call
  the MCP `build_app` tool, and report the repo URL + run steps.
- **Structure** (progressive disclosure, follows the skill-building guide):
  `SKILL.md` (concise) + `references/` (provider notes, prompt-writing tips,
  troubleshooting) + optional `scripts/` (a keyless CLI shim for Claude Code).
  **Frontmatter must have no `<`/`>` angle brackets** (the rule that bit `mod`).
- **Fallback path:** if no MCP server is configured, the Skill can call the
  packaged CLI (`uvx appbuilder build "..."`) directly in Claude Code.
- **Publish** to `Skills-Directory` alongside `mod`, `code-translator`, etc.

### 4.3 Public web app  — *BYO-keys, no central secret*
The tension: "public web app" + "bring-your-own-keys". Resolution — the web app
**never holds a shared key**. Two viable modes (recommend both, in order):
- **Mode A — client-side keys (default public demo):** static SPA; the user
  pastes their GitHub token + AI key, stored in `localStorage`/session only.
  Calls go browser → provider/GitHub directly, or through a **stateless**
  serverless function that *forwards* the user's keys and stores nothing. Clear
  "your keys never leave your browser / are never stored" copy. Ship a premium
  landing page (use the `frontend-design` skill) with the hero → value → proof →
  CTA narrative.
- **Mode B — one-click self-host:** "Deploy your own" (Vercel/Fly button) so a
  user runs their *own* instance with their keys in their own env. This is the
  safest "public" form and reuses the existing `Dockerfile`/`fly.toml`.
- **Explicitly out of scope for v1:** a hosted instance where *we* pay for AI and
  push on users' behalf — that needs GitHub OAuth, cost caps, and abuse
  controls, and contradicts BYO-keys. Park it behind a documented "future
  hosted" section.

### 4.4 More chat bots  — *Discord (existing) + Slack + Telegram*
- Extract the Discord command handlers' *rendering* from the *pipeline calls*;
  each bot becomes: parse command → build `Credentials` (per-workspace config) →
  call core → render platform-native cards.
- Slack (Bolt) and Telegram (python-telegram-bot) are ~one file each once the
  core is key-injected. Per-workspace keys stored by the operator who installs
  the bot (still BYO — the bot operator brings keys, not us).

---

## 5. Security & safety (BYO-keys model)
- **Never persist user keys server-side.** MCP/web forward or read from the
  caller's own env; web app keeps them client-side. Document this loudly.
- **Private repos by default** (already the case); expose `private` as an opt-in
  flag only.
- **Generated-code caveat:** the model writes code from an untrusted prompt —
  note that generated repos are unaudited; CI validate-workflow already gives a
  basic build check.
- **Rate/cost:** BYO-keys pushes cost + limits onto the user's own quota — good.
  For any self-host HTTP mode, add simple per-token rate limiting.
- **Least-privilege tokens:** docs should recommend a GitHub token scoped to
  `repo` only, and short-lived AI keys.

---

## 6. Packaging, naming, distribution
- **Pick one public name.** Recommend **AppBuilder** (clear, descriptive) or a
  distinct brand; rename repo/skills consistently. Keep `turmux`/Termux framing
  as a *feature* ("works on your phone"), not the product name.
- **Artifacts:**
  - `appbuilder-core` — pip package (the engine).
  - `appbuilder-mcp` — `uvx`-runnable MCP server.
  - `appbuilder` Agent Skill — in `Skills-Directory`.
  - `web/` — the SPA + self-host button.
  - `bots/` — discord (moved), slack, telegram.
- **One-command installs** for each, with copy-paste `claude mcp add` and
  `~/.claude/skills/` steps in the README (mirroring the Skills-Directory
  Install & Use section).

---

## 7. Risks & open questions
- **Model naming reality-check:** README lists `gemini-3.1-pro`,
  `github-copilot/claude-opus-4.5`, etc. — verify these IDs against current
  provider APIs before publishing (stale IDs → confusing failures).
- **GitHub Models access:** "free via GITHUB_TOKEN" depends on the token's
  access to GitHub Models; document the exact scope/enrollment.
- **Web-app CORS/keys:** browser → provider calls may hit CORS; the stateless
  forwarder function is the fallback. Confirm per provider.
- **Open Q:** one public name — keep `AppBuilder`, or rebrand? (blocks the rename PR)
- **Open Q:** MCP first vs Skill first? (recommend MCP first; Skill rides on it)

---

## 8. Phased roadmap (recommended order)
1. **Phase 1 — Core-ify (unblocks all):** add `Credentials`, make model/keys
   per-call, add `pyproject.toml`, keep `run_pipeline` shim. Discord bot keeps
   working. *Exit: `pip install -e .` + `appbuilder build "..."` works.*
2. **Phase 2 — MCP server:** wrap the 6 tools; `uvx` + `claude mcp add`; test in
   Claude Desktop/Code. *Exit: build an app end-to-end from an MCP client.*
3. **Phase 3 — Agent Skill:** `SKILL.md` over the MCP tools; publish to
   Skills-Directory. *Exit: "build me X" works in Claude with BYO-keys.*
4. **Phase 4 — Web app:** BYO-keys SPA + self-host button + premium landing.
5. **Phase 5 — More bots:** Slack + Telegram adapters; relocate Discord.

Each phase is independently shippable and leaves the current Discord bot intact.

---

## 9. Recommendation (one line)
**Do Phase 1 + 2 first** (core package + MCP server) — that alone delivers
"invoke smoothly on any platform" for the whole AI-agent ecosystem with BYO-keys
and almost no ongoing cost; the Skill, web app, and extra bots then layer on
cheaply. Approve this ordering (and the public name) and I'll start Phase 1.
