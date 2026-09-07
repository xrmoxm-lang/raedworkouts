/* Rest countdown and its notification. The deadline is persisted, so a reload
 * resumes the same rest instead of losing it. */

import { $, icon, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { nsKey, safeGetItem, safeRemoveItem, safeSetItem, settings, state } from '../core/store.js';

// ---- Rest timer --------------------------------------------
export const restTimer = { interval: null, end: 0 };
// The deadline is persisted, not just held in `restTimer`.
//
// The auto-update path reloads the page the moment the app is hidden while a
// session is open — which is precisely the moment he pockets the phone to rest.
// The countdown lived only in this module-level object, so the reload killed the
// interval, hid the timer, and the alarm that was supposed to end his rest never
// fired. He looks two minutes later at a phone showing nothing. Same for an iOS
// tab eviction, which is routine with the screen off.
//
// Storing the deadline means any reload resumes the same countdown, and one that
// expired while the page was gone fires immediately on return instead of
// vanishing.
export function persistRestDeadline(endMs) {
  if (!settings.user_id) return;
  if (endMs) safeSetItem(nsKey(settings.user_id, 'restend'), String(endMs));
  else safeRemoveItem(nsKey(settings.user_id, 'restend'));
}
export function startRest(seconds) {
  if (restTimer.interval) clearInterval(restTimer.interval);
  restTimer.end = Date.now() + seconds * 1000;
  persistRestDeadline(restTimer.end);
  // Ask for notification permission once, on first rest start
  if (settings.notifications) requestNotifPermissionIfNeeded();
  runRestCountdown();
}
export function runRestCountdown() {
  const el = $('#rest-timer');
  if (!el) return;
  el.style.display = 'flex';
  const tick = () => {
    const rem = Math.max(0, Math.round((restTimer.end - Date.now()) / 1000));
    $('#rest-timer-text').textContent = `${Math.floor(rem/60)}:${String(rem%60).padStart(2,'0')}`;
    if (rem === 0) {
      clearInterval(restTimer.interval);
      restTimer.interval = null;
      restTimer.end = 0;
      persistRestDeadline(null);
      el.style.display = 'none';
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
  persistRestDeadline(null);
  const el = $('#rest-timer');
  if (el) el.style.display = 'none';
}

// ---- Renderers ---------------------------------------------

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
export async function fireRestEndNotification() {
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
    // `serviceWorker.ready` is specified NEVER to reject: it waits forever until
    // some registration has an active worker. If register() failed, or install
    // threw because one shell URL 404'd on a partial deploy, this await simply
    // never returned — so the `new Notification` fallback, which exists for
    // exactly that failure, was unreachable in exactly that failure. The alarm
    // went silent with nothing logged. Race it against a short timeout.
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
