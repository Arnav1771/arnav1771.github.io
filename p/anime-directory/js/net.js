// net.js — request pacing, caching and retry for the Jikan client.
//
// Jikan allows roughly 3 requests/second and 60/minute. Every dependency here
// (clock, sleep, fetch, storage) is injected so all of it is unit-testable
// without a network or real timers.

const defaultNow = () => Date.now();
// Call through `globalThis` so the timer always has the receiver the browser
// requires, even if this function is later stored on or passed around as a
// property of some other object.
const defaultSleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

/**
 * Serialize tasks and keep at least `minIntervalMs` between starts.
 * Tasks run in submission order; a rejected task never stalls the queue.
 */
export function createLimiter({ minIntervalMs = 350, now = defaultNow, sleep = defaultSleep } = {}) {
  const gap = Math.max(0, Number(minIntervalMs) || 0);
  let nextFreeAt = 0;
  let chain = Promise.resolve();
  let queued = 0;

  const schedule = (task) => {
    queued += 1;
    const run = async () => {
      const wait = nextFreeAt - now();
      if (wait > 0) await sleep(wait);
      nextFreeAt = Math.max(nextFreeAt, now()) + gap;
      try {
        return await task();
      } finally {
        queued -= 1;
      }
    };
    const result = chain.then(run, run);
    // Swallow rejections on the chain itself, otherwise one failed request
    // would reject every request queued behind it.
    chain = result.then(() => {}, () => {});
    return result;
  };

  return {
    schedule,
    get queued() {
      return queued;
    },
    minIntervalMs: gap,
  };
}

/**
 * Two-tier cache: an in-memory Map fronting an optional `sessionStorage`-like
 * backend. Storage errors (private mode, quota) degrade to memory-only.
 */
export function createCache({
  storage = null,
  now = defaultNow,
  ttlMs = 5 * 60 * 1000,
  prefix = 'anime-dir:cache:v1:',
} = {}) {
  const mem = new Map();
  const ttl = Math.max(0, Number(ttlMs) || 0);
  const fresh = (entry) => Boolean(entry) && typeof entry === 'object' && entry.e > now();

  const readStorage = (key) => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(prefix + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!fresh(entry)) {
        try {
          storage.removeItem?.(prefix + key);
        } catch {
          /* ignore */
        }
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  };

  return {
    get(key) {
      const hit = mem.get(key);
      if (fresh(hit)) return hit.v;
      if (hit) mem.delete(key);
      const stored = readStorage(key);
      if (!stored) return undefined;
      mem.set(key, stored);
      return stored.v;
    },
    has(key) {
      return this.get(key) !== undefined;
    },
    set(key, value) {
      const entry = { v: value, e: now() + ttl };
      mem.set(key, entry);
      if (storage) {
        try {
          storage.setItem(prefix + key, JSON.stringify(entry));
        } catch {
          /* storage full or unavailable — memory tier still holds it */
        }
      }
      return value;
    },
    delete(key) {
      mem.delete(key);
      try {
        storage?.removeItem?.(prefix + key);
      } catch {
        /* ignore */
      }
    },
    clear() {
      mem.clear();
    },
    get size() {
      return mem.size;
    },
  };
}

/** Parse a `Retry-After` value (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value, now = defaultNow) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs > 0 ? Math.round(secs * 1000) : 0;
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - now());
}

/** Exponential backoff with a ceiling: 1x, 2x, 4x… of `baseMs`. */
export function backoffDelay(attempt, baseMs = 400, maxMs = 8000) {
  const base = Math.max(0, Number(baseMs) || 0);
  const n = Math.max(0, Math.floor(attempt) || 0);
  return Math.min(maxMs, base * 2 ** n);
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** A rejected request carries its HTTP status so callers can branch on it. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * JSON GET client: paced by `limiter`, memoised by `cache`, de-duplicated
 * while in flight, and retried with backoff on 429 / 5xx.
 */
export function createHttpClient({
  fetchImpl,
  limiter = createLimiter(),
  cache = createCache(),
  retries = 2,
  backoffMs = 400,
  maxBackoffMs = 8000,
  sleep = defaultSleep,
  now = defaultNow,
} = {}) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!doFetch) throw new Error('createHttpClient: no fetch implementation available');

  const inflight = new Map();

  const once = async (url) => {
    const res = await limiter.schedule(() => doFetch(url));
    if (res && res.ok) return { json: await res.json() };
    const status = res?.status ?? 0;
    const retryAfter = parseRetryAfter(res?.headers?.get?.('Retry-After'), now);
    return {
      error: new HttpError(status, `Jikan request failed: ${status} ${res?.statusText || ''}`.trim()),
      retryAfter,
      retryable: RETRYABLE.has(status),
    };
  };

  const fetchJson = async (url) => {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const out = await once(url);
      if (!out.error) return out.json;
      lastError = out.error;
      if (!out.retryable || attempt === retries) break;
      const wait = out.retryAfter ?? backoffDelay(attempt, backoffMs, maxBackoffMs);
      if (wait > 0) await sleep(Math.min(wait, maxBackoffMs));
    }
    throw lastError;
  };

  return {
    /** GET `url` as JSON. `key` defaults to the URL; pass `fresh` to bypass cache. */
    async getJson(url, { key = url, fresh = false } = {}) {
      if (!fresh) {
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
      }
      if (inflight.has(key)) return inflight.get(key);
      const promise = fetchJson(url)
        .then((json) => {
          cache.set(key, json);
          return json;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
    cache,
    limiter,
  };
}
