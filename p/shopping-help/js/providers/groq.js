// =============================================
// providers/groq.js — OpenAI-compatible adapter
// =============================================
// POST https://api.groq.com/openai/v1/chat/completions with
// `Authorization: Bearer <key>`. Identical dialect to NVIDIA, so the actual
// request/response logic is shared and lives in openai-compatible.js — this
// file only supplies the id, the endpoint and the no-key message.
//
// Groq has no web-search tool either: it is a speed play on top of open-weight
// models, not a research engine. Its answers are ungrounded and the UI says so.

import { ENDPOINTS } from '../config.js';
import {
  buildBody,
  callChatCompletions,
  extractText
} from './openai-compatible.js';

export const id = 'groq';
export const supportsGrounding = false;

export { buildBody, extractText };

/**
 * @param {object} opts {key, model, productUrl, fetchImpl, timeoutMs, signal}
 * @returns {Promise<{text: string, grounded: boolean}>}
 */
export async function call(opts) {
  return callChatCompletions({
    ...opts,
    id,
    url: ENDPOINTS.groq,
    noKeyMessage: 'No Groq key configured'
  });
}
