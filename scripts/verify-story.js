#!/usr/bin/env node
/*
 * verify-story.js — runs assets/story.js against the real data/projects.json
 * inside a fake browser sandbox (so window.Story is exercised exactly as the
 * page will), prints the output, and audits it for NaN / undefined / null.
 *
 * Usage: node scripts/verify-story.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.resolve(__dirname, "..");
var STORY = path.join(ROOT, "assets", "story.js");
var DATA = path.join(ROOT, "data", "projects.json");

/* ---- load story.js the way a browser would: as a plain script ---- */
var sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(STORY, "utf8"), sandbox, { filename: STORY });

if (!sandbox.window.Story || typeof sandbox.window.Story.build !== "function") {
  console.error("FAIL: window.Story.build is not a function");
  process.exit(1);
}
var exposed = Object.keys(sandbox.window.Story);
console.log("window.Story surface:", JSON.stringify(exposed));

var raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
var out = sandbox.window.Story.build(raw);

/* ------------------------------------------------------------- helpers */
function line(t) { console.log("\n" + t + "\n" + new Array(t.length + 1).join("=")); }
function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }
function padl(s, n) { s = String(s); while (s.length < n) s = " " + s; return s; }

/* ------------------------------------------------------------- totals */
line("TOTALS");
console.log(JSON.stringify(out.totals, null, 2));

var forks = raw.projects.filter(function (p) { return p.fork; });
console.log("\nforks excluded: " + forks.length + " -> " +
  forks.map(function (p) { return p.name; }).join(", "));
console.log("source projects: " + raw.projects.length +
  "  |  archive length: " + out.archive.length +
  "  |  " + raw.projects.length + " - " + forks.length + " = " +
  (raw.projects.length - forks.length));

/* --------------------------------------------------------------- arcs */
line("ARCS (first 3 of " + out.arcs.length + ")");
out.arcs.slice(0, 3).forEach(function (a) {
  console.log(JSON.stringify(a, null, 2));
});
line("ARCS (one-line, all " + out.arcs.length + ")");
out.arcs.forEach(function (a) {
  console.log(
    pad(a.year, 6) + pad(a.title, 24) +
    "repos=" + padl(a.repos, 3) +
    "  delta=" + padl((a.delta > 0 ? "+" : "") + a.delta, 4) +
    "  commits=" + padl(("commits" in a ? a.commits : "(no data)"), 10) +
    "  langs=" + a.languages.slice(0, 4).join("/")
  );
});

/* ------------------------------------------------------------ arsenal */
line("ARSENAL (top 5 of " + out.arsenal.length + ")");
out.arsenal.slice(0, 5).forEach(function (a) {
  console.log(
    pad(a.name, 20) + "repos=" + padl(a.repos, 3) +
    "  share=" + padl((a.share * 100).toFixed(1) + "%", 7) +
    "  " + a.firstSeen + "-" + a.lastSeen +
    "  projects[" + a.projects.length + "]: " + a.projects.slice(0, 3).join(", ") +
    (a.projects.length > 3 ? ", ..." : "")
  );
});

/* ------------------------------------------------------------ archive */
line("ARCHIVE (first 5 of " + out.archive.length + ")");
out.archive.slice(0, 5).forEach(function (r) {
  console.log(JSON.stringify(r, null, 2));
});

/* -------------------------------------------------- weight histogram */
line("WEIGHT DISTRIBUTION");
var buckets = new Array(10);
for (var b = 0; b < 10; b++) buckets[b] = 0;
var ws = out.archive.map(function (r) { return r.weight; });
ws.forEach(function (w) {
  var idx = Math.min(9, Math.floor(w * 10));
  buckets[idx]++;
});
for (b = 0; b < 10; b++) {
  var lo = (b / 10).toFixed(1), hi = ((b + 1) / 10).toFixed(1);
  console.log(
    lo + "-" + hi + " " + padl(buckets[b], 4) + " |" +
    new Array(buckets[b] + 1).join("#")
  );
}
var sorted = ws.slice().sort(function (x, y) { return x - y; });
function q(p) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }
console.log("\nmin=" + sorted[0] +
  "  p25=" + q(0.25) + "  median=" + q(0.5) + "  p75=" + q(0.75) +
  "  p90=" + q(0.9) + "  max=" + sorted[sorted.length - 1]);
console.log("mean=" + (ws.reduce(function (s, w) { return s + w; }, 0) / ws.length).toFixed(3));
console.log("distinct weight values: " + (function () {
  var seen = {}, n = 0;
  ws.forEach(function (w) { if (!seen[w]) { seen[w] = 1; n++; } });
  return n;
})());
console.log("\ntop 10 by weight:");
out.archive.slice().sort(function (x, y) { return y.weight - x.weight; })
  .slice(0, 10).forEach(function (r) {
    console.log("  " + padl(r.weight, 6) + "  " + pad(r.name, 34) + pad(r.category, 14) + r.status);
  });
console.log("bottom 5 by weight:");
out.archive.slice().sort(function (x, y) { return x.weight - y.weight; })
  .slice(0, 5).forEach(function (r) {
    console.log("  " + padl(r.weight, 6) + "  " + pad(r.name, 34) + pad(r.category, 14) + r.status);
  });

/* --------------------------------------------------------------- ramp */
line("RAMP (" + out.ramp.length + " periods, oldest -> newest)");
out.ramp.forEach(function (r) {
  console.log(
    pad(r.period, 9) + "commits=" + padl(r.commits, 4) +
    "  started=" + padl(r.started, 3) +
    (r.isPeak ? "   <-- PEAK" : "")
  );
});
var peaks = out.ramp.filter(function (r) { return r.isPeak; });
console.log("\npeaks: " + peaks.map(function (r) {
  return r.period + " (" + r.commits + ")";
}).join(", ") + "   [" + peaks.length + " of " + out.ramp.length + "]");

/* ------------------------------------------------------------- facets */
line("FACETS");
console.log("years:      " + JSON.stringify(out.facets.years));
console.log("languages:  " + JSON.stringify(out.facets.languages));
console.log("categories: " + JSON.stringify(out.facets.categories));

var catCount = {};
out.archive.forEach(function (r) { catCount[r.category] = (catCount[r.category] || 0) + 1; });
console.log("\ncategory counts: " + JSON.stringify(catCount));
var statusCount = {};
out.archive.forEach(function (r) { statusCount[r.status] = (statusCount[r.status] || 0) + 1; });
console.log("status counts:   " + JSON.stringify(statusCount));

/* ------------------------------------------------ integrity audit */
line("INTEGRITY AUDIT");
var problems = [];
function walk(node, p) {
  if (node === null) { problems.push(p + " = null"); return; }
  if (typeof node === "undefined") { problems.push(p + " = undefined"); return; }
  if (typeof node === "number") {
    if (isNaN(node)) problems.push(p + " = NaN");
    else if (!isFinite(node)) problems.push(p + " = " + node);
    return;
  }
  if (typeof node === "string") {
    if (node === "NaN" || node === "undefined" || node === "null") {
      problems.push(p + ' = "' + node + '" (stringified nullish)');
    }
    return;
  }
  if (Object.prototype.toString.call(node) === "[object Array]") {
    for (var i = 0; i < node.length; i++) walk(node[i], p + "[" + i + "]");
    return;
  }
  if (typeof node === "object") {
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k], p + "." + k);
    }
    return;
  }
  if (typeof node !== "boolean") problems.push(p + " = unexpected " + typeof node);
}
walk(out, "root");

/* required-key check */
var SHAPES = {
  totals: ["repositories", "commits", "years", "languages", "activeSince", "latest"],
  ramp: ["period", "commits", "started", "isPeak"],
  arcs: ["year", "title", "repos", "languages", "highlights", "delta"],
  arsenal: ["name", "repos", "share", "firstSeen", "lastSeen", "projects"],
  archive: ["index", "name", "description", "language", "year", "created",
            "pushed", "stars", "category", "status", "weight"]
};
Object.keys(SHAPES).forEach(function (key) {
  var keys = SHAPES[key];
  if (key === "totals") {
    keys.forEach(function (k) {
      if (!(k in out.totals)) problems.push("totals missing key " + k);
    });
    return;
  }
  out[key].forEach(function (row, i) {
    keys.forEach(function (k) {
      if (!(k in row)) problems.push(key + "[" + i + "] missing key " + k);
    });
  });
});
["years", "languages", "categories"].forEach(function (k) {
  if (!out.facets[k] || !out.facets[k].length) problems.push("facets." + k + " empty");
});

/* archive ordering + index check */
for (var i = 1; i < out.archive.length; i++) {
  if (out.archive[i].index !== i + 1) problems.push("archive index out of order at " + i);
  if (Date.parse(out.archive[i].created) > Date.parse(out.archive[i - 1].created)) {
    problems.push("archive not newest-first at " + i);
  }
}
/* ramp ordering */
for (i = 1; i < out.ramp.length; i++) {
  if (out.ramp[i].period <= out.ramp[i - 1].period) problems.push("ramp not ascending at " + i);
}
/* weight range */
out.archive.forEach(function (r) {
  if (!(r.weight >= 0 && r.weight <= 1)) problems.push("weight out of range: " + r.name + " " + r.weight);
});

/* arcs[].commits is allowed to be absent; report which */
var missingCommits = out.arcs.filter(function (a) { return !("commits" in a); })
  .map(function (a) { return a.year; });
console.log("arcs WITHOUT a commits key (by design, no source data): " +
  (missingCommits.length ? missingCommits.join(", ") : "none"));

if (problems.length) {
  console.log("\nPROBLEMS (" + problems.length + "):");
  problems.forEach(function (p) { console.log("  " + p); });
  process.exitCode = 1;
} else {
  console.log("\nOK - no NaN, no undefined, no null, no missing contract keys.");
  console.log("   totals/ramp/arcs/arsenal/archive/facets all present and well-formed.");
}

/* JSON round-trip: proves the result is a plain serialisable object */
var rt = JSON.parse(JSON.stringify(out));
console.log("JSON round-trip: " + (JSON.stringify(rt) === JSON.stringify(out) ? "identical" : "DIFFERS"));
console.log("serialised size: " + JSON.stringify(out).length + " bytes");
