/*
 * The page.
 *
 * It owns composition and interaction only. The narrative shapes come from
 * Story, the signature object from Monument; both are optional at runtime, so
 * a failure in either degrades to a page that still reads rather than a blank
 * screen. Nothing here invents a number - where the record cannot support a
 * figure, the figure is simply not shown.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(id) { return document.getElementById(id); }
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

  /* ---------------------------------------------------------- worlds */

  var WORLD_BG = { professional: "#F3F1EC", anime: "#090A0F" };
  var crossing = el("crossing");
  var crossWord = el("crossing-word");
  var switching = false;

  function paintChrome() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", WORLD_BG[root.dataset.world] || WORLD_BG.professional);
  }
  function markButtons() {
    var bs = document.querySelectorAll(".worlds button");
    for (var i = 0; i < bs.length; i += 1) {
      bs[i].setAttribute("aria-pressed", String(bs[i].getAttribute("data-world") === root.dataset.world));
    }
  }

  /*
   * Crossing between worlds.
   *
   * Seven bands wipe across, the world changes while the screen is covered,
   * and the bands lift from the other side - about 900ms end to end, long
   * enough to read as an event and short enough to stay out of the way. Under
   * reduced motion it is an immediate swap, because the point of that setting
   * is not to watch things move.
   */
  function goTo(world) {
    if (!world || world === root.dataset.world || switching) return;

    function apply() {
      root.dataset.world = world;
      paintChrome();
      markButtons();
      if (window.Monument && window.Monument.setTheme) {
        try { window.Monument.setTheme(world); } catch (e) {}
      }
      try { localStorage.setItem("world", world); } catch (e) {}
    }

    if (still) { apply(); return; }

    switching = true;
    crossWord.textContent = world === "anime" ? "Signal" : "Archive";
    crossing.className = "crossing in";
    crossWord.classList.add("on");

    setTimeout(apply, 430);
    setTimeout(function () {
      crossWord.classList.remove("on");
      crossing.className = "crossing out";
    }, 560);
    setTimeout(function () {
      crossing.className = "crossing";
      switching = false;
    }, 1080);
  }

  // Professional is the default identity; only an explicit earlier choice moves it.
  try {
    if (localStorage.getItem("world") === "anime") root.dataset.world = "anime";
  } catch (e) {}
  paintChrome();
  markButtons();

  var wbs = document.querySelectorAll(".worlds button");
  for (var w = 0; w < wbs.length; w += 1) {
    wbs[w].addEventListener("click", function () { goTo(this.getAttribute("data-world")); });
  }

  /* ---------------------------------------------------------- reveal */

  var io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.classList.add("go");
        io.unobserve(entries[i].target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  }
  function watch(node) {
    if (!node) return;
    if (io && !still) io.observe(node);
    else node.classList.add("go");
  }

  function runUp(node, target) {
    if (still || !target) { node.textContent = Number(target || 0).toLocaleString(); return; }
    var started = 0;
    function step(now) {
      if (!started) started = now;
      var t = Math.min((now - started) / 1200, 1);
      node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------- fallback */

  /*
   * A stand-in for Story, used only if that file is unavailable. Deliberately
   * plain: same field names, no invented values, so the page stays honest even
   * when it is running on the reserve tank.
   */
  function fallbackStory(raw) {
    var projects = (raw.projects || []).filter(function (p) {
      return String(p.fork) !== "True" && p.fork !== true;
    });
    var months = raw.commitsByMonth || [];
    var commits = 0;
    months.forEach(function (m) { commits += (m.commits || 0); });

    var byYear = {}, startedBy = {};
    projects.forEach(function (p) {
      if (p.year) byYear[p.year] = (byYear[p.year] || 0) + 1;
      var mm = String(p.created || "").slice(0, 7);
      if (mm) startedBy[mm] = (startedBy[mm] || 0) + 1;
    });

    var sorted = months.map(function (m) { return m.commits || 0; }).sort(function (a, b) { return a - b; });
    var median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    var langs = (raw.languages || []).slice().sort(function (a, b) {
      return (b.count || 0) - (a.count || 0);
    });

    var years = Object.keys(byYear).sort().reverse();

    return {
      totals: {
        repositories: projects.length,
        commits: commits,
        years: years.length,
        languages: langs.length
      },
      ramp: months.map(function (m) {
        return {
          period: m.month,
          commits: m.commits || 0,
          started: startedBy[m.month] || 0,
          isPeak: median > 0 && (m.commits || 0) > median * 2
        };
      }),
      arcs: years.map(function (y) {
        var mine = projects.filter(function (p) { return String(p.year) === String(y); });
        var ls = [];
        mine.forEach(function (p) {
          if (p.language && ls.indexOf(p.language) === -1) ls.push(p.language);
        });
        return { year: y, title: "", repos: mine.length, languages: ls.slice(0, 4), highlights: [], delta: null };
      }),
      arsenal: langs.slice(0, 10).map(function (l) {
        return { name: l.name, repos: l.count || 0, projects: [] };
      }),
      archive: projects.slice().sort(function (a, b) {
        return String(b.created || "").localeCompare(String(a.created || ""));
      }).map(function (p, i) {
        return {
          index: i + 1, name: p.name, description: p.description || "",
          language: p.language || "", year: p.year || "", created: p.created || "",
          pushed: p.pushed || "", stars: p.stars || 0,
          category: "", status: "", weight: 0.4
        };
      }),
      facets: {
        years: years,
        languages: langs.slice(0, 6).map(function (l) { return l.name; }),
        categories: []
      }
    };
  }

  /* ---------------------------------------------------------- render */

  function renderFigures(s) {
    var box = el("figures");
    if (!box) return;
    var t = s.totals || {};
    var rows = [];
    if (t.repositories) rows.push(["repositories", t.repositories, false]);
    if (t.commits) rows.push(["commits in the log", t.commits, true]);
    if (t.years) rows.push(["active years", t.years, false]);
    if (t.languages) rows.push(["languages", t.languages, false]);
    if (!rows.length) return;

    box.innerHTML = rows.map(function (r) {
      return '<div class="figure' + (r[2] ? " mark" : "") + '"><b data-n="' + r[1] + '">0</b><span>' +
        esc(r[0]) + "</span></div>";
    }).join("");
    var bs = box.querySelectorAll("b[data-n]");
    for (var i = 0; i < bs.length; i += 1) runUp(bs[i], Number(bs[i].getAttribute("data-n")));
  }

  function renderRamp(s) {
    var box = el("ramp-viz");
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
        ' data-period="' + esc(r.period) + '" data-commits="' + r.commits + '" data-started="' + r.started + '"' +
        ' aria-label="' + esc(r.period) + ": " + r.commits + " commits, " + r.started + ' started">' +
        (r.started ? '<span class="started" style="height:' + sh + 'px"></span>' : "") +
        "</button>";
    }).join("");

    box.innerHTML =
      '<div class="ramp-read" id="ramp-read"><b>&mdash;</b>hover the ramp</div>' +
      '<div class="ramp-bars">' + bars + "</div>" +
      '<div class="ramp-axis"><span>' + esc(ramp[0].period) + "</span><span>" +
      esc(ramp[ramp.length - 1].period) + "</span></div>";

    var read = el("ramp-read");
    function show(node) {
      if (!node || !read) return;
      read.innerHTML = "<b>" + esc(node.getAttribute("data-commits")) + "</b>" +
        esc(node.getAttribute("data-period")) + " &middot; " +
        esc(node.getAttribute("data-started")) + " started";
    }
    box.addEventListener("mouseover", function (ev) {
      show(ev.target && ev.target.closest ? ev.target.closest(".bar") : null);
    });
    box.addEventListener("focusin", function (ev) {
      show(ev.target && ev.target.closest ? ev.target.closest(".bar") : null);
    });
  }

  function renderArcs(s) {
    var box = el("arcs");
    if (!box || !s.arcs || !s.arcs.length) return;
    box.innerHTML = s.arcs.map(function (a) {
      var delta = "";
      if (typeof a.delta === "number" && a.delta !== 0) {
        delta = '<span class="delta' + (a.delta > 0 ? " up" : "") + '">' +
          (a.delta > 0 ? "+" : "") + a.delta + " vs prior</span>";
      }
      var meta = [];
      if (a.repos) meta.push(a.repos + " started");
      if (a.commits) meta.push(a.commits + " commits");
      if (a.languages && a.languages.length) meta.push(a.languages.slice(0, 4).join(" · "));
      return '<div class="arc">' +
        '<span class="yr">' + esc(a.year) + "</span>" +
        '<span class="name">' + (a.title ? esc(a.title) : "<em>&mdash;</em>") + "</span>" +
        '<span class="meta">' + esc(meta.join("  ·  ")) + "</span>" +
        delta + "</div>";
    }).join("");
  }

  function renderArsenal(s) {
    var box = el("arsenal-list");
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

  var ARCHIVE = [], shown = 0, filter = { key: "all", value: null };
  var PAGE = 18;

  function passes(it) {
    if (filter.key === "all") return true;
    if (filter.key === "year") return String(it.year) === String(filter.value);
    if (filter.key === "language") return it.language === filter.value;
    if (filter.key === "category") return it.category === filter.value;
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
    return '<a class="item' + (big ? " big" : "") + (it.status === "active" ? " active" : "") + '"' +
      ' href="https://github.com/Arnav1771/' + esc(it.name) + '" target="_blank" rel="noopener">' +
      '<span class="idx">' + pad3(it.index) + "</span>" +
      "<span><span class=\"n\">" + esc(it.name) + "</span>" +
      (it.description ? '<span class="d">' + esc(it.description) + "</span>" : "") + "</span>" +
      '<span class="tags">' + tags.map(function (t) { return "<i>" + esc(t) + "</i>"; }).join("") + "</span>" +
      '<span class="act"><span class="dot"></span>' + esc(act.join(" · ")) + "</span>" +
      '<span class="rule"></span></a>';
  }

  function paintItems(reset) {
    var box = el("items");
    if (!box) return;
    var list = [];
    for (var i = 0; i < ARCHIVE.length; i += 1) if (passes(ARCHIVE[i])) list.push(ARCHIVE[i]);
    if (reset) { box.innerHTML = ""; shown = 0; }
    var next = list.slice(shown, shown + PAGE);
    box.insertAdjacentHTML("beforeend", next.map(itemHtml).join(""));
    shown += next.length;
    var more = el("more");
    if (!more) return;
    more.hidden = shown >= list.length;
    more.textContent = "Show more — " + Math.max(0, list.length - shown) + " remaining";
  }

  function renderArchive(s) {
    ARCHIVE = s.archive || [];
    if (!ARCHIVE.length) return;
    var facets = s.facets || {};
    var chips = ['<button type="button" data-key="all" aria-pressed="true">All ' + ARCHIVE.length + "</button>"];
    (facets.years || []).slice(0, 8).forEach(function (y) {
      chips.push('<button type="button" data-key="year" data-value="' + esc(y) + '">' + esc(y) + "</button>");
    });
    (facets.languages || []).slice(0, 6).forEach(function (l) {
      chips.push('<button type="button" data-key="language" data-value="' + esc(l) + '">' + esc(l) + "</button>");
    });
    (facets.categories || []).slice(0, 6).forEach(function (c) {
      chips.push('<button type="button" data-key="category" data-value="' + esc(c) + '">' + esc(c) + "</button>");
    });

    var filters = el("filters");
    filters.innerHTML = chips.join("");
    filters.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("button") : null;
      if (!b) return;
      filter = { key: b.getAttribute("data-key"), value: b.getAttribute("data-value") };
      var all = filters.querySelectorAll("button");
      for (var i = 0; i < all.length; i += 1) {
        all[i].setAttribute("aria-pressed", String(all[i] === b));
      }
      paintItems(true);
    });

    var more = el("more");
    if (more) more.addEventListener("click", function () { paintItems(false); });
    paintItems(true);
  }

  /* ---------------------------------------------------------- start */

  fetch("data/projects.json")
    .then(function (r) { return r.json(); })
    .then(function (raw) {
      var s;
      try {
        s = (window.Story && window.Story.build) ? window.Story.build(raw) : fallbackStory(raw);
      } catch (e) {
        s = fallbackStory(raw);
      }

      var compiled = document.querySelector("[data-compiled]");
      if (compiled) {
        var when = (raw.meta && (raw.meta.generated || raw.meta.built || raw.meta.date)) || "";
        compiled.textContent = when ? String(when).slice(0, 10) : "from the repository record";
      }

      renderFigures(s);
      renderRamp(s);
      renderArcs(s);
      renderArsenal(s);
      renderArchive(s);

      var rises = document.querySelectorAll(".rise");
      for (var i = 0; i < rises.length; i += 1) watch(rises[i]);

      if (window.Monument && window.Monument.mount) {
        try {
          window.Monument.mount(el("monument"), raw, {
            reducedMotion: still,
            world: root.dataset.world
          });
          if (window.Monument.setTheme) window.Monument.setTheme(root.dataset.world);
        } catch (e) { /* the page reads without it */ }
      }
    })
    .catch(function () {
      var f = el("figures");
      if (f) f.innerHTML = '<div class="figure"><b>&mdash;</b><span>record unavailable</span></div>';
    });

  // The opening is already in view on load, so it does not wait for a scroll.
  requestAnimationFrame(function () {
    var st = el("statement");
    if (st) st.classList.add("go");
  });
})();
