// =============================================
// providers/nvidia.js — OpenAI-compatible adapter
// =============================================
// Thin wrapper: the request/response logic is shared with Groq and lives in
// providers/openai-compatible.js. NVIDIA has no web-search grounding, so every
// answer from here is ungrounded and must be disclosed as such.

import { ENDPOINTS } from '../config.js';
import {
  buildBody,
  callChatCompletions,
  extractText
} from './openai-compatible.js';

export const id = 'nvidia';
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
    url: ENDPOINTS.nvidia,
    noKeyMessage: 'No NVIDIA key configured'
  });
}
