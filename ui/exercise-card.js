/* The exercise card and its sheets: settings, swap, add, substitution scope. */

import { $, h, isolate, toast } from '../core/dom.js';
import {
  EQUIPMENT_KINDS,
  advanceSuperset,
  assessSessionSubstitution,
  detectPR,
  exerciseHistoryRows,
  exercisePrefs,
  getActiveProgramme,
  getLastPerformance,
  ledgerMessage,
  originalExerciseName,
  prescribedEffortSequence,
  prescribedRestSeconds,
  recordSubstitution,
  rememberDevice,
  runRampRules,
  suggestNextWeight,
  supersetPartner,
  supersetPartnerEntry,
  warmupText,
  workingRepTarget,
} from '../core/engine.js';
import {
  editableWeightValue,
  fmtDate,
  fmtDateShort,
  fmtLoadKg,
  hasWorkingWeight,
  muscleLabel,
  suggestedWeightPlaceholder,
  t,
  tf,
} from '../core/i18n.js';
import { startRest } from '../core/rest.js';
import {
  addExerciseToSession,
  appendExerciseToSession,
  applySetEdit,
  flushSetEdit,
  setFocusExerciseIdx,
  skipRunnerExercise,
  swapExercise,
} from '../core/session.js';
import { render } from '../core/shell.js';
import { saveLocal, settings, state } from '../core/store.js';
import {
  addCustomVideo,
  buildExerciseVideos,
  getAllExercises,
  isVideoHidden,
  relatedClips,
  toggleVideoVisibility,
  videoIdentity,
} from '../core/videos.js';
import { hasValidWorkingValues, isRunnerExerciseResolved } from '../domain/runner-session.js';
import { figure } from '../ui/figure.js';
import { buildVideoTile, effortPicker, explainMark } from '../ui/kit.js';

// mm:ss for a prescribed rest. The head and the sheet both print it, so they
// cannot drift apart into 2:30 and 2:3.
const restClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// The effort question must be reachable the moment it appears: below the fold
// it sits under the fixed tab bar (and the rest dock while a rest runs), and the
// session cannot advance without the answer. Bring it clear once, only when it
// is actually covered.
function revealEffortStrip(strip) {
  requestAnimationFrame(() => {
    if (!strip.isConnected || strip.hasAttribute('hidden')) return;
    const box = strip.getBoundingClientRect();
    const tab = document.querySelector('.tab-bar');
    const dock = document.getElementById('rest-timer');
    let floor = tab && !tab.classList.contains('hidden') ? tab.getBoundingClientRect().top : window.innerHeight;
    if (dock && dock.style.display !== 'none') floor = Math.min(floor, dock.getBoundingClientRect().top);
    if (box.top >= 0 && box.bottom <= floor) return;
    strip.scrollIntoView({ block: 'end', behavior: 'auto' });
  });
}

function showSubstitutionScopeModal(exercise_id, exState, alt) {
  const modal = $('#modal');
  let scope = 'this_session';
  const draw = () => {
    // Deterministic arithmetic always runs before this UI assigns prose or asks
    // for consent, matching 24 §5.1's required order.
    const assessment = assessSessionSubstitution(exercise_id, alt.id, scope);
    const status = assessment.classification;
    modal.innerHTML = '';
    // NOT .xs-head: that block sets direction:ltr for a bare exercise name, and
    // this title is an Arabic sentence with a Latin name inside it.
    modal.appendChild(h('h3', {}, tf('adopt_named', { name: alt.name })));
    modal.appendChild(h('p', { class: 'tiny muted' }, t('substitution_ledger')));
    // This modal shipped entirely in English on an Arabic-only app. It escaped
    // the Arabic gate because that gate never opens it.
    modal.appendChild(h('div', { class: 'scope-picker' }, [
      ['this_session', t('swap_scope_session')], ['this_week', t('scope_this_week')],
      ['this_block', t('scope_this_block')], ['always', t('swap_scope_always')],
    ].map(([value, label]) => h('button', {
      class: 'btn tiny' + (scope === value ? ' primary' : ''),
      onClick: () => { scope = value; draw(); },
    }, label))));
    modal.appendChild(h('div', { class: `substitution-status ${status.severity}` },
      h('strong', {}, status.severity === 'clean' ? t('clean_status') : status.severity === 'warn' ? t('check_this') : t('blocked_without_override')),
      h('div', { class: 'tiny', 'data-ledger-message': 'true' }, ledgerMessage(status)),
      Object.keys(assessment.ledger_delta).length ? h('div', { class: 'tiny muted' }, tf('ledger_change', { detail: Object.entries(assessment.ledger_delta).map(([muscle, value]) => `${muscleLabel(muscle)} ${value > 0 ? '+' : ''}${value}`).join(' · ') })) : null,
    ));
    const adopt = (override = null) => {
      recordSubstitution(exercise_id, alt.id, scope, assessment, override);
      swapExercise(exercise_id, alt.id);
      $('#modal-overlay').classList.remove('show');
    };
    if (status.severity === 'block-with-override') {
      const original = getAllExercises().find((exercise) => exercise.id === exercise_id);
      const safe = (original?.alternatives || []).map((id) => getAllExercises().find((exercise) => exercise.id === id)).filter(Boolean)
        .find((candidate) => assessSessionSubstitution(exercise_id, candidate.id, scope).classification.severity !== 'block-with-override');
      if (safe) modal.appendChild(h('div', { class: 'tiny muted safer-option' }, tf('safer_option', { name: safe.name })));
    }
    // One stacked pair of full-width actions, the same shape as confirmAction:
    // the decision and the way out, never side by side.
    modal.appendChild(h('div', { class: 'confirm-actions' },
      status.severity === 'block-with-override'
        ? h('button', { class: 'btn danger full', onClick: () => adopt({ accepted_at: new Date().toISOString(), reason: t('blocked_substitution_accepted') }) }, t('override_and_adopt'))
        : h('button', { class: 'btn primary full', 'data-adopt-swap': 'true', onClick: () => adopt() }, t('adopt_confirm')),
      h('button', { class: 'btn ghost full', onClick: () => $('#modal-overlay').classList.remove('show') }, t('cancel')),
    ));
  };
  draw();
  $('#modal-overlay').classList.add('show');
}
export function renderExerciseCard(ex_id, exState) {
  const planned = exState.planned;
  const actualId = exState.swapped_to || ex_id;
  const ex = getAllExercises().find(e => e.id === actualId);
  if (!ex) return h('div', {}, tf('unknown_exercise', { id: actualId }));
  const sug = suggestNextWeight(actualId, planned);
  const last = getLastPerformance(actualId);
  const allWorkingDone = isRunnerExerciseResolved(exState);

  const card = h('div', { class: 'ex' + (allWorkingDone ? ' done' : ''), id: 'ex-' + ex_id });

  // Head — the drawn figure, with the working muscle in the accent, replaces the
  // pastel PNG. It is the same fact, rendered in the app's own hand.
  const headRest = prescribedRestSeconds(planned);
  const head = h('div', { class: 'ex-head', onClick: () => {
    // Was also rewriting the ▸/▾ glyph on .ex-status. That element is now the
    // settings button, so the query returned null and every header tap threw
    // — collapsing stopped working entirely.
    card.classList.toggle('expanded');
  }},
    figure(ex.primary, ex.secondary, 's72'),
    h('div', { class: 'ex-info' },
      // T1: catalogue exercise names remain English even in the Arabic UI.
      h('h4', {}, h('bdi', { class: 'ltr-run' }, ex.name)),
      h('div', { class: 'meta' },
        ex.primary.map(m => h('span', { class: 'muscle-tag' }, muscleLabel(m))),
        h('span', { class: 'meta-dot', 'aria-hidden': 'true' }, '·'),
        h('span', { class: 'num' }, `${planned.sets} × ${planned.reps}`),
        // The prescribed rest was reachable only through the gear, so the one
        // number he waits on between every set was not on the card at all.
        headRest > 0
          ? [
              h('span', { class: 'meta-dot', 'aria-hidden': 'true' }, '·'),
              h('span', { class: 'meta-rest' }, t('rest_plain'), ' ', h('span', { class: 'num' }, restClock(headRest))),
            ]
          : null,
      ),
      // A swapped card used to show only the replacement, so the programme's own
      // movement vanished with no trace and Raed could not tell a substitution
      // from the plan itself. Name both, and which direction it went.
      exState.swapped_to ? h('div', { class: 'swap-note tiny', 'data-swap-note': 'true' },
        h('span', { class: 'swap-badge' }, t('swapped_badge')),
        ' ',
        tf('swapped_from', { name: originalExerciseName(ex_id) }),
      ) : null,
    ),
    // Was a ▸/▾ chevron that only mirrored the card's state, while the whole
    // header did the collapsing.
    h('button', {
      class: 'ex-settings-btn' + (allWorkingDone ? ' done' : ''),
      'data-exercise-settings': 'true',
      'aria-label': t('exercise_settings'),
      title: t('exercise_settings'),
      onClick: (event) => { event.stopPropagation(); showExerciseSettings(ex_id, exState); },
    }),
  );
  // The emoji, back, at Raed's request: "رجّع الإيموجي الثابت حق إعدادات
  // التمرين".
  const gearBtn = head.querySelector('[data-exercise-settings]');
  if (gearBtn) gearBtn.textContent = allWorkingDone ? '✅' : '⚙️';
  card.appendChild(head);

  // Body
  const body = h('div', { class: 'ex-body' });
  // «آخر مرة» is built here, where `last` is in scope, and appended AFTER the
  // sets. Raed: "خله بس تحت يعني موجود تحت بدل ما يكون فوق".
  let lastTimeRow = null;
  if (last) {
    const ws = (last.sets || []).filter(s => !s.is_warmup && s.completed);
    if (ws.length) {
      lastTimeRow = h('div', { class: 'last-time' },
        // The date stays in the Arabic face: it is a weekday and a month, not a
        // measurement. h() isolates the day numeral inside it on its own.
        h('strong', {}, t('runner_last_time')),
        ` (${fmtDate(last.date)}) `,
        h('span', { class: 'num' }, ws.map(s => `${s.weight}×${s.reps}`).join(', ')),
      );
    }
  }
  // `runner_video_open` is the gear's switch, remembered per profile. The
  // per-clip marks in the sheet are a second, narrower level over the same strip.
  const allVideos = settings.runner_video_open ? buildExerciseVideos(actualId, ex) : [];
  if (allVideos.length) {
    const videoRow = h('div', { class: 'video-row' },
      allVideos.map(v => buildVideoTile(v))
    );
    body.appendChild(videoRow);
    // Note: video selection + JN URL editing live in Library, not here.
  } else {
    // Half the catalogue he can reach by swapping has no clip of its own — 39
    // of 78, measured.
    const related = relatedClips(ex);
    if (related.length) {
      body.appendChild(h('div', { class: 'related-clips', 'data-related-clips': 'true' },
        h('div', { class: 'related-clips-note tiny' }, t('related_clip_note')),
        h('div', { class: 'video-row' }, related.slice(0, 3).map((v) => {
          const tile = buildVideoTile({ ...v, label: '' }, { className: 'related' });
          tile.setAttribute('title', tf('related_clip_from', { name: v.fromName }));
          return h('div', { class: 'related-clip-wrap' },
            tile,
            h('span', { class: 'related-clip-from' }, h('bdi', { class: 'ltr-run' }, v.fromName)));
        })),
      ));
    }
  }

  // Why this weight. why_match_or_beat is the one note suppressed — Raed asked
  // for it gone, because «آخر مرة» below already prints every set of last
  // session. The other eight each explain a DECISION and stay.
  const noteIsRestatement = sug.note_kind === 'match_or_beat';
  if (exState.machine_weight) {
    // Replaces the load reasoning rather than sitting beside it: with no added
    // weight there is no load to explain, and reps are the only lever left.
    body.appendChild(h('div', { class: 'why-weight tiny', 'data-why-weight': 'true' }, t('machine_weight_note')));
  } else if (sug.note && !noteIsRestatement) {
    body.appendChild(h('div', { class: 'why-weight tiny', 'data-why-weight': 'true' }, sug.note));
  }

  const repTop = String(planned.reps).split('-').map((part) => parseInt(part, 10)).filter(Number.isFinite).pop();
  // Built here, appended after the sets: it is the target he checks each row
  // against, so it belongs beside the rows, not stacked on top of them.
  const effortSequence = prescribedEffortSequence(planned);
  // During a deload the goal is NOT to earn a load increase, so promising one
  // next to «خفيف — بقصد» would contradict itself on the same line. The row
  // carries the flag through from the deload overlay.
  const goalText = planned.deload
    ? tf('reps_goal_deload', { n: repTop })
    : tf('reps_goal', { n: repTop });
  // The effort target gets its OWN line rather than trailing the goal
  // sentence.
  const EFFORT_SHORT = {
    effort_target_easy: () => t('effort_short_easy'),
    effort_target_moderate: () => t('effort_short_moderate'),
    effort_target_hard: () => t('effort_short_hard'),
    effort_target_near_failure: () => t('effort_short_near_failure'),
  };
  const effortWords = effortSequence.length === 1
    // One target for every set: the expressive wording is the whole story.
    ? [t(effortSequence[0])]
    : effortSequence.map((key) => (EFFORT_SHORT[key] ? EFFORT_SHORT[key]() : t(key)));
  const effortRow = effortWords.length
    ? h('div', { class: 'reps-goal tiny effort-line', 'data-prescribed-effort': 'true' },
        h('span', { class: 'effort-line-label' }, t('effort_label')),
        // Set order is left-to-right in the list above, so the sequence is
        // isolated as one run and reads in that same order.
        isolate(effortWords.join(' · ')))
    : null;
  const repsGoalRow = repTop
    ? h('div', { class: 'reps-goal tiny', 'data-reps-goal': 'true' }, goalText)
    : null;

  // A1/A2 run back to back. superset_group has been in data.js since the
  // programme was transcribed and was read by nothing, so the app rested 2:00
  // between the paired curl and triceps extension where Jeff prescribes 0.
  const activeSessionPlan = getActiveProgramme()?.sessions?.find((item) => item.id === state.active_session?.session_id);
  const partner = (settings.superset_mode || 'auto') === 'off'
    ? null
    : supersetPartner(activeSessionPlan, planned);
  if (partner) {
    const partnerName = getAllExercises().find((item) => item.id === partner.exercise_id)?.name || partner.exercise_id;
    body.appendChild(h('div', { class: 'superset-note tiny', 'data-superset': 'true' },
      explainMark('superset'),
      h('span', {}, tf('superset_with', { name: partnerName })),
      // In manual mode nothing moves under him, so the note carries the move as
      // a tap instead. The instruction is the same; who performs it is his.
      (settings.superset_mode || 'auto') === 'manual'
        ? h('button', {
            type: 'button', class: 'btn tiny ghost', 'data-superset-go': 'true',
            onClick: () => {
              const target = supersetPartnerEntry(actualId);
              if (!target) return;
              setFocusExerciseIdx(target.index);
              render();
            },
          }, tf('superset_go', { name: partnerName }))
        : null));
  }

  // Sets table. The 12px spacer div that used to sit here was a element whose
  // only job was to be empty — the same "gap with no reason" Raed asked about by
  // name. The headers carry their own margin instead.
  body.appendChild(h('div', { class: 'set-grid-headers' },
    // The first column held the set number until Raed asked for it to go. It
    // now carries only a mark on ramp rows, so "#" labels an empty column.
    h('span', {}, ''),
    h('span', {}, t('weight_kg')),
    h('span', {}, t('reps')),
    h('span', {}, ''),
  ));
  // The live row: the first set he has neither logged nor skipped. It is the
  // one thing on this screen that is about to happen, so it is the one thing
  // that carries the accent — and it walks down the ledger as he ticks.
  const currentIdx = exState.sets.findIndex((set) => !set.completed && !set.skipped);
  exState.sets.forEach((set, idx) => {
    const isWarm = set.is_warmup;
    const setNum = isWarm ? `W${idx+1}` : `${idx - exState.sets.filter(s => s.is_warmup).length + 1}`;
    const workingSets = exState.sets.filter((item) => !item.is_warmup);
    const isFinalWorkingSet = !isWarm && set === workingSets[workingSets.length - 1];
    const row = h('div', {
      class: 'set-grid' + (isWarm ? ' warm' : '') + (set.completed && !isWarm ? ' done' : '') + (set.skipped ? ' skipped' : '') + (set.is_extra ? ' extra' : '') + (idx === currentIdx ? ' current' : ''),
      'data-session-set-row': String(idx),
      'data-set-kind': isWarm ? 'warmup' : 'working',
    },
      // Raed: "نشيل الأرقام، ويكون بس اللي موجود اللي بالخلفية".
      h('div', { class: 'set-num' + (isWarm ? ' warm-mark' : '') }, isWarm ? t('ramp_short') : ''),
      h('input', {
        type: 'number', step: '0.5', inputmode: 'decimal',
        // lang/dir force Latin digits and a number pad. Without them an Arabic
        // keyboard opens and Raed has to switch language for every set.
        lang: 'en', dir: 'ltr',
        placeholder: exState.machine_weight ? t('machine_weight_short') : suggestedWeightPlaceholder(sug.weight),
        readOnly: Boolean(exState.machine_weight),
        value: editableWeightValue(set.weight),
        'data-runner-weight-input': 'true',
        // A placeholder is not a label: it disappears the moment he types,
        // and VoiceOver announced these two boxes as an unnamed pair of
        // number fields.
        'aria-label': tf('a11y_weight_for_set', { n: idx + 1 }),
        disabled: Boolean(set.skipped),
        onFocus: (e) => { try { e.target.select(); } catch(_) {} },
        onBlur: flushSetEdit,
        onInput: (e) => applySetEdit(set, 'weight', e.target.value === '' ? '' : parseFloat(e.target.value))
      }),
      h('input', {
        type: 'number', step: '1', inputmode: 'numeric',
        lang: 'en', dir: 'ltr',
        placeholder: String(planned.reps),
        value: set.reps ?? '',
        'aria-label': tf('a11y_reps_for_set', { n: idx + 1 }),
        onFocus: (e) => { try { e.target.select(); } catch(_) {} },
        onBlur: flushSetEdit,
        onInput: (e) => applySetEdit(set, 'reps', e.target.value === '' ? '' : parseInt(e.target.value, 10))
      }),
      h('button', {
        class: 'set-check' + (set.completed ? ' checked' : '') + (set.skipped ? ' skipped' : ''),
        // This is THE control of the app — the one he taps after every set —
        // and it had no accessible name at all.
        'aria-label': tf(isWarm ? 'a11y_complete_ramp_set' : 'a11y_complete_set', { n: idx + 1 }),
        'aria-pressed': set.completed ? 'true' : 'false',
        disabled: Boolean(set.skipped),
        onClick: () => {
          if (!set.completed) {
            // hasValidWorkingValues, NOT hasWorkingWeight: the card's own copy of
            // the rule required weight > 0, so a «وزن الجهاز فقط» set — legitimately
            // 0 kg — could be created and never ticked complete.
            if (!isWarm && !hasValidWorkingValues(set)) {
              toast(t('required'));
              return;
            }
            if (isFinalWorkingSet && !set.effort) {
              // Refusing has to REVEAL the thing it is asking for: the picker used
              // to open only when the second-to-last set was ticked, so «اختر الجهد»
              // appeared with no picker anywhere on screen.
              set.effort_prompted = true;
              saveLocal();
              render();
              toast(t('final_set_prompt'));
              return;
            }
            if (!isWarm && exState.sets.some((prior, priorIndex) => priorIndex < idx && prior.is_warmup && !prior.completed)) {
              toast(t('finish_ramp_first'));
              return;
            }
            // PR detection (silent)
            if (!isWarm && set.weight && set.reps) detectPR(actualId, parseFloat(set.weight), parseInt(set.reps, 10));
          }
          set.completed = !set.completed;
          // A ramp set that came back easy is the load probe of research/06
          // §6.3. Run it before the re-render so the working rows below already
          // carry the derived weight when he looks down at them.
          if (set.completed && isWarm) runRampRules(exState, actualId);
          saveLocal();
          render();
          if (set.completed && !isWarm) {
            const restSeconds = prescribedRestSeconds(planned);
            if (restSeconds > 0) startRest(restSeconds);
            if (settings.vibrate && navigator.vibrate) navigator.vibrate(50);
            // Move to the other half of the pair. After A1 that is «move
            // right into»
            const moved = advanceSuperset(actualId);
            if (moved) {
              const name = getAllExercises().find((item) => item.id === (moved.state?.swapped_to || moved.id))?.name;
              toast(tf('superset_next', { name: name || moved.id }));
              render();
            }
          }
        }
      }, set.skipped ? '↷' : set.completed ? '✓' : ''),
    );
    // On a first exposure the ramp sets ARE the measurement — §6.3 step 2 says
    // «Run it as warm-up set 1, 10 reps, full ROM. Log the RPE.» Only the final
    // working set had a picker, so there was nowhere to log it.
    const probing = isWarm && !exState.calibrated_from
      && !(exState.sets || []).some((item) => !item.is_warmup && (hasWorkingWeight(item.weight) || item.completed));
    // research/07 §2.7 puts a light/normal/heavy tap AFTER the last ramp set,
    // on every exercise and not only a first exposure. The app's three
    // efforts are already those three words.
    const rampList = (exState.sets || []).filter((item) => item.is_warmup);
    const isLastRamp = isWarm && rampList.length > 0 && set === rampList[rampList.length - 1];
    const askFeel = isLastRamp && set.completed && !exState.warmup_feel_applied
      && !exState.calibrated_from && !(exState.sets || []).some((item) => !item.is_warmup && item.completed);
    if (probing || askFeel) {
      const strip = h('div', { class: 'effort-strip prompting', 'data-ramp-effort': 'true' });
      row.appendChild(h('span', { class: 'effort-slot' }));
      strip.appendChild(effortPicker(set, () => {
        if (set.completed) runRampRules(exState, actualId);
        saveLocal(); render();
      }));
      body.appendChild(row);
      body.appendChild(strip);
      revealEffortStrip(strip);
      return;
    }
    if (isFinalWorkingSet) {
      // Raed: "ليش ما تحطها بشكل أنظف جنب الجلسة الأخيرة؟ ليش حاطها تحت، كأن
      // مسبب زحمة؟" — it was a full-width block under the sets.
      const priorSet = workingSets[workingSets.length - 2];
      const anyPriorDone = workingSets.some((s, i) => i < workingSets.length - 1 && s.completed);
      const promptNow = !set.effort && (!priorSet || Boolean(priorSet.completed) || anyPriorDone);
      const openNow = Boolean(set.effort) || promptNow || Boolean(set.effort_prompted);
      const strip = h('div', { class: 'effort-strip' + (promptNow ? ' prompting' : ''),
                               hidden: openNow ? undefined : true });
      row.appendChild(h('span', { class: 'effort-slot' }));
      strip.appendChild(effortPicker(set, () => { saveLocal(); render(); }));
      body.appendChild(row);
      body.appendChild(strip);
      if (promptNow) revealEffortStrip(strip);
      return;
    }
    // Every other row keeps the fifth cell empty so the columns stay aligned.
    row.appendChild(h('span', { class: 'effort-slot' }));
    body.appendChild(row);
  });

  // Under the rows, in the order he reads them: the target for the rows
  // above, then what he did last time.
  if (repsGoalRow) body.appendChild(repsGoalRow);
  if (effortRow) body.appendChild(effortRow);
  if (lastTimeRow) body.appendChild(lastTimeRow);

  // Action row: alternatives + add set + warmup helper
  if (planned.warmup) {
    // The ⚠ that used to lead this line was decoration on a line that is
    // already coloured as a caution. The instruction is the message.
    body.appendChild(h('div', { class: 'warmup-block' },
      h('strong', {}, t('warmup'), ': '), warmupText(planned, sug.weight)
    ));
  }

  // The per-set row is empty on purpose. Everything that used to sit here belongs
  // to the EXERCISE, not to the set he is mid-way through, and now lives in the
  // settings sheet behind the gear. Nothing was removed.

  card.appendChild(body);
  return card;
}

// Raed: "الـexercise هذا ما تبدل، أضف لي exercise على نهاية التمرين".
// Swapping REPLACES a prescribed movement and charges the volume ledger
// against it.
function showAddExerciseModal() {
  const inSession = new Set(Object.keys(state.active_session?.exercises || {}));
  const options = getAllExercises()
    .filter((item) => !inSession.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Same modal plumbing as showAltModal -- #modal + the .show class on the
  // overlay. There is no openModal()/closeModal() helper in this file.
  const modal = $('#modal');
  modal.innerHTML = '';
  modal.appendChild(h('h3', {}, t('add_exercise_title')));
  modal.appendChild(h('p', { class: 'tiny muted' }, t('add_exercise_hint')));
  const search = h('input', {
    type: 'search', class: 'search-input', placeholder: t('search_exercise'),
    onInput: (e) => {
      const needle = e.target.value.trim().toLowerCase();
      modal.querySelectorAll('[data-add-exercise-option]').forEach((node) => {
        node.hidden = Boolean(needle) && !node.textContent.toLowerCase().includes(needle);
      });
    },
  });
  modal.appendChild(search);
  // Seventy-odd movements as seventy-odd 48px slabs was a wall of buttons. The
  // sheet's own list row carries the same tap and the same hook.
  options.forEach((item) => modal.appendChild(h('button', {
    type: 'button', class: 'list-option',
    'data-add-exercise-option': item.id,
    onClick: () => {
      appendExerciseToSession(item.id);
      $('#modal-overlay').classList.remove('show');
    },
  },
    h('span', { class: 'row-title' }, h('bdi', { class: 'ltr-run' }, item.name)),
    h('span', { class: 'row-hint' }, muscleLabel(item.primary?.[0])),
  )));
  modal.appendChild(h('button', {
    type: 'button', class: 'btn ghost full xs-done',
    onClick: () => $('#modal-overlay').classList.remove('show'),
  }, t('cancel')));
  $('#modal-overlay').classList.add('show');
}

// The per-exercise settings sheet.
function showExerciseSettings(ex_id, exState) {
  const actualId = exState.swapped_to || ex_id;
  const ex = getAllExercises().find((e) => e.id === actualId);
  const planned = exState.planned;
  const prefs = exercisePrefs(actualId);
  const modal = $('#modal');
  modal.innerHTML = '';

  const close = () => $('#modal-overlay').classList.remove('show');
  const reopen = () => { render(); showExerciseSettings(ex_id, exState); };
  const closeThen = (fn) => { close(); fn(); };

  // ---- header: the movement, and the machine it is on -------------------
  modal.appendChild(h('div', { class: 'xs-head' },
    h('h3', {}, h('bdi', { class: 'ltr-run' }, ex?.name || actualId)),
    h('div', { class: 'xs-sub' },
      prefs.device
        ? h('bdi', { class: 'ltr-run' }, prefs.device)
        : t('no_device_yet')),
  ));

  // ---- 1. الجهاز — configuration ----------------------------------------
  const kindSelect = h('select', {
    'data-equipment-kind': 'true',
    'aria-label': t('equipment_kind'),
    onChange: (e) => { prefs.equipment = e.target.value; saveLocal(); reopen(); },
  },
    h('option', { value: '' }, t('equipment_unset')),
    EQUIPMENT_KINDS.map((kind) => h('option',
      prefs.equipment === kind ? { value: kind, selected: 'selected' } : { value: kind },
      t('equip_' + kind))),
  );

  const deviceInput = h('input', {
    type: 'text', class: 'search-input', maxLength: 40,
    placeholder: t('device_placeholder'), value: prefs.device || '',
  });

  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-label' }, t('equipment_section')),
    // A dropdown, at his request: five kinds wrapped badly as chips, and this is
    // a single-choice field with a stable list — exactly what a select is for.
    h('div', { class: 'xs-field' }, kindSelect),
    prefs.known_devices.length
      ? h('div', { class: 'device-chips', 'data-known-devices': 'true' },
          prefs.known_devices.map((name) => h('button', {
            type: 'button',
            class: 'chip' + (prefs.device === name ? ' active' : ''),
            onClick: () => { prefs.device = prefs.device === name ? '' : name; saveLocal(); reopen(); },
          }, h('bdi', { class: 'ltr-run' }, name))))
      : null,
    h('div', { class: 'xs-add-device' },
      deviceInput,
      h('button', {
        class: 'btn primary',
        onClick: () => { rememberDevice(actualId, deviceInput.value); reopen(); },
      }, t('save')),
    ),
    // Small and quiet: a once-per-exercise fact about the equipment, not an
    // action. It sits with the machine it describes.
    h('label', { class: 'xs-toggle' },
      h('input', {
        type: 'checkbox', 'data-machine-weight': 'true',
        ...(exState.machine_weight ? { checked: 'checked' } : {}),
        onChange: () => {
          exState.machine_weight = !exState.machine_weight;
          // Remembered for the EXERCISE, not just this session.
          exercisePrefs(actualId).machine_weight = exState.machine_weight;
          if (exState.machine_weight) {
            for (const set of exState.sets) if (!set.is_warmup && !set.completed) set.weight = 0;
          }
          saveLocal(); reopen();
        },
      }),
      h('span', {}, t('machine_weight_only_short')),
    ),
  ));

  // ---- 2b. المقاطع — which clips he sees, from where he is standing -------
  // The per-clip toggles existed only in Library.
  const clips = buildExerciseVideos(actualId, ex, { includeHidden: true });
  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-label' }, t('clips_section')),
    h('label', { class: 'xs-toggle' },
      h('input', {
        type: 'checkbox', 'data-runner-video-open': 'true',
        ...(settings.runner_video_open ? { checked: 'checked' } : {}),
        onChange: () => {
          settings.runner_video_open = !settings.runner_video_open;
          saveLocal(); reopen();
        },
      }),
      h('span', {}, t('show_clips_in_workout')),
    ),
    clips.length
      ? h('div', { class: 'xs-clips', 'data-xs-clips': 'true' }, clips.map((video) => {
          const key = videoIdentity(video);
          const hidden = isVideoHidden(actualId, key);
          return h('button', {
            type: 'button',
            class: 'chip xs-clip' + (hidden ? ' off' : ''),
            'data-xs-clip': key,
            // The state is in the strike-through and the fill, but a chip is not
            // self-describing to a screen reader, so it says which it is.
            'aria-pressed': hidden ? 'false' : 'true',
            title: hidden ? t('clip_hidden_tap_show') : t('clip_shown_tap_hide'),
            onClick: () => { toggleVideoVisibility(actualId, key); reopen(); },
          }, h('bdi', { class: 'ltr-run' }, video.label || video.title));
        }))
      // Not every movement has a clip. Saying so beats an empty row that looks
      // like the control failed to load.
      : h('div', { class: 'tiny muted' }, t('no_clips_for_exercise')),
  ));

  // ---- 2c. الترتيب — where this movement sits in the session --------------
  // The gym moves machines.
  const moveExercise = (delta) => {
    const active = state.active_session;
    if (!active) return;
    const ids = Object.keys(active.exercises);
    const from = ids.indexOf(ex_id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    // Object key order IS the running order here, so the map is rebuilt.
    active.exercises = Object.fromEntries(ids.map((id) => [id, active.exercises[id]]));
    // Remember it against the session, keyed by the PROGRAMME's own ids so a
    // swap performed today does not rewrite the order of the plan itself.
    state.exercise_order = { ...(state.exercise_order || {}), [active.session_id]: ids };
    // Follow the exercise he just moved rather than whatever slid into its slot.
    setFocusExerciseIdx(to);
    saveLocal();
    close();
    render();
  };
  const positions = Object.keys(state.active_session?.exercises || {});
  const atIndex = positions.indexOf(ex_id);
  if (positions.length > 1 && atIndex >= 0) {
    modal.appendChild(h('section', { class: 'xs-section' },
      h('div', { class: 'xs-label' }, t('order_section')),
      h('div', { class: 'xs-grid' },
        h('button', {
          class: 'btn xs-action', 'data-move-earlier': 'true',
          ...(atIndex === 0 ? { disabled: 'disabled' } : {}),
          onClick: () => moveExercise(-1),
        }, t('move_earlier')),
        h('button', {
          class: 'btn xs-action', 'data-move-later': 'true',
          ...(atIndex === positions.length - 1 ? { disabled: 'disabled' } : {}),
          onClick: () => moveExercise(1),
        }, t('move_later')),
      ),
      h('div', { class: 'tiny muted' }, tf('order_position', { n: atIndex + 1, total: positions.length })),
      // A saved order he regrets must not be permanent. Only offered once one
      // exists, so it is not a button asking to undo something he never did.
      (state.exercise_order || {})[state.active_session?.session_id]
        ? h('button', {
            class: 'btn tiny ghost', 'data-order-reset': 'true',
            onClick: () => {
              const next = { ...(state.exercise_order || {}) };
              delete next[state.active_session?.session_id];
              state.exercise_order = next;
              saveLocal();
              close();
              toast(t('order_reset_done'));
            },
          }, t('order_reset'))
        : null,
    ));
  }

  // ---- 3. إجراءات — verbs ------------------------------------------------
  const rest = prescribedRestSeconds(planned);
  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-label' }, t('actions_section')),
    // ONE grid, one button shape, six actions.
    h('div', { class: 'xs-grid' },
      h('button', {
        class: 'btn primary xs-action xs-wide', 'data-open-swap': 'true',
        onClick: () => closeThen(() => showAltModal(ex_id, exState)),
      }, t('swap')),
      h('button', {
        class: 'btn xs-action', 'data-add-set': 'true',
        onClick: () => {
          const lastWorking = [...exState.sets].reverse().find((set) => !set.is_warmup);
          // Marked beyond-plan so the card never implies the programme asked for it.
          exState.sets.push({ is_warmup: false, is_extra: true, weight: editableWeightValue(lastWorking?.weight), reps: workingRepTarget(planned), effort: null, completed: false });
          saveLocal(); close(); render();
        },
      }, t('add_set')),
      rest > 0
        ? h('button', {
            class: 'btn xs-action', 'data-rest-button': 'true',
            onClick: () => closeThen(() => startRest(rest)),
          },
          // The label and its value on two lines, so the button reads as a verb
          // with a setting rather than a control that displays state.
          h('span', {}, t('rest_plain')),
          h('span', { class: 'xs-action-sub' }, `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`))
        // A prescribed zero is an instruction to go straight into the paired
        // movement, not a short rest. Offering a 0:00 timer would be absurd.
        : h('span', { class: 'btn xs-action is-static', 'data-no-rest': 'true' }, t('no_rest_superset')),
      h('button', {
        class: 'btn xs-action', 'data-video-add': 'true',
        onClick: () => closeThen(() => addCustomVideo(ex_id)),
      }, t('video_add_short')),
      h('button', {
        class: 'btn xs-action', 'data-add-exercise': 'true',
        onClick: () => closeThen(() => showAddExerciseModal()),
      }, t('add_exercise_button')),
      // Ends this movement for the session. Same box as the rest, tinted — it
      // is an action he sometimes wants, not a warning he must be walled off
      // from, and a bare red link was the odd one out in every direction.
      h('button', {
        class: 'btn xs-action xs-wide xs-skip', 'data-runner-skip-exercise': 'true',
        onClick: () => closeThen(() => skipRunnerExercise(ex_id)),
      }, t('runner_skip_exercise')),
    ),
  ));

  // ---- السجل — evidence, last ---
  // Raed: "ياليت يكون السجل يكون آخر شيء تحت... لأنه هو تاريخ وسرد".
  const rows = exerciseHistoryRows(actualId, 3);
  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-label' }, t('exercise_log')),
    rows.length
      ? h('table', { class: 'xs-log', 'data-exercise-log': 'true' },
          h('thead', {}, h('tr', {},
            h('th', {}, t('log_col_date')),
            h('th', {}, t('log_col_best')),
            h('th', {}, t('log_col_sets')),
            h('th', {}, t('log_col_device')),
          )),
          h('tbody', {}, rows.map((row) => h('tr', {},
            h('td', { class: 'xs-log-date' }, fmtDateShort(row.date)),
            h('td', { class: 'xs-log-load' },
              h('bdi', { class: 'ltr-run' }, `${fmtLoadKg(row.topWeight)} × ${row.topReps}`)),
            h('td', { class: 'xs-log-sets' }, h('bdi', { class: 'ltr-run' }, String(row.sets))),
            h('td', { class: 'xs-log-device' },
              row.device ? h('bdi', { class: 'ltr-run' }, row.device) : '—'),
          ))),
        )
      : h('div', { class: 'xs-empty' }, t('exercise_log_empty')),
  ));

  modal.appendChild(h('button', { class: 'btn full xs-done', onClick: close }, t('done')));
  $('#modal-overlay').classList.add('show');
}

function showAltModal(ex_id, exState) {
  const allEx = getAllExercises();
  const ex = allEx.find(e => e.id === (exState.swapped_to || ex_id));
  const m = $('#modal');
  m.innerHTML = '';

  // The sheet's own section grammar, in place of three inline style strings.
  const sectionHead = (titleKey, subKey) => [
    h('div', { class: 'xs-label' }, t(titleKey)),
    subKey ? h('div', { class: 'xs-note' }, t(subKey)) : null,
  ];
  // A candidate movement is a list item, not a second exercise card: a card
  // inside a sheet on top of a card was the shape the design system bans.
  // Kept as a div with role=button because the row carries an <h4>, which a
  // <button> may not contain — and the swap tests read that heading.
  const altRow = (alt, onClick) => {
    const row = h('div', {
      class: 'row is-button swap-option',
      role: 'button', tabindex: '0',
      onClick,
      onKeydown: (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onClick(event);
      },
    },
      h('div', { class: 'row-lead' }, figure(alt.primary, alt.secondary, 's40')),
      h('div', { class: 'row-body' },
        h('h4', { class: 'row-title' }, h('bdi', { class: 'ltr-run' }, alt.name)),
        // «اضغط للتفاصيل» is kept: it is what tells him the tap costs nothing,
        // that it computes the ledger rather than adopting the swap outright.
        h('div', { class: 'row-hint' }, (alt.primary || []).map(muscleLabel).join(' · '), t('tap_inspect')),
      ),
    );
    return row;
  };

  m.appendChild(h('h3', {}, t('swap')));

  // ===== SECTION 1: Replace =====
  // The PROGRAMME's own sub1/sub2 lead, because they were picked for THIS slot;
  // the catalogue's generic `alternatives` follow, so nothing is taken away.
  const plannedRow = exState?.planned || {};
  const programmeSubs = [plannedRow.sub1, plannedRow.sub2].filter(Boolean);
  const orderedIds = [...new Set([...programmeSubs, ...(ex?.alternatives || [])])]
    .filter((id) => id !== (exState?.swapped_to || ex_id));
  const validAlts = orderedIds.map(id => allEx.find(e => e.id === id)).filter(Boolean);
  if (validAlts.length) {
    const replaceSection = h('section', { class: 'xs-section' }, sectionHead('swap_replace', 'swap_ledger'));
    validAlts.forEach(alt => replaceSection.appendChild(altRow(alt, () => {
      showSubstitutionScopeModal(ex_id, exState, alt);
    })));
    m.appendChild(replaceSection);
  }

  // ===== SECTION 2: Add another exercise =====
  const list = h('div', { class: 'list' });
  const searchInput = h('input', {
    type: 'search', class: 'search-input',
    // The magnifier emoji sat inside the placeholder, so it was read aloud and
    // it survived into the value the field compared against.
    placeholder: t('search_any_exercise_plain'),
    onInput: (e) => {
      const q = e.target.value.toLowerCase();
      list.innerHTML = '';
      const matched = allEx
        .filter(x => !state.active_session?.exercises?.[x.id])  // not already in session
        .filter(x => (x.name + ' ' + (x.name_ar || '')).toLowerCase().includes(q))
        .slice(0, 30);
      matched.forEach(x => list.appendChild(altRow(x, () => {
        addExerciseToSession(x.id);
        $('#modal-overlay').classList.remove('show');
        toast(tf('added_to_today', { name: x.name }));
      })));
      if (!matched.length) {
        list.appendChild(h('div', { class: 'xs-empty' }, t('no_matches')));
      }
    }
  });
  m.appendChild(h('section', { class: 'xs-section' },
    sectionHead('swap_add', 'swap_add_desc'),
    h('div', { class: 'xs-field' }, searchInput),
    list,
  ));

  m.appendChild(h('button', { class: 'btn ghost full xs-done',
    onClick: () => $('#modal-overlay').classList.remove('show')
  }, t('cancel')));

  $('#modal-overlay').classList.add('show');
  // Trigger initial empty render so user sees "type to search"
  setTimeout(() => searchInput.focus(), 100);
}

