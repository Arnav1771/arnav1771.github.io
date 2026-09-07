/* grimoire v0.7 QA session — live site, recorded video + report. */
import pw from "/home/dell/.canary/node_modules/playwright-core/index.js";
import fs from "node:fs";
const { chromium } = pw;

const BASE = "https://arnav1771.github.io/grimoire-MCP/";
const OUT = "/home/dell/grimoire-MCP/.qa";
const SHOTS = OUT + "/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrs = [];
function verdict(step, pass, evidence) {
  results.push({ step, pass, evidence });
  console.log((pass ? "PASS" : "FAIL") + " — " + step + " — " + evidence);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT + "/video", size: { width: 1280, height: 800 } },
});
ctx.on("page", (p) => {
  p.on("console", (m) => { if (m.type() === "error") consoleErrs.push(p.url().split("/").pop() + ": " + m.text().slice(0, 160)); });
  p.on("pageerror", (e) => consoleErrs.push(p.url().split("/").pop() + " PAGEERR: " + e.message.slice(0, 160)));
});
const page = await ctx.newPage();

/* 1 · landing */
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(3200);
const paint = await page.evaluate(() => {
  const c = document.getElementById("portal");
  if (!c) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let s = 0; for (let i = 3; i < d.length; i += 4001) s += d[i];
  return s;
});
const marq = await page.locator(".marq-track").count();
const cta = await page.locator(".portal-cta").isVisible();
await page.locator(".stats").scrollIntoViewIfNeeded();
await page.waitForTimeout(1600);
const statVals = await page.$$eval(".stat .n", (ns) => ns.map((n) => n.textContent));
await page.screenshot({ path: SHOTS + "/01-landing.png", fullPage: true });
verdict("Landing renders (portal paints, marquee, CONJURE, count-ups)",
  paint > 0 && marq === 1 && cta && statVals.join(",") === "15+,4,5,2,0",
  "canvas alpha-sum " + paint + "; stats [" + statVals.join(" ") + "]");

/* 2 · incantation flow */
await page.evaluate(() => window.scrollTo(0, 0));
await page.fill("#incantation", "a pomodoro timer web app");
await page.press("#incantation", "Enter");
await page.waitForURL("**/conjure.html*", { timeout: 15000 });
await page.waitForTimeout(1200);
const pref = await page.inputValue("#prompt");
await page.screenshot({ path: SHOTS + "/02-incantation-prefill.png" });
verdict("Incantation → conjure prefill", pref === "a pomodoro timer web app", 'prompt="' + pref + '"');

/* 3 · contract + chips */
const IDS = ["theme","prompt","provider","model","ghuser","ghtoken","aikey","aikey-label","remember","build","gen","output"];
const missing = [];
for (const id of IDS) if ((await page.locator("#" + id).count()) !== 1) missing.push(id);
const modelOpts = await page.locator("#model option").count();
await page.click('.prov-chip[data-p="anthropic"]');
await page.waitForTimeout(300);
const provVal = await page.inputValue("#provider");
const keyLabel = (await page.textContent("#aikey-label")).trim();
await page.click('.prov-chip[data-p="gemini"]');
const disabledChips = await page.locator(".prov-chip.off[disabled]").count();
await page.screenshot({ path: SHOTS + "/03-conjure-contract.png" });
verdict("Conjure contract + caster chips",
  missing.length === 0 && modelOpts > 0 && provVal === "anthropic" && keyLabel === "Anthropic API key" && disabledChips === 2,
  "missing:[" + missing.join(",") + "] modelOpts:" + modelOpts + " chip→" + provVal + " label:'" + keyLabel + "' disabled:" + disabledChips);

/* 4 · empty-submit validation */
const urlBefore = page.url();
await page.click("#build");
await page.waitForTimeout(900);
const urlAfter = page.url();
const invalid = await page.$eval("#prompt", (el) => el.matches(":invalid") || el.validationMessage.length > 0).catch(() => false);
const outShown = await page.$eval("#output", (el) => !el.hidden).catch(() => false);
await page.screenshot({ path: SHOTS + "/04-validation.png" });
verdict("Empty submit is safe", urlAfter === urlBefore && (invalid || outShown),
  invalid ? "native required validation on #prompt" : (outShown ? "app.js error line in #output" : "no feedback"));

/* 5 · docs try-it-out */
await page.goto(BASE + "docs.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
const sideLinks = await page.locator(".docs-nav a").count();
await page.fill("#tryit", "a chat app with rooms");
await page.click("#tryrun");
await page.waitForURL("**/conjure.html*", { timeout: 15000 });
await page.waitForTimeout(1000);
const pref2 = await page.inputValue("#prompt");
await page.screenshot({ path: SHOTS + "/05-docs-run-flow.png" });
verdict("Docs Try-it-out → Run → prefill", sideLinks >= 6 && pref2 === "a chat app with rooms",
  "sidebar links:" + sideLinks + ' prompt="' + pref2 + '"');

/* 6 · community live data */
await page.goto(BASE + "community.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const lbRows = await page.locator("#leaderboard li img").count();
const cmRows = await page.locator("#commits li a").count();
const lbText = (await page.textContent("#leaderboard")).slice(0, 60);
await page.screenshot({ path: SHOTS + "/06-community-live.png", fullPage: true });
verdict("Community live GitHub data (or graceful fallback)",
  lbRows > 0 || cmRows > 0 || /rate-limited/.test(lbText),
  "leaderboard avatars:" + lbRows + " commit links:" + cmRows + (lbRows ? " (LIVE data)" : " | " + lbText));

/* 7 · mobile */
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: OUT + "/video", size: { width: 390, height: 844 } },
});
mctx.on("page", (p) => {
  p.on("pageerror", (e) => consoleErrs.push("mobile PAGEERR: " + e.message.slice(0, 160)));
});
const mp = await mctx.newPage();
await mp.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
await mp.waitForTimeout(2800);
const mOver = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await mp.screenshot({ path: SHOTS + "/07-mobile.png", fullPage: true });
verdict("Mobile 390×844 — no horizontal overflow", mOver <= 0, "overflow " + mOver + "px");

/* wrap up: videos */
const vid1 = await page.video().path();
const vid2 = await mp.video().path();
await ctx.close(); await mctx.close(); await browser.close();

/* report.html */
const rows = results.map((r, i) =>
  `<tr><td>${i + 1}</td><td>${r.step}</td><td class="${r.pass ? "p" : "f"}">${r.pass ? "PASS" : "FAIL"}</td><td>${r.evidence.replace(/</g, "&lt;")}</td></tr>`).join("\n");
const shots = fs.readdirSync(SHOTS).map((f) => `<figure><img src="screenshots/${f}" loading="lazy"/><figcaption>${f}</figcaption></figure>`).join("\n");
const errs = consoleErrs.length ? "<ul>" + consoleErrs.map((e) => "<li>" + e.replace(/</g, "&lt;") + "</li>").join("") + "</ul>" : "<p class='p'>none — zero console errors across every page and step.</p>";
fs.writeFileSync(OUT + "/report.html", `<!doctype html><html><head><meta charset="utf-8"><title>Grimoire v0.7 QA — Canary-style session report</title>
<style>body{font:15px/1.6 system-ui;background:#120b1e;color:#f0e9f8;max-width:1000px;margin:2rem auto;padding:0 1rem}
h1{font-family:Georgia,serif}td,th{padding:.5rem .7rem;border-bottom:1px solid #3a2a5c;text-align:left;font-size:.85rem}
.p{color:#7ce8a8}.f{color:#ff7a7a}img{max-width:100%;border:1px solid #3a2a5c;border-radius:8px}
figure{margin:1.4rem 0}figcaption{font-size:.75rem;color:#a795c4}video{max-width:100%;border-radius:8px;border:1px solid #d9b45b}
code{background:#221636;padding:.1em .4em;border-radius:5px}</style></head><body>
<h1>Grimoire MCP — v0.7 live-site QA session</h1>
<p>Target: <code>${BASE}</code> · ${new Date().toISOString()} · headless Chromium 1280×800 + 390×844 · recorded session</p>
<h2>Verdicts</h2><table><tr><th>#</th><th>Step</th><th>Result</th><th>Evidence</th></tr>${rows}</table>
<h2>Console errors</h2>${errs}
<h2>Recording</h2><video controls src="recording.mp4"></video><p><code>recording-mobile.mp4</code> covers the mobile step.</p>
<h2>Screenshots</h2>${shots}
</body></html>`);

console.log(JSON.stringify({ passed: results.filter(r => r.pass).length, total: results.length, consoleErrs, vid1, vid2 }));
