// =============================================
// providers/gemini.js — generateContent adapter
// =============================================
// The only provider here with real web-search grounding (the googleSearch
// tool). Grounded calls are the expensive ones and are the first thing Google
// rate-limits, so on a 429/quota we flag `retryUngrounded` and the orchestrator
// immediately re-runs this model with the tool removed — free, no backoff.
// That preserves the behaviour of the original single-file implementation.

import { ENDPOINTS } from '../config.js';
import { KINDS, ProviderError } from '../errors.js';
import { buildPrompt } from '../prompt.js';
import { postJson } from './http.js';

export const id = 'gemini';
export const supportsGrounding = true;

/** Pull the answer out of a generateContent response. */
export function extractText(data) {
  const candidate = data && data.candidates && data.candidates[0];
  if (!candidate) return '';
  const parts = (candidate.content && candidate.content.parts) || [];
  const text = parts
    .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  if (text) return text;
  if (typeof candidate.text === 'string') return candidate.text.trim();
  return '';
}

export function buildBody(prompt, grounded) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  };
  if (grounded) body.tools = [{ googleSearch: {} }];
  return body;
}

export function buildUrl(model, key) {
  return `${ENDPOINTS.gemini}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
}

/**
 * @param {object} opts {key, model, productUrl, grounded, fetchImpl, timeoutMs, signal}
 * @returns {Promise<{text: string, grounded: boolean}>}
 */
export async function call(opts) {
  const { key, model, productUrl } = opts;
  const grounded = opts.grounded !== false;
  if (!key) {
    throw new ProviderError('No Gemini key configured', {
      kind: KINDS.NO_KEY,
      provider: id,
      model
    });
  }

  let data;
  try {
    data = await postJson({
      url: buildUrl(model, key),
      body: buildBody(buildPrompt(productUrl, { grounded }), grounded),
      headers: { Accept: 'application/json' },
      provider: id,
      model,
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal
    });
  } catch (err) {
    // Quota on a grounded call: the same model may still answer without the
    // search tool. Tell the orchestrator to retry ungrounded straight away.
    if (
      err instanceof ProviderError &&
      err.kind === KINDS.RATE_LIMIT &&
      grounded
    ) {
      err.retryUngrounded = true;
    }
    throw err;
  }

  const text = extractText(data);
  if (!text) {
    const blocked =
      data &&
      data.promptFeedback &&
      data.promptFeedback.blockReason;
    throw new ProviderError(
      blocked
        ? `Response blocked by safety filter (${blocked})`
        : 'Model returned an empty answer',
      { kind: KINDS.EMPTY, provider: id, model }
    );
  }
  return { text, grounded };
}
