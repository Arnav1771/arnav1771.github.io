/*
 * story.js — data layer for the GitHub-history portfolio.
 *
 * Pure transformation: parsed projects.json in, normalised narrative
 * structures out. No DOM, no styling, no rendering, no dependencies.
 * Plain ES5 script — exposes exactly window.Story = { build: fn }.
 *
 * Contract:
 *   Story.build(raw) -> {
 *     totals:  { repositories, commits, years, languages, activeSince, latest },
 *     ramp:    [ { period, commits, started, isPeak } ],   // oldest -> newest
 *     arcs:    [ { year, title, repos, commits?, languages, highlights, delta } ],
 *     arsenal: [ { name, repos, share, firstSeen, lastSeen, projects } ],
 *     archive: [ { index, name, description, language, year, created,
 *                  pushed, stars, category, status, weight } ],
 *     facets:  { years, languages, categories }
 *   }
 *
 * HONESTY RULE: a field is omitted entirely when the source data cannot
 * support it. The only such field is arcs[].commits — per-calendar-year
 * commit counts exist only for years covered by commitsByMonth (the local
 * git-history window, 2024-11 onward). Years outside that window carry NO
 * commits key at all. Consumers must test `typeof arc.commits === "number"`
 * and render an em dash rather than a zero.
 */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------- util */

  function isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function arr(v) { return isArr(v) ? v : []; }
  function str(v) { return typeof v === "string" ? v : ""; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function round(n, places) {
    var f = Math.pow(10, places || 0);
    return Math.round(n * f) / f;
  }
  function yearOf(iso) { return str(iso).slice(0, 4); }
  function monthOf(iso) { return str(iso).slice(0, 7); }
  function time(iso) {
    var t = Date.parse(str(iso));
    return isFinite(t) ? t : NaN;
  }
  function median(list) {
    if (!list.length) return 0;
    var s = list.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  /* Percentile rank in [0,1]; tied values share the average rank. */
  function percentiles(values) {
    var n = values.length, out = new Array(n), i, k;
    if (!n) return out;
    if (n === 1) { out[0] = 1; return out; }
    var idx = [];
    for (i = 0; i < n; i++) idx.push(i);
    idx.sort(function (a, b) { return values[a] - values[b]; });
    i = 0;
    while (i < n) {
      var j = i;
      while (j + 1 < n && values[idx[j + 1]] === values[idx[i]]) j++;
      var rank = ((i + j) / 2) / (n - 1);
      for (k = i; k <= j; k++) out[idx[k]] = rank;
      i = j + 1;
    }
    return out;
  }
  /* Display casing for category labels; acronyms need an override. */
  var LABEL = { ai: "AI" };
  function titleCase(s) {
    if (Object.prototype.hasOwnProperty.call(LABEL, s)) return LABEL[s];
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  var DAY = 86400000;

  /* ------------------------------------------------------------ category */
  /*
   * Explicit ordered rules, FIRST MATCH WINS, matched against a lower-cased
   * haystack of "name + description + language" with underscores and hyphens
   * flattened to spaces (so "Black-jack-Python" and "Fizz-Buzz" reach the
   * same patterns as their spaced forms).
   *
   * Order encodes specificity. coursework and game carry unambiguous markers
   * and are tested first. `ai` is deliberately LAST so it only claims repos
   * no more specific rule wanted — an AI-powered code-review platform is
   * still a "system", not an "ai".
   *
   * `nameRe`, where present, is tested against the repo NAME ONLY. It exists
   * for markers that are reliable in a name but noisy in prose: a repo called
   * `Mern_React_Task` is coursework, but "responsive task management" in a
   * product description is not.
   *
   * A repo that matches nothing is "uncategorised". That is a real answer,
   * not a failure — 60+ of these repos are undescribed asset dumps and
   * opaque one-word names where any guess would be worse than none.
   */
  var CATEGORY_RULES = [
    { name: "coursework",
      nameRe: /\btasks?\b/,
      re: /internship|forage|assignment|capstone|college|coursework|\bcourse\b|cs50|leet ?code|potd|geek ?for ?geeks|\bdsa\b|coding ?challenge|practice|\bsolutions?\b|tutorial|hackathon|gsoc|bootcamp|homework|\bquiz\b|exercise/ },
    { name: "game",
      re: /\bgames?\b|arcade|tetris|asteroid|platformer|\brpg\b|hangman|black ?jack|rock ?paper|treasure ?island|tic ?tac|higher ?lower|fizz ?buzz|godot|gdscript|ren.py|visual novel|romcom|dunki|playable|\bquest\b|player competes/ },
    { name: "experiment",
      re: /^test\d*$|^tmp|^temp|\btemp\b|\bdemo\b|\bpoc\b|scratch|playground|sandbox|experiment|^checking|^fsdf|^asdf|placeholder|\bdummy\b|^untitled|\btest\d/ },
    { name: "site",
      re: /portfolio|landing ?page|\bwebsite\b|web site|\bblog\b|\bresume\b|\.github\.io|gh ?pages|github ?pages|home ?page|\bprofile\b|directory of|\bshowcase\b/ },
    { name: "tool",
      re: /\bcli\b|\btool\b|toolkit|converter|\bconverts?\b|generator|\bgenerates?\b|extension|\bplugin\b|manager|downloader|\beditor\b|analyz|analys|translator|recorder|\brecording\b|scraper|\bscrapes?\b|dashboard|monitor|automat|\bbot\b|builder|\bsdk\b|helper|utilit|calculator|summari|transcri|\bcaptions?\b|\bocr\b|formatter|linter|\bdebug|\bspeech\b|\btodo\b/ },
    { name: "system",
      re: /platform|\bengine\b|\bserver\b|orchestrat|\bsystem\b|framework|infrastructure|pipeline|\bapi\b|\bsaas\b|\bhub\b|\bsuite\b|\bclone\b|\bide\b|workspace|daemon|\bagents?\b|swarm|database|compiler|runtime|micro ?service|full.stack|deployment|\bdocker\b|kubernetes|multi.user|collaborative|end.to.end/ },
    { name: "ai",
      re: /\bai\b|\bllm\b|\bgpt\b|gemini|deepseek|llama|\brag\b|genai|machine ?learning|\bml\b|neural|\bnlp\b|prediction|predictor|diffusion|\bflux\b|\bblip\b|embedding|inference|\bmodel\b|ollama|captioning/ }
  ];
  /* Language-only fallback, applied only when no textual rule matched. */
  var LANG_CATEGORY = { "GDScript": "game" };

  function categorise(p) {
    var name = str(p.name).toLowerCase().replace(/[_\-]+/g, " ").replace(/^ +| +$/g, "");
    var hay = name + " " +
      str(p.description).toLowerCase().replace(/[_\-]+/g, " ") + " " +
      str(p.language).toLowerCase();
    for (var i = 0; i < CATEGORY_RULES.length; i++) {
      var rule = CATEGORY_RULES[i];
      if (rule.nameRe && rule.nameRe.test(name)) return rule.name;
      if (rule.re.test(hay)) return rule.name;
    }
    var lang = str(p.language);
    if (Object.prototype.hasOwnProperty.call(LANG_CATEGORY, lang)) return LANG_CATEGORY[lang];
    return "uncategorised";
  }

  /* -------------------------------------------------------------- status */
  /*
   * Measured against the dataset's own newest push, not wall-clock time, so
   * the output is deterministic and does not silently rot between builds.
   *   active   : pushed within 90 days of the newest push in the dataset
   *   dormant  : 90 to 730 days (two years)
   *   archived : older than 730 days
   */
  var ACTIVE_DAYS = 90;
  var DORMANT_DAYS = 730;

  function statusOf(pushedMs, refMs) {
    if (!isFinite(pushedMs) || !isFinite(refMs)) return "archived";
    var age = (refMs - pushedMs) / DAY;
    if (age <= ACTIVE_DAYS) return "active";
    if (age <= DORMANT_DAYS) return "dormant";
    return "archived";
  }

  /* ------------------------------------------------------------- titling */
  /*
   * arcs[].title is DERIVED from that year's own numbers, never looked up
   * from a fixed romantic list. Ordered cascade, first match wins; a year
   * with no distinguishing signal is titled plainly with its own number.
   */
  function titleFor(y) {
    if (y.isFirstYear) return y.repos === 1 ? "The First Repo" : "Origins";
    if (y.repos >= 2 * Math.max(y.prevRepos, 1) && y.delta >= 5) {
      return (y.topLang && y.topLangShare >= 0.33)
        ? "The " + y.topLang + " Surge"
        : "The Surge";
    }
    if (y.typedRepos >= 3 && y.topLangShare >= 0.5) return "The " + y.topLang + " Year";
    if (y.topCat && y.topCatCount >= 3 && y.topCatShare >= 0.35 && y.topCatClear) {
      return "The " + titleCase(y.topCat) + " Year";
    }
    if (y.isCommitPeakYear) return "Peak Output";
    if (y.isWidestYear) return "Widest Year";
    if (y.typedRepos >= 3 && y.topLangShare >= 0.35) return "Mostly " + y.topLang;
    if (y.prevRepos > 0 && y.repos * 2 <= y.prevRepos) return "The Quiet Year";
    return String(y.year);
  }

  /* ---------------------------------------------------------------- main */

  function build(raw) {
    raw = (raw && typeof raw === "object") ? raw : {};

    var allProjects = arr(raw.projects);
    var repos = [];
    var forkCount = 0;
    var i, j, k, p;

    for (i = 0; i < allProjects.length; i++) {
      p = allProjects[i];
      if (!p || typeof p !== "object") continue;
      if (p.fork) { forkCount++; continue; }
      repos.push(p);
    }

    /* Reference instant: the newest push seen anywhere in the dataset. */
    var refMs = -Infinity;
    for (i = 0; i < repos.length; i++) {
      var t = time(repos[i].pushed);
      if (isFinite(t) && t > refMs) refMs = t;
    }
    if (!isFinite(refMs)) refMs = 0;

    /* Normalise every non-fork repo. */
    var items = [];
    for (i = 0; i < repos.length; i++) {
      p = repos[i];
      var createdMs = time(p.created);
      var pushedMs = time(p.pushed);
      items.push({
        name: str(p.name),
        description: str(p.description),
        language: str(p.language),
        year: str(p.year) || yearOf(p.created),
        created: str(p.created),
        pushed: str(p.pushed),
        stars: num(p.stars),
        diskKB: num(p.diskKB),
        commits: (typeof p.commits === "number" && isFinite(p.commits)) ? p.commits : null,
        createdMs: createdMs,
        pushedMs: pushedMs,
        category: categorise(p),
        status: statusOf(pushedMs, refMs)
      });
    }

    /* ------------------------------------------------------------ weight */
    /*
     * 0..1 prominence, driving an asymmetric layout. Built from percentile
     * ranks (uniform by construction, so the spread is guaranteed usable)
     * blended with the sparse absolute signals, then min-max rescaled into
     * [0.05, 1.00] so both extremes are actually reachable.
     *
     *   0.40  recency   percentile rank of `pushed` across all non-forks
     *   0.20  size      percentile rank of log(diskKB + 1)
     *   0.20  activity  log(commits+1)/log(maxCommits+1) — commit counts
     *                   exist for only 21 repos, so this is a BONUS term:
     *                   its absence contributes 0 rather than penalising
     *   0.10  stars     log(stars+1)/log(maxStars+1)
     *   0.10  described 1 when the repo carries a description
     */
    var W_RECENCY = 0.40, W_SIZE = 0.20, W_ACT = 0.20, W_STAR = 0.10, W_DESC = 0.10;

    var pushedVals = [], sizeVals = [];
    var maxCommits = 0, maxStars = 0;
    for (i = 0; i < items.length; i++) {
      pushedVals.push(isFinite(items[i].pushedMs) ? items[i].pushedMs : 0);
      sizeVals.push(Math.log(items[i].diskKB + 1));
      if (items[i].commits !== null && items[i].commits > maxCommits) maxCommits = items[i].commits;
      if (items[i].stars > maxStars) maxStars = items[i].stars;
    }
    var pushedPct = percentiles(pushedVals);
    var sizePct = percentiles(sizeVals);

    var rawScores = [], minRaw = Infinity, maxRaw = -Infinity;
    for (i = 0; i < items.length; i++) {
      var act = 0;
      if (items[i].commits !== null && maxCommits > 0) {
        act = Math.log(items[i].commits + 1) / Math.log(maxCommits + 1);
      }
      var st = 0;
      if (maxStars > 0) st = Math.log(items[i].stars + 1) / Math.log(maxStars + 1);
      var s = W_RECENCY * (pushedPct[i] || 0) +
              W_SIZE * (sizePct[i] || 0) +
              W_ACT * act +
              W_STAR * st +
              W_DESC * (items[i].description ? 1 : 0);
      rawScores.push(s);
      if (s < minRaw) minRaw = s;
      if (s > maxRaw) maxRaw = s;
    }
    var span = maxRaw - minRaw;
    for (i = 0; i < items.length; i++) {
      var w = span > 0 ? (rawScores[i] - minRaw) / span : 0.5;
      items[i].weight = round(0.05 + 0.95 * w, 3);
    }

    /* ----------------------------------------------------------- archive */
    var archiveItems = items.slice().sort(function (a, b) {
      var ta = isFinite(a.createdMs) ? a.createdMs : 0;
      var tb = isFinite(b.createdMs) ? b.createdMs : 0;
      if (tb !== ta) return tb - ta;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    var archive = [];
    for (i = 0; i < archiveItems.length; i++) {
      var a = archiveItems[i];
      archive.push({
        index: i + 1,
        name: a.name,
        description: a.description,
        language: a.language,
        year: a.year,
        created: a.created,
        pushed: a.pushed,
        stars: a.stars,
        category: a.category,
        status: a.status,
        weight: a.weight
      });
    }

    /* -------------------------------------------------------------- ramp */
    /*
     * Monthly, ordered oldest -> newest, restricted to the window
     * commitsByMonth actually measures. Outside that window there is no
     * commit history at all (not "zero commits" — no data), so extending
     * the ramp would be invention. `started` counts repos created inside
     * the same window, from their own created dates.
     */
    var byMonth = arr(raw.commitsByMonth).slice().sort(function (x, y) {
      var mx = str(x && x.month), my = str(y && y.month);
      return mx < my ? -1 : (mx > my ? 1 : 0);
    });
    var startedByMonth = {};
    for (i = 0; i < items.length; i++) {
      var m = monthOf(items[i].created);
      if (m) startedByMonth[m] = (startedByMonth[m] || 0) + 1;
    }
    /*
     * Peak rule: a month is a peak when its commit count exceeds 2x the
     * median of the months that actually have commits. Taking the median
     * over every month in the window would be dominated by the long silent
     * stretch (median 0), which would flag every active month as a peak.
     */
    var nonZero = [];
    for (i = 0; i < byMonth.length; i++) {
      var c = num(byMonth[i].commits);
      if (c > 0) nonZero.push(c);
    }
    var peakBase = median(nonZero);
    var peakCut = peakBase * 2;
    var ramp = [];
    for (i = 0; i < byMonth.length; i++) {
      var mo = str(byMonth[i].month);
      var mc = num(byMonth[i].commits);
      ramp.push({
        period: mo,
        commits: mc,
        started: startedByMonth[mo] || 0,
        isPeak: peakCut > 0 && mc > peakCut
      });
    }

    /* ------------------------------------------------- per-year groupings */
    var yearMap = {}, yearList = [];
    for (i = 0; i < items.length; i++) {
      var y = items[i].year;
      if (!y) continue;
      if (!Object.prototype.hasOwnProperty.call(yearMap, y)) {
        yearMap[y] = [];
        yearList.push(y);
      }
      yearMap[y].push(items[i]);
    }
    yearList.sort();

    /* Calendar-year commits, only for the years commitsByMonth covers. */
    var commitYear = {}, coveredYear = {}, cy;
    for (i = 0; i < byMonth.length; i++) {
      var yy = str(byMonth[i].month).slice(0, 4);
      if (!yy) continue;
      coveredYear[yy] = true;
      commitYear[yy] = (commitYear[yy] || 0) + num(byMonth[i].commits);
    }
    var peakCommitYear = null, peakCommitVal = -1;
    for (cy in commitYear) {
      if (!Object.prototype.hasOwnProperty.call(commitYear, cy)) continue;
      if (commitYear[cy] > peakCommitVal) { peakCommitVal = commitYear[cy]; peakCommitYear = cy; }
    }
    var widestYear = null, widestVal = -1;
    for (i = 0; i < yearList.length; i++) {
      if (yearMap[yearList[i]].length > widestVal) {
        widestVal = yearMap[yearList[i]].length;
        widestYear = yearList[i];
      }
    }

    /* -------------------------------------------------------------- arcs */
    var arcs = [];
    for (i = 0; i < yearList.length; i++) {
      var yr = yearList[i];
      var group = yearMap[yr];

      /* Languages present that year, ordered by frequency. */
      var lc = {}, lorder = [], typed = 0;
      for (j = 0; j < group.length; j++) {
        var lg = group[j].language;
        if (!lg) continue;
        typed++;
        if (!Object.prototype.hasOwnProperty.call(lc, lg)) { lc[lg] = 0; lorder.push(lg); }
        lc[lg]++;
      }
      lorder.sort((function (counts) {
        return function (x, z) {
          return counts[z] - counts[x] || (x < z ? -1 : (x > z ? 1 : 0));
        };
      })(lc));
      var topLang = lorder.length ? lorder[0] : "";
      var topLangShare = (typed > 0 && topLang) ? lc[topLang] / typed : 0;

      /*
       * Categories present that year, ordered by frequency. "uncategorised"
       * is excluded from this ranking: it is the absence of a signal, so it
       * must never become the year's theme, and the share is measured
       * against the repos that DID classify.
       */
      var cc = {}, corder = [], categorised = 0;
      for (j = 0; j < group.length; j++) {
        var cat = group[j].category;
        if (cat === "uncategorised") continue;
        categorised++;
        if (!Object.prototype.hasOwnProperty.call(cc, cat)) { cc[cat] = 0; corder.push(cat); }
        cc[cat]++;
      }
      corder.sort((function (counts) {
        return function (x, z) {
          return counts[z] - counts[x] || (x < z ? -1 : (x > z ? 1 : 0));
        };
      })(cc));
      var topCat = corder.length ? corder[0] : "";
      /* Only a strictly-largest bucket counts as the year's theme. */
      var topCatClear = corder.length === 1 ||
        (corder.length > 1 && cc[corder[0]] > cc[corder[1]]);

      /* Delta vs the immediately preceding CALENDAR year (0 if it had none). */
      var prevYearKey = String(Number(yr) - 1);
      var prevRepos = Object.prototype.hasOwnProperty.call(yearMap, prevYearKey)
        ? yearMap[prevYearKey].length : 0;
      var delta = group.length - prevRepos;

      /* Highlights: described repos first, then by weight, capped at three. */
      var ranked = group.slice().sort(function (x, z) {
        var dx = x.description ? 1 : 0, dz = z.description ? 1 : 0;
        if (dx !== dz) return dz - dx;
        if (z.weight !== x.weight) return z.weight - x.weight;
        return x.name < z.name ? -1 : (x.name > z.name ? 1 : 0);
      });
      var highlights = [];
      for (j = 0; j < ranked.length && highlights.length < 3; j++) {
        highlights.push({
          name: ranked[j].name,
          description: ranked[j].description,
          language: ranked[j].language
        });
      }

      var arc = {
        year: yr,
        title: titleFor({
          year: yr,
          repos: group.length,
          prevRepos: prevRepos,
          delta: delta,
          typedRepos: typed,
          topLang: topLang,
          topLangShare: topLangShare,
          topCat: topCat,
          topCatCount: topCat ? cc[topCat] : 0,
          topCatShare: (topCat && categorised > 0) ? cc[topCat] / categorised : 0,
          topCatClear: topCatClear,
          isFirstYear: i === 0,
          isCommitPeakYear: yr === peakCommitYear,
          isWidestYear: yr === widestYear
        }),
        repos: group.length,
        languages: lorder,
        highlights: highlights,
        delta: delta
      };
      /* commits only where the source actually measured that year */
      if (Object.prototype.hasOwnProperty.call(coveredYear, yr)) {
        arc.commits = commitYear[yr];
      }
      arcs.push(arc);
    }

    /* ----------------------------------------------------------- arsenal */
    var langMap = {}, langOrder = [], typedTotal = 0;
    for (i = 0; i < items.length; i++) {
      var ln = items[i].language;
      if (!ln) continue;
      typedTotal++;
      if (!Object.prototype.hasOwnProperty.call(langMap, ln)) {
        langMap[ln] = { name: ln, repos: 0, first: Infinity, last: -Infinity, items: [] };
        langOrder.push(ln);
      }
      var bucket = langMap[ln];
      bucket.repos++;
      bucket.items.push(items[i]);
      if (isFinite(items[i].createdMs) && items[i].createdMs < bucket.first) {
        bucket.first = items[i].createdMs;
      }
      if (isFinite(items[i].pushedMs) && items[i].pushedMs > bucket.last) {
        bucket.last = items[i].pushedMs;
      }
    }
    langOrder.sort(function (x, z) {
      return langMap[z].repos - langMap[x].repos || (x < z ? -1 : (x > z ? 1 : 0));
    });
    var arsenal = [];
    for (i = 0; i < langOrder.length; i++) {
      var L = langMap[langOrder[i]];
      var ordered = L.items.slice().sort(function (x, z) {
        var tx = isFinite(x.createdMs) ? x.createdMs : 0;
        var tz = isFinite(z.createdMs) ? z.createdMs : 0;
        return tz - tx || (x.name < z.name ? -1 : (x.name > z.name ? 1 : 0));
      });
      var pnames = [];
      for (j = 0; j < ordered.length; j++) pnames.push(ordered[j].name);
      arsenal.push({
        name: L.name,
        repos: L.repos,
        share: typedTotal > 0 ? round(L.repos / typedTotal, 4) : 0,
        firstSeen: isFinite(L.first) ? new Date(L.first).toISOString().slice(0, 4) : "",
        lastSeen: isFinite(L.last) ? new Date(L.last).toISOString().slice(0, 4) : "",
        projects: pnames
      });
    }

    /* ------------------------------------------------------------ totals */
    var totalCommits = 0;
    for (i = 0; i < byMonth.length; i++) totalCommits += num(byMonth[i].commits);

    var firstCreatedMs = Infinity, lastPushedMs = -Infinity;
    var activeSince = "", latest = "";
    for (i = 0; i < items.length; i++) {
      if (isFinite(items[i].createdMs) && items[i].createdMs < firstCreatedMs) {
        firstCreatedMs = items[i].createdMs;
        activeSince = items[i].created;
      }
      if (isFinite(items[i].pushedMs) && items[i].pushedMs > lastPushedMs) {
        lastPushedMs = items[i].pushedMs;
        latest = items[i].pushed;
      }
    }

    var totals = {
      repositories: items.length,
      commits: totalCommits,
      years: yearList.length,
      languages: langOrder.length,
      activeSince: activeSince,
      latest: latest
    };

    /* ------------------------------------------------------------ facets */
    var facetYears = yearList.slice().sort(function (x, z) {
      return Number(z) - Number(x);
    });
    var catCount = {}, catOrder = [];
    for (i = 0; i < items.length; i++) {
      var fc = items[i].category;
      if (!Object.prototype.hasOwnProperty.call(catCount, fc)) { catCount[fc] = 0; catOrder.push(fc); }
      catCount[fc]++;
    }
    catOrder.sort(function (x, z) {
      if (x === "uncategorised" && z !== "uncategorised") return 1;
      if (z === "uncategorised" && x !== "uncategorised") return -1;
      return catCount[z] - catCount[x] || (x < z ? -1 : (x > z ? 1 : 0));
    });

    return {
      totals: totals,
      ramp: ramp,
      arcs: arcs,
      arsenal: arsenal,
      archive: archive,
      facets: {
        years: facetYears,
        languages: langOrder.slice(),
        categories: catOrder
      }
    };
  }

  global.Story = { build: build };
})(typeof window !== "undefined" ? window : this);
