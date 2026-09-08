/* The bridge to the native shell («Raedworkouts Go» on iOS). A no-op in a browser.
 * The shell listens on webkit.messageHandlers.native for:
 *   activity { … }                 → the session-long Live Activity (Island + Lock Screen)
 *   summary  { … }                 → the Home-Screen widget
 *   open_gym { scheme, fallback }  → UIApplication.open, no page navigation
 * Nothing here reads a secret or reaches the network. */

import { currentTrainingWeek, getNextPlannedSession, getStreak, getTodayPlannedSession } from '../core/engine.js';
import { fmtKgTotal, t, tf, todayISO } from '../core/i18n.js';
import { focusExerciseIdx } from '../core/session.js';
import { settings, state } from '../core/store.js';
import { getAllExercises } from '../core/videos.js';
import { isCountableWorkingSet, isRunnerExerciseResolved, isRunnerSetResolved } from '../domain/runner-session.js';

const handler = () => (typeof window !== 'undefined' ? window.webkit?.messageHandlers?.native : null);
export const nativeAvailable = () => Boolean(handler());

export function postNative(type, payload = {}) {
  const port = handler();
  if (!port) return false;
  try { port.postMessage({ type, ...payload }); return true; } catch (_) { return false; }
}

// ---- The Live Activity ------------------------------------------------------
// It is the SESSION now, not the rest: it exists from the moment he starts until
// the moment he finishes, and the rest countdown is one state inside it.
//
// The rest deadline is held HERE rather than read from core/rest.js, because
// rest.js already imports this module — importing it back would be a cycle, and
// a cycle in the boot chain is a blank screen. `nativeRestStart`/`nativeRestStop`
// are the only writers.
let restEndMs = 0;
let restStartMs = 0;

const SKIN_NAMES = ['hadid', 'waraq', 'rukham'];
const activeSkinName = () => (SKIN_NAMES.includes(settings.skin) ? settings.skin : 'hadid');

const iso = (ms) => (ms > 0 ? new Date(ms).toISOString() : null);

// «المجموعة 2 من 3» — «2/3» is not a sentence, and Raed read it as nothing at
// all. A ramp row says «تدرّج 1 من 2» instead, because those are not working
// sets and numbering them together would double-count the exercise.
function setLabelFor(entry) {
  const sets = entry?.sets || [];
  if (!sets.length) return '';
  const ramps = sets.filter((set) => set.is_warmup);
  const working = sets.filter((set) => !set.is_warmup);
  const next = sets.find((set) => !isRunnerSetResolved(set));
  if (next && next.is_warmup && ramps.length) {
    return tf('activity_ramp_of', { n: ramps.indexOf(next) + 1, total: ramps.length });
  }
  if (!working.length) return '';
  // The same count the rest-only label used, said in words rather than as a
  // fraction: completed working sets, plus the one he is on.
  const done = working.filter((set) => set.completed).length;
  return tf('activity_set_of', { n: Math.min(done + 1, working.length), total: working.length });
}

// The movement he is on and how far through the session he is. Read from the
// live session rather than passed in, so the callers keep their signatures.
function sessionContext() {
  const active = state.active_session;
  if (!active) return null;
  const entries = Object.entries(active.exercises || {});
  const total = entries.length;
  const done = entries.filter(([, entry]) => isRunnerExerciseResolved(entry)).length;
  // The rest-only activity could take `?? 0` because a rest only ever starts
  // from an exercise the session view is already showing. This one is posted on
  // every render — Home included, before that view has ever drawn — and index 0
  // is by then usually a FINISHED exercise. Fall back to the first unresolved
  // one, which is the movement he is actually on.
  const pending = entries.findIndex(([, entry]) => !isRunnerExerciseResolved(entry));
  const cursor = focusExerciseIdx ?? (pending >= 0 ? pending : total - 1);
  const idx = Math.min(Math.max(cursor, 0), Math.max(total - 1, 0));
  const [id, entry] = entries[idx] || [];
  const ex = entry ? getAllExercises().find((item) => item.id === (entry.swapped_to || id)) : null;
  return {
    session: t(String(active.session_name || '').split(' — ')[0]),
    started_at: active.started_at || null,
    exercise: ex?.name || '',
    set_label: setLabelFor(entry),
    exercise_label: total ? tf('activity_exercise_of', { n: Math.min(done + 1, total), total }) : '',
    done,
    total,
  };
}

// One message carries the WHOLE state, so a dropped message repairs itself on
// the next render instead of leaving the Island lying.
export function nativeActivity() {
  const ctx = sessionContext();
  const base = {
    active: Boolean(ctx),
    started_at: null,
    session: '',
    exercise: '',
    set_label: '',
    exercise_label: '',
    // Arabic is never formatted in Swift; even the one-word prefix comes from here.
    since_label: t('activity_since'),
    rest_ends_at: null,
    rest_started_at: null,
    done: 0,
    total: 0,
    skin: activeSkinName(),
  };
  if (!ctx) return base;
  return {
    ...base,
    ...ctx,
    rest_ends_at: iso(restEndMs),
    rest_started_at: restEndMs > 0 ? iso(restStartMs || Date.now()) : null,
  };
}

export function postNativeActivity() {
  if (!nativeAvailable()) return;
  try { postNative('activity', nativeActivity()); } catch (_) { /* the next render repairs it */ }
}

// Signature unchanged so core/rest.js keeps its call sites. `reason` is no
// longer part of the message: one message type carries the whole state, and
// «why the rest stopped» is not something the Island renders differently.
export function nativeRestStart(endMs, totalMs) {
  const end = Number(endMs) || 0;
  const total = Number(totalMs) || 0;
  restEndMs = end;
  restStartMs = end > 0 ? (total > 0 ? end - total : Date.now()) : 0;
  postNativeActivity();
}
export function nativeRestStop(_reason = 'rest_end') {
  restEndMs = 0;
  restStartMs = 0;
  postNativeActivity();
}

// ---- The Home-Screen widget -------------------------------------------------
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

// One debounce for both native surfaces. The name is the one app.js already
// calls on every render; the activity rides the same tick because it is the
// same question — «what does the screen say right now».
let summaryTimer = null;
export function scheduleNativeSummary() {
  if (!nativeAvailable()) return;
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    try { postNative('summary', nativeSummary()); } catch (_) { /* the widget keeps its last summary */ }
    postNativeActivity();
  }, 400);
}
