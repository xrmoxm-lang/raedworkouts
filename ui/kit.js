/* Screen pieces used by more than one screen. */

import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { isSafeHttpUrl, youtubeThumbUrl, ytIdFromUrl } from '../core/videos.js';

// D16/D17: coarse ordinal effort is a final-set check-in, not numeric RIR.
const EFFORT_LEVELS = [
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

