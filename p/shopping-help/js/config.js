// =============================================
// config.js — single source of truth
// =============================================
// Nothing secret lives here. API keys come from the browser's localStorage or
// from js/credentials.js, and localStorage wins (see resolveKeys in js/keys.js).
// A static site cannot hold a secret: every byte it serves is public to anyone
// who opens devtools.

/** Providers this app knows how to talk to, grounded-capable first. */
export const PROVIDER_NAMES = ['gemini', 'nvidia', 'groq'];

/**
 * Which providers can actually ground answers in live web search.
 * Neither NVIDIA's nor Groq's OpenAI-compatible endpoint has a built-in search
 * tool, so grounded research is Gemini-only. The prompt must still produce a
 * useful answer without it — see PROMPT_UNGROUNDED_NOTE in js/prompt.js — and
 * the UI must say so out loud — see UNGROUNDED_NOTICE in js/format.js.
 */
export const GROUNDING_CAPABLE = ['gemini'];

/** True when this provider can look things up on the live web. */
export function isGroundingCapable(provider) {
  return GROUNDING_CAPABLE.includes(provider);
}

/**
 * The model chain, in the exact order it is walked. There is no picker and no
 * "pinned model": the user never chooses, so this list IS the chain.
 *
 * Ordering rule — GROUNDED FIRST. The product's whole value is researching one
 * live product page, its reviews and its seller. Only Gemini can search, so a
 * model that cannot search is a degraded fallback, never the primary, however
 * strong its reasoning is. Ungrounded models sit below every grounded one and
 * their answers must disclose that they could not look anything up.
 *
 * Model ids are authoritative — do not "correct" them.
 */
export const MODELS = [
  // --- grounded: can actually research the page, the reviews and the seller ---
  {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash — newest, searches the web'
  },
  {
    provider: 'gemini',
    model: 'gemini-flash-latest',
    label: 'Gemini Flash (latest) — searches the web'
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash — stable, searches the web'
  },
  // --- ungrounded: answer from training data, cannot look anything up --------
  {
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    label: 'Nemotron 3 Super 120B — strongest offline reasoning'
  },
  {
    provider: 'nvidia',
    model: 'deepseek-ai/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash — offline reasoning'
  },
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B (Groq) — fast offline baseline'
  },
  // --- last resorts ---------------------------------------------------------
  // Flash-Lite is grounded too, but it is the lightweight model and by the time
  // the chain reaches here the three Gemini entries above have already failed,
  // which usually means the Gemini key itself is out of quota. It is kept as a
  // cheap last chance at a researched answer rather than as a primary.
  {
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    label: 'Gemini Flash-Lite (latest) — lightweight, searches the web'
  },
  {
    provider: 'nvidia',
    model: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    label: 'Nemotron Super 49B — offline, fast'
  },
  {
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    label: 'Nemotron 3 Ultra 550B — offline flagship (often busy)'
  }
];

/** Registry entry for a model id, or null. */
export function findModel(modelId) {
  return MODELS.find((m) => m.model === modelId) || null;
}

/** localStorage / sessionStorage keys. */
export const STORAGE_KEYS = {
  gemini: 'shoppingHelper.key.gemini',
  nvidia: 'shoppingHelper.key.nvidia',
  groq: 'shoppingHelper.key.groq',
  chat: 'chatHistory',
  unlocked: 'app_unlocked'
};

/** Endpoints. */
export const ENDPOINTS = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions'
};

/**
 * Network behaviour.
 *
 * Why 150 seconds: completions on these models were measured landing between
 * roughly 43s and 100s, so a 150s ceiling comfortably covers the slow-but-real
 * ones while still killing a genuinely hung call in two and a half minutes
 * instead of five. 300s was tried and was strictly worse — the success rate did
 * not move at all, the only difference being that failures took 300s to admit
 * they had failed. A hang is the worst failure mode; bound it.
 */
export const REQUEST_TIMEOUT_MS = 150000;
export const MAX_RETRIES = 2; // per model, on 429/5xx only
export const BACKOFF_BASE_MS = 700;
export const BACKOFF_MAX_MS = 8000;
export const RETRY_AFTER_CAP_MS = 20000;

/** Sampling. */
export const TEMPERATURE = 0.4;
export const MAX_TOKENS = 2048;

/**
 * Client-side gate. This is UI-gating, NOT security: it lives in the JS the
 * browser downloads, so anyone who opens devtools reads it in two seconds.
 * The only real protection is that each user brings their own API key.
 */
export const APP_PASSWORD = 'yes';
