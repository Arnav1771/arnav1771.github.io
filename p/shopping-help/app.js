// =============================================
// app.js — loader
// =============================================
// The application lives in ./js/ as ES modules. This file stays at the root so
// the existing <script src="app.js"> tag keeps working, and uses a dynamic
// import() so it loads correctly whether index.html marks it type="module" or
// leaves it as a classic script.
//
// There is NO API key in this file, and there must never be one again: this
// repo is served publicly by GitHub Pages regardless of its private setting, so
// anything shipped here is world-readable. Keys are entered by the user at
// runtime and kept only in localStorage. See js/keys.js and tests/secrets.test.js.

import('./js/app.js').catch((err) => {
  console.error('Failed to load application modules', err);
  const host =
    document.getElementById('messages-container') || document.body;
  if (!host) return;
  const note = document.createElement('div');
  note.className = 'message-ai message-error';
  note.textContent =
    '⚠️ App load nahi ho paya. Page ko refresh karo — agar phir bhi na chale, browser cache clear karke try karo.';
  host.appendChild(note);
});
