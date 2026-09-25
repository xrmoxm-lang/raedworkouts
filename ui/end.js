/* The end-of-session screen and its wellbeing check.
 *
 * Round 6 (Raed 2026-09-25): «ديزاين الانتهاء مو عجبني … خلينا نركز على الوقت»
 * and «ما حطينا الـpost cardio». The generic check-circle hero is gone; the
 * hero is the session's clock, the ledger sits under it, and the cool-down is
 * ALWAYS a line here — logged, skipped, or still open to log. Time is the hero
 * because it is the number he feels; it is never the goal, so it sits with the
 * sets and the load and nothing on this screen says «longer is better»
 * (ROUND6-FABLE-BRIEF §B). */

import { $, h, isolate } from '../core/dom.js';
import {
  DELOAD_SIGNS,
  DELOAD_SIGN_LABEL,
  DELOAD_SIGN_THRESHOLD,
  derivedBlock,
  derivedWeek,
  getActiveProgramme,
  getNextPlannedSession,
  recordWellbeingCheck,
  wellbeingCheckDue,
} from '../core/engine.js';
import { fmtDate, fmtElapsed, fmtKgTotal, localizeText, t, tf } from '../core/i18n.js';
import { render } from '../core/shell.js';
import { bestBout } from '../domain/cardio.js';
import { cardioSummaryLine, renderCardioBlock } from '../ui/cardio.js';
import { _endScreenSession } from '../core/session.js';
import { saveLocal, settings, state } from '../core/store.js';
import { getAllExercises } from '../core/videos.js';

// A five-digit volume in 28px mono overruns a third of a 390px screen, so the
// number steps down rather than pushing its neighbour off the row.
const numClass = (text) => 'num' + (text.length >= 7 ? ' s7' : text.length === 6 ? ' s6' : text.length === 5 ? ' s5' : '');
const statCell = (value, labelKey) => h('div', { class: 'stat' },
  h('div', { class: numClass(value) }, value),
  h('div', { class: 'lbl' }, t(labelKey)),
);

// Five taps and «كله تمام». The sixth sign, «persistent loss of strength», is
// not asked — the app reads it out of his own logs, because asking someone
// whether they are weaker is asking them to guess at something recorded.
function buildWellbeingCheck() {
  const chosen = new Set();
  const wrap = h('section', { class: 'wellbeing', 'data-wellbeing-check': 'true' });
  const finish = (signs) => {
    const total = recordWellbeingCheck(signs);
    wrap.innerHTML = '';
    wrap.appendChild(h('div', { class: 'wellbeing-done', 'data-wellbeing-done': 'true' },
      total.length >= DELOAD_SIGN_THRESHOLD
        // Say what will happen and why, not just that something was noted.
        ? h('div', {},
            h('strong', {}, t('deload_booked')),
            h('p', { class: 'tiny muted' }, t('deload_booked_why')))
        : h('span', { class: 'tiny muted' }, t('wellbeing_noted')),
    ));
  };
  wrap.appendChild(h('div', { class: 'wellbeing-q' }, t('wellbeing_question')));
  wrap.appendChild(h('div', { class: 'wellbeing-chips' }, DELOAD_SIGNS.map((sign) => {
    const chip = h('button', {
      type: 'button', class: 'chip', 'data-wellbeing-sign': sign, 'aria-pressed': 'false',
      onClick: () => {
        if (chosen.has(sign)) chosen.delete(sign); else chosen.add(sign);
        chip.classList.toggle('active', chosen.has(sign));
        chip.setAttribute('aria-pressed', chosen.has(sign) ? 'true' : 'false');
        save.disabled = chosen.size === 0;
      },
    }, DELOAD_SIGN_LABEL[sign]());
    return chip;
  })));
  const save = h('button', {
    class: 'btn primary', 'data-wellbeing-save': 'true', disabled: 'disabled',
    onClick: () => finish([...chosen]),
  }, t('wellbeing_save'));
  wrap.appendChild(h('div', { class: 'wellbeing-actions' },
    save,
    // «كله تمام» is an answer, not a dismissal: it records a week with no signs,
    // which is what stops the question coming back tomorrow.
    h('button', { class: 'btn ghost', 'data-wellbeing-none': 'true', onClick: () => finish([]) }, t('wellbeing_all_good')),
  ));
  return wrap;
}

// The cool-down, always. `s` is already IN history by the time this renders
// (endSession pushes, then shows the screen), so it is excluded by identity
// before the bar is computed, or it would always be its own best.
//
// Three states: logged → the summary line, with the accent when it beat every
// bout before it; skipped → one muted line; untouched (he hit finish without
// deciding) → the same form the done panel had, mounted here and writing into
// the archived session — that is the «ما حطينا الـpost cardio». The form's own
// Log/Skip call render(), which re-enters renderSessionEnd through the shell.
// A render-only flag: non-enumerable, so JSON.stringify (saveLocal) never
// writes it into the archived session (asserted in tests/round6-end.spec.mjs).
const openCardio = (s) => Object.defineProperty(s, '_cardio_open', { value: true, enumerable: false, configurable: true });
function buildCardioLine(s) {
  const c = s.cardio;
  const logged = c && c.completed_at && !c.skipped;
  if (logged) {
    const mine = bestBout([s]);
    const previousBest = bestBout((state.history || []).filter((one) => one !== s));
    const line = cardioSummaryLine(c, { beaten: !!mine && (!previousBest || mine.met_minutes > previousBest.met_minutes) });
    if (line) return h('div', { class: 'end-cardio', 'data-end-cardio': 'logged' }, line);
  }
  if (c && c.skipped) {
    return h('div', { class: 'end-cardio', 'data-end-cardio': 'skipped' },
      h('span', { class: 'tiny muted' }, t('cardio_title'), ' · ', t('cardio_skipped')),
      h('button', {
        class: 'btn tiny ghost', 'data-end-cardio-log': 'true',
        onClick: () => { c.skipped = false; c.completed_at = null; openCardio(s); saveLocal(); render(); },
      }, t('cardio_log')));
  }
  if (s._cardio_open) {
    return h('div', { class: 'end-cardio-form', 'data-end-cardio': 'form' }, renderCardioBlock(s));
  }
  return h('div', { class: 'end-cardio', 'data-end-cardio': 'open' },
    h('span', { class: 'tiny muted' }, t('cardio_title'), ' · ', t('cardio_not_logged')),
    h('button', {
      class: 'btn tiny', 'data-end-cardio-log': 'true',
      // A render-only flag: it never reaches storage because it is not part of
      // what saveLocal serialises from the session (verified in the test).
      onClick: () => { openCardio(s); render(); },
    }, t('cardio_log')));
}

// showSessionEnd() sets the hash and renders; nothing scrolled, so he landed
// on this screen wherever the done panel had left him — under the hero. Once
// per session shown, not on every re-render: the cool-down form on this screen
// re-renders through the shell and must not jump him back to the top.
let lastShown = null;
export function renderSessionEnd() {
  const root = $('#page-end');
  root.innerHTML = '';
  const s = _endScreenSession;
  if (s && s !== lastShown) { lastShown = s; window.scrollTo(0, 0); }
  if (!s) {
    root.appendChild(h('div', { class: 'session-end' },
      h('p', { class: 'subtitle' }, t('session_saved')),
      h('a', { class: 'btn primary full', href: '#home' }, t('home')),
    ));
    return;
  }
  const stats = s.stats || { sets: 0, reps: 0, volume_kg: 0 };
  const prs = s.prs || [];
  const msgIdx = (state.msg_index - 1 + (RW.MOTIVATIONAL_MESSAGES?.length || 20)) % (RW.MOTIVATIONAL_MESSAGES?.length || 20);
  const msg = (RW.MOTIVATIONAL_MESSAGES || ['Eat. Sleep. Repeat.'])[msgIdx];

  const wrap = h('div', { class: 'session-end' },
    // The hero: the clock. `ended_at − started_at` includes the cool-down, and
    // that is correct: the cool-down is part of the session. h:mm:ss — the
    // format he ruled for on 2026-09-22 («not 80 min, 1:20»).
    h('div', { class: 'end-eyebrow' }, t('session_duration')),
    h('div', { class: 'end-clock', 'data-end-clock': 'true' }, fmtElapsed(s.started_at, s.ended_at) || '—'),
    h('h2', {}, t('session_done_title')),
    h('div', { class: 'subtitle' }, fmtDate(s.started_at), ' · ', localizeText(s.session_name)),

    // The ledger — three cells, centred, hairlines.
    h('div', { class: 'stats-grid', 'data-end-ledger': 'true' },
      statCell(String(stats.sets), 'sets'),
      statCell(String(stats.reps), 'reps'),
      statCell(fmtKgTotal(stats.volume_kg), 'volume_kg'),
    ),

    buildCardioLine(s),

    // Honour the setting. It was written and toggled in Settings and read by
    // NOTHING, so turning "show PR summary" off changed nothing on screen — a
    // control that lies about what it does.
    (settings.show_pr_summary !== false && prs.length) ? h('div', { class: 'pr-card' },
      h('h3', {}, t('personal_records_plain')),
      prs.map(pr => {
        const ex = getAllExercises().find(e => e.id === pr.exercise_id);
        return h('div', { class: 'pr-line' },
          h('span', {}, isolate(ex ? ex.name : pr.exercise_id)),
          h('span', { class: 'num' }, `${pr.kg} kg × ${pr.reps}`),
        );
      })
    ) : null,

    h('p', { class: 'end-note' }, msg),

    // The once-a-week check that research/06 §7.3 turns on.
    wellbeingCheckDue() ? buildWellbeingCheck() : null,

    h('div', { class: 'next-up' },
      h('div', { class: 'eyebrow' },
        // localizeText, because tf() interpolates the block name AFTER the
        // locale lookup — so the English block name from data.js used to
        // survive onto an Arabic screen.
        tf('block_week_of', {
          block: localizeText(getActiveProgramme()?.block_name || String(derivedBlock())),
          week: derivedWeek(),
          total: Math.max(...((state.programme_overrides || RW.PROGRAMME).blocks || []).map((b) => b.week_end || 0), 1),
        })
      ),
      h('strong', {}, t('next_label')),
      (() => {
        const next = getNextPlannedSession();
        return next ? (next.session ? next.session.name : next.name) : t('block_complete');
      })()
    ),

    h('div', { class: 'end-cta' },
      h('a', { href: '#history', class: 'btn' }, t('view_history')),
      h('a', { href: '#home', class: 'btn primary' }, t('done')),
    ),
  );
  root.appendChild(wrap);
}
