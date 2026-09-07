/* Element building, text isolation, toasts, icons and the shared confirm sheet.
 * confirmAction lives here rather than in ui/ because core calls it too. */

import { activeLanguage, localizeText, t } from '../core/i18n.js';
import { storageFailed } from '../core/store.js';

// ---- Tiny utility helpers -----------------------------------
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
    // A <bdi> already isolates everything inside it, so splitting its own string
    // children into further <bdi class="ltr-run"> runs produces <bdi><bdi>…</bdi></bdi>.
    // Renderers wrap Latin names manually AND localizedTextNode wraps them
    // automatically, so every such call site was doubling. Translate the string
    // here, but leave the isolation to the <bdi> we are already building.
    if (typeof c === 'string') {
      el.appendChild(tag === 'bdi' ? document.createTextNode(localizeText(c)) : localizedTextNode(c));
      continue;
    }
    el.appendChild(c);
  }
  return el;
};
export const isolate = (...children) => h('bdi', {}, children);
export const brandMark = () => h('svg', {
  class: 'brand-mark', viewBox: '0 0 200 100', 'aria-hidden': 'true',
}, h('g', { transform: 'translate(100 50)', fill: 'currentColor' },
  h('rect', { x: '-84', y: '-5', width: '168', height: '10', rx: '5' }),
  h('circle', { cx: '-46', cy: '0', r: '25' }),
  h('circle', { cx: '46', cy: '0', r: '25' }),
  h('circle', { cx: '-80', cy: '0', r: '12' }),
  h('circle', { cx: '80', cy: '0', r: '12' }),
));
// Keep an approved technical URI together. The general run deliberately
// leaves sentence punctuation outside <bdi>; the URI alternative prevents a
// scheme such as scope.bit:// from being split into a false English fragment.
// The comma belongs in the run class. Without it "4,658" split into two runs —
// "4" and "658" — with the separator loose between them, and RTL reordered the
// whole thing into "658,4" on screen. A grouped number is ONE token.
export const LTR_RUN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[A-Za-z0-9:/?&=._%+-]*|[A-Za-z0-9][A-Za-z0-9 .,:×x/()+_-]*[A-Za-z0-9)]|[A-Za-z0-9]/g;
export const localizedTextNode = (value) => {
  const localized = localizeText(value);
  if (typeof localized !== 'string' || activeLanguage() !== 'ar' || !/[A-Za-z0-9]/.test(localized)) return document.createTextNode(localized);
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of localized.matchAll(LTR_RUN)) {
    const index = match.index ?? 0;
    if (index > cursor) fragment.appendChild(document.createTextNode(localized.slice(cursor, index)));
    const bdi = document.createElement('bdi');
    bdi.className = 'ltr-run';
    bdi.textContent = match[0];
    fragment.appendChild(bdi);
    cursor = index + match[0].length;
  }
  if (cursor < localized.length) fragment.appendChild(document.createTextNode(localized.slice(cursor)));
  return fragment;
};
export const setUiText = (el, value) => { el.replaceChildren(localizedTextNode(value)); };

export const toast = (msg, ms = 1800, actionLabel = '', actionFn = null) => {
  const t = $('#toast');
  t.innerHTML = '';
  t.classList.remove('skin-suggestion');
  t.appendChild(localizedTextNode(msg));
  if (actionLabel && actionFn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    setUiText(btn, actionLabel);
    btn.addEventListener('click', () => { t.classList.remove('show'); actionFn(); });
    t.appendChild(btn);
  }
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), ms);
};

// Confirming a save that did not happen is worse than saying nothing.
//
// When a local write fails, onStorageWriteFailed() puts an eight-second warning
// on screen. Every one of these success toasts fires in the same tick, straight
// afterwards, and replaces it — so the last thing he sees is «انحفظ» about data
// that is not saved anywhere. Exactly the bug already fixed for the sync toast.
// If storage is failing, the warning is left standing.
export function toastSaved(message) {
  if (storageFailed) return;
  toast(message);
}

// A real icon set, in the app's own hand.
//
// Settings shipped with emoji standing in for icons. Raed's verdict: «حتى
// الإيموجي ما تسوي شي بالنسبة لي» — and he is right. Emoji are somebody else's
// drawings at somebody else's weight, they render differently on every OS, they
// carry colour the palette never chose, and next to the tab bar's own line icons
// they read as a placeholder that was never replaced.
//
// These match that tab bar exactly: 24x24, no fill, currentColor, 1.8 stroke,
// round caps and joins. They inherit the skin's accent and text colours, they
// sit on the same optical weight as the navigation, and they look like one hand
// drew the whole app.
//
// The ⚙️ on the exercise card is deliberately NOT here: Raed asked for that one
// back as an emoji by name (item C6).
export const ICON_PATHS = {
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

// An in-app confirm.
//
// Native confirm()/prompt() are not dependable in an installed PWA — that is
// exactly why adding a clip never worked for Raed, and why he reports deleting
// a session "goes straight through". A destructive action must not depend on a
// dialog the shell is allowed to suppress.
//
// Returns a promise so callers read like the confirm() they replace.
export function confirmAction({ title, body, confirmLabel, danger = true }) {
  return new Promise((resolve) => {
    const modal = $('#modal');
    modal.innerHTML = '';
    const close = (answer) => { $('#modal-overlay').classList.remove('show'); resolve(answer); };
    modal.appendChild(h('div', { class: 'xs-head' }, h('h3', {}, title)));
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

