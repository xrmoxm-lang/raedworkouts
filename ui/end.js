/* The end-of-session screen and its wellbeing check. */

import { $, h } from '../core/dom.js';
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
import { fmtDate, t, tf } from '../core/i18n.js';
import { _endScreenSession } from '../core/session.js';
import { settings, state } from '../core/store.js';
import { getAllExercises } from '../core/videos.js';

// Five taps and «كله تمام». The sixth sign, «persistent loss of strength», is
// not asked — the app reads it out of his own logs, because asking someone
// whether they are weaker is asking them to guess at something recorded.
export function buildWellbeingCheck() {
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
    // Was a hand-written innerHTML string, and the only one in the file: English
    // («Session saved.» / «Home») on an Arabic-only screen, and markup where
    // every other screen builds nodes. The Arabic-leak scan could not see it
    // because it looked at toast() and t() calls, not at raw markup.
    root.appendChild(h('div', { class: 'empty' },
      h('div', { class: 'big' }, '✓'),
      h('p', { class: 'muted' }, t('session_saved')),
      h('a', { class: 'btn primary', href: '#home' }, t('home')),
    ));
    return;
  }
  const stats = s.stats || { sets: 0, reps: 0, volume_kg: 0 };
  const prs = s.prs || [];
  const msgIdx = (state.msg_index - 1 + (RW.MOTIVATIONAL_MESSAGES?.length || 20)) % (RW.MOTIVATIONAL_MESSAGES?.length || 20);
  const msg = (RW.MOTIVATIONAL_MESSAGES || ['Eat. Sleep. Repeat.'])[msgIdx];

  const wrap = h('div', { class: 'session-end' },
    h('div', { class: 'hero' }, '💪'),
    // 'Session done.' — with the full stop — was in no locale entry, so this
    // one heading rendered English on the screen shown after every workout.
    // session_done_title is keyed to 'Workout finished'; the two strings were
    // never the same, which is why the Arabic gate did not catch it.
    h('h2', {}, t('session_done_title')),
    h('div', { class: 'subtitle' }, fmtDate(s.started_at) + ' · ' + s.session_name),

    h('div', { class: 'stats-grid' },
      h('div', { class: 'stat' },
        h('div', { class: 'num' }, String(stats.sets)),
        h('div', { class: 'lbl' }, 'Sets'),
      ),
      h('div', { class: 'stat' },
        h('div', { class: 'num' }, String(stats.reps)),
        h('div', { class: 'lbl' }, 'Reps'),
      ),
      h('div', { class: 'stat' },
        h('div', { class: 'num' }, String(stats.volume_kg)),
        h('div', { class: 'lbl' }, 'Volume kg'),
      ),
    ),

    // Honour the setting. It was written and toggled in Settings and read by
    // NOTHING, so turning "show PR summary" off changed nothing on screen — a
    // control that lies about what it does.
    (settings.show_pr_summary !== false && prs.length) ? h('div', { class: 'pr-card' },
      h('h3', {}, t('personal_records')),
      prs.map(pr => {
        const ex = getAllExercises().find(e => e.id === pr.exercise_id);
        return h('div', { class: 'pr-line' },
          h('span', {}, ex ? ex.name : pr.exercise_id),
          h('span', {}, `${pr.kg} kg × ${pr.reps}`),
        );
      })
    ) : null,

    h('div', { class: 'reminder' }, msg),

    // The once-a-week check that research/06 §7.3 turns on. It appears here
    // because he has just trained and knows exactly how the week has felt, and
    // it appears ONCE a week — the source measures these signs over a week, and
    // he does not want the app asking him things.
    wellbeingCheckDue() ? buildWellbeingCheck() : null,

    h('div', { class: 'next-up' },
      h('div', { class: 'tiny muted', style: 'margin-bottom:4px;' },
        // Was "of 12" with a foundation/strength/peak split — neither of which
        // this programme has. It is 8 weeks in two blocks, and the block carries
        // its own name in the data.
        tf('block_week_of', {
          block: getActiveProgramme()?.block_name || derivedBlock(),
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
      h('a', { href: '#history', class: 'btn' }, 'View history'),
      h('a', { href: '#home', class: 'btn primary' }, 'Done'),
    ),
  );
  root.appendChild(wrap);
}

