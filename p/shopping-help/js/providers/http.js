// =============================================
// providers/http.js — shared transport
// =============================================
// One place that knows how to: bound a request with AbortController, classify
// an HTTP status into a retry decision, and read Retry-After. Both provider
// adapters go through it so their failure semantics are identical.

import { KINDS, ProviderError } from '../errors.js';
import { REQUEST_TIMEOUT_MS, RETRY_AFTER_CAP_MS } from '../config.js';

/**
 * Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds.
 * Returns null when absent/unparseable. Capped so a hostile header cannot
 * park the UI for an hour.
 */
export function parseRetryAfter(value, nowMs = Date.now()) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.min(Math.round(parseFloat(raw) * 1000), RETRY_AFTER_CAP_MS);
  }
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(at - nowMs, 0), RETRY_AFTER_CAP_MS);
}

/** Map an HTTP status onto a failure kind. */
export function kindForStatus(status) {
  if (status === 401 || status === 403) return KINDS.AUTH;
  if (status === 429) return KINDS.RATE_LIMIT;
  if (status >= 500) return KINDS.SERVER;
  if (status === 408) return KINDS.TIMEOUT;
  if (status >= 400) return KINDS.BAD_REQUEST;
  return KINDS.SERVER;
}

function headerOf(response, name) {
  try {
    if (response && response.headers && typeof response.headers.get === 'function') {
      return response.headers.get(name);
    }
  } catch (_) {
    /* headerless mock */
  }
  return null;
}

async function readBody(response) {
  try {
    const text = await response.text();
    try {
      return { text, json: JSON.parse(text) };
    } catch (_) {
      return { text, json: null };
    }
  } catch (_) {
    return { text: '', json: null };
  }
}

/**
 * POST JSON, bounded by a timeout, returning parsed JSON.
 * Throws ProviderError for every failure path — callers never see a raw
 * TypeError, DOMException, or unparsed body.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {object} opts.body
 * @param {object} [opts.headers]
 * @param {Function} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 * @param {string} opts.provider
 * @param {string} opts.model
 * @param {AbortSignal} [opts.signal] external cancel (user pressed stop)
 */
export async function postJson(opts) {
  const {
    url,
    body,
    headers = {},
    provider,
    model,
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal
  } = opts;
  const fetchImpl =
    opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (typeof fetchImpl !== 'function') {
    throw new ProviderError('fetch is unavailable in this environment', {
      kind: KINDS.NETWORK,
      provider,
      model
    });
  }

  const controller =
    typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  let timer = null;
  if (controller && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch (_) {
        /* already aborted */
      }
    }, timeoutMs);
    // Deliberately NOT unref'd: this timer is the only thing that will ever
    // settle a hung request, so it must keep the event loop alive.
  }
  const onExternalAbort = () => {
    try {
      controller && controller.abort();
    } catch (_) {
      /* noop */
    }
  };
  if (signal && controller) {
    if (signal.aborted) onExternalAbort();
    else if (typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
  } catch (err) {
    if (timedOut) {
      throw new ProviderError(`Request timed out after ${timeoutMs}ms`, {
        kind: KINDS.TIMEOUT,
        provider,
        model
      });
    }
    const name = err && err.name;
    if (name === 'AbortError') {
      throw new ProviderError('Request aborted', {
        kind: KINDS.TIMEOUT,
        provider,
        model
      });
    }
    throw new ProviderError(
      `Network request failed: ${(err && err.message) || 'unknown error'}`,
      { kind: KINDS.NETWORK, provider, model }
    );
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }

  const status = typeof response.status === 'number' ? response.status : 0;
  const ok = response.ok !== undefined ? response.ok : status >= 200 && status < 300;

  if (!ok) {
    const { text, json } = await readBody(response);
    const apiMessage =
      (json && json.error && (json.error.message || json.error.code)) ||
      (json && json.message) ||
      (text || '').slice(0, 300) ||
      `HTTP ${status}`;
    let kind = kindForStatus(status);
    // Some backends report exhausted quota as 400/403 with "quota" in the body.
    if (kind !== KINDS.RATE_LIMIT && /quota|rate.?limit/i.test(String(apiMessage))) {
      kind = KINDS.RATE_LIMIT;
    }
    throw new ProviderError(String(apiMessage), {
      kind,
      status,
      provider,
      model,
      retryAfterMs: parseRetryAfter(headerOf(response, 'retry-after'))
    });
  }

  const { text, json } = await readBody(response);
  if (json == null) {
    throw new ProviderError(
      `Could not parse response body: ${(text || '').slice(0, 120)}`,
      { kind: KINDS.EMPTY, status, provider, model }
    );
  }
  return json;
}
