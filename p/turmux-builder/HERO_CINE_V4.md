# Landing hero — v4 cinematic render (2026-07-15, supersedes v3 SVG sentinel)

User direction: the hero character must look like a real game render ("UE5
quality, Sekiro-like swordsman"), not vector art. Hand-coded SVG cannot reach
that fidelity — the correct pipeline is an **AI-rendered raster key art**
composited with cinematic CSS. This is that.

## The art

- `docs/assets/ronin-keyart.jpg` (1600×900, 71 KB) — generated with
  **Pollinations.ai (Flux)**, free/no-key endpoint, original artwork (no game
  IP; "Sekiro-like" mood only).
- Prompt (PROMPT_TRAIL convention):
  `cinematic video game key art, lone japanese ronin swordsman standing in
  tall pampas grass at night, seen from behind three-quarter view, black
  lacquered armor with gold trim accents, long katana held low at his side,
  enormous crimson full moon behind him, drifting embers and sakura petals,
  volumetric mist, dramatic rim lighting, unreal engine 5 render, octane
  render, hyperdetailed, photorealistic, dark moody background, subject on the
  right side of frame, empty dark negative space on the left`
  — seed 42, `model=flux&enhance=true&nologo=true`, 1600×900. (Seed 7 kept as
  an alternate in the PR description.)

## The composition

- **Full-bleed** `.hero-cine` layer behind the copy: the render at
  `66% 32% / cover` with a 26 s Ken Burns drift (`scale 1→1.06`).
- **Scrim**: left→right dark gradient for copy legibility + top/bottom fades
  that dissolve the image into the page background (seamless scroll into the
  GSAP sections).
- **Live embers**: 10 CSS particles rising over the still image.
- Copy column keeps the v3 hero-section-designer anatomy (kicker, "Speak. It
  ships.", subhead, 52px CTA, microcopy, trust chips) — unchanged.
- `.hero-title`/`.hero-sub` still present for the GSAP intro tween.
- Reduced-motion: drift + embers disabled. Mobile: image shifts right, copy
  centers.

**Verification:** headless Chromium `file://` — cine layer renders, 0 px
horizontal overflow, 0 console errors; screenshot reviewed.

## v4.1 — true depth composition (same day)

User called v4.0 out as "a photo + fire effects" — correct. v4.1 does the real
craft of the reference pages:

- **Character cutout** — `assets/ronin-cutout.png` produced with **rembg
  (U2Net)** in a local venv (`~/.rembg-venv`); the mask kept figure + moon +
  feathered mist base, so no hard edges.
- **Depth sandwich** — blurred/darkened scene plate (7px blur, Ken Burns) →
  giant hollow-stroke **TURMUX** display type → **crisp ronin cutout
  overlapping the type** → vertical kanji 語れば、出荷される → mist base →
  embers.
- **Mouse parallax** — layers translate at different rates (`data-par` 26/34/42),
  vanilla JS, `hover:none` (touch) and reduced-motion excluded; CSS-var
  transforms so centering (margins) never conflicts with parallax.
- Copy column and GSAP intro unchanged.
