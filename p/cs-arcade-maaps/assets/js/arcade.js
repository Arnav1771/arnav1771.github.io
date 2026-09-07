/*
 * Arcade — shared game chrome, fair scoring, tutorials & leaderboard
 * --------------------------------------------------------------------
 *   <script src="<relative>/assets/js/audio.js"></script>
 *   <script src="<relative>/assets/js/arcade.js"></script>
 *   Arcade.mount({ title: 'Binary Blitz', accent: '#38bdf8' });   // top bar + auto tutorial
 *
 * Scoring (FAIR across games): at game over a game calls
 *   Arcade.best(slug, rawScore, levelReached [, maxLevel=20]);
 * rawScore drives the in-game "Best" display; levelReached (0..maxLevel) is
 * normalized to 0..1000 so every game is worth the SAME at mastery. The
 * leaderboard ranks each student by the sum of their 4 chosen "mission" games.
 */
(function (global) {
  'use strict';

  var me = document.currentScript;
  var src = me ? me.src : '';
  var ROOT = src.replace(/assets\/js\/arcade\.js.*$/, ''); // folder that owns this copy of /assets

  // Each game folder is self-contained: it carries its own assets/ and loads
  // this file from there, so ROOT is the game folder rather than the repo root.
  // Work out the hub from the page's own location instead. A game still sitting
  // inside the arcade ("…/games/<slug>/") reaches the hub two levels up; a game
  // folder lifted out on its own — packaged as an app — has no hub at all, and
  // the "All Games" / "Next Game" links are left out rather than pointing
  // somewhere that does not exist.
  var IN_ARCADE = /\/games\/[^\/]+\/[^\/]*$/.test((global.location && global.location.pathname) || '');
  var HUB = IN_ARCADE ? '../../index.html' : (ROOT + 'index.html');

  // ---- storage keys -------------------------------------------------------
  var PLAYER_KEY  = 'csArcade.player';
  var LB_KEY      = 'csArcade.leaderboard';
  var MISSION_KEY = 'csArcade.mission';    // { playerName: [slug, slug, slug, slug] }
  var MAX_POINTS  = 1000;                  // every game normalized to 0..1000

  function readJSON(k, def) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function curPlayer() { return readJSON(PLAYER_KEY, '') || 'Guest'; }

  // "reached level N out of M" -> a fair 0..1000 (equal max for every game).
  function normalize(level, maxLevel) {
    maxLevel = maxLevel || 20;
    var f = Math.max(0, Math.min(1, (level || 0) / maxLevel));
    return Math.round(f * MAX_POINTS);
  }

  // Keep best normalized value per game (+ best raw for tiebreak/detail).
  function recordScore(slug, level, maxLevel, raw) {
    if (!slug) return;
    var name = curPlayer();
    var lb = readJSON(LB_KEY, {});
    var e = lb[name] || { games: {}, raw: {}, plays: 0, updated: 0 };
    if (!e.games) e.games = {};
    if (!e.raw) e.raw = {};
    var norm = normalize(level, maxLevel);
    if (norm > (e.games[slug] || 0)) e.games[slug] = norm;
    if (typeof raw === 'number' && isFinite(raw) && raw > (e.raw[slug] || 0)) e.raw[slug] = Math.round(raw);
    e.plays = (e.plays || 0) + 1;
    e.updated = Date.now();
    lb[name] = e;
    writeJSON(LB_KEY, lb);
  }

  function missionsAll() { return readJSON(MISSION_KEY, {}); }
  function playerMission(name) { var m = missionsAll()[name]; return (m && m.length) ? m : null; }
  function playerTotal(name, e) {          // sum of the 4 mission games, else best 4
    var g = (e && e.games) || {}, m = playerMission(name), t = 0, i;
    if (m) { for (i = 0; i < m.length; i++) t += (g[m[i]] || 0); return t; }
    var vals = []; for (var s in g) if (g.hasOwnProperty(s)) vals.push(g[s]);
    vals.sort(function (a, b) { return b - a; });
    return vals.slice(0, 4).reduce(function (a, b) { return a + b; }, 0);
  }
  function rawTotal(name, e) {
    var r = (e && e.raw) || {}, m = playerMission(name), keys = m || Object.keys(r), t = 0, i;
    for (i = 0; i < keys.length; i++) t += (r[keys[i]] || 0);
    return t;
  }

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.setAttribute('style', css);
    if (text != null) e.textContent = text;
    return e;
  }
  function currentSlug() {
    var m = (global.location && global.location.pathname || '').match(/games\/([^\/]+)/);
    return m ? m[1] : '';
  }

  // ---- per-game tutorials (shown automatically when a game opens) ---------
  var TUTORIALS = {
    'binary-blitz': { emoji: '🔢', title: 'Binary Blitz', goal: 'how computers count using only 0s and 1s',
      steps: ['A target number appears at the top.', 'Tap the bit-switches (128 64 32 16 8 4 2 1) to add up to that number.', 'Match it before the timer runs out. Clear the numbers to climb 20 levels!'] },
    'logic-lab': { emoji: '💡', title: 'Logic Lab', goal: 'how logic gates (AND / OR / NOT) power every chip',
      steps: ['Each level shows a logic gate and an output bulb.', 'Flip the input switches to make the bulb turn ON (or OFF) as asked.', 'Use the truth-table hint. Solve all 20 levels!'] },
    'robot-runner': { emoji: '🤖', title: 'Robot Runner', goal: 'that an algorithm is just steps in the right order',
      steps: ['Build a program with the Forward / Turn buttons.', 'Press RUN and the robot follows your steps to the flag.', 'Avoid walls. Solve all 20 mazes!'] },
    'type-rush': { emoji: '⌨️', title: 'Type Rush', goal: 'fast, accurate typing + computer words',
      steps: ['Words fall from the top — type them before they land.', "Don't let 3 words reach the bottom.", 'Speed rises each level. Reach Level 20!'] },
    'memory-matrix': { emoji: '🧠', title: 'Memory Matrix', goal: 'memory & recall, like a computer’s RAM',
      steps: ['Flip two cards to find matching tech pairs.', 'Matched pairs stay; wrong pairs flip back.', 'Clear the board to advance — 20 levels!'] },
    'sort-it-out': { emoji: '📊', title: 'Sort It Out', goal: 'sorting — a job computers do constantly',
      steps: ['Tap one bar, then another, to swap them.', 'Put the bars in the order shown (shortest→tallest, or the reverse).', 'Fewer swaps = more points. 20 levels!'] },
    'cs-quiz': { emoji: '❓', title: 'CS Quiz Quest', goal: 'computer basics: hardware, software & the internet',
      steps: ['Answer 20 computer questions, one per level.', 'Tap fast — a quicker correct answer scores more.', 'Every student gets a freshly shuffled order!'] },
    'cipher-crack': { emoji: '🔐', title: 'Cipher Crack', goal: 'how secret codes (the Caesar cipher) work',
      steps: ['A secret message is shown, letters shifted along the alphabet.', 'Turn the wheel / slider until the message reads clearly.', 'Hit Decode! Crack all 20 messages.'] },
    'simon-signals': { emoji: '🎵', title: 'Simon Signals', goal: 'following exact sequences, and memory',
      steps: ['Watch the pads flash a pattern.', 'Repeat the pattern by tapping the pads in the same order.', 'It grows each round — reach Level 20!'] },
    'number-ninja': { emoji: '🥷', title: 'Number Ninja', goal: 'fast mental maths',
      steps: ['A maths problem appears with answer choices.', 'Tap/slash the correct answer quickly for combo points.', 'Add → subtract → multiply → divide across 20 levels!'] },
    'word-wizard': { emoji: '🧙', title: 'Word Wizard', goal: 'spelling & science/computer vocabulary',
      steps: ['A scrambled word and a hint are shown.', 'Tap the letters in the right order to spell it.', 'Words get trickier — clear 20 levels!'] },
    'bug-squash': { emoji: '🐛', title: 'Bug Squash', goal: 'the idea of finding & fixing bugs (debugging)',
      steps: ['Bugs pop up on the board — tap to squash them!', "Don't hit the good chips (✅) and don't miss too many bugs.", 'It speeds up — survive 20 levels!'] },
    'tower-master': { emoji: '🗼', title: 'Tower Master', goal: 'planning & step-by-step problem solving',
      steps: ['Move the whole stack of disks to the right peg.', 'One disk at a time — never put a bigger disk on a smaller one.', 'Fewer moves = better. Beat all 20 levels!'] },
    'pattern-quest': { emoji: '🔷', title: 'Pattern Quest', goal: 'spotting patterns — the heart of computing',
      steps: ['A sequence is shown with the last item missing (❓).', 'Tap the option that comes next in the pattern.', 'Patterns get trickier — clear 20 levels!'] },
    'power-2048': { emoji: '2️⃣', title: '2048', goal: 'powers of two (2, 4, 8, 16 …) — the maths behind binary',
      steps: ['Swipe (or use arrow keys) to slide all tiles.', 'Two equal tiles merge into their double: 2+2=4, 4+4=8 …', 'Reach the target tile to climb — 20 levels up to 2048 and beyond!'] },
    'path-defense': { emoji: '🛡️', title: 'Path Defense', goal: 'graph traversal and shortest-path algorithm routing',
      steps: ['Place router towers along the grid to block and redirect data packets.', 'Force packets to take the longest path through your defenses.', 'Survive 20 waves of packet invasions!'] },
    'byte-blobs': { emoji: '🫧', title: 'Byte Blobs', goal: 'greedy algorithms and spatial hash collision detection',
      steps: ['Steer your blob to absorb smaller data bytes and grow.', 'Avoid larger AI bots while consuming smaller ones.', 'Dominate the arena across 20 levels!'] },
    'search-safari': { emoji: '🔎', title: 'Search Safari', goal: 'binary search — O(log n) efficiency vs O(n) linear search',
      steps: ['A target number is hidden in the range.', 'Guess a number to halve the remaining search range every step.', 'Find the target in minimum steps across 20 levels!'] },
    'stack-attack': { emoji: '🥞', title: 'Stack Attack', goal: 'LIFO (Stack) vs FIFO (Queue) data structures',
      steps: ['Store incoming data parcels in Stack (LIFO) or Queue (FIFO) slots.', 'Deliver parcels in the requested sequence order.', 'Process all requests without overflowing across 20 levels!'] },
    'packet-panic': { emoji: '📡', title: 'Packet Panic', goal: 'network routing tables and longest-prefix matching',
      steps: ['Inspect incoming IP network packets.', 'Route each packet to the matching port using longest-prefix rules.', 'Prevent buffer overflows across 20 waves!'] },
    '3d-raycaster': { emoji: '🕶️', title: '3D Raycaster', goal: '3D raycasting, trigonometry & distance projection',
      steps: ['Use controls or WASD / Arrow keys to move and turn through the 3D maze.', 'Raycasts calculate wall distances and render perspective walls.', 'Collect data crystals and locate the exit portal across 20 levels!'] },
    'cyber-chess': { emoji: '♟️', title: 'Cyber Chess', goal: 'Game Trees, decision trees & Minimax AI evaluation',
      steps: ['Move your cyber pieces strategically across the board.', 'Solve tactical puzzles and outsmart AI bots evaluating game trees.', 'Achieve checkmate or capture key pieces across 20 levels!'] },
    'retro-racer': { emoji: '🏎️', title: 'Retro Racer', goal: 'pseudo-3D road projection, curve geometry & momentum physics',
      steps: ['Steer left and right while accelerating along the cyber highway.', 'Dodge traffic and corner winding pseudo-3D curves.', 'Reach checkpoints before time runs out across 20 tracks!'] },
    'space-invaders': { emoji: '👾', title: 'Space Invaders', goal: 'Entity-Component-System basics, game loops & bounding-box collision',
      steps: ['Move your defense cannon left and right to dodge alien attacks.', 'Fire energy blasts to destroy marching invader grids.', 'Clear all alien waves and defeat bosses across 20 levels!'] },
    'snake-3d': { emoji: '🐍', title: 'Snake 3D', goal: '3D spatial coordinates, vector turns & queue data structures',
      steps: ['Navigate the cyber snake around 3D spatial grids.', 'Eat data nodes to grow your FIFO tail without hitting walls or yourself.', 'Complete 3D spatial grid targets across 20 levels!'] }
  };

  function showTutorial(slug, accent, onDismiss) {
    var t = TUTORIALS[slug];
    if (!t) { if (typeof onDismiss === 'function') onDismiss(); return; }
    accent = accent || '#22d3ee';
    var ov = el('div', 'position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;' +
      'padding:18px;background:rgba(4,7,18,.86);backdrop-filter:blur(7px);' +
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;');
    var card = el('div', 'width:min(460px,94vw);max-height:88vh;overflow:auto;text-align:center;color:#e7ecff;' +
      'background:linear-gradient(160deg,#101833,#0a0f22);border:1px solid ' + accent + ';border-radius:22px;' +
      'padding:26px 24px;box-shadow:0 30px 80px rgba(0,0,0,.6);');
    var steps = t.steps.map(function (s) { return '<li style="margin:9px 0;line-height:1.45">' + s + '</li>'; }).join('');
    card.innerHTML =
      '<div style="font-size:46px;line-height:1">' + t.emoji + '</div>' +
      '<h2 style="margin:8px 0 2px;font-size:15px;letter-spacing:2px;text-transform:uppercase;color:' + accent + '">How to Play</h2>' +
      '<div style="font-weight:800;font-size:22px;margin-bottom:12px">' + t.title + '</div>' +
      '<ol style="text-align:left;margin:0 auto 14px;max-width:360px;padding-left:22px;font-size:14.5px">' + steps + '</ol>' +
      '<div style="font-size:13px;color:#a3e635;background:rgba(163,230,53,.10);border:1px solid rgba(163,230,53,.35);' +
      'border-radius:10px;padding:9px 12px;margin-bottom:16px">🎓 You are learning: <b>' + t.goal + '</b></div>';
    var btn = el('button', 'width:100%;font-size:17px;font-weight:800;padding:13px;border:none;border-radius:14px;' +
      'cursor:pointer;color:#041018;background:' + accent + ';', 'Got it! Play ▶');
    btn.addEventListener('click', function () {
      if (global.SFX) SFX.play('start'); ov.remove();
      if (typeof onDismiss === 'function') onDismiss();
    });
    card.appendChild(btn);
    ov.appendChild(card);
    document.body.appendChild(ov);
  }

  // A fair, equal per-game session timer (shown in the top bar). When it runs
  // out the game is frozen behind a "Time's Up" card — each student gets the
  // same time in every game, so the leaderboard compares like with like.
  function setupTimer(right, accent, seconds) {
    var remaining = seconds, tid = null, started = false, ended = false;
    var pill = el('span',
      'pointer-events:auto;font-weight:800;font-size:14px;color:#fff;background:rgba(15,23,42,.72);' +
      'border:1px solid ' + accent + ';border-radius:999px;padding:8px 12px;backdrop-filter:blur(6px);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.3);min-width:74px;text-align:center;');
    function fmt(s) { s = Math.max(0, s); var m = Math.floor(s / 60), ss = s % 60; return '⏱ ' + m + ':' + (ss < 10 ? '0' : '') + ss; }
    pill.textContent = fmt(remaining);
    right.insertBefore(pill, right.firstChild);

    function timeUp() {
      if (ended) return; ended = true;
      if (global.SFX) { SFX.play('lose'); }
      var ov = el('div', 'position:fixed;inset:0;z-index:10003;display:flex;align-items:center;justify-content:center;' +
        'padding:18px;background:rgba(4,7,18,.9);backdrop-filter:blur(7px);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;');
      var card = el('div', 'width:min(420px,94vw);text-align:center;color:#e7ecff;background:linear-gradient(160deg,#2a1220,#12060d);' +
        'border:1px solid ' + accent + ';border-radius:22px;padding:28px 24px;box-shadow:0 30px 80px rgba(0,0,0,.6);');
      card.innerHTML = '<div style="font-size:52px">⏰</div>' +
        '<h2 style="margin:8px 0 6px;font-size:26px;color:' + accent + '">Time\'s Up!</h2>' +
        '<p style="color:#c9b6bf;font-size:14.5px;line-height:1.5;margin:0 0 18px">Your score has been saved to the leaderboard.<br>Pick your next game and keep going!</p>';
      var row = el('div', 'display:flex;gap:10px;');
      var again = el('button', 'flex:1;font-size:15px;font-weight:800;padding:12px;border:2px solid ' + accent + ';' +
        'border-radius:14px;cursor:pointer;color:' + accent + ';background:transparent;', '↺ Play Again');
      again.addEventListener('click', function () { global.location.reload(); });
      row.appendChild(again);
      if (IN_ARCADE) {
        var home = el('a', 'flex:1;text-decoration:none;font-size:15px;font-weight:800;padding:12px;border:none;' +
          'border-radius:14px;cursor:pointer;color:#041018;background:' + accent + ';display:flex;align-items:center;justify-content:center;', '🎮 Next Game');
        home.href = HUB;
        row.appendChild(home);
      }
      card.appendChild(row);
      ov.appendChild(card); document.body.appendChild(ov);
    }
    function tick() {
      remaining--; pill.textContent = fmt(remaining);
      if (remaining <= 10) { pill.style.color = '#fecaca'; pill.style.borderColor = '#f43f5e'; if (remaining > 0 && global.SFX) SFX.play('tick'); }
      if (remaining <= 0) { clearInterval(tid); timeUp(); }
    }
    return function start() {
      if (started) return; started = true;
      tid = setInterval(tick, 1000);
    };
  }

  var Arcade = {
    hubUrl: HUB,
    inArcade: IN_ARCADE,   // false when this game folder is running on its own
    maxPoints: MAX_POINTS,

    mount: function (opts) {
      opts = opts || {};
      var accent = opts.accent || '#22d3ee';
      var slug = opts.slug || currentSlug();
      var bar = el('div',
        'position:fixed;top:0;left:0;right:0;height:52px;z-index:9999;display:flex;align-items:center;' +
        'justify-content:space-between;padding:0 14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
        'pointer-events:none;');

      // Only offer a way back when there is an arcade to go back to. Standalone
      // the slot becomes an empty spacer so the right-hand cluster stays put.
      var back;
      if (IN_ARCADE) {
        back = el('a',
          'pointer-events:auto;text-decoration:none;display:inline-flex;align-items:center;gap:6px;font-weight:700;' +
          'font-size:14px;color:#fff;background:rgba(15,23,42,.72);border:1px solid ' + accent + ';border-radius:999px;' +
          'padding:8px 14px;backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer;',
          '← All Games');
        back.href = HUB;
        back.addEventListener('mouseenter', function () { if (global.SFX) SFX.play('hover'); });
        back.addEventListener('click', function () { if (global.SFX) SFX.play('select'); });
      } else {
        back = el('span', '');
        var hubBtn = document.getElementById('hubBtn');   // a game's own "back to arcade" control
        if (hubBtn) hubBtn.style.display = 'none';
      }

      var right = el('div', 'pointer-events:auto;display:flex;gap:8px;align-items:center;');

      if (opts.title) {
        var badge = el('span',
          'font-weight:800;font-size:13px;letter-spacing:.5px;color:' + accent + ';background:rgba(15,23,42,.72);' +
          'border-radius:999px;padding:8px 14px;border:1px solid rgba(255,255,255,.15);text-transform:uppercase;',
          opts.title);
        right.appendChild(badge);
      }

      // "?" replay-tutorial button (only if this game has a tutorial)
      if (TUTORIALS[slug]) {
        var help = el('button',
          'pointer-events:auto;cursor:pointer;font-size:15px;font-weight:800;width:40px;height:40px;border-radius:50%;' +
          'border:1px solid ' + accent + ';background:rgba(15,23,42,.72);color:#fff;backdrop-filter:blur(6px);' +
          'box-shadow:0 4px 14px rgba(0,0,0,.3);', '?');
        help.title = 'How to play';
        help.addEventListener('click', function () { if (global.SFX) SFX.play('click'); showTutorial(slug, accent); });
        right.appendChild(help);
      }

      var mute = el('button',
        'pointer-events:auto;cursor:pointer;font-size:16px;width:40px;height:40px;border-radius:50%;border:1px solid ' +
        accent + ';background:rgba(15,23,42,.72);color:#fff;backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.3);');
      function paint() { mute.textContent = (global.SFX && SFX.isMuted()) ? '🔇' : '🔊'; }
      paint();
      mute.title = 'Toggle sound';
      mute.addEventListener('click', function () {
        if (global.SFX) { SFX.toggleMute(); if (!SFX.isMuted()) SFX.play('button'); }
        paint();
      });
      global.addEventListener('sfxmutechange', paint);
      right.appendChild(mute);

      var TIME = opts.time || 90;                       // equal session time for every game
      var startTimer = setupTimer(right, accent, TIME);

      bar.appendChild(back);
      bar.appendChild(right);
      document.body.appendChild(bar);

      // Show the tutorial; the fair session timer starts the moment it's
      // dismissed (so reading the how-to is free). No tutorial -> start on
      // the first interaction instead.
      if (opts.tutorial !== false && TUTORIALS[slug]) {
        showTutorial(slug, accent, startTimer);
      } else {
        var arm = function () { startTimer(); global.removeEventListener('pointerdown', arm); global.removeEventListener('keydown', arm); };
        global.addEventListener('pointerdown', arm);
        global.addEventListener('keydown', arm);
      }
    },

    // Local best (raw) for display; pass `level` (0..maxLevel) to feed the fair leaderboard.
    best: function (key, value, level, maxLevel) {
      var k = 'csArcade.best.' + key;
      if (value === undefined) {
        var v = 0;
        try { v = parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (e) {}
        return v;
      }
      if (typeof level === 'number') recordScore(key, level, maxLevel || 20, value);
      var cur = this.best(key);
      if (value > cur) { try { localStorage.setItem(k, String(value)); } catch (e) {} return true; }
      return false;
    },
    submitScore: function (slug, score, level, maxLevel) { return this.best(slug, score, level, maxLevel); },
    // Explicit fair-score report: level is 0..maxLevel (default 20).
    report: function (slug, level, maxLevel, raw) { recordScore(slug, level, maxLevel || 20, raw); },

    // ---- player identity ---------------------------------------------------
    getPlayer: function () { return readJSON(PLAYER_KEY, '') || ''; },
    setPlayer: function (name) {
      name = (name || '').toString().trim().slice(0, 24);
      if (!name) return false;
      writeJSON(PLAYER_KEY, name);
      var lb = readJSON(LB_KEY, {});
      if (!lb[name]) { lb[name] = { games: {}, raw: {}, plays: 0, updated: Date.now() }; writeJSON(LB_KEY, lb); }
      global.dispatchEvent(new CustomEvent('playerchange', { detail: { name: name } }));
      return true;
    },
    clearPlayer: function () { try { localStorage.removeItem(PLAYER_KEY); } catch (e) {} },

    // ---- mission (the 4 games a student picks) -----------------------------
    getMission: function () { return playerMission(curPlayer()) || []; },
    setMission: function (slugs) {
      slugs = (slugs || []).slice(0, 4);
      var m = missionsAll(); m[curPlayer()] = slugs; writeJSON(MISSION_KEY, m);
      global.dispatchEvent(new CustomEvent('missionchange', { detail: { mission: slugs } }));
    },

    // ---- leaderboard --------------------------------------------------------
    leaderboard: function () {
      var lb = readJSON(LB_KEY, {}), rows = [];
      for (var name in lb) if (lb.hasOwnProperty(name)) {
        var e = lb[name];
        rows.push({
          name: name, total: playerTotal(name, e), rawTotal: rawTotal(name, e),
          games: e.games || {}, raw: e.raw || {}, mission: playerMission(name) || [],
          plays: e.plays || 0, updated: e.updated || 0
        });
      }
      rows.sort(function (a, b) { return b.total - a.total || b.rawTotal - a.rawTotal || (a.updated - b.updated); });
      return rows;
    },
    resetLeaderboard: function () { try { localStorage.removeItem(LB_KEY); localStorage.removeItem(MISSION_KEY); } catch (e) {} },
    removePlayer: function (name) {
      var lb = readJSON(LB_KEY, {}); if (lb[name]) { delete lb[name]; writeJSON(LB_KEY, lb); }
      var m = missionsAll(); if (m[name]) { delete m[name]; writeJSON(MISSION_KEY, m); }
    },

    showTutorial: function (slug, accent) { showTutorial(slug || currentSlug(), accent); },

    // Fisher-Yates shuffle (returns a new array).
    shuffle: function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    },
    // Shuffle WITHIN consecutive bands (default 5) so the difficulty ramp is
    // preserved (early tiers stay easy) but the exact level order differs for
    // every new player. Ideal for level-wise games with authored levels.
    shuffleTiered: function (arr, band) {
      band = band || 5; var out = [];
      for (var i = 0; i < arr.length; i += band) { out = out.concat(this.shuffle(arr.slice(i, i + band))); }
      return out;
    },

    confetti: function (durationMs) {
      durationMs = durationMs || 1600;
      var cv = el('canvas', 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10001;');
      document.body.appendChild(cv);
      var ctx = cv.getContext('2d');
      if (!ctx) { setTimeout(function () { cv.remove(); }, 50); return; }
      function size() { cv.width = innerWidth; cv.height = innerHeight; }
      size();
      var colors = ['#f43f5e', '#f59e0b', '#22d3ee', '#a3e635', '#a855f7', '#38bdf8'];
      var bits = [];
      for (var i = 0; i < 140; i++) {
        bits.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.4,
          r: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0],
          vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4 });
      }
      var start = performance.now();
      function frame(now) {
        var t = now - start;
        ctx.clearRect(0, 0, cv.width, cv.height);
        bits.forEach(function (b) {
          b.x += b.vx; b.y += b.vy; b.rot += b.vr;
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
          ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 2, b.r, b.r * 0.6); ctx.restore();
        });
        if (t < durationMs) requestAnimationFrame(frame); else cv.remove();
      }
      requestAnimationFrame(frame);
    }
  };

  global.Arcade = Arcade;
})(window);
