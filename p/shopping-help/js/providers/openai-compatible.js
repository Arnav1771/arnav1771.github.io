// =============================================
// providers/openai-compatible.js — shared /chat/completions adapter
// =============================================
// NVIDIA (integrate.api.nvidia.com) and Groq (api.groq.com) both speak the
// OpenAI chat-completions dialect: same request body, same Bearer header, same
// choices[0].message.content response. This module owns that logic once so the
// two adapters cannot drift apart; each of them is only an id, an endpoint and
// a no-key message.
//
// NOTE: neither endpoint has any web-search grounding — there is no tool we can
// switch on to make them browse. Every answer from here takes the ungrounded
// prompt path (see PROMPT_UNGROUNDED_NOTE in js/prompt.js), which tells the
// model to reason from the URL plus prior knowledge and to say so rather than
// inventing reviews and prices.

import { MAX_TOKENS, TEMPERATURE } from '../config.js';
import { KINDS, ProviderError } from '../errors.js';
import { buildPrompt } from '../prompt.js';
import { postJson } from './http.js';

/** Pull the assistant text out of an OpenAI-shaped response. */
export function extractText(data) {
  const choice = data && data.choices && data.choices[0];
  if (!choice) return '';
  const message = choice.message || {};
  if (typeof message.content === 'string') return message.content.trim();
  // Some gateways return content as an array of parts.
  if (Array.isArray(message.content)) {
    return message.content
      .map((p) => (typeof p === 'string' ? p : p && p.text) || '')
      .join('')
      .trim();
  }
  if (typeof choice.text === 'string') return choice.text.trim();
  return '';
}

export function buildBody(model, prompt) {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    stream: false
  };
}

/**
 * One chat-completions call.
 *
 * @param {object} opts
 * @param {string} opts.id         provider id, for error attribution
 * @param {string} opts.url        chat-completions endpoint
 * @param {string} opts.noKeyMessage
 * @param {string} opts.key
 * @param {string} opts.model
 * @param {string} opts.productUrl
 * @param {Function} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{text: string, grounded: boolean}>} grounded is always false
 */
export async function callChatCompletions(opts) {
  const { id, url, noKeyMessage, key, model, productUrl } = opts;
  if (!key) {
    throw new ProviderError(noKeyMessage, {
      kind: KINDS.NO_KEY,
      provider: id,
      model
    });
  }

  const prompt = buildPrompt(productUrl, { grounded: false });
  const data = await postJson({
    url,
    body: buildBody(model, prompt),
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    provider: id,
    model,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
    signal: opts.signal
  });

  const text = extractText(data);
  if (!text) {
    throw new ProviderError('Model returned an empty answer', {
      kind: KINDS.EMPTY,
      provider: id,
      model
    });
  }
  return { text, grounded: false };
}
