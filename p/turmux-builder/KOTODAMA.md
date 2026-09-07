# KOTODAMA (言霊) — the glyph-forged swordsman (v5, 2026-07-15)

Supersedes v4 (raster render — rejected: "don't just paste images"). v5 is
**pure code — zero images, zero libraries**: `kotodama.js`, a vanilla canvas
particle engine, ~130 lines of physics.

## How he exists

1. The sentinel silhouette (the v3 geometry) is drawn onto an **offscreen
   canvas** from `Path2D` strings — code, not an asset.
2. The pixels are sampled on a grid → ~2,000 target points, color-classified
   by region (body / gold soul-metal: crest, visor, knot / blade steel).
3. Each point becomes a **living glyph particle** — kanji (斬 言 霊 刀 式 …)
   and real code tokens (`fn` `=>` `{}` `git` `push` `λ`) — spring physics
   pulls each glyph home from a random spawn, so he **assembles from chaos on
   every page load**.
4. **The cursor is wind**: a velocity-scaled radial force scatters glyphs as
   you cut through him (they heat to white-gold), then the springs re-forge
   him.
5. **言霊 — words become the construct**: every character typed into the
   summon line flies into his body as a golden glyph and stays. Enter fires a
   forge-pulse ring and the kicker briefly reads
   `λ KOTODAMA ACCEPTED — turmux build "<slug>"`.

The blood moon is a CSS radial-gradient. Mist, labels, copy anatomy (v3) all
unchanged. GSAP scrollytelling untouched.

## Engineering notes

- ~2,000 particles at 60 fps (single `font` set, one `fillText` per particle);
  step 8px desktop / 10px small screens; rAF paused via `visibilitychange`.
- `prefers-reduced-motion`: particles settle instantly, one static frame, no
  loop, no wind.
- Mobile (≤940px): canvas full-width at 34% opacity behind centered copy.
- The raster assets from v4 (`ronin-keyart.jpg`, `ronin-cutout.png`) are
  **removed** — nothing on this hero is pasted.

**Verification:** `node --check` on the engine; headless Chromium `file://` —
canvas renders the assembled figure, 0 px horizontal overflow, 0 console
errors; screenshot reviewed.
