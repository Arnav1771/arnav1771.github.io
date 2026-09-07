// =============================================
// app.js — DOM controller
// =============================================
// The only module that touches the document. Everything it needs is looked up
// defensively: a missing optional element degrades, it never throws.
//
// DOM contract (ids owned by index.html, which this module does not modify):
//   gate      password-modal, password-input, unlock-btn, password-error, lock-app-btn
//   chat      chat-area, welcome-message, messages-container, clear-chat-btn
//   input     product-url-input, send-btn
//   status    .status-dot, .status-text
//   settings  settings-btn, settings-modal, settings-close-btn,
//             gemini-key-input, nvidia-key-input, groq-key-input,
//             save-keys-btn, clear-keys-btn, keys-status
//   result    answered-by, retry-btn
//
// There is deliberately NO model picker. The end user is the owner's mother:
// she must never be asked to make a technical choice, so the chain in
// js/config.js is walked automatically and nothing about it is selectable or
// persisted. #answered-by still names the model that answered, because that is
// information, not a decision.

import { APP_PASSWORD, PROVIDER_NAMES, STORAGE_KEYS } from './config.js';
import { CREDENTIALS } from './credentials.js';
import { formatAiResponse, UNGROUNDED_NOTICE, withUngroundedNotice } from './format.js';
import {
  clearKeys,
  hasAnyKey,
  loadKeys,
  maskKey,
  resolveKeys,
  saveKeys
} from './keys.js';
import { REASONS, askWithFallback, labelFor } from './llm.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelector(sel);

const el = {};
const state = {
  unlocked: false,
  processing: false,
  history: [],
  keys: { gemini: '', nvidia: '', groq: '' },
  lastUrl: ''
};

const LOADING_MESSAGES = [
  'Reviews padh raha hoon...',
  'Reddit par check kar raha hoon...',
  'Price compare kar raha hoon...',
  'Bas thoda aur time...'
];
let loadingInterval = null;

// ---------------------------------------------
// Storage helpers
// ---------------------------------------------
function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {
    /* quota / private mode */
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {
    /* noop */
  }
}

function loadHistory() {
  try {
    const stored = safeGet(STORAGE_KEYS.chat);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    safeRemove(STORAGE_KEYS.chat);
    return [];
  }
}

function persistHistory() {
  try {
    safeSet(STORAGE_KEYS.chat, JSON.stringify(state.history));
  } catch (_) {
    /* noop */
  }
}

// ---------------------------------------------
// Status + result banners
// ---------------------------------------------
function setStatus(kind, text) {
  if (el.statusDot) el.statusDot.className = `status-dot ${kind}`;
  if (el.statusText) el.statusText.textContent = text;
}

function setAnsweredBy(text, grounded = true) {
  if (!el.answeredBy) return;
  el.answeredBy.textContent = text || '';
  el.answeredBy.classList.toggle('hidden', !text);
  el.answeredBy.classList.toggle('answered-by--ungrounded', Boolean(text) && !grounded);
}

function showRetry(show) {
  if (!el.retryBtn) return;
  el.retryBtn.classList.toggle('hidden', !show);
  el.retryBtn.disabled = !show;
}

// ---------------------------------------------
// Message rendering
// ---------------------------------------------
function scrollToBottom() {
  if (!el.chatArea) return;
  requestAnimationFrame(() => {
    el.chatArea.scrollTop = el.chatArea.scrollHeight;
  });
}

function appendMessage(node) {
  if (el.messagesContainer) el.messagesContainer.appendChild(node);
  scrollToBottom();
}

function renderUserMessage(url) {
  const wrap = document.createElement('div');
  wrap.className = 'message-user';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = url;
  bubble.appendChild(link);
  wrap.appendChild(bubble);
  appendMessage(wrap);
}

function renderAiMessage(html, rawText, meta) {
  const wrap = document.createElement('div');
  wrap.className = 'message-ai';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble ai-content';
  // The disclosure is appended to the sanitised html rather than injected as
  // raw model text, so it can never be forged by the model itself.
  bubble.innerHTML = withUngroundedNotice(html, Boolean(meta && meta.grounded));
  wrap.appendChild(bubble);

  if (meta && meta.answeredBy) {
    const tag = document.createElement('div');
    tag.className = 'message-meta';
    tag.textContent = metaLine(meta);
    wrap.appendChild(tag);
  }

  if (rawText) wrap.appendChild(buildShareButton(rawText));
  appendMessage(wrap);
}

function metaLine(meta) {
  let line = `Answered by ${meta.answeredBy}`;
  if (meta.failedOver > 0) {
    line += ` (${meta.failedOver} attempt${meta.failedOver === 1 ? '' : 's'} failed over)`;
  }
  // Grounded vs not is the one thing about the model that actually changes how
  // much the answer is worth, so it is stated in her language, not in jargon.
  line += meta.grounded
    ? ' · internet se check kiya'
    : ` · ${UNGROUNDED_NOTICE}`;
  return line;
}

function buildShareButton(rawText) {
  const btn = document.createElement('button');
  btn.className = 'share-btn';
  btn.type = 'button';
  const label = 'Share';
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mummy's Shopping Advice", text: rawText });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(rawText);
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = label;
        }, 2000);
      }
    } catch (_) {
      /* user dismissed the share sheet */
    }
  });
  return btn;
}

function addUserMessage(url) {
  renderUserMessage(url);
  state.history.push({ role: 'user', url });
  persistHistory();
}

function addAiMessage(text, meta) {
  const html = formatAiResponse(text);
  renderAiMessage(html, text, meta);
  state.history.push({
    role: 'ai',
    html,
    rawText: text,
    answeredBy: meta && meta.answeredBy,
    failedOver: meta && meta.failedOver,
    grounded: meta && meta.grounded
  });
  persistHistory();
}

function addErrorMessage(text, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'message-ai message-error';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = `⚠️ ${text}`;
  wrap.appendChild(bubble);
  appendMessage(wrap);
  if (opts.openSettings) openSettings();
}

function addTypingIndicator() {
  const node = document.createElement('div');
  node.className = 'typing-indicator';
  const dots = document.createElement('div');
  dots.className = 'typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';
  const label = document.createElement('span');
  label.className = 'loading-text';
  label.textContent = LOADING_MESSAGES[0];
  node.appendChild(dots);
  node.appendChild(label);
  appendMessage(node);

  let i = 0;
  loadingInterval = setInterval(() => {
    i = (i + 1) % LOADING_MESSAGES.length;
    label.style.opacity = 0;
    setTimeout(() => {
      label.textContent = LOADING_MESSAGES[i];
      label.style.opacity = 1;
    }, 300);
  }, 2500);
  return node;
}

function removeTypingIndicator(node) {
  if (loadingInterval) clearInterval(loadingInterval);
  loadingInterval = null;
  if (node && node.parentNode) node.parentNode.removeChild(node);
}

// ---------------------------------------------
// Settings: keys only — there is nothing else to choose
// ---------------------------------------------
function migrateLegacyKey() {
  const legacy = safeGet('gemini_api_key');
  if (legacy && !safeGet(STORAGE_KEYS.gemini)) {
    saveKeys({ gemini: legacy });
    safeRemove('gemini_api_key');
  }
}

function refreshKeysStatus() {
  // First-run banner: only meaningful until a key exists.
  if (el.setupHint) el.setupHint.classList.toggle('hidden', hasAnyKey(state.keys));
  if (!el.keysStatus) return;
  const LABELS = { gemini: 'Gemini', nvidia: 'NVIDIA', groq: 'Groq' };
  const parts = [];
  for (const name of PROVIDER_NAMES) {
    if (state.keys[name]) parts.push(`${LABELS[name]}: ${maskKey(state.keys[name])}`);
  }
  el.keysStatus.textContent = parts.length
    ? `Saved in this browser — ${parts.join(' · ')}`
    : 'Koi key save nahi hai. Kam se kam ek key daalo.';
  el.keysStatus.classList.toggle('warn', parts.length === 0);
}

function openSettings() {
  if (!el.settingsModal) return;
  if (el.geminiKeyInput) el.geminiKeyInput.value = state.keys.gemini || '';
  if (el.nvidiaKeyInput) el.nvidiaKeyInput.value = state.keys.nvidia || '';
  if (el.groqKeyInput) el.groqKeyInput.value = state.keys.groq || '';
  refreshKeysStatus();
  el.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  if (el.settingsModal) el.settingsModal.classList.add('hidden');
}

function handleSaveKeys() {
  const stored = saveKeys({
    gemini: el.geminiKeyInput ? el.geminiKeyInput.value : state.keys.gemini,
    nvidia: el.nvidiaKeyInput ? el.nvidiaKeyInput.value : state.keys.nvidia,
    groq: el.groqKeyInput ? el.groqKeyInput.value : state.keys.groq
  });
  state.keys = resolveKeys(stored, CREDENTIALS);
  refreshKeysStatus();
  updateSendState();
  if (hasAnyKey(state.keys)) closeSettings();
}

function handleClearKeys() {
  clearKeys();
  // Clearing the browser's copy falls back to whatever js/credentials.js ships
  // with, which is normally nothing at all.
  state.keys = resolveKeys({}, CREDENTIALS);
  if (el.geminiKeyInput) el.geminiKeyInput.value = '';
  if (el.nvidiaKeyInput) el.nvidiaKeyInput.value = '';
  if (el.groqKeyInput) el.groqKeyInput.value = '';
  refreshKeysStatus();
  updateSendState();
}

// ---------------------------------------------
// Password gate (UI-gating only — see README)
// ---------------------------------------------
function showPasswordModal() {
  if (!el.passwordModal) return;
  el.passwordModal.classList.remove('hidden');
  if (el.passwordInput) el.passwordInput.value = '';
  if (el.passwordError) el.passwordError.classList.add('hidden');
  setTimeout(() => el.passwordInput && el.passwordInput.focus(), 100);
}

function hidePasswordModal() {
  if (el.passwordModal) el.passwordModal.classList.add('hidden');
}

function handleUnlock() {
  const entered = el.passwordInput ? el.passwordInput.value.trim() : '';
  if (entered === APP_PASSWORD) {
    state.unlocked = true;
    try {
      sessionStorage.setItem(STORAGE_KEYS.unlocked, 'true');
    } catch (_) {
      /* noop */
    }
    hidePasswordModal();
    setStatus('ready', 'READY');
    if (el.productUrlInput) el.productUrlInput.focus();
    if (!hasAnyKey(state.keys)) openSettings();
  } else if (el.passwordError) {
    el.passwordError.classList.remove('hidden');
    if (el.passwordInput) el.passwordInput.focus();
  }
}

function handleLock() {
  state.unlocked = false;
  try {
    sessionStorage.removeItem(STORAGE_KEYS.unlocked);
  } catch (_) {
    /* noop */
  }
  showPasswordModal();
  setStatus('ready', 'LOCKED');
}

// ---------------------------------------------
// Send flow
// ---------------------------------------------
function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function updateSendState() {
  if (!el.sendBtn) return;
  const value = el.productUrlInput ? el.productUrlInput.value.trim() : '';
  el.sendBtn.disabled = !value || state.processing;
}

async function handleSend(explicitUrl) {
  const url = (explicitUrl || (el.productUrlInput ? el.productUrlInput.value : '')).trim();
  if (!url || state.processing) return;

  if (!isValidUrl(url)) {
    addErrorMessage(
      'Ye valid link nahi lag raha. Product ka pura URL paste karo (https:// se shuru hona chahiye).'
    );
    return;
  }

  if (!hasAnyKey(state.keys)) {
    addErrorMessage(
      'API key set nahi hai. Settings (⚙️) kholo aur apni Gemini ya NVIDIA key paste karo.',
      { openSettings: true }
    );
    return;
  }

  if (el.welcomeMessage) el.welcomeMessage.classList.add('hidden');
  if (!explicitUrl) addUserMessage(url);
  state.lastUrl = url;
  if (el.productUrlInput && !explicitUrl) el.productUrlInput.value = '';
  state.processing = true;
  updateSendState();
  showRetry(false);
  setAnsweredBy('');
  setStatus('loading', 'THINKING...');

  const typing = addTypingIndicator();
  const result = await askWithFallback({
    productUrl: url,
    keys: state.keys,
    onAttempt: (attempt) => {
      if (attempt.ok || !attempt.model) return;
      setStatus('loading', `RETRYING · ${labelFor(attempt.model)}`);
    }
  });
  removeTypingIndicator(typing);

  if (result.ok) {
    addAiMessage(result.text, {
      answeredBy: result.answeredBy,
      failedOver: result.failedOver,
      grounded: result.grounded
    });
    setAnsweredBy(
      metaLine({
        answeredBy: result.answeredBy,
        failedOver: result.failedOver,
        grounded: result.grounded
      }),
      result.grounded
    );
    setStatus('ready', 'READY');
    showRetry(false);
  } else {
    // Never a status code, never a stack trace — a friendly line plus the
    // right next action for this reason.
    addErrorMessage(result.message, {
      openSettings:
        result.reason === REASONS.NO_KEYS || result.reason === REASONS.INVALID_KEY
    });
    setAnsweredBy('');
    setStatus('error', 'ERROR');
    showRetry(true);
    setTimeout(() => setStatus('ready', 'READY'), 4000);
  }

  state.processing = false;
  updateSendState();
}

function handleRetry() {
  if (!state.lastUrl || state.processing) return;
  showRetry(false);
  handleSend(state.lastUrl);
}

function handleClearChat() {
  state.history = [];
  safeRemove(STORAGE_KEYS.chat);
  if (el.messagesContainer) el.messagesContainer.innerHTML = '';
  if (el.welcomeMessage) el.welcomeMessage.classList.remove('hidden');
  setAnsweredBy('');
  showRetry(false);
}

// ---------------------------------------------
// Wiring
// ---------------------------------------------
function on(node, event, handler) {
  if (node && typeof node.addEventListener === 'function') {
    node.addEventListener(event, handler);
  }
}

export function init() {
  Object.assign(el, {
    passwordModal: $('password-modal'),
    passwordInput: $('password-input'),
    unlockBtn: $('unlock-btn'),
    passwordError: $('password-error'),
    lockAppBtn: $('lock-app-btn'),
    clearChatBtn: $('clear-chat-btn'),
    chatArea: $('chat-area'),
    welcomeMessage: $('welcome-message'),
    messagesContainer: $('messages-container'),
    productUrlInput: $('product-url-input'),
    sendBtn: $('send-btn'),
    statusDot: $$('.status-dot'),
    statusText: $$('.status-text'),
    settingsBtn: $('settings-btn'),
    settingsModal: $('settings-modal'),
    settingsCloseBtn: $('settings-close-btn'),
    geminiKeyInput: $('gemini-key-input'),
    nvidiaKeyInput: $('nvidia-key-input'),
    groqKeyInput: $('groq-key-input'),
    saveKeysBtn: $('save-keys-btn'),
    clearKeysBtn: $('clear-keys-btn'),
    keysStatus: $('keys-status'),
    answeredBy: $('answered-by'),
    retryBtn: $('retry-btn'),
    setupHint: $('setup-hint')
  });

  migrateLegacyKey();
  state.keys = resolveKeys(loadKeys(), CREDENTIALS);
  state.history = loadHistory();

  refreshKeysStatus();
  setAnsweredBy('');
  showRetry(false);

  try {
    state.unlocked = sessionStorage.getItem(STORAGE_KEYS.unlocked) === 'true';
  } catch (_) {
    state.unlocked = false;
  }
  const gated = Boolean(APP_PASSWORD);
  if (!gated || state.unlocked) {
    hidePasswordModal();
    setStatus('ready', 'READY');
  } else {
    showPasswordModal();
  }

  if (state.history.length > 0) {
    if (el.welcomeMessage) el.welcomeMessage.classList.add('hidden');
    for (const msg of state.history) {
      if (msg.role === 'user') renderUserMessage(msg.url);
      else if (msg.role === 'ai') {
        renderAiMessage(msg.html, msg.rawText, {
          answeredBy: msg.answeredBy,
          failedOver: msg.failedOver || 0,
          grounded: msg.grounded
        });
      }
    }
    scrollToBottom();
  }

  on(el.unlockBtn, 'click', handleUnlock);
  on(el.passwordInput, 'keydown', (e) => {
    if (e.key === 'Enter') handleUnlock();
  });
  on(el.lockAppBtn, 'click', handleLock);
  on(el.clearChatBtn, 'click', handleClearChat);
  on(el.settingsBtn, 'click', openSettings);
  on(el.settingsCloseBtn, 'click', closeSettings);
  on(el.saveKeysBtn, 'click', handleSaveKeys);
  on(el.clearKeysBtn, 'click', handleClearKeys);
  on(el.retryBtn, 'click', handleRetry);
  on(el.productUrlInput, 'input', updateSendState);
  on(el.productUrlInput, 'keydown', (e) => {
    if (e.key === 'Enter' && el.sendBtn && !el.sendBtn.disabled) handleSend();
  });
  on(el.sendBtn, 'click', () => handleSend());
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape') closeSettings();
  });

  updateSendState();

  // First run with no key at all: point the user straight at settings.
  if (!hasAnyKey(state.keys) && (!gated || state.unlocked)) openSettings();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
