/* core.js — the signature object for the anime world of the same record.
 *
 * WHAT THIS IS
 *   An energy core: a suspended reactor built out of projects.json. It is the
 *   sibling of monument.js, not a recolour of it. The monument is a column of
 *   quarried strata that stands on a plinth and turns once, slowly, matte. This
 *   thing has no ground. It hangs in the dark, it is hollow, it is lit from the
 *   inside, and its parts turn against each other.
 *
 *   Five concentric layers, read from the middle outward:
 *
 *     1. GEM          the solid heart. 20 flat faces. It breathes on the pulse.
 *     2. PLATE SHELL  a shattered shell of 80 separated plates around the gem.
 *                     14 lobes push the plates outward — one lobe per entry in
 *                     languages[], lobe height = that language repo count.
 *                     Python (52 repos) is the longest spike; the one-repo
 *                     languages barely dent the sphere. Plate tint = the
 *                     language whose lobe owns that plate.
 *     3. MONTH RIBBON a ribbon of light on an inner hoop. 21 stepped segments,
 *                     one per entry in commitsByMonth. Segment height and heat
 *                     = commits in that month. It is an ARC, not a circle: it
 *                     spans only the quarters the commit record covers.
 *     4. BLADE SHELL  21 blades in a ring, one per entry in reposPerQuarter,
 *                     oldest to newest around the circle. Blade length = repos
 *                     started that quarter (1 .. 37). Blade tint = dominant
 *                     language of those repos. Blade heat = commits that
 *                     quarter. The ring irises open and shut on the pulse.
 *     5. SHARD SWARM  175 orbiting shards, one per entry in projects[]. Orbit
 *                     radius = age (oldest furthest out), shard size = repo
 *                     disk size, tint = language, angular speed falls off with
 *                     radius so the recent work whips round on the inside.
 *
 *   Plus filaments: strands of light strung from the heart out to a blade. The
 *   number of strands on a blade is that quarter commit volume — 14 strands on
 *   2026-Q2, two on 2024-Q4, none at all where there is nothing to carry.
 *
 * HONESTY — WHAT THE HOLES MEAN
 *   Repositories are known back to 2020-01. Commits are only known from
 *   2024-11, because that is where the local git history begins. So:
 *
 *     * All 21 blades exist as a WIRE CAGE. Every quarter has a repo count, so
 *       every quarter has structure, and the cage line weight is that count.
 *     * Only the 8 quarters inside the commit window (2024-Q4 .. 2026-Q3) get
 *       a solid blade. The other 13 are cage and nothing else — you look
 *       straight through the shell there. That hole is the missing record,
 *       drawn as a hole.
 *     * A quarter inside the window that recorded zero commits (2025-Q1,
 *       2025-Q3) gets its solid blade and is left dark alloy. Recorded silence
 *       is not the same thing as no recording, and it does not look the same
 *       here either.
 *     * The month ribbon starts at 2024-11 and stops at 2026-07. Before that
 *       there is no ribbon, because there is no number to draw. Months that
 *       recorded zero are drawn as a flat dark rail, not skipped and not
 *       rounded up.
 *     * No filament is strung to a quarter with no commit record, and none to
 *       a recorded zero. Zero strands is the honest count.
 *
 *   Nothing is padded to make the ring look complete. On this dataset roughly
 *   two thirds of the shell is unlit skeleton, and that is the correct picture
 *   of a five-year repo history with two years of commit history inside it.
 *
 *   Three things here are structure, not measurement, and are declared as such
 *   the way the monument declares its plinth: the two containment hoops, the
 *   pulse waveform, and the camera. Everything else is a reading.
 *
 * DERIVED CONSTANTS
 *   pulse amplitude = 0.30 + 1.10 * (busiest month commits / all commits)
 *   pulse rate      = 0.55 + 0.90 * (months with commits / months recorded)
 *
 * COST
 *   8 draw calls, ~1030 triangles. One static buffer per layer; every animation
 *   is a vertex-shader function of uTime, so nothing is rebuilt per frame.
 *
 * CONTRACT
 *   Plain ES5. No modules. Expects global THREE (r128) already loaded.
 *   window.Core = { mount(canvas, raw, opts), destroy() }
 *   opts.still (or opts.reducedMotion) renders one good static frame, no loop.
 */
(function (global) {
  'use strict';

  var THREE = global.THREE;

  /* ------------------------------------------------------------------ *
   * 0. small utilities
   * ------------------------------------------------------------------ */

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // deterministic hash -> [0,1). Same core on every single load.
  function hash(a, b, c) {
    var n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /* The anime palette. The core is lit entirely out of these. */
  var PAL = {
    ground:  [0.031, 0.035, 0.063],   /* 080910 */
    crimson: [1.000, 0.090, 0.267],   /* FF1744 */
    pink:    [1.000, 0.176, 0.459],   /* FF2D75 */
    cyan:    [0.000, 0.898, 1.000],   /* 00E5FF */
    blue:    [0.239, 0.482, 1.000],   /* 3D7BFF */
    violet:  [0.545, 0.361, 0.965],   /* 8B5CF6 */
    bright:  [0.961, 0.961, 0.969]    /* F5F5F7 */
  };

  var RAMP = [PAL.cyan, PAL.blue, PAL.violet, PAL.pink, PAL.crimson];

  function mix3(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }

  // 0 = the languages with one repo, cold cyan. 1 = the language actually
  // written, crimson. A rank on one ramp, never an arbitrary hue per name.
  function rampAt(t) {
    t = clamp(t, 0, 1) * (RAMP.length - 1);
    var i = Math.floor(t);
    if (i > RAMP.length - 2) i = RAMP.length - 2;
    return mix3(RAMP[i], RAMP[i + 1], t - i);
  }

  /* ------------------------------------------------------------------ *
   * 1. DATA -> MODEL
   *    Every number the geometry uses is derived here, and only here.
   * ------------------------------------------------------------------ */

  function quarterOrder(q) {
    var p = String(q).split('-Q');
    var y = parseInt(p[0], 10), n = parseInt(p[1], 10);
    if (!isFinite(y)) return 0;
    return y * 4 + (isFinite(n) ? n : 1);
  }

  // first calendar month of a quarter, expressed as year*12 + month
  function quarterFirstMonth(q) {
    var p = String(q).split('-Q');
    var y = parseInt(p[0], 10), n = parseInt(p[1], 10);
    if (!isFinite(y)) return 0;
    if (!isFinite(n)) n = 1;
    return y * 12 + (n - 1) * 3 + 1;
  }

  function monthOrder(m) {
    var p = String(m).split('-');
    var y = parseInt(p[0], 10), n = parseInt(p[1], 10);
    if (!isFinite(y) || !isFinite(n)) return null;
    return y * 12 + n;
  }

  function monthToQuarter(m) {
    var p = String(m).split('-');
    var y = parseInt(p[0], 10), n = parseInt(p[1], 10);
    if (!isFinite(y) || !isFinite(n)) return null;
    return y + '-Q' + (Math.floor((n - 1) / 3) + 1);
  }

  function readData(data) {
    if (!data || typeof data !== 'object') return null;

    var projects = (data.projects && data.projects.length) ? data.projects : [];
    var i, q;

    /* --- languages -> the lobes of the crystal -------------------------- */
    var langs = [];
    if (data.languages && data.languages.length) {
      for (i = 0; i < data.languages.length; i++) {
        var Ln = data.languages[i];
        if (!Ln || !Ln.name) continue;
        langs.push({ name: Ln.name, count: Ln.count || 0 });
      }
    }
    if (!langs.length) {
      var tal0 = {}, keys = [];
      for (i = 0; i < projects.length; i++) {
        var pl = projects[i].language || 'Unset';
        if (tal0[pl] === undefined) { tal0[pl] = 0; keys.push(pl); }
        tal0[pl]++;
      }
      for (i = 0; i < keys.length; i++) langs.push({ name: keys[i], count: tal0[keys[i]] });
    }
    if (!langs.length) return null;
    langs.sort(function (a, b) { return b.count - a.count; });

    var maxLang = 1;
    for (i = 0; i < langs.length; i++) maxLang = Math.max(maxLang, langs[i].count);

    var langIndex = {};
    var nL = langs.length;
    for (i = 0; i < nL; i++) {
      // Fibonacci directions: the lobes spread evenly over the sphere, so the
      // language distribution is legible from any angle the page shows it at.
      var ft = nL > 1 ? (i + 0.5) / nL : 0.5;
      var fy = 1 - 2 * ft;
      var fr = Math.sqrt(Math.max(1 - fy * fy, 0));
      var fp = i * 2.399963229728653;
      langs[i].dir = [Math.cos(fp) * fr, fy, Math.sin(fp) * fr];
      langs[i].amp = Math.pow(langs[i].count / maxLang, 0.62);
      langs[i].tint = rampAt(nL > 1 ? 1 - i / (nL - 1) : 1);
      langIndex[langs[i].name] = i;
    }

    function tintFor(name) {
      var key = (name === undefined || name === null || name === '') ? 'Unset' : name;
      var k = langIndex[key];
      if (k === undefined) k = langIndex['Unset'];
      return k === undefined ? PAL.bright : langs[k].tint;
    }

    /* --- months -> the commit record ------------------------------------ */
    var months = [];
    if (data.commitsByMonth && data.commitsByMonth.length) {
      for (i = 0; i < data.commitsByMonth.length; i++) {
        var Me = data.commitsByMonth[i];
        var mo = Me ? monthOrder(Me.month) : null;
        if (mo === null || mo === undefined) continue;
        months.push({ month: Me.month, order: mo, commits: Me.commits || 0 });
      }
      months.sort(function (a, b) { return a.order - b.order; });
    }
    var firstMonth = months.length ? months[0].order : null;
    var lastMonth = months.length ? months[months.length - 1].order : null;

    var maxMonth = 1, totalCommits = 0, liveMonths = 0;
    for (i = 0; i < months.length; i++) {
      maxMonth = Math.max(maxMonth, months[i].commits);
      totalCommits += months[i].commits;
      if (months[i].commits > 0) liveMonths++;
    }
    for (i = 0; i < months.length; i++) {
      months[i].norm = Math.pow(months[i].commits / maxMonth, 0.55);
      months[i].zero = months[i].commits === 0;
      months[i].quarter = monthToQuarter(months[i].month);
    }

    /* --- quarters -> the blade ring ------------------------------------- */
    var repoByQ = {}, order = [];
    if (data.reposPerQuarter && data.reposPerQuarter.length) {
      for (i = 0; i < data.reposPerQuarter.length; i++) {
        q = data.reposPerQuarter[i] && data.reposPerQuarter[i].quarter;
        if (!q) continue;
        repoByQ[q] = data.reposPerQuarter[i].repos || 0;
        order.push(q);
      }
    } else {
      for (i = 0; i < projects.length; i++) {
        q = projects[i].quarter;
        if (!q) continue;
        if (repoByQ[q] === undefined) { repoByQ[q] = 0; order.push(q); }
        repoByQ[q]++;
      }
    }
    if (!order.length) return null;
    order.sort(function (a, b) { return quarterOrder(a) - quarterOrder(b); });

    var commitByQ = {};
    for (i = 0; i < months.length; i++) {
      if (!months[i].quarter) continue;
      commitByQ[months[i].quarter] = (commitByQ[months[i].quarter] || 0) + months[i].commits;
    }

    // dominant language of the repositories started in each quarter
    var langByQ = {};
    for (i = 0; i < projects.length; i++) {
      q = projects[i].quarter;
      if (!q) continue;
      var pn = projects[i].language || 'Unset';
      if (!langByQ[q]) langByQ[q] = {};
      langByQ[q][pn] = (langByQ[q][pn] || 0) + 1;
    }

    var maxRepos = 1, maxQCommits = 1;
    for (i = 0; i < order.length; i++) {
      maxRepos = Math.max(maxRepos, repoByQ[order[i]] || 0);
      maxQCommits = Math.max(maxQCommits, commitByQ[order[i]] || 0);
    }

    var quarters = [], qIndexOf = {};
    for (i = 0; i < order.length; i++) {
      q = order[i];
      var qf = quarterFirstMonth(q);
      // does the commit record overlap this quarter at all?
      var has = months.length > 0 && (qf + 2) >= firstMonth && qf <= lastMonth;
      var commits = has ? (commitByQ[q] || 0) : 0;

      var best = 'Unset', bestN = -1, tal = langByQ[q] || {};
      for (var nm in tal) {
        if (tal.hasOwnProperty(nm) && tal[nm] > bestN) { bestN = tal[nm]; best = nm || 'Unset'; }
      }

      qIndexOf[q] = i;
      quarters.push({
        quarter: q,
        index: i,
        repos: repoByQ[q] || 0,
        commits: commits,
        hasRecord: has,
        // a quarter only half inside the window: the count is real but partial
        fullRecord: months.length > 0 && qf >= firstMonth && (qf + 2) <= lastMonth,
        language: best,
        tint: tintFor(best),
        reposNorm: Math.sqrt((repoByQ[q] || 0) / maxRepos),
        commitsNorm: has ? Math.sqrt(commits / maxQCommits) : 0,
        seed: hash(i, 3.1, 7.7)
      });
    }

    /* --- projects -> the shard swarm ------------------------------------ */
    var sorted = [];
    for (i = 0; i < projects.length; i++) {
      var tms = Date.parse(projects[i].created || '');
      sorted.push({ p: projects[i], t: isFinite(tms) ? tms : 0 });
    }
    sorted.sort(function (a, b) { return a.t - b.t; });

    var maxDisk = 1;
    for (i = 0; i < sorted.length; i++) {
      maxDisk = Math.max(maxDisk, sorted[i].p.diskKB || 0);
    }

    var shards = [];
    var nP = sorted.length;
    for (i = 0; i < nP; i++) {
      var pr = sorted[i].p;
      var recency = nP > 1 ? i / (nP - 1) : 1;      // 0 = oldest repo, 1 = newest
      var h1 = hash(i, 1.7, 9.3), h2 = hash(i, 5.5, 2.1), h3 = hash(i, 8.8, 4.4);
      var radius = lerp(2.02, 1.20, recency) + (h1 - 0.5) * 0.10;
      shards.push({
        radius: radius,
        // Kepler-flavoured: the recent work orbits tight and quick
        speed: (0.030 + 0.185 / radius) * (0.85 + 0.30 * h2),
        phase: h1 * TAU,
        incl: (h3 - 0.5) * 1.05,
        size: 0.013 + 0.030 * Math.pow((pr.diskKB || 0) / maxDisk, 0.30),
        tint: tintFor(pr.language || 'Unset'),
        seed: h2
      });
    }

    return {
      langs: langs,
      months: months,
      quarters: quarters,
      qIndexOf: qIndexOf,
      shards: shards,
      firstMonth: firstMonth,
      lastMonth: lastMonth,
      totals: {
        repos: projects.length,
        commits: totalCommits,
        maxMonth: maxMonth,
        // share of the whole commit record that landed in its single busiest
        // month. Drives how hard the core pulses.
        peakShare: totalCommits > 0 ? maxMonth / totalCommits : 0,
        // how much of the recorded window was actually worked in
        liveShare: months.length > 0 ? liveMonths / months.length : 0
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. MODEL -> GEOMETRY
   *    One merged static buffer per layer. Everything moves in a shader.
   * ------------------------------------------------------------------ */

  var INNER = 0.92;       // radius the blades hang from
  var OUTER_HOOP = 1.60;  // structural containment hoop
  var GEM_R = 0.30;
  var RIBBON_R = 0.70;

  function faceNormal(a, b, c) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  /* ---- 2a. the crystal: solid gem + shattered language plates --------- */

  function buildCrystal(model) {
    var langs = model.langs;
    var pos = [], nrm = [], tint = [], face = [];

    function pushTri(a, b, c, t, f) {
      var n = faceNormal(a, b, c);
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      var k;
      for (k = 0; k < 3; k++) {
        nrm.push(n[0], n[1], n[2]);
        tint.push(t[0], t[1], t[2]);
        face.push(f[0], f[1], f[2]);
      }
    }

    // which language lobe owns a direction, and how far it pushes
    function lobe(d) {
      var bi = 0, ba = 0, i;
      for (i = 0; i < langs.length; i++) {
        var L = langs[i];
        var dp = d[0] * L.dir[0] + d[1] * L.dir[1] + d[2] * L.dir[2];
        if (dp <= 0) continue;
        var a = L.amp * Math.pow(dp, 6.0);
        if (a > ba) { ba = a; bi = i; }
      }
      return { amp: ba, idx: bi };
    }

    function facesOf(geo) {
      var g = geo.index ? geo.toNonIndexed() : geo;
      var p = g.getAttribute('position').array;
      var out = [], i;
      for (i = 0; i < p.length; i += 9) {
        out.push([
          [p[i], p[i + 1], p[i + 2]],
          [p[i + 3], p[i + 4], p[i + 5]],
          [p[i + 6], p[i + 7], p[i + 8]]
        ]);
      }
      try { if (g !== geo) g.dispose(); } catch (e) { }
      return out;
    }

    // --- the gem: 20 flat faces, tinted by whichever lobe leans over them
    var gemSrc = new THREE.IcosahedronGeometry(1, 0);
    var gemFaces = facesOf(gemSrc);
    try { gemSrc.dispose(); } catch (e) { }
    var i, k;
    for (i = 0; i < gemFaces.length; i++) {
      var gf = gemFaces[i];
      var gc = [
        (gf[0][0] + gf[1][0] + gf[2][0]) / 3,
        (gf[0][1] + gf[1][1] + gf[2][1]) / 3,
        (gf[0][2] + gf[1][2] + gf[2][2]) / 3
      ];
      var gl = Math.sqrt(gc[0] * gc[0] + gc[1] * gc[1] + gc[2] * gc[2]) || 1;
      var gd = [gc[0] / gl, gc[1] / gl, gc[2] / gl];
      var gw = lobe(gd);
      var gt = langs[gw.idx].tint;
      pushTri(
        [gf[0][0] * GEM_R, gf[0][1] * GEM_R, gf[0][2] * GEM_R],
        [gf[1][0] * GEM_R, gf[1][1] * GEM_R, gf[1][2] * GEM_R],
        [gf[2][0] * GEM_R, gf[2][1] * GEM_R, gf[2][2] * GEM_R],
        gt, [gw.amp, hash(i, 2.2, 6.1), 1.0]
      );
    }

    // --- the plates: 80 faces, each one flown out along its own lobe and
    //     shrunk toward its own centre, so the shell cracks apart and the
    //     charge inside leaks between the plates.
    var shellSrc = new THREE.IcosahedronGeometry(1, 1);
    var shellFaces = facesOf(shellSrc);
    try { shellSrc.dispose(); } catch (e) { }
    var plateCount = shellFaces.length;
    for (i = 0; i < plateCount; i++) {
      var sf = shellFaces[i];
      var cx = (sf[0][0] + sf[1][0] + sf[2][0]) / 3;
      var cy = (sf[0][1] + sf[1][1] + sf[2][1]) / 3;
      var cz = (sf[0][2] + sf[1][2] + sf[2][2]) / 3;
      var cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
      var dir = [cx / cl, cy / cl, cz / cl];
      var w = lobe(dir);
      var R = 0.46 + 0.34 * w.amp;
      var ctr = [dir[0] * R, dir[1] * R, dir[2] * R];
      var shrink = 0.82 - 0.10 * w.amp;   // fatter lobes crack wider apart
      var v = [];
      for (k = 0; k < 3; k++) {
        var vl = Math.sqrt(
          sf[k][0] * sf[k][0] + sf[k][1] * sf[k][1] + sf[k][2] * sf[k][2]
        ) || 1;
        var sv = [sf[k][0] / vl * R, sf[k][1] / vl * R, sf[k][2] / vl * R];
        v.push([
          ctr[0] + (sv[0] - ctr[0]) * shrink,
          ctr[1] + (sv[1] - ctr[1]) * shrink,
          ctr[2] + (sv[2] - ctr[2]) * shrink
        ]);
      }
      pushTri(v[0], v[1], v[2], langs[w.idx].tint,
        [w.amp, hash(i, 9.7, 1.3), 0.0]);
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(tint), 3));
    g.setAttribute('aFace', new THREE.BufferAttribute(new Float32Array(face), 3));
    return { geo: g, triangles: pos.length / 9 };
  }

  /* ---- 2b. the blade shell: solid blades + the cage they all live in --- */

  function bladeAngle(i, n) { return (i / Math.max(n, 1)) * TAU; }

  function bladeLength(Q) { return 0.16 + 0.46 * Q.reposNorm; }

  function buildBlades(model) {
    var qs = model.quarters, n = qs.length;
    var pos = [], nrm = [], ab = [], as = [], at = [];
    var lp = [], ln = [], lb = [], ls = [], lt = [];
    var i;

    function pushTri(a, b, c, Q, ang, isStruct) {
      var nf = faceNormal(a, b, c);
      // point the normal away from the blade centre line
      var mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      var cen = [bladeLength(Q) * 0.5, 0, 0];
      if ((mid[0] - cen[0]) * nf[0] + (mid[1] - cen[1]) * nf[1] + (mid[2] - cen[2]) * nf[2] < 0) {
        nf = [-nf[0], -nf[1], -nf[2]];
      }
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      var v;
      for (v = 0; v < 3; v++) {
        nrm.push(nf[0], nf[1], nf[2]);
        ab.push(ang, Q.reposNorm, Q.commitsNorm, Q.hasRecord ? 1 : 0);
        as.push(Q.index / Math.max(n - 1, 1), Q.seed, isStruct ? 1 : 0);
        at.push(Q.tint[0], Q.tint[1], Q.tint[2]);
      }
    }

    function pushLine(a, b, Q, ang, isStruct) {
      lp.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      var v;
      for (v = 0; v < 2; v++) {
        ln.push(0, 1, 0);
        lb.push(ang, Q.reposNorm, Q.commitsNorm, Q.hasRecord ? 1 : 0);
        ls.push(Q.index / Math.max(n - 1, 1), Q.seed, isStruct ? 1 : 0);
        lt.push(Q.tint[0], Q.tint[1], Q.tint[2]);
      }
    }

    for (i = 0; i < n; i++) {
      var Q = qs[i];
      var ang = bladeAngle(i, n);
      var len = bladeLength(Q);
      var h0 = 0.115, t0 = 0.030;
      var h1 = h0 * 0.52, t1 = t0 * 0.42;

      // blade-local space: x runs outward along the radius, y is up,
      // z is tangential. The shader pitches it about x and swings it to ang.
      var A = [0, -h0, -t0], B = [0, h0, -t0], C = [0, h0, t0], D = [0, -h0, t0];
      var E = [len, -h1, -t1], F = [len, h1, -t1], G = [len, h1, t1], H = [len, -h1, t1];

      // The cage is always drawn: a repo count exists for every quarter.
      pushLine(A, B, Q, ang, false); pushLine(B, C, Q, ang, false);
      pushLine(C, D, Q, ang, false); pushLine(D, A, Q, ang, false);
      pushLine(E, F, Q, ang, false); pushLine(F, G, Q, ang, false);
      pushLine(G, H, Q, ang, false); pushLine(H, E, Q, ang, false);
      pushLine(A, E, Q, ang, false); pushLine(B, F, Q, ang, false);
      pushLine(C, G, Q, ang, false); pushLine(D, H, Q, ang, false);

      // The solid blade is only drawn where the commit record reaches. The
      // 13 quarters before 2024-11 stay open cage, and you see through them.
      if (!Q.hasRecord) continue;
      pushTri(E, F, G, Q, ang, false); pushTri(E, G, H, Q, ang, false);   // outer
      pushTri(A, D, C, Q, ang, false); pushTri(A, C, B, Q, ang, false);   // inner
      pushTri(B, F, G, Q, ang, false); pushTri(B, G, C, Q, ang, false);   // top
      pushTri(A, D, H, Q, ang, false); pushTri(A, H, E, Q, ang, false);   // bottom
      pushTri(A, B, F, Q, ang, false); pushTri(A, F, E, Q, ang, false);   // flank
      pushTri(D, H, G, Q, ang, false); pushTri(D, G, C, Q, ang, false);   // flank
    }

    // --- containment hoops. STRUCTURE, not data — this is the frame the
    //     blades hang on, the way the monument plinth is not a measurement.
    // A hoop is authored straight in ring-local world coordinates, so it is
    // flagged structural (aS.z = 1): no pitch, no radial offset, no swing.
    var hoopQ = {
      index: 0, reposNorm: 0, commitsNorm: 0, hasRecord: 0, seed: 0.5, tint: PAL.cyan
    };
    var segs = 84;
    var radii = [INNER, OUTER_HOOP];
    var hr, hs;
    for (hr = 0; hr < radii.length; hr++) {
      var R = radii[hr];
      var hy = hr === 0 ? 0.0 : -0.02;
      for (hs = 0; hs < segs; hs++) {
        var a0 = (hs / segs) * TAU, a1 = ((hs + 1) / segs) * TAU;
        pushLine(
          [Math.cos(a0) * R, hy, Math.sin(a0) * R],
          [Math.cos(a1) * R, hy, Math.sin(a1) * R],
          hoopQ, 0, true
        );
      }
    }

    var solid = new THREE.BufferGeometry();
    solid.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    solid.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    solid.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(ab), 4));
    solid.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(as), 3));
    solid.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(at), 3));

    var cage = new THREE.BufferGeometry();
    cage.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
    cage.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(ln), 3));
    cage.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(lb), 4));
    cage.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(ls), 3));
    cage.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(lt), 3));

    return { solid: solid, cage: cage, triangles: pos.length / 9 };
  }

  /* ---- 2c. filaments: one strand per unit of commit volume ------------- */

  function buildFilaments(model) {
    var qs = model.quarters, n = qs.length;
    var pos = [], af = [], at = [];
    var i, s, k;
    var strandTotal = 0;

    for (i = 0; i < n; i++) {
      var Q = qs[i];
      // No record, or a recorded zero: no strand. Zero is the honest count.
      if (!Q.hasRecord || Q.commits <= 0) continue;
      var strands = 1 + Math.round(13 * Q.commitsNorm);
      var ang = bladeAngle(i, n);
      strandTotal += strands;

      for (s = 0; s < strands; s++) {
        var sd = hash(i * 31 + s, 4.4, 8.8);
        var sd2 = hash(i * 17 + s, 1.1, 5.5);
        var bow = (sd - 0.5) * 0.55;
        var y0 = (sd2 - 0.5) * 0.34;
        var y1 = (hash(i + s, 6.6, 3.3) - 0.5) * 0.16;
        var segs = 6;
        var prev = null;
        for (k = 0; k <= segs; k++) {
          var t = k / segs;
          var rr = lerp(GEM_R * 1.12, INNER, t);
          var aa = ang + Math.sin(Math.PI * t) * bow + (1 - t) * (sd - 0.5) * 1.9;
          var yy = lerp(y0, y1, t) + Math.sin(Math.PI * t) * (sd2 - 0.5) * 0.20;
          var pt = [Math.cos(aa) * rr, yy, Math.sin(aa) * rr];
          if (prev) {
            pos.push(prev[0], prev[1], prev[2], pt[0], pt[1], pt[2]);
            af.push((k - 1) / segs, Q.commitsNorm, sd, i / Math.max(n - 1, 1));
            af.push(k / segs, Q.commitsNorm, sd, i / Math.max(n - 1, 1));
            at.push(Q.tint[0], Q.tint[1], Q.tint[2]);
            at.push(Q.tint[0], Q.tint[1], Q.tint[2]);
          }
          prev = pt;
        }
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aFil', new THREE.BufferAttribute(new Float32Array(af), 4));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(at), 3));
    return { geo: g, strands: strandTotal, segments: pos.length / 6 };
  }

  /* ---- 2d. the month ribbon: an arc, only as long as the record -------- */

  function buildRibbon(model) {
    var months = model.months, qs = model.quarters, n = qs.length;
    var pos = [], nrm = [], am = [];
    if (!months.length) {
      var empty = new THREE.BufferGeometry();
      empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      empty.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
      empty.setAttribute('aM', new THREE.BufferAttribute(new Float32Array(0), 3));
      return { geo: empty, triangles: 0, span: 0 };
    }

    // The ribbon sits under exactly the blades whose quarters the commit
    // record covers. Everything before 2024-11 gets no ribbon at all.
    var qa = model.qIndexOf[months[0].quarter];
    var qb = model.qIndexOf[months[months.length - 1].quarter];
    if (qa === undefined) qa = 0;
    if (qb === undefined) qb = n - 1;
    var a0 = bladeAngle(qa, n);
    var a1 = bladeAngle(qb, n) + (1 / Math.max(n, 1)) * TAU;
    if (a1 <= a0) a1 = a0 + TAU * 0.25;

    var m, k, sub = 3;
    var nm = months.length;
    for (m = 0; m < nm; m++) {
      var M = months[m];
      var h = 0.012 + 0.085 * M.norm;
      var ma = lerp(a0, a1, m / nm);
      var mb = lerp(a0, a1, (m + 1) / nm);
      for (k = 0; k < sub; k++) {
        var s0 = lerp(ma, mb, k / sub), s1 = lerp(ma, mb, (k + 1) / sub);
        var t0 = (m + k / sub) / nm, t1 = (m + (k + 1) / sub) / nm;
        var p0 = [Math.cos(s0) * RIBBON_R, -h, Math.sin(s0) * RIBBON_R];
        var p1 = [Math.cos(s1) * RIBBON_R, -h, Math.sin(s1) * RIBBON_R];
        var p2 = [Math.cos(s1) * RIBBON_R, h, Math.sin(s1) * RIBBON_R];
        var p3 = [Math.cos(s0) * RIBBON_R, h, Math.sin(s0) * RIBBON_R];
        pushQuad(p0, p1, p2, p3, t0, t1, M);
      }
    }

    function pushQuad(p0, p1, p2, p3, t0, t1, M) {
      var tri = [[p0, p1, p2, t0, t1, t1], [p0, p2, p3, t0, t1, t0]];
      var i, j;
      for (i = 0; i < 2; i++) {
        var T = tri[i];
        var nf = faceNormal(T[0], T[1], T[2]);
        var ts = [T[3], T[4], T[5]];
        for (j = 0; j < 3; j++) {
          pos.push(T[j][0], T[j][1], T[j][2]);
          nrm.push(nf[0], nf[1], nf[2]);
          am.push(ts[j], M.norm, M.zero ? 1 : 0);
        }
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('aM', new THREE.BufferAttribute(new Float32Array(am), 3));
    return { geo: g, triangles: pos.length / 9, span: (a1 - a0) / TAU };
  }

  /* ---- 2e. the shard swarm: one tetrahedron per repository ------------- */

  var TETRA = [
    [0.00, 0.92, 0.00],
    [0.87, -0.31, 0.50],
    [-0.87, -0.31, 0.50],
    [0.00, -0.31, -1.00]
  ];
  var TETRA_F = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];

  function buildShards(model) {
    var sh = model.shards;
    var pos = [], orb = [], tint = [], seed = [];
    var i, f, k;
    for (i = 0; i < sh.length; i++) {
      var S = sh[i];
      for (f = 0; f < TETRA_F.length; f++) {
        for (k = 0; k < 3; k++) {
          var v = TETRA[TETRA_F[f][k]];
          pos.push(v[0] * S.size, v[1] * S.size, v[2] * S.size);
          orb.push(S.radius, S.speed, S.phase, S.incl);
          tint.push(S.tint[0], S.tint[1], S.tint[2]);
          seed.push(S.seed);
        }
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aOrb', new THREE.BufferAttribute(new Float32Array(orb), 4));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(tint), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seed), 1));
    return { geo: g, triangles: pos.length / 9 };
  }

  /* ------------------------------------------------------------------ *
   * 3. SHADERS
   * ------------------------------------------------------------------ */

  var ROT2 = 'mat2 rot2(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }';

  var CRYSTAL_VERT = [
    'attribute vec3 aTint;',
    'attribute vec3 aFace;',   // x lobe amplitude, y seed, z 1 = the gem
    'uniform float uTime;',
    'uniform float uPulse;',
    'uniform float uGrow;',
    'varying vec3 vN;',
    'varying vec3 vVP;',
    'varying vec3 vTint;',
    'varying float vAmp;',
    'varying float vSeed;',
    'varying float vGem;',
    'void main(){',
    '  vec3 p = position;',
    // the plates ride out on the charge; the gem just swells
    '  float b = 1.0 + uPulse * (0.030 + 0.090 * aFace.x)',
    '            * (0.45 + 0.55 * sin(uTime * 1.55 + aFace.y * 6.2831));',
    '  if (aFace.z > 0.5) b = 1.0 + uPulse * 0.11 * sin(uTime * 2.10);',
    '  p *= b * uGrow;',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vVP = mv.xyz;',
    '  vTint = aTint; vAmp = aFace.x; vSeed = aFace.y; vGem = aFace.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var CRYSTAL_FRAG = [
    'uniform float uTime;',
    'uniform float uPulse;',
    'varying vec3 vN;',
    'varying vec3 vVP;',
    'varying vec3 vTint;',
    'varying float vAmp;',
    'varying float vSeed;',
    'varying float vGem;',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(-vVP);',
    '  if (!gl_FrontFacing) N = -N;',
    '  float key = max(dot(N, normalize(vec3(0.35, 0.75, 0.55))), 0.0);',
    '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);',
    '  vec3 col = vTint * (0.07 + 0.34 * pow(key, 0.85));',
    '  col += vec3(0.000, 0.898, 1.000) * fres * (0.34 + 0.60 * vGem);',
    // internal charge: the taller the language lobe, the hotter the plate
    '  float glow = (0.16 + 0.90 * vAmp) * (0.55 + 0.45 * sin(uTime * 1.4 + vSeed * 6.2831));',
    '  col += mix(vTint, vec3(1.000, 0.176, 0.459), 0.35) * glow * (0.26 + 0.85 * uPulse);',
    '  col += vec3(1.000, 0.090, 0.267) * vGem * (0.45 + 0.55 * uPulse);',
    '  col = col / (col + vec3(0.85)) * 1.62;',
    '  col = pow(max(col, 0.0), vec3(1.05));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // shared placement for the blades and their cage: pitch about the radial
  // axis, then swing to the quarter angle, then grow in oldest-first.
  var BLADE_XF = [
    'attribute vec4 aB;',   // x angle, y reposNorm, z commitsNorm, w hasRecord
    'attribute vec3 aS;',   // x idxNorm, y seed, z 1 = structural hoop
    'attribute vec3 aTint;',
    'uniform float uTime;',
    'uniform float uGrow;',
    'uniform float uPulse;',
    'uniform float uInner;',
    'varying vec3 vN;',
    'varying vec3 vVP;',
    'varying vec3 vTint;',
    'varying float vC;',
    'varying float vR;',
    'varying float vRec;',
    'varying float vIdx;',
    'varying float vSeed;',
    'varying float vX;',
    'varying float vStruct;',
    ROT2,
    'vec3 place(vec3 p, inout vec3 n){',
    '  float ang = aB.x;',
    '  vX = 0.0;',
    '  if (aS.z < 0.5) {',
    // the iris: every blade pitches, and a wave runs round the ring
    '    float wave = sin(uTime * 0.85 - aS.x * 12.5664);',
    '    float pitch = 0.34 + 0.30 * aB.z + (0.09 + 0.26 * aB.z) * wave * uPulse;',
    '    p.yz = rot2(pitch) * p.yz;',
    '    n.yz = rot2(pitch) * n.yz;',
    '    vX = p.x;',
    '    p.x += uInner;',
    '  }',
    '  float ca = cos(ang), sa = sin(ang);',
    '  vec3 w = vec3(p.x * ca - p.z * sa, p.y, p.x * sa + p.z * ca);',
    '  n = vec3(n.x * ca - n.z * sa, n.y, n.x * sa + n.z * ca);',
    '  float g = clamp(uGrow * 1.75 - aS.x * 0.75, 0.0, 1.0);',
    '  g = g * g * (3.0 - 2.0 * g);',
    '  w *= g;',
    '  vTint = aTint; vC = aB.z; vR = aB.y; vRec = aB.w;',
    '  vIdx = aS.x; vSeed = aS.y; vStruct = aS.z;',
    '  return w;',
    '}'
  ].join('\n');

  var BLADE_VERT = BLADE_XF + [
    '',
    'void main(){',
    '  vec3 n = normal;',
    '  vec3 p = place(position, n);',
    '  vN = normalize(normalMatrix * n);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vVP = mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BLADE_FRAG = [
    'uniform float uTime;',
    'uniform float uPulse;',
    'varying vec3 vN;',
    'varying vec3 vVP;',
    'varying vec3 vTint;',
    'varying float vC;',
    'varying float vR;',
    'varying float vRec;',
    'varying float vIdx;',
    'varying float vSeed;',
    'varying float vX;',
    'varying float vStruct;',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(-vVP);',
    '  if (!gl_FrontFacing) N = -N;',
    '  float key = max(dot(N, normalize(vec3(-0.35, 0.62, 0.70))), 0.0);',
    '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);',
    // dark alloy body. The blade is structure; the light is the record.
    '  vec3 col = mix(vec3(0.024, 0.028, 0.048), vec3(0.105, 0.115, 0.170), key);',
    '  col += vec3(0.239, 0.482, 1.000) * fres * 0.22;',
    // commitsNorm is exactly 0 for a recorded zero, so a silent quarter simply
    // stays dark alloy. There is no floor here and no invented minimum.
    '  float packet = 0.55 + 0.45 * sin(uTime * 2.2 - vX * 6.5 + vIdx * 9.0);',
    '  col += mix(vTint, vec3(1.000, 0.090, 0.267), 0.30) * vC * (0.50 + 1.30 * uPulse) * packet;',
    '  col += vec3(1.000, 0.176, 0.459) * pow(vC, 1.6) * fres * 1.05;',
    '  col = col / (col + vec3(0.92)) * 1.55;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var CAGE_VERT = BLADE_XF + [
    '',
    'void main(){',
    '  vec3 n = normal;',
    '  vec3 p = place(position, n);',
    '  vN = n;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vVP = mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var CAGE_FRAG = [
    'uniform float uPulse;',
    'varying vec3 vTint;',
    'varying float vC;',
    'varying float vR;',
    'varying float vRec;',
    'varying float vIdx;',
    'varying float vStruct;',
    'void main(){',
    // The cage is what the record definitely knows: a repo count per quarter.
    // It is drawn cold where there is no commit history to warm it.
    '  vec3 cold = vec3(0.961, 0.961, 0.969) * 0.55;',
    '  vec3 warm = mix(vTint, vec3(1.000, 0.176, 0.459), 0.40);',
    '  vec3 col = mix(cold, warm, vRec * (0.30 + 0.70 * vC));',
    '  float a = 0.050 + 0.115 * vR;',
    '  a += vRec * (0.04 + 0.42 * vC) * (0.60 + 0.40 * uPulse);',
    '  if (vStruct > 0.5) { col = vec3(0.000, 0.898, 1.000); a = 0.075; }',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  var FIL_VERT = [
    'attribute vec4 aFil;',   // x tAlong, y commitsNorm, z seed, w idxNorm
    'attribute vec3 aTint;',
    'uniform float uTime;',
    'uniform float uGrow;',
    'uniform float uPulse;',
    'varying float vT;',
    'varying float vC;',
    'varying float vSeed;',
    'varying vec3 vTint;',
    'void main(){',
    '  vec3 p = position * (1.0 + 0.022 * uPulse * sin(uTime * 1.9 + aFil.z * 6.2831));',
    '  p *= clamp(uGrow * 1.6 - 0.45, 0.0, 1.0);',
    '  vT = aFil.x; vC = aFil.y; vSeed = aFil.z; vTint = aTint;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var FIL_FRAG = [
    'uniform float uTime;',
    'uniform float uPulse;',
    'varying float vT;',
    'varying float vC;',
    'varying float vSeed;',
    'varying vec3 vTint;',
    'void main(){',
    // a charge packet runs the strand outward, faster on the busy quarters
    '  float k = fract(vT - uTime * (0.20 + 0.55 * vC) + vSeed);',
    '  float packet = pow(1.0 - k, 5.0);',
    '  vec3 col = mix(vec3(0.000, 0.898, 1.000), vec3(1.000, 0.176, 0.459), vC);',
    '  col = mix(col, vTint, 0.22);',
    '  float a = (0.045 + 0.26 * vC) * (0.28 + 1.05 * packet) * (0.65 + 0.35 * uPulse);',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  var RIBBON_VERT = [
    'attribute vec3 aM;',   // x tAlong, y commitsNorm, z 1 = a recorded zero
    'uniform float uGrow;',
    'varying float vT;',
    'varying float vM;',
    'varying float vZero;',
    'void main(){',
    '  vec3 p = position * clamp(uGrow * 1.4 - 0.30, 0.0, 1.0);',
    '  vT = aM.x; vM = aM.y; vZero = aM.z;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var RIBBON_FRAG = [
    'uniform float uTime;',
    'uniform float uPulse;',
    'varying float vT;',
    'varying float vM;',
    'varying float vZero;',
    'void main(){',
    '  float travel = fract(vT - uTime * 0.115);',
    '  float sweep = pow(1.0 - abs(travel - 0.5) * 2.0, 9.0);',
    '  vec3 hot = mix(vec3(0.000, 0.898, 1.000), vec3(1.000, 0.090, 0.267), vM);',
    '  vec3 col = hot * (0.22 + 1.05 * vM);',
    '  col += vec3(1.000, 0.176, 0.459) * sweep * (0.20 + 0.85 * vM);',
    '  float a = 0.10 + 0.78 * vM * (0.70 + 0.30 * uPulse);',
    // a month that recorded zero is DRAWN, and drawn dark. It is a real
    // measurement of nothing, which is not the same as no measurement.
    '  if (vZero > 0.5) { col = vec3(0.085, 0.115, 0.200); a = 0.34; }',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  var SHARD_VERT = [
    'attribute vec4 aOrb;',   // x radius, y angular speed, z phase, w inclination
    'attribute vec3 aTint;',
    'attribute float aSeed;',
    'uniform float uTime;',
    'uniform float uGrow;',
    'uniform float uPulse;',
    'varying vec3 vTint;',
    'varying float vSeed;',
    'varying float vR;',
    ROT2,
    'void main(){',
    '  float a = aOrb.z + uTime * aOrb.y;',
    '  float R = aOrb.x * (1.0 + 0.020 * uPulse * sin(uTime * 1.3 + aSeed * 6.2831));',
    '  vec3 c = vec3(cos(a) * R, 0.0, sin(a) * R);',
    '  c.yz = rot2(aOrb.w) * c.yz;',
    '  vec3 p = position;',
    '  float t2 = uTime * (0.35 + aSeed * 0.90);',
    '  p.xy = rot2(t2) * p.xy;',
    '  p.yz = rot2(t2 * 0.70) * p.yz;',
    '  p += c;',
    '  p *= clamp(uGrow * 1.45 - 0.35, 0.0, 1.0);',
    '  vTint = aTint; vSeed = aSeed; vR = aOrb.x;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var SHARD_FRAG = [
    'uniform float uTime;',
    'varying vec3 vTint;',
    'varying float vSeed;',
    'varying float vR;',
    'void main(){',
    '  vec3 col = mix(vTint, vec3(0.961, 0.961, 0.969), 0.18);',
    // the newer repositories orbit closer in, and read brighter for it
    '  float near = clamp((2.05 - vR) / 0.85, 0.0, 1.0);',
    '  float tw = 0.70 + 0.30 * sin(uTime * 1.7 + vSeed * 6.2831);',
    '  float a = (0.16 + 0.52 * near) * tw;',
    '  gl_FragColor = vec4(col * (0.55 + 0.75 * near), a);',
    '}'
  ].join('\n');

  var GLOW_VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  ].join('\n');

  var GLOW_FRAG = [
    'uniform float uTime;',
    'uniform float uPulse;',
    'uniform float uGrow;',
    'uniform vec3 uColA;',
    'uniform vec3 uColB;',
    'uniform float uGain;',
    'uniform float uSquash;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 d = vUv - 0.5;',
    '  d.x *= uSquash;',
    '  float r = length(d) * 2.0;',
    '  float a = smoothstep(1.0, 0.0, r);',
    '  a *= a;',
    '  vec3 col = mix(uColB, uColA, a);',
    '  gl_FragColor = vec4(col, a * uGain * (0.62 + 0.38 * uPulse) * uGrow);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ *
   * 4. THE INSTANCE
   * ------------------------------------------------------------------ */

  var S = null;   // the single live scene, or null

  // destroy() deliberately kills the WebGL context so the GPU gets the memory
  // back on a world switch. A canvas element that has had its context killed
  // can never hand out another one, so if mount is called again on that same
  // element we put an identical fresh canvas in its place. The page keeps its
  // id, its classes and its position; only the dead node goes.
  var DEAD = (typeof WeakSet === 'function') ? new WeakSet() : null;

  function reviveCanvas(canvas) {
    if (!DEAD || !canvas || !DEAD.has(canvas)) return canvas;
    var parent = canvas.parentNode;
    if (!parent || !canvas.cloneNode) return canvas;
    try {
      var fresh = canvas.cloneNode(false);
      parent.replaceChild(fresh, canvas);
      return fresh;
    } catch (e) { return canvas; }
  }

  function teardown() {
    if (!S) return;
    var s = S;
    S = null;

    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }

    if (s.onVis) document.removeEventListener('visibilitychange', s.onVis);
    if (s.onResize) global.removeEventListener('resize', s.onResize);
    if (s.ro) { try { s.ro.disconnect(); } catch (e) { } }
    if (s.io) { try { s.io.disconnect(); } catch (e) { } }
    if (s.canvas && s.onPointer) {
      s.canvas.removeEventListener('pointermove', s.onPointer);
      s.canvas.removeEventListener('pointerleave', s.onLeave);
    }

    var i;
    for (i = 0; i < s.geoms.length; i++) { try { s.geoms[i].dispose(); } catch (e) { } }
    for (i = 0; i < s.mats.length; i++) { try { s.mats[i].dispose(); } catch (e) { } }

    if (s.shell) { while (s.shell.children.length) s.shell.remove(s.shell.children[0]); }
    if (s.root) { while (s.root.children.length) s.root.remove(s.root.children[0]); }
    if (s.scene) { while (s.scene.children.length) s.scene.remove(s.scene.children[0]); }

    if (s.renderer) {
      try { s.renderer.dispose(); } catch (e) { }
      try {
        var ctx = s.renderer.getContext();
        var lose = ctx && ctx.getExtension && ctx.getExtension('WEBGL_lose_context');
        if (lose) {
          lose.loseContext();
          if (DEAD && s.canvas) DEAD.add(s.canvas);
        }
      } catch (e) { }
    }

    s.geoms = []; s.mats = [];
    s.scene = null; s.renderer = null; s.camera = null;
    s.root = null; s.shell = null; s.crystal = null; s.shards = null;
    s.glow = null; s.halo = null; s.canvas = null; s.model = null;
  }

  function fitCamera(s) {
    var w = s.width, h = s.height;
    var aspect = w / Math.max(h, 1);
    s.camera.aspect = aspect;

    var R = s.viewRadius;
    var fovR = s.camera.fov * Math.PI / 180;
    var distV = R / Math.tan(fovR * 0.5);
    var distH = R / (Math.tan(fovR * 0.5) * Math.max(aspect, 0.0001));
    var dist = Math.max(distV, distH) * 1.02;

    // The core hangs. The camera looks slightly down onto the ring so the
    // blade shell reads as a disc and never as a stack.
    var dy = 0.34, dz = 1.0;
    var dl = Math.sqrt(dy * dy + dz * dz);
    s.camera.position.set(0, dist * dy / dl, dist * dz / dl);
    s.camera.lookAt(0, 0, 0);
    s.camera.updateProjectionMatrix();
  }

  function resize(s) {
    if (!s.renderer || !s.canvas) return;
    var el = s.canvas;
    var w = el.clientWidth || el.width || 1;
    var h = el.clientHeight || el.height || 1;
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    if (w === s.width && h === s.height) return;
    s.width = w; s.height = h;
    s.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    s.renderer.setSize(w, h, false);
    fitCamera(s);
    if (s.still) renderOnce(s);
  }

  function pose(s, t) {
    // The whole thing floats. Nothing here is on a plinth.
    s.root.position.y = Math.sin(t * 0.62) * 0.048;
    s.root.rotation.x = -0.13 + Math.sin(t * 0.31) * 0.038;
    s.root.rotation.z = Math.sin(t * 0.23) * 0.022 + s.tiltZ;
    s.root.rotation.y = s.tiltY;

    // the heart turns one way, fast, off-axis...
    s.crystal.rotation.y = t * 0.42;
    s.crystal.rotation.x = 0.52 + Math.sin(t * 0.27) * 0.13;
    s.crystal.rotation.z = t * 0.17;

    // ...and the shell turns the other way, slow. That counter-rotation is
    // the whole reason this does not read as a spinning ornament.
    s.shell.rotation.y = -t * 0.165;
    s.shell.rotation.x = Math.sin(t * 0.19) * 0.03;

    if (s.glow) s.glow.lookAt(s.camera.position);
    if (s.halo) s.halo.lookAt(s.camera.position);
  }

  function applyUniforms(s, t) {
    var i, u;
    for (i = 0; i < s.uSets.length; i++) {
      u = s.uSets[i];
      if (u.uTime) u.uTime.value = t;
      if (u.uPulse) u.uPulse.value = s.pulse;
      if (u.uGrow) u.uGrow.value = s.grow;
    }
  }

  function computePulse(s, t) {
    var wave = 0.5 + 0.5 * Math.sin(t * s.pulseRate);
    return clamp(0.16 + s.pulseAmp * wave, 0, 1.4);
  }

  function renderOnce(s) {
    if (!s.renderer) return;
    s.pulse = computePulse(s, s.clockT);
    pose(s, s.clockT);
    applyUniforms(s, s.clockT);
    s.renderer.render(s.scene, s.camera);
  }

  function frame(now) {
    if (!S) return;
    var s = S;
    s.raf = requestAnimationFrame(frame);

    // pause on a hidden tab or an off-screen canvas — the loop stays alive so
    // the object is instantly back when the page comes forward, but nothing
    // is drawn and the clock does not jump.
    if (document.hidden || !s.onScreen) { s.last = now; return; }

    var dt = s.last ? Math.min((now - s.last) / 1000, 0.05) : 0.016;
    s.last = now;
    s.clockT += dt;

    if (s.grow < 1) {
      s.growT = Math.min(s.growT + dt / 1.7, 1);
      s.grow = easeOutCubic(s.growT);
    }

    s.tiltY = lerp(s.tiltY, s.pTiltY, 1 - Math.pow(0.002, dt));
    s.tiltZ = lerp(s.tiltZ, s.pTiltZ, 1 - Math.pow(0.002, dt));

    s.pulse = computePulse(s, s.clockT);
    pose(s, s.clockT);
    applyUniforms(s, s.clockT);
    s.renderer.render(s.scene, s.camera);
  }

  /* ------------------------------------------------------------------ *
   * 5. PUBLIC API
   * ------------------------------------------------------------------ */

  function mount(canvas, raw, opts) {
    try {
      if (S) teardown();
      if (!canvas || !global.THREE) return;
      THREE = global.THREE;
      opts = opts || {};
      canvas = reviveCanvas(canvas);

      var model = readData(raw);
      if (!model) return;

      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance'
        });
        if (!renderer || !renderer.getContext()) return;
      } catch (e) { return; }

      renderer.setClearColor(0x080910, 0);
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));

      var still = !!(opts.still || opts.reducedMotion);

      var crystal = buildCrystal(model);
      var blades = buildBlades(model);
      var fil = buildFilaments(model);
      var ribbon = buildRibbon(model);
      var shards = buildShards(model);

      var uCrystal = { uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 } };
      var uBlade = {
        uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 },
        uInner: { value: INNER }
      };
      var uCage = {
        uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 },
        uInner: { value: INNER }
      };
      var uFil = { uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 } };
      var uRib = { uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 } };
      var uShard = { uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 } };
      var uGlow = {
        uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 },
        uColA: { value: new THREE.Vector3(PAL.crimson[0], PAL.crimson[1], PAL.crimson[2]) },
        uColB: { value: new THREE.Vector3(PAL.violet[0], PAL.violet[1], PAL.violet[2]) },
        uGain: { value: 0.42 }, uSquash: { value: 1.0 }
      };
      var uHalo = {
        uTime: { value: 0 }, uPulse: { value: 0 }, uGrow: { value: 0 },
        uColA: { value: new THREE.Vector3(PAL.blue[0], PAL.blue[1], PAL.blue[2]) },
        uColB: { value: new THREE.Vector3(PAL.ground[0], PAL.ground[1], PAL.ground[2]) },
        uGain: { value: 0.115 }, uSquash: { value: 1.15 }
      };

      var mCrystal = new THREE.ShaderMaterial({
        uniforms: uCrystal, vertexShader: CRYSTAL_VERT, fragmentShader: CRYSTAL_FRAG,
        side: THREE.DoubleSide
      });
      var mBlade = new THREE.ShaderMaterial({
        uniforms: uBlade, vertexShader: BLADE_VERT, fragmentShader: BLADE_FRAG,
        side: THREE.DoubleSide
      });
      var mCage = new THREE.ShaderMaterial({
        uniforms: uCage, vertexShader: CAGE_VERT, fragmentShader: CAGE_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      var mFil = new THREE.ShaderMaterial({
        uniforms: uFil, vertexShader: FIL_VERT, fragmentShader: FIL_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      var mRib = new THREE.ShaderMaterial({
        uniforms: uRib, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      var mShard = new THREE.ShaderMaterial({
        uniforms: uShard, vertexShader: SHARD_VERT, fragmentShader: SHARD_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      var mGlow = new THREE.ShaderMaterial({
        uniforms: uGlow, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      var mHalo = new THREE.ShaderMaterial({
        uniforms: uHalo, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });

      var scene = new THREE.Scene();
      var root = new THREE.Group();
      var shell = new THREE.Group();

      var haloGeo = new THREE.PlaneGeometry(6.4, 6.4);
      var halo = new THREE.Mesh(haloGeo, mHalo);
      halo.renderOrder = -3;
      scene.add(halo);

      var glowGeo = new THREE.PlaneGeometry(2.6, 2.6);
      var glow = new THREE.Mesh(glowGeo, mGlow);
      glow.renderOrder = -2;
      root.add(glow);

      var crystalMesh = new THREE.Mesh(crystal.geo, mCrystal);
      crystalMesh.frustumCulled = false;
      root.add(crystalMesh);

      var bladeMesh = new THREE.Mesh(blades.solid, mBlade);
      bladeMesh.frustumCulled = false;
      shell.add(bladeMesh);

      var cageMesh = new THREE.LineSegments(blades.cage, mCage);
      cageMesh.frustumCulled = false;
      cageMesh.renderOrder = 2;
      shell.add(cageMesh);

      var filMesh = new THREE.LineSegments(fil.geo, mFil);
      filMesh.frustumCulled = false;
      filMesh.renderOrder = 3;
      shell.add(filMesh);

      var ribMesh = new THREE.Mesh(ribbon.geo, mRib);
      ribMesh.frustumCulled = false;
      ribMesh.renderOrder = 1;
      shell.add(ribMesh);

      root.add(shell);

      var shardMesh = new THREE.Mesh(shards.geo, mShard);
      shardMesh.frustumCulled = false;
      shardMesh.renderOrder = 4;
      root.add(shardMesh);

      scene.add(root);

      var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);

      var peak = model.totals.peakShare;
      var live = model.totals.liveShare;

      S = {
        canvas: canvas, renderer: renderer, scene: scene, camera: camera,
        root: root, shell: shell, crystal: crystalMesh, shards: shardMesh,
        glow: glow, halo: halo,
        geoms: [crystal.geo, blades.solid, blades.cage, fil.geo, ribbon.geo,
                shards.geo, glowGeo, haloGeo],
        mats: [mCrystal, mBlade, mCage, mFil, mRib, mShard, mGlow, mHalo],
        uSets: [uCrystal, uBlade, uCage, uFil, uRib, uShard, uGlow, uHalo],
        model: model,
        triangles: crystal.triangles + blades.triangles + ribbon.triangles +
                   shards.triangles + 4,
        viewRadius: 2.18,
        width: 0, height: 0,
        // how hard it pulses: the share of all commits in the busiest month
        pulseAmp: 0.30 + 1.10 * peak,
        // how fast: the share of recorded months that saw any work at all
        pulseRate: 0.55 + 0.90 * live,
        pulse: 0.5,
        grow: still ? 1 : 0, growT: still ? 1 : 0,
        tiltY: 0, tiltZ: 0, pTiltY: 0, pTiltZ: 0,
        clockT: still ? 3.4 : 0, last: 0, raf: 0,
        still: still, onScreen: true
      };

      resize(S);
      if (!S.width || !S.height) {   // canvas not laid out yet
        S.width = canvas.width || 800; S.height = canvas.height || 600;
        renderer.setSize(S.width, S.height, false);
        fitCamera(S);
      }

      /* --- events --------------------------------------------------------- */
      S.onResize = function () { if (S) resize(S); };
      global.addEventListener('resize', S.onResize);

      if (global.ResizeObserver) {
        S.ro = new global.ResizeObserver(function () { if (S) resize(S); });
        try { S.ro.observe(canvas); } catch (e) { }
      }

      if (global.IntersectionObserver) {
        S.io = new global.IntersectionObserver(function (entries) {
          if (!S || !entries || !entries.length) return;
          S.onScreen = !!entries[entries.length - 1].isIntersecting;
          if (S.onScreen) S.last = 0;
        }, { threshold: 0 });
        try { S.io.observe(canvas); } catch (e) { }
      }

      S.onVis = function () {
        if (!S) return;
        if (!document.hidden) { S.last = 0; if (S.still) renderOnce(S); }
      };
      document.addEventListener('visibilitychange', S.onVis);

      if (!still) {
        S.onPointer = function (ev) {
          if (!S) return;
          var r = canvas.getBoundingClientRect();
          var nx = (ev.clientX - r.left) / Math.max(r.width, 1) * 2 - 1;
          var ny = (ev.clientY - r.top) / Math.max(r.height, 1) * 2 - 1;
          // the core leans toward the pointer instead of being scrubbed by it
          S.pTiltY = clamp(nx * 0.26, -0.34, 0.34);
          S.pTiltZ = clamp(-ny * 0.08, -0.12, 0.12);
        };
        S.onLeave = function () { if (S) { S.pTiltY = 0; S.pTiltZ = 0; } };
        canvas.addEventListener('pointermove', S.onPointer);
        canvas.addEventListener('pointerleave', S.onLeave);
      }

      if (still) {
        // one composition, held: grown, mid-pulse, iris half open. No loop.
        renderOnce(S);
      } else {
        S.raf = requestAnimationFrame(frame);
      }
    } catch (err) {
      // never take the page down over an ornament
      try { teardown(); } catch (e) { }
    }
  }

  function destroy() { teardown(); }

  global.Core = { mount: mount, destroy: destroy };

})(typeof window !== 'undefined' ? window : this);
