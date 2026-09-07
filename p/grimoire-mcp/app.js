/* Grimoire web — 100% client-side.
   Keys live only in this browser and are sent directly to the AI provider and
   GitHub. There is no backend. Mirrors the Grimoire engine's two-pass flow:
   plan -> generate each file -> create private repo -> push -> add IMP_DOCS. */
"use strict";

/* ---------- theme ---------- */
const root = document.documentElement;
const savedTheme = localStorage.getItem("grimoire.theme");
if (savedTheme) root.setAttribute("data-theme", savedTheme);
document.getElementById("theme").addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
  root.setAttribute("data-theme", next);
  localStorage.setItem("grimoire.theme", next);
});

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- models per provider ---------- */
const MODELS = {
  gemini: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
  anthropic: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5"],
};
const providerEl = document.getElementById("provider");
const modelEl = document.getElementById("model");
const aikeyLabel = document.getElementById("aikey-label");
function syncProvider() {
  const p = providerEl.value;
  modelEl.innerHTML = MODELS[p].map((m) => `<option>${m}</option>`).join("");
  aikeyLabel.textContent = p === "anthropic" ? "Anthropic API key" : "Gemini API key";
  const savedModel = localStorage.getItem("grimoire.model." + p);
  if (savedModel && MODELS[p].includes(savedModel)) modelEl.value = savedModel;
}
providerEl.addEventListener("change", () => { syncProvider(); loadKeys(); });
modelEl.addEventListener("change", () => localStorage.setItem("grimoire.model." + providerEl.value, modelEl.value));

/* ---------- key persistence (browser only) ---------- */
const F = { ghuser: "ghuser", ghtoken: "ghtoken", aikey: "aikey" };
function loadKeys() {
  if (localStorage.getItem("grimoire.remember") === "0") return;
  const p = providerEl.value;
  document.getElementById("ghuser").value = localStorage.getItem("grimoire.ghuser") || "";
  document.getElementById("ghtoken").value = localStorage.getItem("grimoire.ghtoken") || "";
  document.getElementById("aikey").value = localStorage.getItem("grimoire.aikey." + p) || "";
}
function saveKeys() {
  const remember = document.getElementById("remember").checked;
  localStorage.setItem("grimoire.remember", remember ? "1" : "0");
  if (!remember) {
    Object.keys(localStorage).filter((k) => k.startsWith("grimoire.gh") || k.startsWith("grimoire.aikey")).forEach((k) => localStorage.removeItem(k));
    return;
  }
  localStorage.setItem("grimoire.ghuser", document.getElementById("ghuser").value.trim());
  localStorage.setItem("grimoire.ghtoken", document.getElementById("ghtoken").value.trim());
  localStorage.setItem("grimoire.aikey." + providerEl.value, document.getElementById("aikey").value.trim());
}
syncProvider(); loadKeys();

/* ---------- output log ---------- */
const out = document.getElementById("output");
let logEl;
function startLog() {
  out.hidden = false;
  out.innerHTML = '<pre class="log"></pre>';
  logEl = out.querySelector(".log");
  out.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function log(msg, cls) { logEl.innerHTML += (cls ? `<span class="${cls}">${msg}</span>` : msg) + "\n"; out.scrollTop = out.scrollHeight; }

/* ---------- helpers ---------- */
const b64 = (str) => btoa(unescape(encodeURIComponent(str)));
const stripFence = (t, ext) => t.replace(new RegExp("^```" + (ext || "\\w*") + "\\n?"), "").replace(/\n?```$/,"").trim();
const safeName = (n) => (n || "generated-app").replace(/[^a-zA-Z0-9-]/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "generated-app";

/* ---------- provider calls ---------- */
async function callGemini(key, model, system, prompt, json, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Gemini " + r.status + ": " + (await r.text()).slice(0, 200));
  const d = await r.json();
  // Skip "thought" parts (thinking models emit them); keep only real output text.
  return (d.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
}
async function callAnthropic(key, model, system, prompt, _json, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key, "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true", "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error("Anthropic " + r.status + ": " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}
function aiCaller(provider) { return provider === "anthropic" ? callAnthropic : callGemini; }

/* ---------- GitHub push ---------- */
async function gh(token, path, method, body) {
  const r = await fetch("https://api.github.com" + path, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}

/* ---------- IMP_DOCS (client-side, mirrors the engine) ---------- */
function impDocs(repoName, description, stack, prompt, files) {
  const list = files.map((f) => "- `" + f.path + "`").join("\n");
  return [
    ["IMP_DOCS/HANDOFF.md", `# HANDOFF — ${repoName} (v1)\n\n## Goal\n${description}\n\n## Tech stack\n${stack.join(", ")}\n\n## Files\n${list}\n\n## How to run\nSee README.md.\n\n## Next steps\n1. Install deps and run.\n2. Exercise the main flow.\n3. Add tests.\n`],
    ["IMP_DOCS/PROMPT_TRAIL.md", `# PROMPT_TRAIL — ${repoName}\n\n### Initial build (via grimoire web)\n- **Prompt:** ${prompt}\n- **Result:** ${files.length} files; stack: ${stack.join(", ")}.\n`],
    ["IMP_DOCS/README.md", `# IMP_DOCS — ${repoName}\n\nProject docs generated with the app. Start with HANDOFF.md.\n`],
  ];
}

/* ---------- main flow ---------- */
document.getElementById("gen").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  saveKeys();
  const provider = providerEl.value, model = modelEl.value;
  const prompt = document.getElementById("prompt").value.trim();
  const ghuser = document.getElementById("ghuser").value.trim();
  const token = document.getElementById("ghtoken").value.trim();
  const key = document.getElementById("aikey").value.trim();
  const btn = document.getElementById("build");

  startLog();
  if (!prompt || !token || !ghuser || !key) { log("Missing a field — need a prompt, GitHub username + token, and the provider key.", "err"); return; }
  btn.disabled = true;
  const call = aiCaller(provider);
  try {
    // Pass 1: plan
    log(`⚙️  Planning with ${provider}/${model}…`);
    const planSys = 'You are an expert full-stack app architect. Return ONLY JSON (no markdown): {"repo_name":"kebab-case","description":"one sentence","tech_stack":["..."],"files":[{"path":"...","description":"..."}]}';
    let planRaw = await call(key, model, planSys, prompt, true, 8192);
    let plan;
    try { plan = JSON.parse(stripFence(planRaw)); }
    catch {
      const m = planRaw.match(/\{[\s\S]*\}/);   // tolerate any preamble/wrapping
      if (m) { try { plan = JSON.parse(m[0]); } catch {} }
    }
    if (!plan || !plan.files) throw new Error("Could not parse the plan JSON from the model. Try a more specific prompt.");
    const repoName = safeName(plan.repo_name);
    const stack = plan.tech_stack || [];
    const specFiles = (plan.files || []).slice(0, 15);
    log(`📋 Plan: ${repoName} — ${specFiles.length} files (${stack.join(", ") || "auto"})`, "ok");

    // Pass 2: generate each file
    const context = `App: ${plan.description}\nStack: ${stack.join(", ")}\nFiles:\n` + specFiles.map((f) => `- ${f.path}: ${f.description}`).join("\n");
    const files = [];
    for (const spec of specFiles) {
      const ext = (spec.path.split(".").pop() || "txt");
      const sys = `You are an expert developer. Generate the file ${spec.path} (${spec.description}).\nProject context:\n${context}\nReturn ONLY the raw file content — no markdown fences, no commentary.`;
      try {
        let content = await call(key, model, sys, `Generate ${spec.path}: ${spec.description}`, false, 16384);
        content = stripFence(content, ext);
        files.push({ path: spec.path, content });
        log(`  ✓ ${spec.path}`);
      } catch (e) { log(`  ⚠ skipped ${spec.path}: ${e.message}`, "err"); }
    }
    if (!files.some((f) => /readme\.md/i.test(f.path))) files.unshift({ path: "README.md", content: `# ${repoName}\n\n${plan.description}\n\n## Tech Stack\n${stack.join(", ")}\n` });
    impDocs(repoName, plan.description, stack, prompt, files).forEach(([p, c]) => files.push({ path: p, content: c }));

    // Create private repo
    log(`🐙 Creating private GitHub repo…`);
    let res = await gh(token, "/user/repos", "POST", { name: repoName, description: plan.description, private: true, auto_init: false });
    if (res.status === 422) { const alt = repoName + "-" + Date.now().toString().slice(-6); log(`  name taken, using ${alt}`); res = await gh(token, "/user/repos", "POST", { name: alt, description: plan.description, private: true, auto_init: false }); }
    if (!res.ok) throw new Error("GitHub create repo " + res.status + ": " + (await res.text()).slice(0, 200));
    const repo = await res.json();
    const owner = repo.owner.login, name = repo.name;
    log(`  ✓ ${repo.html_url}`, "ok");

    // Push files
    log(`📤 Pushing ${files.length} files…`);
    let pushed = 0;
    for (const f of files) {
      const r = await gh(token, `/repos/${owner}/${name}/contents/${f.path.split("/").map(encodeURIComponent).join("/")}`, "PUT", { message: `feat: add ${f.path}`, content: b64(f.content) });
      if (r.ok) { pushed++; } else { log(`  ⚠ ${f.path}: ${r.status}`, "err"); }
    }
    log(`  ✓ pushed ${pushed}/${files.length} files`, "ok");

    // Done
    logEl.innerHTML += `\n<span class="ok">🎉 Done!</span> Your repo: <a href="${repo.html_url}" target="_blank" rel="noopener">${repo.html_url}</a>\n` +
      `See <a href="${repo.html_url}/blob/main/IMP_DOCS/HANDOFF.md" target="_blank" rel="noopener">IMP_DOCS/HANDOFF.md</a> for how to run it. (Repo is private.)\n`;
  } catch (e) {
    log("❌ " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
});
