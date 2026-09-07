/* showcase — renders data/projects.json. No dependencies, no build step.
 *
 * Loading: over HTTP we fetch data/projects.json. From file:// browsers refuse
 * to fetch local files, so we fall back to data/projects.jsonp.js, which the
 * generator writes alongside the JSON and which assigns window.__SHOWCASE__.
 */
(function () {
  "use strict";

  var MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DATA = null;

  /* ------------------------------------------------------------ helpers */
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function slot(name) { return document.querySelector('[data-slot="' + name + '"]'); }
  function setSlot(name, text) { var n = slot(name); if (n) n.textContent = text; }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function ymd(iso) { return (iso || "").slice(0, 10); }
  function longDate(iso) {
    if (!iso) return "—";
    var p = iso.slice(0, 10).split("-");
    return MONTH[+p[1] - 1] + " " + +p[2] + ", " + p[0];
  }
  function monthLabel(m) { return MONTH[+m.slice(5, 7) - 1] + " " + m.slice(0, 4); }
  function monthsBetween(a, b) {
    var ay = +a.slice(0, 4), am = +a.slice(5, 7);
    var by = +b.slice(0, 4), bm = +b.slice(5, 7);
    return (by - ay) * 12 + (bm - am) + 1;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ------------------------------------------------------------- tagging */
  function tags(p, opts) {
    var frag = document.createDocumentFragment();
    if (p.language) frag.appendChild(el("span", "tag tag--lang", p.language));
    if (p.private) {
      var t = el("span", "tag tag--private", "private");
      t.title = "Not published on GitHub — its name would become public with this page.";
      frag.appendChild(t);
    }
    if (p.fork) frag.appendChild(el("span", "tag tag--fork", "fork"));
    if (p.stars > 0) frag.appendChild(el("span", "tag tag--stars", p.stars + (p.stars === 1 ? " star" : " stars")));
    if (opts && opts.authored && p.descSource === "authored") {
      frag.appendChild(el("span", "tag tag--authored", "written"));
    }
    return frag;
  }

  /* ---------------------------------------------------------- hero spine */
  function renderSpine(series) {
    var host = $("#spine");
    if (!host || !series.length) return;
    var max = series.reduce(function (m, d) { return Math.max(m, d.commits); }, 0) || 1;
    series.forEach(function (d, i) {
      var cls = "spine__bar";
      if (d.commits === 0) cls += " spine__bar--zero";
      else if (d.commits === max) cls += " spine__bar--peak";
      var bar = el("div", cls);
      var h = d.commits === 0 ? 2 : Math.max(3, Math.round((d.commits / max) * 96));
      bar.style.height = h + "px";
      bar.style.animationDelay = (i * 28) + "ms";
      bar.title = monthLabel(d.month) + " — " + d.commits + " commits";
      host.appendChild(bar);
    });
    setSlot("spine-start", monthLabel(series[0].month));
    setSlot("spine-end", monthLabel(series[series.length - 1].month));
  }

  /* ----------------------------------------------------------- stat strip */
  function tile(label, value, sub) {
    var wrap = el("div");
    wrap.appendChild(el("dt", null, label));
    var dd = el("dd", null, value);
    if (sub) dd.appendChild(el("small", null, sub));
    wrap.appendChild(dd);
    return wrap;
  }

  function renderStrip() {
    var s = DATA.stats, host = $("#strip");
    host.innerHTML = "";
    host.appendChild(tile("Repositories", num(s.repos),
      s.reposPrivate + " private · " + s.reposPublic + " public"));
    host.appendChild(tile("Commits counted", num(s.localCommits),
      "in " + s.localRepos + " repositories checked out locally"));
    host.appendChild(tile("Months of history",
      num(monthsBetween(s.firstCommit.slice(0, 7), s.lastPush.slice(0, 7))),
      longDate(s.firstCommit) + " → " + longDate(s.lastPush)));
    host.appendChild(tile("Languages", num(s.distinctLanguages),
      "primary language across all repositories"));
    host.appendChild(tile("Busiest month", num(s.busiestMonthCommits),
      "commits in " + monthLabel(s.busiestMonth)));
    host.appendChild(tile("First repository", ymd(s.firstRepoCreated).slice(0, 7).replace("-", "."),
      "created " + longDate(s.firstRepoCreated) + ", before any history survives locally"));

    setSlot("prov", s.reposPrivate + " of the " + s.repos + " repositories below are private. " +
      "Publishing this page publishes their names.");

    setSlot("chart-note", num(s.checkoutCommits) + " commit timestamps grouped by the month they " +
      "landed, from " + longDate(s.firstCommit) + " to the last push on " + longDate(s.lastPush) +
      ". Months with no commits are drawn flat, not skipped.");

    var caveat = "Note on the two commit totals: this chart counts every commit timestamp " +
      "found in all " + s.checkoutsInSource + " working trees (" + num(s.checkoutCommits) +
      "). A few repositories are cloned more than once, and clones share history, so the " +
      "headline figure of " + num(s.localCommits) + " commits counts each repository once, " +
      "using its deepest checkout.";
    if (DATA.meta.excludePrivate) {
      caveat += " This dataset was built with --exclude-private, but the raw month series " +
        "carries no repository name, so the chart still covers all " + s.checkoutsInSource +
        " working trees rather than only the " + s.localCheckouts + " public ones.";
    }
    setSlot("chart-caveat", caveat);

    setSlot("lang-note", "Primary language as GitHub detects it — one vote per repository, " +
      s.repos + " in total. " + (DATA.languages.filter(function (l) { return l.name === "Unset"; })
        .map(function (l) { return l.count; })[0] || 0) +
      " have no primary language detected.");

    setSlot("dd-note", "The " + s.localRepos + " repositories with a working tree on this " +
      "machine — the ones with commit history to show. Counts come from git rev-list.");
  }

  /* ---------------------------------------------------------- svg chart */
  function renderChart() {
    var series = DATA.commitsByMonth;
    var host = $("#chart");
    host.innerHTML = "";
    if (!series.length) return;

    var W = 900, H = 300, L = 44, R = 10, T = 18, B = 46;
    var iw = W - L - R, ih = H - T - B;
    var max = series.reduce(function (m, d) { return Math.max(m, d.commits); }, 0);
    var top = Math.ceil(max / 50) * 50;
    var band = iw / series.length;
    var bw = Math.max(4, band - 4);
    var y = function (v) { return T + ih - (v / top) * ih; };

    var root = svg("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Bar chart of commits per month. " + series.map(function (d) {
        return monthLabel(d.month) + ": " + d.commits;
      }).join("; ") + "."
    });

    /* y grid + labels */
    for (var v = 0; v <= top; v += 50) {
      root.appendChild(svg("line", {
        class: v === 0 ? "base" : "grid",
        x1: L, x2: W - R, y1: y(v), y2: y(v)
      }));
      var lab = svg("text", { class: "ax", x: L - 8, y: y(v) + 3.5, "text-anchor": "end" });
      lab.textContent = v;
      root.appendChild(lab);
    }
    var ylab = svg("text", { class: "ax", x: L - 8, y: T - 6, "text-anchor": "end" });
    ylab.textContent = "commits";
    root.appendChild(ylab);

    /* bars + x labels */
    series.forEach(function (d, i) {
      var cx = L + band * i + band / 2;
      if (d.commits > 0) {
        root.appendChild(svg("rect", {
          class: "bar" + (d.commits === max ? " bar--peak" : ""),
          x: cx - bw / 2, y: y(d.commits), width: bw, height: y(0) - y(d.commits)
        }));
        if (d.commits >= top * 0.25) {
          var n = svg("text", { class: "val", x: cx, y: y(d.commits) - 6, "text-anchor": "middle" });
          n.textContent = d.commits;
          root.appendChild(n);
        }
      }
      var showEvery = series.length > 14 ? 3 : 1;
      if (i % showEvery === 0 || i === series.length - 1) {
        var xl = svg("text", { class: "ax", x: cx, y: H - B + 18, "text-anchor": "middle" });
        xl.textContent = MONTH[+d.month.slice(5, 7) - 1];
        root.appendChild(xl);
        var yr = svg("text", { class: "ax", x: cx, y: H - B + 32, "text-anchor": "middle" });
        yr.textContent = d.month.slice(2, 4);
        root.appendChild(yr);
      }
    });

    host.appendChild(root);
  }

  /* -------------------------------------------------------- languages */
  function renderLangs() {
    var host = $("#langs");
    host.innerHTML = "";
    var max = DATA.languages.reduce(function (m, l) { return Math.max(m, l.count); }, 0) || 1;
    DATA.languages.forEach(function (l) {
      var isUnset = l.name === "Unset";
      var li = el("li", "lang" + (isUnset ? " lang--unset" : ""));
      li.appendChild(el("span", "lang__name", isUnset ? "no primary language" : l.name));
      var track = el("span", "lang__track");
      var fill = el("i", "lang__fill");
      fill.style.width = ((l.count / max) * 100).toFixed(2) + "%";
      track.appendChild(fill);
      li.appendChild(track);
      li.appendChild(el("span", "lang__n", l.count));
      host.appendChild(li);
    });
  }

  /* ---------------------------------------------------------- filters */
  function readFilters() {
    return {
      lang: $("#f-lang").value,
      year: $("#f-year").value,
      local: $("#f-local").checked,
      pub: $("#f-public").checked
    };
  }

  function matches(p, f) {
    if (f.lang && (p.language || "Unset") !== f.lang) return false;
    if (f.year && p.year !== f.year) return false;
    if (f.local && !p.local) return false;
    if (f.pub && p.private) return false;
    return true;
  }

  function fillFilters() {
    var langSel = $("#f-lang"), yearSel = $("#f-year");
    DATA.languages.forEach(function (l) {
      var o = el("option", null, (l.name === "Unset" ? "no primary language" : l.name) +
        "  (" + l.count + ")");
      o.value = l.name;
      langSel.appendChild(o);
    });
    var years = {};
    DATA.projects.forEach(function (p) { years[p.year] = (years[p.year] || 0) + 1; });
    Object.keys(years).sort().reverse().forEach(function (y) {
      var o = el("option", null, y + "  (" + years[y] + ")");
      o.value = y;
      yearSel.appendChild(o);
    });
  }

  /* ------------------------------------------------------------- rail */
  function nodeSize(commits) {
    /* sqrt scale so a 106-commit repo reads as bigger, not 20x bigger */
    if (!commits) return 9;
    return Math.round(9 + Math.sqrt(commits) * 1.35);
  }

  function entryFor(p) {
    var li = el("div", "entry" + (p.local ? " entry--local" : ""));
    var node = el("span", "entry__node");
    if (p.local && p.commits) {
      var s = nodeSize(p.commits);
      node.style.width = s + "px";
      node.style.height = s + "px";
      node.style.left = "calc(var(--gut) / -2 - " + (s / 2).toFixed(1) + "px + 0.5px)";
    }
    li.appendChild(node);

    li.appendChild(el("span", "entry__date", ymd(p.created)));
    li.appendChild(el("span", "entry__name", p.name));
    li.appendChild(el("span", "entry__commits",
      p.local && p.commits ? p.commits + " commits" : ""));

    var meta = el("span", "entry__meta");
    meta.appendChild(tags(p, { authored: false }));
    li.appendChild(meta);

    if (p.description) {
      li.appendChild(el("p", "entry__desc", p.description));
    }
    return li;
  }

  function renderRail(f) {
    var host = $("#rail");
    host.innerHTML = "";
    var shown = DATA.projects.filter(function (p) { return matches(p, f); });

    /* group by quarter, newest first — the ramp reads top-down as "now back to then" */
    var order = [], groups = {};
    shown.slice().reverse().forEach(function (p) {
      if (!groups[p.quarter]) { groups[p.quarter] = []; order.push(p.quarter); }
      groups[p.quarter].push(p);
    });

    var maxQ = order.reduce(function (m, q) { return Math.max(m, groups[q].length); }, 0) || 1;

    order.forEach(function (q) {
      var list = groups[q];
      var sec = el("section", "quarter");
      var head = el("div", "qhead");
      head.appendChild(el("h3", "qhead__label", q.replace("-", " ")));
      head.appendChild(el("span", "qhead__count",
        list.length + (list.length === 1 ? " repo started" : " repos started")));
      var meter = el("span", "qhead__meter");
      var fill = el("i");
      fill.style.width = ((list.length / maxQ) * 100).toFixed(1) + "%";
      meter.appendChild(fill);
      head.appendChild(meter);
      sec.appendChild(head);
      list.forEach(function (p) { sec.appendChild(entryFor(p)); });
      host.appendChild(sec);
    });

    $("#rail-empty").hidden = shown.length > 0;
    return shown.length;
  }

  /* ------------------------------------------------------------ cards */
  function renderCards(f) {
    var host = $("#cards");
    host.innerHTML = "";
    var shown = DATA.projects.filter(function (p) { return p.local && matches(p, f); })
      .sort(function (a, b) { return (b.commits || 0) - (a.commits || 0); });

    shown.forEach(function (p) {
      var li = el("li", "card");

      var top = el("div", "card__top");
      top.appendChild(el("h3", "card__name", p.name));
      if (p.commits) {
        var c = el("div", "card__commits");
        c.appendChild(el("b", null, p.commits));
        c.appendChild(el("span", null, "commits"));
        top.appendChild(c);
      }
      li.appendChild(top);

      var tg = el("div", "card__tags");
      tg.appendChild(tags(p, { authored: true }));
      li.appendChild(tg);

      if (p.description) {
        li.appendChild(el("p", "card__desc" +
          (p.descSource === "authored" ? " card__desc--authored" : ""), p.description));
      }

      var facts = el("div", "card__facts");
      function fact(label, value) {
        if (!value) return;
        var row = el("div");
        row.appendChild(document.createTextNode(label + " "));
        row.appendChild(el("b", null, value));
        facts.appendChild(row);
      }
      fact("created", ymd(p.created));
      if (p.firstCommit) fact("history", ymd(p.firstCommit) + " → " + ymd(p.lastCommit));
      else fact("history", "no commits in this checkout");
      fact("last push", ymd(p.pushed));
      if (p.branches && p.branches.length) fact("branch", p.branches.join(", "));
      if (p.checkouts > 1) fact("checkouts", p.checkouts + " working trees");
      li.appendChild(facts);

      host.appendChild(li);
    });

    $("#cards-empty").hidden = shown.length > 0;
    return shown.length;
  }

  /* ------------------------------------------------------------ wiring */
  function apply() {
    var f = readFilters();
    var inTimeline = renderRail(f);
    var inCards = renderCards(f);
    $("#f-count").textContent =
      inTimeline + " of " + DATA.projects.length + " repositories · " +
      inCards + " with local history";
  }

  function boot(data) {
    DATA = data;
    renderStrip();
    renderSpine(DATA.commitsByMonth);
    renderChart();
    renderLangs();
    fillFilters();
    apply();
    $("#filters").addEventListener("change", apply);
    $("#filters").addEventListener("submit", function (e) { e.preventDefault(); });
    $("#f-reset").addEventListener("click", function () {
      setTimeout(apply, 0); /* let the reset land first */
    });
  }

  function fail(why) {
    var host = $("#strip");
    if (host) {
      host.innerHTML = "";
      host.appendChild(tile("Data unavailable", "—", why));
    }
  }

  /* Try HTTP first; fall back to the generated JSONP file for file:// */
  function loadJsonp() {
    if (window.__SHOWCASE__) { boot(window.__SHOWCASE__); return; }
    var s = document.createElement("script");
    s.src = "data/projects.jsonp.js";
    s.onload = function () {
      if (window.__SHOWCASE__) boot(window.__SHOWCASE__);
      else fail("data/projects.jsonp.js loaded but was empty.");
    };
    s.onerror = function () {
      fail("Could not read data/projects.json. Run python3 scripts/build-data.py, " +
        "then serve the folder with python3 -m http.server.");
    };
    document.head.appendChild(s);
  }

  if (window.fetch && location.protocol !== "file:") {
    fetch("data/projects.json")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(boot)
      .catch(loadJsonp);
  } else {
    loadJsonp();
  }
})();
