/* The history log and the restore-from-backup sheet. */

import { $, confirmAction, h, toast, toastSaved } from '../core/dom.js';
import { isCountableWorkingSet } from '../domain/runner-session.js';
import { recordBodyweight } from '../core/engine.js';
import { activeLanguage, fmtDate, fmtDateShort, fmtKgTotal, fmtKgValue, t, tf } from '../core/i18n.js';
import { reopenSession } from '../core/session.js';
import { render, router } from '../core/shell.js';
import { saveLocal, settings, state } from '../core/store.js';
import { restoreRevision, syncFetch, syncUserQuery } from '../core/sync.js';
import { getAllExercises } from '../core/videos.js';

const dateLocale = () => (activeLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US');
// Numbers the user reads wear .num, including the ones Intl produces. Splitting
// the formatted date into parts is the only way to isolate the numeral from the
// month name without hardcoding an order that differs per language.
const dateParts = (date, options) => new Intl.DateTimeFormat(dateLocale(), options)
  .formatToParts(date)
  .map((part) => (/\d/.test(part.value) ? h('span', { class: 'num' }, part.value) : part.value));
const monthKey = (date) => `${date.getFullYear()}-${date.getMonth()}`;
// Spelled out, not `t(set.effort)`: the locale gate reads every lookup call to
// prove its key has an entry, and a computed key defeats it. The domain accepts
// only these three, so anything else is legacy and shows no word rather than an
// untranslated English one on an Arabic-only screen.
const EFFORT_LABEL = { easy: () => t('easy'), medium: () => t('medium'), very_hard: () => t('very_hard') };

// A session logged before session_name existed, or one whose programme entry has
// since been renamed, must never render the word «undefined» at him.
function sessionTitle(sess) {
  if (sess.session_name) return sess.session_name;
  const programme = state.programme_overrides || RW.PROGRAMME;
  const sessions = Array.isArray(programme?.blocks)
    ? programme.blocks.flatMap((block) => block?.sessions || [])
    : (programme?.sessions || []);
  const planned = sessions.find((one) => one?.id === sess.session_id);
  return planned?.name || t('session_generic');
}

// Counting rules live in one place. History used to count `!is_warmup &&
// completed`, which folded sets the runner had explicitly marked invalid into
// his tonnage — so the log disagreed with every other screen in the app.
function sessionTotals(sess) {
  let sets = 0;
  let kg = 0;
  for (const entry of Object.values(sess.exercises || {})) {
    for (const set of entry?.sets || []) {
      if (!isCountableWorkingSet(set)) continue;
      sets += 1;
      kg += (Number(set.weight) || 0) * (Number(set.reps) || 0);
    }
  }
  return { sets, kg };
}

export function renderHistory() {
  const root = $('#page-history');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, t('history_log')),
    h('div', { class: 'sub' }, state.history.length
      ? [h('span', { class: 'num' }, String(state.history.length)), ' ', t('history_sessions_word')]
      : t('history_no_sessions_logged')),
  ));

  // Bodyweight quick add
  const bwInput = h('input', {
    type: 'number', step: '0.1', inputmode: 'decimal',
    id: 'bw-input', class: 'num bw-input',
    placeholder: t('kg'), 'aria-label': t('bodyweight'),
  });
  const weighIns = state.bodyweight_log || [];
  const latest = weighIns[weighIns.length - 1];
  root.appendChild(h('div', { class: 'row' },
    h('div', { class: 'row-body' },
      h('div', { class: 'row-title' }, t('bodyweight')),
      latest ? h('div', { class: 'row-hint' },
        t('bodyweight_latest'), ' ',
        h('span', { class: 'num' }, fmtKgValue(latest.kg)), ' ', t('kg'), ' · ', fmtDateShort(latest.date),
      ) : null,
    ),
    h('div', { class: 'row-trail' },
      bwInput,
      h('button', { class: 'btn', onClick: () => {
        const v = parseFloat(bwInput.value);
        if (!recordBodyweight(v)) return;
        toastSaved(t('bodyweight_logged'));
        renderHistory();
      }}, t('bodyweight_log_action')),
    ),
  ));

  if (!state.history.length) {
    root.appendChild(h('div', { class: 'empty' }, t('no_sessions_yet')));
    return;
  }

  // One lookup table for the whole render. It used to scan (and rebuild) the
  // whole exercise catalogue once per exercise per session, which is what made
  // three years of history take seconds instead of milliseconds.
  const byId = new Map(getAllExercises().map((ex) => [ex.id, ex]));

  // Sort newest first. The delete path resolves its target with
  // state.history.indexOf(sess), never with this loop's index.
  const ordered = [...state.history].reverse();
  const totals = ordered.map(sessionTotals);
  const peak = Math.max(1, ...totals.map((one) => one.kg));

  let currentMonth = null;
  let monthBox = null;
  ordered.forEach((sess, idx) => {
    const when = new Date(sess.date);
    const key = monthKey(when);
    if (key !== currentMonth) {
      currentMonth = key;
      monthBox = h('div', { class: 'history-month' },
        h('div', { class: 'eyebrow' }, dateParts(when, { month: 'long', year: 'numeric' })),
      );
      root.appendChild(monthBox);
    }
    monthBox.appendChild(historyCard(sess, totals[idx], peak, byId));
  });
}

function historyCard(sess, total, peak, byId) {
  const card = h('div', { class: 'history-card' });
  const when = new Date(sess.date);
  const detail = h('div', { class: 'history-detail', hidden: true });
  let built = false;

  const bar = h('div', { class: 'history-bar' });
  // The one inline value the design system allows: a data ratio, not layout.
  bar.style.setProperty('--p', String(Math.min(1, total.kg / peak)));

  card.appendChild(h('div', {
    class: 'history-card-head',
    onClick: () => {
      if (!built) { built = true; buildDetail(detail, sess, byId); }
      detail.toggleAttribute('hidden');
    },
  },
    h('div', { class: 'date' },
      ...dateParts(when, { weekday: 'short' }), ' · ', ...dateParts(when, { day: 'numeric', month: 'long' }),
    ),
    h('div', { class: 'history-title' }, sessionTitle(sess)),
    h('h3', {},
      h('span', { class: 'num' }, String(total.sets)), ' ', t('exercise_sets'),
      ' · ',
      h('span', { class: 'num' }, fmtKgTotal(total.kg)), ' ', t('kg'),
    ),
    h('div', { class: 'summary' },
      // Was `ex.name.split(' ')[0]`, which fed a bare English word to the locale
      // resolver: «Chest Press Machine» became the muscle «الصدر» and «Lat
      // Pulldown» became the fragment «Lat». The Arabic name is the honest
      // short form; the full Latin name, isolated, is the fallback.
      Object.keys(sess.exercises || {}).slice(0, 5).map((ex_id) => {
        const ex = byId.get(ex_id);
        if (ex?.name_ar) return h('span', { class: 'ex-pill' }, ex.name_ar);
        return h('span', { class: 'ex-pill' }, h('bdi', { class: 'ltr-run' }, ex?.name || ex_id));
      }),
    ),
    bar,
  ));
  card.appendChild(detail);
  return card;
}

function buildDetail(detail, sess, byId) {
  Object.entries(sess.exercises || {}).forEach(([ex_id, exData]) => {
    const actualId = exData.swapped_to || ex_id;
    const ex = byId.get(actualId);
    // The per-exercise lines still list every completed set, invalid ones
    // included: this panel is the evidence of what happened, not the ledger.
    const ws = (exData.sets || []).filter((s) => !s.is_warmup && s.completed);
    if (!ws.length) return;
    // Was this session's PR set logged for this exercise?
    const sessionPR = (sess.prs || []).find((p) => p.exercise_id === actualId);
    const line = h('div', { class: 'line' }, h('strong', {}, ex?.name || ex_id), ': ');
    ws.forEach((s, i) => {
      const isPR = sessionPR
        && Math.abs(parseFloat(s.weight) - sessionPR.kg) < 0.01
        && parseInt(s.reps, 10) === sessionPR.reps;
      if (i) line.appendChild(document.createTextNode(' · '));
      line.appendChild(h('span', { class: 'num' }, `${s.weight}×${s.reps}`));
      const effort = EFFORT_LABEL[s.effort]?.();
      if (effort) line.appendChild(h('span', { class: 'muted' }, ' ' + effort));
      if (isPR) line.appendChild(h('span', { class: 'muscle-tag pr-mark' }, t('pr_mark')));
    });
    detail.appendChild(line);
  });

  const actions = h('div', { class: 'stack history-actions' });
  // Raed: "حط في إمكانية تعديل السجل... بس حذف الجلسة اللي تفرق".
  actions.appendChild(h('button', {
    class: 'btn full', 'data-reopen-session': 'true',
    onClick: async (event) => {
      event.stopPropagation();
      if (state.active_session) { toast(t('reopen_blocked')); return; }
      const yes = await confirmAction({
        title: t('reopen_session'),
        body: tf('reopen_session_body', { date: fmtDate(sess.date) }),
        confirmLabel: t('reopen_session'), danger: false,
      });
      if (!yes) return;
      if (reopenSession(sess)) { router('home'); render(); toast(t('session_reopened')); }
    },
  }, t('reopen_session')));

  actions.appendChild(h('button', {
    class: 'btn danger ghost full', 'data-delete-session': 'true',
    onClick: async (event) => {
      event.stopPropagation();
      const position = state.history.indexOf(sess);
      if (position < 0) return;
      // An in-app dialog, not confirm(): an installed PWA may suppress the
      // native one, and a delete that skips its own guard is the worst
      // possible thing to leave to the shell's discretion.
      const yes = await confirmAction({
        title: t('delete_session'),
        body: tf('delete_session_confirm', { date: fmtDate(sess.date) }),
        confirmLabel: t('delete_session'),
      });
      if (!yes) return;
      state.history.splice(position, 1);
      saveLocal();
      renderHistory();
      toast(t('session_deleted'));
    },
  }, t('delete_session')));
  detail.appendChild(actions);
}

export async function openRestoreModal() {
  const overlay = $('#modal-overlay');
  const m = $('#modal');
  m.innerHTML = '';
  m.appendChild(h('div', { class: 'xs-head' },
    h('h3', {}, t('restore_from_backup')),
    h('div', { class: 'xs-sub' }, t('restore_head_note')),
  ));
  const list = h('div', { class: 'revision-list' }, h('div', { class: 'tiny muted' }, t('loading_ellipsis')));
  m.appendChild(list);
  m.appendChild(h('div', { class: 'confirm-actions xs-done' },
    h('button', { class: 'btn ghost full', onClick: () => overlay.classList.remove('show') }, t('close')),
  ));
  overlay.classList.add('show');
  try {
    const rows = await syncFetch('/revisions?user=' + syncUserQuery(settings.user_id) + '&limit=30');
    list.innerHTML = '';
    rows.forEach(row => list.appendChild(h('button', {
      type: 'button',
      class: 'revision-row',
      onClick: () => {
        overlay.classList.remove('show');
        restoreRevision(row.rev).catch(e => toast(tf('restore_failed', { message: e.message || 'unknown' }), 3500));
      }
    },
      h('span', {}, fmtDate(row.server_at || row.updated_at)),
      h('span', { class: 'muted' },
        h('span', { class: 'num' }, String(row.sessions || 0)), ' ', t('sessions'),
        ' · ', t('revision_word'), ' ', h('span', { class: 'num' }, String(row.rev)),
      ),
    )));
    if (!rows.length) list.appendChild(h('div', { class: 'empty' }, t('no_revisions_yet')));
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(h('div', { class: 'tiny muted' }, t('could_not_load_revisions')));
  }
}
