import { $, $$, toast } from './core/dom.js';
import { derivedCycle } from './core/engine.js';
import { launchGymApp } from './core/gym.js';
import { applyLang, t, tf } from './core/i18n.js';
import { cancelRest, initNotifications, restTimer, restoreRestTimer } from './core/rest.js';
import { flushSetEdit } from './core/session.js';
import { registerShell } from './core/shell.js';
import {
  checkStorageHeadroom,
  hasMeaningfulLocalData,
  loadLocal,
  markDirty,
  readDirtyMarker,
  readLastRev,
  recordTap,
  saveLocal,
  setSyncDirty,
  settings,
  state,
  syncDirty,
} from './core/store.js';
import {
  flushSync,
  loadWelcomeProfiles,
  pullFromCloud,
  setSyncStatus,
  setWelcomePreselectUser,
  syncFailureReason,
  syncToCloud,
  welcomeProfiles,
} from './core/sync.js';
import { scheduleNativeSummary } from './core/native.js';
import { applyTheme } from './core/theme.js';
import { renderCoach } from './ui/coach.js';
import { renderSessionEnd } from './ui/end.js';
import { renderHistory } from './ui/history.js';
import { renderHome } from './ui/home.js';
import { renderLibrary } from './ui/library.js';
import { renderSettings } from './ui/settings.js';
import { renderWelcome } from './ui/welcome.js';

/* ============================================================
   Raedworkouts — app.js
   Vanilla JS PWA. Pure-frontend logic + self-hosted cloud sync.
   Boot only: the render/route table, init, and the last-resort error handler.
   Everything else lives in core/ (engine) and ui/ (screens).
   ============================================================ */

// core/theme.js owns these; tests/phase3.test.mjs imports them from the entry point.
export { resolveBlockSkinBoundary, resolveSkinSuggestionResponse } from './core/theme.js';

// core/ never imports a screen. It calls these through core/shell.js, and this
// is where the real ones are handed over — at module evaluation, before init().
registerShell({ render, router, renderWelcome, renderCoach, renderSettings });

function render() {
  if (!settings.user_id) {
    document.body.classList.remove('runner-mode');
    renderWelcome();
    return;
  }
  document.body.classList.remove('welcome-mode');
  // Drives the home ordering: while LIFTING the exercise leads and the week
  // strip, tiles and music card drop below it. Warm-up keeps the normal
  // order, because there is no set to log yet.
  document.body.classList.toggle('session-active', Boolean(state.active_session));
  const route = window.location.hash.replace('#', '') || 'home';
  // Phase 6 intentionally returns the workout to the v15 card-in-app
  // treatment. It is a normal page, not the full-viewport Phase 4 takeover.
  document.body.classList.remove('runner-mode');
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + route));
  // The active tab was marked with a CLASS only, so a screen reader had no way
  // to tell which of the five was current — colour was the entire signal.
  $$('.tab').forEach(t => {
    const on = t.dataset.route === route;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  // The retired custom runner used to live here behind `if (false && …)`. It was
  // removed because one of those was named renderV15Workout while NOT being the
  // live v15 card — a name collision that once hid the real session view.
  if (route === 'home') renderHome();
  // preview retired 2026-08-28 — Raed: the plan is already on home, do not list it twice
  if (route === 'coach') renderCoach();
  if (route === 'library') renderLibrary();
  if (route === 'history') renderHistory();
  if (route === 'settings') renderSettings();
  if (route === 'help') router('settings');
  if (route === 'end') renderSessionEnd();
  // The native widget mirrors whatever the screen just drew.
  scheduleNativeSummary();
}
function router(route) {
  window.location.hash = route;
  // A new screen starts at its top, with the tab bar shown — the auto-hide state
  // belongs to the scroll position of the screen he just left.
  window.scrollTo(0, 0);
  $('.tab-bar')?.classList.remove('hidden');
  render();
}

function init() {
  loadLocal();
  applyLang();

  // One capture-phase listener for the whole app rather than a hook on every
  // control: it cannot be forgotten on a new button, and it costs nothing while
  // the setting is off, because recordTap returns on its first line.
  document.addEventListener('click', (event) => recordTap(event.target), true);

  // ?user=abdullah — profile picker preselect only; it only selects a profile.
  const urlUser = new URLSearchParams(window.location.search).get('user');
  if (urlUser && !settings.user_id) setWelcomePreselectUser(urlUser.trim());

  applyTheme();

  // Wire tab bar
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => router(t.dataset.route));
  });
  const gymBtn = $('#gym-launch');
  if (gymBtn) gymBtn.addEventListener('click', launchGymApp);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay' && !e.target.dataset.required)
      $('#modal-overlay').classList.remove('show');
  });
  $('#rest-cancel').addEventListener('click', cancelRest);

  window.addEventListener('hashchange', render);

  if (!window.location.hash) window.location.hash = 'home';
  render();

  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  window.addEventListener('online', () => {
    if (syncDirty) flushSync().catch(() => {});
    if (!welcomeProfiles && !settings.user_id) loadWelcomeProfiles();
  });
  setInterval(() => { if (syncDirty) flushSync().catch(() => {}); }, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSetEdit();
    if (document.hidden && syncDirty) {
      flushSync({ keepalive: true }).then(ok => {
        if (!ok) syncToCloud({ beacon: true, beaconAuth: true }).catch(() => {});
      }).catch(() => {});
    }
  });
  window.addEventListener('pagehide', () => {
    flushSetEdit();
    if (syncDirty) syncToCloud({ beacon: true, beaconAuth: true }).catch(() => {});
  });

  // Show profile screen on first launch (no user_id set yet)
  if (!settings.user_id) {
    renderWelcome();
  } else if (settings.sync_url && settings.sync_key) {
    // If this browser has meaningful local data but no revision marker, push first.
    // Server v2 merges stale/legacy writes into the head and returns the accepted state.
    toast('Syncing…', 1200);
    const shouldPushFirst = readDirtyMarker(settings.user_id) || (hasMeaningfulLocalData() && !readLastRev(settings.user_id));
    const bootSync = shouldPushFirst
      ? (markDirty(), flushSync())
      : pullFromCloud();
    bootSync
      .then(ok => { if (ok) { applyTheme(); render(); } })
      .catch(err => {
        setSyncStatus('err', syncFailureReason(err));
        toast(t('sync_failed_offline'), 3000);
      });
  }

  // Register service worker (offline) + auto-apply updates.
  // No more "force refresh" — a new deploy installs in the background and the
  // app reloads itself to show it (deferred if you're mid-set, so nothing is yanked).
  if ('serviceWorker' in navigator) {
    let _reloading = false;
    const hadController = !!navigator.serviceWorker.controller;
    const applyUpdateWhenSafe = () => {
      if (_reloading) return;
      const doReload = () => { _reloading = true; window.location.reload(); };
      // "Wait until he switches away" used to mean "reload the instant he
      // pockets the phone" — which is the same instant the rest timer starts
      // running.
      const resting = Boolean(restTimer.interval) || restTimer.end > Date.now();
      if (state.active_session && (resting || !document.hidden)) {
        if (!document.hidden) toast(t('update_ready'), 3000);
        const onHide = () => {
          const stillResting = Boolean(restTimer.interval) || restTimer.end > Date.now();
          if (document.hidden && !stillResting) {
            document.removeEventListener('visibilitychange', onHide);
            doReload();
          }
        };
        document.addEventListener('visibilitychange', onHide);
      } else {
        doReload();
      }
    };
    // Fires when a freshly-installed SW takes control (genuine update only).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) applyUpdateWhenSafe();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      // A blocked or refused registration resolves with nothing to update.
      if (!reg) return;
      reg.update().catch(() => {});
      // Re-check for updates when the app regains focus, and hourly.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch((err) => {
      // Swallowing this meant that when the worker failed to install — one shell
      // URL 404 on a partial deploy is enough — the app silently lost offline
      // support AND the rest alarm, with nothing anywhere to say so.
      console.error('[raedworkouts] service worker registration failed', err);
    });
  }

  // A completed mesocycle is the natural moment to look up from the week.
  announceCycleIfNew();

  // A rest that was running when the app was last closed, reloaded, or evicted.
  restoreRestTimer();

  // Early warning only. Never prunes.
  checkStorageHeadroom();

  // Auto-hide bottom nav on scroll-down, show on scroll-up
  initAutoHideNav();

  // Dialog semantics, focus trap, focus return and Escape for every sheet.
  initModalA11y();

  // Optional: ask for notification permission on first interaction (deferred)
  initNotifications();
}

// Fires once per mesocycle, at boot, and never twice for the same one.
function announceCycleIfNew() {
  if (!settings.user_id || !state.history?.length) return;
  const cycle = derivedCycle();
  if (cycle <= (state.cycle_announced || 1)) return;
  state.cycle_announced = cycle;
  saveLocal();
  // Every second cycle lands near the six-month mark.
  const dueForReview = (cycle - 1) % 2 === 0;
  setTimeout(() => toast(
    dueForReview ? tf('cycle_review_due', { n: cycle }) : tf('cycle_begins', { n: cycle }),
    dueForReview ? 12000 : 7000,
  ), 1200);
}

// ---- Modal keyboard + screen-reader behaviour ----------------
// This watches the class every call site already toggles, rather than editing a
// dozen of them: role, aria-modal, focus trap, focus return and Escape.
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
function initModalA11y() {
  const overlay = $('#modal-overlay');
  const modal = $('#modal');
  if (!overlay || !modal) return;
  let lastFocused = null;

  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('tabindex', '-1');

  const focusables = () => [...modal.querySelectorAll(FOCUSABLE)]
    .filter((el) => !el.disabled && el.getBoundingClientRect().width > 0);

  const close = () => overlay.classList.remove('show');

  const onOpen = () => {
    lastFocused = document.activeElement;
    // The heading names the sheet; without it a screen reader announces only
    // "dialog".
    const heading = modal.querySelector('h3');
    if (heading) modal.setAttribute('aria-label', heading.textContent.trim());
    else modal.removeAttribute('aria-label');
    const first = focusables()[0];
    (first || modal).focus({ preventScroll: true });
  };

  const onClose = () => {
    // Back where he was, not to the top of the page.
    if (lastFocused && document.contains(lastFocused)) {
      try { lastFocused.focus({ preventScroll: true }); } catch (_) { /* gone */ }
    }
    lastFocused = null;
  };

  new MutationObserver(() => {
    if (overlay.classList.contains('show')) onOpen();
    else onClose();
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('show')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Trap: Tab must cycle inside the sheet, not step onto the page behind it.
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

// ---- Auto-hide bottom nav on scroll --------------------------
function initAutoHideNav() {
  const nav = $('.tab-bar');
  if (!nav) return;
  let lastY = window.scrollY;
  let ticking = false;
  let pinned = false;  // pinned = forced visible (e.g. at very top)
  const threshold = 8;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const dy = y - lastY;
      // near top → always show
      if (y < 120) {
        nav.classList.remove('hidden');
        pinned = true;
      } else if (Math.abs(dy) > threshold) {
        if (dy > 0) {
          // scrolling down → hide
          nav.classList.add('hidden');
        } else {
          // scrolling up → show
          nav.classList.remove('hidden');
        }
        pinned = false;
      }
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
}

// ---- Last resort ---------------------------------------------------------
// There was no window.onerror and no unhandledrejection handler in this file
// at all.
let _lastErrorToastAt = 0;
function reportFatal(source, err) {
  try {
    console.error('[raedworkouts]', source, err);
    const now = Date.now();
    // One message, not a cascade: a broken render can throw on every frame.
    if (now - _lastErrorToastAt > 20000) {
      _lastErrorToastAt = now;
      toast(t('app_error'), 6000);
    }
    if (state?.active_session && settings?.user_id) {
      setSyncDirty(true);
      flushSync().catch(() => {});
    }
  } catch (_) { /* the handler itself must never throw */ }
}
window.addEventListener('error', (e) => reportFatal('uncaught error', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportFatal('unhandled rejection', e.reason));

window.addEventListener('DOMContentLoaded', init);

