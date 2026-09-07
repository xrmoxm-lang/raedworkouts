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
import { buildVideoTile, effortPicker, explainMark } from '../ui/kit.js';

export function showSubstitutionScopeModal(exercise_id, exState, alt) {
  const modal = $('#modal');
  let scope = 'this_session';
  const draw = () => {
    // Deterministic arithmetic always runs before this UI assigns prose or asks
    // for consent, matching 24 §5.1's required order.
    const assessment = assessSessionSubstitution(exercise_id, alt.id, scope);
    const status = assessment.classification;
    modal.innerHTML = '';
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
      if (safe) modal.appendChild(h('div', { class: 'tiny muted', style: 'margin:10px 0;' }, tf('safer_option', { name: safe.name })));
      modal.appendChild(h('button', { class: 'btn danger full', onClick: () => adopt({ accepted_at: new Date().toISOString(), reason: t('blocked_substitution_accepted') }) }, t('override_and_adopt')));
    } else {
      modal.appendChild(h('button', { class: 'btn primary full', 'data-adopt-swap': 'true', onClick: () => adopt() }, t('adopt_confirm')));
    }
    modal.appendChild(h('button', { class: 'btn ghost full', style: 'margin-top:8px;', onClick: () => $('#modal-overlay').classList.remove('show') }, t('cancel')));
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
  const isOpen = card.classList.contains('expanded');

  // Head — thumbnail is the body-anatomy illustration (cleaner than action shots)
  const bodyUrl = RW.bodyImg ? RW.bodyImg(ex.primary) : '';
  const head = h('div', { class: 'ex-head', onClick: () => {
    // Was also rewriting the ▸/▾ glyph on .ex-status. That element is now the
    // settings button, so the query returned null and every header tap threw —
    // collapsing stopped working entirely. The card's own class is the state;
    // nothing needs to mirror it in text.
    card.classList.toggle('expanded');
  }},
    h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
    h('div', { class: 'ex-info' },
      // T1: catalogue exercise names remain English even in the Arabic UI.
      h('h4', {}, h('bdi', { class: 'ltr-run' }, ex.name)),
      h('div', { class: 'meta' },
        ex.primary.map(m => h('span', { class: 'muscle-tag' }, muscleLabel(m))),
        ` ${planned.sets} × ${planned.reps}`,
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
    // header did the collapsing. Raed asked for a settings entry in its place;
    // since the chevron never was the control, replacing it removes nothing —
    // tapping the header still collapses.
    h('button', {
      class: 'ex-settings-btn' + (allWorkingDone ? ' done' : ''),
      'data-exercise-settings': 'true',
      'aria-label': t('exercise_settings'),
      title: t('exercise_settings'),
      onClick: (event) => { event.stopPropagation(); showExerciseSettings(ex_id, exState); },
    }),
  );
  // The emoji, back, at Raed's request: "رجّع الإيموجي الثابت حق إعدادات
  // التمرين". It went through three forms and this is the third time he has
  // ruled on it, so the reasoning is worth writing down rather than re-deriving:
  //
  //   ⚙   bare U+2699    — a TEXT glyph. Thin, and drawn by whatever font the
  //                        platform picks, so it looked different on his phone
  //                        than anywhere I checked it. He called it "the worst".
  //   sliders SVG        — matched the app's line set, but he wants the emoji.
  //   ⚙️  U+2699 U+FE0F  — the emoji presentation: same colour glyph on every
  //                        device, which is the "ثابت" in what he asked for.
  //
  // The variation selector is the whole difference and it is invisible in the
  // source, so: it is deliberate, do not "clean it up".
  const gearBtn = head.querySelector('[data-exercise-settings]');
  if (gearBtn) gearBtn.textContent = allWorkingDone ? '✅' : '⚙️';
  card.appendChild(head);

  // Body
  const body = h('div', { class: 'ex-body' });
  // «آخر مرة» is built here, where `last` is in scope, and appended AFTER the
  // sets. Raed: "خله بس تحت يعني موجود تحت بدل ما يكون فوق". It is reference,
  // not instruction — he needs it while deciding what to type, not before he
  // has seen the row he is typing into.
  let lastTimeRow = null;
  if (last) {
    const ws = (last.sets || []).filter(s => !s.is_warmup && s.completed);
    if (ws.length) {
      lastTimeRow = h('div', { class: 'last-time' },
        h('strong', {}, 'Last time'), ` (${fmtDate(last.date)}): `,
        ws.map(s => `${s.weight}×${s.reps}`).join(', ')
      );
    }
  }
  // Videos.
  //
  // `runner_video_open` was declared in defaultSettings(), migrated once on
  // load, written by nothing and READ BY NOTHING — while GATES.md said it was
  // live. Raed asked for this control in his own words: «فيه زي هذه العجلة حقة
  // الإعدادات إنه مثلاً أحط أخفي الـvideos... وتكون مخفية، أهم شيء يكون real app
  // وتتذكر التصرفات». The gear he pointed at now owns it, and it is remembered.
  //
  // Two levels, because he described both: this switch hides the strip during a
  // workout without forgetting anything, and the per-clip marks below it in the
  // sheet are still the Library's choices about individual clips.
  const allVideos = settings.runner_video_open ? buildExerciseVideos(actualId, ex) : [];
  if (allVideos.length) {
    const videoRow = h('div', { class: 'video-row' },
      allVideos.map(v => buildVideoTile(v))
    );
    body.appendChild(videoRow);
    // Note: video selection + JN URL editing live in Library, not here.
  } else {
    // Half the catalogue he can reach by swapping has no clip of its own — 39
    // of 78, measured. Where the SAME movement exists on other equipment, its
    // clip is offered here, labelled as exactly that and never mixed in with
    // the exercise's own tiles. The label is the whole point: the movement is
    // the same and the setup is not, and a clip presented as this exercise's
    // own would be the wrong-clip case D8 forbids.
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

  // The one number that actually moves the weight. The engine raises load only
  // when EVERY working set hits the TOP of the rep range, so a range alone left
  // Raed guessing whether 10 or 12 was the point -- and 10 would have held the
  // weight still forever without explaining why.
  // The engine has always explained WHY it suggests this weight. v16 kept the
  // calculation and dropped the render, so the number looked arbitrary — the
  // exact thing Raed complained about not understanding. Shown compactly, above
  // the rep goal, and NOT as a form cue (those he removed on purpose).
  //
  // One of the nine notes is dropped: why_match_or_beat, «المرة الماضية: 10 كغ
  // × 6. اعدلها أو تجاوزها». Raed asked for it gone — "وش أعدلها أو أتجاوزها ما
  // أدري صراحة" — and he is right about that one specifically: «آخر مرة» below
  // already prints every set of last session, so the note repeated a subset of
  // it and added an instruction that names no number to aim at. It is also the
  // FALLBACK branch, so it was the note he saw most often, which is why the
  // whole feature read as noise.
  //
  // The other eight stay. They each explain a DECISION — hold this load, bump
  // it, add a rep instead because this is an accessory, today is a calibration
  // — which is exactly the "رقم بدون سبب" he asked to fix. Removing those to
  // satisfy a complaint about the one that explains nothing would delete the
  // answer along with the noise.
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
  // The effort target gets its OWN line rather than trailing the goal sentence.
  // Three words after «أكمل 12 في كل المجموعات ليرتفع الوزن» wrapped into a
  // run-on with an orphan on the second line — «خفيف — بقصد» alone is four
  // words. Two short lines read faster than one long one.
  // Spelled out, not looked up by a computed key: the locale gate reads every
  // lookup in this file to prove its key exists, and a built key defeats it.
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
    h('span', {}, 'Weight (kg)'),
    h('span', {}, 'Reps'),
    h('span', {}, ''),
  ));
  exState.sets.forEach((set, idx) => {
    const isWarm = set.is_warmup;
    const setNum = isWarm ? `W${idx+1}` : `${idx - exState.sets.filter(s => s.is_warmup).length + 1}`;
    const workingSets = exState.sets.filter((item) => !item.is_warmup);
    const isFinalWorkingSet = !isWarm && set === workingSets[workingSets.length - 1];
    const row = h('div', {
      class: 'set-grid' + (isWarm ? ' warm' : '') + (set.completed && !isWarm ? ' done' : '') + (set.skipped ? ' skipped' : '') + (set.is_extra ? ' extra' : ''),
      'data-session-set-row': String(idx),
      'data-set-kind': isWarm ? 'warmup' : 'working',
    },
      // Raed: "نشيل الأرقام، ويكون بس اللي موجود اللي بالخلفية". The row number
      // was never information he needed — he knows which set he is on because
      // it is the next empty row, and the rep target is already on the card.
      // Ramp rows keep a mark, because "this one is a warm-up" IS information
      // and it is the only thing distinguishing them from working sets.
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
        // A placeholder is not a label: it disappears the moment he types, and
        // VoiceOver announced these two boxes as an unnamed pair of number
        // fields. The set number is in the name because the row itself no longer
        // shows one.
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
        // This is THE control of the app — the one he taps after every set — and
        // it had no accessible name at all. It is an icon-only toggle, so it
        // needs both a name and a state; without aria-pressed a screen reader
        // cannot tell a ticked set from an unticked one.
        'aria-label': tf(isWarm ? 'a11y_complete_ramp_set' : 'a11y_complete_set', { n: idx + 1 }),
        'aria-pressed': set.completed ? 'true' : 'false',
        disabled: Boolean(set.skipped),
        onClick: () => {
          if (!set.completed) {
            // hasValidWorkingValues, NOT hasWorkingWeight. The card carried its
            // own stricter copy of the rule requiring weight > 0, so a
            // «وزن الجهاز فقط» set — which is legitimately 0 kg — could be
            // created but never ticked complete. The domain function already
            // distinguishes an explicit 0 from an untouched empty box; keeping
            // a second rule here is what let the two drift apart.
            if (!isWarm && !hasValidWorkingValues(set)) {
              toast(t('required'));
              return;
            }
            if (isFinalWorkingSet && !set.effort) {
              // Refusing has to REVEAL the thing it is asking for. The picker
              // only opened when the second-to-last set was ticked, so ticking
              // the final set first — or an exercise with a single working set,
              // where there is no prior set at all — got «اختر الجهد» with no
              // picker anywhere on screen and no way forward.
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
            // Move to the other half of the pair. After A1 that is «move right
            // into» A2; after A2 it is back to A1 for the next round, and A2's
            // own rest_min has just started the timer above — which is exactly
            // «rest for the time period indicated in the A2 row».
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
    // research/07 §2.7 puts a light/normal/heavy tap AFTER the last ramp set, on
    // every exercise and not only a first exposure. The app's three efforts are
    // already those three words.
    //
    // «After» is load-bearing, and so is §2.8 on the very next line of that same
    // file — «Warm-up sets are not building muscle. No need to overdo or
    // over-think them», which it says to put in the UI rather than the docs. A
    // permanent second three-face strip inside a card he is working in is
    // exactly the clutter he has complained about. So it appears only once that
    // ramp set is ticked, and it leaves the moment it has been answered.
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
      return;
    }
    if (isFinalWorkingSet) {
      // Raed: "ليش ما تحطها بشكل أنظف جنب الجلسة الأخيرة؟ ليش حاطها تحت، كأن
      // مسبب زحمة؟" — it was a full-width block under the sets. Now it is one
      // compact face ON the final row; tapping it reveals the three, and
      // choosing collapses them again. This is v15's own interaction.
      // Raed: it should appear the moment the SECOND-TO-LAST set is ticked,
      // because by then he already knows the last one is coming and the picker
      // is what the last one needs. Waiting until he taps the final check makes
      // him tap twice and reads as the app blocking him.
      // Raed: the trigger button is redundant — the picker already opens by
      // itself when the SECOND-TO-LAST set is ticked, so a face whose only job
      // is to open something that has already opened is chrome. The strip is
      // shown directly: prompting when the prior set is done, and staying
      // visible afterwards to show the choice he made.
      // `priorSet?.completed` alone was too narrow twice over: an exercise with
      // ONE working set has no prior set, and ticking the sets out of order
      // leaves the immediate predecessor unticked while others are done. Both
      // hid the picker while the check button demanded it.
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
      return;
    }
    // Every other row keeps the fifth cell empty so the columns stay aligned.
    row.appendChild(h('span', { class: 'effort-slot' }));
    body.appendChild(row);
  });

  // Under the rows, in the order he reads them: the target for the rows above,
  // then what he did last time. Both used to sit ABOVE the grid, pushing the
  // first input he touches further down a screen he already said had too much
  // scrolling.
  if (repsGoalRow) body.appendChild(repsGoalRow);
  if (effortRow) body.appendChild(effortRow);
  if (lastTimeRow) body.appendChild(lastTimeRow);

  // Action row: alternatives + add set + warmup helper
  if (planned.warmup) {
    body.appendChild(h('div', { class: 'warmup-block' },
      h('strong', {}, '⚠ ', t('warmup'), ': '), warmupText(planned, sug.weight)
    ));
  }

  // The per-set row is empty now. Everything that used to sit here — + مجموعة,
  // راحة, استبدال, تخطي التمرين, + فيديو, + تمرين, وزن الجهاز فقط — belongs to
  // the EXERCISE, not to the set he is in the middle of, and it now lives in
  // the settings sheet behind the gear. Raed asked for the row under the sets to
  // be clear of them. Nothing was removed; it is one tap away, grouped by what
  // each control actually is.
  //
  // The gear in the card header is the way in, and the header still collapses
  // on tap, so the row costs nothing to reach.

  card.appendChild(body);
  return card;
}

// Raed: "الـexercise هذا ما تبدل، أضف لي exercise على نهاية التمرين". Swapping
// REPLACES a prescribed movement and charges the volume ledger against it.
// Appending adds a movement the programme never asked for, at the end, without
// touching anything above it. They are different actions and he wanted both.
export function showAddExerciseModal() {
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
  options.forEach((item) => modal.appendChild(h('button', {
    class: 'btn full', style: 'margin-top:6px; text-align:start;',
    'data-add-exercise-option': item.id,
    onClick: () => {
      appendExerciseToSession(item.id);
      $('#modal-overlay').classList.remove('show');
    },
  },
    h('strong', {}, item.name),
    h('span', { class: 'tiny muted' }, ' · ', muscleLabel(item.primary?.[0])),
  )));
  modal.appendChild(h('button', {
    class: 'btn ghost full', style: 'margin-top:10px;',
    onClick: () => $('#modal-overlay').classList.remove('show'),
  }, t('cancel')));
  $('#modal-overlay').classList.add('show');
}

// The per-exercise settings sheet.
//
// Everything that belongs to ONE movement lives here. Raed asked for it to be
// designed properly — "neat, جميل, مرتب" — and the reason a flat stack of rows
// would fail is that these controls are not the same KIND of thing:
//
//   الجهاز    what this movement is performed on. Configuration, set once.
//   السجل     what he has actually lifted here. Evidence, read-only.
//   إجراءات   things he can do to this exercise right now. Verbs.
//
// The sheet is structured in that order because it is true of the content, not
// because three sections look tidy. Configuration is what he changes rarely and
// wants to confirm; the record is what he opens the sheet to READ mid-workout;
// the verbs are what he came to press.
//
// The table is the signature. It is the only surface in the app that shows one
// movement across different machines side by side, which is the whole point of
// remembering the machine — a weight history that mixes them is a history of
// nothing. So it gets real typographic care: a header, tabular numerals, the
// load dominant, the machine a quiet tag.
export function showExerciseSettings(ex_id, exState) {
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
          //
          // It was written only onto the active session's state, so «وزن الجهاز
          // فقط» had to be re-ticked on every workout. Three of the seven
          // exercises in his Upper A carry it — the T-bar row, the rope triceps
          // extension and the cable lateral raise — which is three taps he was
          // making every single session, forever, and a blank weight box until
          // he made them.
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
  //
  // The per-clip toggles existed only in Library. Mid-set, that is two screens
  // and a scroll away from the card the clip is on, which is why the control he
  // asked for never felt delivered even though half of it was there.
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
  //
  // The gym moves machines. Reordering here rather than in Settings because this
  // is where his hand already is the moment he walks up and finds the rack gone:
  // «ما أدري وين تكون صراحة» — it belongs at the exercise, not two screens away.
  //
  // Moves the LIVE session and records the order for every future one.
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
    //
    // It was three shapes stacked: a full-width primary slab for استبدال, a 2x2
    // of outline buttons under it, and تخطي التمرين as a bare red text link — a
    // fifth visual language for the one action that ends the exercise. Raed:
    // "أعتقد نقدر نرتبها ونخليها بشكل أرتب وأنسق وأصغر... متناسقة".
    //
    // Now every action is the same box at the same height, and only the FILL
    // says what kind it is: استبدال is filled because he uses it most and asked
    // for it to lead, تخطي is tinted because it ends the exercise, the rest are
    // outlines. Two of them span the full width, so the grid still reads as a
    // hierarchy rather than a wall of six identical tiles.
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
  // Raed: "ياليت يكون السجل يكون آخر شيء تحت... لأنه هو تاريخ وسرد". He is
  // right: it is the only READ-ONLY block in the sheet, so it belongs after the
  // things he came to change rather than between them.-------------------------------------------
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

export function showAltModal(ex_id, exState) {
  const allEx = getAllExercises();
  const ex = allEx.find(e => e.id === (exState.swapped_to || ex_id));
  const m = $('#modal');
  m.innerHTML = '';

  // Section header helper
  const sectionHead = (title, sub) => h('div', { style: 'margin: 14px 0 6px;' },
    h('div', { style: 'font-size:13px; font-weight:600; color:var(--text);' }, title),
    sub ? h('div', { class: 'tiny muted', style: 'margin-top:2px;' }, sub) : null,
  );
  const altCard = (alt, onClick) => {
    const bodyUrl = RW.bodyImg ? RW.bodyImg(alt.primary) : '';
    return h('div', {
      class: 'ex swap-option', style: 'cursor:pointer; margin-bottom:6px; touch-action:pan-y;',
      onClick,
    },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
        h('div', { class: 'ex-info' },
          h('h4', {}, alt.name),
          h('div', { class: 'meta' }, (alt.primary || []).map(muscleLabel).join(', '), t('tap_inspect')),
        ),
      ),
    );
  };

  m.appendChild(h('h3', {}, t('swap')));

  // ===== SECTION 1: Replace =====
  // The PROGRAMME's own substitutes come first. §8.4 authors a sub1/sub2 for
  // every row — Chest Press Machine prescribes Flat DB Press and Hammer Strength
  // Press — and this modal was reading only the catalogue's generic
  // `alternatives`, which for that same exercise are Incline Chest Press and Pec
  // Deck. Swapping therefore offered movements the programme never chose.
  //
  // The catalogue list still follows, so nothing is taken away; the sourced ones
  // simply lead, because they were picked for THIS slot.
  const plannedRow = exState?.planned || {};
  const programmeSubs = [plannedRow.sub1, plannedRow.sub2].filter(Boolean);
  const orderedIds = [...new Set([...programmeSubs, ...(ex?.alternatives || [])])]
    .filter((id) => id !== (exState?.swapped_to || ex_id));
  const validAlts = orderedIds.map(id => allEx.find(e => e.id === id)).filter(Boolean);
  if (validAlts.length) {
    m.appendChild(sectionHead('Replace with…', 'Tap to calculate the ledger before adopting.'));
    validAlts.forEach(alt => m.appendChild(altCard(alt, () => {
      showSubstitutionScopeModal(ex_id, exState, alt);
    })));
  }

  // ===== SECTION 2: Add another exercise =====
  m.appendChild(sectionHead('Add another exercise to today', 'Appends to the end of this session. Doesn\'t modify the original programme.'));

  const searchInput = h('input', {
    type: 'search', class: 'search-input',
    placeholder: '🔍 Search any exercise…',
    style: 'margin-bottom:8px;',
    onInput: (e) => {
      const q = e.target.value.toLowerCase();
      list.innerHTML = '';
      const matched = allEx
        .filter(x => !state.active_session?.exercises?.[x.id])  // not already in session
        .filter(x => (x.name + ' ' + (x.name_ar || '')).toLowerCase().includes(q))
        .slice(0, 30);
      matched.forEach(x => list.appendChild(altCard(x, () => {
        addExerciseToSession(x.id);
        $('#modal-overlay').classList.remove('show');
        toast(tf('added_to_today', { name: x.name }));
      })));
      if (!matched.length) {
        list.appendChild(h('div', { class: 'tiny muted', style: 'padding:8px; text-align:center;' }, 'No matches.'));
      }
    }
  });
  m.appendChild(searchInput);
  const list = h('div');
  m.appendChild(list);

  m.appendChild(h('button', { class: 'btn ghost full', style: 'margin-top:14px;',
    onClick: () => $('#modal-overlay').classList.remove('show')
  }, 'Cancel'));

  $('#modal-overlay').classList.add('show');
  // Trigger initial empty render so user sees "type to search"
  setTimeout(() => searchInput.focus(), 100);
}

