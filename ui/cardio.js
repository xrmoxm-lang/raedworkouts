/* The post-workout conditioning block, shown when the lifting is finished. */

import { h, setUiText } from '../core/dom.js';
import { arabicMinutes, t, tf } from '../core/i18n.js';
import { render } from '../core/shell.js';
import { saveLocal, settings, state } from '../core/store.js';
import {
  BURST_SECOND_CHOICES,
  DURATION_CHOICES,
  GRADE_MAX,
  GRADE_STEP,
  bestBout,
  boutTotals,
  defaultCardio,
  idealGradeFor,
  normalizeUnit,
  suggestNext,
} from '../domain/cardio.js';

const round1 = (n) => Math.round(Number(n) * 10) / 10;

/*
 * A numeric field that does NOT re-render the page while he types.
 *
 * The library search lost focus on every keystroke for exactly this reason: a
 * full render() replaces the input node, and the caret goes with it. So typing
 * writes the model and repaints only the totals line; a full render is reserved
 * for taps, where there is no caret to lose.
 */
function numField(labelKey, value, opts, onInput) {
  const input = h('input', {
    type: 'number',
    inputmode: 'decimal',
    class: 'cardio-num num',
    value: value == null ? '' : String(value),
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step),
    'aria-label': t(labelKey),
    'data-cardio-field': opts.field,
  });
  input.addEventListener('input', () => onInput(input.value));
  // Saved on blur rather than per keystroke: a half-typed «7.» is not a speed,
  // and localStorage is not where a partial number belongs.
  input.addEventListener('change', () => { onInput(input.value); saveLocal(); });
  // The unit rides in the label, not beside the box. As a sibling of a
  // full-width input it was pushed to the far edge of the field and read as a
  // stray glyph floating away from the number it belongs to.
  return h('label', { class: 'cardio-field' },
    h('span', { class: 'cardio-field-label' },
      t(labelKey),
      opts.suffix ? h('span', { class: 'cardio-suffix' }, ' ', opts.suffix) : null),
    h('span', { class: 'cardio-field-input' }, input),
  );
}

function stepper(labelKey, value, opts, onChange) {
  const btn = (delta, sign) => h('button', {
    type: 'button',
    class: 'cardio-step',
    'aria-label': `${t(labelKey)} ${sign}`,
    disabled: (delta < 0 ? value <= opts.min : value >= opts.max) ? 'disabled' : undefined,
    onClick: () => { onChange(Math.min(opts.max, Math.max(opts.min, round1(value + delta)))); },
  }, sign);
  return h('label', { class: 'cardio-field' },
    h('span', { class: 'cardio-field-label' }, t(labelKey)),
    h('span', { class: 'cardio-stepper' },
      btn(-opts.step, '−'),
      h('span', { class: 'cardio-step-value num' }, String(value)),
      btn(opts.step, '+'),
    ),
  );
}

// The suggestion is one sentence, and it says WHY. «ارفع الميل» with no reason
// is an instruction; with the reason it is a coach.
const REASON_KEY = {
  incline: 'cardio_why_incline',
  duration: 'cardio_why_duration',
  bursts: 'cardio_why_bursts',
  burst_speed: 'cardio_why_burst_speed',
};

export function renderCardioBlock(activeSession) {
  const unit = normalizeUnit(settings.speed_unit);
  if (!activeSession.cardio) activeSession.cardio = defaultCardio(unit);
  const c = activeSession.cardio;
  c.unit = unit;

  const wrap = h('section', { class: 'cardio', 'data-cardio-block': 'true' });
  const best = bestBout(state.history || []);

  // ---- Already logged: a closed row, not a live form ----------------------
  if (c.completed_at && !c.skipped) {
    const totals = boutTotals(c);
    wrap.appendChild(h('div', { class: 'section-head' },
      h('span', { class: 'eyebrow' }, t('cardio_title')),
      h('span', { class: 'num' }, String(totals.met_minutes)),
    ));
    wrap.appendChild(h('div', { class: 'cardio-logged', 'data-cardio-logged': 'true' },
      h('span', {}, arabicMinutes(Math.round(totals.planned_minutes))),
      ' · ',
      h('span', { class: 'num' }, `${totals.distance_display} `),
      t(totals.unit === 'mph' ? 'cardio_mile' : 'cardio_km'),
      ' · ',
      h('span', { class: 'num' }, `${c.base_speed}`), ' @ ',
      h('span', { class: 'num' }, `${round1(c.incline)}%`),
    ));
    wrap.appendChild(h('button', {
      class: 'btn ghost', 'data-cardio-edit': 'true',
      onClick: () => { c.completed_at = null; saveLocal(); render(); },
    }, t('cardio_edit')));
    return wrap;
  }

  // ---- Skipped: one line and a way back -----------------------------------
  if (c.skipped) {
    wrap.appendChild(h('div', { class: 'section-head' },
      h('span', { class: 'eyebrow' }, t('cardio_title'))));
    wrap.appendChild(h('div', { class: 'cardio-logged tiny muted' }, t('cardio_skipped')));
    wrap.appendChild(h('button', {
      class: 'btn ghost',
      onClick: () => { c.skipped = false; saveLocal(); render(); },
    }, t('cardio_edit')));
    return wrap;
  }

  // ---- The live form -------------------------------------------------------
  wrap.appendChild(h('div', { class: 'section-head' },
    h('span', { class: 'eyebrow' }, t('cardio_title')),
    // The bar to beat sits in the head, where every other screen puts its count.
    best ? h('span', { class: 'tiny muted' },
      t('cardio_best'), ' ', h('span', { class: 'num' }, String(best.met_minutes))) : null,
  ));
  // «نقطة جهد» is a coined unit, and a coined unit that is never defined is a
  // number he has to take on faith. Said once, in the intro, and never again on
  // the screen: effort = intensity × minutes, which is literally MET·min.
  wrap.appendChild(h('p', { class: 'tiny muted cardio-intro' },
    t('cardio_sub'), ' ',
    h('span', { 'data-cardio-effort-def': 'true' }, t('cardio_effort_def')),
  ));

  // Today's one change, computed from the last bout he actually did.
  const suggestion = suggestNext(lastLoggedCardio(state.history || []) || c, unit);
  if (suggestion) {
    wrap.appendChild(h('div', { class: 'cardio-target', 'data-cardio-suggestion': 'true' },
      h('div', { class: 'cardio-target-line' },
        h('strong', {}, t('cardio_today')), ' ',
        h('span', {}, tf(REASON_KEY[suggestion.reason] || 'cardio_why_incline', {
          from: suggestion.from, to: suggestion.to,
        })),
      ),
      h('button', {
        class: 'btn tiny', 'data-cardio-apply': 'true',
        // Belt and braces on top of the domain fix: the suggestion is a
        // PRESCRIPTION, so applying it may change what he is about to do and
        // must never touch what has happened. Before Round 5 this one tap
        // copied the previous bout's completed_at onto today's block and
        // archived a cool-down he never did.
        onClick: () => {
          Object.assign(c, suggestion.cardio, {
            unit, started_at: c.started_at, completed_at: null, skipped: false,
          });
          saveLocal(); render();
        },
      }, t('cardio_apply')),
    ));
  }

  // 1. Duration — the same segmented control the warm-up uses, because it is
  // the same kind of choice: one value out of a short fixed list.
  wrap.appendChild(h('div', { class: 'cardio-step-block' },
    h('strong', {}, t('cardio_duration')),
    h('div', { class: 'seg full' }, DURATION_CHOICES.map((minutes) => h('button', {
      type: 'button',
      class: 'seg-btn' + (Number(c.planned_minutes) === minutes ? ' active' : ''),
      'aria-pressed': Number(c.planned_minutes) === minutes ? 'true' : 'false',
      onClick: () => { c.planned_minutes = minutes; saveLocal(); render(); },
    }, h('span', { class: 'num' }, String(minutes))))),
  ));

  // 2. The base — walked or jogged. Raed 2026-09-23: the unit is mph, so his
  // own 5.1 is 137 m/min and the section can no longer be called «المشي». It is
  // «الأساس», and the pace label says which one it is today.
  //
  // Both the label and the note under the row are repainted with the totals
  // rather than built once. Typing 3.0 over 5.1 does not just change a number:
  // it moves the base from the running equation to the walking one, and a
  // «الهرولة» label left standing over a walk is the block lying about which
  // ruler it is using.
  const paceLabel = h('span', { class: 'tiny muted cardio-pace' });
  const baseNote = h('div', { class: 'tiny muted cardio-ideal' });
  const walkRow = h('div', { class: 'cardio-row' });
  walkRow.appendChild(numField('cardio_speed', c.base_speed,
    { min: 1, max: 20, step: 0.1, field: 'base_speed', suffix: t(unit === 'mph' ? 'unit_mph' : 'unit_kmh') },
    (v) => { c.base_speed = v === '' ? '' : Number(v); repaint(); }));
  walkRow.appendChild(numField('cardio_incline', c.incline,
    { min: 0, max: GRADE_MAX, step: GRADE_STEP, field: 'incline', suffix: '%' },
    (v) => { c.incline = v === '' ? '' : Number(v); repaint(); }));
  wrap.appendChild(h('div', { class: 'cardio-step-block' },
    h('div', { class: 'cardio-block-head' },
      h('strong', {}, t('cardio_base')),
      paceLabel,
    ),
    walkRow,
    baseNote,
  ));

  // 3. The bursts. He runs them inside the bout, so they eat into the walk.
  const burstRow = h('div', { class: 'cardio-row' });
  burstRow.appendChild(stepper('cardio_burst_count', Number(c.burst_count) || 0,
    { min: 0, max: 12, step: 1 },
    (v) => { c.burst_count = v; saveLocal(); render(); }));
  burstRow.appendChild(numField('cardio_burst_speed', c.burst_speed,
    { min: 1, max: 25, step: 0.1, field: 'burst_speed', suffix: t(unit === 'mph' ? 'unit_mph' : 'unit_kmh') },
    (v) => { c.burst_speed = v === '' ? '' : Number(v); repaint(); }));
  wrap.appendChild(h('div', { class: 'cardio-step-block' },
    h('strong', {}, t('cardio_bursts')),
    h('div', { class: 'seg full' }, BURST_SECOND_CHOICES.map((secs) => h('button', {
      type: 'button',
      class: 'seg-btn' + (Number(c.burst_seconds) === secs ? ' active' : ''),
      'aria-pressed': Number(c.burst_seconds) === secs ? 'true' : 'false',
      onClick: () => { c.burst_seconds = secs; saveLocal(); render(); },
    }, h('span', { class: 'num' }, String(secs)), ' ', t('cardio_seconds')))),
    burstRow,
  ));

  // ---- The running total, repainted in place while he types ---------------
  const totalsNode = h('div', { class: 'cardio-totals', 'data-cardio-totals': 'true' });
  // Built here rather than in the actions row below, because `repaint` has to be
  // able to disable it: logging a bout with a blank speed writes a record that
  // is priced at standing still.
  const logBtn = h('button', {
    class: 'btn', 'data-cardio-log': 'true',
    onClick: () => {
      if (boutTotals(c).incomplete) return;
      c.completed_at = new Date().toISOString();
      c.skipped = false;
      if (!c.started_at) c.started_at = new Date().toISOString();
      saveLocal(); render();
    },
  }, t('cardio_log'));
  function repaint() {
    const totals = boutTotals(c);
    totalsNode.innerHTML = '';
    logBtn.disabled = totals.incomplete;

    // Which pace this base is, and the one true thing that can be said about it.
    // A walk gets the solved grade — the «most beneficial incline» he asked to
    // have calculated. A jog gets neither that nor a Zone 2 verdict, because
    // both are answers from the WALKING equation; it gets what it costs.
    const kind = totals.pace_kind;
    paceLabel.setAttribute('data-cardio-pace', kind);
    setUiText(paceLabel, t(kind === 'run' ? 'cardio_pace_jog' : 'cardio_pace_walk'));
    // An empty speed has no pace. Calling it «المشي» because Number('') is 0 is
    // the same lie the totals used to tell one line lower.
    paceLabel.hidden = totals.missing.includes('base_speed');
    const ideal = kind === 'walk' ? idealGradeFor(c.base_speed, unit) : null;
    if (kind === 'run') {
      baseNote.setAttribute('data-cardio-base-fact', 'true');
      setUiText(baseNote, tf('cardio_base_jog_fact', { mets: totals.base_mets }));
    } else {
      baseNote.removeAttribute('data-cardio-base-fact');
      // No note at all when the belt is already past the target flat: the honest
      // answer there is "walk flat", not a grade the machine cannot produce.
      setUiText(baseNote, ideal != null ? tf('cardio_ideal_grade', { grade: ideal, speed: c.base_speed }) : '');
    }
    baseNote.hidden = totals.incomplete || (kind === 'walk' && ideal == null);
    // A field he has cleared is not a zero. Printing a total here would be
    // arithmetic on a number he never gave — and he would then log it.
    if (totals.incomplete) {
      totalsNode.appendChild(h('div', { class: 'tiny muted', 'data-cardio-incomplete': 'true' },
        t('cardio_incomplete')));
      return;
    }
    if (totals.over_filled) {
      totalsNode.appendChild(h('div', { class: 'cardio-warn', 'data-cardio-overfilled': 'true' },
        t('cardio_overfilled')));
      return;
    }
    totalsNode.appendChild(h('div', { class: 'cardio-total-row' },
      h('span', { class: 'cardio-total-main num' }, String(totals.met_minutes)),
      h('span', { class: 'cardio-total-unit' }, t('cardio_effort')),
    ));
    totalsNode.appendChild(h('div', { class: 'tiny muted' },
      // Stored in km, shown in his unit — the belt says miles, so the block says
      // miles, and history keeps the km so an old bout stays readable.
      h('span', { class: 'num' }, String(totals.distance_display)), ' ',
      t(unit === 'mph' ? 'cardio_mile' : 'cardio_km'),
      ' · ',
      // «دقيقة مشي» is wrong for a base he is jogging; the word follows the pace.
      h('span', { class: 'num' }, String(totals.base_minutes)), ' ',
      t(totals.pace_kind === 'run' ? 'cardio_jog_min' : 'cardio_walk_min'),
      totals.burst_minutes ? h('span', {}, ' · ',
        h('span', { class: 'num' }, String(totals.burst_minutes)), ' ', t('cardio_burst_min')) : null,
    ));
    // Against the bar. The accent only appears when he is actually over it.
    if (best && best.met_minutes) {
      const delta = totals.met_minutes - best.met_minutes;
      totalsNode.appendChild(h('div', {
        class: 'cardio-versus' + (delta > 0 ? ' beaten' : ''),
        'data-cardio-versus': delta > 0 ? 'over' : 'under',
      }, delta > 0
        ? tf('cardio_beat_by', { n: delta })
        : tf('cardio_below_best', { n: Math.abs(delta) })));
    } else {
      totalsNode.appendChild(h('div', { class: 'tiny muted' }, t('cardio_first')));
    }
    // Whether the WALK is in the band the block is aiming at. Separate from the
    // total, because a bout can score well on bursts while the walk stays easy.
    // Three states, not two: «under the zone» printed at a base that is OVER it
    // sent him the wrong way. And no verdict at all for a jog — the band is a
    // walking-equation idea, and the MET fact under the base row says the true
    // thing instead.
    const BAND_KEY = { under: 'cardio_below_band', in: 'cardio_in_band', over: 'cardio_above_band' };
    if (totals.band_state) {
      totalsNode.appendChild(h('div', {
        class: 'tiny muted', 'data-cardio-band': totals.band_state,
      }, tf(BAND_KEY[totals.band_state], { mets: totals.base_mets })));
    }
  }
  repaint();
  wrap.appendChild(totalsNode);

  // Deliberately NOT `primary full`. The primary action on this screen is
  // finishing the session, and a second full-width accent button directly above
  // it made two things look like the way forward. A compact pair also matches
  // what Raed asks for everywhere: «أحب الأشياء صغيرة».
  wrap.appendChild(h('div', { class: 'cardio-actions' },
    logBtn,
    h('button', {
      class: 'btn ghost', 'data-cardio-skip': 'true',
      onClick: () => { c.skipped = true; c.completed_at = null; saveLocal(); render(); },
    }, t('cardio_skip')),
  ));
  return wrap;
}

/*
 * One line that says what the cool-down was: «التهدئة · 15 دقيقة · 1.35 ميل ·
 * 153 نقطة جهد».
 *
 * He logged it and then never saw it again — the end screen counted sets, reps
 * and volume, and history counted sets and tonnage, so the one part of the
 * session he explicitly wanted to beat later vanished the moment he pressed
 * save. Written once, here, next to the block whose copy it repeats, and used by
 * both screens; `beaten` is passed by the caller because only the caller knows
 * what it is being compared against.
 *
 * Returns null for a session with no bout, so both call sites can append it
 * unconditionally.
 */
export function cardioSummaryLine(cardio, { beaten = false, muted = false } = {}) {
  if (!cardio || cardio.skipped || !cardio.completed_at) return null;
  const totals = boutTotals(cardio);
  if (totals.incomplete) return null;
  return h('div', {
    class: 'cardio-summary-line tiny' + (muted ? ' muted' : '') + (beaten ? ' beaten' : ''),
    'data-cardio-summary': beaten ? 'best' : 'true',
  },
    t('cardio_title'),
    ' · ',
    arabicMinutes(Math.round(totals.planned_minutes)),
    ' · ',
    h('span', { class: 'num' }, String(totals.distance_display)), ' ',
    t(totals.unit === 'mph' ? 'cardio_mile' : 'cardio_km'),
    ' · ',
    h('span', { class: 'num' }, String(totals.met_minutes)), ' ', t('cardio_effort'),
  );
}

/* The last bout he actually completed, which is what the suggestion builds on. */
function lastLoggedCardio(history) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const c = history[i]?.cardio;
    if (c && !c.skipped && c.completed_at) return c;
  }
  return null;
}
