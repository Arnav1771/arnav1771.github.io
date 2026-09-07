/*
 * app.js - the shell.
 *
 * It owns exactly three things: loading the record, deciding which world is
 * mounted, and the crossing between them. It renders no content of its own.
 *
 * The first version of this page had one DOM and two palettes, and the second
 * world was the first with a dark background and a glow on it. That is not two
 * art directions, it is one design with a filter. So the worlds are now two
 * renderers over one data layer - Archive and Signal - and switching genuinely
 * tears the page down and builds a different one. Same record, different world.
 *
 * Both renderers are optional at runtime. If one fails to load, the switcher
 * stops offering it rather than dropping the reader onto a blank stage.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stage = document.getElementById("stage");
  var crossing = document.getElementById("crossing");
  var crossWord = document.getElementById("crossing-word");

  var WORLDS = {
    professional: { name: "Archive", bg: "#F3F1EC", get: function () { return window.Archive; } },
    anime:        { name: "Signal",  bg: "#090A0F", get: function () { return window.Signal; } }
  };

  var story = null, raw = null, mounted = null, switching = false;

  function present(world) {
    var w = WORLDS[world];
    var r = w && w.get();
    return !!(r && typeof r.render === "function");
  }

  /* ------------------------------------------------------------- chrome */

  function paintChrome() {
    var m = document.querySelector('meta[name="theme-color"]');
    var w = WORLDS[root.dataset.world] || WORLDS.professional;
    if (m) m.setAttribute("content", w.bg);
  }

  function markButtons() {
    var bs = document.querySelectorAll(".worlds button");
    for (var i = 0; i < bs.length; i += 1) {
      var world = bs[i].getAttribute("data-world");
      bs[i].setAttribute("aria-pressed", String(world === root.dataset.world));
      // A world whose renderer never loaded is not offered.
      bs[i].disabled = !present(world);
      bs[i].hidden = !present(world);
    }
  }

  /* -------------------------------------------------------------- mount */

  function unmount() {
    if (mounted) {
      var r = WORLDS[mounted] && WORLDS[mounted].get();
      if (r && typeof r.teardown === "function") {
        try { r.teardown(); } catch (e) {}
      }
    }
    stage.innerHTML = "";
    stage.className = "";
    mounted = null;
  }

  function mount(world) {
    var r = WORLDS[world] && WORLDS[world].get();
    if (!r) return false;
    try {
      r.render(stage, story, raw);
      mounted = world;
      return true;
    } catch (e) {
      stage.innerHTML = '<p class="stage-fault">This view could not be built. ' +
        'The record is still readable in the other one.</p>';
      return false;
    }
  }

  /*
   * Crossing between worlds.
   *
   * Seven bands wipe across, the swap happens while the screen is covered, and
   * the bands lift from the other side - about 900ms end to end, long enough to
   * read as an event and short enough to stay out of the way. Under reduced
   * motion it is an immediate swap, because the point of that setting is not to
   * watch things move.
   */
  function goTo(world) {
    if (!world || world === root.dataset.world || switching) return;
    if (!present(world)) return;

    function apply() {
      unmount();
      root.dataset.world = world;
      paintChrome();
      markButtons();
      mount(world);
      window.scrollTo(0, 0);
      try { localStorage.setItem("world", world); } catch (e) {}
    }

    if (still) { apply(); return; }

    switching = true;
    crossWord.textContent = WORLDS[world].name;
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

  /* ------------------------------------------------------- reading rail */

  /*
   * One scroll listener for the whole page, reading in a frame and writing in
   * the next, so neither world has to install its own. It publishes two things
   * the mounted world can style against: the rail's width, and --scroll on the
   * root, which is the fraction of the record already read.
   */
  (function rail() {
    if (still) return;
    var bar = document.getElementById("progress");
    var queued = false;

    var head = document.querySelector(".index");

    function measure() {
      queued = false;
      var doc = document.documentElement;
      // The index bar wraps on narrow screens, so its height is measured
      // rather than assumed - the rail sits on its lower edge either way.
      if (head) doc.style.setProperty("--index-h", head.offsetHeight + "px");
      var run = (doc.scrollHeight - window.innerHeight) || 1;
      var at = Math.min(Math.max(window.pageYOffset / run, 0), 1);
      if (bar) bar.style.width = (at * 100).toFixed(2) + "%";
      doc.style.setProperty("--scroll", at.toFixed(4));
      doc.style.setProperty("--scrolled", String(window.pageYOffset));
    }

    window.addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    }, { passive: true });
    window.addEventListener("resize", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    }, { passive: true });
    measure();
  })();

  /* ----------------------------------------------------------- fallback */

  /*
   * A stand-in for Story, used only if that file is unavailable. Deliberately
   * plain: same field names, no invented values, so the page stays honest even
   * when it is running on the reserve tank.
   */
  function fallbackStory(data) {
    var projects = (data.projects || []).filter(function (p) {
      return String(p.fork) !== "True" && p.fork !== true;
    });
    var months = data.commitsByMonth || [];
    var commits = 0;
    months.forEach(function (m) { commits += (m.commits || 0); });

    var byYear = {}, startedBy = {};
    projects.forEach(function (p) {
      if (p.year) byYear[p.year] = (byYear[p.year] || 0) + 1;
      var mm = String(p.created || "").slice(0, 7);
      if (mm) startedBy[mm] = (startedBy[mm] || 0) + 1;
    });

    var sorted = months.map(function (m) { return m.commits || 0; })
      .sort(function (a, b) { return a - b; });
    var median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    var langs = (data.languages || []).slice().sort(function (a, b) {
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
        return {
          year: y, title: "", repos: mine.length,
          languages: ls.slice(0, 4), highlights: [], delta: null
        };
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

  /* -------------------------------------------------------------- start */

  // Professional is the default identity; only an explicit earlier choice
  // moves it, and only to a world that actually loaded.
  try {
    if (localStorage.getItem("world") === "anime" && present("anime")) {
      root.dataset.world = "anime";
    }
  } catch (e) {}

  paintChrome();
  markButtons();

  var wbs = document.querySelectorAll(".worlds button");
  for (var w = 0; w < wbs.length; w += 1) {
    wbs[w].addEventListener("click", function () {
      goTo(this.getAttribute("data-world"));
    });
  }

  fetch("data/projects.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      raw = data;
      try {
        story = (window.Story && window.Story.build)
          ? window.Story.build(data)
          : fallbackStory(data);
      } catch (e) {
        story = fallbackStory(data);
      }
      if (!mount(root.dataset.world) && root.dataset.world !== "professional") {
        root.dataset.world = "professional";
        paintChrome();
        markButtons();
        mount("professional");
      }
    })
    .catch(function () {
      stage.innerHTML = '<p class="stage-fault">The repository record could not ' +
        'be loaded, so there is nothing honest to show here.</p>';
    });
})();
