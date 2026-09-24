/* Element building, text isolation, toasts, icons and the shared confirm sheet.
 * confirmAction lives here rather than in ui/ because core calls it too. */

import { activeLanguage, localizeText, t } from '../core/i18n.js';
import { storageFailed } from '../core/store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style') el.setAttribute('style', attrs[k]);
    else if (k.startsWith('on') && typeof attrs[k] === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) {
      const value = /^(?:title|placeholder|aria-label)$/.test(k) ? localizeText(attrs[k]) : attrs[k];
      el.setAttribute(k, value);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    // A <bdi> already isolates everything inside it, so splitting its own
    // string children into further <bdi class="ltr-run"> runs produces
    // <bdi><bdi>…</bdi></bdi>.
    if (typeof c === 'string') {
      el.appendChild(tag === 'bdi' ? document.createTextNode(localizeText(c)) : localizedTextNode(c));
      continue;
    }
    el.appendChild(c);
  }
  return el;
};
export const isolate = (...children) => h('bdi', {}, children);
// The brand mark is an SVG, so it must be built in the SVG namespace — h() uses
// createElement, which yields an XHTML <svg> that lays out as an empty box.
// Same art as the header mark in index.html.
export const brandMark = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'brand-mark');
  svg.setAttribute('viewBox', '0 0 200 130');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M29 50V74M35 42V82M165 42V82M171 50V74M36 62H164');
  svg.appendChild(path);
  return svg;
};
// Keep an approved technical URI together. The general run deliberately
// leaves sentence punctuation outside <bdi>; the URI alternative prevents a
// scheme such as scope.bit:// from being split into a false English fragment.
const LTR_RUN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[A-Za-z0-9:/?&=._%+-]*|[A-Za-z0-9][A-Za-z0-9 .,:×x/()+_-]*[A-Za-z0-9)]|[A-Za-z0-9]/g;
export const localizedTextNode = (value) => {
  const localized = localizeText(value);
  if (typeof localized !== 'string' || activeLanguage() !== 'ar' || !/[A-Za-z0-9]/.test(localized)) return document.createTextNode(localized);
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of localized.matchAll(LTR_RUN)) {
    let index = match.index ?? 0;
    let text = match[0];
    // The run's character class allows ')', so «النطاق (4.5 MET)» matched
    // «4.5 MET)» and left the opening '(' behind in the Arabic text node. An
    // unpaired '(' in an RTL context is MIRRORED by the bidi algorithm and is
    // drawn as ')', which is the doubled parenthesis Raed reported in coach
    // answers. Balance it: take the opener into the run when it is right there,
    // and otherwise hand the closer back to the Arabic side.
    if (text.endsWith(')') && !text.includes('(')) {
      if (index - 1 >= cursor && localized[index - 1] === '(') { index -= 1; text = '(' + text; }
      else { text = text.slice(0, -1); }
    }
    if (index > cursor) fragment.appendChild(document.createTextNode(localized.slice(cursor, index)));
    const bdi = document.createElement('bdi');
    bdi.className = 'ltr-run';
    bdi.textContent = text;
    fragment.appendChild(bdi);
    cursor = index + text.length;
  }
  if (cursor < localized.length) fragment.appendChild(document.createTextNode(localized.slice(cursor)));
  return fragment;
};
export const setUiText = (el, value) => { el.replaceChildren(localizedTextNode(value)); };

// ===== Toast clearance =====
//
// The toast is the only surface in the app that floats over a page it knows
// nothing about, and at 390×844 the bottom of a page is exactly where his
// controls live. Measured on his phone size 2026-09-23:
//   · End screen — the 9s undo toast occupied y 713→768 while both `.end-cta`
//     buttons sat at y 722.2→770.2. `elementFromPoint` at the centre of «تم»
//     returned the toast's «تراجع», so the tap that means "done" called
//     reopenSession() and pulled the session back out of history. Both CTAs
//     measured hitH 0 for the full nine seconds.
//   · Runner — «أنهِ الجلسة» at y 714.5→758.5 hit-tested to #toast, and the
//     toasts that fire there in his real use are the offline ones
//     (core/sync.js `cloud_sync_failed`, app.js `sync_failed_offline`); he
//     trains offline.
// In both, window.scrollY already equalled maxScroll (20px / 37px), so
// reserving page padding the way §A.3 reserves the rest dock's height cannot
// save it — and «scroll it out of the way» is the app asking him to do its
// layout (ROUND5-FABLE-BRIEF §A). So the toast moves instead:
//   1. the pill itself never takes a tap any more — `pointer-events` on
//      `.toast` stays none even when shown, restored only on its own buttons,
//      so the message can no longer eat a tap meant for the page (styles.css);
//   2. and when it does land on a control it hops above it by a MEASURED amount
//      — never a hard-coded 60 or 88 — so he can see the button he is reaching
//      for, not just reach it.
const TOAST_GAP = 8;          // the air the toast keeps between itself and a control
// One hop, never a climb. The toast is parked at the bottom of the page, so the
// controls it covers ARE the page's last ones, and clearing them is the whole
// job — «raise the toast above the page's last control» (ROUND5 §A's reading of
// the same defect). Chasing every control it meets on the way up was measured
// on the runner, where the set grid is a ladder of inputs: it climbed 186px and
// parked the message in the middle of the screen. Capped at a row-plus-pill, so
// it can clear a 56px action row and no more.
const TOAST_MAX_LIFT = 160;
const TOAST_CONTROLS = 'button, a[href], input, select, textarea, summary, [role="button"]';

export function syncToastClearance() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('toast');
  if (!el) return;
  // Measure from the seat the toast would take on its own, so a lift is never
  // computed on top of a previous one.
  el.style.setProperty('--toast-lift', '0px');
  if (!el.classList.contains('show')) return;
  const box = el.getBoundingClientRect();
  if (!box.height) return;
  let lift = 0;
  for (const node of document.querySelectorAll(TOAST_CONTROLS)) {
    if (node === el || el.contains(node)) continue;
    const r = node.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;              // a hidden page reports 0×0
    if (r.left >= box.right || r.right <= box.left) continue; // beside it, not under it
    if (r.top >= box.bottom || r.bottom <= box.top) continue; // not in its band at all
    lift = Math.max(lift, box.bottom - r.top + TOAST_GAP);
  }
  // Clamped, and kept wholly on screen: it is still a message. If a page is so
  // dense that the hop cannot clear it, rule 1 still holds — the pill takes no
  // taps, so nothing under it becomes unreachable.
  lift = Math.max(0, Math.min(lift, TOAST_MAX_LIFT, box.top - 8));
  el.style.setProperty('--toast-lift', `${Math.round(lift)}px`);
}

// Re-measured while he scrolls, but ONLY for a toast that carries an action —
// its button is the one part of the pill that can still take a tap, so it is
// the one that must not drift over a control. A plain message bobbing up and
// down the screen as he scrolls would be worse than the occlusion it avoids.
if (typeof window !== 'undefined') {
  let frame = 0;
  const schedule = () => {
    const el = document.getElementById('toast');
    if (!el || !el.classList.contains('show') || !el.querySelector('button')) return;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; syncToastClearance(); });
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
}

export const toast = (msg, ms = 1800, actionLabel = '', actionFn = null) => {
  const t = $('#toast');
  t.innerHTML = '';
  t.classList.remove('skin-suggestion');
  t.appendChild(localizedTextNode(msg));
  if (actionLabel && actionFn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    setUiText(btn, actionLabel);
    btn.addEventListener('click', () => { t.classList.remove('show'); syncToastClearance(); actionFn(); });
    t.appendChild(btn);
  }
  t.classList.add('show');
  // Twice: once now, so the very first frame is already clear, and once on the
  // next frame, when the pill's final height (wrapped Arabic, a loaded font) is
  // known. The measurement is idempotent — it always starts from lift 0.
  syncToastClearance();
  requestAnimationFrame(syncToastClearance);
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.classList.remove('show'); syncToastClearance(); }, ms);
};

// Confirming a save that did not happen is worse than saying nothing.
export function toastSaved(message) {
  if (storageFailed) return;
  toast(message);
}

// A real icon set, in the app's own hand.
const ICON_PATHS = {
  profile: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  programme: ['M8 4h8a1 1 0 0 1 1 1v0a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v0a1 1 0 0 1 1-1Z',
              'M7 5H5.6A1.6 1.6 0 0 0 4 6.6v12.8A1.6 1.6 0 0 0 5.6 21h12.8a1.6 1.6 0 0 0 1.6-1.6V6.6A1.6 1.6 0 0 0 18.4 5H17',
              'M8 11h8', 'M8 15h5'],
  coach: ['M12 5.5a3 3 0 0 0-5.9-.7A2.8 2.8 0 0 0 4 7.4c0 .7.3 1.4.7 1.9A2.9 2.9 0 0 0 4 11.5c0 1 .5 1.9 1.3 2.4A2.8 2.8 0 0 0 8 18c.9 0 1.7-.4 2.2-1',
           'M12 5.5a3 3 0 0 1 5.9-.7A2.8 2.8 0 0 1 20 7.4c0 .7-.3 1.4-.7 1.9A2.9 2.9 0 0 1 20 11.5c0 1-.5 1.9-1.3 2.4A2.8 2.8 0 0 1 16 18c-.9 0-1.7-.4-2.2-1',
           'M12 5.5V20'],
  sliders: ['M10 6H3', 'M21 6h-7', 'M7 12H3', 'M21 12h-9', 'M13 18H3', 'M21 18h-3'],
  music: ['M9 18V6l10-2v12', 'M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z', 'M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z'],
  cloud: ['M7 18a4 4 0 0 1 .6-8A5.5 5.5 0 0 1 18 11.2 3.4 3.4 0 0 1 17.5 18H7Z', 'M12 12v6', 'M9.5 15.5 12 18l2.5-2.5'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 7.6h.01'],
  spark: ['M12 3.5 13.7 9l5.3 1.7-5.3 1.7L12 18l-1.7-5.6L5 10.7 10.3 9 12 3.5Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M4.5 7h15', 'M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7', 'M6.5 7l.8 12A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-12'],
};
export function icon(name, size = 18) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ui-icon');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

// An installed PWA shell may suppress a native confirm(), turning a destructive
// tap into nothing at all. Every confirmation in the app goes through this.
export function confirmAction({ title, body, confirmLabel, danger = true }) {
  return new Promise((resolve) => {
    const modal = $('#modal');
    modal.innerHTML = '';
    const close = (answer) => { $('#modal-overlay').classList.remove('show'); resolve(answer); };
    // .xs-head forces direction:ltr on its h3 because the exercise sheet's title
    // is a bare Latin movement name. A confirmation's title is an Arabic
    // sentence, and it was rendering flush left under a right-aligned body.
    modal.appendChild(h('div', { class: 'xs-head confirm-head' }, h('h3', {}, title)));
    if (body) modal.appendChild(h('p', { class: 'confirm-body' }, body));
    modal.appendChild(h('div', { class: 'confirm-actions' },
      h('button', {
        class: 'btn full' + (danger ? ' danger' : ' primary'),
        'data-confirm-yes': 'true', onClick: () => close(true),
      }, confirmLabel),
      h('button', { class: 'btn ghost full', 'data-confirm-no': 'true', onClick: () => close(false) }, t('cancel')),
    ));
    $('#modal-overlay').classList.add('show');
  });
}

