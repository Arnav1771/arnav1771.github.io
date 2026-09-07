// api.js — Jikan (MyAnimeList) v4 client + response mapping.
// fetch is injected so the mapper and client are unit-testable without network.
// All traffic goes through js/net.js: paced, cached, and retried on 429.

import { createHttpClient, createLimiter, createCache } from './net.js';

export const JIKAN_BASE = 'https://api.jikan.moe/v4';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const names = (arr) => (Array.isArray(arr) ? arr.map((x) => x?.name).filter(Boolean) : []);

/** Trailer watch URL from Jikan's trailer object, if any. */
export function trailerUrlOf(trailer) {
  if (!trailer || typeof trailer !== 'object') return '';
  if (trailer.url) return String(trailer.url);
  if (trailer.youtube_id) return `https://www.youtube.com/watch?v=${trailer.youtube_id}`;
  return '';
}

/** Map one raw Jikan anime record to our internal model (full metadata). */
export function mapJikanAnime(raw) {
  if (!raw) return null;
  const img =
    raw.images?.jpg?.large_image_url ||
    raw.images?.jpg?.image_url ||
    raw.images?.webp?.image_url ||
    '';
  return {
    mal_id: raw.mal_id,
    title: raw.title || raw.title_japanese || 'Untitled',
    title_english: raw.title_english || '',
    title_japanese: raw.title_japanese || '',
    synopsis: raw.synopsis || '',
    background: raw.background || '',
    score: typeof raw.score === 'number' ? raw.score : null,
    scored_by: num(raw.scored_by),
    rank: typeof raw.rank === 'number' ? raw.rank : null,
    popularity: num(raw.popularity),
    favoritesCount: num(raw.favorites),
    episodes: typeof raw.episodes === 'number' ? raw.episodes : null,
    duration: raw.duration || '',
    year: raw.year || raw.aired?.prop?.from?.year || null,
    season: raw.season || '',
    status: raw.status || '',
    airing: raw.airing === true,
    broadcast: raw.broadcast?.string || '',
    aired: {
      from: raw.aired?.from || '',
      to: raw.aired?.to || '',
      string: raw.aired?.string || '',
    },
    type: raw.type || '',
    source: raw.source || '',
    rating: raw.rating || '',
    members: typeof raw.members === 'number' ? raw.members : 0,
    genres: Array.isArray(raw.genres) ? raw.genres.map((g) => g.name).filter(Boolean) : [],
    themes: names(raw.themes),
    demographics: names(raw.demographics),
    studios: names(raw.studios),
    producers: names(raw.producers),
    trailer: trailerUrlOf(raw.trailer),
    image: img,
    url: raw.url || '',
  };
}

/** Normalize a Jikan list response into { items, pagination }. */
export function normalizeList(json) {
  const data = Array.isArray(json?.data) ? json.data : [];
  const items = data.map(mapJikanAnime).filter(Boolean);
  const p = json?.pagination || {};
  return {
    items,
    pagination: {
      current: p.current_page ?? 1,
      hasNext: Boolean(p.has_next_page),
      lastPage: p.last_visible_page ?? 1,
      // `items.total` is how many titles the whole query matches — the number
      // that tells a visitor the directory is thousands deep, not 25.
      total: typeof p.items?.total === 'number' ? p.items.total : items.length,
      perPage: typeof p.items?.per_page === 'number' ? p.items.per_page : items.length,
    },
  };
}

/**
 * Serialize params into a query string, dropping empty values.
 * Uses encodeURIComponent (space -> %20) rather than URLSearchParams (+) so
 * the URLs stay readable and cache keys stay stable.
 */
export function buildQuery(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/** `order_by` values Jikan accepts on /anime. */
export const CATALOG_ORDERS = new Set([
  'mal_id', 'title', 'start_date', 'end_date', 'episodes',
  'score', 'scored_by', 'rank', 'popularity', 'members', 'favorites',
]);

/** Media types Jikan accepts on /anime. */
export const CATALOG_TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music'];

/** Airing statuses Jikan accepts on /anime. */
export const CATALOG_STATUSES = ['airing', 'complete', 'upcoming'];

/**
 * Build the /anime path. This endpoint — unlike /top/anime, which stops at the
 * ranked head of the database — pages the ENTIRE MyAnimeList catalogue, and
 * takes every filter server-side.
 */
/*
 * Every optional parameter is opt-in.
 *
 * This used to default to order_by=score&sort=desc&sfw=true, so the plain
 * catalogue view could never be fetched without them -- and Jikan's filter and
 * search backend currently answers 504 "Jikan failed to connect to MyAnimeList"
 * for ANY parameter beyond `page`, while `/anime?page=N` itself returns 200 with
 * a full page of results. The app therefore failed on every single catalogue
 * request and permanently displayed the degraded ranked-feed notice, which read
 * as an upstream outage when it was in fact our own default query.
 *
 * Verified 2026-08-12:
 *   /anime                          200, 25 items
 *   /anime?page=1                   200, 25 items
 *   /anime?page=1&sfw=true          504
 *   /anime?page=1&order_by=score    504
 *   /anime?q=frieren                504
 */
export function catalogPath({
  page = 1,
  limit,
  q = '',
  orderBy = '',
  sort = '',
  type = '',
  genres = '',
  status = '',
  minScore = '',
  sfw = false,
} = {}) {
  const n = Math.floor(Number(page));
  return `/anime?${buildQuery({
    q: String(q ?? '').trim(),
    page: Number.isFinite(n) && n > 0 ? n : 1,
    limit: limit ? clampLimit(limit, 25) : '',
    order_by: orderBy && CATALOG_ORDERS.has(orderBy) ? orderBy : '',
    sort: orderBy && CATALOG_ORDERS.has(orderBy) ? (sort === 'asc' ? 'asc' : 'desc') : '',
    type: type && type !== 'All' ? type : '',
    genres: genres && genres !== 'All' ? genres : '',
    status: status && status !== 'All' ? status : '',
    min_score: minScore || '',
    sfw: sfw ? 'true' : '',
  })}`;
}

/** Clamp a requested `limit` into Jikan's accepted 1–25 window. */
export function clampLimit(limit, fallback = 10) {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(25, n);
}

export function createApi({
  fetchImpl,
  baseUrl = JIKAN_BASE,
  client,
  cacheStorage = null,
  minIntervalMs = 380,
  retries = 2,
  backoffMs = 400,
  ttlMs = 5 * 60 * 1000,
  sleep,
} = {}) {
  const http =
    client ||
    createHttpClient({
      fetchImpl,
      limiter: createLimiter({ minIntervalMs, ...(sleep ? { sleep } : {}) }),
      cache: createCache({ storage: cacheStorage, ttlMs }),
      retries,
      backoffMs,
      ...(sleep ? { sleep } : {}),
    });

  const getJson = (path, opts) => http.getJson(`${baseUrl}${path}`, opts);

  return {
    http,
    /** Top-ranked anime, paged. */
    async getTop(page = 1) {
      return normalizeList(await getJson(`/top/anime?page=${page}`));
    },
    /** The ranked "to watch" shortlist — Jikan caps `limit` at 25. */
    async getTopN(limit = 10) {
      const n = clampLimit(limit, 10);
      const { items, pagination } = normalizeList(await getJson(`/top/anime?limit=${n}`));
      return { items: items.slice(0, n), pagination };
    },
    /** Everything airing in the current season. */
    async getSeasonNow(page = 1) {
      return normalizeList(await getJson(`/seasons/now?page=${page}&sfw=true`));
    },
    /**
     * The whole database, paged and filtered server-side. Pass `q` (or use
     * `search`) to narrow it; omit it to browse all ~28k titles.
     */
    async getCatalog(opts = {}) {
      return normalizeList(await getJson(catalogPath(opts)));
    },
    /** Search by free-text query — same endpoint, so it pages the whole DB. */
    async search(query, page = 1, opts = {}) {
      return normalizeList(await getJson(catalogPath({ ...opts, q: query, page })));
    },
    /** The canonical genre list (id + name), for server-side genre filtering. */
    async getGenres() {
      const json = await getJson('/genres/anime');
      return (Array.isArray(json?.data) ? json.data : [])
        .map((g) => ({ id: g?.mal_id, name: g?.name, count: g?.count ?? 0 }))
        .filter((g) => g.id != null && g.name);
    },
    /** Full detail for a single title. */
    async getById(id) {
      const json = await getJson(`/anime/${id}/full`);
      return mapJikanAnime(json?.data);
    },
  };
}
