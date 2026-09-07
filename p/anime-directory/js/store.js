// store.js — persisted anime lists (favorites, watch later). Storage is injected
// (localStorage-like: { getItem(key), setItem(key, value) }) so it is fully
// unit-testable, and the same guards protect every list.

const KEY = 'anime-dir:favorites:v1';
const WATCH_LATER_KEY = 'anime-dir:watch-later:v1';

/** In-memory storage implementing the localStorage subset we use. */
export function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/**
 * A guarded, persisted list of anime keyed by `mal_id`.
 * Shared by favorites and watch later so both keep the same invariants.
 */
export function createAnimeListStore(storage, key) {
  if (!storage) throw new Error('createAnimeListStore requires a storage backend');
  if (!key) throw new Error('createAnimeListStore requires a storage key');

  /** An entry is only usable if it is an object carrying a mal_id. */
  const isValid = (a) => Boolean(a) && typeof a === 'object' && a.mal_id != null;

  const read = () => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Drop any entry that isn't a usable record. A single null/garbage item
      // written by an older build must not poison every later read.
      return Array.isArray(parsed) ? parsed.filter(isValid) : [];
    } catch {
      // Corrupt payload — recover to an empty list rather than crashing.
      return [];
    }
  };

  const write = (list) => storage.setItem(key, JSON.stringify(list.filter(isValid)));

  const idOf = (a) => (a && typeof a === 'object' ? a.mal_id : a);

  return {
    key,
    list: () => read(),
    count: () => read().length,
    has: (anime) => {
      const id = idOf(anime);
      return read().some((a) => a.mal_id === id);
    },
    add: (anime) => {
      if (!isValid(anime)) return read();
      const list = read();
      if (!list.some((a) => a.mal_id === anime.mal_id)) list.push(anime);
      write(list);
      return list;
    },
    remove: (anime) => {
      const id = idOf(anime);
      const list = read().filter((a) => a.mal_id !== id);
      write(list);
      return list;
    },
    toggle: (anime) => {
      // Guard first: a null/id-less argument used to be stored verbatim, which
      // permanently corrupted the persisted list and made every later call throw.
      if (!isValid(anime)) return false;
      const list = read();
      const exists = list.some((a) => a.mal_id === anime.mal_id);
      const next = exists
        ? list.filter((a) => a.mal_id !== anime.mal_id)
        : [...list, anime];
      write(next);
      return !exists; // true if now in the list
    },
    clear: () => write([]),
  };
}

/** Favorites — the hearted titles. */
export function createFavoritesStore(storage) {
  if (!storage) throw new Error('createFavoritesStore requires a storage backend');
  return createAnimeListStore(storage, KEY);
}

/**
 * Watch later — bookmarks that survive a reload on phone and desktop because
 * they live under their own localStorage key, separate from favorites.
 */
export function createWatchLaterStore(storage) {
  if (!storage) throw new Error('createWatchLaterStore requires a storage backend');
  return createAnimeListStore(storage, WATCH_LATER_KEY);
}

export const STORAGE_KEYS = { favorites: KEY, watchLater: WATCH_LATER_KEY };
