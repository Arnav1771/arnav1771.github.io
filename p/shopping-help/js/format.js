// =============================================
// format.js — markdown → sanitized, sectioned HTML
// =============================================
// Pure string functions with the two CDN libraries injected, so the pipeline is
// testable in node without a DOM.

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function escapeRegex(str) {
  return String(str ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const SECTIONS = [
  'Simple explanation',
  'Price advice',
  'Seller check',
  'Buy this if',
  'Do not buy this if',
  'Common problems',
  'My advice for Mummy'
];

const DECISIONS = {
  buy: { cls: 'decision-buy', icon: '✅' },
  avoid: { cls: 'decision-avoid', icon: '❌' },
  'good if you like it': { cls: 'decision-good', icon: '🤷' }
};

/** Turn the model's fixed-format plain text into markdown with our blocks. */
export function preprocess(text) {
  let processed = String(text ?? '');

  processed = processed.replace(
    /Final decision:\s*\n*(?:Choose only one:\s*\n*)?[-•*]?\s*(Buy|Good if you like it|Avoid)/i,
    (_match, decision) => {
      const meta = DECISIONS[decision.toLowerCase()] || {
        cls: 'decision-good',
        icon: '🤔'
      };
      return `### Final Decision\n<div class="decision-badge ${meta.cls}">${meta.icon} ${decision}</div>\n\n`;
    }
  );

  for (const section of SECTIONS) {
    const regex = new RegExp(`^\\s*\\**(${escapeRegex(section)})\\**:?\\s*$`, 'gim');
    processed = processed.replace(regex, `### ${section}\n`);
  }

  return processed;
}

/** Wrap the closing advice so the stylesheet can highlight it. */
export function wrapMummyAdvice(html) {
  return String(html ?? '').replace(
    /(<h3[^>]*>My advice for Mummy<\/h3>)(.*?)(?=<h3|$)/is,
    (_m, header, content) => `${header}<div class="mummy-advice">${content}</div>`
  );
}

/**
 * The disclosure shown whenever the answering model had no live web search.
 *
 * Only Gemini can search. When the chain falls through to NVIDIA or Groq — or
 * when Gemini itself answers with the googleSearch tool dropped after a quota
 * error — the advice is reasoning from training data, not from this product's
 * page, its reviews or its seller. An unresearched answer that looks researched
 * is the one failure mode that would genuinely mislead her, so the answer says
 * so in plain Hinglish, in the bubble itself, not in a footnote she will miss.
 */
export const UNGROUNDED_NOTICE =
  'Ye advice bina internet search ke hai, isliye reviews check nahi kar paya.';

/**
 * Append the ungrounded disclosure to already-sanitised answer HTML.
 * A grounded answer is returned untouched.
 *
 * @param {string} html sanitised html from formatAiResponse()
 * @param {boolean} grounded whether the answering model actually searched
 */
export function withUngroundedNotice(html, grounded) {
  if (grounded) return String(html ?? '');
  return `${String(html ?? '')}<p class="ungrounded-notice">${escapeHtml(
    UNGROUNDED_NOTICE
  )}</p>`;
}

/**
 * @param {string} text raw model output
 * @param {{marked?: object, DOMPurify?: object}} [deps]
 */
export function formatAiResponse(text, deps = {}) {
  const md =
    deps.marked || (typeof globalThis !== 'undefined' ? globalThis.marked : null);
  const purify =
    deps.DOMPurify ||
    (typeof globalThis !== 'undefined' ? globalThis.DOMPurify : null);

  const processed = preprocess(text);

  let html;
  if (md && typeof md.parse === 'function') {
    html = md.parse(processed);
  } else {
    // marked failed to load (CDN blocked): degrade to escaped text, never
    // inject the raw model output as HTML.
    html = escapeHtml(processed).replace(/\n/g, '<br>');
  }

  if (purify && typeof purify.sanitize === 'function') {
    html = purify.sanitize(html);
  } else if (md && typeof md.parse === 'function') {
    // Parsed markdown but no sanitizer available — re-escape rather than trust.
    html = escapeHtml(processed).replace(/\n/g, '<br>');
  }

  return wrapMummyAdvice(html);
}
