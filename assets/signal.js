/*
 * signal.js - the anime world.
 *
 * The same repository record the other renderer reads as an editorial
 * archive, read here as an episode: an opening frame, an output field, an
 * arc index, an arsenal, and a drawer of mission files. It owns its own
 * markup end to end. Nothing in here is written to be overridden by the
 * other world, and nothing in here inherits the other world's composition -
 * that was the failure the split exists to fix.
 *
 * Contract: window.Signal = { render(stage, story, raw), teardown() }.
 * Honesty: arcs[].commits is absent for most years. It is tested for, and
 * rendered as an em dash, never as a zero. Nothing is invented anywhere.
 */
(function (global) {
  "use strict";

  var doc = global.document;

  var still = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  var OWNER = "Arnav1771";
  var PAGE = 18;

  /* ---------------------------------------------------------------- util */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function pad(n, w) {
    n = String(n);
    while (n.length < w) n = "0" + n;
    return n;
  }
  function nfmt(n) {
    n = Number(n) || 0;
    return n.toLocaleString ? n.toLocaleString("en-US") : String(n);
  }
  /* 2026-07-25T19:10:42Z -> 2026.07.25 ; 2026-07 -> 2026.07 */
  function stamp(iso) {
    var s = String(iso || "").slice(0, 10).replace(/-/g, ".");
    return s || "—";
  }
  function clip(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:.-]+$/, "") + "…" : s;
  }
  function upper(s) { return String(s || "").toUpperCase(); }

  /* ------------------------------------------------------------ lifetime */

  var live = null;

  function fresh() {
    return {
      root: null,
      io: null,
      secIo: null,
      frames: [],
      listeners: [],
      timers: [],
      par: [],
      onScroll: null,
      ticking: false,
      archive: [],
      shown: 0,
      filter: { key: "all", value: null },
      dsr: null,
      dsrOpen: false,
      lastFocus: null,
      scrollLock: "",
      coreUp: false,
      flashed: {}
    };
  }

  function on(node, type, fn, opts) {
    if (!node) return;
    node.addEventListener(type, fn, opts);
    live.listeners.push([node, type, fn, opts]);
  }

  function frame(fn) {
    var id = global.requestAnimationFrame(function (t) {
      var at = live ? live.frames.indexOf(id) : -1;
      if (at !== -1) live.frames.splice(at, 1);
      fn(t);
    });
    live.frames.push(id);
    return id;
  }

  function later(fn, ms) {
    var id = global.setTimeout(function () {
      var at = live ? live.timers.indexOf(id) : -1;
      if (at !== -1) live.timers.splice(at, 1);
      fn();
    }, ms);
    live.timers.push(id);
    return id;
  }

  function q(sel) { return live.root ? live.root.querySelector(sel) : null; }
  function qa(sel) { return live.root ? live.root.querySelectorAll(sel) : []; }

  /* -------------------------------------------------------------- pieces */

  function head(tag, kicker, outline, filled, note) {
    return '<header class="sg-head">' +
      '<p class="sg-tagline sg-in"><span class="sg-tag">' + esc(tag) + '</span>' +
        '<b>' + kicker + '</b></p>' +
      '<h2 class="sg-h2 sg-in"><u>' + esc(outline) + '</u><em>' + esc(filled) + '</em></h2>' +
      (note ? '<p class="sg-note sg-in">' + note + '</p>' : '') +
      '</header>';
  }

  /* The emblem is drawn either way: it is the panel's HUD reticle. When the
     energy core mounts on top of it, it dims back to a framing element. */
  function emblem() {
    return '<div class="sg-core-emblem" id="sg-emblem" aria-hidden="true">' +
      '<svg viewBox="0 0 200 200" fill="none" aria-hidden="true">' +
        '<circle cx="100" cy="100" r="78" stroke="#FF1744" stroke-width="1" opacity=".55"/>' +
        '<circle cx="100" cy="100" r="58" stroke="#00E5FF" stroke-width="1" opacity=".45" stroke-dasharray="3 7"/>' +
        '<circle cx="100" cy="100" r="34" stroke="#F5F5F7" stroke-width="1" opacity=".4"/>' +
        '<circle cx="100" cy="100" r="9" fill="#FF1744" opacity=".85"/>' +
        '<path d="M100 4v26M100 170v26M4 100h26M170 100h26" stroke="#F5F5F7" stroke-width="1" opacity=".5"/>' +
        '<path d="M31 31l18 18M169 31l-18 18M31 169l18-18M169 169l-18-18" stroke="#FF1744" stroke-width="1" opacity=".4"/>' +
        '<path d="M100 22 L178 100 L100 178 L22 100 Z" stroke="#8B5CF6" stroke-width="1" opacity=".28"/>' +
      '</svg></div>';
  }

  /* ------------------------------------------------------------- opening */

  function opening(s) {
    var t = s.totals || {};
    var arcs = (s.arcs || []).length;
    var vit = [
      ["repositories", t.repositories, true],
      ["commits logged", t.commits, false],
      ["arcs", arcs, false],
      ["languages", t.languages, false]
    ];
    var cells = "";
    for (var i = 0; i < vit.length; i += 1) {
      if (typeof vit[i][1] !== "number" || !isFinite(vit[i][1])) continue;
      cells += '<div class="sg-vital' + (vit[i][2] ? " key" : "") + '">' +
        '<b data-n="' + vit[i][1] + '">' + nfmt(vit[i][1]) + "</b>" +
        "<span>" + esc(vit[i][0]) + "</span></div>";
    }

    var strip = "";
    strip += '<div><i>subject</i><b>Arnav Bhargava</b></div>';
    if (t.activeSince) strip += '<div><i>first signal</i><b>' + esc(stamp(t.activeSince)) + "</b></div>";
    if (t.latest) strip += '<div><i>last signal</i><b>' + esc(stamp(t.latest)) + "</b></div>";
    strip += '<div class="live"><i>channel</i><b>open</b></div>';

    return '<section class="sg-sec sg-op" id="opening">' +
      '<div class="sg-frame">' +
        '<div class="sg-speed" aria-hidden="true"></div>' +
        '<div class="sg-op-num sg-par" style="--par:70px" aria-hidden="true">00</div>' +
        '<div class="sg-op-grid">' +

          '<div class="sg-panel sg-op-a">' +
            '<p class="sg-eyebrow"><i></i>opening sequence <s>&nbsp;/&nbsp; 00</s></p>' +
            '<h1 class="sg-title" id="sg-title">' +
              '<span><b>The same</b></span>' +
              '<span><b>record,</b></span>' +
              '<span><b>read as</b></span>' +
              '<span class="sg-hit"><b>signal</b></span>' +
            "</h1>" +
            '<p class="sg-lede">Every repository that was started, in the order it ' +
              'was started, and the commit history behind the ones still on disk. ' +
              'The other world reads it as a record. This one reads it as a run: ' +
              esc(String(arcs)) + ' arcs, a long flat stretch, and a surge at the end ' +
              'that does not look like anything before it.</p>' +
          "</div>" +

          '<div class="sg-panel sg-op-b">' +
            emblem() +
            '<canvas id="sg-core" aria-hidden="true"></canvas>' +
            '<div class="sg-core-hud" aria-hidden="true">' +
              "<span>core</span><span>live read</span>" +
              "<span>src / commit log</span><span>rec</span>" +
            "</div>" +
          "</div>" +

          '<div class="sg-vitals" id="sg-vitals">' + cells + "</div>" +
          '<div class="sg-dosstrip">' + strip + "</div>" +
        "</div></div></section>";
  }

  /* --------------------------------------------------------- energy field */

  function energy(s) {
    var ramp = s.ramp || [];
    var span = ramp.length
      ? esc(String(ramp[0].period).replace("-", ".")) + " → " +
        esc(String(ramp[ramp.length - 1].period).replace("-", "."))
      : "no window";

    var body;
    if (!ramp.length) {
      body = '<p class="sg-empty">No commit window in the record.</p>';
    } else {
      var maxC = 1, maxS = 1, i, r, peak = null;
      for (i = 0; i < ramp.length; i += 1) {
        if (ramp[i].commits > maxC) maxC = ramp[i].commits;
        if (ramp[i].started > maxS) maxS = ramp[i].started;
        if (!peak || ramp[i].commits > peak.commits) peak = ramp[i];
      }
      var cols = "";
      for (i = 0; i < ramp.length; i += 1) {
        r = ramp[i];
        var h = r.commits > 0 ? Math.max(2, (r.commits / maxC) * 100) : 0;
        var d = r.started > 0 ? Math.max(6, (r.started / maxS) * 100) : 0;
        var glow = Math.round((r.commits / maxC) * 22);
        cols += '<button class="sg-col' + (r.isPeak ? " peak" : "") +
          (r.commits > 0 ? "" : " zero") + '" type="button"' +
          ' style="--h:' + h.toFixed(2) + ";--d:" + d.toFixed(2) + ";--g:" + glow + '"' +
          ' data-period="' + esc(r.period) + '" data-commits="' + r.commits +
          '" data-started="' + r.started + '"' +
          ' aria-label="' + esc(r.period) + ", " + r.commits + " commits, " +
          r.started + ' repositories started">' +
          "<i>" + (r.isPeak ? "<em>" + nfmt(r.commits) + "</em>" : "") + "</i>" +
          "<u></u><b></b></button>";
      }
      body =
        '<div class="sg-field sg-in">' +
          '<div class="sg-read" id="sg-read" aria-live="polite"></div>' +
          '<div class="sg-plot" id="sg-plot">' + cols + "</div>" +
          '<div class="sg-axis"><span>' + esc(String(ramp[0].period).replace("-", ".")) +
            "</span><span>peak " + nfmt(peak ? peak.commits : 0) + " / " +
            esc(String(peak ? peak.period : "").replace("-", ".")) + "</span><span>" +
            esc(String(ramp[ramp.length - 1].period).replace("-", ".")) + "</span></div>" +
        "</div>" +
        '<p class="sg-legend sg-in">' +
          '<span><i style="background:#00E5FF"></i>commits</span>' +
          '<span><i style="background:#FF2D75"></i>peak month</span>' +
          '<span><i style="background:#8B5CF6"></i>repositories started</span>' +
        "</p>";
    }

    return '<section class="sg-sec sg-energy" id="ramp">' +
      '<div class="sg-wrap">' +
      head("ep.01", "output field &nbsp;//&nbsp; " + span, "output", "field",
        "Commits per month, read as an energy field rather than a chart. The " +
        "window opens at the first commit the local history carries and not " +
        "before, so a flat month inside it is a measured zero and everything " +
        "earlier is simply unmeasured. Violet strokes below the axis are " +
        "repositories started that month.") +
      body + "</div></section>";
  }

  /* ------------------------------------------------------------ arc index */

  function arcIndex(s) {
    var arcs = s.arcs || [];
    var rows = "", i, j;
    for (i = 0; i < arcs.length; i += 1) {
      var a = arcs[i];

      /* HONESTY: per-year commits exist only inside the local git window. */
      var hasCommits = typeof a.commits === "number";
      var stats =
        '<div><b>' + nfmt(a.repos) + "</b><span>systems started</span></div>" +
        '<div' + (hasCommits ? "" : ' class="none"') + "><b>" +
          (hasCommits ? nfmt(a.commits) : "&mdash;") + "</b><span>commits" +
          (hasCommits ? "" : " unrecorded") + "</span></div>";
      if (i > 0 && typeof a.delta === "number" && a.delta !== 0) {
        stats += '<div class="' + (a.delta > 0 ? "up" : "down") + '"><b>' +
          (a.delta > 0 ? "+" : "") + nfmt(a.delta) + "</b><span>vs prior arc</span></div>";
      }

      var chips = "";
      var langs = (a.languages || []).slice(0, 5);
      for (j = 0; j < langs.length; j += 1) chips += "<li>" + esc(langs[j]) + "</li>";

      var hl = "";
      var hs = a.highlights || [];
      for (j = 0; j < hs.length; j += 1) {
        hl += "<li><b>" + esc(hs[j].name) + "</b><i>" +
          (hs[j].description ? esc(clip(hs[j].description, 120)) : "no description in the record") +
          "</i></li>";
      }

      rows +=
        '<li class="sg-arc sg-w">' +
          '<div class="sg-arc-mark"><span>' + pad(i + 1, 2) + "</span></div>" +
          '<article class="sg-arc-panel sg-wipe">' +
            '<i class="sg-sweep" aria-hidden="true"></i>' +
            '<div class="sg-arc-ghost sg-par" style="--par:34px" aria-hidden="true">' +
              esc(a.year) + "</div>" +
            '<div class="sg-arc-head">' +
              '<span class="sg-arc-yr">' + esc(a.year) + "</span>" +
              '<span class="sg-hud">arc ' + pad(i + 1, 2) + " of " + pad(arcs.length, 2) + "</span>" +
            "</div>" +
            '<h3 class="sg-arc-title">' + (a.title ? esc(a.title) : esc(a.year)) + "</h3>" +
            '<div class="sg-arc-stats">' + stats + "</div>" +
            (chips ? '<ul class="sg-chips">' + chips + "</ul>" : "") +
            (hl ? '<ul class="sg-hl">' + hl + "</ul>" : "") +
          "</article>" +
        "</li>";
    }

    if (!rows) rows = '<li class="sg-empty">No arcs in the record.</li>';

    return '<section class="sg-sec sg-arcs" id="years">' +
      '<div class="sg-wrap">' +
      head("ep.02", "arc index &nbsp;//&nbsp; " + arcs.length + " arcs", "arc", "index",
        "One arc per calendar year, titled from that year's own numbers rather " +
        "than from memory. Commit counts appear only for the years the local " +
        "history covers; every other arc carries an em dash, because the record " +
        "has nothing there and a zero would read as a fact.") +
      '<ol class="sg-spine">' + rows + "</ol></div></section>";
  }

  /* ------------------------------------------------------------- arsenal */

  function arsenal(s) {
    var list = s.arsenal || [];
    var rows = "", i, j;
    for (i = 0; i < list.length; i += 1) {
      var a = list[i];
      var pct = typeof a.share === "number" ? Math.round(a.share * 1000) / 10 : null;
      var meta = [];
      meta.push("used in " + nfmt(a.repos) + " system" + (a.repos === 1 ? "" : "s"));
      if (a.firstSeen && a.lastSeen) {
        meta.push(a.firstSeen === a.lastSeen ? a.firstSeen : a.firstSeen + " → " + a.lastSeen);
      }
      var projs = a.projects || [];
      var pid = "sg-ab-p-" + i;
      var chips = "";
      for (j = 0; j < projs.length; j += 1) chips += "<li>" + esc(projs[j]) + "</li>";

      rows +=
        '<li class="sg-ab sg-in">' +
          '<span class="sg-ab-no">' + pad(i + 1, 2) + "</span>" +
          '<div class="sg-ab-main">' +
            '<div class="sg-ab-top">' +
              '<h3 class="sg-ab-name">' + esc(a.name) + "</h3>" +
              (pct === null ? "" : '<span class="sg-ab-pct">' + pct + "% of typed repos</span>") +
            "</div>" +
            '<div class="sg-ab-bar" aria-hidden="true"><i style="--p:' +
              (pct === null ? 0 : pct) + '%"></i></div>' +
            '<p class="sg-ab-meta">' + esc(meta.join("  ·  ")) + "</p>" +
          "</div>" +
          (projs.length
            ? '<button class="sg-ab-btn" type="button" aria-expanded="false" aria-controls="' +
                pid + '" data-proj="' + pid + '">systems</button>'
            : "") +
          (projs.length
            ? '<div class="sg-ab-proj" id="' + pid + '" hidden><ul>' + chips + "</ul></div>"
            : "") +
        "</li>";
    }

    if (!rows) rows = '<li class="sg-empty">No languages in the record.</li>';

    return '<section class="sg-sec sg-arsenal" id="arsenal"><div class="sg-inv">' +
      '<div class="sg-wrap">' +
      head("ep.03", "arsenal &nbsp;//&nbsp; " + list.length + " languages", "the", "arsenal",
        "Share of the repositories that carry a language at all. Untyped " +
        "repositories are left out of the share rather than counted as an " +
        "unknown, so the percentages describe what was measured.") +
      '<ol class="sg-abil" id="sg-abil">' + rows + "</ol></div></div></section>";
  }

  /* -------------------------------------------------------- mission files */

  function filesShell(s) {
    var f = s.facets || {};
    var n = (s.archive || []).length;
    var chips = '<span class="sg-fgroup">index</span>' +
      '<button type="button" data-key="all" aria-pressed="true">all ' + n + "</button>";
    var i;
    var years = (f.years || []).slice(0, 8);
    if (years.length) {
      chips += '<span class="sg-fgroup">arc</span>';
      for (i = 0; i < years.length; i += 1) {
        chips += '<button type="button" data-key="year" data-value="' + esc(years[i]) +
          '" aria-pressed="false">' + esc(years[i]) + "</button>";
      }
    }
    var langs = (f.languages || []).slice(0, 7);
    if (langs.length) {
      chips += '<span class="sg-fgroup">type</span>';
      for (i = 0; i < langs.length; i += 1) {
        chips += '<button type="button" data-key="language" data-value="' + esc(langs[i]) +
          '" aria-pressed="false">' + esc(langs[i]) + "</button>";
      }
    }
    var cats = (f.categories || []).slice(0, 8);
    if (cats.length) {
      chips += '<span class="sg-fgroup">class</span>';
      for (i = 0; i < cats.length; i += 1) {
        chips += '<button type="button" data-key="category" data-value="' + esc(cats[i]) +
          '" aria-pressed="false">' + esc(cats[i]) + "</button>";
      }
    }

    return '<section class="sg-sec sg-files" id="archive">' +
      '<div class="sg-wrap">' +
      head("ep.04", "mission files &nbsp;//&nbsp; " + n + " entries", "mission", "files",
        "Every repository that is not a fork, newest first. Open a file for the " +
        "full record on it. Where a repository carries no description, the file " +
        "says so rather than filling the space.") +
      '<div class="sg-filters sg-in" id="sg-filters" role="group" aria-label="Filter the mission files">' +
        chips + "</div>" +
      '<p class="sg-count" id="sg-count" aria-live="polite"></p>' +
      '<ol class="sg-list" id="sg-items"></ol>' +
      '<button class="sg-more" id="sg-more" type="button" hidden></button>' +
      "</div></section>";
  }

  function credits(s, raw) {
    var t = s.totals || {};
    var window_ = (s.ramp && s.ramp.length)
      ? String(s.ramp[0].period).replace("-", ".") + " → " +
        String(s.ramp[s.ramp.length - 1].period).replace("-", ".")
      : "—";
    var built = (raw && raw.meta && (raw.meta.generated || raw.meta.built || raw.meta.date)) || "";

    return '<footer class="sg-sec sg-end">' +
      '<div class="sg-wrap">' +
        '<div class="sg-end-cols sg-in">' +
          "<div><b>source</b><a href=\"https://github.com/" + OWNER +
            "\" rel=\"noopener\">github.com/" + OWNER + "</a></div>" +
          "<div><b>method</b><span>read off the commit log</span><span>no figure without a record</span></div>" +
          "<div><b>commit window</b><span>" + esc(window_) + "</span><span>" +
            nfmt(t.commits || 0) + " commits logged</span></div>" +
          "<div><b>index</b><a href=\"projects/\">project index</a>" +
            "<a href=\"galleries/\">galleries</a></div>" +
          "<div><b>published by</b><span>Stealth Keqing</span>" +
            (built ? "<span>compiled " + esc(stamp(built)) + "</span>" : "") + "</div>" +
        "</div>" +
        '<p class="sg-end-big sg-in">to be<i>continued.</i></p>' +
        '<p class="sg-end-fine">Repository counts cover every non-fork repository in the ' +
          'record. Commit counts cover only the repositories still checked out ' +
          'locally, from ' + esc(window_.split(" ")[0]) + ' onward, which is why most arcs ' +
          'carry an em dash rather than a number. Nothing on this page is estimated, ' +
          'rounded up, or filled in.</p>' +
      "</div></footer>";
  }

  /* --------------------------------------------------------------- ramp */

  function wireRamp(s) {
    var plot = q("#sg-plot");
    var read = q("#sg-read");
    if (!plot || !read) return;

    function show(node) {
      if (!node) return;
      read.innerHTML =
        "<b>" + esc(node.getAttribute("data-commits")) + "</b>" +
        "<s>" + esc(String(node.getAttribute("data-period")).replace("-", ".")) + "</s>" +
        "<span>commits</span>" +
        "<span>" + esc(node.getAttribute("data-started")) + " started</span>";
    }
    function pick(ev) {
      var el = ev.target;
      while (el && el !== plot && el.className !== undefined) {
        if (el.getAttribute && el.getAttribute("data-period")) { show(el); return; }
        el = el.parentNode;
      }
    }
    on(plot, "mouseover", pick);
    on(plot, "focusin", pick);
    on(plot, "click", pick);

    /* Seed the readout with the loudest month rather than an instruction. */
    var best = null, ramp = s.ramp || [], i;
    for (i = 0; i < ramp.length; i += 1) if (!best || ramp[i].commits > best.commits) best = ramp[i];
    if (best) {
      read.innerHTML = "<b>" + nfmt(best.commits) + "</b><s>" +
        esc(String(best.period).replace("-", ".")) + "</s><span>commits</span>" +
        "<span>" + nfmt(best.started) + " started</span>";
    }
  }

  /* ------------------------------------------------------------ arsenal */

  function wireArsenal() {
    var list = q("#sg-abil");
    if (!list) return;
    on(list, "click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest(".sg-ab-btn") : null;
      if (!b) return;
      var panel = live.root.querySelector("#" + b.getAttribute("data-proj"));
      if (!panel) return;
      var open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", String(!open));
      panel.hidden = open;
      b.textContent = open ? "systems" : "hide";
    });
  }

  /* ------------------------------------------------------- mission files */

  function passes(it) {
    var f = live.filter;
    if (f.key === "all") return true;
    if (f.key === "year") return String(it.year) === String(f.value);
    if (f.key === "language") return it.language === f.value;
    if (f.key === "category") return it.category === f.value;
    return true;
  }

  function fileHtml(it) {
    var hi = typeof it.weight === "number" && it.weight >= 0.66;
    var w = Math.round((typeof it.weight === "number" ? it.weight : 0) * 100);
    var cls = [];
    if (it.category) cls.push(upper(it.category));
    if (it.year) cls.push(it.year);
    return '<li class="sg-file' + (hi ? " hi" : "") + '">' +
      '<button class="sg-file-btn" type="button" data-idx="' + esc(it.index) +
        '" aria-haspopup="dialog">' +
        '<span class="sg-file-no">' + pad(it.index, 3) + "</span>" +
        '<span class="sg-file-main">' +
          '<span class="sg-file-name">' + esc(it.name) + "</span>" +
          (it.description
            ? '<span class="sg-file-desc">' + esc(clip(it.description, 150)) + "</span>"
            : '<span class="sg-file-desc none">No description in the record.</span>') +
        "</span>" +
        '<span class="sg-file-meta">' +
          '<span class="m-lang">' + (it.language ? esc(it.language) : "&mdash;") + "</span>" +
          '<span class="m-class"><em>' + esc(cls.join(" · ")) + "</em></span>" +
          '<span class="sg-file-st" data-st="' + esc(it.status) + '"><u></u>' +
            esc(it.status || "—") + "</span>" +
          '<span class="sg-file-w" aria-hidden="true"><u style="width:' + w + '%"></u></span>' +
        "</span>" +
      "</button></li>";
  }

  function paintFiles(reset) {
    var box = q("#sg-items");
    if (!box) return;
    var list = [], i;
    for (i = 0; i < live.archive.length; i += 1) {
      if (passes(live.archive[i])) list.push(live.archive[i]);
    }
    if (reset) { box.innerHTML = ""; live.shown = 0; }

    var next = list.slice(live.shown, live.shown + PAGE), html = "";
    for (i = 0; i < next.length; i += 1) html += fileHtml(next[i]);
    box.insertAdjacentHTML("beforeend", html);
    live.shown += next.length;

    var count = q("#sg-count");
    if (count) {
      count.textContent = list.length
        ? live.shown + " of " + list.length + " files decrypted"
        : "no files match this filter";
    }
    var more = q("#sg-more");
    if (more) {
      var left = Math.max(0, list.length - live.shown);
      more.hidden = left === 0;
      more.innerHTML = "decrypt next block <b>" + left + " held</b>";
    }
  }

  function wireFiles() {
    var filters = q("#sg-filters");
    if (filters) {
      on(filters, "click", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest("button") : null;
        if (!b) return;
        live.filter = { key: b.getAttribute("data-key"), value: b.getAttribute("data-value") };
        var all = filters.querySelectorAll("button"), i;
        for (i = 0; i < all.length; i += 1) {
          all[i].setAttribute("aria-pressed", String(all[i] === b));
        }
        paintFiles(true);
      });
    }
    var more = q("#sg-more");
    if (more) on(more, "click", function () { paintFiles(false); });

    var items = q("#sg-items");
    if (items) {
      on(items, "click", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest(".sg-file-btn") : null;
        if (!b) return;
        openDossier(Number(b.getAttribute("data-idx")), b);
      });
    }
  }

  /* -------------------------------------------------------------- dossier */

  function findItem(idx) {
    for (var i = 0; i < live.archive.length; i += 1) {
      if (Number(live.archive[i].index) === idx) return live.archive[i];
    }
    return null;
  }

  function dossierHtml(it, priv) {
    var rows = "";
    function row(label, value) {
      rows += "<div><dt>" + esc(label) + "</dt><dd>" + value + "</dd></div>";
    }
    row("language", it.language ? esc(it.language) : "&mdash;");
    row("arc", it.year ? esc(it.year) : "&mdash;");
    row("created", esc(stamp(it.created)));
    row("last push", esc(stamp(it.pushed)));
    row("status", esc(upper(it.status || "—")));
    if (priv !== null) row("access", priv ? "PRIVATE" : "PUBLIC");
    if (typeof it.stars === "number" && it.stars > 0) row("stars", nfmt(it.stars));
    if (typeof it.weight === "number") {
      row("prominence",
        Math.round(it.weight * 100) + '<span class="sg-dsr-meter"><i style="width:' +
        Math.round(it.weight * 100) + '%"></i></span>');
    }

    return '<div class="sg-dsr-bg" data-close="1"></div>' +
      '<div class="sg-dsr-panel" role="document" tabindex="-1">' +
        '<div class="sg-dsr-head">' +
          '<span class="sg-dsr-no">file ' + pad(it.index, 3) + "</span>" +
          '<span class="sg-dsr-kick">mission file &nbsp;//&nbsp; opened</span>' +
          '<button class="sg-dsr-x" type="button" data-close="1">close &nbsp;esc</button>' +
        "</div>" +
        '<h3 class="sg-dsr-name" id="sg-dsr-name">' + esc(it.name) + "</h3>" +
        (it.category ? '<div class="sg-dsr-stamp">' + esc(it.category) + "</div>" : "") +
        (it.description
          ? '<p class="sg-dsr-desc">' + esc(it.description) + "</p>"
          : '<p class="sg-dsr-desc none">This repository carries no description in the ' +
            "record. Nothing has been written in to fill the space.</p>") +
        '<dl class="sg-dsr-grid">' + rows + "</dl>" +
        '<a class="sg-dsr-link" href="https://github.com/' + OWNER + "/" + esc(it.name) +
          '" target="_blank" rel="noopener">open repository</a>' +
        (priv
          ? '<p class="sg-dsr-foot">private in the record &mdash; the link resolves for the owner only</p>'
          : "") +
      "</div>";
  }

  function trapTab(ev) {
    if (!live || !live.dsrOpen || ev.key !== "Tab") return;
    var f = live.dsr.querySelectorAll("a[href],button:not([disabled])");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function openDossier(idx, trigger) {
    var it = findItem(idx);
    if (!it || !live.dsr) return;
    var priv = null;
    if (live.privates && Object.prototype.hasOwnProperty.call(live.privates, it.name)) {
      priv = live.privates[it.name];
    }
    live.lastFocus = trigger || doc.activeElement;
    live.dsr.innerHTML = dossierHtml(it, priv);
    live.dsr.hidden = false;
    live.dsr.className = "sg-dsr" + (still ? "" : " in");
    live.dsrOpen = true;
    live.scrollLock = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
    var panel = live.dsr.querySelector(".sg-dsr-panel");
    if (panel) panel.focus();
  }

  function closeDossier() {
    if (!live || !live.dsrOpen) return;
    live.dsrOpen = false;
    live.dsr.hidden = true;
    live.dsr.className = "sg-dsr";
    live.dsr.innerHTML = "";
    doc.body.style.overflow = live.scrollLock || "";
    if (live.lastFocus && live.lastFocus.focus) {
      try { live.lastFocus.focus(); } catch (e) {}
    }
    live.lastFocus = null;
  }

  /* --------------------------------------------------------------- motion */

  function watch(node) {
    if (!node) return;
    if (live.io && !still) live.io.observe(node);
    else node.classList.add("on");
  }

  function parallax() {
    if (!live || !live.par.length) return;
    var vh = global.innerHeight || 800, i, r, node;
    for (i = 0; i < live.par.length; i += 1) {
      node = live.par[i];
      r = node.getBoundingClientRect();
      var sy = ((r.top + r.height / 2) - vh / 2) / vh;
      if (sy > 1.4) sy = 1.4;
      if (sy < -1.4) sy = -1.4;
      node.style.setProperty("--sy", sy.toFixed(3));
    }
  }

  function scramble(node, target) {
    var text = nfmt(target), len = text.length;
    if (still) { node.textContent = text; return; }
    var start = 0;
    function step(now) {
      if (!start) start = now;
      var t = Math.min((now - start) / 640, 1);
      var reveal = Math.floor(t * len), out = "", i, ch;
      for (i = 0; i < len; i += 1) {
        ch = text.charAt(i);
        out += (i < reveal || ch < "0" || ch > "9")
          ? ch
          : String(Math.floor(Math.random() * 10));
      }
      node.textContent = out;
      if (t < 1) frame(step); else node.textContent = text;
    }
    frame(step);
  }

  function flash() {
    if (still) return;
    var f = q("#sg-flash");
    if (!f) return;
    f.className = "sg-flash";
    /* reflow so the animation can be retriggered */
    void f.offsetWidth;
    f.className = "sg-flash fire";
  }

  /* ------------------------------------------------------------ lifecycle */

  function render(stage, story, raw) {
    live = fresh();
    live.root = stage;
    story = story || {};
    raw = raw || {};

    /* If the shell never linked the stylesheet, this world would have no
       art direction at all, so it links it once rather than render raw. */
    if (!doc.querySelector('link[href*="signal.css"],style[data-signal]')) {
      var link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = "assets/signal.css";
      doc.head.appendChild(link);
    }

    /* name -> private, straight off the source record. */
    live.privates = {};
    var projects = (raw && raw.projects) || [];
    for (var pi = 0; pi < projects.length; pi += 1) {
      if (projects[pi] && projects[pi].name) {
        live.privates[projects[pi].name] = !!projects[pi].private;
      }
    }

    stage.className = "w-signal";
    stage.innerHTML =
      '<div class="sg-fx" aria-hidden="true">' +
        '<i class="sg-fx-scan"></i><i class="sg-fx-grain"></i><i class="sg-fx-vig"></i>' +
      "</div>" +
      '<div class="sg-flash" id="sg-flash" aria-hidden="true"></div>' +
      opening(story) +
      energy(story) +
      arcIndex(story) +
      arsenal(story) +
      filesShell(story) +
      credits(story, raw) +
      '<div class="sg-dsr" id="sg-dsr" role="dialog" aria-modal="true" ' +
        'aria-labelledby="sg-dsr-name" hidden></div>';

    live.dsr = q("#sg-dsr");
    live.archive = story.archive || [];

    if ("IntersectionObserver" in global && !still) {
      live.io = new global.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          if (!entries[i].isIntersecting) continue;
          entries[i].target.classList.add("on");
          live.io.unobserve(entries[i].target);
        }
      }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });

      /* One impact flash per section that earns it, and never again. */
      live.secIo = new global.IntersectionObserver(function (entries) {
        for (var j = 0; j < entries.length; j += 1) {
          if (!entries[j].isIntersecting) continue;
          var id = entries[j].target.id;
          if (live.flashed[id]) continue;
          live.flashed[id] = true;
          flash();
          live.secIo.unobserve(entries[j].target);
        }
      }, { threshold: 0.45 });
      var ramp = q("#ramp"), ars = q("#arsenal");
      if (ramp) live.secIo.observe(ramp);
      if (ars) live.secIo.observe(ars);
    }

    wireRamp(story);
    wireArsenal();
    wireFiles();
    paintFiles(true);

    var reveal = qa(".sg-in,.sg-w"), i;
    for (i = 0; i < reveal.length; i += 1) watch(reveal[i]);

    /* parallax, one listener, one rAF */
    if (!still) {
      var pars = qa(".sg-par");
      for (i = 0; i < pars.length; i += 1) live.par.push(pars[i]);
      live.onScroll = function () {
        if (live.ticking) return;
        live.ticking = true;
        frame(function () { live.ticking = false; parallax(); });
      };
      on(global, "scroll", live.onScroll, { passive: true });
      on(global, "resize", live.onScroll);
      parallax();
    }

    /* escape closes the file, focus goes back to the row that opened it */
    on(doc, "keydown", function (ev) {
      if (!live) return;
      if (ev.key === "Escape" && live.dsrOpen) { ev.preventDefault(); closeDossier(); return; }
      trapTab(ev);
    });
    if (live.dsr) {
      on(live.dsr, "click", function (ev) {
        if (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-close")) {
          closeDossier();
        }
      });
    }

    /* the energy core; the panel is finished art without it */
    var canvas = q("#sg-core");
    if (canvas && global.Core && typeof global.Core.mount === "function") {
      try {
        global.Core.mount(canvas, raw, { still: still, reducedMotion: still, world: "anime" });
        live.coreUp = true;
        var em = q("#sg-emblem");
        if (em) em.className = "sg-core-emblem gone";
      } catch (e) { live.coreUp = false; }
    }

    /* the opening is already on screen: it does not wait for a scroll */
    frame(function () {
      var title = q("#sg-title");
      if (title) title.classList.add("on");
      var vitals = qa("#sg-vitals b[data-n]");
      for (var k = 0; k < vitals.length; k += 1) {
        scramble(vitals[k], Number(vitals[k].getAttribute("data-n")));
      }
      if (title && !still) later(function () { title.classList.add("hit"); }, 1100);
    });
  }

  function teardown() {
    if (!live) return;

    if (global.Core && typeof global.Core.destroy === "function") {
      try { global.Core.destroy(); } catch (e) {}
    }
    if (live.dsrOpen) {
      doc.body.style.overflow = live.scrollLock || "";
      live.dsrOpen = false;
    }
    if (live.io) { try { live.io.disconnect(); } catch (e) {} }
    if (live.secIo) { try { live.secIo.disconnect(); } catch (e) {} }

    var i;
    for (i = 0; i < live.frames.length; i += 1) global.cancelAnimationFrame(live.frames[i]);
    for (i = 0; i < live.timers.length; i += 1) global.clearTimeout(live.timers[i]);
    for (i = 0; i < live.listeners.length; i += 1) {
      var l = live.listeners[i];
      try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) {}
    }
    live = null;
  }

  global.Signal = { render: render, teardown: teardown };
})(window);
