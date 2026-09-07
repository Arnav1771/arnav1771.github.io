/* NEXUS library view. No framework, no build step, no CDN — this file is served
   as-is from docs/ by GitHub Pages, by Vercel, or by `python main.py --serve-ui`.

   State lives in one object and every change funnels through render(). That is
   the whole architecture, and at this size it is the right one.
*/
'use strict';

(function () {
  // --------------------------------------------------------------- constants
  var STORE_ORDER = ['steam', 'epic', 'gog', 'amazon', 'xbox'];
  var HUES = {
    steam: 'var(--store-steam)',
    epic: 'var(--store-epic)',
    gog: 'var(--store-gog)',
    amazon: 'var(--store-amazon)',
    xbox: 'var(--store-xbox)'
  };
  var TOKEN_KEY = 'nexus.tokens.v3';
  var THEME_KEY = 'nexus.theme';
  var SORT_KEY = 'nexus.sort';

  // Same origin by default; ?api=https://host lets a GitHub Pages copy point at
  // a service running elsewhere.
  var API = (function () {
    var override = new URLSearchParams(location.search).get('api');
    if (override) { return override.replace(/\/+$/, ''); }
    return location.origin;
  })();

  var state = {
    loading: true,
    fatal: null,
    games: [],
    stores: [],
    errors: [],
    clis: {},
    tokens: readTokens(),
    query: '',
    activeStores: new Set(),
    installedOnly: false,
    sort: localStorage.getItem(SORT_KEY) || 'title'
  };

  // ------------------------------------------------------------------- utils
  function $(sel, root) { return (root || document).querySelector(sel); }

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) { return; }
      if (k === 'text') { node.textContent = v; }
      else if (k === 'style') { node.setAttribute('style', v); }
      else { node.setAttribute(k, v === true ? '' : String(v)); }
    });
    (kids || []).forEach(function (kid) { if (kid) { node.appendChild(kid); } });
    return node;
  }

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}') || {}; }
    catch (err) { return {}; }
  }

  function writeTokens(tokens) {
    state.tokens = tokens;
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens)); } catch (err) { /* private mode */ }
  }

  function initials(title) {
    return String(title || '?')
      .replace(/^(the|a|an)\s+/i, '')
      .split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0); })
      .join('').toUpperCase() || '?';
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  // ------------------------------------------------------------------- theme
  function applyTheme(theme) {
    if (theme) { document.documentElement.setAttribute('data-theme', theme); }
    else { document.documentElement.removeAttribute('data-theme'); }
    var btn = $('#theme');
    if (btn) {
      var next = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    }
  }

  // -------------------------------------------------------------------- data
  function query() {
    var params = new URLSearchParams();
    STORE_ORDER.forEach(function (id) {
      if (state.tokens[id]) { params.set(id + '_token', state.tokens[id]); }
    });
    if (state.tokens.steam_apikey) { params.set('steam_apikey', state.tokens.steam_apikey); }
    return params.toString();
  }

  function load() {
    state.loading = true;
    render();

    var qs = query();
    Promise.all([
      fetch(API + '/api/games' + (qs ? '?' + qs : '')).then(readJson),
      fetch(API + '/health').then(readJson).catch(function () { return null; })
    ]).then(function (results) {
      var library = results[0];
      var health = results[1];
      state.games = library.games || [];
      state.stores = (library.stores || []).slice().sort(function (a, b) {
        return STORE_ORDER.indexOf(a.id) - STORE_ORDER.indexOf(b.id);
      });
      state.errors = library.errors || [];
      state.clis = (health && health.store_clis) || {};
      state.fatal = null;
    }).catch(function (err) {
      state.fatal = err && err.message ? err.message : String(err);
    }).then(function () {
      state.loading = false;
      render();
    });
  }

  function readJson(response) {
    return response.json().then(function (body) {
      if (!response.ok) {
        var detail = body && body.detail;
        var message = (detail && (detail.error || detail)) || response.statusText;
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
      }
      return body;
    }, function () {
      throw new Error('The NEXUS service at ' + API + ' returned a response this page could not read.');
    });
  }

  // ------------------------------------------------------------- derivations
  function visibleGames() {
    var q = state.query.trim().toLowerCase();
    var out = state.games.filter(function (g) {
      if (state.activeStores.size && !state.activeStores.has(g.store)) { return false; }
      if (state.installedOnly && g.install_state !== 'installed') { return false; }
      if (q && String(g.title).toLowerCase().indexOf(q) === -1) { return false; }
      return true;
    });

    var sort = state.sort;
    out.sort(function (a, b) {
      if (sort === 'playtime') { return (b.playtime_hours || 0) - (a.playtime_hours || 0); }
      if (sort === 'store') {
        var d = STORE_ORDER.indexOf(a.store) - STORE_ORDER.indexOf(b.store);
        if (d !== 0) { return d; }
      }
      return String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' });
    });
    return out;
  }

  function countsByStore() {
    var counts = {};
    state.games.forEach(function (g) { counts[g.store] = (counts[g.store] || 0) + 1; });
    return counts;
  }

  // ------------------------------------------------------------------ render
  function render() {
    renderRail();
    renderLibrary();
  }

  function renderRail() {
    var counts = countsByStore();
    var channels = $('#channels');
    channels.textContent = '';

    var stores = state.stores.length ? state.stores : STORE_ORDER.map(function (id) {
      return { id: id, name: id, can_list: false, can_install: false, can_launch: false };
    });

    stores.forEach(function (store) {
      var count = counts[store.id] || 0;
      var active = state.activeStores.has(store.id);
      var connected = !!state.tokens[store.id];

      var caps = el('div', { class: 'channel__caps' }, [
        el('span', { class: 'cap', 'data-on': String(!!store.can_list), text: 'list' }),
        el('span', { class: 'cap', 'data-on': String(!!store.can_install), text: 'install' }),
        el('span', { class: 'cap', 'data-on': String(!!store.can_launch), text: 'launch' })
      ]);

      var button = el('button', {
        type: 'button',
        class: 'channel',
        style: '--hue: ' + (HUES[store.id] || 'var(--fg-faint)'),
        'aria-pressed': String(active),
        'data-connected': String(connected),
        title: store.notes || ''
      }, [
        el('span', { class: 'channel__bar', 'aria-hidden': 'true' }),
        el('span', { class: 'channel__name', text: store.name || store.id }),
        el('span', {
          class: 'channel__count',
          text: connected ? String(count) : '--',
          'aria-label': connected ? count + ' ' + plural(count, 'game', 'games') : 'not connected'
        }),
        caps
      ]);

      button.addEventListener('click', function () {
        if (active) { state.activeStores.delete(store.id); }
        else { state.activeStores.add(store.id); }
        render();
      });

      channels.appendChild(button);
    });

    // CLI status. Named plainly, because "legendary: no" is the answer to
    // "why can't I launch anything".
    var clis = $('#clis');
    clis.textContent = '';
    [['legendary', 'Epic'], ['gogdl', 'GOG'], ['nile', 'Amazon']].forEach(function (pair) {
      var present = state.clis[pair[0]] === true;
      clis.appendChild(el('div', { class: 'cli-row' }, [
        el('b', { text: pair[0] }),
        el('span', {
          'data-present': String(present),
          text: present ? 'found' : 'not found'
        })
      ]));
    });
  }

  function renderLibrary() {
    var host = $('#results');
    var notices = $('#notices');
    host.textContent = '';
    notices.textContent = '';

    if (state.fatal) {
      notices.appendChild(errorNotice());
      $('#tally').textContent = '';
      return;
    }

    state.errors.forEach(function (err) { notices.appendChild(storeErrorNotice(err)); });

    if (state.loading) {
      $('#tally').innerHTML = '<span>loading library</span>';
      host.appendChild(skeletonGrid());
      return;
    }

    var games = visibleGames();
    var total = state.games.length;
    var filtered = state.activeStores.size > 0 || state.query.trim() !== '' || state.installedOnly;

    $('#tally').textContent = '';
    $('#tally').appendChild(document.createTextNode(String(games.length)));
    $('#tally').appendChild(el('span', {
      text: ' ' + plural(games.length, 'game', 'games') +
        (filtered && games.length !== total ? ' of ' + total : '')
    }));

    if (!total) {
      host.appendChild(connectPrompt());
      return;
    }
    if (!games.length) {
      host.appendChild(noMatchesPrompt());
      return;
    }

    var grid = el('ul', { class: 'grid' });
    games.forEach(function (game) { grid.appendChild(card(game)); });
    host.appendChild(grid);
  }

  function card(game) {
    var art = el('div', {
      class: 'card__art',
      'data-art': game.cover_url ? 'yes' : 'none',
      'data-initials': initials(game.title)
    });

    if (game.cover_url) {
      var img = el('img', {
        src: game.cover_url,
        alt: '',
        loading: 'lazy',
        decoding: 'async'
      });
      // A dead cover URL must fall back to the designed placeholder, not to a
      // broken-image glyph. Epic and GOG both serve stale art.
      img.addEventListener('error', function () {
        art.setAttribute('data-art', 'none');
        if (img.parentNode) { img.parentNode.removeChild(img); }
      });
      art.appendChild(img);
    }

    var titleNode = game.store_url
      ? el('a', { href: game.store_url, rel: 'noopener noreferrer', target: '_blank', text: game.title })
      : document.createTextNode(game.title);

    var meta = [
      el('span', { class: 'card__store', text: game.store_name || game.store })
    ];
    if (game.playtime_hours > 0) {
      meta.push(el('span', { text: game.playtime_hours + ' h' }));
    }
    // install_state is "unknown" unless a store CLI was consulted. Say nothing
    // rather than implying "not installed" — the API is careful about this and
    // the UI must not undo it.
    if (game.install_state === 'installed') {
      meta.push(el('span', { class: 'card__state', 'data-state': 'installed', text: 'installed' }));
    } else if (game.launchable) {
      meta.push(el('span', { class: 'card__state', 'data-state': 'ready', text: 'launchable' }));
    }

    return el('li', {
      class: 'card',
      style: '--hue: ' + (HUES[game.store] || 'var(--line-firm)')
    }, [
      art,
      el('div', { class: 'card__body' }, [
        el('h3', { class: 'card__title' }, [titleNode]),
        el('p', { class: 'card__meta' }, meta)
      ])
    ]);
  }

  function skeletonGrid() {
    var grid = el('ul', { class: 'grid' });
    for (var i = 0; i < 12; i += 1) {
      grid.appendChild(el('li', { class: 'card skeleton', 'aria-hidden': 'true' }, [
        el('div', { class: 'card__art' }),
        el('div', { class: 'card__body' }, [el('h3', { class: 'card__title' })])
      ]));
    }
    return grid;
  }

  function connectPrompt() {
    return el('div', { class: 'empty' }, [
      el('p', { class: 'empty__mark', 'aria-hidden': 'true', text: '[ ]' }),
      el('h2', { text: 'Nothing connected yet' }),
      el('p', {
        text: 'Connect a store from the rail and NEXUS will list the games you already own. ' +
          'Steam works with no API key as long as your profile game details are public.'
      })
    ]);
  }

  function noMatchesPrompt() {
    return el('div', { class: 'empty' }, [
      el('p', { class: 'empty__mark', 'aria-hidden': 'true', text: '0' }),
      el('h2', { text: 'No games match these filters' }),
      el('p', { text: 'Clear the search box, or switch a store back on in the rail.' })
    ]);
  }

  function errorNotice() {
    var retry = el('button', { type: 'button', class: 'link-btn', text: 'Try again' });
    retry.addEventListener('click', load);
    return el('div', { class: 'notice', role: 'alert' }, [
      el('h2', { text: 'Cannot reach the NEXUS service' }),
      el('p', { text: state.fatal }),
      el('p', {}, [
        document.createTextNode('Start it with '),
        el('code', { text: 'python main.py --serve-ui' }),
        document.createTextNode(', or point this page at a running instance by adding '),
        el('code', { text: '?api=https://your-host' }),
        document.createTextNode(' to the URL.')
      ]),
      retry
    ]);
  }

  function storeErrorNotice(err) {
    var kids = [
      el('h2', { text: (err.store || 'A store') + ' could not be read' }),
      el('p', { text: err.error || 'Unknown error.' })
    ];
    if (err.fix) { kids.push(el('p', { text: err.fix })); }
    if (err.reason && /expired|invalid/.test(err.reason)) {
      var disconnect = el('button', { type: 'button', class: 'link-btn', text: 'Disconnect ' + err.store });
      disconnect.addEventListener('click', function () {
        var tokens = readTokens();
        delete tokens[err.store];
        writeTokens(tokens);
        load();
      });
      kids.push(disconnect);
    }
    return el('div', { class: 'notice', role: 'status' }, kids);
  }

  // ------------------------------------------------------------------- wiring
  function captureCallback() {
    var params = new URLSearchParams(location.search);
    var store = params.get('auth');
    var token = params.get('token');
    var failed = params.get('auth_error');

    if (store && token) {
      var tokens = readTokens();
      tokens[store] = token;
      writeTokens(tokens);
    }
    if (failed) {
      state.fatal = 'Connecting ' + failed + ' failed (' + (params.get('reason') || 'unknown reason') +
        '). Start the login again from this page.';
    }
    if (store || failed) {
      // Never leave a session token sitting in the address bar or in history.
      history.replaceState(null, '', location.pathname);
    }
  }

  function boot() {
    var saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved);

    $('#theme').addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = isDark ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });

    var search = $('#search');
    search.addEventListener('input', function () {
      state.query = search.value;
      renderLibrary();
    });

    var sort = $('#sort');
    sort.value = state.sort;
    sort.addEventListener('change', function () {
      state.sort = sort.value;
      localStorage.setItem(SORT_KEY, state.sort);
      renderLibrary();
    });

    var installed = $('#installed');
    installed.addEventListener('click', function () {
      state.installedOnly = !state.installedOnly;
      installed.setAttribute('aria-pressed', String(state.installedOnly));
      renderLibrary();
    });

    $('#connect').addEventListener('click', function () {
      var id = window.prompt('Connect which store? ' + STORE_ORDER.join(', '), 'steam');
      if (!id) { return; }
      id = id.trim().toLowerCase();
      if (STORE_ORDER.indexOf(id) === -1) { return; }
      location.href = API + '/auth/' + id + '/login';
    });

    $('#reload').addEventListener('click', load);

    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && document.activeElement !== search) {
        event.preventDefault();
        search.focus();
      }
      if (event.key === 'Escape' && document.activeElement === search) {
        search.value = '';
        state.query = '';
        renderLibrary();
      }
    });

    captureCallback();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
