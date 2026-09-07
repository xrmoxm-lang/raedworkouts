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
  // Three lines of preamble used to sit above the first thing he does: an
  // eyebrow («المرحلة الأولى · الإحماء»), a heading repeating it with a time
  // cap, and a sentence describing the two steps that are listed immediately
  // below in full. Raed: "أول شيل هذا على طول... ما لها سنة". He is right —
  // the screen only ever has two steps, both numbered and named, and nothing
  // above them said anything the steps did not.
  const card = h('div', { class: 'card warmup-phase' });
  const treadmillDone = warmup.treadmill_done;
  card.appendChild(h('div', { class: 'warmup-step' },
    h('div', {}, h('strong', {}, t('treadmill_walk')), h('div', { class: 'tiny muted' }, t('choose_treadmill'))),
    h('div', { class: 'warmup-minute-picker' }, [5, 7, 10].map((minutes) => h('button', {
      class: 'btn tiny' + (warmup.treadmill_minutes === minutes ? ' primary' : ''),
      onClick: () => { warmup.treadmill_minutes = minutes; warmup.treadmill_done = true; saveLocal(); render(); },
    }, h('bdi', { class: 'ltr-run' }, String(minutes)), ' ', t('minutes'))))
  ));
  // Each drill carries ITS OWN clip, on its own row. They used to be collected
  // into one "warm-up clips" strip underneath, which is what Raed objected to:
  // "المفروض تكون لكل تمرين مقطع خاص... حاطني إنت كل المقاطع سوا". The strip
  // existed because the row is a tick button and a link cannot live inside a
  // button — tapping to watch would also have marked the drill done. The answer
  // is not to move the clip away from its drill; it is to give the row two
  // targets: the tick, and the thumbnail beside it.
  card.appendChild(h('div', { class: 'warmup-step' },
    h('div', {}, h('strong', {}, t('drills')), h('div', { class: 'tiny muted' }, t('ten_reps_each'))),
    h('div', { class: 'warmup-drill-list' }, warmup.drills.map((drill) => {
      const tick = h('button', {
        class: 'warmup-drill' + (drill.completed ? ' done' : ''),
        disabled: !treadmillDone,
        onClick: () => { drill.completed = !drill.completed; saveLocal(); render(); },
      },
        h('span', { class: 'drill-name' }, isolate(drill.movement)),
        h('span', { class: 'drill-reps' }, h('bdi', { class: 'ltr-run' }, String(drill.reps))),
        h('span', { class: 'drill-tick' }, drill.completed ? '✓' : '○'));
      const clips = (drill.videos || []);
      if (!clips.length) return h('div', { class: 'warmup-drill-row' }, tick);
      return h('div', { class: 'warmup-drill-row' }, tick,
        h('div', { class: 'warmup-drill-clips' }, clips.map((url, i) => buildVideoTile({
          key: drill.id + '_' + i,
          id: ytIdFromUrl(url),
          url,
          // No label chip: the clip now sits ON the movement it belongs to, so
          // a number identifying it would be naming something already named.
          label: '',
          title: drill.movement,
        }, { className: 'drill-clip' }))));
    })),
  ));
  const complete = generalWarmupComplete(warmup);
  card.appendChild(h('button', {
    class: 'btn primary full', disabled: !complete,
    onClick: () => { warmup.completed_at = new Date().toISOString(); activeSession.phase = 'lifting'; saveLocal(); render(); },
  }, complete ? t('warmup_start_ramps') + ' →' : t('warmup_finish_drills')));
  // Skipping must always be possible — the treadmill is often taken. It is
  // recorded, never silently dropped: `21` §3 says a gap is information about
  // his life, not a bug in the log.
  card.appendChild(h('button', {
    class: 'btn ghost full', style: 'margin-top:8px;', 'data-warmup-skip': 'true',
    onClick: () => {
      warmup.skipped = true;
      warmup.completed_at = new Date().toISOString();
      activeSession.phase = 'lifting';
      saveLocal(); render();
    },
  }, t('runner_skip_warmup')));
  return card;
}

