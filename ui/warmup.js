/* The warm-up phase of a running session. */

import { h, isolate } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { generalWarmupComplete } from '../core/session.js';
import { render } from '../core/shell.js';
import { saveLocal } from '../core/store.js';
import { ytIdFromUrl } from '../core/videos.js';
import { buildVideoTile } from '../ui/kit.js';

export function renderWarmupPhase(activeSession) {
  const warmup = activeSession.warmup;
  // Three lines of preamble used to sit above the first thing he does. Raed:
  // «أول شيل هذا على طول... ما لها سنة» — the screen only ever has two steps,
  // both numbered and named.
  const phase = h('div', { class: 'warmup-phase' });
  const treadmillDone = warmup.treadmill_done;
  phase.appendChild(h('div', { class: 'warmup-step' },
    h('strong', {}, t('treadmill_walk')),
    h('div', { class: 'tiny muted' }, t('choose_treadmill')),
    // A segmented control, not three outlined buttons: this is one choice from
    // three, which is exactly what the kit's .seg says.
    h('div', { class: 'warmup-minute-picker seg full' }, [5, 7, 10].map((minutes) => h('button', {
      type: 'button',
      class: 'seg-btn' + (warmup.treadmill_minutes === minutes ? ' active' : ''),
      'aria-pressed': warmup.treadmill_minutes === minutes ? 'true' : 'false',
      onClick: () => { warmup.treadmill_minutes = minutes; warmup.treadmill_done = true; saveLocal(); render(); },
    }, h('span', { class: 'num' }, String(minutes)), ' ', t('minutes'))))
  ));
  // Each drill carries ITS OWN clip, on its own row. They used to be
  // collected into one "warm-up clips" strip underneath, which is what Raed
  // objected to: "المفروض تكون لكل تمرين مقطع خاص...
  phase.appendChild(h('div', { class: 'warmup-step' },
    h('strong', {}, t('drills')),
    h('div', { class: 'tiny muted' }, t('ten_reps_each')),
    h('div', { class: 'warmup-drill-list' }, warmup.drills.map((drill) => {
      // Tick first, at the start edge: it is the thing he taps, and it used to
      // sit at the far end behind the name and the rep count.
      const tick = h('button', {
        type: 'button',
        class: 'warmup-drill' + (drill.completed ? ' done' : ''),
        disabled: !treadmillDone,
        'aria-pressed': drill.completed ? 'true' : 'false',
        onClick: () => { drill.completed = !drill.completed; saveLocal(); render(); },
      },
        h('span', { class: 'drill-tick' }, drill.completed ? '✓' : '○'),
        h('span', { class: 'drill-name' }, isolate(drill.movement)),
        h('span', { class: 'drill-reps num' }, String(drill.reps)));
      const clips = (drill.videos || []);
      if (!clips.length) return h('div', { class: 'warmup-drill-row' }, tick);
      return h('div', { class: 'warmup-drill-row' }, tick,
        clips.map((url, i) => buildVideoTile({
          key: drill.id + '_' + i,
          id: ytIdFromUrl(url),
          url,
          // No label chip: the clip now sits ON the movement it belongs to, so
          // a number identifying it would be naming something already named.
          label: '',
          title: drill.movement,
        }, { className: 'drill-clip' })));
    })),
  ));
  const complete = generalWarmupComplete(warmup);
  phase.appendChild(h('button', {
    class: 'btn primary full', disabled: !complete,
    onClick: () => { warmup.completed_at = new Date().toISOString(); activeSession.phase = 'lifting'; saveLocal(); render(); },
  }, complete ? t('warmup_start_ramps') + ' →' : t('warmup_finish_drills')));
  // Skipping must always be possible — the treadmill is often taken. It is
  // recorded, never silently dropped: `21` §3 says a gap is information about
  // his life, not a bug in the log.
  phase.appendChild(h('button', {
    class: 'btn ghost full', 'data-warmup-skip': 'true',
    onClick: () => {
      warmup.skipped = true;
      warmup.completed_at = new Date().toISOString();
      activeSession.phase = 'lifting';
      saveLocal(); render();
    },
  }, t('runner_skip_warmup')));
  return phase;
}
