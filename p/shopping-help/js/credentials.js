// =============================================
// credentials.js — the owner's key slots
// =============================================
// PASTE YOUR OWN API KEYS BETWEEN THE QUOTES BELOW.
//
// This is the SINGLE place to rotate keys for the deployed page: change a value
// here, redeploy, done. Nothing else in the codebase hardcodes a key.
//
// Ships EMPTY. A provider with an empty slot and no browser-stored key is
// skipped entirely — it is never called.
//
// PRECEDENCE — a key typed into Settings and saved in the browser's
// localStorage OVERRIDES the value in this file, per provider. This file is the
// fallback, so the deployed page works for a visitor who has typed nothing.
// See resolveKeys() in js/keys.js.
//
// READ THIS BEFORE PASTING: this repository is private, but GitHub Pages serves
// the files it deploys to anyone with the URL, and every byte of this module is
// downloaded by the browser. A key pasted here is therefore a key you have
// chosen to publish. Use a key you are willing to rotate, and rotate it here.

/** @type {{nvidia: string, groq: string, gemini: string}} */
export const CREDENTIALS = {
  // https://build.nvidia.com/ → Get API Key
  nvidia: '',
  // https://console.groq.com/keys
  groq: '',
  // https://aistudio.google.com/app/apikey
  gemini: ''
};

export default CREDENTIALS;
