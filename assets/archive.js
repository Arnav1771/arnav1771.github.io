/*
 * archive.js - the professional world.
 *
 * An experimental design publication about a repository record. It owns its own
 * markup: the shell hands it an empty stage and it builds the whole page, which
 * is the point of the split. The other world is not this page with different
 * colours, it is a different page, so nothing here is written to be overridden.
 *
 * Composition over components: rows rather than cards, weight from the record
 * deciding how much room a repository gets, index numerals set large and
 * metadata set small. Nothing invents a number - where the record cannot
 * support a figure, the figure is not shown.
 */
(function (global) {
  "use strict";

  var still = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function pad3(n) {
    n = String(n);
    while (n.length < 3) n = "0" + n;
    return n;
  }

  /* Everything that must be undone on teardown is registered here. */
  var live = null;

  function fresh() {
    return {
      io: null,
      frames: [],
      listeners: [],
      root: null,
      archive: [],
      shown: 0,
      filter: { key: "all", value: null }
    };
  }

  function on(node, type, fn) {
    if (!node) return;
    node.addEventListener(type, fn);
    live.listeners.push([node, type, fn]);
  }

  function frame(fn) {
    var id = requestAnimationFrame(function (t) {
      var at = live.frames.indexOf(id);
      if (at !== -1) live.frames.splice(at, 1);
      fn(t);
    });
    live.frames.push(id);
    return id;
  }

  /* ------------------------------------------------------------- markup */

  var MARKUP =
    '<div class="mesh" aria-hidden="true"></div>' +
    '<div class="grain" aria-hidden="true"></div>' +

    '<section class="opening" id="opening">' +
      '<div class="field">' +
        '<p class="eyebrow">Read off the commit log, not the r&eacute;sum&eacute;</p>' +
        '<h1 class="statement" id="statement">' +
          '<span class="line"><span>It did not</span></span>' +
          '<span class="line"><span>grow.</span></span>' +
          '<span class="line"><span>It went</span></span>' +
          '<span class="line step"><span class="hit">vertical.</span></span>' +
        '</h1>' +
        '<p class="claim">' +
          'Not a resume, and not a list of skills. Every repository started, in ' +
          'the order it was started, and the commit history behind the ones ' +
          'still on disk. The shape further down this page is the argument.' +
        '</p>' +
        '<p class="stamp" id="stamp">' +
          'Source &mdash; GitHub<br>Compiled &mdash; <span data-compiled>&mdash;</span><br>' +
          'Method &mdash; the commit log, not claims' +
        '</p>' +
        '<div class="object" aria-hidden="true"><canvas id="monument"></canvas></div>' +
        '<div class="figures" id="figures"></div>' +
      '</div>' +
    '</section>' +

    '<section class="chapter" id="ramp"><div class="field">' +
      '<div class="marker rise"><b>02</b>The ramp</div>' +
      '<h2 class="title rise">Something<br><em>happened</em> here</h2>' +
      '<p class="note rise">Commits by month, with repositories started stacked ' +
        'above the line. Nothing much for a long while, and then a wall.</p>' +
      '<div class="ramp rise" id="ramp-viz"></div>' +
    '</div></section>' +

    '<section class="chapter" id="years"><div class="field">' +
      '<div class="marker rise"><b>03</b>Years</div>' +
      '<h2 class="title rise">Chapters, in<br>the order they <em>fell</em></h2>' +
      '<p class="note rise">Each year named for what the record shows, not for ' +
        'how it felt.</p>' +
      '<div class="arcs rise" id="arcs"></div>' +
    '</div></section>' +

    '<section class="chapter" id="arsenal"><div class="field">' +
      '<div class="marker rise"><b>04</b>Written in</div>' +
      '<h2 class="title rise">What it was<br><em>written</em> in</h2>' +
      '<p class="note rise">By repository count. Hover a language to see what it ' +
        'went into.</p>' +
      '<div class="arsenal rise" id="arsenal-list"></div>' +
    '</div></section>' +

    '<section class="chapter" id="archive"><div class="field">' +
      '<div class="marker rise"><b>05</b>Archive</div>' +
      '<h2 class="title rise">The <em>archive</em></h2>' +
      '<p class="note rise">Every repository as an artifact rather than a card. ' +
        'Room on the page follows weight in the record.</p>' +
      '<div class="archive rise" id="archive-list">' +
        '<div class="filters" id="filters" role="group" aria-label="Filter the archive"></div>' +
        '<div id="items"></div>' +
        '<button class="more" id="more" type="button" hidden>Show more</button>' +
      '</div>' +
    '</div></section>' +

    '<footer class="source"><div class="field">' +
      '<p class="big">The work<br>continues.</p>' +
      '<div class="cols">' +
        '<div><b>Source</b><a href="https://github.com/Arnav1771">github.com/Arnav1771</a></div>' +
        '<div><b>Archive</b><a href="projects/">Project index</a><br><a href="galleries/">Galleries</a></div>' +
        '<div><b>Compiled from</b>the commit log</div>' +
        '<div><b>Published by</b>Stealth Keqing</div>' +
      '</div>' +
    '</div></footer>';

  /* ------------------------------------------------------------- reveal */

  function watch(node) {
    if (!node) return;
    if (live.io && !still) live.io.observe(node);
    else node.classList.add("go");
  }

  function runUp(node, target) {
    if (still || !target) {
      node.textContent = Number(target || 0).toLocaleString();
      return;
    }
    var started = 0;
    function step(now) {
      if (!started) started = now;
      var t = Math.min((now - started) / 1200, 1);
      node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString();
      if (t < 1) frame(step);
    }
    frame(step);
  }

  /* ------------------------------------------------------------- pieces */

  function q(id) { return live.root ? live.root.querySelector("#" + id) : null; }

  function renderFigures(s) {
    var box = q("figures");
    if (!box) return;
    var t = s.totals || {};
    var rows = [];
    if (t.repositories) rows.push(["repositories", t.repositories, false]);
    if (t.commits) rows.push(["commits in the log", t.commits, true]);
    if (t.years) rows.push(["active years", t.years, false]);
    if (t.languages) rows.push(["languages", t.languages, false]);
    if (!rows.length) return;

    box.innerHTML = rows.map(function (r) {
      return '<div class="figure' + (r[2] ? " mark" : "") + '"><b data-n="' + r[1] +
        '">0</b><span>' + esc(r[0]) + "</span></div>";
    }).join("");
    var bs = box.querySelectorAll("b[data-n]");
    for (var i = 0; i < bs.length; i += 1) runUp(bs[i], Number(bs[i].getAttribute("data-n")));
    watch(box); // its rule draws itself in
  }

  function renderRamp(s) {
    var box = q("ramp-viz");
    if (!box || !s.ramp || !s.ramp.length) return;
    var ramp = s.ramp, maxC = 1, maxS = 1;
    ramp.forEach(function (r) {
      if (r.commits > maxC) maxC = r.commits;
      if (r.started > maxS) maxS = r.started;
    });

    var bars = ramp.map(function (r, i) {
      var h = Math.max(1.2, (r.commits / maxC) * 100);
      var sh = Math.round((r.started / maxS) * 34);
      return '<button class="bar' + (r.isPeak ? " peak" : "") + '" type="button"' +
        ' style="height:' + h + "%;transition-delay:" + Math.min(i * 14, 520) + 'ms"' +
        ' data-period="' + esc(r.period) + '" data-commits="' + r.commits +
        '" data-started="' + r.started + '"' +
        ' aria-label="' + esc(r.period) + ": " + r.commits + " commits, " +
        r.started + ' started">' +
        (r.started ? '<span class="started" style="height:' + sh + 'px"></span>' : "") +
        "</button>";
    }).join("");

    box.innerHTML =
      '<div class="ramp-read" id="ramp-read"><b>&mdash;</b>hover the ramp</div>' +
      '<div class="ramp-bars">' + bars + "</div>" +
      '<div class="ramp-axis"><span>' + esc(ramp[0].period) + "</span><span>" +
      esc(ramp[ramp.length - 1].period) + "</span></div>";

    var read = q("ramp-read");
    function show(node) {
      if (!node || !read) return;
      read.innerHTML = "<b>" + esc(node.getAttribute("data-commits")) + "</b>" +
        esc(node.getAttribute("data-period")) + " &middot; " +
        esc(node.getAttribute("data-started")) + " started";
    }
    on(box, "mouseover", function (ev) {
      show(ev.target && ev.target.closest ? ev.target.closest(".bar") : null);
    });
    on(box, "focusin", function (ev) {
      show(ev.target && ev.target.closest ? ev.target.closest(".bar") : null);
    });
  }

  function renderArcs(s) {
    var box = q("arcs");
    if (!box || !s.arcs || !s.arcs.length) return;
    box.innerHTML = s.arcs.map(function (a) {
      var delta = "";
      if (typeof a.delta === "number" && a.delta !== 0) {
        delta = '<span class="delta' + (a.delta > 0 ? " up" : "") + '">' +
          (a.delta > 0 ? "+" : "") + a.delta + " vs prior</span>";
      }
      var meta = [];
      if (a.repos) meta.push(a.repos + " started");
      // Per-year commits only exist inside the local git window; elsewhere the
      // record has nothing, and a zero would read as a fact.
      if (typeof a.commits === "number") meta.push(a.commits + " commits");
      if (a.languages && a.languages.length) meta.push(a.languages.slice(0, 4).join(" · "));
      return '<div class="arc">' +
        '<span class="yr">' + esc(a.year) + "</span>" +
        '<span class="name">' + (a.title ? esc(a.title) : "<em>&mdash;</em>") + "</span>" +
        '<span class="meta">' + esc(meta.join("  ·  ")) + "</span>" +
        delta + "</div>";
    }).join("");
  }

  function renderArsenal(s) {
    var box = q("arsenal-list");
    if (!box || !s.arsenal || !s.arsenal.length) return;
    var most = 1;
    s.arsenal.forEach(function (a) { if (a.repos > most) most = a.repos; });
    box.innerHTML = s.arsenal.map(function (a) {
      var right = typeof a.share === "number"
        ? Math.round(a.share * 100) + "%  ·  " + a.repos
        : a.repos + " repos";
      var used = (a.projects && a.projects.length) ? a.projects.slice(0, 5).join("  ·  ") : "";
      return '<div class="tool" style="--w:' + ((a.repos / most) * 100) + '%">' +
        '<span class="t-name">' + esc(a.name) + "</span>" +
        '<span class="t-bar"><span class="t-fill"></span></span>' +
        '<span class="t-n">' + esc(right) + "</span>" +
        (used ? '<span class="tool-projects">' + esc(used) + "</span>" : "") +
        "</div>";
    }).join("");
  }

  var PAGE = 18;

  function passes(it) {
    var f = live.filter;
    if (f.key === "all") return true;
    if (f.key === "year") return String(it.year) === String(f.value);
    if (f.key === "language") return it.language === f.value;
    if (f.key === "category") return it.category === f.value;
    return true;
  }

  function itemHtml(it) {
    var big = typeof it.weight === "number" && it.weight >= 0.66;
    var tags = [];
    if (it.language) tags.push(it.language);
    if (it.category) tags.push(it.category);
    var act = [];
    if (it.status) act.push(it.status);
    if (it.pushed) act.push(String(it.pushed).slice(0, 10));
    return '<a class="item' + (big ? " big" : "") +
      (it.status === "active" ? " active" : "") + '"' +
      ' href="https://github.com/Arnav1771/' + esc(it.name) + '" target="_blank" rel="noopener">' +
      '<span class="idx">' + pad3(it.index) + "</span>" +
      '<span><span class="n">' + esc(it.name) + "</span>" +
      (it.description ? '<span class="d">' + esc(it.description) + "</span>" : "") + "</span>" +
      '<span class="tags">' + tags.map(function (t) { return "<i>" + esc(t) + "</i>"; }).join("") + "</span>" +
      '<span class="act"><span class="dot"></span>' + esc(act.join(" · ")) + "</span>" +
      '<span class="rule"></span></a>';
  }

  function paintItems(reset) {
    var box = q("items");
    if (!box) return;
    var list = [], i;
    for (i = 0; i < live.archive.length; i += 1) {
      if (passes(live.archive[i])) list.push(live.archive[i]);
    }
    if (reset) { box.innerHTML = ""; live.shown = 0; }
    var next = list.slice(live.shown, live.shown + PAGE);
    var from = box.children.length;
    box.insertAdjacentHTML("beforeend", next.map(itemHtml).join(""));
    live.shown += next.length;

    // Each row is watched on its own. Revealing the whole page at once would
    // fire mostly below the fold, so the animation would be over before it
    // was seen - and the reader would meet a list that had already finished
    // arriving.
    for (var k = from; k < box.children.length; k += 1) {
      var row = box.children[k];
      row.style.transitionDelay = Math.min((k - from) * 45, 420) + "ms";
      watch(row);
    }
    var more = q("more");
    if (!more) return;
    more.hidden = live.shown >= list.length;
    more.textContent = "Show more — " + Math.max(0, list.length - live.shown) + " remaining";
  }

  function renderArchive(s) {
    live.archive = s.archive || [];
    if (!live.archive.length) return;
    var facets = s.facets || {};
    var chips = ['<button type="button" data-key="all" aria-pressed="true">All ' +
      live.archive.length + "</button>"];
    (facets.years || []).slice(0, 8).forEach(function (y) {
      chips.push('<button type="button" data-key="year" data-value="' + esc(y) + '">' + esc(y) + "</button>");
    });
    (facets.languages || []).slice(0, 6).forEach(function (l) {
      chips.push('<button type="button" data-key="language" data-value="' + esc(l) + '">' + esc(l) + "</button>");
    });
    (facets.categories || []).slice(0, 6).forEach(function (c) {
      chips.push('<button type="button" data-key="category" data-value="' + esc(c) + '">' + esc(c) + "</button>");
    });

    var filters = q("filters");
    filters.innerHTML = chips.join("");
    on(filters, "click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("button") : null;
      if (!b) return;
      live.filter = { key: b.getAttribute("data-key"), value: b.getAttribute("data-value") };
      var all = filters.querySelectorAll("button");
      for (var i = 0; i < all.length; i += 1) {
        all[i].setAttribute("aria-pressed", String(all[i] === b));
      }
      paintItems(true);
    });

    var more = q("more");
    if (more) on(more, "click", function () { paintItems(false); });
    paintItems(true);
  }

  /* ------------------------------------------------------------ lifecycle */

  function render(stage, story, raw) {
    live = fresh();
    live.root = stage;
    stage.className = "w-archive";
    stage.innerHTML = MARKUP;

    if ("IntersectionObserver" in global && !still) {
      live.io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          if (!entries[i].isIntersecting) continue;
          entries[i].target.classList.add("go");
          live.io.unobserve(entries[i].target);
        }
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    }

    var compiled = stage.querySelector("[data-compiled]");
    if (compiled) {
      var when = (raw && raw.meta && (raw.meta.generated || raw.meta.built || raw.meta.date)) || "";
      compiled.textContent = when ? String(when).slice(0, 10) : "from the repository record";
    }

    story = story || {};
    renderFigures(story);
    renderRamp(story);
    renderArcs(story);
    renderArsenal(story);
    renderArchive(story);

    var rises = stage.querySelectorAll(".rise");
    for (var i = 0; i < rises.length; i += 1) watch(rises[i]);

    if (global.Monument && global.Monument.mount) {
      try {
        global.Monument.mount(q("monument"), raw, {
          reducedMotion: still,
          still: still,
          world: "professional"
        });
        if (global.Monument.setTheme) global.Monument.setTheme("professional");
      } catch (e) { /* the page reads without it */ }
    }

    // The opening is already in view on load; it does not wait for a scroll.
    frame(function () {
      var st = q("statement");
      if (st) st.classList.add("go");
    });
  }

  function teardown() {
    if (!live) return;
    if (global.Monument && global.Monument.destroy) {
      try { global.Monument.destroy(); } catch (e) {}
    }
    if (live.io) { try { live.io.disconnect(); } catch (e) {} }
    live.frames.forEach(function (id) { cancelAnimationFrame(id); });
    live.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    live = null;
  }

  global.Archive = { render: render, teardown: teardown };
})(window);
