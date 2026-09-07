/* ─────────────────────────────────────────────────────────────
   THE CONJURING PORTAL — a living vortex of glyphs, pure code.
   ~900 rune/code-token particles orbit and spiral into the
   singularity; the cursor bends their orbits; the incantation
   teaser feeds typed characters into the vortex before handing
   the prompt to conjure.html. No images, no libraries.
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var cv = document.getElementById("portal");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var RUNES = "術式召喚門界言霊光影渦".split("");
  var CODE = ["{}", "()", "=>", "fn", "git", "push", "λ", "::", "<>", "&&"];
  function glyph() { return Math.random() < 0.5 ? RUNES[(Math.random() * RUNES.length) | 0] : CODE[(Math.random() * CODE.length) | 0]; }

  var parts = [], W = 0, H = 0, CX = 0, CY = 0, Rmax = 0;
  var mouse = { x: -9e3, y: -9e3 };
  var surge = 0, running = false;

  function spawn(p, rim) {
    p.r = rim ? Rmax * (0.92 + Math.random() * 0.16) : Rmax * (0.25 + Math.random() * 0.85);
    p.a = Math.random() * 6.283;
    p.w = (0.0035 + Math.random() * 0.0045) * (Math.random() < 0.08 ? 2.2 : 1);
    p.ch = glyph();
    p.gold = Math.random() < 0.22;
    p.sz = 9 + Math.random() * 8;
    p.ph = Math.random() * 6.283;
  }

  function build() {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = w * DPR; cv.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    W = w; H = h; CX = w / 2; CY = h / 2;
    Rmax = Math.min(w, h) * 0.46;
    parts.length = 0;
    var n = Math.min(900, Math.round((w * h) / 900));
    for (var i = 0; i < n; i++) { var p = {}; spawn(p, false); parts.push(p); }
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    /* event horizon glow */
    var g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Rmax);
    g.addColorStop(0, "rgba(242,217,146," + (0.20 + surge * 0.5) + ")");
    g.addColorStop(0.25, "rgba(168,85,247," + (0.16 + surge * 0.3) + ")");
    g.addColorStop(0.6, "rgba(139,92,246,.05)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.a += p.w * (1 + surge * 2);                       /* orbit */
      p.r -= (0.08 + p.r * 0.0011) * (1 + surge * 5);     /* inward spiral */
      if (p.r < Rmax * 0.06) spawn(p, true);              /* reborn at the rim */

      var x = CX + Math.cos(p.a) * p.r;
      var y = CY + Math.sin(p.a) * p.r * 0.62;            /* elliptical tilt */

      /* cursor bends the orbit */
      var dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 12000 && d2 > 1) {
        var d = Math.sqrt(d2), f = (1 - d / 110) * 14;
        x += (dx / d) * f; y += (dy / d) * f;
      }

      var depth = 1 - p.r / (Rmax * 1.1);                 /* brighter near core */
      var tw = 0.55 + 0.45 * Math.sin(t * 0.002 + p.ph);
      var a = (0.25 + depth * 0.75) * tw;
      ctx.font = (p.sz * (0.7 + depth * 0.5)) + "px 'Space Mono',monospace";
      ctx.fillStyle = p.gold
        ? "rgba(242,217,146," + Math.min(1, a * 1.25) + ")"
        : "rgba(196,167,255," + a + ")";
      ctx.fillText(p.ch, x, y);
    }

    /* singularity core */
    ctx.beginPath();
    ctx.arc(CX, CY, 5 + surge * 10 + Math.sin(t * 0.004) * 1.5, 0, 6.283);
    ctx.fillStyle = "rgba(255,248,224," + (0.85 + surge * 0.15) + ")";
    ctx.shadowColor = "rgba(242,217,146,.9)"; ctx.shadowBlur = 30 + surge * 40;
    ctx.fill(); ctx.shadowBlur = 0;

    if (surge > 0.01) surge *= 0.96; else surge = 0;
    if (running) requestAnimationFrame(frame);
  }

  /* incantation teaser: typed chars feed the vortex, Enter → conjure page */
  var inc = document.getElementById("incantation");
  if (inc) {
    inc.addEventListener("input", function () {
      var c = inc.value.slice(-1);
      if (!c || c === " " || !parts.length) return;
      var p = parts[(Math.random() * parts.length) | 0];
      p.ch = c; p.gold = true; p.r = Rmax * 1.02; p.w *= 1.6;
      surge = Math.min(1, surge + 0.08);
    });
    inc.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || !inc.value.trim()) return;
      surge = 1;
      var q = encodeURIComponent(inc.value.trim());
      setTimeout(function () { location.href = "conjure.html?prompt=" + q; }, 550);
    });
  }

  cv.addEventListener("mousemove", function (e) {
    var r = cv.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  cv.addEventListener("mouseleave", function () { mouse.x = mouse.y = -9e3; });

  var rsz;
  addEventListener("resize", function () { clearTimeout(rsz); rsz = setTimeout(build, 220); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) running = false;
    else if (!reduce && !running) { running = true; requestAnimationFrame(frame); }
  });

  build();
  if (reduce) { running = false; frame(0); }
  else { running = true; requestAnimationFrame(frame); }
})();
