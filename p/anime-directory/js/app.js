// app.js — DOM wiring for Broadcast, the anime directory. Pure logic lives in
// the sibling modules (net/api/filters/format/season/store); this file only
// orchestrates and touches the DOM.

import { createApi, CATALOG_TYPES } from './api.js';
import { createCatalog, pagerInfo, getCapabilities } from './catalog.js';
import { createFavoritesStore, createWatchLaterStore } from './store.js';
import {
  titleOf, formatScore, formatEpisodes, formatYear, formatMembers, truncate,
  formatRank, formatPopularity, formatDuration, formatAired, formatList, orDash,
} from './format.js';
import { applyPipeline, collectGenres, collectTypes, paginate, topN } from './filters.js';
import { currentSeason, formatSeason, seasonLabel, isAiring } from './season.js';

const PER_PAGE = 12; // local lists (offline snapshot, watch later, favorites)
const TOP_LIMIT = 10;
const $ = (sel) => document.querySelector(sel);
const nf = (n) => Number(n || 0).toLocaleString();

const STATUS_OPTIONS = [
  ['All', 'Any status'],
  ['airing', 'Airing now'],
  ['complete', 'Finished'],
  ['upcoming', 'Upcoming'],
];
const SCORE_OPTIONS = [['', 'Any score'], ['6', '6+'], ['7', '7+'], ['8', '8+'], ['9', '9+']];

const VIEWS = {
  browse: {
    title: 'Directory',
    note: 'The whole MyAnimeList catalogue, paged straight from the API — every filter runs server-side.',
    toolbar: true,
    pager: true,
  },
  airing: {
    title: 'This season',
    note: 'Everything broadcasting right now, straight from the current-season feed, page by page.',
    toolbar: false,
    pager: true,
  },
  top: {
    title: 'Ten to watch',
    note: 'The ten highest-ranked titles on MyAnimeList, in order.',
    toolbar: false,
    pager: false,
  },
  later: {
    title: 'Watch later',
    note: 'Saved on this device. It survives a reload on your phone and your desktop separately.',
    toolbar: true,
    pager: true,
  },
  favorites: {
    title: 'Favorites',
    note: 'The titles you hearted, kept in this browser.',
    toolbar: true,
    pager: true,
  },
};

const state = {
  view: 'browse',
  all: [],            // offline snapshot only — live browsing lives in `catalog`
  airing: [],         // one server-side page of the current season
  airingPage: 1,
  airingPagination: { current: 1, lastPage: 1, total: 0, hasNext: false },
  top: [],
  page: 1,            // local lists (offline / watch later / favorites)
  source: 'loading',  // 'live' | 'offline' | 'loading'
  season: currentSeason(new Date()),
  airingTotal: null,
  loading: false,
  error: null,
  genresReady: false,
  loaded: { airing: false, top: false },
};

function safeStorage(kind) {
  try {
    const store = kind === 'session' ? sessionStorage : localStorage;
    const k = '__anime_dir_probe__';
    store.setItem(k, '1');
    store.removeItem(k);
    return store;
  } catch {
    // Private mode / disabled storage — fall back to an in-memory shim.
    const m = new Map();
    return {
      getItem: (x) => (m.has(x) ? m.get(x) : null),
      setItem: (x, v) => m.set(x, String(v)),
      removeItem: (x) => m.delete(x),
    };
  }
}

// One API client for the page: ~2.6 req/s ceiling, 5-minute cache shared with
// sessionStorage so a reload does not re-spend the rate limit.
const api = createApi({ cacheStorage: safeStorage('session'), minIntervalMs: 380, retries: 2 });
const favorites = createFavoritesStore(safeStorage('local'));
const watchLater = createWatchLaterStore(safeStorage('local'));

// The Directory. Every page turn, filter and search is one throttled request;
// rapid clicks are debounced into one and superseded responses are dropped.
const catalog = createCatalog({
  api,
  debounceMs: 220,
  onChange: () => {
    if (state.view === 'browse' && state.source !== 'offline') render();
  },
});

// ---------- data ----------

/** Bring an offline dataset record up to the shape the UI renders. */
function fromOffline(rec) {
  if (!rec || typeof rec !== 'object') return null;
  return {
    title_english: '', title_japanese: '', synopsis: '', duration: '', source: '',
    season: '', broadcast: '', trailer: '', studios: [], themes: [], demographics: [],
    genres: [], rank: null, popularity: null, score: null, episodes: null, members: 0,
    ...rec,
    aired: rec.aired && typeof rec.aired === 'object' ? rec.aired : { from: '', to: '', string: '' },
    airing: String(rec.status || '').toLowerCase().includes('currently airing'),
  };
}

async function loadOffline() {
  const res = await fetch('./data/anime.json');
  const json = await res.json();
  const items = (json.data || []).map(fromOffline).filter(Boolean);
  if (!items.length) throw new Error('offline dataset is empty');
  state.all = items;
  state.airing = items.filter(isAiring);
  state.top = topN(items, TOP_LIMIT);
  state.source = 'offline';
  state.loaded = { airing: true, top: true };
  catalog.cancel();
  hydrateOfflineFilters();
}

/** One server-side page of the Directory (the whole catalogue, filtered). */
async function loadDirectory({ immediate = false } = {}) {
  const items = await catalog.load({ immediate });
  if (items === null && catalog.state.error) throw catalog.state.error;
  if (items === null) return;                       // superseded by a newer request
  if (!items.length && catalog.state.pagination.total === 0 && !catalog.searching
      && !catalog.state.genre && catalog.state.type === 'All') {
    throw new Error('empty response');
  }
  state.source = 'live';
  hydrateGenres();
}

/** One server-side page of the current season. */
async function loadAiring(page = state.airingPage) {
  const { items, pagination } = await api.getSeasonNow(page);
  state.airing = items;
  state.airingPage = pagination.current || page;
  state.airingPagination = pagination;
  state.airingTotal = pagination.total ? nf(pagination.total) : String(items.length);
  const stamped = items.find((a) => a.season);
  if (stamped) state.season = { season: stamped.season, year: stamped.year };
  state.loaded.airing = true;
}

async function loadTop() {
  if (state.loaded.top) return;
  const { items } = await api.getTopN(TOP_LIMIT);
  state.top = topN(items, TOP_LIMIT);
  state.loaded.top = true;
}

/** Load whatever the active view needs, with the offline dataset as the net. */
async function ensureData({ immediate = false } = {}) {
  if (state.view === 'later' || state.view === 'favorites') {
    render();
    return;
  }
  if (state.source === 'offline') {   // the bundled snapshot is already in memory
    render();
    return;
  }

  state.error = null;
  const usesSpinner = state.view !== 'browse'; // the catalog paints its own loading state
  if (usesSpinner) {
    state.loading = true;
    render();
  }
  try {
    if (state.view === 'browse') await loadDirectory({ immediate });
    else if (state.view === 'airing') { await loadAiring(); state.source = 'live'; }
    else if (state.view === 'top') { await loadTop(); state.source = 'live'; }
  } catch (err) {
    if (state.source === 'live') {
      state.error = err;
    } else {
      // Nothing has loaded yet — fall back to the bundled dataset.
      try {
        await loadOffline();
      } catch (fallbackErr) {
        state.error = fallbackErr;
      }
    }
  } finally {
    state.loading = false;
    render();
  }
}

// ---------- list selection ----------

/** True when the active view is paged by Jikan rather than sliced locally. */
function isServerPaged() {
  return state.source === 'live' && (state.view === 'browse' || state.view === 'airing');
}

/** Filter state for the local (offline / saved) lists, in `filters.js` terms. */
function localQuery() {
  const c = catalog.state;
  return { query: c.query, genre: c.genreName, type: c.type, sort: c.sort };
}

function baseList() {
  switch (state.view) {
    case 'airing': return state.airing;
    case 'top': return state.top;
    case 'later': return watchLater.list();
    case 'favorites': return favorites.list();
    default:
      return state.source === 'offline' ? state.all : catalog.state.items;
  }
}

function currentList() {
  const base = baseList();
  if (state.view === 'top') return topN(base, TOP_LIMIT);
  // Live pages arrive already searched, filtered and sorted by Jikan; filtering
  // them again client-side would only hide rows the server deliberately sent.
  if (isServerPaged()) return base;
  return applyPipeline(base, localQuery());
}

/** Pager numbers for the active view. */
function currentPager() {
  if (state.view === 'browse' && state.source === 'live') return pagerInfo(catalog.state);
  if (state.view === 'airing' && state.source === 'live') {
    return pagerInfo({
      page: state.airingPage,
      pagination: state.airingPagination,
      loading: state.loading,
    });
  }
  return null;
}

// ---------- render ----------

function render() {
  const conf = VIEWS[state.view];
  $('#viewTitle').textContent = conf.title;
  $('#viewNote').textContent = conf.note;
  $('#toolbar').hidden = !conf.toolbar;

  for (const btn of document.querySelectorAll('.rail-btn')) {
    const on = btn.dataset.view === state.view;
    btn.classList.toggle('is-current', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }

  $('#laterCount').textContent = watchLater.count();
  $('#favCount').textContent = favorites.count();
  $('#statLater').textContent = watchLater.count();
  $('#statAiring').textContent = state.airingTotal ?? (state.airing.length || '—');
  const catalogueSize = state.source === 'offline'
    ? state.all.length
    : catalog.state.pagination.total;
  $('#statRanked').textContent = catalogueSize ? nf(catalogueSize) : '—';
  $('#statRankedLabel').textContent = state.source === 'offline' ? 'In the snapshot' : 'In the catalogue';
  const banner = $('#offline');
  banner.hidden = state.source !== 'offline';
  $('#seasonStamp').textContent = formatSeason(state.season.season, state.season.year);
  $('#railAiringNote').textContent = formatSeason(state.season.season, state.season.year);
  $('#seasonSub').textContent =
    state.source === 'offline'
      ? 'Live data is unavailable, so this is the bundled snapshot of MyAnimeList metadata.'
      : 'Currently airing titles, ranked leaders, and full metadata for every entry.';
  setSourceChip();
  renderStrip();

  const grid = $('#grid');
  const ranked = $('#ranked');
  const skeletons = $('#skeletons');
  const empty = $('#empty');
  const errorBox = $('#error');
  const pager = $('#pager');

  const busy = state.loading || (state.view === 'browse' && catalog.state.loading);
  const viewError = state.error || (state.view === 'browse' ? catalog.state.error : null);

  // Loading
  if (busy && !baseList().length) {
    skeletons.hidden = false;
    if (!skeletons.childElementCount) renderSkeletons(skeletons);
    grid.hidden = true;
    ranked.hidden = true;
    empty.hidden = true;
    errorBox.hidden = true;
    pager.hidden = true;
    $('#count').textContent = 'Loading';
    setStatus('Fetching from MyAnimeList — requests are paced to stay under the rate limit.');
    return;
  }
  skeletons.hidden = true;
  setStatus('');

  // Error with nothing to show
  const list = currentList();
  if (viewError && !list.length) {
    errorBox.hidden = false;
    $('#errorBody').textContent = `${viewError.message}. Requests are throttled and retried, so this usually clears in a few seconds.`;
    grid.hidden = true;
    ranked.hidden = true;
    empty.hidden = true;
    pager.hidden = true;
    $('#count').textContent = 'No data';
    return;
  }
  errorBox.hidden = true;

  const caps = getCapabilities(catalog.state);
  const degradedBox = $('#degraded');
  if (degradedBox) {
    degradedBox.hidden = !(state.view === 'browse' && caps.isDegraded);
  }

  // Update input controls based on search/filter capabilities
  const disableControls = state.view === 'browse' && caps.isDegraded;
  ['#search', '#genre', '#type', '#airStatus', '#minScore', '#sort'].forEach((sel) => {
    const el = $(sel);
    if (el) {
      el.disabled = disableControls;
      if (disableControls) {
        el.setAttribute('title', '🔒 Temporarily unavailable (catalogue queries degraded)');
      } else {
        el.removeAttribute('title');
      }
    }
  });

  if (viewError) setStatus(`Last request failed: ${viewError.message}. Showing what is already loaded.`, true);
  else if (busy) setStatus('Fetching the next page from MyAnimeList…');
  else if (state.view === 'browse' && caps.isDegraded) {
    setStatus('Catalogue search is degraded — displaying ranked feed.', true);
  }

  if (state.view === 'top') {
    pager.hidden = true;
    grid.hidden = true;
    $('#count').textContent = `${list.length} ranked`;
    if (!list.length) return showEmpty(list);
    empty.hidden = true;
    ranked.hidden = false;
    ranked.replaceChildren(...list.map((a, i) => rankRow(a, i + 1)));
    return;
  }

  ranked.hidden = true;

  // Server-paged views render exactly what the API returned; local lists are
  // still sliced client-side because they genuinely are fixed arrays.
  const server = currentPager();
  let items;
  let info;
  if (server) {
    items = list;
    info = server;
    const scope = state.view === 'airing' ? 'airing this season' : 'titles';
    $('#count').textContent = `${nf(info.total)} ${scope}`;
  } else {
    const pageData = paginate(list, state.page, PER_PAGE);
    state.page = pageData.page;
    items = pageData.items;
    info = {
      page: pageData.page,
      lastPage: pageData.totalPages,
      total: pageData.total,
      canPrev: pageData.page > 1,
      canNext: pageData.page < pageData.totalPages,
      label: `Page ${pageData.page} of ${pageData.totalPages}`,
    };
    const suffix = state.source === 'offline' && state.view === 'browse' ? ' in the offline snapshot' : '';
    $('#count').textContent = `${nf(info.total)} title${info.total === 1 ? '' : 's'}${suffix}`;
  }

  if (!items.length) {
    grid.hidden = true;
    pager.hidden = true;
    return showEmpty(list);
  }

  empty.hidden = true;
  grid.hidden = false;
  grid.classList.toggle('is-busy', busy);
  grid.replaceChildren(...items.map(card));
  pager.hidden = info.lastPage <= 1 && info.page <= 1;
  $('#pageInfo').textContent = info.label;
  $('#prev').disabled = !info.canPrev;
  $('#next').disabled = !info.canNext;
  const jump = $('#pageJump');
  if (jump && document.activeElement !== jump) jump.value = String(info.page);
  if (jump) jump.max = String(info.lastPage);
  $('#pageTotal').textContent = `${nf(info.lastPage)} page${info.lastPage === 1 ? '' : 's'}`;
}

function showEmpty() {
  const empty = $('#empty');
  empty.hidden = false;
  const copy = {
    later: ['Your watch-later list is empty', 'Open any title and choose Watch later. Saved titles stay in this browser.'],
    favorites: ['No favorites yet', 'Heart a title in the directory and it will wait for you here.'],
    airing: ['Nothing on this page of the season', 'Go back a page — the season feed may have shrunk since it was loaded.'],
    browse: ['No titles match', 'MyAnimeList returned nothing for this combination. Widen the score, genre or type filter, or shorten the search.'],
    top: ['The ranking is unavailable', 'MyAnimeList did not return a ranked list. Try again in a moment.'],
  }[state.view];
  $('#emptyTitle').textContent = copy[0];
  $('#emptyBody').textContent = copy[1];
}

function renderSkeletons(host) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 8; i += 1) {
    const el = document.createElement('div');
    el.className = 'sk';
    el.innerHTML = '<div class="sk-poster"></div><div class="sk-line"></div><div class="sk-line short"></div>';
    frag.appendChild(el);
  }
  host.replaceChildren(frag);
}

function renderStrip() {
  const strip = $('#airingStrip');
  const items = (state.airing.length ? state.airing : state.all).slice(0, 8);
  if (!items.length) {
    strip.replaceChildren();
    return;
  }
  strip.replaceChildren(
    ...items.map((a) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button">
        <img loading="lazy" src="${escapeAttr(a.image)}" alt="" onerror="this.style.visibility='hidden'">
        <span class="strip-title">${escapeHtml(titleOf(a))}</span></button>`;
      li.querySelector('button').addEventListener('click', () => openDetail(a));
      return li;
    }),
  );
}

function actionRow(a) {
  const el = document.createElement('div');
  el.className = 'actions';
  const faved = favorites.has(a);
  const saved = watchLater.has(a);
  el.innerHTML = `
    <button type="button" class="act act-fav" aria-pressed="${faved}">
      <span aria-hidden="true">${faved ? '♥' : '♡'}</span> ${faved ? 'Hearted' : 'Favorite'}
    </button>
    <button type="button" class="act act-later" aria-pressed="${saved}">
      <span aria-hidden="true">${saved ? '✓' : '+'}</span> ${saved ? 'Saved' : 'Watch later'}
    </button>`;
  el.querySelector('.act-fav').addEventListener('click', () => {
    favorites.toggle(a);
    render();
  });
  el.querySelector('.act-later').addEventListener('click', () => {
    watchLater.toggle(a);
    render();
  });
  return el;
}

function card(a) {
  const el = document.createElement('article');
  el.className = 'card';
  const airing = isAiring(a);
  el.innerHTML = `
    <div class="poster">
      <img loading="lazy" src="${escapeAttr(a.image)}" alt="" onerror="this.style.visibility='hidden'">
      <button type="button" class="open" aria-label="Open details for ${escapeAttr(titleOf(a))}"></button>
      <span class="poster-score"><small>Score</small>${formatScore(a.score)}</span>
      ${airing ? '<span class="poster-flag">On air</span>' : ''}
    </div>
    <div class="card-body">
      <h3 class="card-title"><button type="button">${escapeHtml(titleOf(a))}</button></h3>
      <dl class="spec">
        <dt>Rank</dt><dd>${formatRank(a.rank)}</dd>
        <dt>Run</dt><dd>${escapeHtml(orDash(a.type))} · ${formatEpisodes(a.episodes)} · ${formatYear(a.year)}</dd>
        <dt>Studio</dt><dd>${escapeHtml(formatList(a.studios))}</dd>
        <dt>Members</dt><dd>${formatMembers(a.members)}</dd>
      </dl>
      <ul class="tags">${(a.genres || []).slice(0, 3).map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>
      <p class="card-syn">${escapeHtml(truncate(a.synopsis, 116) || 'No synopsis on record.')}</p>
    </div>`;
  el.querySelector('.card-body').appendChild(actionRow(a));
  el.querySelector('.open').addEventListener('click', () => openDetail(a));
  el.querySelector('.card-title button').addEventListener('click', () => openDetail(a));
  return el;
}

function rankRow(a, n) {
  const li = document.createElement('li');
  li.className = 'rank-row';
  li.innerHTML = `
    <span class="rank-num" aria-hidden="true">${String(n).padStart(2, '0')}</span>
    <img loading="lazy" src="${escapeAttr(a.image)}" alt="" onerror="this.style.visibility='hidden'">
    <div class="rank-main">
      <h3><button type="button"><span class="sr-only">Number ${n}: </span>${escapeHtml(titleOf(a))}</button></h3>
      <p class="rank-line">★ ${formatScore(a.score)} · ${formatRank(a.rank)} · ${escapeHtml(orDash(a.type))} · ${formatEpisodes(a.episodes)} · ${formatMembers(a.members)} members</p>
      <p class="rank-line">${escapeHtml(formatList((a.genres || []).slice(0, 4), ' · '))}</p>
    </div>`;
  li.querySelector('.rank-main h3 button').addEventListener('click', () => openDetail(a));
  li.querySelector('.rank-main').appendChild(actionRow(a));
  return li;
}

// ---------- detail ----------

function detailMarkup(a, { pending }) {
  const trailer = a.trailer
    ? `<a class="btn btn-ghost" href="${escapeAttr(a.trailer)}" target="_blank" rel="noopener">Watch trailer</a>`
    : '';
  return `
    <div class="detail-grid">
      <img src="${escapeAttr(a.image)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="detail-main">
        <h2 id="detailTitle">${escapeHtml(titleOf(a))}</h2>
        <p class="detail-jp">${escapeHtml(a.title)}${a.title_japanese ? ` · ${escapeHtml(a.title_japanese)}` : ''}</p>
        <dl class="detail-stats">
          <div><dt>Score</dt><dd>${formatScore(a.score)}</dd></div>
          <div><dt>Rank</dt><dd>${formatRank(a.rank)}</dd></div>
          <div><dt>Popularity</dt><dd>${formatPopularity(a.popularity)}</dd></div>
          <div><dt>Members</dt><dd>${formatMembers(a.members)}</dd></div>
        </dl>
        <h4>Synopsis${pending ? ' · loading full record' : ''}</h4>
        <p class="detail-syn">${escapeHtml(a.synopsis || 'No synopsis on record.')}</p>
        <h4>Specification</h4>
        <dl class="detail-meta">
          <dt>Type</dt><dd>${escapeHtml(orDash(a.type))}</dd>
          <dt>Episodes</dt><dd>${formatEpisodes(a.episodes)}</dd>
          <dt>Duration</dt><dd>${escapeHtml(formatDuration(a.duration))}</dd>
          <dt>Status</dt><dd>${escapeHtml(orDash(a.status))}</dd>
          <dt>Aired</dt><dd>${escapeHtml(formatAired(a.aired))}</dd>
          <dt>Season</dt><dd>${escapeHtml(seasonLabel(a))}</dd>
          <dt>Broadcast</dt><dd>${escapeHtml(orDash(a.broadcast))}</dd>
          <dt>Studios</dt><dd>${escapeHtml(formatList(a.studios))}</dd>
          <dt>Source</dt><dd>${escapeHtml(orDash(a.source))}</dd>
          <dt>Rating</dt><dd>${escapeHtml(orDash(a.rating))}</dd>
          <dt>Genres</dt><dd>${escapeHtml(formatList(a.genres))}</dd>
          <dt>Themes</dt><dd>${escapeHtml(formatList([...(a.themes || []), ...(a.demographics || [])]))}</dd>
        </dl>
        <div class="detail-links">
          ${a.url ? `<a class="btn" href="${escapeAttr(a.url)}" target="_blank" rel="noopener">Open on MyAnimeList</a>` : ''}
          ${trailer}
        </div>
        <div class="detail-actions"></div>
      </div>
    </div>`;
}

async function openDetail(anime) {
  let a = anime;
  const dialog = $('#detail');
  const body = $('#detailBody');
  const paint = (record, pending) => {
    body.innerHTML = detailMarkup(record, { pending });
    body.querySelector('.detail-actions').appendChild(actionRow(record));
  };

  paint(a, state.source === 'live');
  if (!dialog.open) dialog.showModal();
  $('#detailClose').focus();

  if (state.source !== 'live' || a.mal_id == null) return;
  try {
    const full = await api.getById(a.mal_id);
    if (full && dialog.open) {
      a = full;
      // Keep saved copies rich too, so the watch-later view shows full metadata.
      if (watchLater.has(a)) { watchLater.remove(a); watchLater.add(a); }
      if (favorites.has(a)) { favorites.remove(a); favorites.add(a); }
      paint(a, false);
      $('#detailClose').focus();
    }
  } catch (err) {
    if (dialog.open) {
      const note = document.createElement('p');
      note.className = 'status mono is-error';
      note.textContent = `Full record unavailable: ${err.message}`;
      body.querySelector('.detail-main')?.appendChild(note);
    }
  }
}

// ---------- chrome ----------

function option(value, label, name = label) {
  return `<option value="${escapeAttr(value)}" data-name="${escapeAttr(name)}">${escapeHtml(label)}</option>`;
}

/** Genre ids come from Jikan itself (/genres/anime), never a hardcoded list. */
async function hydrateGenres() {
  if (state.genresReady) return;
  state.genresReady = true;
  try {
    const genres = await api.getGenres();
    if (!genres.length) throw new Error('no genres');
    $('#genre').innerHTML = [
      option('', 'All genres', 'All'),
      ...genres.map((g) => option(g.id, g.name)),
    ].join('');
    $('#genre').value = catalog.state.genre;
  } catch {
    state.genresReady = false;   // a later page turn can try again
  }
}

/** Static filter vocabularies that do not need a request. */
function hydrateStaticFilters() {
  $('#type').innerHTML = [option('All', 'All types', 'All'), ...CATALOG_TYPES.map((t) => option(t, t))].join('');
  $('#airStatus').innerHTML = STATUS_OPTIONS.map(([v, l]) => option(v, l)).join('');
  $('#minScore').innerHTML = SCORE_OPTIONS.map(([v, l]) => option(v, l)).join('');
  $('#genre').innerHTML = option('', 'All genres', 'All');
}

/** Offline snapshot: the only honest filter vocabulary is the snapshot itself. */
function hydrateOfflineFilters() {
  const source = state.all.length ? state.all : state.airing;
  $('#genre').innerHTML = collectGenres(source)
    .map((g) => option(g === 'All' ? '' : g, g === 'All' ? 'All genres' : g, g)).join('');
  $('#type').innerHTML = collectTypes(source)
    .map((t) => option(t, t === 'All' ? 'All types' : t, t)).join('');
  $('#airStatus').closest('.field').hidden = true;
  $('#minScore').closest('.field').hidden = true;
  $('#genre').value = catalog.state.genreName === 'All' ? '' : catalog.state.genreName;
  $('#type').value = catalog.state.type;
}

function setSourceChip() {
  const chip = $('#source');
  chip.classList.remove('is-live', 'is-offline');
  if (state.source === 'live') { chip.textContent = 'Live · Jikan'; chip.classList.add('is-live'); }
  else if (state.source === 'offline') { chip.textContent = 'Offline snapshot'; chip.classList.add('is-offline'); }
  else chip.textContent = 'Connecting…';
}

function setStatus(msg, isError = false) {
  const el = $('#status');
  el.textContent = msg;
  el.hidden = !msg;
  el.classList.toggle('is-error', Boolean(isError));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeAttr = escapeHtml;

function switchView(view) {
  if (!VIEWS[view]) return;
  state.view = view;
  state.page = 1;
  if (view === 'top' || view === 'airing' || view === 'browse') {
    ensureData({ immediate: true });
  } else {
    catalog.cancel();
    render();
  }
}

/** A filter changed: back to page 1, and re-ask the server. */
function refilter(patch) {
  catalog.setFilters(patch);
  state.page = 1;
  if (state.view === 'browse' && state.source !== 'offline') ensureData();
  else render();
}

/** Move the active view to `page`, fetching it server-side when live. */
function goToPage(page) {
  if (state.view === 'browse' && state.source === 'live') {
    if (!catalog.setPage(page)) return;
    ensureData();
  } else if (state.view === 'airing' && state.source === 'live') {
    const last = Math.max(1, state.airingPagination.lastPage || 1);
    const next = Math.min(Math.max(1, Math.floor(page) || 1), last);
    if (next === state.airingPage) return;
    state.airingPage = next;
    ensureData({ immediate: true });
  } else {
    state.page = Math.max(1, Math.floor(page) || 1);
    render();
  }
  toStage();
}

function currentPageNumber() {
  const info = currentPager();
  return info ? info.page : state.page;
}

function wire() {
  const debounce = (fn, ms = 400) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  hydrateStaticFilters();

  $('#toolbar').addEventListener('submit', (e) => e.preventDefault());
  $('#search').addEventListener('input', debounce((e) => {
    catalog.setQuery(e.target.value);
    state.page = 1;
    if (state.view === 'browse' && state.source !== 'offline') ensureData();
    else render();
  }, 350));
  $('#genre').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    refilter({ genre: e.target.value, genreName: opt?.dataset.name || 'All' });
  });
  $('#type').addEventListener('change', (e) => refilter({ type: e.target.value || 'All' }));
  $('#airStatus').addEventListener('change', (e) => refilter({ status: e.target.value || 'All' }));
  $('#minScore').addEventListener('change', (e) => refilter({ minScore: e.target.value }));
  $('#sort').addEventListener('change', (e) => refilter({ sort: e.target.value }));
  $('#prev').addEventListener('click', () => goToPage(currentPageNumber() - 1));
  $('#next').addEventListener('click', () => goToPage(currentPageNumber() + 1));
  $('#pageJump').addEventListener('change', (e) => {
    const n = Number(e.target.value);
    if (Number.isFinite(n) && n > 0) goToPage(n);
  });
  $('#retry').addEventListener('click', () => {
    state.error = null;
    catalog.state.error = null;
    ensureData({ immediate: true });
  });

  const degradedRetry = $('#degradedRetry');
  if (degradedRetry) {
    degradedRetry.addEventListener('click', () => {
      state.error = null;
      catalog.state.error = null;
      ensureData({ immediate: true });
    });
  }

  const degradedBrowse = $('#degradedBrowse');
  if (degradedBrowse) {
    degradedBrowse.addEventListener('click', () => {
      state.error = null;
      loadOffline().then(() => render());
    });
  }

  for (const btn of document.querySelectorAll('.rail-btn')) {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  }

  $('#detailClose').addEventListener('click', () => $('#detail').close());
  $('#detail').addEventListener('click', (e) => { if (e.target.id === 'detail') $('#detail').close(); });
  $('#themeToggle').addEventListener('click', toggleTheme);
  initTheme();
}

function toStage() {
  $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initTheme() {
  const saved = (() => { try { return localStorage.getItem('anime-dir:theme'); } catch { return null; } })();
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const explicit = document.documentElement.dataset.theme;
  const dark = explicit
    ? explicit === 'dark'
    : Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('anime-dir:theme', next); } catch { /* ignore */ }
}

async function boot() {
  wire();
  render();
  await ensureData({ immediate: true });   // first page of the directory
  try {
    if (state.source === 'live') await loadAiring(1);   // hero strip + season stamp
  } catch {
    /* the season feed is optional; the stamp falls back to the local clock */
  }
  render();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', boot);
}
