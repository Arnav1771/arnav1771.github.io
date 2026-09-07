/*
 * Arcade — shared audio engine
 * ---------------------------------
 * Hybrid sound: synthesized WebAudio tones for instant UI feedback, plus
 * real CC0 .wav samples (SubspaceAudio / Juhani Junkala, public domain) for
 * the big celebratory moments.
 *
 * Usage from any page (hub or a game, at any folder depth):
 *   <script src="<relative>/assets/js/audio.js"></script>
 *   SFX.play('correct');           // fire a named effect
 *   SFX.toggleMute();              // flip global mute (persists in localStorage)
 *   SFX.isMuted();                 // -> boolean
 *
 * The base path to /assets is derived from this script's own <src>, so it
 * works the same whether the page lives at "/index.html" or
 * "/games/binary-blitz/index.html".
 */
(function (global) {
  'use strict';

  // ---- work out where /assets/ lives, from our own script src -------------
  var me = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var src = me ? me.src : '';
  // src ends with ".../assets/js/audio.js" -> strip "js/audio.js"
  var ASSETS = src.replace(/js\/audio\.js.*$/, '');
  var SFX_DIR = ASSETS + 'sfx/';

  var MUTE_KEY = 'csArcade.muted';

  var ctx = null;         // AudioContext (created lazily on first gesture)
  var master = null;      // master gain node
  var samples = {};       // name -> decoded AudioBuffer
  var muted = (function () {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  })();

  // Which named effects come from downloaded .wav samples.
  var SAMPLE_FILES = {
    correct: 'correct.wav',
    wrong:   'wrong.wav',
    win:     'win.wav',
    fanfare: 'fanfare.wav',
    coin:    'coin.wav',
    powerup: 'powerup.wav',
    button:  'button.wav',
    select:  'select.wav',
    blip:    'blip.wav',
    portal:  'portal.wav'
  };

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    // start preloading samples once we have a context
    preload();
    return ctx;
  }

  function preload() {
    Object.keys(SAMPLE_FILES).forEach(function (name) {
      if (samples[name]) return;
      fetch(SFX_DIR + SAMPLE_FILES[name])
        .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(); })
        .then(function (buf) {
          return new Promise(function (res, rej) {
            ctx.decodeAudioData(buf, res, rej);
          });
        })
        .then(function (decoded) { samples[name] = decoded; })
        .catch(function () { /* fall back to synth for this name */ });
    });
  }

  // resume the context on the first user gesture (browsers require this)
  function unlock() {
    var c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    global.addEventListener(ev, unlock, { once: false, passive: true });
  });

  // ---- low level synth ----------------------------------------------------
  function tone(opts) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqTo), t0 + opts.dur);
    }
    var peak = (opts.gain == null ? 0.25 : opts.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  function chord(freqs, dur, type, gap) {
    freqs.forEach(function (f, i) {
      tone({ freq: f, dur: dur, type: type || 'triangle', delay: (gap || 0) * i, gain: 0.18 });
    });
  }

  function noiseBurst(dur, gain) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = c.createBufferSource();
    s.buffer = buf;
    var g = c.createGain();
    g.gain.value = gain == null ? 0.2 : gain;
    s.connect(g).connect(master);
    s.start();
  }

  function playSample(name, vol) {
    var c = ensureCtx();
    if (!c || muted) return false;
    var buf = samples[name];
    if (!buf) return false;
    var s = c.createBufferSource();
    s.buffer = buf;
    var g = c.createGain();
    g.gain.value = vol == null ? 0.8 : vol;
    s.connect(g).connect(master);
    s.start();
    return true;
  }

  // ---- named effects: synth for snappy UI, samples for big moments --------
  var SYNTH = {
    click:  function () { tone({ freq: 660, dur: 0.05, type: 'square', gain: 0.15 }); },
    hover:  function () { tone({ freq: 880, dur: 0.03, type: 'sine', gain: 0.08 }); },
    tick:   function () { tone({ freq: 1200, dur: 0.03, type: 'square', gain: 0.12 }); },
    move:   function () { tone({ freq: 320, dur: 0.06, freqTo: 220, type: 'sawtooth', gain: 0.14 }); },
    flip:   function () { tone({ freq: 500, dur: 0.07, freqTo: 720, type: 'triangle', gain: 0.16 }); },
    step:   function () { tone({ freq: 240, dur: 0.05, type: 'square', gain: 0.12 }); },
    type:   function () { tone({ freq: 400 + Math.random() * 120, dur: 0.025, type: 'square', gain: 0.09 }); },
    swap:   function () { tone({ freq: 300, dur: 0.05, freqTo: 480, type: 'triangle', gain: 0.14 }); },
    lose:   function () { tone({ freq: 300, dur: 0.5, freqTo: 90, type: 'sawtooth', gain: 0.25 }); },
    error:  function () { tone({ freq: 180, dur: 0.18, type: 'square', gain: 0.2 }); },
    start:  function () { chord([523, 659, 784, 1047], 0.18, 'triangle', 0.06); },
    whoosh: function () { noiseBurst(0.18, 0.15); }
  };

  // Names that prefer a downloaded sample, with a synth fallback.
  var SAMPLE_FIRST = {
    correct: function () { chord([784, 1047], 0.16, 'triangle', 0.05); },
    wrong:   function () { SYNTH.error(); },
    win:     function () { chord([523, 659, 784, 1047, 1319], 0.22, 'triangle', 0.08); },
    fanfare: function () { chord([392, 523, 659, 784], 0.28, 'triangle', 0.09); },
    coin:    function () { tone({ freq: 988, dur: 0.08, type: 'square', gain: 0.2 }); tone({ freq: 1319, dur: 0.12, type: 'square', gain: 0.2, delay: 0.07 }); },
    powerup: function () { tone({ freq: 440, dur: 0.25, freqTo: 1320, type: 'square', gain: 0.2 }); },
    button:  function () { SYNTH.click(); },
    select:  function () { tone({ freq: 740, dur: 0.06, freqTo: 980, type: 'triangle', gain: 0.15 }); },
    blip:    function () { tone({ freq: 1000, dur: 0.04, type: 'square', gain: 0.12 }); },
    portal:  function () { tone({ freq: 220, dur: 0.4, freqTo: 900, type: 'sine', gain: 0.2 }); }
  };

  var SFX = {
    play: function (name, opts) {
      if (muted) return;
      opts = opts || {};
      if (SAMPLE_FILES[name]) {
        var ok = playSample(name, opts.vol);
        if (!ok && SAMPLE_FIRST[name]) SAMPLE_FIRST[name]();
        return;
      }
      if (SYNTH[name]) { SYNTH[name](); return; }
      // unknown name -> gentle blip
      tone({ freq: 600, dur: 0.05, type: 'square', gain: 0.12 });
    },
    // expose a raw tone for games that want custom melodies
    tone: tone,
    chord: chord,
    noise: noiseBurst,
    isMuted: function () { return muted; },
    setMuted: function (v) {
      muted = !!v;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      if (!muted) unlock();
      global.dispatchEvent(new CustomEvent('sfxmutechange', { detail: { muted: muted } }));
    },
    toggleMute: function () { this.setMuted(!muted); return muted; },
    unlock: unlock
  };

  global.SFX = SFX;
})(window);
