/* The live workout: start, edit, skip, swap, finish. Owns focusExerciseIdx. */

import { confirmAction, toast } from '../core/dom.js';
import {
  derivedBlock,
  exercisePrefs,
  equipmentStepKg,
  rampLoadsFor,
  reEntryPlan,
  scopedReplacementFor,
  suggestNextWeight,
  workingRepTarget,
} from '../core/engine.js';
import { editableWeightValue, hasWorkingWeight, t, tf, todayISO } from '../core/i18n.js';
import { postNativeActivity } from '../core/native.js';
import { cancelRest } from '../core/rest.js';
import { render, router } from '../core/shell.js';
import { checkStorageHeadroom, saveLocal, settings, state } from '../core/store.js';
import { resolveBlockSkinBoundary, showSkinSuggestion } from '../core/theme.js';
import { getAllExercises } from '../core/videos.js';
import {
  applyWorkingSetAttempt,
  isCountableWorkingSet,
  isRunnerExerciseResolved,
  isRunnerSetResolved,
  skipRunnerExercise as skipRunnerExerciseState,
} from '../domain/runner-session.js';

// v15's focus-mode cursor: which exercise the session view is showing.
// Its declaration was lost in the phase-6 rewrite while eight references to it
// survived, so the session view threw ReferenceError on render.
export let focusExerciseIdx = null;
export function setFocusExerciseIdx(value) { focusExerciseIdx = value; }
// Holds the session just finished so the undo toast can put it back.
let lastFinishedSession = null;
// Lets Raed go back into the cards after the done panel appears, without
// undoing the completion. Reset whenever a session starts, so a new workout
// never opens straight into the review state.
export let sessionDoneDismissed = false;

export function setSessionDoneDismissed(value) { sessionDoneDismissed = value; }
function warmupTypeForSession(session) {
  // D12 is data-led: both Upper sessions use the merged push+pull warm-up;
  // both Lower sessions use the leg warm-up. The explicit fallback keeps an
  // already-started archival session usable without inventing leg drills.
  if (session?.warmup_type === 'lower' || ['lower_a', 'lower_b'].includes(session?.id)) return 'lower';
  return 'upper';
}
function createSessionWarmup(session) {
  const type = warmupTypeForSession(session);
  const source = RW.SESSION_WARMUPS?.[type] || { cap_minutes: 15, treadmill_minutes: [5, 7, 10], drills: [] };
  // A hard source-level guard: the merged Upper warm-up can never contain leg drills.
  const drills = (source.drills || []).filter((drill) => type !== 'upper' || !/leg/i.test(drill.id));
  return {
    type,
    cap_minutes: source.cap_minutes || 15,
    treadmill_minutes: null,
    treadmill_done: false,
    drills: drills.map((drill) => ({ ...drill, completed: false })),
    started_at: new Date().toISOString(),
    completed_at: null,
  };
}
export function generalWarmupComplete(warmup) {
  return Boolean(warmup?.treadmill_done) && (warmup.drills || []).every((drill) => drill.completed);
}
// ---- Active session lifecycle ------------------------------
function startSession(session) {
  // confirmAction(), not confirm(): a standalone PWA shell can suppress the
  // native dialog, in which case the tap did nothing at all. Async, so the
  // caller re-enters once he has answered.
  if (state.active_session) {
    confirmAction({
      title: t('discard_session'),
      body: t('start_over_active_body'),
      confirmLabel: t('discard_session_confirm'),
    }).then((yes) => {
      if (!yes) return;
      cancelRest();
      noteActiveCleared(state.active_session);
      state.active_session = null;
      startSession(session);
    });
    return;
  }
  const exercises = {};
  // His own order for this session, if he has set one.
  const savedOrder = (state.exercise_order || {})[session.id];
  const orderedRows = Array.isArray(savedOrder) && savedOrder.length
    ? [...session.exercises].sort((a, b) => {
        const ia = savedOrder.indexOf(a.exercise_id);
        const ib = savedOrder.indexOf(b.exercise_id);
        return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
      })
    : session.exercises;
  orderedRows.forEach(rawPlan => {
    const replacementId = scopedReplacementFor(session, rawPlan.exercise_id);
    const swapped = replacementId === rawPlan.exercise_id ? rawPlan : { ...rawPlan, exercise_id: replacementId };
    // D19's re-entry ramp, applied before anything reads sets or effort.
    const plan = reEntryPlan(swapped, getAllExercises().find((e) => e.id === replacementId));
    const effectivePlan = plan;
    const sug = suggestNextWeight(replacementId, effectivePlan);
    const suggestedWorkingWeight = editableWeightValue(sug.weight);
    const sets = [];
    // Warmup sets (not counted) — auto-prefill if `is_first_of_muscle` §8.4
    // gives every row an explicit `ramp_sets` count: 2 on the openers, 1 on
    // most, 0 on a few.
    const rampSets = Number.isFinite(plan.ramp_sets)
      ? plan.ramp_sets
      : (plan.warmup ? (/^2\s+sets/i.test(plan.warmup) ? 2 : 1) : 0);
    if (rampSets > 0) {
      // Sourced ramp: 50% then 70% of the working load (ML L11160/L11162). A
      // single ramp set uses the 50% entry, not the 70% one — the point is to
      // groove the movement, not to pre-fatigue it.
      const canSuggest = hasWorkingWeight(sug.weight);
      // The COUNT is passed in, so a one-ramp exercise gets its own 60% load
      // rather than the first half of a two-set pair.
      const ramps = canSuggest
        // The learned equipment step, so a 5 kg machine ramps in 5 kg pins rather than 2.5.
        ? rampLoadsFor(sug.weight, rampSets, equipmentStepKg(replacementId))
        : (rampSets >= 2 ? [{ weight: '', reps: 10 }, { weight: '', reps: 6 }] : [{ weight: '', reps: 8 }]);
      ramps.forEach((warm) =>
        sets.push({ is_warmup: true, weight: warm.weight, reps: warm.reps, effort: null, completed: false })
      );
    }
    for (let i = 0; i < plan.sets; i++) {
      // A suggestion is a placeholder, never an already-entered prescription.
      // In particular, a new catalogue movement has no made-up 0 kg default.
      sets.push({ is_warmup: false, weight: suggestedWorkingWeight, reps: workingRepTarget(effectivePlan), effort: null, completed: false });
    }
    // Keyed by the ORIGINAL programme id, with swapped_to naming the
    // replacement — the history lookups depend on that shape.
    const machineOnly = Boolean(exercisePrefs(replacementId).machine_weight);
    if (machineOnly) for (const set of sets) if (!set.is_warmup) set.weight = 0;
    exercises[rawPlan.exercise_id] = {
      planned: effectivePlan,
      sets,
      machine_weight: machineOnly,
      swapped_to: replacementId === rawPlan.exercise_id ? null : replacementId,
    };
  });
  sessionDoneDismissed = false;
  state.active_session = {
    uid: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : ('sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))),
    date: todayISO(),
    session_id: session.id,
    session_name: session.name,
    started_at: new Date().toISOString(),
    phase: 'warmup',
    warmup: createSessionWarmup(session),
    exercises,
  };
  // The restored v15 view is cursor-based: every new session starts at its
  // first unresolved exercise, never at the prior session's last card.
  focusExerciseIdx = null;
  // A block transition may offer a configured skin, but cannot apply one.
  const prevBlock = state._last_toasted_block;
  // `state.current_block` is written NOWHERE, so curBlock was permanently 1 and
  // every block announcement was unreachable. The programme's real position
  // comes from derivedBlock().
  const curBlock = derivedBlock();
  const isBlockTransition = prevBlock != null && prevBlock !== curBlock;
  const skinBoundary = resolveBlockSkinBoundary({
    previousBlock: prevBlock,
    currentBlock: curBlock,
    settings,
  });
  const skinSuggestion = skinBoundary.suggestion;
  state._last_toasted_block = curBlock;
  saveLocal();
  // The Live Activity is the session, so it starts when the session does —
  // immediately, not on the render debounce four hundred milliseconds later.
  postNativeActivity();
  router('home');   // v15's session view lives on home
  if (skinSuggestion) showSkinSuggestion(skinSuggestion);
  else {
    toast('Session started — let\'s go.');
    if (isBlockTransition) {
      // Reaching a new block is a milestone, and it was announced in English on
      // an Arabic-only screen. A template literal is joined before it reaches
      // toast(), so it could never match a locale entry however it was worded.
      const blockKeys = {
        1: 'block_name_foundation', 2: 'block_name_strength',
        3: 'block_name_peak', 4: 'block_name_deload',
      };
      const blockName = t(blockKeys[curBlock] || 'block_name_new');
      // The deload week has to explain itself: it is the one block that asks for
      // LESS, and a lifter who is not told why reads that as the app breaking.
      const message = curBlock === 4
        ? t('deload_week_begins')
        : tf('block_begins', { block: curBlock, name: blockName });
      setTimeout(() => toast(message, curBlock === 4 ? 9000 : 4000), 800);
    }
  }
}

// Re-open a finished session. Raed pressed "finish" by accident and had no way
// back: "ضغطت انتهى وخلاص ويعتبرني انتهيت من التمرين". A workout that took an
// hour must not be one mis-tap from unreachable.
export function reopenSession(sess) {
  const position = state.history.indexOf(sess);
  if (position < 0) return false;
  if (state.active_session) return false;
  const restored = JSON.parse(JSON.stringify(sess));
  delete restored.ended_at;
  delete restored.stats;
  delete restored.prs;
  state.history.splice(position, 1);
  state.active_session = restored;
  focusExerciseIdx = 0;
  sessionDoneDismissed = false;
  saveLocal();
  return true;
}

// Set only while re-entering endSession() from its own confirmation, so the
// guard below asks once instead of looping on itself.
let endSessionConfirmed = false;
// Deletes the whole session. It used to be inline in two places, labelled
// «تجاهل التمرين» — "skip the exercise" — behind a native confirm() whose
// body was that same misleading label, with no undo afterwards.
function noteActiveCleared(session) {
  if (!session) return;
  const key = `${session.started_at || session.date || ''}|${session.session_id || ''}`;
  state.active_cleared = { key, at: new Date().toISOString() };
}

export function discardSession() {
  if (!state.active_session) return;
  confirmAction({
    title: t('discard_session'),
    body: t('discard_session_body'),
    confirmLabel: t('discard_session_confirm'),
    danger: true,
  }).then((yes) => {
    if (!yes) return;
    // Discarding is the more dangerous of the two and had no undo. The session is
    // kept in memory and put back exactly as it was, the way reopenSession
    // restores a finished one.
    cancelRest();
    const discarded = state.active_session;
    noteActiveCleared(discarded);
    state.active_session = null;
    state.forced_next_session = null;
    focusExerciseIdx = null;
    saveLocal();
    postNativeActivity();
    render();
    toast(t('session_discarded'), 9000, t('undo'), () => {
      if (state.active_session) { toast(t('undo_unavailable')); return; }
      state.active_session = discarded;
      saveLocal();
      postNativeActivity();
      render();
      toast(t('session_restored'));
    });
  });
}

export function endSession() {
  if (!state.active_session) return;
  const a = state.active_session;
  // Compute completed flag
  const entries = Object.values(a.exercises);
  const anyResolved = entries.some(isRunnerExerciseResolved);
  const unresolved = entries.filter((item) => !isRunnerExerciseResolved(item)).length;
  if (!anyResolved) {
    // Same reasoning as the delete guard: never leave a discard to a dialog the
    // shell can suppress. Async, so endSession returns and the caller re-enters.
    confirmAction({
      title: t('discard_session'), body: t('discard_empty_session'),
      confirmLabel: t('discard_session'),
    }).then((yes) => {
      if (!yes) return;
      cancelRest();
      noteActiveCleared(state.active_session);
      state.active_session = null;
      state.forced_next_session = null;
      focusExerciseIdx = null;
      saveLocal();
      postNativeActivity();
      router('home');
    });
    return;
  }
  // Finishing with exercises still open used to archive silently.
  if (unresolved > 0 && !endSessionConfirmed) {
    confirmAction({
      title: t('end_session'),
      body: tf('finish_with_open', { n: unresolved }),
      confirmLabel: t('finish_anyway'),
    }).then((yes) => {
      if (!yes) return;
      endSessionConfirmed = true;
      endSession();
      endSessionConfirmed = false;
    });
    return;
  }
  // Compute session-level PRs and stats before archiving
  const sessionPRs = computeSessionPRs(a);
  const stats = computeSessionStats(a);
  // Stamp the machine each exercise was performed on, so the history can be read
  // back per device. Without this the preference is decorative: it would change
  // what the card SAYS today and nothing about what it knows tomorrow.
  for (const [exerciseId, entry] of Object.entries(a.exercises || {})) {
    const device = exercisePrefs(entry.swapped_to || exerciseId).device;
    if (device) entry.device = device;
  }
  // The rest timer is a session-scoped thing and nothing ever stopped it.
  cancelRest();
  const finishedSession = { ...a, ended_at: new Date().toISOString(), prs: sessionPRs, stats };
  state.history.push(finishedSession);
  // An undo window. The toast already supports one action, and this is the
  // action it exists for: an hour of work is one mis-tap from gone otherwise.
  lastFinishedSession = finishedSession;
  noteActiveCleared(finishedSession);
  state.active_session = null;
  state.forced_next_session = null;  // clear override after session ends
  focusExerciseIdx = null;
  state.msg_index = (state.msg_index + 1) % (RW.MOTIVATIONAL_MESSAGES?.length || 20);
  saveLocal();
  // The session is over: the Island has nothing left to count. Said now rather
  // than on the next render, because the end screen is where he stops looking.
  postNativeActivity();
  // Show end-of-session screen instead of jumping to history
  showSessionEnd(finishedSession);
  // The only moment history actually grows.
  checkStorageHeadroom();
  // The undo. Offered for long enough to notice the mistake, and it puts the
  // session back exactly as it was rather than starting a new one.
  toast(t('session_finished'), 9000, t('undo'), () => {
    if (reopenSession(lastFinishedSession)) {
      lastFinishedSession = null;
      render();
      toast(t('session_reopened'));
    }
  });
}

function computeSessionPRs(session) {
  // Look for sets in this session that match the current PR for each exercise
  const out = [];
  for (const [ex_id, ex] of Object.entries(session.exercises || {})) {
    const actualId = ex.swapped_to || ex_id;
    const pr = state.prs[actualId];
    if (!pr) continue;
    if (pr.date === todayISO()) {
      out.push({ exercise_id: actualId, kg: pr.kg, reps: pr.reps });
    }
  }
  return out;
}

function computeSessionStats(session) {
  let totalSets = 0, totalReps = 0, totalVol = 0, totalWeightLifted = 0;
  for (const ex of Object.values(session.exercises || {})) {
    for (const s of (ex.sets || [])) {
      if (!isCountableWorkingSet(s)) continue;
      totalSets++;
      const r = parseInt(s.reps, 10) || 0;
      const w = parseFloat(s.weight) || 0;
      totalReps += r;
      totalVol += r * w;
      totalWeightLifted += w;
    }
  }
  return { sets: totalSets, reps: totalReps, volume_kg: Math.round(totalVol) };
}

export let _endScreenSession = null;
function showSessionEnd(session) {
  _endScreenSession = session;
  window.location.hash = 'end';
  render();
}

export function swapExercise(exercise_id, alt_id) {
  if (!state.active_session) return;
  const ex = state.active_session.exercises[exercise_id];
  if (!ex) return;
  ex.swapped_to = alt_id;
  // Recalc suggested weight for the new exercise
  const altPlanned = { ...ex.planned, exercise_id: alt_id };
  const sug = suggestNextWeight(alt_id, altPlanned);
  ex.sets.forEach((set) => {
    if (!set.completed && !set.is_warmup) set.weight = editableWeightValue(sug.weight);
  });
  saveLocal();
  render();
  toast(tf('swapped_to', { name: getAllExercises().find(e => e.id === alt_id)?.name || alt_id }));
}

function runnerEntries(activeSession = state.active_session) {
  return Object.entries(activeSession?.exercises || {});
}

// Every weight/reps edit goes through here, because editing is recovery: a row
// he flagged invalid becomes countable again the moment he corrects it.
export function applySetEdit(set, property, value) {
  if (!set) return;
  set[property] = value;
  if ((property === 'weight' || property === 'reps') && (set.invalid || set.invalid_prompted)) {
    // A corrected row is eligible for a normal log again. The retained invalid
    // record remains in already-ended sessions; an active session stays
    // editable.
    set.invalid = null;
    set.invalid_prompted = false;
  }
  // Debounced, because this fires on every CHARACTER he types into a weight
  // box and saveLocal() serialises the entire state — history included —
  // twice, once for state and once for settings that did not change.
  scheduleSetEditPersist();
}
let setEditTimer = null;
export function scheduleSetEditPersist() {
  if (setEditTimer) clearTimeout(setEditTimer);
  setEditTimer = setTimeout(() => { setEditTimer = null; saveLocal(); }, 400);
}
// Persist a pending edit right now. Cheap when there is nothing pending.
export function flushSetEdit() {
  if (!setEditTimer) return;
  clearTimeout(setEditTimer);
  setEditTimer = null;
  saveLocal();
}

function nextUnresolvedRunnerExerciseIndex(entries = runnerEntries()) {
  return entries.findIndex(([, exercise]) => !isRunnerExerciseResolved(exercise));
}

export function skipRunnerExercise(exerciseId) {
  const active = state.active_session;
  const exercise = active?.exercises?.[exerciseId];
  if (!active || !exercise) return;
  active.exercises[exerciseId] = skipRunnerExerciseState(exercise, new Date().toISOString());
  const next = nextUnresolvedRunnerExerciseIndex();
  if (next >= 0) {
    active.runner_exercise_index = next;
    focusExerciseIdx = next;
  }
  saveLocal();
  render();
  toast(t('runner_exercise_skipped'));
}

export function showSessionPreview(session) {
  // Preview retired 2026-08-28. Raed: "خلاص ما أبغاه يعرض لي التمارين، على طول،
  // لأنه موجود خطة التمارين" — the plan is already on home, so pressing start
  // begins the session instead of listing the same exercises a second time.
  startSession(session);
  return;
}

export function appendExerciseToSession(exerciseId) {
  const active = state.active_session;
  if (!active) return;
  const exercise = getAllExercises().find((item) => item.id === exerciseId);
  if (!exercise || active.exercises[exerciseId]) return;
  // Three sets of ten is the app's own default, not a prescription from the
  // programme, so the entry is flagged added_by_user and its sets are extra.
  const planned = { exercise_id: exerciseId, sets: 3, reps: '10-12', added_by_user: true };
  const suggested = suggestNextWeight(exerciseId, planned);
  active.exercises[exerciseId] = {
    planned,
    added_by_user: true,
    sets: Array.from({ length: 3 }, () => ({
      is_warmup: false, is_extra: true,
      weight: suggested.weight, reps: workingRepTarget(planned), effort: null, completed: false,
    })),
    swapped_to: null,
  };
  saveLocal();
  render();
  toast(tf('added_to_today', { name: exercise.name }));
}


// Append an exercise to the active session. Doesn't touch PROGRAMME.
export function addExerciseToSession(exercise_id) {
  if (!state.active_session) return;
  const allEx = getAllExercises();
  const ex = allEx.find(e => e.id === exercise_id);
  if (!ex) return;
  // Default planned spec for an ad-hoc add
  const planned = {
    exercise_id, sets: 3, reps: '10', rpe: '8',
    is_first_of_muscle: false,
  };
  const sug = suggestNextWeight(exercise_id, planned);
  const sets = [];
  for (let i = 0; i < planned.sets; i++) {
    sets.push({ is_warmup: false, weight: editableWeightValue(sug.weight), reps: workingRepTarget(planned), effort: null, completed: false });
  }
  state.active_session.exercises[exercise_id] = { planned, sets };
  saveLocal();
  render();
}

