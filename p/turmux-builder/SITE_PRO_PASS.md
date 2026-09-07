# Site professional-grade pass (2026-07-15)

Whole-site elevation beyond the KOTODAMA hero (see KOTODAMA.md):

- **Truthful content everywhere** — removed fabricated claims: fake Vercel
  deploy pipeline, "GPT-4o builds / Gemini validates" copy, "Turmux Systems",
  dead Careers/Twitter links, "60s Deploy Time" metric. Terminal sequence,
  platform cards, metrics and Discord embed now describe the real pipeline
  (plan → generate → private GitHub repo + CI validate + IMP_DOCS, 4 providers,
  /model switching, 5 surfaces) per README.md.
- **Brand unification** — the teal/silver section theme is retuned to the
  kotodama ink/gold/crimson identity via a scoped override block (gradients,
  chip glow, beams, orb, metrics, card borders, log accents).
- **Quickstart section** (new) — three real paths: Discord `/build`, the
  BYO-keys web app (grimoire-MCP), and self-host (`git clone` → `pip install
  -r requirements.txt` → `python main.py`).
- **Head/meta** — real title/description, canonical, OG tags, theme-color,
  言 favicon (inline SVG data URI).
- **Footer** — real links only (Tech Spec, Open-Platform Design, models;
  Web/Discord/CLI/MCP surfaces; GitHub + portfolio). `:focus-visible` outline
  added.

Verified headless: quickstart cards render, 0 px horizontal overflow,
0 console errors; hero + footer screenshots reviewed.
