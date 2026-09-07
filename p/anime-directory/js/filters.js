// filters.js — pure search / filter / sort / paginate. No DOM, no side effects.

const norm = (s) => String(s ?? '').toLowerCase().trim();

/**
 * Full-text search over title, English title, and genres.
 * An empty / whitespace query returns the list unchanged.
 */
export function searchAnime(list, query) {
  const q = norm(query);
  if (!q) return [...list];
  return list.filter((a) => {
    const hay = [a.title, a.title_english, ...(a.genres || [])].map(norm).join(' ');
    return hay.includes(q);
  });
}

/** Keep anime that carry `genre`. `genre === 'All'` (or falsy) is a no-op. */
export function filterByGenre(list, genre) {
  if (!genre || genre === 'All') return [...list];
  const g = norm(genre);
  return list.filter((a) => (a.genres || []).some((x) => norm(x) === g));
}

/** Keep anime of a given type (TV, Movie, OVA…). `type === 'All'` is a no-op. */
export function filterByType(list, type) {
  if (!type || type === 'All') return [...list];
  const t = norm(type);
  return list.filter((a) => norm(a.type) === t);
}

const SORTERS = {
  score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
  rank: (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity),
  popularity: (a, b) => (a.popularity ?? Infinity) - (b.popularity ?? Infinity),
  members: (a, b) => (b.members ?? 0) - (a.members ?? 0),
  year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  title: (a, b) => norm(a.title_english || a.title).localeCompare(norm(b.title_english || b.title)),
};

/** Return a NEW sorted array. Unknown keys fall back to `score`. */
export function sortAnime(list, key = 'score') {
  const sorter = SORTERS[key] || SORTERS.score;
  return [...list].sort(sorter);
}

/** Unique, alphabetically sorted genre list across the collection. */
export function collectGenres(list) {
  const set = new Set();
  for (const a of list) for (const g of a.genres || []) if (g) set.add(g);
  return ['All', ...[...set].sort((x, y) => x.localeCompare(y))];
}

/** Unique, sorted media types across the collection. */
export function collectTypes(list) {
  const set = new Set();
  for (const a of list) if (a.type) set.add(a.type);
  return ['All', ...[...set].sort((x, y) => x.localeCompare(y))];
}

/** Slice into a page. Clamps `page` into [1, totalPages]. */
export function paginate(list, page = 1, perPage = 12) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    items: list.slice(start, start + perPage),
    page: safePage,
    perPage,
    total,
    totalPages,
  };
}

/**
 * The ranked shortlist: best `n` titles by MAL rank, score as the tie-break.
 * Duplicated ids collapse, non-arrays and bad `n` values are handled.
 */
export function topN(list, n = 10) {
  if (!Array.isArray(list)) return [];
  const count = Math.floor(Number(n));
  const take = Number.isFinite(count) && count > 0 ? count : 10;
  const seen = new Set();
  const unique = [];
  for (const a of list) {
    if (!a || typeof a !== 'object' || a.mal_id == null) continue;
    if (seen.has(a.mal_id)) continue;
    seen.add(a.mal_id);
    unique.push(a);
  }
  unique.sort(
    (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.score ?? -1) - (a.score ?? -1),
  );
  return unique.slice(0, take);
}

/** Compose the full query pipeline used by the UI. */
export function applyPipeline(list, { query = '', genre = 'All', type = 'All', sort = 'score' } = {}) {
  let out = searchAnime(list, query);
  out = filterByGenre(out, genre);
  out = filterByType(out, type);
  return sortAnime(out, sort);
}
