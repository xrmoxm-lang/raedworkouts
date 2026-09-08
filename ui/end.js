/* The end-of-session screen and its wellbeing check. */

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
import { fmtDate, fmtKgTotal, localizeText, t, tf } from '../core/i18n.js';
import { _endScreenSession } from '../core/session.js';
import { settings, state } from '../core/store.js';
import { getAllExercises } from '../core/videos.js';

// The 💪 that used to sit here was the app's own emoji, on the one screen that
// is supposed to feel like a ledger closing. A stroke drawn once says the same
// thing in the app's hand. Built in the SVG namespace — h() uses
// document.createElement, which in an HTML document produces a non-rendering
// HTML element named "svg".
const SVG_NS = 'http://www.w3.org/2000/svg';
function drawnCheck() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('check-draw');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M5 12.5l4.5 4.5L19 7');
  svg.appendChild(path);
  return svg;
}

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

export function renderSessionEnd() {
  const root = $('#page-end');
  root.innerHTML = '';
  const s = _endScreenSession;
  if (!s) {
    // Was a hand-written innerHTML string, and the only one in the file:
    // English («Session saved.» / «Home») on an Arabic-only screen, and
    // markup where every other screen builds nodes.
    root.appendChild(h('div', { class: 'session-end' },
      h('div', { class: 'hero' }, drawnCheck()),
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
    h('div', { class: 'hero' }, drawnCheck()),
    // session_done_title, not a literal: 'Session done.' — with the full stop —
    // matched no locale entry, so this one heading rendered English on the
    // screen shown after every workout.
    h('h2', {}, t('session_done_title')),
    h('div', { class: 'subtitle' }, fmtDate(s.started_at), ' · ', localizeText(s.session_name)),

    h('div', { class: 'stats-grid' },
      statCell(String(stats.sets), 'sets'),
      statCell(String(stats.reps), 'reps'),
      statCell(fmtKgTotal(stats.volume_kg), 'volume_kg'),
    ),

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

    h('div', { class: 'reminder' }, msg),

    // The once-a-week check that research/06 §7.3 turns on.
    wellbeingCheckDue() ? buildWellbeingCheck() : null,

    h('div', { class: 'next-up' },
      h('div', { class: 'eyebrow' },
        // Was "of 12" with a foundation/strength/peak split — neither of which
        // this programme has. It is 8 weeks in two blocks, and the block carries
        // its own name in the data. localizeText, because tf() interpolates the
        // block name AFTER the locale lookup — so the English block name from
        // data.js used to survive onto an Arabic screen.
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
