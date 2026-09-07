// format.js — pure presentation helpers. No DOM, no side effects.

/** Preferred display title: English title if present, else the romaji title. */
export function titleOf(anime) {
  if (!anime) return '';
  return (anime.title_english && anime.title_english.trim()) || anime.title || 'Untitled';
}

/**
 * Format a MAL score (0–10) to two decimals, or a placeholder when missing.
 * Only real numbers (or numeric strings) format; `''`, `'  '` and booleans are
 * "missing", not `0.00` — `Number('')` is `0`, which used to invent a fake rating.
 */
export function formatScore(score) {
  if (typeof score === 'number') return Number.isFinite(score) ? score.toFixed(2) : 'N/A';
  if (typeof score !== 'string') return 'N/A';
  const trimmed = score.trim();
  if (!trimmed) return 'N/A';
  const n = Number(trimmed);
  return Number.isFinite(n) ? n.toFixed(2) : 'N/A';
}

/** Human episode count. */
export function formatEpisodes(n) {
  if (n === null || n === undefined || Number(n) <= 0 || Number.isNaN(Number(n))) return '? eps';
  const v = Number(n);
  return `${v} ${v === 1 ? 'ep' : 'eps'}`;
}

/** Release year or TBA. */
export function formatYear(y) {
  if (!y || Number.isNaN(Number(y))) return 'TBA';
  return String(y);
}

/** Compact member count: 12345 -> "12.3K", 2500000 -> "2.5M". */
export function formatMembers(n) {
  const v = Number(n);
  if (!v || Number.isNaN(v) || v < 0) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

/** Ordinal rank: 1 -> "#1"; missing -> "Unranked". */
export function formatRank(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n) || n <= 0) return 'Unranked';
  return `#${Math.trunc(n).toLocaleString('en-US')}`;
}

/** Popularity position: 42 -> "#42 most popular"; missing -> "—". */
export function formatPopularity(pos) {
  const n = Number(pos);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `#${Math.trunc(n).toLocaleString('en-US')}`;
}

/** Condense Jikan's duration string: "24 min per ep" -> "24 min/ep". */
export function formatDuration(duration) {
  const s = String(duration ?? '').trim();
  if (!s || s.toLowerCase() === 'unknown') return '—';
  return s
    .replace(/\s*\bper ep\b/i, '/ep')
    .replace(/\bhr\b/i, 'h')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Airing window: prefers Jikan's own string, else builds one from dates. */
export function formatAired(aired) {
  if (!aired) return '—';
  if (typeof aired === 'string') return aired.trim() || '—';
  if (aired.string && String(aired.string).trim()) return String(aired.string).trim();
  const day = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const from = day(aired.from);
  const to = day(aired.to);
  if (from && to) return `${from} – ${to}`;
  if (from) return `${from} – ongoing`;
  return '—';
}

/** Join a list for display, or an em dash when there is nothing to show. */
export function formatList(values, separator = ', ') {
  if (!Array.isArray(values)) return '—';
  const clean = values.map((v) => String(v ?? '').trim()).filter(Boolean);
  return clean.length ? clean.join(separator) : '—';
}

/** Any single text field, with an em dash for blanks and "Unknown". */
export function orDash(value) {
  const s = String(value ?? '').trim();
  if (!s || s.toLowerCase() === 'unknown') return '—';
  return s;
}

/** Truncate text to `n` chars on a word boundary, adding an ellipsis. */
export function truncate(text, n = 160) {
  if (!text) return '';
  const s = String(text).trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
