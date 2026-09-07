/* monument.js — the signature object for the GitHub-history portfolio.
 *
 * WHAT THIS IS
 *   A faceted stone monument that GREW from projects.json. It is not decoration:
 *   every dimension of the geometry is a reading of the data.
 *
 *     vertical axis      = time. Base = earliest quarter, apex = most recent.
 *     one stratum        = one calendar quarter (reposPerQuarter)
 *     stratum radius     = repositories started in that quarter
 *     stratum facet count= repositories started in that quarter (5..14 sides)
 *     stratum height     = commits landed in that quarter
 *     stratum sub-slabs  = commit density in that quarter (1..6 bands)
 *     stratum tint       = dominant language of the repos started then
 *     fracture glow      = commit intensity, brightest through the busy strata
 *     apex spike         = the final quarter, tall because the commits say so
 *     spine width        = a continuous shaft through every stratum, so the
 *                          quiet years read as compressed rock on a column
 *
 *   For this dataset the first ~18 strata are thin, quiet, compressed rock and
 *   the last three erupt. That IS the ramp chart, stood upright.
 *
 * CONTRACT
 *   Plain ES5. No modules. Expects global THREE (r128) already loaded.
 *   window.Monument = { mount(canvas, data, opts), setTheme(name), destroy() }
 */
(function (global) {
  'use strict';

  var THREE = global.THREE;

  /* ------------------------------------------------------------------ *
   * 0. small utilities
   * ------------------------------------------------------------------ */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // deterministic hash -> [0,1). Same monument every single load.
  function hash(a, b, c) {
    var n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // GitHub language colours -> the strata inherit their real language identity.
  var LANG_COLOR = {
    'Python': [0.208, 0.447, 0.647],
    'HTML': [0.890, 0.298, 0.149],
    'TypeScript': [0.192, 0.471, 0.776],
    'JavaScript': [0.945, 0.878, 0.353],
    'Jupyter Notebook': [0.855, 0.357, 0.043],
    'CSS': [0.337, 0.239, 0.486],
    'EJS': [0.663, 0.118, 0.314],
    'Rust': [0.871, 0.647, 0.518],
    'Shell': [0.537, 0.878, 0.318],
    'Dart': [0.000, 0.706, 0.671],
    'GDScript': [0.208, 0.333, 0.439],
    'C++': [0.953, 0.294, 0.490],
    "Ren'Py": [1.000, 0.498, 0.498],
    'Unset': [0.431, 0.463, 0.506]
  };

  function langColor(name) {
    var c = LANG_COLOR[name];
    return c ? c : LANG_COLOR['Unset'];
  }

  /* ------------------------------------------------------------------ *
   * 1. DATA -> STRATA
   *    Everything the geometry needs is derived here, and only here.
   * ------------------------------------------------------------------ */

  function quarterKey(monthStr) {
    // "2026-06" -> "2026-Q2"
    var p = String(monthStr).split('-');
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    if (!isFinite(y) || !isFinite(m)) return null;
    return y + '-Q' + (Math.floor((m - 1) / 3) + 1);
  }

  function quarterOrder(q) {
    var p = String(q).split('-Q');
    return parseInt(p[0], 10) * 4 + (parseInt(p[1], 10) || 1);
  }

  function readData(data) {
    if (!data || typeof data !== 'object') return null;

    var projects = data.projects && data.projects.length ? data.projects : [];

    // --- repos per quarter -------------------------------------------------
    var repoByQ = {};
    var order = [];
    var i, j, q;

    if (data.reposPerQuarter && data.reposPerQuarter.length) {
      for (i = 0; i < data.reposPerQuarter.length; i++) {
        q = data.reposPerQuarter[i].quarter;
        repoByQ[q] = data.reposPerQuarter[i].repos || 0;
        order.push(q);
      }
    } else {
      // fall back to deriving it from the project list
      for (i = 0; i < projects.length; i++) {
        q = projects[i].quarter;
        if (!q) continue;
        if (repoByQ[q] === undefined) { repoByQ[q] = 0; order.push(q); }
        repoByQ[q]++;
      }
    }
    if (!order.length) return null;
    order.sort(function (a, b) { return quarterOrder(a) - quarterOrder(b); });

    // --- commits per quarter (aggregated up from commitsByMonth) ------------
    var commitByQ = {};
    if (data.commitsByMonth && data.commitsByMonth.length) {
      for (i = 0; i < data.commitsByMonth.length; i++) {
        var k = quarterKey(data.commitsByMonth[i].month);
        if (!k) continue;
        commitByQ[k] = (commitByQ[k] || 0) + (data.commitsByMonth[i].commits || 0);
      }
    }

    // --- dominant language per quarter --------------------------------------
    var langByQ = {};
    for (i = 0; i < projects.length; i++) {
      q = projects[i].quarter;
      if (!q) continue;
      var L = projects[i].language || 'Unset';
      if (!langByQ[q]) langByQ[q] = {};
      langByQ[q][L] = (langByQ[q][L] || 0) + 1;
    }

    // --- normalise ----------------------------------------------------------
    var maxRepos = 1, maxCommits = 1;
    for (i = 0; i < order.length; i++) {
      maxRepos = Math.max(maxRepos, repoByQ[order[i]] || 0);
      maxCommits = Math.max(maxCommits, commitByQ[order[i]] || 0);
    }

    var strata = [];
    for (i = 0; i < order.length; i++) {
      q = order[i];
      var repos = repoByQ[q] || 0;
      var commits = commitByQ[q] || 0;

      // dominant language of this quarter
      var best = 'Unset', bestN = -1, tally = langByQ[q] || {};
      for (var name in tally) {
        if (tally.hasOwnProperty(name) && tally[name] > bestN) {
          bestN = tally[name]; best = name || 'Unset';
        }
      }

      var rn = Math.sqrt(repos / maxRepos);           // repo pressure  0..1
      var cn = Math.pow(commits / maxCommits, 0.55);  // commit pressure 0..1
      var f = order.length > 1 ? i / (order.length - 1) : 0;
      // a slight structural taper, so the record stands like a monument rather
      // than a turned vase. Small enough that repo counts still rank correctly.
      var taper = 1.0 - 0.12 * f;

      strata.push({
        quarter: q,
        repos: repos,
        commits: commits,
        language: best,
        tint: langColor(best),
        reposNorm: rn,
        commitsNorm: cn,
        // repos drive the footprint...
        radius: 0.50 * (0.60 + 0.40 * rn) * taper,
        // ...and the facet count. 1 repo -> 5 sides, 37 repos -> 14 sides.
        sides: Math.round(clamp(5 + 6 * rn, 5, 11)),
        // commits drive the height...
        height: 0.095 + 0.98 * cn,
        // ...and the internal banding density.
        slabs: Math.max(1, Math.round(1 + 5 * cn))
      });
    }
    return { strata: strata, maxRepos: maxRepos, maxCommits: maxCommits };
  }

  /* ------------------------------------------------------------------ *
   * 2. STRATA -> GEOMETRY
   *    One merged, non-indexed, flat-shaded buffer. One draw call.
   * ------------------------------------------------------------------ */

  // same stratum identity, different vertical span (used by the spine and apex,
  // which extend past their stratum's own faces)
  function spanOf(L, y0, y1) {
    return {
      idx: L.idx, commitsNorm: L.commitsNorm, reposNorm: L.reposNorm,
      seed: L.seed, tint: L.tint,
      centerY: (y0 + y1) * 0.5, halfH: (y1 - y0) * 0.5
    };
  }

  function makeRingPt(S, spin, sides, jit) {
    return function (r, k) {
      var a = spin + (k / sides) * Math.PI * 2;
      var rad = S.radius * r.mult * jit[k];
      return [Math.sin(a) * rad, r.y, Math.cos(a) * rad];
    };
  }

  function buildGeometry(model) {
    var strata = model.strata;
    var pos = [], nrm = [], info = [], tint = [], meta = [];
    var linePos = [], lineNrm = [], lineInfo = [], lineTint = [], lineMeta = [];

    var y = 0;
    var totalH = 0;
    var maxR = 0;
    var i;
    for (i = 0; i < strata.length; i++) {
      totalH += strata[i].height;
      maxR = Math.max(maxR, strata[i].radius);
    }

    // structural foundation slab (not data — this is the plinth the record sits on)
    var plinthH = 0.055;
    var plinthR = strata[0].radius * 1.30;

    function pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, L) {
      // flat normal
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;

      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      for (var t = 0; t < 3; t++) {
        nrm.push(nx, ny, nz);
        info.push(L.idx, L.commitsNorm, L.reposNorm, L.seed);
        tint.push(L.tint[0], L.tint[1], L.tint[2]);
        meta.push(L.centerY, L.halfH);
      }
    }

    function pushLine(ax, ay, az, bx, by, bz, L) {
      var nx = ax, nz = az, ln = Math.sqrt(nx * nx + nz * nz) || 1;
      var ox = nx / ln, oz = nz / ln;
      var bn = Math.sqrt(bx * bx + bz * bz) || 1;
      var bxo = bx / bn, bzo = bz / bn;
      linePos.push(ax, ay, az, bx, by, bz);
      lineNrm.push(ox, 0, oz, bxo, 0, bzo);
      for (var t = 0; t < 2; t++) {
        lineInfo.push(L.idx, L.commitsNorm, L.reposNorm, L.seed);
        lineTint.push(L.tint[0], L.tint[1], L.tint[2]);
        lineMeta.push(L.centerY, L.halfH);
      }
    }

    // ---- plinth (belongs to stratum 0 for morph purposes) -------------------
    var P = {
      idx: 0, commitsNorm: strata[0].commitsNorm, reposNorm: 1.0, seed: 0.5,
      tint: strata[0].tint, centerY: -plinthH * 0.5, halfH: plinthH * 0.5
    };
    (function () {
      var sides = 12, k, a0, a1;
      var ring0 = [], ring1 = [];
      for (k = 0; k < sides; k++) {
        a0 = (k / sides) * Math.PI * 2;
        ring0.push([Math.sin(a0) * plinthR, Math.cos(a0) * plinthR]);
        ring1.push([Math.sin(a0) * plinthR * 0.94, Math.cos(a0) * plinthR * 0.94]);
      }
      for (k = 0; k < sides; k++) {
        var n = (k + 1) % sides;
        var p0 = ring0[k], p1 = ring0[n], q0 = ring1[k], q1 = ring1[n];
        // outer wall
        pushTri(p0[0], -plinthH, p0[1], p1[0], -plinthH, p1[1], q1[0], 0, q1[1], P);
        pushTri(p0[0], -plinthH, p0[1], q1[0], 0, q1[1], q0[0], 0, q0[1], P);
        // top face
        pushTri(0, 0, 0, q0[0], 0, q0[1], q1[0], 0, q1[1], P);
      }
    })();

    // ---- the strata ---------------------------------------------------------
    var layerMeta = [];
    for (i = 0; i < strata.length; i++) {
      var S = strata[i];
      var y0 = y, y1 = y + S.height;
      var L = {
        idx: i,
        commitsNorm: S.commitsNorm,
        reposNorm: S.reposNorm,
        seed: hash(i, 3.1, 7.7),
        tint: S.tint,
        centerY: (y0 + y1) * 0.5,
        halfH: S.height * 0.5
      };
      layerMeta.push(L);

      var sides = S.sides;
      var spin = i * 0.052 + hash(i, 11.3, 2.2) * 0.09;

      // Per-side radius jitter, constant for the whole stratum so the vertical
      // facet edges stay dead straight — crystal, not blob. Two sides of every
      // stratum are sheared hard inward: these are the cleave faces, and they
      // are what stop the thing reading as a lathe-turned ornament.
      var jit = [];
      var cleaveA = Math.floor(hash(i, 41.0, 3.3) * sides);
      var cleaveB = (cleaveA + 2 + Math.floor(hash(i, 7.0, 19.0) * (sides - 3))) % sides;
      for (var s = 0; s < sides; s++) {
        var az = spin + (s / sides) * Math.PI * 2;
        var plane = 0.88 + 0.15 * Math.sin(az * 3.0 + 0.7) + 0.07 * Math.sin(az * 5.0 - 1.9);
        var j = plane * (0.90 + 0.20 * hash(i, s, 5.5));
        if (s === cleaveA) j *= 0.72;
        if (s === cleaveB) j *= 0.84;
        jit.push(j);
      }

      // Ring stack: each sub-slab is a chiselled band, stepping monotonically
      // inward as it rises, with a bevelled mid-ring to catch the key light.
      var nSlab = S.slabs;
      var rings = [];   // {y, mult}
      for (var sl = 0; sl <= nSlab; sl++) {
        var fs = sl / nSlab;
        var inward = 0.040 + 0.280 * S.commitsNorm;
        var step = (1.0 - inward * fs) * (0.985 + 0.030 * hash(i, sl, 17.1));
        rings.push({ y: lerp(y0, y1, fs), mult: step, boundary: true });
        if (sl < nSlab) {
          rings.push({
            y: lerp(y0, y1, (sl + 0.5) / nSlab),
            mult: step * (1.0 + 0.030 * S.commitsNorm), boundary: false
          });
        }
      }
      rings.sort(function (a, b) { return a.y - b.y; });

      var ringPt = makeRingPt(S, spin, sides, jit);

      var r, rn2, k2, A, B, C, D;
      for (r = 0; r < rings.length - 1; r++) {
        for (k2 = 0; k2 < sides; k2++) {
          var kn = (k2 + 1) % sides;
          A = ringPt(rings[r], k2);
          B = ringPt(rings[r], kn);
          C = ringPt(rings[r + 1], kn);
          D = ringPt(rings[r + 1], k2);
          pushTri(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], L);
          pushTri(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2], L);
        }
      }

      // caps: sealed per-stratum, because in the energy-core theme the strata
      // pull apart and you look straight into them.
      var bot = rings[0], top = rings[rings.length - 1];
      for (k2 = 0; k2 < sides; k2++) {
        var kn2 = (k2 + 1) % sides;
        var b0 = ringPt(bot, k2), b1 = ringPt(bot, kn2);
        var t0 = ringPt(top, k2), t1 = ringPt(top, kn2);
        pushTri(0, bot.y, 0, b1[0], b1[1], b1[2], b0[0], b0[1], b0[2], L);
        if (i < strata.length - 1) {
          pushTri(0, top.y, 0, t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], L);
        }
        // silhouette lines: top outline + vertical corner
        pushLine(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], L);
        pushLine(b0[0], b0[1], b0[2], t0[0], t0[1], t0[2], L);
      }

      // ---- spine -------------------------------------------------------------
      var spR = maxR * (0.72 - 0.14 * (i / Math.max(strata.length - 1, 1)));
      var spSides = 9;
      var spJit = [];
      for (var sp = 0; sp < spSides; sp++) {
        var spAz = spin + (sp / spSides) * Math.PI * 2;
        spJit.push(0.88 + 0.15 * Math.sin(spAz * 3.0 + 0.7) + 0.07 * Math.sin(spAz * 5.0 - 1.9));
      }
      var spineRing = makeRingPt({ radius: spR }, spin, spSides, spJit);
      var sr0 = { y: y0 - 0.004, mult: 1.0 };
      var sr1 = { y: y1 + 0.004, mult: 1.0 };
      var LS = spanOf(L, sr0.y, sr1.y);
      for (k2 = 0; k2 < spSides; k2++) {
        var sk = (k2 + 1) % spSides;
        var s0 = spineRing(sr0, k2), s1 = spineRing(sr0, sk);
        var s2 = spineRing(sr1, sk), s3 = spineRing(sr1, k2);
        pushTri(s0[0], s0[1], s0[2], s1[0], s1[1], s1[2], s2[0], s2[1], s2[2], LS);
        pushTri(s0[0], s0[1], s0[2], s2[0], s2[1], s2[2], s3[0], s3[1], s3[2], LS);
      }

      // ---- apex --------------------------------------------------------------
      // The final stratum closes in a spike whose height is the last quarter's
      // commit count. On this dataset that is 216 commits: it is meant to stab.
      if (i === strata.length - 1) {
        var apexH = 0.30 + 1.55 * S.commitsNorm;
        var neck = { y: top.y + apexH * 0.26, mult: top.mult * 0.46 };
        var tipY = top.y + apexH;
        var LX = spanOf(L, top.y, tipY);
        for (k2 = 0; k2 < sides; k2++) {
          var kn3 = (k2 + 1) % sides;
          var e0 = ringPt(top, k2), e1 = ringPt(top, kn3);
          var n0 = ringPt(neck, k2), n1 = ringPt(neck, kn3);
          // shoulder
          pushTri(e0[0], e0[1], e0[2], e1[0], e1[1], e1[2], n1[0], n1[1], n1[2], LX);
          pushTri(e0[0], e0[1], e0[2], n1[0], n1[1], n1[2], n0[0], n0[1], n0[2], LX);
          // needle
          pushTri(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], 0, tipY, 0, LX);
          pushLine(n0[0], n0[1], n0[2], 0, tipY, 0, LX);
          pushLine(e0[0], e0[1], e0[2], n0[0], n0[1], n0[2], LX);
        }
        totalH += apexH;
      }

      y = y1;
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 4));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(tint), 3));
    g.setAttribute('aMeta', new THREE.BufferAttribute(new Float32Array(meta), 2));

    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePos), 3));
    lg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(lineNrm), 3));
    lg.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(lineInfo), 4));
    lg.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(lineTint), 3));
    lg.setAttribute('aMeta', new THREE.BufferAttribute(new Float32Array(lineMeta), 2));

    return {
      body: g, lines: lg,
      triangles: pos.length / 9,
      totalHeight: totalH,
      maxRadius: maxR,
      layers: strata.length,
      layerMeta: layerMeta
    };
  }

  // The core column that lives inside the monument. Invisible when the strata
  // are shut (professional); revealed when they separate (anime).
  function buildCore(model, totalH) {
    var strata = model.strata;
    var pos = [], hgt = [];
    var sides = 9;
    var y = 0;
    var i, k;
    var rings = [];
    rings.push({ y: 0, r: strata[0].radius * 0.30 });
    for (i = 0; i < strata.length; i++) {
      y += strata[i].height;
      rings.push({ y: y, r: strata[i].radius * (0.24 + 0.16 * strata[i].commitsNorm) });
    }
    rings.push({ y: y + 0.9, r: 0.012 });

    for (i = 0; i < rings.length - 1; i++) {
      for (k = 0; k < sides; k++) {
        var a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
        var r0 = rings[i], r1 = rings[i + 1];
        var A = [Math.sin(a0) * r0.r, r0.y, Math.cos(a0) * r0.r];
        var B = [Math.sin(a1) * r0.r, r0.y, Math.cos(a1) * r0.r];
        var C = [Math.sin(a1) * r1.r, r1.y, Math.cos(a1) * r1.r];
        var D = [Math.sin(a0) * r1.r, r1.y, Math.cos(a0) * r1.r];
        pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
        pos.push(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
        hgt.push(r0.y, r0.y, r1.y, r0.y, r1.y, r1.y);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aY', new THREE.BufferAttribute(new Float32Array(hgt), 1));
    return g;
  }

  /* ------------------------------------------------------------------ *
   * 3. SHADERS
   * ------------------------------------------------------------------ */

  // Shared displacement. The body and the silhouette lines run the identical
  // vertex program so the outlines never drift off the facets.
  var MORPH = [
    'attribute vec4 aInfo;',   // x layerIdx, y commitsNorm, z reposNorm, w seed
    'attribute vec3 aTint;',
    'attribute vec2 aMeta;',   // x layer centre Y, y layer half-height',
    'uniform float uTime;',
    'uniform float uTheme;',
    'uniform float uGrow;',
    'uniform float uLayers;',
    'varying vec3 vN;',
    'varying vec3 vVP;',
    'varying vec3 vLocal;',
    'varying vec3 vTint;',
    'varying float vCommit;',
    'varying float vEdge;',
    'varying float vSeed;',
    'varying float vLi;',
    'const float PI = 3.14159265;',
    'const float TAU = 6.28318530;',
    'mat2 rot2(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }',
    'vec3 morph(vec3 p, inout vec3 n){',
    '  float li = aInfo.x;',
    '  float cn = aInfo.y;',
    '  float seed = aInfo.w;',
    '  vEdge = max(aMeta.y - abs(p.y - aMeta.x), 0.0);',
    // --- the fracture. A single seam spiralling up one face of the monument.
    // It is prised open, and it opens wider through the high-commit strata.
    '  float ang = atan(p.x, p.z);',
    '  float sw = mod(ang + p.y * 0.44 + PI, TAU) - PI;',
    '  float crack = 1.0 - smoothstep(0.0, 0.46, abs(sw));',
    '  vec3 tang = normalize(vec3(cos(ang), 0.0, -sin(ang)) + 1e-5);',
    '  p += tang * sign(sw) * crack * (0.014 + 0.050 * uTheme) * (0.30 + cn);',
    // --- theme morph: strata lift apart, twist, and sharpen into shards
    '  float ty = li * uTheme * 0.030;',
    '  float ra = uTheme * (li * 0.050 + sin(uTime * 0.22 + li * 0.45) * 0.010);',
    '  p.xz = rot2(ra) * p.xz;',
    '  n.xz = rot2(ra) * n.xz;',
    '  p.y += ty;',
    '  p += n * (uTheme * (0.008 + 0.042 * seed) * (0.30 + 0.70 * cn));',
    '  p.xz *= mix(1.0, 0.955, uTheme);',
    // --- growth: the record accretes from the oldest quarter upward
    '  float g = clamp(uGrow * (uLayers + 4.0) - li, 0.0, 1.0);',
    '  g = g * g * (3.0 - 2.0 * g);',
    '  float pivot = aMeta.x + ty;',
    '  p.xz *= g;',
    '  p.y = mix(pivot, p.y, g);',
    '  vTint = aTint;',
    '  vCommit = cn;',
    '  vSeed = seed;',
    '  vLi = li / max(uLayers - 1.0, 1.0);',
    '  vLocal = p;',
    '  return p;',
    '}'
  ].join('\n');

  var BODY_VERT = MORPH + [
    '',
    'void main(){',
    '  vec3 n = normal;',
    '  vec3 p = morph(position, n);',
    '  vN = normalize(normalMatrix * n);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vVP = mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BODY_FRAG = [
    'uniform float uTime;',
    'uniform float uTheme;',
    'uniform float uGrow;',
    'varying vec3 vN;',
    'varying vec3 vVP;',
    'varying vec3 vLocal;',
    'varying vec3 vTint;',
    'varying float vCommit;',
    'varying float vEdge;',
    'varying float vSeed;',
    'varying float vLi;',
    'const float PI = 3.14159265;',
    'const float TAU = 6.28318530;',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(-vVP);',
    '  vec3 L1 = normalize(vec3(0.45, 0.86, 0.62));',
    '  vec3 L2 = normalize(vec3(-0.86, 0.10, -0.30));',
    '  float d1 = max(dot(N, L1), 0.0);',
    '  float d2 = max(dot(N, L2), 0.0);',
    '  float sky = N.y * 0.5 + 0.5;',
    // two palettes: quarried graphite  ->  charged core
    '  vec3 darkA = vec3(0.115, 0.113, 0.122);',
    '  vec3 liteA = vec3(0.720, 0.706, 0.678);',
    '  vec3 darkB = vec3(0.020, 0.006, 0.013);',
    '  vec3 liteB = vec3(0.245, 0.055, 0.082);',
    '  vec3 dk = mix(darkA, darkB, uTheme);',
    '  vec3 lt = mix(liteA, liteB, uTheme);',
    '  vec3 col = mix(dk, lt, clamp(pow(d1, 0.82) + sky * 0.13, 0.0, 1.0));',
    '  col += vec3(0.88, 0.17, 0.21) * d2 * (0.045 + 0.20 * uTheme);',
    // language identity — a whisper in stone, a statement in the core
    '  col = mix(col, col * (0.45 + vTint * 1.30), 0.14 + 0.36 * uTheme);',
    // per-facet grain
    '  col *= 0.88 + 0.26 * vSeed;',
    '  vec3 hot = mix(vec3(0.92, 0.16, 0.20), vec3(1.00, 0.32, 0.34), uTheme);',
    // stratum boundaries glow in proportion to that quarter\'s commits
    '  float seam = (1.0 - smoothstep(0.0, 0.016, vEdge)) * (0.08 + 0.92 * vCommit);',
    '  col += hot * seam * (0.26 + 2.10 * uTheme);',
    // the fracture itself
    '  float ang = atan(vLocal.x, vLocal.z);',
    '  float sw = abs(mod(ang + vLocal.y * 0.44 + PI, TAU) - PI);',
    '  float vein = 1.0 - smoothstep(0.01, 0.30, sw);',
    '  vein *= smoothstep(0.015, 0.075, length(vLocal.xz));',
    '  float pulse = 0.80 + 0.20 * sin(uTime * 1.6 - vLocal.y * 2.2);',
    '  col += hot * vein * (0.30 + 0.95 * vCommit) * (0.55 + 2.30 * uTheme) * pulse;',
    // rim
    '  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.5);',
    '  col += mix(vec3(0.30, 0.32, 0.38), vec3(1.00, 0.30, 0.34), uTheme) * rim * (0.26 + 0.60 * uTheme);',
    '  col = col / (col + vec3(0.90)) * 1.58;',
    '  col = pow(max(col, 0.0), vec3(1.14));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var LINE_VERT = MORPH + [
    '',
    'void main(){',
    '  vec3 n = normal;',
    '  vec3 p = morph(position, n);',
    '  vN = normalize(normalMatrix * n);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vVP = mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var LINE_FRAG = [
    'uniform float uTheme;',
    'varying vec3 vTint;',
    'varying float vCommit;',
    'varying float vLi;',
    'varying float vSeed;',
    'void main(){',
    '  vec3 cold = vec3(0.42, 0.45, 0.51);',
    '  vec3 warm = vec3(1.00, 0.42, 0.40);',
    '  vec3 col = mix(cold, warm, uTheme * (0.55 + 0.45 * vCommit));',
    '  col = mix(col, col * (0.5 + vTint), 0.30 * uTheme);',
    '  float a = (0.10 + 0.26 * vCommit) * (0.55 + 1.35 * uTheme);',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  var CORE_VERT = [
    'attribute float aY;',
    'uniform float uTheme;',
    'uniform float uTime;',
    'varying float vY;',
    'void main(){',
    '  vY = aY;',
    '  vec3 p = position;',
    '  p.xz *= 0.90 + 0.16 * uTheme;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var CORE_FRAG = [
    'uniform float uTheme;',
    'uniform float uTime;',
    'uniform float uTop;',
    'varying float vY;',
    'void main(){',
    '  float f = clamp(vY / max(uTop, 0.001), 0.0, 1.0);',
    '  vec3 col = mix(vec3(0.55, 0.06, 0.10), vec3(1.00, 0.55, 0.42), pow(f, 1.4));',
    '  float band = 0.72 + 0.28 * sin(vY * 16.0 - uTime * 2.4);',
    '  float a = uTheme * (0.34 + 0.92 * f) * band;',
    '  gl_FragColor = vec4(col * (0.55 + 0.9 * f), a);',
    '}'
  ].join('\n');

  var HALO_VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  ].join('\n');

  var HALO_FRAG = [
    'uniform float uTheme;',
    'uniform float uTime;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 d = vUv - 0.5;',
    '  d.x *= 1.9;',
    '  float r = length(d);',
    '  float a = smoothstep(0.5, 0.02, r);',
    '  a *= a;',
    '  float pulse = 0.86 + 0.14 * sin(uTime * 0.9);',
    '  vec3 col = mix(vec3(0.30, 0.32, 0.38), vec3(0.95, 0.20, 0.24), uTheme);',
    '  gl_FragColor = vec4(col, a * (0.016 + 0.30 * uTheme) * pulse);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ *
   * 4. THE INSTANCE
   * ------------------------------------------------------------------ */

  var S = null;   // the single live scene, or null

  function teardown() {
    if (!S) return;
    var s = S;
    S = null;

    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }

    if (s.onVis) document.removeEventListener('visibilitychange', s.onVis);
    if (s.onResize) global.removeEventListener('resize', s.onResize);
    if (s.ro) { try { s.ro.disconnect(); } catch (e) { } }
    if (s.canvas && s.onPointer) {
      s.canvas.removeEventListener('pointermove', s.onPointer);
      s.canvas.removeEventListener('pointerleave', s.onLeave);
    }

    var i;
    for (i = 0; i < s.geoms.length; i++) {
      try { s.geoms[i].dispose(); } catch (e) { }
    }
    for (i = 0; i < s.mats.length; i++) {
      try { s.mats[i].dispose(); } catch (e) { }
    }
    if (s.scene) {
      // drop references so nothing is retained
      while (s.scene.children.length) s.scene.remove(s.scene.children[0]);
    }
    if (s.renderer) {
      try { s.renderer.dispose(); } catch (e) { }
      try {
        var ctx = s.renderer.getContext();
        var lose = ctx && ctx.getExtension && ctx.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (e) { }
    }
    s.geoms = []; s.mats = []; s.scene = null; s.renderer = null;
    s.body = null; s.lines = null; s.core = null; s.halo = null;
    s.camera = null; s.group = null; s.canvas = null; s.model = null;
  }

  function fitCamera(s) {
    var w = s.width, h = s.height;
    var aspect = w / Math.max(h, 1);
    s.camera.aspect = aspect;

    var H = s.totalHeight;
    var R = s.maxRadius * 1.5;
    // frame the whole record: vertical extent dominates on tall/narrow canvases
    var fovR = s.camera.fov * Math.PI / 180;
    var distV = (H * 0.53) / Math.tan(fovR * 0.5);
    var distH = R / Math.tan(fovR * 0.5) / Math.max(aspect, 0.0001);
    var dist = Math.max(distV, distH) * 1.03;

    s.camDist = dist;
    s.camera.position.set(0, H * 0.52, dist);
    s.camera.lookAt(0, H * 0.46, 0);
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
    if (s.reduced) renderOnce(s);
  }

  function applyUniforms(s, t) {
    var u = s.uniforms;
    u.uTime.value = t;
    u.uTheme.value = s.theme;
    u.uGrow.value = s.grow;
    s.coreU.uTime.value = t;
    s.coreU.uTheme.value = s.theme;
    s.haloU.uTime.value = t;
    s.haloU.uTheme.value = s.theme;
    s.lines.material.uniforms.uTheme.value = s.theme;
    s.lines.material.uniforms.uTime.value = t;
    s.lines.material.uniforms.uGrow.value = s.grow;
  }

  function renderOnce(s) {
    if (!s.renderer) return;
    applyUniforms(s, s.clockT);
    s.halo.lookAt(s.camera.position);
    s.renderer.render(s.scene, s.camera);
  }

  function frame(now) {
    if (!S) return;
    var s = S;
    s.raf = requestAnimationFrame(frame);

    if (document.hidden) { s.last = now; return; }

    var dt = s.last ? Math.min((now - s.last) / 1000, 0.05) : 0.016;
    s.last = now;
    s.clockT += dt;

    // growth-in
    if (s.grow < 1) {
      s.growT = Math.min(s.growT + dt / 1.9, 1);
      s.grow = easeOutCubic(s.growT);
    }

    // theme transition, ~800ms
    if (s.themeT < 1) {
      s.themeT = Math.min(s.themeT + dt / 0.8, 1);
      s.theme = lerp(s.themeFrom, s.themeTo, easeInOutCubic(s.themeT));
    }

    // the monument turns. Slowly. It is a record, not a toy.
    var speed = 0.085 + 0.075 * s.theme;
    s.spin += dt * speed;

    s.tiltX = lerp(s.tiltX, s.pTiltX, 1 - Math.pow(0.001, dt));
    s.tiltY = lerp(s.tiltY, s.pTiltY, 1 - Math.pow(0.001, dt));

    s.group.rotation.y = s.spin + s.tiltY;
    s.group.rotation.x = s.tiltX;

    var bob = Math.sin(s.clockT * 0.55) * 0.012 * s.theme;
    s.group.position.y = bob;

    applyUniforms(s, s.clockT);
    s.halo.lookAt(s.camera.position);
    s.renderer.render(s.scene, s.camera);
  }

  /* ------------------------------------------------------------------ *
   * 5. PUBLIC API
   * ------------------------------------------------------------------ */

  function mount(canvas, data, opts) {
    try {
      if (S) teardown();
      if (!canvas || !global.THREE) return;
      THREE = global.THREE;
      opts = opts || {};

      var model = readData(data);
      if (!model) return;

      // --- renderer (silent bail if WebGL is unavailable) ------------------
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

      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));

      var built = buildGeometry(model);
      var coreGeo = buildCore(model, built.totalHeight);

      var uniforms = {
        uTime: { value: 0 },
        uTheme: { value: 0 },
        uGrow: { value: 0 },
        uLayers: { value: built.layers }
      };
      var lineUniforms = {
        uTime: { value: 0 },
        uTheme: { value: 0 },
        uGrow: { value: 0 },
        uLayers: { value: built.layers }
      };
      var coreU = { uTime: { value: 0 }, uTheme: { value: 0 }, uTop: { value: built.totalHeight } };
      var haloU = { uTime: { value: 0 }, uTheme: { value: 0 } };

      var bodyMat = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: BODY_VERT,
        fragmentShader: BODY_FRAG,
        side: THREE.FrontSide
      });
      var lineMat = new THREE.ShaderMaterial({
        uniforms: lineUniforms,
        vertexShader: LINE_VERT,
        fragmentShader: LINE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      var coreMat = new THREE.ShaderMaterial({
        uniforms: coreU,
        vertexShader: CORE_VERT,
        fragmentShader: CORE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      var haloMat = new THREE.ShaderMaterial({
        uniforms: haloU,
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      var scene = new THREE.Scene();
      var group = new THREE.Group();

      var haloGeo = new THREE.PlaneGeometry(built.maxRadius * 9, built.totalHeight * 2.1);
      var halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, built.totalHeight * 0.48, -built.maxRadius * 2.2);
      halo.renderOrder = -1;
      scene.add(halo);

      var core = new THREE.Mesh(coreGeo, coreMat);
      core.renderOrder = 1;
      group.add(core);

      var body = new THREE.Mesh(built.body, bodyMat);
      body.frustumCulled = false;
      group.add(body);

      var lines = new THREE.LineSegments(built.lines, lineMat);
      lines.frustumCulled = false;
      lines.renderOrder = 2;
      group.add(lines);

      scene.add(group);

      var camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);

      var reduced = !!opts.reducedMotion;

      S = {
        canvas: canvas, renderer: renderer, scene: scene, camera: camera,
        group: group, body: body, lines: lines, core: core, halo: halo,
        uniforms: uniforms, coreU: coreU, haloU: haloU,
        geoms: [built.body, built.lines, coreGeo, haloGeo],
        mats: [bodyMat, lineMat, coreMat, haloMat],
        model: model,
        totalHeight: built.totalHeight,
        maxRadius: built.maxRadius,
        triangles: built.triangles,
        width: 0, height: 0,
        theme: 0, themeFrom: 0, themeTo: 0, themeT: 1,
        grow: reduced ? 1 : 0, growT: reduced ? 1 : 0,
        spin: -0.35, tiltX: 0, tiltY: 0, pTiltX: 0, pTiltY: 0,
        clockT: 0, last: 0, raf: 0, reduced: reduced
      };

      resize(S);
      if (!S.width || !S.height) {   // canvas not laid out yet
        S.width = canvas.width || 800; S.height = canvas.height || 600;
        renderer.setSize(S.width, S.height, false);
        fitCamera(S);
      }

      // --- events ------------------------------------------------------------
      S.onResize = function () { if (S) resize(S); };
      global.addEventListener('resize', S.onResize);
      if (global.ResizeObserver) {
        S.ro = new global.ResizeObserver(function () { if (S) resize(S); });
        try { S.ro.observe(canvas); } catch (e) { }
      }

      S.onVis = function () {
        if (!S) return;
        if (!document.hidden) { S.last = 0; if (S.reduced) renderOnce(S); }
      };
      document.addEventListener('visibilitychange', S.onVis);

      if (!reduced) {
        S.onPointer = function (ev) {
          if (!S) return;
          var r = canvas.getBoundingClientRect();
          var nx = (ev.clientX - r.left) / Math.max(r.width, 1) * 2 - 1;
          var ny = (ev.clientY - r.top) / Math.max(r.height, 1) * 2 - 1;
          S.pTiltY = nx * 0.30;
          S.pTiltX = clamp(ny * 0.10, -0.14, 0.14);
        };
        S.onLeave = function () { if (S) { S.pTiltY = 0; S.pTiltX = 0; } };
        canvas.addEventListener('pointermove', S.onPointer);
        canvas.addEventListener('pointerleave', S.onLeave);
      }

      if (reduced) {
        renderOnce(S);
      } else {
        S.raf = requestAnimationFrame(frame);
      }
    } catch (err) {
      // never take the page down over an ornament
      try { teardown(); } catch (e) { }
    }
  }

  function setTheme(name) {
    if (!S) return;
    var target = (name === 'anime') ? 1 : 0;
    if (S.themeTo === target && S.themeT >= 1) return;
    S.themeFrom = S.theme;
    S.themeTo = target;
    S.themeT = 0;
    if (S.reduced) {
      S.theme = target; S.themeT = 1;
      renderOnce(S);
    }
  }

  function destroy() { teardown(); }

  global.Monument = { mount: mount, setTheme: setTheme, destroy: destroy };

})(typeof window !== 'undefined' ? window : this);
