/* Home, and the in-session runner it turns into. */

import { $, h, icon, isolate } from '../core/dom.js';
import {
  currentTrainingWeek,
  deloadActive,
  derivedCycle,
  derivedWeek,
  estimateSessionMinutes,
  getActiveProgramme,
  getNextPlannedSession,
  getStreak,
  getTodayPlannedSession,
  getWeeklyVolume,
  suggestNextWeight,
} from '../core/engine.js';
import {
  arabicMinutes,
  displaySuggestedWeight,
  fmtKgTotal,
  fmtTime,
  localISODate,
  muscleLabel,
  t,
  tf,
  todayISO,
} from '../core/i18n.js';
import {
  discardSession,
  endSession,
  focusExerciseIdx,
  sessionDoneDismissed,
  setFocusExerciseIdx,
  setSessionDoneDismissed,
  showSessionPreview,
} from '../core/session.js';
import { render, router } from '../core/shell.js';
import { profileProteinRange, saveLocal, settings, state } from '../core/store.js';
import { PLATFORM_INFO, getAllExercises, getCurrentPlaylists } from '../core/videos.js';
import { isCountableWorkingSet, isRunnerExerciseResolved } from '../domain/runner-session.js';
import { renderExerciseCard } from '../ui/exercise-card.js';
import { renderWarmupPhase } from '../ui/warmup.js';

export function renderHome() {
  const root = $('#page-home');
  root.innerHTML = '';
  const planned = getTodayPlannedSession();
  const next = getNextPlannedSession();
  const streak = getStreak();
  const vol = getWeeklyVolume();
  const week = currentTrainingWeek();
  // A rest day is one where the week's training days are already done AND he has
  // not started anything today. Not a weekday lookup — the rotation never was.
  const restDayToday = week.remaining === 0 && !(state.history || [])
    .some((entry) => String(entry?.date || '').slice(0, 10) === todayISO());
  const dow = ['weekday_sunday','weekday_monday','weekday_tuesday','weekday_wednesday','weekday_thursday','weekday_friday','weekday_saturday'][new Date().getDay()];

  // Header — structured (accent carries state via the progress meter / top rule)
  if (state.active_session) {
    const a = state.active_session;
    const parts = a.session_name.split(' — ');
    // One centred line while a session runs.
    root.appendChild(h('div', { class: 'today-banner active running-line', 'data-home-overview': 'true' },
      h('span', { class: 'rl-name' }, parts[0]),
      h('span', { class: 'rl-dot' }, '·'),
      h('span', { class: 'rl-since' }, tf('runner_active_started', { time: fmtTime(a.started_at) })),
    ));
  } else if (planned && restDayToday) {
    // He asked for "today training / tomorrow rest, at a glance, before I
    // leave the house" four separate times and never got it.
    const parts = planned.name.split(' — ');
    root.appendChild(h('div', { class: 'today-banner rest hero', 'data-home-overview': 'true' },
      h('div', { class: 'tb-main' },
        h('div', { class: 'tb-kicker' }, isolate(t(dow)), ' · ', t('rest_day_plain')),
        // The kicker already says «يوم راحة»; the heading says what it is FOR.
        h('h2', {}, t('rest_day_earned')),
        // t() the name BEFORE interpolating. Passing it raw puts "Upper A"
        // inside the template, and the combined string matches no locale key
        // — so the line renders half-English.
        h('p', {}, tf('rest_next_up', { name: t(parts[0]) })),
        h('div', { class: 'tb-meta' }, tf('rest_week_done', { n: week.done, target: week.target })),
        h('div', { class: 'tb-clock' }, tf('programme_hint', { week: derivedWeek(), cycle: derivedCycle() })),
      ),
      // A rest day is the ring's best moment — it is the only day it is full.
      progressRing(week.done, week.target, t('this_week_plain')),
    ));
  } else if (planned) {
    const parts = planned.name.split(' — ');
    root.appendChild(h('div', { class: 'today-banner hero', 'data-home-overview': 'true' },
      h('div', { class: 'tb-main' },
        h('div', { class: 'tb-kicker' }, isolate(t(dow)), ' · ', t('gym_day_plain')),
        h('h2', {}, parts[0]),
        // No subtitle when the name has no " — " half. The fallback was the FULL
        // name, so a session called just «سفلي أ» printed its own title twice.
        parts[1] ? h('p', {}, parts[1]) : null,
        h('div', { class: 'tb-meta' }, tf('home_exercise_count', { n: planned.exercises.length }), ' · ',
          // «~» is neutral, so it took its direction from the Arabic around it and
          // landed AFTER the number: «65 ~ دقيقة». Isolated, it stays a prefix.
          isolate('~', tf('home_minutes', { n: estimateSessionMinutes(planned) }))),
        // Where he is in the programme, on the screen he opens — until now this
        // existed only inside Settings, and it is the fact that shows the
        // 12-month progression is actually moving on its own.
        h('div', { class: 'tb-clock' }, tf('programme_hint', { week: derivedWeek(), cycle: derivedCycle() })),
        // A deload week has fewer sets and a lower target effort. Unannounced,
        // that reads as the app losing his programme rather than following it.
        deloadActive() ? h('div', { class: 'tb-deload', 'data-deload-running': 'true' }, t('deload_running')) : null,
      ),
      progressRing(week.done, week.target, t('this_week_plain')),
    ));
  } else {
    // data-home-overview marks "home drew its banner", not "a session is
    // running", so it belongs on all three branches.
    root.appendChild(h('div', { class: 'today-banner rest', 'data-home-overview': 'true' },
      h('div', { class: 'tb-kicker' }, t('rest_day_plain')),
      h('h2', {}, tf('home_rest_next', { name: next.session.name.split(' — ')[0] })),
      h('p', {}, tf('home_rest_rotation', { day: next.session.day || next.session.name })),
      h('div', { class: 'tb-meta' }, tf('home_rest_recover', { protein: profileProteinRange() })),
    ));
  }

  // Everything from here to the music card is pre-workout context. During a
  // running session .home-context orders it BELOW the exercise: the first set row
  // sat at y=952 on an 844px screen, so logging an opening set began with a scroll.
  const context = h('div', { class: 'home-context', 'data-home-context': 'true' });
  root.appendChild(context);

  // Order matters more than any of the styling below it. The one button he
  // came to this screen to press was at y=462 on an 844px phone, under a week
  // strip and three stat tiles — 482px of context ahead of the action.
  const belowAction = h('div', { class: 'home-below' });

  // A stat tile's number, sized so it can never leave the tile.
  const statNum = (text) => {
    const digits = (String(text).match(/\d/g) || []).length;
    const size = digits >= 7 ? ' s7' : digits >= 6 ? ' s6' : digits >= 5 ? ' s5' : '';
    const zero = /^0(\.0+)?$/.test(String(text).replace(/[,\s]/g, '')) ? ' zero' : '';
    return h('div', { class: 'stat-num' + size + zero, 'data-digits': String(digits) }, String(text));
  };

  belowAction.appendChild(buildWeekStrip());

  belowAction.appendChild(h('div', { class: 'stat-row', 'data-home-stat-tiles': 'true' },
    h('div', { class: 'stat-tile' },
      statNum(String(streak)),
      h('div', { class: 'stat-cap' }, t('home_streak')),
      h('div', { class: 'stat-sub' }, t('sessions_4wk')),
    ),
    h('div', { class: 'stat-tile' },
      statNum(String(vol.totalSets)),
      h('div', { class: 'stat-cap' }, t('this_week_plain')),
      h('div', { class: 'stat-sub' }, t('working_sets')),
    ),
    // Tonnage is the one tile whose number keeps growing.
    h('div', { class: 'stat-tile' },
      statNum(fmtKgTotal(vol.totalKg)),
      h('div', { class: 'stat-cap' }, t('home_tonnage')),
      h('div', { class: 'stat-sub' }, t('kg_this_week')),
    ),
  ));

  const shownSession = planned || next.session;
  const shortSessionName = (session) => t(session.name.split(' — ')[0]);

  // Action button
  if (state.active_session) {
    context.appendChild(h('button', { class: 'btn primary full', 'data-home-continue': 'true', onClick: () => router('home') },
      t('continue_session')
    ));
    // عرض التمارين retired — the plan is already listed on this page.

  } else if (planned) {
    context.appendChild(h('button', { class: 'btn primary full', 'data-home-view-exercises': 'true', onClick: () => showSessionPreview(planned) },
      '▶ ', tf('start_session_named', { session: shortSessionName(planned) })
    ));
  } else {
    context.appendChild(h('button', { class: 'btn primary full', 'data-home-view-exercises': 'true', onClick: () => showSessionPreview(next.session) },
      '▶ ', tf('start_session_named', { session: shortSessionName(next.session) })
    ));
  }
  if (!state.active_session && shownSession) {
    // Back to exactly what it was. I replaced it with a <select> and he looked
    // at it and said "رجّع لنفس مكان القديم" — same call he made on the banner,
    // and the same answer: his screen, his decision.
    let chooserOpen = false;
    const sessions = getActiveProgramme().sessions.filter(s => s.id !== shownSession.id);
    if (sessions.length) {
      const row = h('div', { class: 'alt-row session-chooser-row' },
        sessions.map(s => h('button', {
          type: 'button',
          class: 'chip',
          onClick: () => showSessionPreview(s),
        }, shortSessionName(s)))
      );
      const toggle = h('button', {
        type: 'button',
        class: 'btn tiny ghost session-chooser-toggle',
        onClick: () => {
          chooserOpen = !chooserOpen;
          row.classList.toggle('open', chooserOpen);
          toggle.textContent = chooserOpen ? 'Choose a different session ▴' : 'Choose a different session ▾';
        },
      }, 'Choose a different session ▾');
      context.appendChild(h('div', { class: 'session-chooser' }, toggle, row));
    }
  }

  // Week strip + stat tiles, now that the action is above them.
  context.appendChild(belowAction);

  // This is deliberately the v15 block rather than a new music treatment.
  // Raed explicitly approved its glyph, wording, card and playlist chips.
  const activeSession = state.active_session;
  const activeProgrammeSession = activeSession
    ? getActiveProgramme().sessions.find((item) => item.id === activeSession.session_id)
    : null;
  const sessionForMusic = activeProgrammeSession || shownSession;
  const platformPlaylists = getCurrentPlaylists(sessionForMusic);
  if (platformPlaylists.length) {
    // One row, not a card. It is two links to a playlist — useful, and not
    // worth 84px of a card with its own border, shadow and heading above the
    // thing he actually came to the screen for.
    context.appendChild(h('div', { class: 'home-v15-spotify', 'data-home-v15-spotify': 'true' },
      // Name the platform he actually chose.
      h('span', { class: 'tiny muted', 'data-home-spotify-handoff': 'true' },
        icon('music', 14),
        h('span', {}, tf('home_music_handoff', {
          platform: PLATFORM_INFO[settings.music_platform || 'spotify']?.label || '',
        }))),
      h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' },
        platformPlaylists.map((playlist) => h('a', {
          href: playlist.url, target: '_blank', rel: 'noopener', class: 'btn tiny', title: playlist.vibe,
          // No isolate() here: getCurrentPlaylists already returns the label as a
          // <bdi class="ltr-run">, so wrapping again produced nested <bdi><bdi>.
        }, playlist.label)),
      ),
    ));
  }

  // The Phase 6 block that used to sit here short-circuited with `return`, so
  // v15's real session view below — warm-up phase, focus mode, Prev/Next, the
  // exercise cards, the terminal controls — never ran.

  // Active session detail
  if (state.active_session) {
    root.appendChild(h('div', { class: 'spacer-24' }));
    const a = state.active_session;
    // Active sessions created before Phase 2 remain usable instead of being
    // retroactively blocked by a phase they never received.
    if (!a.warmup) {
      a.phase = 'lifting';
    }
    if (a.phase === 'warmup' && a.warmup) {
      root.appendChild(renderWarmupPhase(a));
      root.appendChild(h('button', { class: 'btn danger ghost full', 'data-discard-session': 'true', onClick: () => discardSession() }, t('discard_session')));
      return;
    }

    const exEntries = Object.entries(a.exercises);
    // This is v15's single-exercise session flow, not an optional setting.
    if (exEntries.length) {
      // Find the next non-complete exercise
      const findNextIdx = () => exEntries.findIndex(([, exercise]) => !isRunnerExerciseResolved(exercise));
      let curIdx = focusExerciseIdx;
      if (curIdx == null || curIdx >= exEntries.length) {
        const ni = findNextIdx();
        curIdx = ni >= 0 ? ni : 0;
      }
      setFocusExerciseIdx(curIdx);

      const total = exEntries.length;

      // Every exercise resolved — done or skipped. Raed: "إذا انتهى التمرين
      // ما تطلع الصفحة اللي فوق الكبيرة".
      if (!sessionDoneDismissed && exEntries.every(([, entry]) => isRunnerExerciseResolved(entry))) {
        root.appendChild(buildSessionDonePanel(a, exEntries));
        root.appendChild(h('div', { class: 'card', style: 'margin-top:16px;' },
          h('button', { class: 'btn primary full', 'data-finish-session': 'true', onClick: endSession }, t('finish_and_save_session')),
          h('div', { class: 'spacer-12' }),
          h('button', { class: 'btn ghost full', onClick: () => { setFocusExerciseIdx(0); setSessionDoneDismissed(true); render(); } }, t('review_exercises')),
        ));
        return;
      }

      // Progress. Raed called the old one bad and he was right: seven
      // identical 6px bars, where the only cue was which one carried the
      // accent.
      const doneCount = exEntries.filter(([, ex]) => isRunnerExerciseResolved(ex)).length;
      root.appendChild(h('div', { class: 'sess-progress', 'data-v15-session-progress': 'true' },
        h('div', { class: 'sp-track' },
          exEntries.map(([id, ex], i) => h('button', {
            type: 'button',
            class: 'sp-seg' + (isRunnerExerciseResolved(ex) ? ' done' : '') + (i === curIdx ? ' current' : ''),
            'aria-label': `${i + 1} / ${total}`,
            'aria-current': i === curIdx ? 'true' : undefined,
            onClick: () => { setFocusExerciseIdx(i); render(); },
          }))
        ),
        h('div', { class: 'sp-count' },
          h('bdi', { class: 'ltr-run' }, `${doneCount}/${exEntries.length}`)),
      ));

      // Render only the current exercise, expanded
      const [curId, curEx] = exEntries[curIdx];
      const card = renderExerciseCard(curId, curEx);
      card.classList.add('expanded');
      root.appendChild(card);

      // Horizontal swipe between exercises. It existed only in the retired runner,
      // so reviving v15's view had silently dropped it. RTL: swiping left moves
      // forward, matching the on-screen arrows.
      let swipeFrom = null;
      // A horizontal swipe that STARTS on the header also fires the header's
      // tap-to-collapse, so the card folded shut while it advanced. Recording
      // the gesture lets the header ignore the click that follows it.
      let swipeJustHappened = false;
      card.addEventListener('pointerdown', (e) => { swipeFrom = { x: e.clientX, y: e.clientY }; });
      card.addEventListener('click', (e) => {
        if (!swipeJustHappened) return;
        swipeJustHappened = false;
        e.stopPropagation();
        e.preventDefault();
      }, true);
      card.addEventListener('pointercancel', () => { swipeFrom = null; });
      card.addEventListener('pointerup', (e) => {
        if (!swipeFrom) return;
        const dx = e.clientX - swipeFrom.x;
        const dy = e.clientY - swipeFrom.y;
        swipeFrom = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        // The guard protects real tap targets from being hijacked by a drag —
        // but the settings gear sits in the middle of the header, exactly
        // where a swipe across the card ends.
        if (e.target.closest('input, textarea, a, button:not(.ex-settings-btn)')) return;
        swipeJustHappened = true;
        const step = dx < 0 ? 1 : -1;
        const nextIdx = Math.min(total - 1, Math.max(0, curIdx + step));
        if (nextIdx === curIdx) return;
        setFocusExerciseIdx(nextIdx);
        render();
      });

      // Prev / Next nav. Classed rather than inline-styled so the touch-target
      // floor in styles.css can reach it — as an anonymous <div> these two were
      // the only 40px controls left on the busiest screen in the app.
      root.appendChild(h('div', { class: 'runner-nav' },
        // On the FIRST exercise, "previous" means the warm-up — there is nothing
        // else behind it, and it used to be a button that did nothing. Raed:
        // "أبغى لما أضغط السابق يرجع للإحماء".
        h('button', {
          class: 'btn', style: 'flex:1;', 'data-runner-prev': 'true',
          onClick: () => {
            if (curIdx === 0) {
              const warm = state.active_session?.warmup;
              if (warm) {
                // Re-open the warm-up phase without erasing what he logged:
                // completed_at is what marks it finished.
                warm.completed_at = null;
                warm.skipped = false;
                state.active_session.phase = 'warmup';
                saveLocal(); render();
                return;
              }
            }
            setFocusExerciseIdx(Math.max(0, curIdx - 1));
            render();
          },
        }, curIdx === 0 ? t('back_to_warmup') : t('previous')),
        curIdx < total - 1
          ? h('button', { class: 'btn primary', style: 'flex:2;', onClick: () => { setFocusExerciseIdx(curIdx + 1); render(); } }, t('next_exercise_arrow'))
          : h('button', { class: 'btn primary', style: 'flex:2;', onClick: endSession }, t('end_session')),
      ));
    }

    // "Finish & save" belongs on the LAST exercise only.
    const onLastExercise = (() => {
      const entries = Object.entries(state.active_session?.exercises || {});
      if (!entries.length) return true;
      const idx = Math.min(Math.max(focusExerciseIdx ?? 0, 0), entries.length - 1);
      return idx >= entries.length - 1;
    })();
    // Raed: «رجّع زر تجاهل الجلسة» — abandoning a session is decided in the middle
    // of one, so it stays on every exercise. It names the SESSION rather than
    // reading as «skip this exercise», and confirms in-app.
    root.appendChild(h('div', { class: 'card session-close', style: 'margin-top:16px;' },
      onLastExercise
        ? h('button', { class: 'btn primary full', 'data-finish-session': 'true', onClick: endSession }, t('finish_and_save_session'))
        : null,
      h('button', {
        class: 'btn tiny ghost session-discard', 'data-discard-session': 'true',
        onClick: () => discardSession(),
      }, t('discard_session')),
    ));
  } else {
    // Show today's planned exercises preview
    const sess = planned || next.session;
    // No spacer here: .section-label already carries its own margin, so a 24px
    // block on top of it made a 46px hole — two rules doing one job.
    root.appendChild(h('h3', { class: 'section-label' }, planned ? 'Session plan' : 'Next session preview'));
    sess.exercises.forEach((p, i) => {
      const ex = getAllExercises().find(e => e.id === p.exercise_id);
      const sug = suggestNextWeight(p.exercise_id, p);
      const bodyUrl = (ex && RW.bodyImg) ? RW.bodyImg(ex.primary) : '';
      root.appendChild(h('div', { class: 'ex plan-row' },
        h('div', { class: 'ex-head' },
          h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
          h('div', { class: 'ex-info' },
            // The number belongs to the English exercise name, so the two are
            // one isolated LTR run rather than a bare template string — and
            // the row reads left-to-right like the name it carries.
            h('h4', {}, h('bdi', { class: 'ltr-run' }, `${i+1}. ${ex?.name || p.exercise_id}`)),
            h('div', { class: 'meta' },
              h('span', { class: 'muscle-tag' }, muscleLabel(ex?.primary?.[0])),
              ` ${p.sets} × ${p.reps} · `,
              h('strong', { 'data-suggested-weight': 'true' }, displaySuggestedWeight(sug.weight)),
            ),
          ),
        ),
      ));
    });
  }
}

// ---- Home-only pieces (moved out of ui/kit.js so one screen owns them) ----
export function progressRing(done, target, caption) {
  const NS = 'http://www.w3.org/2000/svg';
  const R = 26, C = 2 * Math.PI * R;
  const filled = target > 0 ? Math.min(1, Math.max(0, done / target)) : 0;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ring-svg');
  const circle = (cls, dash) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '32'); c.setAttribute('cy', '32'); c.setAttribute('r', String(R));
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '5.5');
    c.setAttribute('stroke-linecap', 'round');
    c.classList.add(cls);
    if (dash) { c.setAttribute('stroke-dasharray', dash); c.setAttribute('transform', 'rotate(-90 32 32)'); }
    return c;
  };
  svg.appendChild(circle('ring-track'));
  // A zero-length arc still paints a round cap — a dot on an empty ring reads as
  // "one done". Draw the arc only when there is something to draw.
  if (filled > 0) svg.appendChild(circle('ring-arc', `${(C * filled).toFixed(2)} ${C.toFixed(2)}`));
  return h('div', { class: 'hero-ring' },
    svg,
    // «0/4» is a fraction, and a fraction is LTR in Arabic too. Laid out by the
    // page's RTL it printed «4/0» — a different number.
    h('div', { class: 'ring-face', dir: 'ltr' },
      h('span', { class: 'ring-num' + (done > 0 ? '' : ' zero') }, String(done)),
      h('span', { class: 'ring-of' }, `/${target}`),
    ),
    caption ? h('div', { class: 'ring-cap' }, caption) : null,
  );
}

export function buildSessionDonePanel(active, entries) {
  const started = new Date(active.started_at);
  const minutes = Math.max(1, Math.round((Date.now() - started.getTime()) / 60000));
  let sets = 0;
  let volume = 0;
  let skipped = 0;
  for (const [, entry] of entries) {
    for (const set of entry.sets || []) {
      if (set.skipped) { skipped += 1; continue; }
      if (!isCountableWorkingSet(set)) continue;
      sets += 1;
      volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
    }
  }
  return h('section', { class: 'card session-done', 'data-session-done': 'true' },
    h('h2', {}, t('session_done_title')),
    h('p', { class: 'session-done-time' }, arabicMinutes(minutes)),
    h('div', { class: 'session-done-stats tiny muted' },
      tf('session_done_sets', { n: sets }),
      ' · ',
      tf('session_done_volume', { kg: fmtKgTotal(volume) }),
      skipped ? h('span', {}, ' · ', tf('session_done_skipped', { n: skipped })) : null,
    ),
  );
}

export function buildWeekStrip() {
  const DAY_KEYS = ['weekday_sunday','weekday_monday','weekday_tuesday','weekday_wednesday','weekday_thursday','weekday_friday','weekday_saturday'];
  const today = new Date();
  // Week starts Saturday, as it does in Saudi.
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 1) % 7));
  // Same bug as todayISO had: this function had already worked out the local
  // Saturday boundary and then converted back through UTC, undoing it.
  const iso = (date) => localISODate(date);

  const trainedOn = new Map();
  for (const entry of state.history || []) {
    if (!entry?.date) continue;
    trainedOn.set(String(entry.date).slice(0, 10), entry.session_name || entry.session_id || '');
  }

  const strip = h('div', { class: 'week-strip', 'data-week-strip': 'true' });
  let doneThisWeek = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const key = iso(day);
    const trained = trainedOn.get(key);
    const isToday = key === iso(today);
    const isFuture = day > today && !isToday;
    if (trained) doneThisWeek += 1;
    strip.appendChild(h('div', {
      class: 'week-day' + (trained ? ' trained' : '') + (isToday ? ' today' : '') + (isFuture ? ' future' : ''),
      'data-week-day': key,
      title: trained || '',
    },
      h('span', { class: 'wd-name' }, t(DAY_KEYS[day.getDay()])),
      h('span', { class: 'wd-mark' }, trained ? '●' : (isFuture ? '' : '·')),
    ));
  }

  const planned = getTodayPlannedSession();
  const trainedToday = trainedOn.has(iso(today));
  const remaining = Math.max(0, 4 - doneThisWeek);
  return h('section', { class: 'card compact week-card', 'data-week-card': 'true' },
    h('div', { class: 'tiny muted', style: 'margin-bottom:6px;' },
      trainedToday
        ? t('week_trained_today')
        // Localise the session name BEFORE interpolating. Passing it raw put
        // "Lower A" inside the template, and the combined string matches no
        // locale key, so the whole line rendered half-English.
        : tf('week_today_is', { name: t((planned?.name || '').split(' — ')[0]) })),
    strip,
    h('div', { class: 'tiny muted', style: 'margin-top:6px;' },
      remaining ? tf('week_remaining', { n: remaining }) : t('week_target_met')),
  );
}
