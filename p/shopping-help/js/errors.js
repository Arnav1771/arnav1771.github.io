// =============================================
// errors.js — typed provider errors + key redaction
// =============================================

/**
 * Failure kinds. Only `rate-limit` and `server` are ever retried; everything
 * else is permanent for that model and we move on immediately.
 */
export const KINDS = Object.freeze({
  AUTH: 'auth', // 401 / 403 — bad or unauthorised key. Permanent.
  BAD_REQUEST: 'bad-request', // 400 — malformed. Permanent.
  RATE_LIMIT: 'rate-limit', // 429 / quota. Retryable.
  SERVER: 'server', // 5xx. Retryable.
  TIMEOUT: 'timeout', // AbortController fired.
  NETWORK: 'network', // fetch rejected (DNS, offline, CORS).
  EMPTY: 'empty', // 200 but no usable text. Permanent for this model.
  NO_KEY: 'no-key' // provider skipped, never called.
});

const RETRYABLE = new Set([KINDS.RATE_LIMIT, KINDS.SERVER]);

export function isRetryable(kind) {
  return RETRYABLE.has(kind);
}

export class ProviderError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'ProviderError';
    this.kind = opts.kind || KINDS.NETWORK;
    this.status = opts.status ?? null;
    this.provider = opts.provider || null;
    this.model = opts.model || null;
    this.retryAfterMs = opts.retryAfterMs ?? null;
    /** Gemini-only: the failure may clear if we drop the googleSearch tool. */
    this.retryUngrounded = opts.retryUngrounded === true;
  }
}

/**
 * Strip anything that looks like a credential out of a string.
 * Belt AND braces: we redact the known key values we were handed, and we also
 * scrub `key=`/`Bearer ` shaped fragments in case a provider echoes them back.
 * Every error message that can reach the UI or the console goes through this.
 */
export function redact(input, secrets = []) {
  let s = typeof input === 'string' ? input : String(input ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) {
      s = s.split(secret).join('[redacted]');
    }
  }
  s = s.replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]');
  s = s.replace(/(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, '$1[redacted]');
  s = s.replace(/\b(AIza|nvapi-|sk-)[A-Za-z0-9_\-]{8,}/g, '[redacted]');
  s = s.replace(/\bAQ\.[A-Za-z0-9_\-]{8,}/g, '[redacted]');
  return s;
}
