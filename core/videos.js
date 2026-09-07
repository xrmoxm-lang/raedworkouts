/* Exercise catalogue, clip lists and clip visibility. */

import { $, h, icon } from '../core/dom.js';
import { t, tf } from '../core/i18n.js';
import { render } from '../core/shell.js';
import { saveLocal, settings, state } from '../core/store.js';
import { flushSync } from '../core/sync.js';

// ---- Library hierarchy + custom exercises --------------------
export const LIB_HIERARCHY = [
  { id: 'upper', label: 'Upper Body', icon: '🫀', muscles: ['chest', 'upper_chest', 'back', 'upper_back', 'abs'].filter(m => m !== 'abs'), submuscles: {
      chest:    { en: 'Chest',     ar: 'صدر',    keys: ['chest', 'upper_chest'] },
      back:     { en: 'Back',      ar: 'ظهر',    keys: ['back', 'upper_back'] },
  } },
  { id: 'arms',  label: 'Arms',  icon: '💪', submuscles: {
      shoulders: { en: 'Shoulders', ar: 'أكتاف', keys: ['shoulders', 'side_delts', 'rear_delts'] },
      biceps:    { en: 'Biceps',    ar: 'باي',    keys: ['biceps'] },
      triceps:   { en: 'Triceps',   ar: 'تراي',   keys: ['triceps'] },
      forearms:  { en: 'Forearms',  ar: 'ساعد',   keys: ['forearms'] },
  } },
  { id: 'lower', label: 'Lower Body', icon: '🦵', submuscles: {
      quads:      { en: 'Quads',      ar: 'مقدمة الفخذ', keys: ['quads'] },
      hamstrings: { en: 'Hamstrings', ar: 'خلف الفخذ',  keys: ['hamstrings'] },
      glutes:     { en: 'Glutes',     ar: 'أرداف',       keys: ['glutes'] },
      calves:     { en: 'Calves',     ar: 'سمانة',       keys: ['calves'] },
  } },
  { id: 'core',  label: 'Core',  icon: '🔥', submuscles: {
      abs: { en: 'Abs', ar: 'بطن', keys: ['abs'] },
  } },
];
export function getAllExercises() {
  // Merge static EXERCISES with user's custom exercises
  return [...(RW.EXERCISES || []), ...(state.custom_exercises || [])];
}
export function exerciseInGroup(ex, groupKeys) {
  return ex.primary?.some(m => groupKeys.includes(m));
}
export function addCustomExercise({ name, name_ar, primary, jeff_nippard, mohannad_url }) {
  const slug = (name || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const id = 'custom_' + slug + '_' + Date.now().toString(36);
  const mohannadIds = [];
  if (mohannad_url) {
    const m = ytIdFromUrl(mohannad_url);
    if (m) mohannadIds.push(m);
  }
  const ex = {
    id,
    name: name.trim(),
    name_ar: (name_ar || '').trim(),
    primary: [primary],
    secondary: [],
    pattern: 'custom',
    mohannad: mohannadIds,
    jeff_nippard: jeff_nippard ? jeff_nippard.trim() : '',
    alternatives: [],
    cue: '',
    is_custom: true,
  };
  state.custom_exercises = state.custom_exercises || [];
  state.custom_exercises.push(ex);
  saveLocal();
  return ex;
}
export function deleteCustomExercise(id) {
  state.custom_exercises = (state.custom_exercises || []).filter(e => e.id !== id);
  saveLocal();
}

// ---- Video visibility helpers --------------------------------
//
// A hidden clip is remembered by WHICH CLIP it is, not by where it sits in the
// list. It used to be the position — 'mohannad_0', 'mohannad_1' — and the list
// is not stable: videos.test.mjs exists precisely because clips get retired
// when YouTube takes them down, and retiring one shifts every clip after it.
//
// Measured on incline_chest_press, which carries three: hide the second
// (wMksQXD01K0), retire the first, and 'mohannad_1' now names o0Ud3RU59hw. A
// clip he deliberately hid comes back and a different one disappears, silently.
// It is the wrong-video failure D8 is written against, arriving through the
// back door of a preference.
export const videoIdentity = (video) => (video && video.id) ? 'yt:' + video.id : 'url:' + String(video?.url || '');

// One-time conversion of the positional keys already stored. It is only correct
// while the lists still match what they were when he made the choice, which is
// why it runs at load rather than lazily — the moment a clip is retired, the
// old keys stop meaning anything and there is nothing left to convert.
export function migrateVideoHiddenKeys() {
  if (state.video_hidden_key_version >= 2) return;
  const stored = state.video_hidden;
  // Whether anything actually moved. The first cut called saveLocal() on every
  // load — including the overwhelmingly common case of an empty video_hidden —
  // and saveLocal() marks the state dirty for sync, so every boot queued a push.
  // Twelve browser tests started failing on `page.reload: Timeout 20000ms` and
  // the suite went from 2.9 to 8.0 minutes. A migration that finds nothing to do
  // must leave no trace but its own version marker.
  let changed = false;
  if (stored && typeof stored === 'object') {
    for (const [exerciseId, list] of Object.entries(stored)) {
      if (!Array.isArray(list) || !list.length) continue;
      const exercise = getAllExercises().find((item) => item.id === exerciseId);
      if (!exercise) continue;
      // buildExerciseVideos still emits the old positional `key` alongside each
      // clip, so the map comes straight from it. Reconstructing the key by hand
      // got the custom-video index wrong — those count within their own list,
      // not the combined one.
      const byPosition = new Map(
        buildExerciseVideos(exerciseId, exercise, { includeHidden: true })
          .map((video) => [video.key, videoIdentity(video)]));
      const converted = list.map((key) => byPosition.get(key)).filter(Boolean);
      // A key that resolves to nothing names a clip that is already gone.
      // Dropping it is the honest outcome: there is no clip left to hide.
      if (converted.length) stored[exerciseId] = [...new Set(converted)];
      else delete stored[exerciseId];
      changed = true;
    }
  }
  state.video_hidden_key_version = 2;
  // The marker rides along with the next real write. It is only an optimisation
  // — re-running the migration over already-converted keys is a no-op, because
  // an identity key matches no positional key in the map.
  if (changed) saveLocal();
}
export function isVideoHidden(exerciseId, key) {
  const list = state.video_hidden?.[exerciseId];
  return Array.isArray(list) && list.includes(key);
}
export function toggleVideoVisibility(exerciseId, key) {
  state.video_hidden = state.video_hidden || {};
  const list = state.video_hidden[exerciseId] = state.video_hidden[exerciseId] || [];
  const idx = list.indexOf(key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(key);
  if (list.length === 0) delete state.video_hidden[exerciseId];
  saveLocal();
}

// ---- Custom JN URL helpers -----------------------------------
export function getJNUrl(exerciseId) {
  const ex = getAllExercises().find(e => e.id === exerciseId);
  return state.custom_jn_urls?.[exerciseId] || ex?.jeff_nippard || '';
}
export function jnHasCustomOverride(exerciseId) {
  return Boolean(state.custom_jn_urls?.[exerciseId]);
}
// Adding a clip, hardened.
//
// Raed is building the library himself, from his phone, one clip at a time:
// "أنا وأنا أمشي بظيف، أضيف أضيف مقاطع لين أبني مكتبة كويسة". So the whole path
// has to survive being used on a phone, repeatedly, with a paste.
//
// What it replaces was a native prompt() that:
//   * an installed PWA can suppress outright, which is exactly where he uses it;
//   * is painful to paste into on iOS;
//   * stored the raw string, so youtu.be/ID and youtube.com/watch?v=ID became
//     two different clips of the same video;
//   * said "added" whether or not the change ever reached the server.
//
// His synced state carried ZERO custom videos, which is what sent me looking.
export function addCustomVideo(exerciseId) {
  const ex = getAllExercises().find((item) => item.id === exerciseId);
  const modal = $('#modal');
  modal.innerHTML = '';

  const existing = () => (state.custom_videos[exerciseId] || []);
  const input = h('input', {
    type: 'url', inputmode: 'url', autocapitalize: 'off', autocorrect: 'off',
    spellcheck: 'false', class: 'search-input', 'data-video-url': 'true',
    placeholder: 'https://youtube.com/…',
  });
  const preview = h('div', { class: 'vid-preview', 'data-video-preview': 'true' });
  const status = h('div', { class: 'tiny muted', 'data-video-status': 'true' });
  const listWrap = h('div', { class: 'vid-existing' });

  const renderList = () => {
    listWrap.innerHTML = '';
    const clips = existing();
    if (!clips.length) {
      listWrap.appendChild(h('div', { class: 'tiny muted' }, t('video_none_yet')));
      return;
    }
    listWrap.appendChild(h('div', { class: 'xs-label' }, tf('video_count', { n: clips.length })));
    clips.forEach((url, index) => {
      listWrap.appendChild(h('div', { class: 'vid-row' },
        h('img', { class: 'vid-row-thumb', src: `https://i.ytimg.com/vi/${ytIdFromUrl(url)}/mqdefault.jpg`, alt: '' }),
        h('a', { class: 'vid-row-link', href: url, target: '_blank', rel: 'noopener' },
          h('bdi', { class: 'ltr-run' }, ytIdFromUrl(url) || url)),
        h('button', {
          class: 'btn tiny danger ghost', 'data-video-remove': String(index),
          onClick: () => {
            clips.splice(index, 1);
            if (!clips.length) delete state.custom_videos[exerciseId];
            saveLocal(); renderList(); render();
          },
        }, t('remove')),
      ));
    });
  };

  // Live preview: the thumbnail is proof the link resolves to a real video
  // before he commits it, which is the cheapest possible check against a
  // mistyped id becoming a permanent dead tile.
  const refreshPreview = () => {
    const id = ytIdFromUrl(input.value.trim());
    preview.innerHTML = '';
    if (!id) return;
    preview.appendChild(h('img', { src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, alt: '' }));
    preview.appendChild(h('span', { class: 'tiny muted' }, h('bdi', { class: 'ltr-run' }, id)));
  };
  input.addEventListener('input', refreshPreview);
  input.addEventListener('paste', () => setTimeout(refreshPreview, 0));

  const commit = async () => {
    const raw = input.value.trim();
    const id = ytIdFromUrl(raw);
    // A blank beats a wrong link (D8), and a mistyped one is a wrong link.
    if (!id) { status.textContent = t('video_bad_url'); status.className = 'tiny danger-text'; return; }

    // Compare by video id, not by string: youtu.be/ID and watch?v=ID are the
    // same clip and used to be stored as two.
    const clips = state.custom_videos[exerciseId] = existing();
    if (clips.some((existingUrl) => ytIdFromUrl(existingUrl) === id)) {
      status.textContent = t('video_duplicate'); status.className = 'tiny muted'; return;
    }
    clips.push(raw);
    saveLocal();
    render();
    renderList();
    input.value = '';
    preview.innerHTML = '';

    // Say "saved on your phone" first, because that part is certain, then tell
    // the truth about the server rather than implying it landed there.
    status.textContent = t('video_saved_local');
    status.className = 'tiny muted';
    try {
      const ok = await flushSync();
      status.textContent = ok ? t('video_saved_synced') : t('video_saved_pending');
    } catch (_) {
      status.textContent = t('video_saved_pending');
    }
  };

  modal.appendChild(h('div', { class: 'xs-head' },
    h('h3', {}, t('video_add_title')),
    h('div', { class: 'xs-sub' }, h('bdi', { class: 'ltr-run' }, ex?.name || exerciseId)),
  ));
  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-add-device' }, input, h('button', { class: 'btn primary', 'data-video-commit': 'true', onClick: commit }, t('add'))),
    preview,
    status,
  ));
  modal.appendChild(h('section', { class: 'xs-section' }, listWrap));
  modal.appendChild(h('button', { class: 'btn full xs-done', onClick: () => $('#modal-overlay').classList.remove('show') }, t('done')));

  renderList();
  $('#modal-overlay').classList.add('show');
  setTimeout(() => input.focus(), 60);
}


export function setJNUrl(exerciseId, url) {
  state.custom_jn_urls = state.custom_jn_urls || {};
  if (!url || url.trim() === '') {
    delete state.custom_jn_urls[exerciseId];
  } else {
    state.custom_jn_urls[exerciseId] = url.trim();
  }
  saveLocal();
}
// Anchored to a real http(s) YouTube URL.
//
// The pattern was unanchored, so it matched a video id ANYWHERE in the string
// and `javascript:alert(1)//v=AAAAAAAAAAA` was accepted as a valid clip. That URL
// is then stored and rendered as `href: v.url` on the exercise card — tapping the
// tile would execute it. Clips also arrive from a synced or imported state, not
// only from him typing one in.
export function ytIdFromUrl(url) {
  if (!url) return null;
  const raw = String(url);
  if (!/^https?:\/\//i.test(raw.trim())) return null;
  const m = raw.match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
export function youtubeThumbUrl(id, file) {
  return `https://img.youtube.com/vi/${id}/${file}`;
}
export function buildExerciseVideos(exerciseId, ex, opts = {}) {
  const customVids = state.custom_videos[exerciseId] || [];
  const jnUrl = getJNUrl(exerciseId);
  const videos = [
    ...(ex.mohannad || []).map((id, i) => ({
      key: 'mohannad_' + i,
      id,
      url: 'https://www.youtube.com/shorts/' + id,
      label: 'M' + (i + 1),
      title: tf('mohannad_video', { n: i + 1 }),
    })),
    ...(jnUrl ? [{
      key: 'jn',
      id: ytIdFromUrl(jnUrl),
      url: jnUrl,
      label: 'JN',
      title: jnHasCustomOverride(exerciseId) ? 'JN (custom)' : 'Jeff Nippard',
      nippard: true,
    }] : []),
    // Clips Raed chose himself in the link picker. Stored as full URLs, not bare
    // ids, because three of them carry a ?t= that points at the right exercise
    // inside a long video — drop the timestamp and it becomes a different
    // movement, which is the wrong-video case D8 forbids.
    ...(ex.extra || []).map((url, i) => ({
      key: 'extra_' + i,
      id: ytIdFromUrl(url),
      url,
      label: 'R' + (i + 1),
      title: t('raed_pick'),
    })),
    ...customVids.map((url, i) => {
      const isShort = String(url || '').includes('/shorts/');
      return {
        key: 'custom_' + i,
        id: ytIdFromUrl(url),
        url,
        label: isShort ? 'C' + (i + 1) : 'Custom',
        title: t('custom_video'),
        custom: true,
      };
    })
  ];
  return opts.includeHidden ? videos : videos.filter(v => !isVideoHidden(exerciseId, videoIdentity(v)));
}
// ---- Music platform ------------------------------------------
export const PLATFORM_INFO = {
  spotify:        { label: 'Spotify',        icon: '🟢' },
  youtube_music:  { label: 'YT Music',       icon: '▶️' },
  apple_music:    { label: 'Apple Music',    icon: '🍎' },
  none:           { label: 'No music',       icon: '🔇' },
};
export function getCurrentPlaylists(session) {
  if (!session?.playlists) return [];
  // Backward-compat: if playlists is still an array, use it as-is (legacy data)
  if (Array.isArray(session.playlists)) return session.playlists;
  const plat = settings.music_platform || 'spotify';
  if (plat === 'none') return [];
  return session.playlists[plat] || session.playlists.spotify || [];
}

// A citation URL reaches this page from a web search the model ran, so it is
// untrusted input that ends up in an href. `javascript:` and `data:` hrefs
// execute on tap; nothing was checking the scheme. Only real http(s) links are
// offered, and anything else is dropped rather than shown as an inert chip —
// a source he cannot open is not a source.
export function isSafeHttpUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

// ---- Clip classification -------------------------------------------------
// Raed: "بعض مقاطع الفيديو تكون special لتمرين... بالمشين، بالدمبل، بالكابل...
// نحتاج نلاقي طريقة نصنف كل واحدة منها".
//
// Two exercises may share a clip only when they are the SAME movement on
// different equipment. That is a narrow claim and it has to stay narrow:
// stripping words too eagerly put a standing shoulder press in the same family
// as a decline chest press, and a clip of one is a WRONG clip for the other —
// which is the case D8 exists to prevent.
//
// So equipment words are stripped and nothing else. Angle (incline/decline/
// flat), posture, grip and side are movement-defining and stay in the key, and
// the primary muscle is part of the key as well. Six families survive that,
// which is the point: a small honest set beats a large wrong one.
export const EQUIPMENT_PATTERNS = [
  [/hammer strength/i, 'machine'],
  [/\bsmith\b/i, 'machine'],
  [/\bmachine\b|\bpec deck\b|\bleg press\b|\bhack squat\b/i, 'machine'],
  [/\bcable\b|\bpulldown\b|\bpushdown\b|\bpressdown\b|\brope\b/i, 'cable'],
  [/\bez[- ]?bar\b|\bbarbell\b/i, 'barbell'],
  [/\bdb\b|\bdumbbell\b|\bgoblet\b/i, 'dumbbell'],
  [/\bassisted\b|\bpull-?up\b|\bdip\b|\bhanging\b|\bcrunch\b|\bpush-?up\b/i, 'bodyweight'],
];
export const EQUIPMENT_WORDS = /\b(machine|cable|db|dumbbell|barbell|smith|ez[- ]?bar|hammer strength|assisted|plate-?weighted|bayesian|roman chair)\b/gi;

export function exerciseEquipment(name) {
  for (const [pattern, kind] of EQUIPMENT_PATTERNS) if (pattern.test(name || '')) return kind;
  return '';
}

export function movementFamily(exercise) {
  const bare = String(exercise?.name || '')
    .replace(EQUIPMENT_WORDS, ' ')
    .replace(/[^A-Za-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return (exercise?.primary || []).slice().sort().join('+') + '|' + bare;
}

// Clips from the same movement on OTHER equipment. Returned separately from the
// exercise's own clips and never mixed in with them: the label is the whole
// point, because the movement is the same and the setup is not.
export function relatedClips(exercise) {
  if (!exercise) return [];
  const family = movementFamily(exercise);
  const out = [];
  for (const other of getAllExercises()) {
    if (other.id === exercise.id) continue;
    if (movementFamily(other) !== family) continue;
    const own = buildExerciseVideos(other.id, other);
    for (const clip of own) {
      out.push({ ...clip, key: 'rel_' + other.id + '_' + clip.key, fromName: other.name,
                 fromEquipment: exerciseEquipment(other.name) });
    }
  }
  return out;
}

