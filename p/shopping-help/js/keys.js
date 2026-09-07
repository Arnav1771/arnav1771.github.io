// =============================================
// keys.js — bring-your-own-key storage
// =============================================
// Keys live in the browser's localStorage, typed in by the user at runtime, or
// — for the owner's own deployment — in js/credentials.js, which ships empty.
// A key is never committed by this module, never bundled into it, and never
// sent anywhere except the provider endpoint it belongs to.
//
// PRECEDENCE: localStorage beats js/credentials.js, per provider. See
// resolveKeys() below.

import { PROVIDER_NAMES, STORAGE_KEYS } from './config.js';

/** In-memory fallback so the module still works with storage disabled. */
function memoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

let fallback = null;

export function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__sh_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch (_) {
    /* Safari private mode, disabled storage, etc. */
  }
  if (!fallback) fallback = memoryStore();
  return fallback;
}

function read(storage, name) {
  try {
    const v = storage.getItem(STORAGE_KEYS[name]);
    return typeof v === 'string' ? v.trim() : '';
  } catch (_) {
    return '';
  }
}

/** @returns {{gemini: string, nvidia: string, groq: string}} */
export function loadKeys(storage = defaultStorage()) {
  const out = {};
  for (const name of PROVIDER_NAMES) out[name] = read(storage, name);
  return out;
}

export function saveKeys(next, storage = defaultStorage()) {
  for (const name of PROVIDER_NAMES) {
    if (!(name in next)) continue;
    const value = typeof next[name] === 'string' ? next[name].trim() : '';
    try {
      if (value) storage.setItem(STORAGE_KEYS[name], value);
      else storage.removeItem(STORAGE_KEYS[name]);
    } catch (_) {
      /* storage full or blocked — the in-session value still works */
    }
  }
  return loadKeys(storage);
}

export function clearKeys(storage = defaultStorage()) {
  const blank = {};
  for (const name of PROVIDER_NAMES) blank[name] = '';
  saveKeys(blank, storage);
}

/**
 * Merge the browser's saved keys over the deployment's credential slots.
 * A provider with neither is left as '' and is skipped by the chain entirely.
 *
 * @param {object} stored  keys from loadKeys()
 * @param {object} [credentials] the CREDENTIALS object from js/credentials.js
 */
export function resolveKeys(stored = {}, credentials = {}) {
  const out = {};
  for (const name of PROVIDER_NAMES) {
    const fromStorage = typeof stored[name] === 'string' ? stored[name].trim() : '';
    const fromFile =
      typeof credentials[name] === 'string' ? credentials[name].trim() : '';
    out[name] = fromStorage || fromFile;
  }
  return out;
}

export function hasAnyKey(keys) {
  if (!keys) return false;
  return PROVIDER_NAMES.some((name) => Boolean(keys[name]));
}

/** Show a key without showing the key: "AIza…9fQ2". */
export function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Every secret currently in play — fed to redact() so none can leak. */
export function secretsOf(keys) {
  if (!keys) return [];
  return PROVIDER_NAMES.map((name) => keys[name]).filter(
    (k) => typeof k === 'string' && k.length >= 8
  );
}
