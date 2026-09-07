# Landing hero — v3 "legendary" rework (2026-07-15, supersedes HERO_SHOGUN_V2)

User verdict on v2: the 50%-opacity shogun behind the headline read muddy.
v3 rebuilds the hero properly around the **hero-section-designer** anatomy
(leadgenjay/claude-skills) + a poster-grade key art column.

## Structure (split hero)

- **Copy column:** kicker (λ TURMUX — THE APP-FORGING ENGINE) → benefit
  headline **"Speak. It ships."** (gold→crimson gradient em) → specific subhead
  (plain English → planned architecture → private repo, minutes, your keys) →
  **52px primary CTA** "Forge your first app ⚒" + ghost "See the engine" →
  reassurance microcopy (free/open-source · BYO keys · no lock-in) → trust
  chips (15+ models · MCP/CLI/Web/Discord · docs in every repo). Staggered
  entrance animations.
- **Key-art column:** flat **crimson sun disc** (breathing) + dashed rotating
  ring; a towering **black-gold sentinel silhouette** — crescent-crowned,
  waist cords, pulsing agemaki diamond sigil; a **λ war banner** (skewing wave)
  on a gold pole; a **planted tachi** with an animated blade gleam; rising
  gold embers. Original art, no game IP.

## Gotchas encoded here

- SVG **vertical/horizontal lines + objectBoundingBox gradients render
  invisible** (zero-area bbox) — the blade gradient must stay
  `gradientUnits="userSpaceOnUse"`.
- Detail (faces/masks/hands) reads cartoonish at this scale; the figure works
  as a bold silhouette. Resist re-adding facial features.
- `.hero-title` / `.hero-sub` class names are load-bearing (GSAP intro
  animation targets them) — keep them on the new elements.

Responsive: stacks ≤940px (art above copy, centered). Reduced-motion safe.
**Verification:** headless Chromium `file://` — renders, 0 px horizontal
overflow, 0 console errors; screenshot reviewed at each of 3 iterations.
