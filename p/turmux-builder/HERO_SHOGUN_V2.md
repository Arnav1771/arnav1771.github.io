# Landing hero — forge-shogun construct (v2, 2026-07-14)

Part of the cross-repo "GG design" pass. The typographic GSAP hero now has an
**original mecha-shogun construct** (inline SVG, no game IP) looming spectrally
behind "Intelligence, Orchestrated.":

- Kabuto helmet with a glowing gold **crescent crest** rising above the title,
  mempo mask, flickering gold eyes, crimson/gold shoulder plates, diamond core
  (pulsing), two counter-rotating forge-rings, floating code-glyph sparks
  ({} </> () ;; λ).
- Rendered at 50% opacity behind the text (z-index below the title) so the
  minimal typographic identity stays primary.
- Idle float + spins + pulses, all `prefers-reduced-motion` safe.
- GSAP scrollytelling below the hero is untouched.

**Verification (headless Chromium, `file://`):** construct renders, 0 px
horizontal overflow, 0 console errors; screenshot reviewed.
