// catalog.js — the headless controller behind the Directory and its search.
//
// It owns the query (page, text, genre, type, status, min score, sort), turns
// it into ONE server-side Jikan request per change, and guards against the
// stampede that rapid Next-clicking would otherwise cause: requests are
// debounced, and a response that has been superseded is discarded instead of
// painting stale titles over newer ones.
//
// No DOM here — app.js renders whatever `state` says.

/** UI sort key -> Jikan [order_by, sort]. */
export const SORT_MAP = {
  score: ['score', 'desc'],
  rank: ['rank', 'asc'],
  members: ['members', 'desc'],
  year: ['start_date', 'desc'],
  title: ['title', 'asc'],
  popularity: ['popularity', 'asc'],
};

const MIN_QUERY = 2;

/** Clamp a page into [1, lastPage]. `lastPage` of 0 / NaN means "unknown". */
export function clampPage(page, lastPage = 0) {
  const n = Math.floor(Number(page));
  const p = Number.isFinite(n) && n > 0 ? n : 1;
  const last = Math.floor(Number(lastPage));
  if (Number.isFinite(last) && last > 0) return Math.min(p, last);
  return p;
}

/** Everything the pager UI needs, derived from a catalog state. */
export function pagerInfo(state) {
  const page = clampPage(state?.page ?? 1);
  const lastPage = Math.max(1, Math.floor(Number(state?.pagination?.lastPage)) || 1);
  const total = Math.max(0, Math.floor(Number(state?.pagination?.total)) || 0);
  const loading = Boolean(state?.loading);
  return {
    page,
    lastPage,
    total,
    canPrev: page > 1 && !loading,
    canNext: (state?.pagination?.hasNext === true || page < lastPage) && !loading,
    label: `Page ${page.toLocaleString()} of ${lastPage.toLocaleString()}`,
  };
}

/** First-class capability matrix derived from catalogue state. */
export function getCapabilities(state) {
  const isDegraded = state?.endpoint === 'top';
  const isOffline = state?.source === 'offline';
  return {
    source: isOffline ? 'offline' : (isDegraded ? 'ranked-feed' : 'live'),
    catalogueAvailable: !isDegraded && !isOffline,
    searchAvailable: !isDegraded || isOffline,
    filtersAvailable: !isDegraded || isOffline,
    rankingsAvailable: true,
    cachedDataAvailable: true,
    retryAvailable: true,
    isDegraded,
  };
}

export function createCatalog({
  api,
  onChange = () => {},
  debounceMs = 220,
  // `setTimeout` / `clearTimeout` are Window methods: the browser enforces that
  // they are invoked with `window` as the receiver. Capturing them by shorthand
  // (`{ setTimeout, clearTimeout }`) and calling `timers.setTimeout(...)` would
  // invoke them on this plain object, which throws "'setTimeout' called on an
  // object that does not implement interface Window." Wrap instead of capture,
  // so the call always goes through the global and the seam stays injectable.
  timers = {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  },
} = {}) {
  const state = {
    query: '',
    genre: '',        // Jikan genre id, '' = all
    genreName: 'All', // label, also used to filter the local (offline / saved) lists
    type: 'All',
    status: 'All',
    minScore: '',
    sort: 'score',
    page: 1,
    items: [],
    // lastPage 0 = "not known yet" — nothing to clamp a page request against
    // until the first response tells us how deep the catalogue is.
    pagination: { current: 1, lastPage: 0, total: 0, hasNext: false, perPage: 25 },
    loading: false,
    error: null,
    endpoint: 'catalog', // 'catalog' = /anime, 'top' = the /top/anime fallback
  };

  let seq = 0;
  let timer = null;
  let pendingResolve = null;

  /** Drop a queued (not yet fired) request, resolving its caller with null. */
  function cancel() {
    if (timer) {
      timers.clearTimeout(timer);
      timer = null;
    }
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(null);
    }
  }

  /** The exact query params sent to Jikan for the current state. */
  function params() {
    // When sorting by score (the default), omit order_by & sort to avoid Jikan 504 backend timeouts.
    const [orderBy, sort] = state.sort === 'score' ? ['', ''] : (SORT_MAP[state.sort] || []);
    const q = state.query.trim();
    return {
      page: state.page,
      q: q.length >= MIN_QUERY ? q : '',
      orderBy: orderBy || '',
      sort: sort || '',
      type: state.type,
      genres: state.genre,
      status: state.status,
      minScore: state.minScore,
      // sfw is opt-in: sending it 504s on Jikan's current filter backend.
      sfw: false,
    };
  }

  /** True when the query is plain enough for /top/anime to answer it faithfully. */
  function isPlain(p) {
    const unset = (v) => !v || v === 'All';
    return !p.q && unset(p.genres) && unset(p.status) && unset(p.minScore) && unset(p.type)
      && (!p.orderBy || p.orderBy === 'score' || p.orderBy === 'rank');
  }

  /**
   * Fetch one page. /anime is the catalogue endpoint, but it depends on a
   * MyAnimeList backend that intermittently refuses connections (Jikan answers
   * 504). When the query carries no filters, /top/anime pages the same ~30k
   * titles in the same order, so we degrade to it rather than to the tiny
   * offline snapshot.
   */
  async function fetchPage(p) {
    try {
      const res = await api.getCatalog(p);
      state.endpoint = 'catalog';
      return res;
    } catch (err) {
      if (!isPlain(p) || typeof api.getTop !== 'function') throw err;
      const res = await api.getTop(p.page);
      state.endpoint = 'top';
      return res;
    }
  }

  async function run() {
    const mine = seq + 1;
    seq = mine;
    state.loading = true;
    state.error = null;
    onChange(state);
    try {
      const res = await fetchPage(params());
      if (mine !== seq) return null; // superseded — drop it
      state.items = res.items;
      state.pagination = res.pagination;
      const current = Math.floor(Number(res.pagination?.current));
      if (Number.isFinite(current) && current > 0) state.page = current;
    } catch (err) {
      if (mine !== seq) return null;
      state.error = err;
    } finally {
      if (mine === seq) {
        state.loading = false;
        onChange(state);
      }
    }
    return state.error ? null : state.items;
  }

  /** Fetch the current query. Rapid calls collapse into a single request. */
  function load({ immediate = false } = {}) {
    cancel();
    if (immediate || !debounceMs) return run();
    return new Promise((resolve) => {
      pendingResolve = resolve;
      timer = timers.setTimeout(() => {
        timer = null;
        pendingResolve = null;
        resolve(run());
      }, debounceMs);
    });
  }

  return {
    state,
    params,
    load,
    cancel,
    pager: () => pagerInfo(state),
    /** Move to a page. Returns true when the page actually changed. */
    setPage(page) {
      const next = clampPage(page, state.pagination.lastPage);
      if (next === state.page) return false;
      state.page = next;
      return true;
    },
    /** Any filter change resets to page 1 — page 40 of the old query is meaningless. */
    setFilters(patch = {}) {
      let changed = false;
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in state)) continue;
        if (state[k] === v) continue;
        state[k] = v;
        changed = true;
      }
      if (changed) state.page = 1;
      return changed;
    },
    setQuery(q) {
      const next = String(q ?? '');
      if (next === state.query) return false;
      state.query = next;
      state.page = 1;
      return true;
    },
    /** True once the text query is long enough to narrow the catalogue. */
    get searching() {
      return state.query.trim().length >= MIN_QUERY;
    },
  };
}
