/* Grimoire — presentation FX only. Purely decorative; the generator lives in
   app.js and is untouched. Everything here degrades gracefully and respects
   prefers-reduced-motion. */
"use strict";
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── scroll progress + nav shrink ── */
  const bar = document.getElementById("scroll-progress");
  const nav = document.getElementById("nav");
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    if (bar) bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    if (nav) nav.classList.toggle("scrolled", h.scrollTop > 8);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── count-up stats ── */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function countUp(el) {
    const to = parseFloat(el.dataset.countTo || "0");
    const suffix = el.dataset.suffix || "";
    if (reduce || to === 0) { el.textContent = to + suffix; return; }
    const dur = 1100; let start = null;
    const step = (ts) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      el.textContent = Math.round(to * easeOut(p)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const statObs = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { countUp(e.target); statObs.unobserve(e.target); }
  }, { threshold: 0.5 });
  document.querySelectorAll(".stat .n[data-count-to]").forEach((el) => statObs.observe(el));

  /* ── ambient rune canvas ── */
  const cv = document.getElementById("runefield");
  if (cv && cv.getContext) {
    const ctx = cv.getContext("2d");
    const glyphs = ["✦", "✧", "⟡", "◇", "·", "⋆", "⚬"];
    let w, h, dpr, motes = [];
    const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim() || "#8b5cf6";
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(52, (w * h) / 16000));
      motes = Array.from({ length: n }, (_, i) => ({
        x: (i * 97.13) % w, y: (i * 53.7) % h,
        s: 6 + ((i * 7) % 12), v: 0.06 + ((i % 5) * 0.03),
        g: glyphs[i % glyphs.length], a: 0.12 + ((i % 4) * 0.05), tw: (i % 7) * 0.9,
      }));
    }
    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      const col = accent();
      for (const m of motes) {
        m.y -= m.v; if (m.y < -12) m.y = h + 12;
        const a = m.a * (0.6 + 0.4 * Math.sin(t / 900 + m.tw));
        ctx.globalAlpha = a; ctx.fillStyle = col;
        ctx.font = `${m.s}px "Space Mono", monospace`;
        ctx.fillText(m.g, m.x, m.y);
      }
      ctx.globalAlpha = 1;
      if (running) requestAnimationFrame(frame);
    }
    let running = false;
    resize();
    addEventListener("resize", resize);
    if (reduce) { frame(0); }             // one static draw
    else {
      const start = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
      const stop = () => { running = false; };
      document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
      start();
    }
  }

  /* ── spell console typewriter (plays once) ── */
  const body = document.getElementById("console-body");
  if (body) {
    const script = [
      { t: '<span class="prompt">$</span> <span class="cmd">grimoire build \\</span>', d: 260 },
      { t: '  <span class="cmd">"a Flask todo app with SQLite + dark mode"</span>', d: 420 },
      { t: '', d: 260 },
      { t: '<span class="dim">⚙  planning · gemini-3.5-flash</span>', d: 520 },
      { t: '<span class="ok">📋 plan: flask-todo — 7 files</span>', d: 420 },
      { t: '<span class="dim">✍  generating…</span>', d: 360 },
      { t: '   ✓ <span class="file">app.py</span>', d: 200 },
      { t: '   ✓ <span class="file">templates/index.html</span>', d: 200 },
      { t: '   ✓ <span class="file">static/style.css</span>', d: 200 },
      { t: '   ✓ <span class="file">requirements.txt</span>', d: 200 },
      { t: '   ✓ <span class="file">IMP_DOCS/HANDOFF.md</span>', d: 260 },
      { t: '<span class="dim">🐙 creating private repo…</span>', d: 520 },
      { t: '<span class="ok">📤 pushed 9/9 files</span>', d: 360 },
      { t: '', d: 200 },
      { t: '<span class="ok">🎉 github.com/you/flask-todo</span>  <span class="dim">(private)</span>', d: 0 },
    ];
    const render = (n, caret) =>
      script.slice(0, n).map((l) => l.t).join("\n") + (caret ? '<span class="caret">▌</span>' : "");

    if (reduce) { body.innerHTML = render(script.length, false); }
    else {
      let i = 0;
      const play = () => {
        body.innerHTML = render(i + 1, i < script.length - 1);
        const delay = script[i].d;
        i++;
        if (i < script.length) setTimeout(play, delay);
      };
      // start when the hero is on screen (it is, at load) — small delay for polish
      const heroObs = new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); setTimeout(play, 500); }
      }, { threshold: 0.2 });
      heroObs.observe(body);
    }
  }
})();
