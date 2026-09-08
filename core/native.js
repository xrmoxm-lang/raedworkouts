/* The bridge to the native shell («Raedworkouts Go» on iOS). A no-op in a browser.
 * The shell listens on webkit.messageHandlers.native for:
 *   rest_start { end_ms, total_ms, session, exercise, set_label }  → Live Activity
 *   rest_cancel / rest_end                                          → ends it
 *   summary { … }                                                   → the Home-Screen widget
 * Nothing here reads a secret or reaches the network. */

import { currentTrainingWeek, getNextPlannedSession, getStreak, getTodayPlannedSession } from '../core/engine.js';
import { fmtKgTotal, t, todayISO } from '../core/i18n.js';
import { focusExerciseIdx } from '../core/session.js';
import { state } from '../core/store.js';
import { getAllExercises } from '../core/videos.js';
import { isCountableWorkingSet } from '../domain/runner-session.js';

const handler = () => (typeof window !== 'undefined' ? window.webkit?.messageHandlers?.native : null);
export const nativeAvailable = () => Boolean(handler());

export function postNative(type, payload = {}) {
  const port = handler();
  if (!port) return false;
  try { port.postMessage({ type, ...payload }); return true; } catch (_) { return false; }
}

// The exercise he is resting from, and the set that comes next — read from the
// live session rather than passed in, so startRest() keeps its one argument.
function restContext() {
  const active = state.active_session;
  if (!active) return { session: '', exercise: '', set_label: '' };
  const entries = Object.entries(active.exercises || {});
  const idx = Math.min(Math.max(focusExerciseIdx ?? 0, 0), Math.max(entries.length - 1, 0));
  const [id, entry] = entries[idx] || [];
  const ex = entry ? getAllExercises().find((item) => item.id === (entry.swapped_to || id)) : null;
  const working = (entry?.sets || []).filter((set) => !set.is_warmup);
  const done = working.filter((set) => set.completed).length;
  const setLabel = working.length ? `${Math.min(done + 1, working.length)}/${working.length}` : '';
  return { session: t(String(active.session_name || '').split(' — ')[0]), exercise: ex?.name || '', set_label: setLabel };
}

export function nativeRestStart(endMs, totalMs) {
  if (!nativeAvailable()) return;
  postNative('rest_start', { end_ms: endMs, total_ms: totalMs, ...restContext() });
}
export function nativeRestStop(reason = 'rest_end') {
  if (!nativeAvailable()) return;
  postNative(reason === 'cancel' ? 'rest_cancel' : 'rest_end');
}

// What the widget shows. Computed from the same engine the Home screen uses.
export function nativeSummary() {
  const planned = getTodayPlannedSession();
  const next = getNextPlannedSession();
  const week = currentTrainingWeek();
  const trainedToday = (state.history || []).some((entry) => String(entry?.date || '').slice(0, 10) === todayISO());
  const restDay = week.remaining === 0 && !trainedToday;
  const shown = planned || next?.session || null;
  const last = [...(state.history || [])].reverse()[0] || null;
  const lastSets = last ? Object.values(last.exercises || {}).reduce((n, ex) => n + (ex.sets || []).filter(isCountableWorkingSet).length, 0) : 0;
  const lastKg = last ? Object.values(last.exercises || {}).reduce((n, ex) => n + (ex.sets || []).filter(isCountableWorkingSet)
    .reduce((s, set) => s + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0), 0) : 0;
  const active = state.active_session;
  return {
    updated_at: new Date().toISOString(),
    today: { name: shown ? t(String(shown.name || '').split(' — ')[0]) : '', kind: restDay ? 'rest' : 'gym' },
    week: { done: week.done, target: week.target },
    streak: getStreak(),
    last: last ? { date: String(last.date || '').slice(0, 10), name: t(String(last.session_name || '').split(' — ')[0]), sets: lastSets, kg: fmtKgTotal(lastKg) } : null,
    active: active ? { name: t(String(active.session_name || '').split(' — ')[0]), started_at: active.started_at } : null,
  };
}

let summaryTimer = null;
export function scheduleNativeSummary() {
  if (!nativeAvailable()) return;
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    try { postNative('summary', nativeSummary()); } catch (_) { /* the widget keeps its last summary */ }
  }, 400);
}
