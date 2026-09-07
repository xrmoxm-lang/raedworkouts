/* Screen pieces used by more than one screen. */

import { h } from '../core/dom.js';
import { getTodayPlannedSession } from '../core/engine.js';
import { arabicMinutes, fmtKgTotal, localISODate, t, tf } from '../core/i18n.js';
import { state } from '../core/store.js';
import { isSafeHttpUrl, youtubeThumbUrl, ytIdFromUrl } from '../core/videos.js';
import { isCountableWorkingSet } from '../domain/runner-session.js';

// D16/D17: coarse ordinal effort is a final-set check-in, not numeric RIR.
export const EFFORT_LEVELS = [
  { value: 'easy', emoji: '😌' },
  { value: 'medium', emoji: '💪' },
  { value: 'very_hard', emoji: '🥵' },
];
export function effortPicker(set, onChange) {
  return h('div', { class: 'effort-picker', role: 'group', 'aria-label': t('final_set_effort') },
    EFFORT_LEVELS.map(level => h('button', {
      type: 'button',
      class: set.effort === level.value ? 'active' : '',
      'aria-pressed': set.effort === level.value ? 'true' : 'false',
      // The face is decoration; the word is the accessible name, so a screen
      // reader announces «سهل», never "smiling face with relieved expression".
      'aria-label': t(level.value),
      onClick: () => {
        set.effort = level.value;
        if (onChange) onChange(level.value);
      },
    },
      h('span', { class: 'effort-emoji', 'aria-hidden': 'true' }, level.emoji),
      // t(), not a hardcoded string: the Arabic was already in locale.js and the
      // picker was rendering English over it on an Arabic-only screen.
      h('span', { class: 'effort-word' }, t(level.value)),
    ))
  );
}

export function buildVideoTile(v, opts = {}) {
  const id = v.id || ytIdFromUrl(v.url);
  const isShort = String(v.url || '').includes('/shorts/');
  // v.label === '' means "this tile needs no chip" — it sits on the thing it
  // depicts, so labelling it would name something already named. Only an
  // undefined label falls back to a default.
  const label = v.label === '' ? '' : (v.label || (v.nippard ? 'JN' : 'Custom'));
  const classes = [
    'video-thumb',
    isShort ? 'shorts' : 'regular',
    v.nippard ? 'nippard' : '',
    opts.className || '',
  ].filter(Boolean).join(' ');
  const link = h('a', {
    // Belt as well as braces: ytIdFromUrl now refuses a non-http URL on the way
    // IN, and this refuses one on the way OUT, so a clip already stored from
    // before that guard existed still cannot become a javascript: href.
    href: isSafeHttpUrl(v.url) ? v.url : '#',
    target: '_blank',
    rel: 'noopener noreferrer',
    class: classes,
    title: v.title || label,
  });
  const chip = label ? h('span', { class: 'video-label-chip' }, label) : null;
  const showPlaceholder = () => {
    const img = link.querySelector('img');
    if (img) img.remove();
    link.classList.add('video-placeholder');
    if (!link.querySelector('.video-placeholder-content')) {
      link.appendChild(h('span', { class: 'video-placeholder-content' },
        h('span', { class: 'video-placeholder-title' }, v.nippard ? 'JN' : label),
        h('span', { class: 'video-placeholder-sub' }, v.nippard ? 'Find form video ↗' : 'Open video ↗'),
      ));
    }
  };

  if (chip) link.appendChild(chip);
  if (!id) {
    showPlaceholder();
    return link;
  }

  const fallbacks = isShort
    ? ['hqdefault.jpg', 'mqdefault.jpg']
    : ['hqdefault.jpg', 'mqdefault.jpg', '0.jpg'];
  let fallbackIndex = 0;
  const advance = () => {
    fallbackIndex += 1;
    if (fallbackIndex < fallbacks.length) {
      img.src = youtubeThumbUrl(id, fallbacks[fallbackIndex]);
    } else {
      showPlaceholder();
    }
  };
  const img = h('img', {
    src: youtubeThumbUrl(id, fallbacks[fallbackIndex]),
    alt: '',
    loading: 'lazy',
    decoding: 'async',
    onError: advance,
    onLoad: () => {
      if (img.naturalWidth <= 120) advance();
    },
  });
  link.insertBefore(img, chip);
  return link;
}
// The home hero was 125px tall with every word pinned to the right edge and
// the left 55% empty — measured, not eyeballed.
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

// A quiet "?" that explains one term in place. Raed asked for something the
// size of a copyright mark that opens a plain sentence — "شيء مرة بسيط يطلع"
// — after the coach gave him a poor answer for "superset".
export function explainMark(termKey) {
  const bubble = h('span', { class: 'explain-bubble', hidden: true }, t(termKey + '_explain'));
  const mark = h('button', {
    type: 'button', class: 'explain-mark', 'data-explain': termKey,
    'aria-label': t('what_is_this'),
    onClick: (event) => {
      event.stopPropagation();
      const open = bubble.hasAttribute('hidden');
      bubble.toggleAttribute('hidden', !open);
      mark.setAttribute('aria-expanded', open ? 'true' : 'false');
    },
  }, '؟');
  return h('span', { class: 'explain-wrap' }, mark, bubble);
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

