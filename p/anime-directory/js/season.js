// season.js — anime broadcast-season maths and labels. Pure, no DOM.
//
// Follows MyAnimeList / Jikan quarters: Winter = Jan–Mar, Spring = Apr–Jun,
// Summer = Jul–Sep, Fall = Oct–Dec.

export const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];

/** Season name for a 1-based month, or null when the month is not 1–12. */
export function seasonFromMonth(month) {
  const m = Number(month);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return SEASONS[Math.floor((Math.ceil(m) - 1) / 3)];
}

/** `{ season, year }` for a date (defaults to now). Invalid dates return nulls. */
export function currentSeason(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return { season: null, year: null };
  return { season: seasonFromMonth(d.getMonth() + 1), year: d.getFullYear() };
}

/** "Summer 2026". Normalizes casing; falls back gracefully when data is thin. */
export function formatSeason(season, year) {
  const name = typeof season === 'string' && season.trim()
    ? season.trim().charAt(0).toUpperCase() + season.trim().slice(1).toLowerCase()
    : '';
  const y = Number(year);
  const yearText = Number.isFinite(y) && y > 0 ? String(Math.trunc(y)) : '';
  if (name && yearText) return `${name} ${yearText}`;
  if (name) return name;
  if (yearText) return yearText;
  return 'Season unknown';
}

/** Short stamp for the masthead: "SU26". Empty when the season is unknown. */
export function seasonCode(season, year) {
  const label = formatSeason(season, year);
  if (label === 'Season unknown') return '';
  const [name, y] = label.split(' ');
  const abbr = { Winter: 'WI', Spring: 'SP', Summer: 'SU', Fall: 'FA' }[name] || name.slice(0, 2).toUpperCase();
  return y ? `${abbr}${y.slice(-2)}` : abbr;
}

/** Season label for one anime, from its own season/year or its aired date. */
export function seasonLabel(anime) {
  if (!anime || typeof anime !== 'object') return 'Season unknown';
  if (anime.season) return formatSeason(anime.season, anime.year);
  const from = anime.aired?.from;
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) {
      const { season, year } = currentSeason(d);
      return formatSeason(season, year);
    }
  }
  return formatSeason(null, anime.year);
}

/** True when a title is on air right now. */
export function isAiring(anime) {
  if (!anime || typeof anime !== 'object') return false;
  if (anime.airing === true) return true;
  return String(anime.status || '').toLowerCase().includes('currently airing');
}

/** Keep only titles that belong to the given season/year. */
export function filterBySeason(list, season, year) {
  if (!Array.isArray(list)) return [];
  const want = formatSeason(season, year);
  if (want === 'Season unknown') return [...list];
  return list.filter((a) => seasonLabel(a) === want);
}
