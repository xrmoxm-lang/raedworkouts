/* The history log and the restore-from-backup sheet. */

import { $, confirmAction, h, toast, toastSaved } from '../core/dom.js';
import { recordBodyweight } from '../core/engine.js';
import { fmtDate, fmtKgTotal, t, tf } from '../core/i18n.js';
import { reopenSession } from '../core/session.js';
import { render, router } from '../core/shell.js';
import { saveLocal, settings, state } from '../core/store.js';
import { restoreRevision, syncFetch, syncUserQuery } from '../core/sync.js';
import { getAllExercises } from '../core/videos.js';

export function renderHistory() {
  const root = $('#page-history');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, 'History'),
    h('div', { class: 'sub' }, state.history.length
      ? tf('history_sessions_logged', { n: state.history.length })
      : t('history_no_sessions_logged')),
  ));

  // Bodyweight quick add
  root.appendChild(h('div', { class: 'card' },
    h('h3', {}, 'Bodyweight'),
    h('div', { class: 'card-row' },
      h('input', {
        type: 'number', step: '0.1', placeholder: 'kg', class: 'search-input', id: 'bw-input',
        style: 'min-height:36px;'
      }),
      h('button', { class: 'btn primary', onClick: () => {
        const v = parseFloat($('#bw-input').value);
        if (!recordBodyweight(v)) return;
        toastSaved('Bodyweight logged.');
        renderHistory();
      }}, 'Log'),
    ),
    state.bodyweight_log.length ? h('div', { class: 'tiny muted', style: 'margin-top:8px;' },
      'Latest: ' + state.bodyweight_log[state.bodyweight_log.length-1].kg + ' kg on ' + fmtDate(state.bodyweight_log[state.bodyweight_log.length-1].date)
    ) : null,
  ));

  if (!state.history.length) {
    root.appendChild(h('div', { class: 'empty' },
      h('div', { class: 'big' }, '📭'),
      h('div', {}, 'No sessions yet. Start your first one from Home.'),
    ));
    return;
  }

  // Sort newest first
  [...state.history].reverse().forEach((sess, idx) => {
    const totalSets = Object.values(sess.exercises).reduce((s,ex) => s + ex.sets.filter(set => !set.is_warmup && set.completed).length, 0);
    const totalKg = Object.values(sess.exercises).reduce((s, ex) => s + ex.sets.filter(set => !set.is_warmup && set.completed).reduce((ss, set) => ss + (Number(set.weight)||0) * (Number(set.reps)||0), 0), 0);
    const card = h('div', { class: 'card history-card' });
    const expanded = h('div', { style: 'display:none; margin-top:10px; border-top:1px solid var(--border); padding-top:10px;' });
    Object.entries(sess.exercises).forEach(([ex_id, exData]) => {
      const actualId = exData.swapped_to || ex_id;
      const ex = getAllExercises().find(e => e.id === actualId);
      const ws = exData.sets.filter(s => !s.is_warmup && s.completed);
      if (!ws.length) return;
      // Was this session's PR set logged for this exercise?
      const sessionPR = (sess.prs || []).find(p => p.exercise_id === actualId);
      const row = h('div', { style: 'margin:6px 0; font-size:13px;' },
        h('strong', {}, (ex?.name || ex_id) + ': '),
        ws.map(s => {
          const isPR = sessionPR && Math.abs(parseFloat(s.weight) - sessionPR.kg) < 0.01 && parseInt(s.reps,10) === sessionPR.reps;
          const effort = s.effort ? ` · ${String(s.effort).replace('_', ' ')}` : '';
          return `${s.weight}×${s.reps}${effort}${isPR ? ' 🏆' : ''}`;
        }).join(', '),
      );
      expanded.appendChild(row);
    });
    const fallbackSessionName = ({ session_a: 'Session A', session_b: 'Session B', ppl_push: 'Push', ppl_pull: 'Pull', ppl_legs: 'Legs' })[sess.session_id] || sess.session_id;
    card.appendChild(h('div', { onClick: () => { expanded.style.display = expanded.style.display === 'none' ? 'block' : 'none'; } },
      h('div', { class: 'date' }, fmtDate(sess.date) + ' · ' + (sess.session_name || fallbackSessionName)),
      h('h3', { style: 'margin:4px 0;' }, tf('history_total', {
        sets: totalSets,
        kg: fmtKgTotal(totalKg),
      })),
      h('div', { class: 'summary' },
        Object.keys(sess.exercises).slice(0, 5).map(ex_id => {
          const ex = getAllExercises().find(e => e.id === ex_id);
          return h('span', { class: 'ex-pill' }, ex?.name?.split(' ')[0] || ex_id);
        }),
      ),
    ));
    // Delete a logged session. Raed: "حط في إمكانية تعديل السجل... بس حذف
    // الجلسة اللي تفرق". It lives INSIDE the expanded panel, not on the collapsed
    // card, so removing a session is two deliberate taps and never a mis-tap
    // while scrolling the list.
    //
    // `sess` is the same object as the one in state.history — the reverse() above
    // copies the array, not its entries — so indexOf finds the real position.
    // Deleting by the loop's index would delete from the wrong end of the list.
    // Re-open. Raed: "المفروض السجل أضغط التعديل يفتح لي الجلسة من جديد" — a
    // session finished by mistake has to be recoverable after the undo toast is
    // gone, which is when he usually notices.
    expanded.appendChild(h('button', {
      class: 'btn full', 'data-reopen-session': 'true', style: 'margin-top:14px;',
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

    expanded.appendChild(h('button', {
      class: 'btn danger ghost full', 'data-delete-session': 'true',
      style: 'margin-top:10px;',
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
    card.appendChild(expanded);
    root.appendChild(card);
  });
}

export async function openRestoreModal() {
  const overlay = $('#modal-overlay');
  const m = $('#modal');
  m.innerHTML = '';
  m.appendChild(h('h3', {}, 'Restore from backup'));
  m.appendChild(h('p', { class: 'muted' }, 'Restoring creates a new head. Older revisions stay on the server.'));
  const list = h('div', { class: 'revision-list' }, h('div', { class: 'tiny muted' }, t('loading_ellipsis')));
  m.appendChild(list);
  m.appendChild(h('button', { class: 'btn ghost full', style: 'margin-top:12px;', onClick: () => overlay.classList.remove('show') }, t('close')));
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
      h('span', { class: 'muted' }, `${row.sessions || 0} sessions · rev ${row.rev}`)
    )));
    if (!rows.length) list.appendChild(h('div', { class: 'empty' }, 'No revisions yet.'));
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(h('div', { class: 'tiny muted' }, 'Could not load revisions.'));
  }
}
