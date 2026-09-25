/* The floating rest clock — one draggable circle that is the rest countdown,
 * and exists ONLY while a rest is running.
 *
 * Raed 2026-09-25: «ديزاين الوقت مو عاجبني، أنا أحب الديزاين floating وأقدر أحركه
 * يمين، يسار … أفكر إنه يكون زي الدائرة صغيرة، أو إنه شيء أنظف وأرتب».
 *
 * Raed 2026-09-25, after the preview: «ما أبغاه يطلع، أبغاه يختفي إذا ما فيه
 * عداد، مو يطلع وقت الزمن — هذا شيء مرة مهم». The first cut also carried the
 * session's elapsed h:mm on every page whenever no rest ran; he rejected it.
 * WHY: a clock that is always on screen is noise — it sits over whatever he is
 * reading and asks to be looked at when nothing is happening. The countdown is
 * the one live thing in a session; when it is not running there is nothing to
 * show. So: visible iff a session is active AND `restTimer.end > Date.now()`;
 * shown on the transition into rest, gone on end/cancel/skip and on finish.
 * There is no elapsed face, no elapsed tick, no session time in the pill.
 *
 * Round 5 put the countdown in flow inside the card because a fixed dock sat on
 * the Next button at every scroll position (ROUND5-FABLE-BRIEF §A). A circle he
 * parks where he wants is the other honest answer to «a fixed bar is always on
 * top of something»: it is 56px, it snaps to an edge, and its position is his.
 *
 * Ownership: core/rest.js still owns the ONE timer and paints every
 * `[data-rest-surface]` on its 200ms tick (this element is now the only one);
 * it dispatches `rw:rest` on each transition. This module owns visibility, the
 * drag and the pill. See ROUND6-FABLE-BRIEF §C.
 */

import { $, h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { cancelRest, extendRest, restTimer } from '../core/rest.js';
import { nsKey, safeGetItem, safeSetItem, settings, state } from '../core/store.js';

const SIZE = 56;          // the circle, px — one tap target, no floor needed
const EDGE = 12;          // gap to the screen edge it snaps to
// Default height above the tab bar. Measured on 390×844: after the rest-start
// scroll the runner's nav sits at 724–768 (tab top 776 − 8); at 12px the
// circle would span 700–756 and cover the end of the secondary button. At
// 68px it spans 644–700 — clear of the nav at both the revealed and the
// max-scroll positions (nav 708–752), and still in the thumb's reach. He can
// drag it anywhere from there.
const BOTTOM_DEFAULT = 68;
const DRAG_THRESHOLD = 6; // px; under it a pointerdown/up pair is a tap
const TAP_MS = 300;
const PILL_MS = 4000;

let el = null;
let pillTimer = null;

const posKey = () => (settings.user_id ? nsKey(settings.user_id, 'clockpos') : null);
function readPos() {
  const key = posKey();
  if (!key) return null;
  try {
    const raw = safeGetItem(key);
    const pos = raw ? JSON.parse(raw) : null;
    if (pos && (pos.side === 'left' || pos.side === 'right') && Number.isFinite(pos.bottom)) return pos;
  } catch (_) { /* a bad value is the same as none */ }
  return null;
}
function writePos(pos) {
  const key = posKey();
  if (key) safeSetItem(key, JSON.stringify(pos));
}

// The band the circle may live in: below the sticky header, above the tab bar.
function bounds() {
  const header = $('.app-header');
  const tab = $('.tab-bar');
  const top = (header ? header.getBoundingClientRect().bottom : 0) + 8;
  const tabTop = tab && !tab.classList.contains('hidden') ? tab.getBoundingClientRect().top : window.innerHeight;
  const bottomLimit = tabTop - 8;
  return { top, bottomLimit };
}

// Default anchor: bottom-start, clear of the tab bar. `start` is physical
// right in RTL — the thumb side for a right-handed phone held in one hand.
function defaultPos() {
  const rtl = document.documentElement.dir === 'rtl';
  return { side: rtl ? 'right' : 'left', bottom: BOTTOM_DEFAULT };
}

function applyPos(pos) {
  if (!el) return;
  const { top, bottomLimit } = bounds();
  // `bottom` is measured from the tab bar's top, so the stored value survives
  // the tab bar hiding and showing; clamp it into the band.
  const maxBottom = Math.max(EDGE, bottomLimit - top - SIZE);
  const bottom = Math.min(Math.max(EDGE, pos.bottom), maxBottom);
  el.style.left = pos.side === 'left' ? `${EDGE}px` : 'auto';
  el.style.right = pos.side === 'right' ? `${EDGE}px` : 'auto';
  el.style.top = 'auto';
  el.style.bottom = `${window.innerHeight - bottomLimit + bottom}px`;
  el.dataset.side = pos.side;
}

/**
 * The one visibility rule: a session is active AND a rest is counting down.
 * Called from render() (session start/end, page changes) and on every `rw:rest`
 * transition (rest start, run-out, cancel, skip) — core/rest.js fires that on
 * the transition only, never per tick.
 */
function syncVisibility() {
  if (!el) return;
  const show = Boolean(settings.user_id && state.active_session) && restTimer.end > Date.now();
  if (!show) {
    el.hidden = true;
    el.style.removeProperty('--p');
    hidePill();
    return;
  }
  if (el.hidden) {
    el.hidden = false;
    applyPos(readPos() || defaultPos());
  }
  const pill = el.querySelector('.sc-pill');
  if (!pill.hidden) fillPill();
}

function hidePill() {
  if (!el) return;
  el.querySelector('.sc-pill').hidden = true;
  el.classList.remove('open');
  clearTimeout(pillTimer);
  pillTimer = null;
}

function fillPill() {
  const pill = el.querySelector('.sc-pill');
  pill.innerHTML = '';
  // The clock only exists while resting, so the pill is only ever the rest's.
  if (!state.active_session || !(restTimer.end > Date.now())) return;
  pill.append(
    h('span', { class: 'sc-pill-label' }, t('rest_label')),
    h('button', { type: 'button', class: 'btn tiny', 'data-clock-extend': 'true', onClick: () => { extendRest(30); fillPill(); armPill(); } }, t('clock_add_30')),
    h('button', { type: 'button', class: 'btn tiny ghost', 'data-clock-skip': 'true', onClick: () => { cancelRest(); hidePill(); } }, t('clock_skip_rest')),
  );
}

function armPill() {
  clearTimeout(pillTimer);
  pillTimer = setTimeout(hidePill, PILL_MS);
}

function showPill() {
  fillPill();
  el.querySelector('.sc-pill').hidden = false;
  el.classList.add('open');
  armPill();
}

function wireDrag(disc) {
  let drag = null;
  disc.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    const r = el.getBoundingClientRect();
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, left: r.left, top: r.top, t0: Date.now(), moved: false };
    disc.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  disc.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    hidePill();
    // Free movement while the finger is down; the snap happens on release.
    el.style.left = `${drag.left + dx}px`;
    el.style.right = 'auto';
    el.style.top = `${drag.top + dy}px`;
    el.style.bottom = 'auto';
  });
  const finish = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasTap = !drag.moved && Date.now() - drag.t0 < TAP_MS;
    drag = null;
    el.classList.remove('dragging');
    if (wasTap) {
      if (el.querySelector('.sc-pill').hidden) showPill(); else hidePill();
      return;
    }
    // Snap to the nearer edge, clamp into the band, remember it.
    const r = el.getBoundingClientRect();
    const { bottomLimit } = bounds();
    const side = r.left + r.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    const pos = { side, bottom: Math.round(bottomLimit - r.bottom) };
    applyPos(pos);
    writePos(pos);
  };
  disc.addEventListener('pointerup', finish);
  disc.addEventListener('pointercancel', finish);
  // A click after a drag would otherwise toggle the pill on release.
  disc.addEventListener('click', (e) => e.preventDefault());
}

/** Build the element once, at boot. It is hidden until a rest starts. */
export function mountSessionClock() {
  if (el) return el;
  el = $('#session-clock');
  if (!el) {
    el = h('div', { id: 'session-clock', class: 'session-clock', 'data-rest-surface': 'clock', hidden: true });
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  const disc = h('button', { type: 'button', class: 'sc-disc', 'aria-label': t('clock_aria'), 'data-clock-disc': 'true' });
  // The ring: always the rest countdown — the accent fill drains with --p.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 56 56');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('sc-ring');
  for (const cls of ['sc-track', 'sc-fill']) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '28'); c.setAttribute('cy', '28'); c.setAttribute('r', '26');
    c.classList.add(cls);
    svg.appendChild(c);
  }
  disc.append(svg, h('span', { class: 'rt-time num', 'aria-live': 'off' }, '0:00'));
  el.append(disc, h('div', { class: 'sc-pill', hidden: true }));
  wireDrag(disc);
  // Outside tap collapses the pill; the circle's own taps are handled above.
  document.addEventListener('pointerdown', (e) => { if (!el.hidden && !el.contains(e.target)) hidePill(); }, true);
  document.addEventListener('rw:rest', syncVisibility);
  window.addEventListener('resize', () => { if (!el.hidden) applyPos(readPos() || defaultPos()); });
  return el;
}

/** Called from render(): hidden unless a session is active AND a rest runs. */
export function syncSessionClock() {
  if (!el) mountSessionClock();
  syncVisibility();
}
