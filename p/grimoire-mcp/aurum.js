/* ─────────────────────────────────────────────────────────────
   AURUM — the billion-dollar polish engine (all pages).
   Scroll-reveal choreography, card spotlight, magnetic buttons,
   cursor comet, count-ups. Pure code, ~zero cost when idle.
   Reduced-motion and touch devices get a calm, static page.
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ── 1 · scroll-reveal choreography (auto-tagged, staggered) ── */
  var SEL = ".gcard,.pane,.gterm,.stat,.rite,.hero-copy > *,.comm-head > *,.doc > h1,.doc > h2,.doc > p,.feat3 > *,.live-card,.proj";
  var els = Array.prototype.slice.call(document.querySelectorAll(SEL));
  els.forEach(function (el) { el.classList.add("rv"); });
  if (reduce) {
    els.forEach(function (el) { el.classList.add("rv-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, sibs = els.filter(function (x) { return x.parentElement === el.parentElement; });
        el.style.transitionDelay = Math.min(sibs.indexOf(el) * 90, 450) + "ms";
        el.classList.add("rv-in");
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── 2 · card spotlight (gold light follows the cursor) ── */
  if (fine && !reduce) {
    document.querySelectorAll(".gcard,.pane").forEach(function (card) {
      card.classList.add("spot");
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ── 3 · magnetic buttons (CSS `translate`, never fights transform) ── */
  if (fine && !reduce) {
    document.querySelectorAll(".btn-gold,#build,#tryrun").forEach(function (b) {
      b.addEventListener("mousemove", function (e) {
        var r = b.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / r.width;
        var dy = (e.clientY - r.top - r.height / 2) / r.height;
        b.style.translate = (dx * 10) + "px " + (dy * 8) + "px";
      });
      b.addEventListener("mouseleave", function () { b.style.translate = "0px 0px"; });
    });
  }

  /* ── 4 · cursor comet (golden trail, screen-blended) ── */
  if (fine && !reduce) {
    var comet = document.createElement("div");
    comet.className = "comet"; comet.setAttribute("aria-hidden", "true");
    document.body.appendChild(comet);
    var cx = -100, cy = -100, tx = -100, ty = -100, live = false;
    addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!live) { live = true; requestAnimationFrame(glide); }
    }, { passive: true });
    function glide() {
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
      comet.style.translate = cx + "px " + cy + "px";
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.4) requestAnimationFrame(glide);
      else live = false;
    }
  }

  /* ── 5 · count-ups for [data-count] stats ── */
  var counters = document.querySelectorAll("[data-count]");
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function countUp(el) {
    var to = parseInt(el.dataset.count, 10), suf = el.dataset.suffix || "";
    if (reduce || !to) { el.textContent = to + suf; return; }
    var t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / 1100, 1);
      el.textContent = Math.round(to * ease(p)) + suf;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if (counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }
})();
