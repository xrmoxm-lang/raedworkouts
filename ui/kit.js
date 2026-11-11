/* Screen pieces used by more than one screen. */

import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { isSafeHttpUrl, youtubeThumbUrl, ytIdFromUrl } from '../core/videos.js';

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
        h('span', { class: 'video-placeholder-sub' }, v.nippard ? t('find_form_video') : t('open_video')),
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

