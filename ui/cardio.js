/* The post-workout cardio block, shown when the lifting is finished.
 *
 * Round 7 (ROUND7-FABLE-BRIEF §A/§B, Raed 2026-09-28): it is «الكارديو», not
 * «التهدئة», and «it seems complicated; I wanted much simpler, uniform». Eleven
 * controls became five: the suggestion IS the prefill — written into the fields
 * once per session — so on a normal day he taps «سجّل» and nothing else. Burst
 * length and burst speed sit in a collapsed <details>; the totals are one line.
 * The maths in domain/cardio.js is untouched. */

import { h } from '../core/dom.js';
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
  convertCardioUnit,
  defaultCardio,
  normalizeUnit,
  prescriptionOf,
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

/*
 * Round 7 §B: the suggestion IS the prefill. The first time the block renders
 * for a session, today's prescription — the last logged bout with its one
 * suggested change (domain `suggestNext`), or that bout as it was when every
 * lever is at its ceiling — is written INTO the fields, and
 * `applied_suggestion` records that it happened so it happens once: his own
 * edits are never overwritten by a re-render or a reload.
 *
 * Only a PRESCRIPTION is copied (`prescriptionOf`), never the old record: before
 * Round 5 one «طبّقه» tap copied the previous bout's completed_at onto today's
 * block and archived a cardio he never did (tests/cardio-round5.spec.mjs).
 *
 * `started_at` doubles as the "he has already logged this once" mark: a bout
 * reopened with «تعديل» keeps it, so an archived bout from before this flag
 * existed is never re-prefilled over what he actually did.
 */
function todayPlan(session, unit) {
  const last = lastLoggedCardio((state.history || []).filter((one) => one !== session));
  if (!last) return null;
  const suggestion = suggestNext(last, unit);
  // A copy in the unit he trains in now — the bout may have been logged in the other.
  const plan = convertCardioUnit({ ...(suggestion ? suggestion.cardio : prescriptionOf(last)) }, unit);
  return plan;
}

function prefillOnce(session, c, unit) {
  if (c.applied_suggestion || c.completed_at || c.skipped || c.started_at) return;
  const plan = todayPlan(session, unit);
  if (plan) {
    Object.assign(c, prescriptionOf(plan), {
      unit, started_at: c.started_at || null, completed_at: null, skipped: false,
    });
  }
  c.applied_suggestion = true;
  saveLocal();
}

// The collapsed burst details stay open across the re-render a tap inside them
// triggers. Render-only, per page load: it is a view state, not data.
let moreOpen = false;

export function renderCardioBlock(activeSession) {
  const unit = normalizeUnit(settings.speed_unit);
  if (!activeSession.cardio) activeSession.cardio = defaultCardio(unit);
  const c = activeSession.cardio;
  c.unit = unit;

  const wrap = h('section', { class: 'cardio', 'data-cardio-block': 'true' });
  // The bar is every OTHER bout: on the end screen this session is already in
  // history, and a bout must not be measured against itself.
  const best = bestBout((state.history || []).filter((one) => one !== activeSession));

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
  prefillOnce(activeSession, c, unit);

  // Head: the name, and the bar to beat — muted, where every other screen puts
  // its count.
  wrap.appendChild(h('div', { class: 'section-head' },
    h('span', { class: 'eyebrow' }, t('cardio_title')),
    best ? h('span', { class: 'tiny muted', 'data-cardio-best': 'true' },
      t('cardio_best'), ' ', h('span', { class: 'num' }, String(best.met_minutes))) : null,
  ));

  // Today, in one muted line: the suggestion, already applied. Recomputed from
  // history rather than stored, so it needs no field of its own; it says what
  // was PROPOSED, and the fields below say what he has made of it.
  const plan = todayPlan(activeSession, unit);
  if (plan) {
    wrap.appendChild(h('div', { class: 'tiny muted cardio-today', 'data-cardio-suggestion': 'true' },
      tf('cardio_today_line', {
        min: arabicMinutes(Number(plan.planned_minutes)),
        grade: round1(plan.incline),
      })));
  }

  // 1. Duration — label and the five choices on one line.
  wrap.appendChild(h('div', { class: 'cardio-line' },
    h('span', { class: 'cardio-field-label' }, t('cardio_duration')),
    h('div', { class: 'seg full', 'data-cardio-duration': 'true' }, DURATION_CHOICES.map((minutes) => h('button', {
      type: 'button',
      class: 'seg-btn' + (Number(c.planned_minutes) === minutes ? ' active' : ''),
      'aria-pressed': Number(c.planned_minutes) === minutes ? 'true' : 'false',
      onClick: () => { c.planned_minutes = minutes; saveLocal(); render(); },
    }, h('span', { class: 'num' }, String(minutes))))),
  ));

  // 2. Speed · incline · bursts — the three things that change, on one row.
  const speedUnit = t(unit === 'mph' ? 'unit_mph' : 'unit_kmh');
  const mainRow = h('div', { class: 'cardio-row' });
  mainRow.appendChild(numField('cardio_speed', c.base_speed,
    { min: 1, max: 20, step: 0.1, field: 'base_speed', suffix: speedUnit },
    (v) => { c.base_speed = v === '' ? '' : Number(v); repaint(); }));
  mainRow.appendChild(numField('cardio_incline', c.incline,
    { min: 0, max: GRADE_MAX, step: GRADE_STEP, field: 'incline', suffix: '%' },
    (v) => { c.incline = v === '' ? '' : Number(v); repaint(); }));
  mainRow.appendChild(stepper('cardio_bursts', Number(c.burst_count) || 0,
    { min: 0, max: 12, step: 1 },
    (v) => { c.burst_count = v; saveLocal(); render(); }));
  wrap.appendChild(mainRow);

  // 3. Burst length and speed: the same every session, so folded away. The
  // summary carries both values, so closed it still says what they are.
  const moreValues = h('span', { class: 'cardio-more-values' });
  const more = h('details', { class: 'cardio-more', 'data-cardio-more': 'true' },
    h('summary', {}, h('span', {}, t('cardio_more')), moreValues),
    h('div', { class: 'cardio-more-body' },
      h('div', { class: 'seg full', 'data-cardio-burst-seconds': 'true' }, BURST_SECOND_CHOICES.map((secs) => h('button', {
        type: 'button',
        class: 'seg-btn' + (Number(c.burst_seconds) === secs ? ' active' : ''),
        'aria-pressed': Number(c.burst_seconds) === secs ? 'true' : 'false',
        'aria-label': `${t('cardio_burst_seconds')} ${secs} ${t('cardio_seconds')}`,
        onClick: () => { c.burst_seconds = secs; saveLocal(); render(); },
      }, h('span', { class: 'num' }, String(secs))))),
      numField('cardio_burst_speed', c.burst_speed,
        { min: 1, max: 25, step: 0.1, field: 'burst_speed', suffix: speedUnit },
        (v) => { c.burst_speed = v === '' ? '' : Number(v); repaint(); }),
    ),
  );
  if (moreOpen) more.open = true;
  more.addEventListener('toggle', () => { moreOpen = more.open; });
  wrap.appendChild(more);

  // ---- The running total: ONE line, repainted in place while he types ------
  const totalsNode = h('div', { class: 'cardio-totals', 'data-cardio-totals': 'true' });
  // Built here rather than in the actions row below, because `repaint` has to be
  // able to disable it: logging a bout with a blank speed writes a record that
  // is priced at standing still.
  const logBtn = h('button', {
    class: 'btn primary', 'data-cardio-log': 'true',
    onClick: () => {
      if (boutTotals(c).incomplete) return;
      c.completed_at = new Date().toISOString();
      c.skipped = false;
      if (!c.started_at) c.started_at = new Date().toISOString();
      saveLocal(); render();
    },
  }, t('cardio_log_short'));
  function repaint() {
    const totals = boutTotals(c);
    totalsNode.innerHTML = '';
    logBtn.disabled = totals.incomplete;
    // Built from nodes, not one interpolated string: «30 ث · 7.3» as a single
    // text run let the bidi algorithm reorder it to «7.3 · ث 30» (seen in the
    // 390×844 probe). Each number is its own isolated mono run.
    moreValues.replaceChildren(
      h('span', { class: 'num' }, String(c.burst_seconds === '' ? '–' : c.burst_seconds)), ' ',
      t('cardio_seconds_short'), ' · ',
      h('span', { class: 'num' }, String(c.burst_speed === '' ? '–' : c.burst_speed)),
    );
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
    // «153 نقطة جهد · 1.35 ميل». The accent only when he is actually over the
    // bar, with «رقم جديد» — nothing else competes with it.
    const beaten = Boolean(best && best.met_minutes && totals.met_minutes > best.met_minutes);
    totalsNode.appendChild(h('div', {
      class: 'cardio-total-line' + (beaten ? ' beaten' : ''),
      'data-cardio-record': beaten ? 'true' : 'false',
    },
      h('span', { class: 'cardio-total-main num' }, String(totals.met_minutes)), ' ',
      t('cardio_effort'),
      ' · ',
      // Stored in km, shown in his unit — the belt says miles, so the block says
      // miles, and history keeps the km so an old bout stays readable.
      h('span', { class: 'num' }, String(totals.distance_display)), ' ',
      t(unit === 'mph' ? 'cardio_mile' : 'cardio_km'),
      beaten ? h('span', { class: 'cardio-record' }, ' · ', t('cardio_record')) : null,
    ));
  }
  repaint();
  wrap.appendChild(totalsNode);

  // Compact, not full width — his «أحب الأشياء صغيرة». «سجّل» is the one accent
  // in the block; «تخطَّ» is text.
  wrap.appendChild(h('div', { class: 'cardio-actions' },
    logBtn,
    h('button', {
      class: 'btn ghost', 'data-cardio-skip': 'true',
      onClick: () => { c.skipped = true; c.completed_at = null; saveLocal(); render(); },
    }, t('cardio_skip_short')),
  ));
  return wrap;
}

/*
 * One line that says what the cardio was: «الكارديو · 15 دقيقة · 1.35 ميل ·
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
