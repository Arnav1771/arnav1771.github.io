// =============================================
// llm.js — the fallback orchestrator
// =============================================
// Contract: askWithFallback() NEVER throws and NEVER returns an HTTP status or
// a stack trace to the caller. Every path — no keys, bad key, quota, 500,
// offline, hang, empty answer, a bug in this file — resolves to a structured
// result with a friendly Hinglish `message` and a machine-readable `reason`
// the UI can act on.

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  MAX_RETRIES,
  MODELS,
  REQUEST_TIMEOUT_MS
} from './config.js';
import { KINDS, ProviderError, isRetryable, redact } from './errors.js';
import { secretsOf } from './keys.js';
import * as gemini from './providers/gemini.js';
import * as groq from './providers/groq.js';
import * as nvidia from './providers/nvidia.js';

export const PROVIDERS = { gemini, groq, nvidia };

/** Machine-readable outcomes the UI switches on. */
export const REASONS = Object.freeze({
  NO_KEYS: 'no-keys',
  INVALID_KEY: 'invalid-key',
  ALL_QUOTA: 'all-quota',
  TIMEOUT: 'timeout',
  NETWORK: 'network'
});

/** What the user reads when nothing worked. Hinglish, no jargon, actionable. */
export const FRIENDLY = Object.freeze({
  [REASONS.NO_KEYS]:
    'API key set nahi hai. Settings (⚙️) kholo aur apni Gemini ya NVIDIA key paste karo — key sirf aapke browser mein save hoti hai.',
  [REASONS.INVALID_KEY]:
    'Key kaam nahi kar rahi — galat ya expire ho gayi lagti hai. Settings (⚙️) mein jaake nayi key daalo.',
  [REASONS.ALL_QUOTA]:
    'Aaj ka free quota khatam ho gaya (sabhi models try kiye). 1-2 minute ruko, ya settings mein doosre provider ki key add karo.',
  [REASONS.TIMEOUT]:
    'Jawab aane mein bahut time lag gaya. Internet slow ho sakta hai — ek baar phir try karo.',
  [REASONS.NETWORK]:
    'Connect nahi ho paya. Internet check karo aur phir try karo.'
});

/** Human label for a model id. */
export function labelFor(modelId, registry = MODELS) {
  const entry = registry.find((m) => m.model === modelId);
  if (!entry) return modelId;
  return entry.label.split('—')[0].trim() || modelId;
}

/**
 * Build the attempt plan: the registry in its declared order, which is the
 * chain — grounded models first, ungrounded fallbacks after. There is no
 * selection to honour; the user never picks a model.
 *
 * Models whose provider has no key are skipped entirely rather than being
 * attempted and failed, so a keyless provider costs no request and no time.
 *
 * @returns {{candidates: Array, skipped: Array}}
 */
export function planAttempts(keys, registry = MODELS) {
  const candidates = [];
  const skipped = [];
  for (const entry of registry) {
    const key = keys && keys[entry.provider];
    if (key) candidates.push(entry);
    else skipped.push(entry);
  }
  return { candidates, skipped };
}

/** Exponential backoff with full-ish jitter; Retry-After wins when present. */
export function computeBackoff(retryIndex, retryAfterMs, random = Math.random) {
  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    return Math.min(retryAfterMs, BACKOFF_MAX_MS * 4);
  }
  const capped = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** retryIndex);
  return Math.round(capped * (0.5 + random() * 0.5));
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pick the reason that best explains a set of failures.
 * Priority: everything-was-auth beats quota beats timeout beats network,
 * because that ordering maps onto the most useful next action for the user.
 */
export function reasonFor(attempts) {
  const failures = attempts.filter((a) => !a.ok && a.kind !== KINDS.NO_KEY);
  if (failures.length === 0) return REASONS.NO_KEYS;
  const kinds = failures.map((a) => a.kind);
  if (kinds.every((k) => k === KINDS.AUTH)) return REASONS.INVALID_KEY;
  if (kinds.includes(KINDS.RATE_LIMIT)) return REASONS.ALL_QUOTA;
  if (kinds.includes(KINDS.TIMEOUT)) return REASONS.TIMEOUT;
  if (kinds.includes(KINDS.AUTH)) return REASONS.INVALID_KEY;
  return REASONS.NETWORK;
}

/**
 * Ask the LLM, walking the whole fallback chain.
 *
 * @param {object} options
 * @param {string} options.productUrl
 * @param {{gemini?: string, nvidia?: string, groq?: string}} options.keys
 * @param {Function} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries] retries per model on 429/5xx
 * @param {Function} [options.sleep]
 * @param {Function} [options.random]
 * @param {Function} [options.onAttempt] progress callback
 * @param {AbortSignal} [options.signal]
 * @param {object} [options.providers]
 * @param {Array} [options.registry]
 * @returns {Promise<object>} never rejects
 */
export async function askWithFallback(options = {}) {
  const {
    productUrl,
    keys = {},
    fetchImpl,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxRetries = MAX_RETRIES,
    sleep = defaultSleep,
    random = Math.random,
    onAttempt,
    signal,
    providers = PROVIDERS,
    registry = MODELS
  } = options;

  const secrets = secretsOf(keys);
  const attempts = [];
  const clean = (msg) => redact(msg, secrets);

  const record = (entry) => {
    attempts.push(entry);
    if (typeof onAttempt === 'function') {
      try {
        onAttempt(entry);
      } catch (_) {
        /* a broken UI callback must not break the request */
      }
    }
  };

  try {
    const { candidates, skipped } = planAttempts(keys, registry);

    for (const entry of skipped) {
      record({
        provider: entry.provider,
        model: entry.model,
        ok: false,
        kind: KINDS.NO_KEY,
        status: null,
        message: `Skipped: no ${entry.provider} key saved`
      });
    }

    if (candidates.length === 0) {
      return fail(REASONS.NO_KEYS, attempts);
    }

    for (const entry of candidates) {
      const provider = providers[entry.provider];
      if (!provider || typeof provider.call !== 'function') {
        record({
          provider: entry.provider,
          model: entry.model,
          ok: false,
          kind: KINDS.BAD_REQUEST,
          status: null,
          message: `No adapter for provider "${entry.provider}"`
        });
        continue;
      }

      let grounded = provider.supportsGrounding !== false;
      let droppedGrounding = false;
      let retryIndex = 0;

      // Per-model loop: bounded retries on 429/5xx, plus one free ungrounded
      // retry for Gemini that does not consume a retry budget.
      for (;;) {
        try {
          const out = await provider.call({
            key: keys[entry.provider],
            model: entry.model,
            productUrl,
            grounded,
            fetchImpl,
            timeoutMs,
            signal
          });
          record({
            provider: entry.provider,
            model: entry.model,
            ok: true,
            kind: null,
            status: 200,
            grounded: out.grounded === true,
            message: 'ok'
          });
          const failedOver = attempts.filter(
            (a) => !a.ok && a.kind !== KINDS.NO_KEY
          ).length;
          return {
            ok: true,
            text: out.text,
            provider: entry.provider,
            model: entry.model,
            label: entry.label,
            grounded: out.grounded === true,
            reason: null,
            message: null,
            answeredBy: labelFor(entry.model, registry),
            failedOver,
            attempts
          };
        } catch (err) {
          const pe =
            err instanceof ProviderError
              ? err
              : new ProviderError(
                  (err && err.message) || 'Unexpected provider failure',
                  { kind: KINDS.NETWORK, provider: entry.provider, model: entry.model }
                );

          const canDropGrounding =
            pe.retryUngrounded === true && grounded && !droppedGrounding;

          record({
            provider: entry.provider,
            model: entry.model,
            ok: false,
            kind: pe.kind,
            status: pe.status,
            grounded,
            retryAfterMs: pe.retryAfterMs ?? null,
            message: clean(pe.message)
          });

          // Gemini quota on a grounded call → same model, no search tool.
          if (canDropGrounding) {
            grounded = false;
            droppedGrounding = true;
            continue;
          }

          // 401/403/400/empty are permanent for this model: next model now.
          if (!isRetryable(pe.kind)) break;
          if (retryIndex >= maxRetries) break;

          const delayMs = computeBackoff(retryIndex, pe.retryAfterMs, random);
          attempts[attempts.length - 1].delayMs = delayMs;
          retryIndex += 1;
          await sleep(delayMs);
        }
      }
    }

    return fail(reasonFor(attempts), attempts);
  } catch (err) {
    // Last line of defence: a bug in here still returns a usable outcome.
    record({
      provider: null,
      model: null,
      ok: false,
      kind: KINDS.NETWORK,
      status: null,
      message: clean((err && err.message) || 'Unknown failure')
    });
    return fail(REASONS.NETWORK, attempts);
  }
}

function fail(reason, attempts) {
  return {
    ok: false,
    text: null,
    provider: null,
    model: null,
    label: null,
    grounded: false,
    reason,
    message: FRIENDLY[reason] || FRIENDLY[REASONS.NETWORK],
    answeredBy: null,
    failedOver: attempts.filter((a) => !a.ok && a.kind !== KINDS.NO_KEY).length,
    attempts
  };
}
