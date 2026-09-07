/* ─────────────────────────────────────────────────────────────
   KOTODAMA (言霊) — the glyph-forged swordsman.
   A samurai assembled from ~2,000 living glyphs (kanji + real code
   tokens), sampled from code-drawn silhouette geometry. No images,
   no libraries. Cursor cuts scatter him like wind; he re-forges.
   Words typed into the summon line are absorbed into his body.
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var cv = document.getElementById("kotodama");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var KANJI = "斬言霊刀式型関数変送火月風雷影鍛造魂".split("");
  var CODE = ["fn", "=>", "{}", "()", "::", "<>", "git", "push", "let", "λ", "//", "&&", "[]", "if"];
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function glyph() { return Math.random() < 0.6 ? pick(KANJI) : pick(CODE); }

  /* silhouette geometry (the sentinel, 360×520 design space) — drawn, not pasted */
  var P_BODY = new Path2D("M180 132 C168 132 158 140 154 152 C124 156 96 172 84 214 C74 252 74 330 92 478 C120 462 150 468 180 468 C210 468 240 462 268 478 C286 330 286 252 276 214 C264 172 236 156 206 152 C202 140 192 132 180 132 Z");
  var P_CREST = new Path2D("M180 136 C152 130 136 110 134 86 C152 102 168 108 180 108 C192 108 208 102 226 86 C224 110 208 130 180 136 Z");
  var P_KNOT = new Path2D("M180 250 L192 265 L180 280 L168 265 Z");

  var parts = [], W = 0, H = 0, fontPx = 12;
  var mouse = { x: -9e3, y: -9e3, px: -9e3, py: -9e3, vx: 0, vy: 0 };
  var pulse = 0, running = false, buildT = 0;

  function build() {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = w * DPR; cv.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    W = w; H = h; parts.length = 0;

    var s = Math.min(w / 380, h / 545);
    var ox = (w - 360 * s) / 2, oy = (h - 520 * s) / 2 + 8;

    var off = document.createElement("canvas");
    off.width = w; off.height = h;
    var o = off.getContext("2d");
    o.setTransform(s, 0, 0, s, ox, oy);
    o.fillStyle = "#334455"; o.fill(P_BODY);                     // body mass
    o.fillStyle = "#ffaa44"; o.fill(P_CREST); o.fill(P_KNOT);    // gold soul-metal
    o.fillRect(155, 147, 50, 10);                                // visor
    o.fillStyle = "#dde6ff";                                     // blade steel
    o.fillRect(306, 234, 12, 260); o.fillRect(290, 220, 44, 10);

    var data = o.getImageData(0, 0, w, h).data;
    var step = w > 700 ? 8 : 10;
    fontPx = step + 3;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var i = (y * w + x) * 4;
        if (data[i + 3] < 120) continue;
        var r = data[i], b = data[i + 2], col;
        if (r > 220) col = "gold";
        else if (b > 220) col = "steel";
        else col = Math.random() < 0.07 ? "ember" : "body";
        parts.push({
          tx: x, ty: y,
          x: w / 2 + (Math.random() - 0.5) * w * 1.6,
          y: h / 2 + (Math.random() - 0.5) * h * 1.6,
          vx: 0, vy: 0, ch: glyph(), col: col,
          ph: Math.random() * 6.283, hot: 0
        });
      }
    }
    buildT = performance.now();
  }

  var COLORS = {
    body:  function (a) { return "rgba(148,164,196," + a + ")"; },
    ember: function (a) { return "rgba(224,90,60,"  + (a * 1.1) + ")"; },
    gold:  function (a) { return "rgba(245,214,123," + Math.min(1, a * 1.5) + ")"; },
    steel: function (a) { return "rgba(226,236,252," + Math.min(1, a * 1.4) + ")"; }
  };

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = fontPx + "px 'Courier New',monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    var mvx = mouse.x - mouse.px, mvy = mouse.y - mouse.py;
    mouse.px = mouse.x; mouse.py = mouse.y;
    var speed = Math.min(40, Math.hypot(mvx, mvy));
    var R = 80 + speed * 2, R2 = R * R;

    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      /* spring home */
      p.vx += (p.tx - p.x) * 0.022;
      p.vy += (p.ty - p.y) * 0.022;
      /* wind cut */
      var dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 0.01) {
        var d = Math.sqrt(d2), f = (1 - d / R) * (1.6 + speed * 0.22);
        p.vx += (dx / d) * f + mvx * 0.06;
        p.vy += (dy / d) * f + mvy * 0.06;
        p.hot = Math.min(1, p.hot + 0.25);
      }
      p.vx *= 0.9; p.vy *= 0.9;
      p.x += p.vx; p.y += p.vy;
      p.hot *= 0.96;

      var tw = 0.62 + 0.38 * Math.sin(t * 0.0016 + p.ph);
      var a = tw * (p.col === "body" ? 0.6 : 0.95) + p.hot * 0.4 + pulse * 0.35;
      ctx.fillStyle = p.hot > 0.25
        ? "rgba(255,236,180," + Math.min(1, a) + ")"
        : COLORS[p.col](Math.min(1, a));
      ctx.fillText(p.ch, p.x, p.y);
    }

    /* forge pulse ring */
    if (pulse > 0.02) {
      var pr = (1 - pulse) * Math.max(W, H) * 0.7;
      ctx.strokeStyle = "rgba(245,214,123," + pulse * 0.8 + ")";
      ctx.lineWidth = 2 + pulse * 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, pr, 0, 6.283); ctx.stroke();
      pulse *= 0.955;
    } else pulse = 0;

    if (running) requestAnimationFrame(frame);
  }

  /* ── summon line: typed words are absorbed into the figure ── */
  var input = document.getElementById("summon");
  var kicker = document.querySelector(".hero-kicker");
  var kicker0 = kicker ? kicker.textContent : "";
  if (input) {
    input.addEventListener("input", function () {
      var c = input.value.slice(-1);
      if (!c || c === " " || !parts.length) return;
      var p = parts[(Math.random() * parts.length) | 0];
      p.ch = c; p.col = "gold"; p.hot = 1;
      p.x = 0; p.y = H * 0.62; p.vx = 6 + Math.random() * 4; p.vy = -2 + Math.random() * 4;
    });
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || !input.value.trim()) return;
      pulse = 1;
      var slug = input.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "your-app";
      if (kicker) {
        kicker.textContent = "λ KOTODAMA ACCEPTED — turmux build \"" + slug + "\"";
        setTimeout(function () { kicker.textContent = kicker0; }, 4200);
      }
      input.value = "";
    });
  }

  /* ── wiring ── */
  cv.addEventListener("mousemove", function (e) {
    var r = cv.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  cv.addEventListener("mouseleave", function () { mouse.x = mouse.px = -9e3; mouse.y = mouse.py = -9e3; });

  var rsz;
  addEventListener("resize", function () { clearTimeout(rsz); rsz = setTimeout(build, 220); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) running = false;
    else if (!reduce && !running) { running = true; requestAnimationFrame(frame); }
  });

  build();
  if (reduce) {
    /* static forge: settle particles instantly, draw one frame */
    parts.forEach(function (p) { p.x = p.tx; p.y = p.ty; });
    running = false; frame(0);
  } else {
    running = true; requestAnimationFrame(frame);
  }
})();
