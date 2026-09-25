/* Rest countdown and its notification. The deadline is persisted, so a reload
 * resumes the same rest instead of losing it. */

import { toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { nativeRestStart, nativeRestStop } from '../core/native.js';
import { nsKey, safeGetItem, safeRemoveItem, safeSetItem, settings, state } from '../core/store.js';

// ---- Rest timer --------------------------------------------
export const restTimer = { interval: null, end: 0, total: 0 };
// The deadline is persisted, not just held in `restTimer`.
function persistRestDeadline(endMs) {
  if (!settings.user_id) return;
  if (endMs) safeSetItem(nsKey(settings.user_id, 'restend'), String(endMs));
  else safeRemoveItem(nsKey(settings.user_id, 'restend'));
}
export function startRest(seconds) {
  if (restTimer.interval) clearInterval(restTimer.interval);
  restTimer.end = Date.now() + seconds * 1000;
  restTimer.total = seconds * 1000;
  persistRestDeadline(restTimer.end);
  // Ask for notification permission once, on first rest start
  if (settings.notifications) requestNotifPermissionIfNeeded();
  nativeRestStart(restTimer.end, restTimer.total);
  runRestCountdown();
}
// m:ss, the one numeric format that reads identically in Arabic and English.
export function restClockText(remMs = Math.max(0, restTimer.end - Date.now())) {
  const rem = Math.round(remMs / 1000);
  return `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
}
// One countdown, two possible surfaces. `[data-rest-surface]` marks anything
// that shows it — the fixed dock in index.html and the in-flow row the runner
// draws — and both are painted from `restTimer` on the same tick, so the dock
// and the row can never disagree about the time left.
function paintRestSurfaces() {
  const remMs = Math.max(0, restTimer.end - Date.now());
  const text = restClockText(remMs);
  const total = restTimer.total || 1;
  document.querySelectorAll('[data-rest-surface]').forEach((surface) => {
    const time = surface.querySelector('.rt-time');
    if (time) time.textContent = text;
    // The surface itself carries --p: the clock's ring drains from it, and a
    // legacy `.rt-bar` inside a surface would still read it by inheritance.
    surface.style.setProperty('--p', String(Math.min(1, remMs / total)));
  });
}
/**
 * There is one timer and, since round 6, one surface: the floating session
 * clock (`ui/clock.js`, `#session-clock[data-rest-surface]`). Round 5's
 * in-flow row and fixed dock are gone with the layout problem they traded
 * between — a fixed bar is always on top of something, a 56px circle he parks
 * himself is not (ROUND6-FABLE-BRIEF §C). This keeps `body.resting`, which the
 * native bridge and the tests read, and tells the clock about each transition
 * through a DOM event, because core/ never imports ui/.
 */
let wasResting = false;
export function syncRestSurfaces() {
  const resting = restTimer.end > Date.now();
  document.body.classList.toggle('resting', resting);
  if (resting !== wasResting) {
    wasResting = resting;
    // Only on the transition INTO rest — never on every 200ms tick, which
    // would fight him the moment he scrolled up to read the card.
    if (resting) revealRunnerNav();
    document.dispatchEvent(new CustomEvent('rw:rest', { detail: { resting } }));
  }
}
/**
 * Bring `.runner-nav` clear of the tab bar when a rest begins.
 *
 * Measured on his 390×844 (round 5, and again in round 6 with no row at all):
 * at the instant the last working set is ticked he is at scrollY 0 and both
 * nav buttons sit at 743–787 — under the tab bar, whose top is 776 — so
 * `elementFromPoint` at their centres returned BUTTON.tab and «أنهِ الجلسة»
 * changed tabs. Bottom padding cannot fix this: it only guarantees the nav
 * clears the bar at the BOTTOM of the document, and he is not there. So the
 * app does the scrolling, once, on the transition into rest, and only while
 * the nav is actually covered — the contract `revealEffortStrip()`
 * (ui/exercise-card.js) has had since v15.
 */
function revealRunnerNav() {
  requestAnimationFrame(() => {
    const nav = document.querySelector('#page-home.active .runner-nav');
    if (!nav) return;
    const tab = document.querySelector('.tab-bar');
    // A hidden tab bar is not an occluder; the viewport floor is then the floor.
    const floor = tab && !tab.classList.contains('hidden')
      ? tab.getBoundingClientRect().top
      : window.innerHeight;
    const over = nav.getBoundingClientRect().bottom - floor;
    // 8px so the button is not flush against the bar it just escaped.
    if (over > 0) window.scrollBy({ top: over + 8, behavior: 'auto' });
  });
}
/** «+30 ث» from the clock's pill: the deadline moves, the native Island follows. */
export function extendRest(seconds) {
  if (!(restTimer.end > Date.now())) return;
  restTimer.end += seconds * 1000;
  restTimer.total += seconds * 1000;
  persistRestDeadline(restTimer.end);
  nativeRestStart(restTimer.end, restTimer.total);
  paintRestSurfaces();
}
function runRestCountdown() {
  // A resumed rest has no recorded total; the bar then drains from wherever it is.
  if (!restTimer.total || restTimer.total < restTimer.end - Date.now()) restTimer.total = Math.max(1, restTimer.end - Date.now());
  const tick = () => {
    const remMs = Math.max(0, restTimer.end - Date.now());
    const rem = Math.round(remMs / 1000);
    paintRestSurfaces();
    syncRestSurfaces();
    if (rem === 0) {
      clearInterval(restTimer.interval);
      restTimer.interval = null;
      restTimer.end = 0;
      restTimer.total = 0;
      persistRestDeadline(null);
      syncRestSurfaces();
      nativeRestStop('end');
      if (settings.vibrate && navigator.vibrate) navigator.vibrate([200,100,200]);
      toast(t('rest_done'));
      fireRestEndNotification();
    }
  };
  tick();
  restTimer.interval = setInterval(tick, 200);
}
// Called once at boot. A deadline still in the future resumes; one that passed
// while the app was gone fires the alarm now rather than losing it.
export function restoreRestTimer() {
  if (!settings.user_id) return;
  const raw = safeGetItem(nsKey(settings.user_id, 'restend'));
  const end = Number(raw);
  if (!raw || !Number.isFinite(end) || end <= 0) return;
  if (!state.active_session) { persistRestDeadline(null); return; }
  restTimer.end = end;
  if (end - Date.now() > 500) {
    // A relaunch mid-rest re-creates the Live Activity for what is left.
    nativeRestStart(end, Math.max(1, end - Date.now()));
    runRestCountdown();
    return;
  }
  // It ran out while we were away. Say so once; do not start a dead countdown.
  persistRestDeadline(null);
  restTimer.end = 0;
  toast(t('rest_done'));
}
export function cancelRest() {
  if (restTimer.interval) clearInterval(restTimer.interval);
  restTimer.interval = null;
  restTimer.end = 0;
  restTimer.total = 0;
  persistRestDeadline(null);
  // Cancel from either surface cancels both: there is only one timer.
  syncRestSurfaces();
  nativeRestStop('cancel');
}


// ---- Notifications API ---------------------------------------
export function initNotifications() {
  if (!('Notification' in window) || !settings.notifications) return;
  // Don't ask immediately — wait for first set-completion to prompt context.
  // Permission is requested in startRest() if not yet granted.
}
export function requestNotifPermissionIfNeeded() {
  if (!('Notification' in window)) return Promise.resolve('denied');
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission();
}
async function fireRestEndNotification() {
  if (!settings.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body: t('rest_done_body'),
    icon: './img/body_chest.png',
    badge: './img/body_chest.png',
    tag: 'raedworkouts-rest',
    renotify: true,
    silent: false,
    vibrate: [200, 80, 200],
  };
  const title = t('rest_done');
  try {
    // `serviceWorker.ready` is specified NEVER to reject: it waits forever
    // until some registration has an active worker.
    const reg = await Promise.race([
      navigator.serviceWorker?.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (reg && reg.showNotification) {
      reg.showNotification(title, opts);
    } else {
      new Notification(title, opts);
    }
  } catch (e) {
    console.error('[raedworkouts] rest notification failed', e);
  }
}
