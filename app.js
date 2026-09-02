import { rejectedSkinSuggestion, suggestionForBlockBoundary } from './domain/skin-suggestions.mjs';
import { assessSubstitution } from './domain/substitutions.js';
import {
  nextHistoryDrivenSession,
  resolveProgrammeBlock,
  runProgrammeReferenceMigrations,
} from './domain/programme.js';
import {
  localProfileIdFromV16SyncId,
  v16SyncUserId,
} from './domain/sync-identity.js';
import {
  applyWorkingSetAttempt,
  hasValidWorkingValues,
  isCountableWorkingSet,
  isRunnerExerciseResolved,
  isRunnerSetResolved,
  skipRunnerExercise as skipRunnerExerciseState,
} from './domain/runner-session.js';
import { format as localeFormat, text as localeText } from './locale.js';

/* ============================================================
   Raedworkouts — app.js
   Vanilla JS PWA. Pure-frontend logic + self-hosted cloud sync.
   ============================================================ */

// Self-hosted sync — always-on on Raed's HP server (Tailscale Funnel, public
// HTTPS, secret-key gated). The server owns revisions, backups, and merges.
// The key is a shared secret in client JS (same trust model as the old anon key).
const SYNC_URL = 'https://raed-hp.tail53bd35.ts.net:8443';
const SYNC_KEY = 'aa1b222bcdab4b048e7b44d85dca087946a6212314852b4b';
const SYNC_OVERRIDE_KEY = 'raedworkouts_sync_override';

// ---- Tiny utility helpers -----------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style') el.setAttribute('style', attrs[k]);
    else if (k.startsWith('on') && typeof attrs[k] === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (attrs[k] != null && attrs[k] !== false) {
      const value = /^(?:title|placeholder|aria-label)$/.test(k) ? localizeText(attrs[k]) : attrs[k];
      el.setAttribute(k, value);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    // A <bdi> already isolates everything inside it, so splitting its own string
    // children into further <bdi class="ltr-run"> runs produces <bdi><bdi>…</bdi></bdi>.
    // Renderers wrap Latin names manually AND localizedTextNode wraps them
    // automatically, so every such call site was doubling. Translate the string
    // here, but leave the isolation to the <bdi> we are already building.
    if (typeof c === 'string') {
      el.appendChild(tag === 'bdi' ? document.createTextNode(localizeText(c)) : localizedTextNode(c));
      continue;
    }
    el.appendChild(c);
  }
  return el;
};
const isolate = (...children) => h('bdi', {}, children);
const brandMark = () => h('svg', {
  class: 'brand-mark', viewBox: '0 0 200 100', 'aria-hidden': 'true',
}, h('g', { transform: 'translate(100 50)', fill: 'currentColor' },
  h('rect', { x: '-84', y: '-5', width: '168', height: '10', rx: '5' }),
  h('circle', { cx: '-46', cy: '0', r: '25' }),
  h('circle', { cx: '46', cy: '0', r: '25' }),
  h('circle', { cx: '-80', cy: '0', r: '12' }),
  h('circle', { cx: '80', cy: '0', r: '12' }),
));
// ---- i18n ---------------------------------------------------
// Every renderer supplies an English source/key to this single locale map.
// Arabic text is the default; English exercise names and numeric runs are
// isolated below so punctuation cannot jump across an RTL sentence.
const activeLanguage = () => settings?.lang || 'ar';
const t = (key) => localeText(key, activeLanguage());
const tf = (key, values) => localeFormat(key, values, activeLanguage());
const localizeText = (value) => typeof value === 'string' ? localeText(value, activeLanguage()) : value;
// Muscle labels are data labels, not freehand UI copy.  Rendering them through
// this one resolver keeps Home, Library, Help, and legacy cards on data.js's
// approved Arabic label when the locale is Arabic.
const muscleLabel = (id) => {
  const muscle = RW?.MUSCLES?.[id];
  return (activeLanguage() === 'ar' ? muscle?.ar : muscle?.en) || muscle?.en || id;
};
const experienceLabel = (experience) => ({
  beginner: t('new_to_gym'),
  detrained: t('trained_before_reentering'),
  returning: t('trained_before_coming_back'),
  experienced: t('currently_training'),
}[experience] || t('returning'));
// Keep an approved technical URI together. The general run deliberately
// leaves sentence punctuation outside <bdi>; the URI alternative prevents a
// scheme such as scope.bit:// from being split into a false English fragment.
// The comma belongs in the run class. Without it "4,658" split into two runs —
// "4" and "658" — with the separator loose between them, and RTL reordered the
// whole thing into "658,4" on screen. A grouped number is ONE token.
const LTR_RUN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[A-Za-z0-9:/?&=._%+-]*|[A-Za-z0-9][A-Za-z0-9 .,:×x/()+_-]*[A-Za-z0-9)]|[A-Za-z0-9]/g;
const localizedTextNode = (value) => {
  const localized = localizeText(value);
  if (typeof localized !== 'string' || activeLanguage() !== 'ar' || !/[A-Za-z0-9]/.test(localized)) return document.createTextNode(localized);
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of localized.matchAll(LTR_RUN)) {
    const index = match.index ?? 0;
    if (index > cursor) fragment.appendChild(document.createTextNode(localized.slice(cursor, index)));
    const bdi = document.createElement('bdi');
    bdi.className = 'ltr-run';
    bdi.textContent = match[0];
    fragment.appendChild(bdi);
    cursor = index + match[0].length;
  }
  if (cursor < localized.length) fragment.appendChild(document.createTextNode(localized.slice(cursor)));
  return fragment;
};
const setUiText = (el, value) => { el.replaceChildren(localizedTextNode(value)); };

function applyLang() {
  const lang = activeLanguage();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app_name');
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $$('[data-i18n-aria-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
}

const fmtDate = (d) => new Date(d).toLocaleDateString(
  activeLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US',
  { weekday: 'short', month: 'short', day: 'numeric' },
);
// Day and month only. fmtDate includes the weekday, which is right on a session
// card but too long for a four-column table on a 390px screen — it overflowed
// into the load beside it. Three rows of dates do not need a weekday to be read.
const fmtDateShort = (d) => new Date(d).toLocaleDateString(
  activeLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US',
  { month: 'short', day: 'numeric' },
);
const fmtTime = (d) => {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(d));
  const hour = parts.find((part) => part.type === 'hour')?.value || '';
  const minute = parts.find((part) => part.type === 'minute')?.value || '';
  const period = parts.find((part) => part.type === 'dayPeriod')?.value;
  if (activeLanguage() === 'ar') return `${hour}:${minute} ${period === 'PM' ? 'م' : 'ص'}`;
  return `${hour}:${minute} ${period || ''}`.trim();
};
const todayISO = () => new Date().toISOString().slice(0,10);
const toast = (msg, ms = 1800, actionLabel = '', actionFn = null) => {
  const t = $('#toast');
  t.innerHTML = '';
  t.classList.remove('skin-suggestion');
  t.appendChild(localizedTextNode(msg));
  if (actionLabel && actionFn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    setUiText(btn, actionLabel);
    btn.addEventListener('click', () => { t.classList.remove('show'); actionFn(); });
    t.appendChild(btn);
  }
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), ms);
};

// ---- State / storage layer ----------------------------------
const LEGACY_STORAGE_KEY = 'raedworkouts.v1';
const LEGACY_SETTINGS_KEY = 'raedworkouts.settings.v1';
const LEGACY_LAST_WRITE_KEY = 'raedworkouts.lastwrite.v1';
const ACTIVE_USER_KEY = 'raedworkouts.active_user';
const PROFILE_INDEX_KEY = 'raedworkouts.profiles.v1';

function getSyncUrl() {
  try {
    return (localStorage.getItem(SYNC_OVERRIDE_KEY) || '').trim() || SYNC_URL;
  } catch (_) {
    return SYNC_URL;
  }
}
function encodeUserKey(userId) {
  return encodeURIComponent(String(userId || '').trim());
}
// Local profile IDs deliberately stay human-facing.  Only this resolver may
// construct a server identity, and it always suffixes `-v16`; no v16 request
// can therefore address Raed's v15 row by accident.
function syncUserId(localUserId = settings.user_id) {
  return v16SyncUserId(localUserId);
}
function syncUserQuery(localUserId = settings.user_id) {
  return encodeURIComponent(syncUserId(localUserId));
}
function nsKey(userId, suffix) {
  return `raedworkouts.${encodeUserKey(userId)}.${suffix}.v1`;
}
function stateKey(userId) { return nsKey(userId, 'state'); }
function settingsKey(userId) { return nsKey(userId, 'settings'); }
function lastWriteKey(userId) { return nsKey(userId, 'lastwrite'); }
function lastRevKey(userId) { return nsKey(userId, 'lastrev'); }
function preRestoreKey(userId) { return nsKey(userId, 'prerestore'); }
function dirtyKey(userId) { return nsKey(userId, 'dirty'); }
function programmeMigrationExportKey(userId) { return nsKey(userId, 'programme-migration-export'); }

// ---- Final-set effort -----------------------------------------
// D16/D17: coarse ordinal effort is a final-set check-in, not numeric RIR.
// The emoji are v15's, unchanged: 😌 / 💪 / 🥵. v15 stored an RPE number (7/8/9)
// behind them; D16 replaced that with three words. The faces map one-to-one onto
// the words, so this is v15's picture over v16's meaning — nothing numeric returns.
// v15 hid them behind a popover (two taps). These stay inline (one tap), because
// one-thumb logging outranks copying the interaction.
const EFFORT_LEVELS = [
  { value: 'easy', emoji: '😌' },
  { value: 'medium', emoji: '💪' },
  { value: 'very_hard', emoji: '🥵' },
];
function effortPicker(set, onChange) {
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

// ---- Gym launcher (IN2 Fitness) ------------------------------
// Tries the user's override first, then a URL scheme. If the scheme
// doesn't open the app within ~1.2s (page still focused), falls back
// to the App Store URL so they can tap "Open" there.
function launchGymApp() {
  const override = (settings.gym_launch_override || '').trim();
  if (override) {
    // User has set a custom URL (Shortcut, different scheme, etc.) — use it directly.
    window.location.href = override;
    return;
  }
  const scheme = settings.gym_launch_scheme || 'scope.bit://';
  const fallback = settings.gym_launch_fallback || 'https://apps.apple.com/sa/app/in2-fitness/id1536137282';

  // Heuristic: try the scheme; if the page is still visible after a moment, open fallback.
  const before = Date.now();
  let opened = false;
  const onVisChange = () => { if (document.visibilityState === 'hidden') opened = true; };
  document.addEventListener('visibilitychange', onVisChange, { once: true });

  // Attempt the scheme
  try { window.location.href = scheme; } catch (_) {}

  // Fallback after 1.2s if we're still here
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisChange);
    if (opened) return;
    if (Date.now() - before < 800) return;  // animation lag
    if (document.visibilityState === 'visible') {
      // Scheme didn't open the app → open App Store
      window.location.href = fallback;
    }
  }, 1200);
}

// ---- Library hierarchy + custom exercises --------------------
const LIB_HIERARCHY = [
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
function getAllExercises() {
  // Merge static EXERCISES with user's custom exercises
  return [...(RW.EXERCISES || []), ...(state.custom_exercises || [])];
}
function exerciseInGroup(ex, groupKeys) {
  return ex.primary?.some(m => groupKeys.includes(m));
}
function addCustomExercise({ name, name_ar, primary, jeff_nippard, mohannad_url }) {
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
function deleteCustomExercise(id) {
  state.custom_exercises = (state.custom_exercises || []).filter(e => e.id !== id);
  saveLocal();
}

// ---- Video visibility helpers --------------------------------
function isVideoHidden(exerciseId, key) {
  const list = state.video_hidden?.[exerciseId];
  return Array.isArray(list) && list.includes(key);
}
function toggleVideoVisibility(exerciseId, key) {
  state.video_hidden = state.video_hidden || {};
  const list = state.video_hidden[exerciseId] = state.video_hidden[exerciseId] || [];
  const idx = list.indexOf(key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(key);
  if (list.length === 0) delete state.video_hidden[exerciseId];
  saveLocal();
}

// ---- Custom JN URL helpers -----------------------------------
function getJNUrl(exerciseId) {
  const ex = getAllExercises().find(e => e.id === exerciseId);
  return state.custom_jn_urls?.[exerciseId] || ex?.jeff_nippard || '';
}
function jnHasCustomOverride(exerciseId) {
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
function addCustomVideo(exerciseId) {
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


function setJNUrl(exerciseId, url) {
  state.custom_jn_urls = state.custom_jn_urls || {};
  if (!url || url.trim() === '') {
    delete state.custom_jn_urls[exerciseId];
  } else {
    state.custom_jn_urls[exerciseId] = url.trim();
  }
  saveLocal();
}
function ytIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function youtubeThumbUrl(id, file) {
  return `https://img.youtube.com/vi/${id}/${file}`;
}
function buildExerciseVideos(exerciseId, ex, opts = {}) {
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
  return opts.includeHidden ? videos : videos.filter(v => !isVideoHidden(exerciseId, v.key));
}
function buildVideoTile(v, opts = {}) {
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
    href: v.url,
    target: '_blank',
    rel: 'noopener',
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
function editJNUrlPrompt(exerciseId) {
  const ex = getAllExercises().find(e => e.id === exerciseId);
  if (!ex) return;
  const current = getJNUrl(exerciseId);
  const next = prompt(
    `Edit Jeff Nippard URL for "${ex.name}".\n\nPaste a full YouTube link (video, shorts, or playlist). Leave empty to reset to default.`,
    current
  );
  if (next === null) return;  // cancelled
  setJNUrl(exerciseId, next);
  if (typeof toast === 'function') toast('JN URL updated.');
  render();
}

// ---- Music platform ------------------------------------------
const PLATFORM_INFO = {
  spotify:        { label: 'Spotify',        icon: '🟢' },
  youtube_music:  { label: 'YT Music',       icon: '▶️' },
  apple_music:    { label: 'Apple Music',    icon: '🍎' },
  none:           { label: 'No music',       icon: '🔇' },
};
function getCurrentPlaylists(session) {
  if (!session?.playlists) return [];
  // Backward-compat: if playlists is still an array, use it as-is (legacy data)
  if (Array.isArray(session.playlists)) return session.playlists;
  const plat = settings.music_platform || 'spotify';
  if (plat === 'none') return [];
  return session.playlists[plat] || session.playlists.spotify || [];
}

// ---- PR detection (silent) -----------------------------------
function prScore(kg, reps) { return kg * (1 + reps / 30); }  // Epley 1RM estimate
function detectPR(exercise_id, kg, reps) {
  if (!kg || !reps) return false;
  const score = prScore(kg, reps);
  const prev = state.prs[exercise_id];
  if (!prev || score > prev.score + 0.001) {
    state.prs[exercise_id] = { kg, reps, date: todayISO(), score };
    return true;
  }
  return false;
}
function isPRSet(exercise_id, kg, reps) {
  const pr = state.prs[exercise_id];
  if (!pr) return false;
  return Math.abs(pr.kg - kg) < 0.01 && pr.reps === reps;
}

const defaultState = () => ({
  schema_version: 2,
  // Independent of the event-log schema: D6 only migrates invalid planned
  // session references, never historical session evidence.
  programme_reference_migration_version: 1,
  current_week: 1,
  current_block: 1,
  profile: null,                // { display_name, experience, bodyweight_kg, created_at }
  active_session: null,        // { date, session_id, started_at, warmup, exercises: {...} }
  history: [],                 // [{ date, session_id, started_at, ended_at, exercises: {...}, substitutions: [...] }]
  bodyweight_log: [],          // [{ date, kg }]
  custom_videos: {},           // { exercise_id: [url, url, ...] }  — extra videos user adds
  custom_jn_urls: {},          // { exercise_id: 'https://youtube.com/...' } — overrides default JN URL
  video_hidden: {},            // { exercise_id: ['mohannad_0','jn','custom_2'] } — hidden video keys
  custom_exercises: [],        // [{ id, name, name_ar, primary, secondary, jeff_nippard, mohannad, ... }]
  programme_overrides: null,   // optional: replace default PROGRAMME entirely
  prs: {},                     // { exercise_id: { kg, reps, date, score } } — best ever per exercise
  msg_index: 0,                // rotates through MOTIVATIONAL_MESSAGES
  last_sync: null,
  forced_next_session: null,   // session id override when user missed a day
  substitutions: [],           // explicit, scoped D24 §5 substitution records
  // Per-exercise equipment memory. Raed does leg press on a different machine
  // depending on which is free, and 60 kg on one is not 60 kg on another — so
  // the machine has to be part of the record, not a note he keeps in his head.
  // { exercise_id: { equipment, device, known_devices: [] } }
  exercise_prefs: {},
});

const defaultSettings = () => ({
  theme: 'auto',               // auto | light | dark
  skin: 'hadid',               // hadid | waraq | rukham
  weight_unit: 'kg',           // kg | lb
  rest_seconds: 120,
  vibrate: true,
  notifications: true,         // browser notifications when rest ends (req permission)
  focus_mode: true,            // one-exercise-at-a-time during active session
  show_cues: true,             // live-session control; defaults to useful form cues
  runner_video_open: true,     // persisted per profile; Raed wants the explanation open by default
  // The coach may be told which exercise he is standing at. On by default; the
  // switch is on the Coach screen while a session is running.
  coach_use_context: true,
  runner_video_default_version: 1,
  music_platform: 'spotify',   // spotify | youtube_music | apple_music | none
  show_pr_summary: true,       // show end-of-session PR review
  // Gym launcher: opens the verified IN2 app URL, with an App Store fallback.
  gym_launch_scheme: 'scope.bit://',                                  // bundle ID-based scheme attempt
  gym_launch_fallback: 'https://apps.apple.com/sa/app/in2-fitness/id1536137282', // App Store fallback
  gym_launch_override: '',     // user-set custom URL (e.g. shortcuts://run-shortcut?name=Open%20IN2)
  sync_url: SYNC_URL,
  sync_key: SYNC_KEY,
  user_id: '',
  block_auto_color: true,      // whether a configured boundary suggestion is offered
  block_skin_suggestions: {},  // deliberately unset until Raed assigns a skin per block
  block_skin_rejections: {},   // { block: true }; rejection is remembered for that block
  lang: 'ar',
  locale_version: 1,
});

let state = defaultState();
let settings = defaultSettings();
let syncDirty = false;
let syncTimer = null;
let syncInFlight = false;
let syncInFlightPromise = null;
let activeUser = '';
let welcomeProfiles = null;
let welcomeLoading = false;
let welcomePreselectUser = '';
let welcomeMode = 'tiles';
let welcomeSelectedProfile = null;
let suppressNextPush = false;
// v15's focus-mode cursor: which exercise the session view is showing.
// Its declaration was lost in the phase-6 rewrite while eight references to it
// survived, so the session view threw ReferenceError on render.
let focusExerciseIdx = null;
// Lets Raed go back into the cards after the done panel appears, without
// undoing the completion. Reset whenever a session starts, so a new workout
// never opens straight into the review state.
let sessionDoneDismissed = false;

function hasMeaningfulLocalData() {
  return (state.history || []).length > 0 || Boolean(state.active_session) || (state.bodyweight_log || []).length > 0;
}

function familyProfileSeeds() {
  return RW.FAMILY_PROFILES || [
    { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', bodyweight_kg: 82, allowlisted: true },
    { user_id: 'bassam', display_name: 'Bassam', experience: 'returning', allowlisted: true },
    { user_id: 'abdullah', display_name: 'Abdullah', experience: 'beginner', allowlisted: true },
  ];
}
function fallbackProfile(userId) {
  const seed = familyProfileSeeds().find(p => String(p.user_id).toLowerCase() === String(userId || '').toLowerCase());
  return {
    display_name: seed?.display_name || userId || '',
    experience: seed?.experience || 'returning',
    bodyweight_kg: seed?.bodyweight_kg ?? null,
    created_at: new Date().toISOString(),
  };
}
function ensureProfile() {
  if (!state.profile || typeof state.profile !== 'object') {
    state.profile = fallbackProfile(settings.user_id || activeUser);
  }
  if (!state.profile.display_name) state.profile.display_name = settings.user_id || activeUser || '';
  if (!state.profile.experience) state.profile.experience = 'detrained';
  if (!state.profile.created_at) state.profile.created_at = new Date().toISOString();
}
function registerLocalProfile(profile) {
  const list = getLocalProfiles().filter(p => String(p.user_id).toLowerCase() !== String(profile.user_id).toLowerCase());
  list.push({
    user_id: profile.user_id,
    display_name: profile.display_name || profile.user_id,
    experience: profile.experience || 'detrained',
    updated_at: new Date().toISOString(),
  });
  localStorage.setItem(PROFILE_INDEX_KEY, JSON.stringify(list));
}
function getLocalProfiles() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_INDEX_KEY) || '[]').map(({ has_pin: _retired, ...profile }) => profile);
  } catch (_) { return []; }
}
function getActiveUser() {
  return localStorage.getItem(ACTIVE_USER_KEY) || '';
}
function setActiveUser(userId) {
  activeUser = userId || '';
  if (activeUser) localStorage.setItem(ACTIVE_USER_KEY, activeUser);
  else localStorage.removeItem(ACTIVE_USER_KEY);
}
function readLastRev(userId = settings.user_id) {
  const raw = localStorage.getItem(lastRevKey(userId));
  return raw ? parseInt(raw, 10) : null;
}
function writeLastRev(rev, userId = settings.user_id) {
  if (!userId) return;
  if (rev == null || Number.isNaN(Number(rev))) localStorage.removeItem(lastRevKey(userId));
  else localStorage.setItem(lastRevKey(userId), String(rev));
}
function readDirtyMarker(userId = settings.user_id) {
  return !!userId && localStorage.getItem(dirtyKey(userId)) === '1';
}
function writeDirtyMarker(userId = settings.user_id) {
  if (userId) localStorage.setItem(dirtyKey(userId), '1');
}
function clearDirtyMarker(userId = settings.user_id) {
  if (userId) localStorage.removeItem(dirtyKey(userId));
}
function backfillSessionUids() {
  let changed = false;
  const makeUid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : ('sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)));
  (state.history || []).forEach(sess => {
    if (sess && !sess.uid) { sess.uid = makeUid(); changed = true; }
  });
  if (state.active_session && !state.active_session.uid) {
    state.active_session.uid = makeUid();
    changed = true;
  }
  return changed;
}
function stripForSync(value, mode = 'state') {
  if (Array.isArray(value)) return value.map(v => stripForSync(v, mode));
  if (!value || typeof value !== 'object') return value;
  const deny = mode === 'settings'
    ? new Set(['sync_key', 'sync_url', 'user_id', 'last_rev', 'pending_variant'])
    : new Set(['last_sync']);
  const out = {};
  Object.entries(value).forEach(([k, v]) => {
    if (k.startsWith('_') || deny.has(k)) return;
    out[k] = stripForSync(v, mode);
  });
  return out;
}
function retireLegacyCredentialFields(rawSettings = {}) {
  // Old local snapshots can contain the retired credential fields. They are
  // discarded during every load/merge and are never rendered or synced again.
  const {
    user_key: _credential,
    pending_registration: _registration,
    needs_pin_reauth: _reauth,
    pin_prompt_dismissed_at: _prompt,
    ...safeSettings
  } = rawSettings;
  return safeSettings;
}
function syncStatePayload() {
  const clean = stripForSync(state, 'state');
  clean.profile = clean.profile || fallbackProfile(settings.user_id);
  return clean;
}
function syncSettingsPayload() {
  return stripForSync(settings, 'settings');
}
function profileProteinRange() {
  const kg = parseFloat(state.profile?.bodyweight_kg || RW.ATHLETE?.bodyweight_kg || 82);
  const low = Math.round(kg * 1.6);
  const high = Math.round(kg * 2.2);
  return `${low}-${high} g`;
}
function migrationUserFromLegacy(legacySettings) {
  if (legacySettings?.user_id) return legacySettings.user_id;
  const urlUser = new URLSearchParams(window.location.search).get('user');
  return urlUser || '';
}
function migrateLegacyStorage() {
  const legacyStateRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  const legacySettingsRaw = localStorage.getItem(LEGACY_SETTINGS_KEY);
  if (!legacyStateRaw && !legacySettingsRaw) return;
  let legacySettings = {};
  try { legacySettings = JSON.parse(legacySettingsRaw || '{}'); } catch (_) {}
  const userId = migrationUserFromLegacy(legacySettings);
  if (!userId) return;
  if (!localStorage.getItem(stateKey(userId)) && legacyStateRaw) localStorage.setItem(stateKey(userId), legacyStateRaw);
  if (!localStorage.getItem(settingsKey(userId)) && legacySettingsRaw) localStorage.setItem(settingsKey(userId), legacySettingsRaw);
  const lw = localStorage.getItem(LEGACY_LAST_WRITE_KEY);
  if (lw && !localStorage.getItem(lastWriteKey(userId))) localStorage.setItem(lastWriteKey(userId), lw);
  setActiveUser(userId);
  registerLocalProfile({ user_id: userId, display_name: userId, experience: legacySettings.profile?.experience || 'returning' });
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SETTINGS_KEY);
  localStorage.removeItem(LEGACY_LAST_WRITE_KEY);
}

/**
 * D6 changes only the future programme rotation.  Before clearing an invalid
 * v15 forced-next reference, retain a durable local copy and trigger the
 * required timestamped JSON export.  The pure runner guarantees this adapter
 * receives untouched state before it can migrate anything.
 */
function exportProgrammeMigration(record, userId) {
  const payload = {
    kind: 'programme_reference_migration',
    user_id: userId,
    exported_at: record.created_at,
    state: record.state,
  };
  if (userId) localStorage.setItem(programmeMigrationExportKey(userId), JSON.stringify(payload));
  downloadJson(record.filename, payload);
}
function migrateProgrammeReferencesAtBoot(userId) {
  const result = runProgrammeReferenceMigrations(state, {
    programme: RW.PROGRAMME,
    exportState: (record) => exportProgrammeMigration(record, userId),
  });
  state = result.state;
  if (result.status === 'read_only') {
    console.error(`Programme migration skipped: ${result.message}`);
    return result;
  }
  if (result.status === 'migrated' && result.ignored.length) {
    console.info(`Programme migration ignored legacy planned references: ${result.ignored.join(', ')}`);
  }
  return result;
}
function loadLocal() {
  migrateLegacyStorage();
  activeUser = getActiveUser();
  state = defaultState();
  settings = defaultSettings();
  if (activeUser) {
    let storedState = {};
    try { storedState = JSON.parse(localStorage.getItem(stateKey(activeUser)) || '{}'); } catch (e) {}
    state = { ...defaultState(), ...storedState };
    // New profiles begin at version 1. A stored profile without this explicit
    // marker predates D6 and must take the export-first reference migration.
    if (!Object.prototype.hasOwnProperty.call(storedState, 'programme_reference_migration_version')) {
      state.programme_reference_migration_version = 0;
    }
    try {
      const storedSettings = JSON.parse(localStorage.getItem(settingsKey(activeUser)) || '{}');
      settings = { ...defaultSettings(), ...retireLegacyCredentialFields(storedSettings) };
    } catch (e) {}
    // Existing profiles predate the Arabic-default requirement.  Preserve an
    // explicit post-Phase-4 choice, but migrate prior settings once.
    if (!settings.locale_version) {
      settings.lang = 'ar';
      settings.locale_version = 1;
    }
    if (!settings.runner_video_default_version) {
      settings.runner_video_open = true;
      settings.runner_video_default_version = 1;
    }
    settings.user_id = settings.user_id || activeUser;
    activeUser = settings.user_id;
    setActiveUser(activeUser);
  }
  if (activeUser && !localStorage.getItem(lastWriteKey(activeUser)) && hasMeaningfulLocalData()) {
    localStorage.setItem(lastWriteKey(activeUser), new Date().toISOString());
  }
  // D6 replaces the selectable v15 programme variants. Stored values are
  // deliberately retired rather than interpreted as new programme choices.
  delete settings.programme_variant;
  delete settings.pending_variant;
  // Always use the baked-in sync endpoint — no manual setup needed
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  if (settings.user_id) {
    migrateProgrammeReferencesAtBoot(settings.user_id);
    ensureProfile();
    backfillSessionUids();
    syncDirty = readDirtyMarker(settings.user_id);
    registerLocalProfile({ user_id: settings.user_id, ...state.profile });
    localStorage.setItem(settingsKey(settings.user_id), JSON.stringify(settings));
    localStorage.setItem(stateKey(settings.user_id), JSON.stringify(state));
  } else {
    syncDirty = false;
  }
}
function persistLocal() {
  if (!settings.user_id) return;
  const now = new Date().toISOString();
  state.last_sync = now;
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  ensureProfile();
  backfillSessionUids();
  localStorage.setItem(stateKey(settings.user_id), JSON.stringify(state));
  localStorage.setItem(settingsKey(settings.user_id), JSON.stringify(settings));
  localStorage.setItem(lastWriteKey(settings.user_id), now);
  registerLocalProfile({ user_id: settings.user_id, ...state.profile });
}
function markDirty() {
  syncDirty = true;
  writeDirtyMarker(settings.user_id);
  setSyncStatus(navigator.onLine === false ? 'err' : 'off', navigator.onLine === false ? t('sync_pending_offline') : t('sync_pending'));
}
function schedulePush(delay = 2500) {
  if (!settings.user_id || !settings.sync_url || !settings.sync_key) return;
  clearScheduledPush();
  syncTimer = setTimeout(() => flushSync().catch(() => {}), delay);
}
function clearScheduledPush() {
  clearTimeout(syncTimer);
  syncTimer = null;
}
async function quiesceSyncPipeline() {
  clearScheduledPush();
  if (syncInFlightPromise) await syncInFlightPromise.catch(() => false);
  clearScheduledPush();
}
function saveLocal(opts = {}) {
  const { sync = true, dirty = true } = opts;
  persistLocal();
  if (dirty) markDirty();
  if (sync && dirty && !suppressNextPush) schedulePush();
}
function applyRemotePayload(remote, localUserId = settings.user_id) {
  // The server correctly echoes its row id (`raed-v16`), but that is never a
  // local profile id. Keeping the local identity here prevents remote sync
  // metadata from leaking into localStorage, profile names, or later requests.
  const localId = localUserId || settings.user_id;
  if (!localId) throw new Error('Sync identity invariant failed: remote payload needs a local profile id');
  const localLang = settings.lang;
  const localTheme = settings.theme;
  const remoteState = remote.state_json || remote.state || {};
  const remoteSettings = retireLegacyCredentialFields(remote.settings_json || remote.settings || {});
  state = { ...defaultState(), ...remoteState };
  settings = { ...defaultSettings(), ...remoteSettings };
  settings.user_id = localId;
  settings.lang = settings.lang || localLang;
  settings.theme = settings.theme || localTheme;
  delete settings.programme_variant;
  delete settings.pending_variant;
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  setActiveUser(localId);
  // A remote pre-D6 snapshot is subject to the exact same export-first
  // migration as a locally loaded one.
  migrateProgrammeReferencesAtBoot(settings.user_id);
  ensureProfile();
  backfillSessionUids();
  writeLastRev(remote.rev || remote.latest_rev, settings.user_id);
  syncDirty = false;
  clearDirtyMarker(settings.user_id);
  persistLocal();
}
function syncAuthBody() {
  return {
    _auth_token: settings.sync_key,
  };
}
function syncErrorStatus(err) {
  const match = String(err?.message || '').match(/Sync\s+(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
function isNetworkError(err) {
  const msg = String(err?.message || err || '');
  if (/^Sync\s+\d+/.test(msg)) return false;
  return err instanceof TypeError || /Sync timeout|Failed to fetch|NetworkError|Load failed|internet connection|offline/i.test(msg);
}
// ---- Cloud sync (self-hosted on Raed's HP server) ----------
async function syncFetch(path, opts = {}) {
  const { timeoutMs = 15000, signal, ...fetchOpts } = opts;
  const base = (settings.sync_url || getSyncUrl()).replace(/\/$/, '');
  const url = base + path;
  const headers = { ...(fetchOpts.headers || {}) };
  if (settings.sync_key) headers.Authorization = 'Bearer ' + settings.sync_key;
  if (fetchOpts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const canAbort = typeof AbortController !== 'undefined' && timeoutMs > 0 && !signal;
  const controller = canAbort ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { ...fetchOpts, headers, signal: signal || controller?.signal });
    if (!res.ok) {
      // Carry the status on the error itself. The status was previously only
      // recoverable by re-parsing the message string, which is fragile — a
      // three-digit number in the server's body could be read as the status.
      const failure = new Error(`Sync ${res.status}: ${await res.text()}`);
      failure.status = res.status;
      throw failure;
    }
    return res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Sync timeout');
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function syncToCloud(opts = {}) {
  if (!settings.sync_url || !settings.sync_key || !settings.user_id) return false;
  const userIdAtStart = settings.user_id;
  const bodyObj = {
    user_id: syncUserId(settings.user_id),
    state_json: syncStatePayload(),
    settings_json: syncSettingsPayload(),
    updated_at: new Date().toISOString(),
    base_rev: readLastRev(settings.user_id),
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.beaconAuth ? syncAuthBody() : {}),
  };
  const body = JSON.stringify(bodyObj);
  if (opts.beacon && navigator.sendBeacon) {
    const url = settings.sync_url.replace(/\/$/, '') + '/state';
    return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
  }
  syncDirty = false;
  let response;
  try {
    response = await syncFetch('/state', {
      method: 'POST',
      body,
      ...(opts.keepalive ? { keepalive: true } : {}),
    });
  } catch (err) {
    syncDirty = true;
    writeDirtyMarker(userIdAtStart);
    throw err;
  }
  const rev = response?.rev || response?.latest_rev;
  if (response?.merged === true) {
    if (syncDirty) {
      setSyncStatus('off', t('sync_merged_pending'));
      saveLocal._toastShown = false;
      return true;
    }
    applyRemotePayload(response, userIdAtStart);
    applyTheme();
    render();
  } else if (rev) {
    writeLastRev(rev, userIdAtStart);
    if (!syncDirty) clearDirtyMarker(userIdAtStart);
  }
  setSyncStatus('ok', (response?.merged ? t('sync_merged_ok') : t('sync_ok')) + ' ' + fmtTime(Date.now()));
  saveLocal._toastShown = false;
  return true;
}

async function flushSync(opts = {}) {
  if (!settings.user_id) return false;
  while (true) {
    if (syncInFlightPromise) {
      const inFlightOk = await syncInFlightPromise.catch(() => false);
      if (!inFlightOk) return false;
      if (syncDirty || readDirtyMarker(settings.user_id)) continue;
      return true;
    }
    if (!syncDirty && !readDirtyMarker(settings.user_id)) return true;
    if (navigator.onLine === false) {
      setSyncStatus('err', t('sync_pending_offline'));
      return false;
    }
    clearScheduledPush();
    let ok = false;
    let run;
    syncInFlight = true;
    run = (async () => {
      try {
        ok = await syncToCloud(opts);
        return ok;
      } catch (err) {
        // Name the likely cause instead of echoing a raw error. Unreachable and
        // rejected are different problems with different fixes, and telling them
        // apart on screen is what turns "فشلت المزامنة" into something he can act
        // on — or report to me precisely.
        setSyncStatus('err', syncFailureReason(err));
        if (!saveLocal._toastShown) {
          saveLocal._toastShown = true;
          toast(t('cloud_sync_failed'), 3500);
        }
        return false;
      } finally {
        syncInFlight = false;
        if (syncInFlightPromise === run) syncInFlightPromise = null;
        if (syncDirty) schedulePush(ok ? 2500 : 60000);
      }
    })();
    syncInFlightPromise = run;
    const pushed = await run;
    if (!pushed) return false;
  }
}

async function pullFromCloud() {
  if (!settings.sync_url || !settings.sync_key || !settings.user_id) return false;
  if (syncDirty || readDirtyMarker(settings.user_id)) return flushSync();
  let remote;
  try {
    remote = await syncFetch('/state?user=' + syncUserQuery(settings.user_id));
  } catch (e) {
    // 404 = no row yet (first run / fresh user) — not an error, nothing to pull.
    if (/Sync 404/.test(e.message || '')) return false;
    throw e;
  }
  if (remote?.latest_rev && readLastRev(settings.user_id) === remote.latest_rev) {
    setSyncStatus('ok', t('sync_ok'));
    return false;
  }
  if (remote && remote.state_json) {
    applyRemotePayload(remote, settings.user_id);
    setSyncStatus('ok', t('sync_pulled'));
    return true;
  }
  return false;
}


// Turns a fetch failure into something Raed can act on. A network-level failure
// and a rejected request are different problems: one means the server cannot be
// reached at all, the other means it answered and said no. Reporting them the
// same way is what made a real outage take an investigation to diagnose.
function syncFailureReason(err) {
  const message = String(err?.message || err || '');
  const status = Number(err?.status || (message.match(/\b(\d{3})\b/) || [])[1]);
  if (navigator.onLine === false) return t('sync_pending_offline');
  if (status === 401 || status === 403) return t('sync_rejected');
  if (status >= 500) return t('sync_server_error');
  if (/failed to fetch|networkerror|load failed|timeout|abort/i.test(message)) {
    // Chrome 147 blocks a public page from reaching the "local address space"
    // behind a permission. On a machine running Tailscale, MagicDNS resolves the
    // sync host to its 100.x CGNAT address, so Chrome classifies it as local and
    // refuses — while Safari, which does not implement Local Network Access,
    // works on the same machine against the same server. Diagnosed 2026-09-02:
    // every request failed with net::ERR_FAILED and "Permission was denied for
    // this request to access the `local` address space".
    //
    // Naming it matters: "cannot reach your server" sends him to check the
    // server, which is healthy. The problem is one browser's permission.
    if (isChromiumLike()) return t('sync_blocked_by_browser');
    return t('sync_unreachable');
  }
  return t('sync_failed_generic');
}

// Chromium-family detection, deliberately narrow: Chrome on iOS is WebKit
// underneath and is NOT affected, so a plain /Chrome/ test would misdiagnose it.
function isChromiumLike() {
  const ua = navigator.userAgent || '';
  // Chrome on iOS is WebKit underneath and is NOT affected, so a bare /Chrome/
  // test would misdiagnose the browser he most likely trains with.
  if (/iPhone|iPad|iPod/.test(ua)) return false;
  return /Chrome|Chromium|Edg\//.test(ua);
}

function setSyncStatus(kind, text) {
  const el = $('#sync-status');
  if (!el) return;
  el.className = 'sync-status ' + kind;
  setUiText(el, text);
}

async function testCloudConnection() {
  if (!settings.sync_url || !settings.sync_key) {
    toast('Sync is not configured.');
    return;
  }
  toast('Testing…');
  try {
    await syncFetch('/health', { timeoutMs: 8000 });
    setSyncStatus('ok', t('sync_connected') + ' ✓');
    toast('Connection OK.');
  } catch (e) {
    setSyncStatus('err', syncFailureReason(e));
    // Concatenating onto a literal defeats localisation: the joined string can
    // never match a locale entry, so this always rendered in English.
    toast(tf('sync_connection_failed', { reason: syncFailureReason(e) }), 3500);
  }
}

// `/users` contains both long-lived v15 rows and isolated v16 rows. Bare v15
// rows remain invisible here, and legacy credential metadata is intentionally
// ignored: profiles always open directly in v16.
function welcomeProfilesForV16(remoteRows = []) {
  const profiles = new Map();
  const add = (profile) => {
    const { has_pin, pin_hash, pin_salt, ...local } = profile || {};
    const key = String(local.user_id || '').toLocaleLowerCase();
    if (key) profiles.set(key, local);
  };
  familyProfileSeeds().forEach(add);
  getLocalProfiles().forEach(add);

  for (const remote of remoteRows || []) {
    const localId = localProfileIdFromV16SyncId(remote?.user_id);
    if (!localId) continue;
    const existing = profiles.get(localId.toLocaleLowerCase()) || { user_id: localId, display_name: localId };
    add({
      ...existing,
      user_id: existing.user_id || localId,
      display_name: remote.display_name || existing.display_name || localId,
      experience: remote.experience || existing.experience || 'returning',
      sessions: remote.sessions ?? existing.sessions ?? 0,
      updated_at: remote.updated_at || existing.updated_at || null,
    });
  }
  return [...profiles.values()];
}

async function loadWelcomeProfiles() {
  if (welcomeLoading) return;
  welcomeLoading = true;
  try {
    const rows = await syncFetch('/users', { timeoutMs: 8000 });
    welcomeProfiles = welcomeProfilesForV16(rows);
  } catch (_) {
    welcomeProfiles = welcomeProfilesForV16();
  } finally {
    welcomeLoading = false;
    if (!settings.user_id) renderWelcome();
  }
}
async function selectProfile(profile) {
  welcomeSelectedProfile = profile;
  await openProfile(profile);
}
function finishLocalProfile(userId, profile) {
  settings = { ...defaultSettings(), user_id: userId, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  state = { ...defaultState(), profile: {
    display_name: profile?.display_name || userId,
    experience: profile?.experience || 'returning',
    bodyweight_kg: profile?.bodyweight_kg ?? null,
    created_at: new Date().toISOString(),
  }};
  setActiveUser(userId);
  persistLocal();
  syncDirty = false;
  clearDirtyMarker(userId);
  render();
}
async function openProfile(profile) {
  const userId = profile.user_id || profile.display_name;
  settings = { ...defaultSettings(), sync_url: getSyncUrl(), sync_key: SYNC_KEY, user_id: userId };
  state = { ...defaultState(), profile: {
    display_name: profile.display_name || userId,
    experience: profile.experience || 'returning',
    bodyweight_kg: profile.bodyweight_kg ?? null,
    created_at: new Date().toISOString(),
  }};
  setActiveUser(userId);
  try {
    const pulled = await pullFromCloud();
    persistLocal();
    applyTheme();
    render();
    // A new local profile has no remote revision. Its first namespaced state
    // write claims its v16 row; it never needs a separate credential setup.
    if (!pulled && readLastRev(userId) == null) saveLocal();
  } catch (error) {
    finishLocalProfile(userId, profile);
    if (syncErrorStatus(error) === 401) {
      setSyncStatus('err', t('profile_opened_local_admin_reset'));
      toast(t('profile_opened_local_admin_reset'), 4000);
      return;
    }
    if (!isNetworkError(error)) throw error;
    saveLocal();
    toast('Opened locally. Cloud sync will reconnect when available.', 3500);
  }
}
async function createProfile(profile, bodyweight) {
  const localUserId = profile.user_id || profile.display_name;
  finishLocalProfile(localUserId, { ...profile, bodyweight_kg: bodyweight ?? profile.bodyweight_kg });
  state.profile.experience = profile.experience || state.profile.experience || 'returning';
  if (bodyweight) {
    state.profile.bodyweight_kg = bodyweight;
    state.bodyweight_log = [{ date: todayISO(), kg: bodyweight }];
  }
  saveLocal();
  toast('Profile ready.');
  applyTheme();
  render();
}
function renderRegisterPanel(profile) {
  const bw = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', placeholder: 'Bodyweight kg (optional)', value: profile.bodyweight_kg ?? '' });
  const exp = h('select', {},
    ['beginner','returning','experienced'].map(v => h('option', { value: v, ...(profile.experience === v ? { selected: '' } : {}) },
      experienceLabel(v)
    ))
  );
  const status = h('div', { class: 'tiny muted' }, '');
  return h('div', { class: 'register-panel card' },
    h('button', { class: 'btn tiny ghost', onClick: () => { welcomeMode = 'tiles'; renderWelcome(); } }, '← Profiles'),
    h('h2', {}, profile.display_name || profile.user_id),
    h('p', { class: 'muted' }, t('workout_data_separate')),
    h('label', {}, 'Experience', exp),
    h('label', {}, 'Bodyweight', bw),
    status,
    h('button', { class: 'btn primary full', onClick: async () => {
      setUiText(status, 'Creating profile...');
      try {
        await createProfile({ ...profile, experience: exp.value }, parseFloat(bw.value) || null);
      } catch (e) {
        const statusCode = syncErrorStatus(e);
        if (statusCode === 403 || /not_allowlisted/.test(e.message || '')) {
          setUiText(status, 'Ask Raed to add this name first.');
          return;
        }
        if (!isNetworkError(e)) {
          setUiText(status, e.message || 'Could not create profile.');
          return;
        }
        throw e;
      }
    }}, 'Create profile')
  );
}
function renderSomeoneElsePanel() {
  const name = h('input', { type: 'text', placeholder: 'Name' });
  const status = h('div', { class: 'tiny muted' }, 'Only Raed-approved names can register.');
  return h('div', { class: 'register-panel card' },
    h('button', { class: 'btn tiny ghost', onClick: () => { welcomeMode = 'tiles'; renderWelcome(); } }, '← Profiles'),
    h('h2', {}, 'Someone else?'),
    h('label', {}, 'Name', name),
    status,
    h('button', { class: 'btn primary full', onClick: () => {
      const value = name.value.trim();
      if (!value) return;
      welcomeSelectedProfile = { user_id: value, display_name: value, experience: 'beginner' };
      welcomeMode = 'register';
      renderWelcome();
    }}, 'Continue')
  );
}
function renderWelcome() {
  document.body.classList.add('welcome-mode');
  const root = $('#page-home');
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-home'));
  $$('.tab').forEach(t => t.classList.remove('active'));
  root.innerHTML = '';
  if (!welcomeProfiles && !welcomeLoading) loadWelcomeProfiles();
  const profiles = welcomeProfiles || welcomeProfilesForV16();
  if (welcomePreselectUser) {
    const pre = profiles.find(p => String(p.user_id).toLowerCase() === welcomePreselectUser.toLowerCase());
    if (pre && welcomeMode === 'tiles') setTimeout(() => selectProfile(pre), 0);
    welcomePreselectUser = '';
  }
  const wrap = h('div', { class: 'welcome-screen' },
    h('div', { class: 'welcome-head' },
      h('div', { class: 'app-title big' }, brandMark(), h('span', {}, t('app_name'))),
      h('p', {}, 'Family training profiles. Offline-first, synced when reachable.'),
    )
  );
  if (welcomeMode === 'register' && welcomeSelectedProfile) {
    wrap.appendChild(renderRegisterPanel(welcomeSelectedProfile));
  } else if (welcomeMode === 'other') {
    wrap.appendChild(renderSomeoneElsePanel());
  } else {
    wrap.appendChild(h('div', { class: 'profile-grid' },
      profiles.map(profile => {
        const name = profile.display_name || profile.user_id;
        const experience = profile.experience === 'detrained' ? 'returning' : (profile.experience || 'returning');
        return h('button', {
          type: 'button',
          class: 'profile-tile',
          onClick: () => selectProfile(profile),
        },
          h('span', { class: 'profile-initial' }, String(name || '?').slice(0,1).toUpperCase()),
          h('span', { class: 'profile-name' }, name),
          h('span', { class: 'profile-meta' },
            h('bdi', { class: 'ltr-run' }, String(profile.sessions || 0)), ' ', t('sessions'), ' · ', t(experience),
          ),
        );
      })
    ));
    wrap.appendChild(h('button', { class: 'btn ghost full', onClick: () => { welcomeMode = 'other'; renderWelcome(); } }, 'Someone else?'));
    if (welcomeLoading) wrap.appendChild(h('div', { class: 'tiny muted', style: 'text-align:center;margin-top:8px;' }, t('loading_server_profiles')));
  }
  root.appendChild(wrap);
}
// ---- Theme --------------------------------------------------
const SKINS = {
  hadid: { label: 'حديد', sw_light: '#b8451a', sw_dark: '#e8622d', theme_dark: '#17130f' },
  waraq: { label: 'ورق', sw_light: '#7c1f2e', sw_dark: '#743d4a', theme_dark: '#121110' },
  rukham: { label: 'رخام', sw_light: '#2f4858', sw_dark: '#a8b8c0', theme_dark: '#121618' },
};

function activeSkin() {
  return SKINS[settings.skin] ? settings.skin : 'hadid';
}

// This is the app's boundary decision path. It is intentionally non-mutating:
// a proposal is not an acceptance, and persisted settings stay untouched here.
export function resolveBlockSkinBoundary({ previousBlock, currentBlock, settings: persistedSettings }) {
  return {
    settings: persistedSettings,
    suggestion: suggestionForBlockBoundary({
      previousBlock,
      currentBlock,
      settings: persistedSettings,
    }),
  };
}

// The only state transitions from a surfaced suggestion are explicit responses.
export function resolveSkinSuggestionResponse({ settings: persistedSettings, suggestion, response }) {
  if (!suggestion) return persistedSettings;
  if (response === 'accept') return { ...persistedSettings, skin: suggestion.skin };
  if (response === 'reject') {
    return {
      ...persistedSettings,
      block_skin_rejections: rejectedSkinSuggestion(persistedSettings.block_skin_rejections, suggestion.block),
    };
  }
  return persistedSettings;
}

function applyTheme() {
  const mode = settings.theme || 'auto';
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  const skin = activeSkin();
  document.documentElement.setAttribute('data-skin', skin);
  // Status-bar values follow the selected skin; block transitions never call this.
  const skinInfo = SKINS[skin];
  const metaLight = document.getElementById('theme-color-light');
  const metaDark = document.getElementById('theme-color-dark');
  if (metaLight) metaLight.setAttribute('content', skinInfo.sw_light);
  if (metaDark) metaDark.setAttribute('content', skinInfo.theme_dark);
  // The header no longer carries a theme control — Raed asked for it to live in
  // Settings only ("خله بالإعدادات... في الصفحة العامة، فشيله"). Appearance is a
  // set-once preference, not something to spend header real estate on.
}

function closeSkinSuggestion() {
  const el = $('#toast');
  el.classList.remove('show', 'skin-suggestion');
}

function showSkinSuggestion(suggestion) {
  const proposed = SKINS[suggestion.skin];
  const current = SKINS[activeSkin()];
  if (!proposed || !current) return;

  const el = $('#toast');
  clearTimeout(toast._timer);
  el.innerHTML = '';
  el.classList.add('skin-suggestion', 'show');
  el.appendChild(h('div', { class: 'skin-suggestion-copy' },
    tf('new_block_switch_skin', { skin: proposed.label })
  ));
  el.appendChild(h('div', { class: 'skin-suggestion-actions' },
    h('button', { type: 'button', class: 'btn tiny primary', onClick: () => {
      // This is the only boundary path that applies a new skin: an explicit tap.
      settings = resolveSkinSuggestionResponse({ settings, suggestion, response: 'accept' });
      saveLocal();
      applyTheme();
      closeSkinSuggestion();
      toast(t('saved'));
      if ($('#page-settings').classList.contains('active')) renderSettings();
    } }, t('change_it')),
    h('button', { type: 'button', class: 'btn tiny', onClick: () => {
      settings = resolveSkinSuggestionResponse({ settings, suggestion, response: 'reject' });
      saveLocal();
      closeSkinSuggestion();
      toast(t('keep_this_one'));
    } }, t('keep_this_one')),
  ));
}

// ---- Programme resolver --------------------------------------
// The week is DERIVED from logged sessions, not stored. state.current_week was
// initialised to 1 and never assigned anywhere, so the resolver always picked
// Block A and Block B — weeks 5-8, with its own exercises (EZ Bar Curl, Overhead
// Rope, Machine Lateral Raise instead of the Block A three) — was unreachable
// forever. He could have trained for months and never seen the second half of
// his own programme.
//
// Four sessions to a week, which is the programme's own frequency, and the same
// history-driven principle the session rotation already uses. Deriving it means
// there is no counter to forget to advance, and it self-corrects if he misses a
// week or logs two sessions in a day.
function completedSessionCount() {
  return (state.history || []).length;
}
function derivedWeek() {
  const programme = state.programme_overrides || RW.PROGRAMME;
  const lastWeek = Math.max(...(programme.blocks || []).map((block) => block.week_end || 0), 1);
  return Math.min(lastWeek, 1 + Math.floor(completedSessionCount() / 4));
}
function derivedBlock() {
  const programme = state.programme_overrides || RW.PROGRAMME;
  const week = derivedWeek();
  const found = (programme.blocks || []).find((block) => week >= (block.week_start || 1) && week <= (block.week_end || 99));
  return found?.block || 1;
}

function getActiveProgramme() {
  const programme = state.programme_overrides || RW.PROGRAMME;
  return resolveProgrammeBlock(programme, {
    currentWeek: derivedWeek(),
    currentBlock: derivedBlock(),
  });
}
function getActiveProgrammeId() {
  return getActiveProgramme().id;
}

// ---- Today's session resolver -------------------------------
// The adopted programme is history-driven. A three-session week simply leaves
// the fourth id next in this same order; weekdays never reshuffle the split.
function getTodayPlannedSession() {
  const prog = getActiveProgramme();
  // Manual override — user forced a specific session (e.g. missed a day)
  if (state.forced_next_session) {
    const forced = prog.sessions.find((session) => session.id === state.forced_next_session);
    if (forced) return forced;
    // Defence in depth for a stale remote/local snapshot that has not yet
    // reached the export-first boot migration. Never return undefined here.
    console.warn(`Ignoring unknown forced session id: ${state.forced_next_session}`);
  }
  return nextHistoryDrivenSession(prog, state.history || []).session;
}
function getNextPlannedSession() {
  const prog = getActiveProgramme();
  const resolved = nextHistoryDrivenSession(prog, state.history || []);
  return { session: resolved.session, in_days: 0, rotation_index: resolved.index };
}

// ---- Smart suggestions -------------------------------------
function getLastPerformance(exercise_id) {
  // Delegates rather than duplicating. This used to be its own scan of
  // state.history, so when the lookup became device-aware the card kept reading
  // the newest session on ANY machine while the weight suggestion read the
  // right one — the two rules drifted the moment one of them changed. Same bug
  // shape as the two copies of the set-validity rule before it.
  return getLastTwoPerformances(exercise_id)[0] || null;
}

// ---- Per-exercise equipment memory --------------------------------------
// Raed: "إذا تستعمل machine ولا plates ولا dumbbells... إنت جالس تسوي leg press
// لكن على different devices each time، فأنت تلقى الـdevice وهو يحفظ device
// ويلقيك في الـdevice هذا ويبرمج بناءً عليه".
//
// The point is not a label. 60 kg on one leg press is not 60 kg on another —
// different lever arms, different starting resistance — so a weight history
// that mixes machines is a history of nothing. When a device is chosen, the
// suggestion and the "last time" line read only the sets logged on THAT device.

const EQUIPMENT_KINDS = ['machine', 'plates', 'dumbbells', 'cable', 'bodyweight'];

function exercisePrefs(exerciseId) {
  if (!state.exercise_prefs) state.exercise_prefs = {};
  if (!state.exercise_prefs[exerciseId]) {
    state.exercise_prefs[exerciseId] = { equipment: '', device: '', known_devices: [] };
  }
  const prefs = state.exercise_prefs[exerciseId];
  if (!Array.isArray(prefs.known_devices)) prefs.known_devices = [];
  return prefs;
}

function rememberDevice(exerciseId, name) {
  const clean = String(name || '').trim().slice(0, 40);
  const prefs = exercisePrefs(exerciseId);
  prefs.device = clean;
  if (clean && !prefs.known_devices.includes(clean)) prefs.known_devices.push(clean);
  saveLocal();
}

function getLastTwoPerformances(exercise_id) {
  const device = exercisePrefs(exercise_id).device;
  const collect = (matchDevice) => {
    const out = [];
    for (let i = state.history.length - 1; i >= 0 && out.length < 2; i--) {
      const ex = state.history[i].exercises[exercise_id];
      if (!ex?.sets?.some(isCountableWorkingSet)) continue;
      if (matchDevice && (ex.device || '') !== device) continue;
      out.push({ date: state.history[i].date, ...ex });
    }
    return out;
  };
  if (device) {
    const sameDevice = collect(true);
    // Only prefer the device-specific history when there IS some. A first
    // session on a new machine should still see what he did elsewhere rather
    // than an empty card pretending he has never done the movement.
    if (sameDevice.length) return sameDevice;
  }
  return collect(false);
}
function effectiveStartKg(planned) {
  const base = Number(planned.start_kg);
  if (!Number.isFinite(base) || base <= 0) return null;
  const exp = state.profile?.experience || 'returning';
  // D19: a detrained lifter starts from real logged history whenever it exists.
  // The reference seed is not deliberately scaled down for Raed's re-entry.
  if (exp === 'detrained' || exp === 'returning') return Math.round(base / 2.5) * 2.5;
  const factor = exp === 'beginner' ? 0.5 : (exp === 'experienced' ? 1.25 : 1);
  const scaled = base * factor;
  if (exp === 'beginner') return Math.max(2.5, Math.floor(scaled / 2.5) * 2.5);
  return Math.round(scaled / 2.5) * 2.5;
}
// Clamp C3: always round DOWN to the equipment step. Rounding to nearest, as this
// did before, silently sent a warm-up set ABOVE the prescribed percentage — a 9 kg
// working weight produced a 5 kg "50%" warm-up. Down is the conservative direction
// for a beginner, and it is the only direction the clamp spec allows.
// `step` is per-exercise and is learned from logged weights; 2.5 is the provisional
// default until enough observations exist. Phase 2 replaces this with the shared
// domain/clamps.js implementation once app.js is loaded as a module.
function roundToGymIncrement(value, step) {
  const n = Number(value) || 0;
  const s = Number(step) > 0 ? Number(step) : 2.5;
  return Math.max(s, Math.floor(n / s) * s);
}
// Weekly volume runs to thousands of kg, so it gets a grouping separator and no
// decimal — whole kilos are plenty at that scale, and dropping the fraction
// kills the ambiguity entirely.
//
// The bug this replaces: the locale-less formatter followed the DEVICE, so the
// same app rendered "267.2" on one phone and "267,2" on another, and neither
// matched fmtKgValue below, which always uses a dot. Pinning the locale makes
// the number mean the same thing on every phone.
// A single lifted load, kept exact. Gym plates land on halves, so rounding to
// whole kilos misreports what he did; trailing zeros are dropped so 60 stays
// "60" rather than "60.0".
function fmtLoadKg(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

function fmtKgTotal(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function fmtKgValue(value) {
  return Number(value).toFixed(1).replace(/\.0$/, '');
}
// Zero is a legitimate load: plenty of machines carry their own stack, and Raed
// logs 0 for those. It used to be rejected, which forced him to invent a 1.
function isLoggableWeight(value) {
  const weight = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(weight) && weight >= 0;
}
function hasWorkingWeight(value) {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0;
}
function displaySuggestedWeight(value) {
  return hasWorkingWeight(value) ? `${fmtKgValue(value)} ${t('kg')}` : '—';
}
// The exercise this one is supersetted with: same superset_group, different row.
// Returns null for the second half of the pair, so the note renders once, on the
// exercise you reach first.
function supersetPartner(session, planned) {
  // A1 and A2 are a PAIR, not a shared label: the letter is the group and the
  // digit is the position. Matching on exact equality — which is what this did
  // originally — found one member every time and returned null, so the note it
  // renders had never once appeared. The gate did not catch it because it only
  // asserted that some expanded card existed.
  const tag = String(planned?.superset_group || '');
  const match = tag.match(/^([A-Z])(\d)$/);
  if (!match || !session?.exercises) return null;
  const [, letter, position] = match;
  const members = session.exercises
    .filter((item) => String(item.superset_group || '').startsWith(letter))
    .sort((a, b) => String(a.superset_group).localeCompare(String(b.superset_group)));
  if (members.length < 2) return null;
  // Announced once, on the movement reached first, so both cards do not claim it.
  return position === '1' ? members[1] : null;
}

function suggestedWeightPlaceholder(value) {
  // An empty box told Raed nothing -- he could not tell "no suggestion yet" from
  // "the app is broken". With no logged history there IS no number to suggest,
  // so the honest word is «معايرة»: this session is the calibration.
  return hasWorkingWeight(value) ? fmtKgValue(value) : t('calibrate');
}
function editableWeightValue(value) {
  return hasWorkingWeight(value) ? Number(value) : '';
}
// Compound ramp, sourced: 50% x 6-10 then 70% x 4-6 (ML L11160/L11162, PPL L:1454/1457).
function twoSetWarmupFrom(weight, step) {
  return [
    { weight: roundToGymIncrement(weight * 0.5, step), reps: 10 },
    { weight: roundToGymIncrement(weight * 0.7, step), reps: 6 },
  ];
}
function warmupText(planned, suggestedWeight) {
  if (!planned.warmup) return '';
  if (/^2\s+sets/i.test(planned.warmup)) {
    if (!hasWorkingWeight(suggestedWeight)) return '';
    const warmups = twoSetWarmupFrom(suggestedWeight);
    return `2 sets: ${fmtKgValue(warmups[0].weight)}kg×10, ${fmtKgValue(warmups[1].weight)}kg×6`;
  }
  return planned.warmup;
}

function suggestNextWeight(exercise_id, planned) {
  // Returns { weight, note } — based on last 2 sessions
  const last2 = getLastTwoPerformances(exercise_id);
  const ex = getAllExercises().find(e => e.id === exercise_id);
  const startKg = effectiveStartKg(planned);
  if (!ex) return { weight: startKg, note: t('why_first_exposure') };
  if (!last2.length) {
    return hasWorkingWeight(startKg)
      ? { weight: startKg, note: tf('why_reentry_seed', { kg: startKg }) }
      : { weight: null, note: t('why_calibrate') };
  }
  const latest = last2[0];
  const topReps = parseInt(String(planned.reps).split('-').pop(), 10) || 10;
  // Find the heaviest working set
  const workingSets = (latest.sets || []).filter(isCountableWorkingSet);
  if (!workingSets.length) {
    const historicWeight = (latest.sets || []).filter(isCountableWorkingSet).map((set) => set.weight).find(hasWorkingWeight);
    return hasWorkingWeight(historicWeight)
      ? { weight: Number(historicWeight), note: t('why_last_logged') }
      : { weight: null, note: t('why_calibrate') };
  }
  const lastTopSet = workingSets[workingSets.length - 1];
  const allHitTarget = workingSets.every(s => s.reps >= topReps);
  const finalEffort = lastTopSet.effort || null;
  // Check if last 2 sessions both hit target
  const isLowerBody = ['quads','glutes','hamstrings','calves'].some(m => ex.primary.includes(m));
  const isAccessory = ex.pattern && ex.pattern.startsWith('isolation');
  const bump = isLowerBody ? 5 : (isAccessory ? 0 : 2.5);
  if (allHitTarget && last2.length === 2) {
    const prevSets = (last2[1].sets || []).filter(isCountableWorkingSet);
    const prevAllHit = prevSets.length && prevSets.every(s => s.reps >= topReps);
    if (prevAllHit) {
      if (finalEffort === 'very_hard') {
        return { weight: lastTopSet.weight, note: t('why_hold_very_hard') };
      }
      if (bump > 0) {
        return { weight: lastTopSet.weight + bump, note: tf('why_bump_twice', { reps: topReps, kg: bump }) };
      } else {
        return { weight: lastTopSet.weight, note: t('why_accessory_reps') };
      }
    }
  }
  if (allHitTarget && finalEffort === 'easy' && bump > 0) {
    return { weight: lastTopSet.weight + bump, note: tf('why_easy_bump', { reps: topReps, kg: bump }) };
  }
  return { weight: lastTopSet.weight, note: tf('why_match_or_beat', { kg: lastTopSet.weight, reps: lastTopSet.reps }) };
}

// ---- Streak / volume calc ----------------------------------
function getStreak() {
  // Count completed sessions in the last 4 weeks
  const now = Date.now();
  const fourWeeksMs = 28 * 24 * 60 * 60 * 1000;
  return state.history.filter(h => (now - new Date(h.date).getTime()) < fourWeeksMs).length;
}
function getWeeklyVolume() {
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  let totalSets = 0, totalKg = 0;
  state.history.forEach(h => {
    if (new Date(h.date).getTime() >= weekAgo) {
      Object.values(h.exercises).forEach(ex => {
        (ex.sets || []).forEach(s => {
          if (isCountableWorkingSet(s)) {
            totalSets++;
            totalKg += (Number(s.weight) || 0) * (Number(s.reps) || 0);
          }
        });
      });
    }
  });
  return { totalSets, totalKg: Math.round(totalKg) };
}

// ---- Session warm-up phase ---------------------------------
function warmupTypeForSession(session) {
  // D12 is data-led: both Upper sessions use the merged push+pull warm-up;
  // both Lower sessions use the leg warm-up. The explicit fallback keeps an
  // already-started archival session usable without inventing leg drills.
  if (session?.warmup_type === 'lower' || ['lower_a', 'lower_b'].includes(session?.id)) return 'lower';
  return 'upper';
}
function createSessionWarmup(session) {
  const type = warmupTypeForSession(session);
  const source = RW.SESSION_WARMUPS?.[type] || { cap_minutes: 15, treadmill_minutes: [5, 7, 10], drills: [] };
  // A hard source-level guard: the merged Upper warm-up can never contain leg drills.
  const drills = (source.drills || []).filter((drill) => type !== 'upper' || !/leg/i.test(drill.id));
  return {
    type,
    cap_minutes: source.cap_minutes || 15,
    treadmill_minutes: null,
    treadmill_done: false,
    drills: drills.map((drill) => ({ ...drill, completed: false })),
    started_at: new Date().toISOString(),
    completed_at: null,
  };
}
function generalWarmupComplete(warmup) {
  return Boolean(warmup?.treadmill_done) && (warmup.drills || []).every((drill) => drill.completed);
}
function workingRepTarget(planned) {
  return parseInt(String(planned?.reps || '').split('-')[0], 10) || 1;
}
function scopedReplacementFor(session, exerciseId) {
  const active = (state.substitutions || []).filter((entry) => {
    if (entry.from_exercise_id !== exerciseId) return false;
    if (entry.scope === 'always') return true;
    if (entry.scope === 'this_week') return entry.expires_after_week === derivedWeek();
    if (entry.scope === 'this_block') return entry.block === derivedBlock();
    return false;
  });
  return active.length ? active[active.length - 1].to_exercise_id : exerciseId;
}
function renderWarmupPhase(activeSession) {
  const warmup = activeSession.warmup;
  const card = h('div', { class: 'card warmup-phase' },
    h('div', { class: 'phase-kicker' }, t('warmup_phase')),
    h('h3', {}, t('warmup_cap')),
    h('p', { class: 'tiny muted' }, t('warmup_explainer')),
  );
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

// ---- Active session lifecycle ------------------------------
function startSession(session) {
  if (state.active_session) {
    if (!confirm('You have an active session in progress. Discard it and start a new one?')) return;
  }
  const exercises = {};
  session.exercises.forEach(plan => {
    const replacementId = scopedReplacementFor(session, plan.exercise_id);
    const effectivePlan = replacementId === plan.exercise_id ? plan : { ...plan, exercise_id: replacementId };
    const sug = suggestNextWeight(replacementId, effectivePlan);
    const suggestedWorkingWeight = editableWeightValue(sug.weight);
    const sets = [];
    // Warmup sets (not counted) — auto-prefill if `is_first_of_muscle`
    // §8.4 gives every row an explicit `ramp_sets` count: 2 on the openers, 1 on
    // most, 0 on a few. This used to read `plan.warmup` — a v15 STRING like
    // "2 sets: 12.5kg×10" — which the Upper/Lower programme does not have, so
    // the condition was never true and NO ramp sets were built at all. Raed
    // noticed his warm-up sets had vanished; they had.
    const rampSets = Number.isFinite(plan.ramp_sets)
      ? plan.ramp_sets
      : (plan.warmup ? (/^2\s+sets/i.test(plan.warmup) ? 2 : 1) : 0);
    if (rampSets > 0) {
      // Sourced ramp: 50% then 70% of the working load (ML L11160/L11162).
      // A single ramp set uses the 50% entry, not the 70% one — the point is to
      // groove the movement, not to pre-fatigue it.
      //
      // With no history there is no working weight to take a percentage of, but
      // the programme still PRESCRIBES the ramp. Dropping the rows entirely
      // silently discarded that instruction on exactly the sessions where he is
      // least sure what to do. The rows are built either way; without a
      // suggestion they carry a blank weight and read «معايرة», like the working
      // sets on a first exposure.
      const canSuggest = hasWorkingWeight(sug.weight);
      const ramps = canSuggest ? twoSetWarmupFrom(sug.weight) : [{ weight: '', reps: 10 }, { weight: '', reps: 6 }];
      (rampSets >= 2 ? ramps : [ramps[0]]).forEach((warm) =>
        sets.push({ is_warmup: true, weight: warm.weight, reps: warm.reps, effort: null, completed: false })
      );
    }
    for (let i = 0; i < plan.sets; i++) {
      // A suggestion is a placeholder, never an already-entered prescription.
      // In particular, a new catalogue movement has no made-up 0 kg default.
      sets.push({ is_warmup: false, weight: suggestedWorkingWeight, reps: workingRepTarget(effectivePlan), effort: null, completed: false });
    }
    exercises[plan.exercise_id] = {
      planned: effectivePlan,
      sets,
      swapped_to: replacementId === plan.exercise_id ? null : replacementId,
    };
  });
  sessionDoneDismissed = false;
  state.active_session = {
    uid: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : ('sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))),
    date: todayISO(),
    session_id: session.id,
    session_name: session.name,
    started_at: new Date().toISOString(),
    phase: 'warmup',
    warmup: createSessionWarmup(session),
    exercises,
  };
  // The restored v15 view is cursor-based: every new session starts at its
  // first unresolved exercise, never at the prior session's last card.
  focusExerciseIdx = null;
  // A block transition may offer a configured skin, but cannot apply one.
  const prevBlock = state._last_toasted_block;
  const curBlock = state.current_block || 1;
  const isBlockTransition = prevBlock != null && prevBlock !== curBlock;
  const skinBoundary = resolveBlockSkinBoundary({
    previousBlock: prevBlock,
    currentBlock: curBlock,
    settings,
  });
  const skinSuggestion = skinBoundary.suggestion;
  state._last_toasted_block = curBlock;
  saveLocal();
  router('home');   // v15's session view lives on home
  if (skinSuggestion) showSkinSuggestion(skinSuggestion);
  else {
    toast('Session started — let\'s go.');
    if (isBlockTransition) {
      // Reaching a new block is a milestone, and it was announced in English on
      // an Arabic-only screen. A template literal is joined before it reaches
      // toast(), so it could never match a locale entry however it was worded.
      const blockKeys = { 1: 'block_name_foundation', 2: 'block_name_strength', 3: 'block_name_peak' };
      const blockName = t(blockKeys[curBlock] || 'block_name_new');
      setTimeout(() => toast(tf('block_begins', { block: curBlock, name: blockName }), 4000), 800);
    }
  }
}

function endSession() {
  if (!state.active_session) return;
  const a = state.active_session;
  // Compute completed flag
  const anyResolved = Object.values(a.exercises).some(isRunnerExerciseResolved);
  if (!anyResolved) {
    if (!confirm('No sets logged. Discard this session?')) return;
    state.active_session = null;
    state.forced_next_session = null;
    focusExerciseIdx = null;
    saveLocal();
    router('home');
    return;
  }
  // Compute session-level PRs and stats before archiving
  const sessionPRs = computeSessionPRs(a);
  const stats = computeSessionStats(a);
  // Stamp the machine each exercise was performed on, so the history can be read
  // back per device. Without this the preference is decorative: it would change
  // what the card SAYS today and nothing about what it knows tomorrow.
  for (const [exerciseId, entry] of Object.entries(a.exercises || {})) {
    const device = exercisePrefs(entry.swapped_to || exerciseId).device;
    if (device) entry.device = device;
  }
  const finishedSession = { ...a, ended_at: new Date().toISOString(), prs: sessionPRs, stats };
  state.history.push(finishedSession);
  state.active_session = null;
  state.forced_next_session = null;  // clear override after session ends
  focusExerciseIdx = null;
  state.msg_index = (state.msg_index + 1) % (RW.MOTIVATIONAL_MESSAGES?.length || 20);
  saveLocal();
  // Show end-of-session screen instead of jumping to history
  showSessionEnd(finishedSession);
}

function computeSessionPRs(session) {
  // Look for sets in this session that match the current PR for each exercise
  const out = [];
  for (const [ex_id, ex] of Object.entries(session.exercises || {})) {
    const actualId = ex.swapped_to || ex_id;
    const pr = state.prs[actualId];
    if (!pr) continue;
    if (pr.date === todayISO()) {
      out.push({ exercise_id: actualId, kg: pr.kg, reps: pr.reps });
    }
  }
  return out;
}

function computeSessionStats(session) {
  let totalSets = 0, totalReps = 0, totalVol = 0, totalWeightLifted = 0;
  for (const ex of Object.values(session.exercises || {})) {
    for (const s of (ex.sets || [])) {
      if (!isCountableWorkingSet(s)) continue;
      totalSets++;
      const r = parseInt(s.reps, 10) || 0;
      const w = parseFloat(s.weight) || 0;
      totalReps += r;
      totalVol += r * w;
      totalWeightLifted += w;
    }
  }
  return { sets: totalSets, reps: totalReps, volume_kg: Math.round(totalVol) };
}

let _endScreenSession = null;
function showSessionEnd(session) {
  _endScreenSession = session;
  window.location.hash = 'end';
  render();
}

function renderSessionEnd() {
  const root = $('#page-end');
  root.innerHTML = '';
  const s = _endScreenSession;
  if (!s) {
    root.innerHTML = '<div class="empty"><div class="big">✓</div><p class="muted">Session saved.</p><a class="btn primary" href="#home">Home</a></div>';
    return;
  }
  const stats = s.stats || { sets: 0, reps: 0, volume_kg: 0 };
  const prs = s.prs || [];
  const msgIdx = (state.msg_index - 1 + (RW.MOTIVATIONAL_MESSAGES?.length || 20)) % (RW.MOTIVATIONAL_MESSAGES?.length || 20);
  const msg = (RW.MOTIVATIONAL_MESSAGES || ['Eat. Sleep. Repeat.'])[msgIdx];

  const wrap = h('div', { class: 'session-end' },
    h('div', { class: 'hero' }, '💪'),
    h('h2', {}, 'Session done.'),
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

function assessSessionSubstitution(exercise_id, alt_id, scope) {
  const programme = getActiveProgramme();
  const allExercises = getAllExercises();
  const from = allExercises.find((exercise) => exercise.id === exercise_id);
  const to = allExercises.find((exercise) => exercise.id === alt_id);
  if (!from || !to) return { from, to, baseline: {}, projected: {}, ledger_delta: {}, classification: { severity: 'block-with-override', muscles_affected: [], message: 'Unknown exercise.' } };
  // The runner never interprets substitution volume itself. Domain code first
  // recomputes the fractional ledger, then classifies it clean/warn/block.
  const assessed = assessSubstitution({
    catalogue: allExercises,
    programme,
    substitution: {
      from_exercise_id: exercise_id,
      to_exercise_id: alt_id,
      scope,
      session_id: scope === 'this_session' ? state.active_session?.session_id : null,
    },
    existingSubstitutions: [],
  });
  return {
    from,
    to,
    baseline: assessed.ledger.baseline,
    projected: assessed.ledger.projected,
    ledger_delta: assessed.ledger.ledger_delta,
    classification: assessed.classification,
  };
}
function newLocalId(prefix) {
  return `${prefix}-${window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}
function recordSubstitution(exercise_id, alt_id, scope, assessment, override = null) {
  const entry = {
    id: newLocalId('sub'),
    user_key: String(settings.user_id || '').trim().toLowerCase(),
    programme_id: getActiveProgrammeId(),
    from_exercise_id: exercise_id,
    to_exercise_id: alt_id,
    scope,
    session_id: scope === 'this_session' ? state.active_session?.session_id : null,
    expires_after_week: scope === 'this_week' ? derivedWeek() : null,
    block: scope === 'this_block' ? derivedBlock() : null,
    created_at: new Date().toISOString(),
    ledger_delta: assessment.ledger_delta,
    warning: assessment.classification.severity === 'clean' ? null : assessment.classification,
    override,
  };
  state.substitutions = [...(state.substitutions || []), entry];
  return entry;
}
// The domain returns its own English sentence, which is right for tests and
// logs but was being shown verbatim to Raed on an Arabic-only screen. Rebuild it
// here from the structured fields instead of translating a formatted string.
function ledgerMessage(status) {
  const names = (status.offenders || []).map((item) => `${muscleLabel(item.muscle)} ${item.value}`).join(' · ');
  const low = status.bounds?.low;
  const high = status.bounds?.high;
  if (status.severity === 'block-with-override') return tf('ledger_blocked', { muscles: names, low, high });
  if (status.severity === 'warn') return tf('ledger_warn', { muscles: names, low, high });
  return tf('ledger_clean', { low, high });
}

function showSubstitutionScopeModal(exercise_id, exState, alt) {
  const modal = $('#modal');
  let scope = 'this_session';
  const draw = () => {
    // Deterministic arithmetic always runs before this UI assigns prose or asks
    // for consent, matching 24 §5.1's required order.
    const assessment = assessSessionSubstitution(exercise_id, alt.id, scope);
    const status = assessment.classification;
    modal.innerHTML = '';
    modal.appendChild(h('h3', {}, tf('adopt_named', { name: alt.name })));
    modal.appendChild(h('p', { class: 'tiny muted' }, t('substitution_ledger')));
    // This modal shipped entirely in English on an Arabic-only app. It escaped
    // the Arabic gate because that gate never opens it.
    modal.appendChild(h('div', { class: 'scope-picker' }, [
      ['this_session', t('swap_scope_session')], ['this_week', t('scope_this_week')],
      ['this_block', t('scope_this_block')], ['always', t('swap_scope_always')],
    ].map(([value, label]) => h('button', {
      class: 'btn tiny' + (scope === value ? ' primary' : ''),
      onClick: () => { scope = value; draw(); },
    }, label))));
    modal.appendChild(h('div', { class: `substitution-status ${status.severity}` },
      h('strong', {}, status.severity === 'clean' ? t('clean_status') : status.severity === 'warn' ? t('check_this') : t('blocked_without_override')),
      h('div', { class: 'tiny', 'data-ledger-message': 'true' }, ledgerMessage(status)),
      Object.keys(assessment.ledger_delta).length ? h('div', { class: 'tiny muted' }, tf('ledger_change', { detail: Object.entries(assessment.ledger_delta).map(([muscle, value]) => `${muscleLabel(muscle)} ${value > 0 ? '+' : ''}${value}`).join(' · ') })) : null,
    ));
    const adopt = (override = null) => {
      recordSubstitution(exercise_id, alt.id, scope, assessment, override);
      swapExercise(exercise_id, alt.id);
      $('#modal-overlay').classList.remove('show');
    };
    if (status.severity === 'block-with-override') {
      const original = getAllExercises().find((exercise) => exercise.id === exercise_id);
      const safe = (original?.alternatives || []).map((id) => getAllExercises().find((exercise) => exercise.id === id)).filter(Boolean)
        .find((candidate) => assessSessionSubstitution(exercise_id, candidate.id, scope).classification.severity !== 'block-with-override');
      if (safe) modal.appendChild(h('div', { class: 'tiny muted', style: 'margin:10px 0;' }, tf('safer_option', { name: safe.name })));
      modal.appendChild(h('button', { class: 'btn danger full', onClick: () => adopt({ accepted_at: new Date().toISOString(), reason: t('blocked_substitution_accepted') }) }, t('override_and_adopt')));
    } else {
      modal.appendChild(h('button', { class: 'btn primary full', 'data-adopt-swap': 'true', onClick: () => adopt() }, t('adopt_confirm')));
    }
    modal.appendChild(h('button', { class: 'btn ghost full', style: 'margin-top:8px;', onClick: () => $('#modal-overlay').classList.remove('show') }, t('cancel')));
  };
  draw();
  $('#modal-overlay').classList.add('show');
}
// The programme's own movement for this slot, regardless of what is running in
// it now. exercise_id is the planned id; swapped_to is the replacement.
function originalExerciseName(plannedId) {
  return getAllExercises().find((item) => item.id === plannedId)?.name || plannedId;
}

function swapExercise(exercise_id, alt_id) {
  if (!state.active_session) return;
  const ex = state.active_session.exercises[exercise_id];
  if (!ex) return;
  ex.swapped_to = alt_id;
  // Recalc suggested weight for the new exercise
  const altPlanned = { ...ex.planned, exercise_id: alt_id };
  const sug = suggestNextWeight(alt_id, altPlanned);
  ex.sets.forEach((set) => {
    if (!set.completed && !set.is_warmup) set.weight = editableWeightValue(sug.weight);
  });
  saveLocal();
  render();
  toast(tf('swapped_to', { name: getAllExercises().find(e => e.id === alt_id)?.name || alt_id }));
}

// ---- Rest timer --------------------------------------------
let restTimer = { interval: null, end: 0 };
// The programme prescribes rest PER EXERCISE — 2.5 min on the openers, 2.0, 1.5,
// and 0 on the first half of a superset. `rest_min` has been in data.js since the
// programme was transcribed and app.js consumed it NOWHERE: every set fell back
// to one global 120s. Worst case, the card told Raed A1/A2 run back-to-back with
// no rest and then started a two-minute timer on the same tap.
//
// The setting stays as the fallback for anything the programme does not specify.
function prescribedRestSeconds(planned) {
  const minutes = Number(planned?.rest_min);
  if (!Number.isFinite(minutes)) return settings.rest_seconds;
  return Math.round(minutes * 60);
}

function startRest(seconds) {
  if (restTimer.interval) clearInterval(restTimer.interval);
  restTimer.end = Date.now() + seconds * 1000;
  const el = $('#rest-timer');
  el.style.display = 'flex';
  // Ask for notification permission once, on first rest start
  if (settings.notifications) requestNotifPermissionIfNeeded();
  const tick = () => {
    const rem = Math.max(0, Math.round((restTimer.end - Date.now()) / 1000));
    $('#rest-timer-text').textContent = `${Math.floor(rem/60)}:${String(rem%60).padStart(2,'0')}`;
    if (rem === 0) {
      clearInterval(restTimer.interval);
      el.style.display = 'none';
      if (settings.vibrate && navigator.vibrate) navigator.vibrate([200,100,200]);
      toast('Rest over — get back to it.');
      fireRestEndNotification();
    }
  };
  tick();
  restTimer.interval = setInterval(tick, 200);
}
function cancelRest() {
  if (restTimer.interval) clearInterval(restTimer.interval);
  $('#rest-timer').style.display = 'none';
}

// ---- Renderers ---------------------------------------------

function render() {
  if (!settings.user_id) {
    document.body.classList.remove('runner-mode');
    renderWelcome();
    return;
  }
  document.body.classList.remove('welcome-mode');
  // Drives the home ordering: while LIFTING the exercise leads and the week
  // strip, tiles and music card drop below it. Warm-up keeps the normal order,
  // because there is no set to log yet.
  // Any live session, warm-up included. The warm-up used to keep the normal
  // home order on the reasoning that "there is no set to log yet" — but Raed is
  // doing arm swings at that point, not reading his streak, and he asked for
  // the pre-workout block to go the moment the workout starts.
  document.body.classList.toggle('session-active', Boolean(state.active_session));
  const route = window.location.hash.replace('#', '') || 'home';
  // Phase 6 intentionally returns the workout to the v15 card-in-app
  // treatment. It is a normal page, not the full-viewport Phase 4 takeover.
  document.body.classList.remove('runner-mode');
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + route));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === route));
  // The retired custom runner used to live here behind `if (false && ...)`, with
  // renderRunner/renderRunnerWarmup/renderV15Workout/renderSessionPreview/
  // appendV15HomeExerciseList below. All were unreachable: the guard short-circuits,
  // and nothing else called them. Removed because one of them was named
  // renderV15Workout while NOT being the live v15 card — the same name collision
  // that let a shadowing block hide the real session view for an entire phase.
  if (route === 'home') renderHome();
  // preview retired 2026-08-28 — Raed: the plan is already on home, do not list it twice
  if (route === 'coach') renderCoach();
  if (route === 'library') renderLibrary();
  if (route === 'history') renderHistory();
  if (route === 'settings') renderSettings();
  if (route === 'help') router('settings');
  if (route === 'end') renderSessionEnd();
}
function router(route) {
  window.location.hash = route;
  render();
}

function runnerEntries(activeSession = state.active_session) {
  return Object.entries(activeSession?.exercises || {});
}

function runnerExerciseIndex(activeSession = state.active_session) {
  const total = runnerEntries(activeSession).length;
  if (!total) return 0;
  return Math.max(0, Math.min(Number(activeSession.runner_exercise_index) || 0, total - 1));
}

function moveRunnerExercise(delta) {
  if (!state.active_session) return;
  const current = runnerExerciseIndex();
  const next = Math.max(0, Math.min(current + delta, runnerEntries().length - 1));
  if (next === current) return;
  state.active_session.runner_exercise_index = next;
  saveLocal();
  render();
}

function updateRunnerSet(exerciseId, setIndex, property, value) {
  const set = state.active_session?.exercises?.[exerciseId]?.sets?.[setIndex];
  if (!set) return;
  set[property] = value;
  if ((property === 'weight' || property === 'reps') && (set.invalid || set.invalid_prompted)) {
    // Editing is recovery, not a dead end: a corrected row is eligible for a
    // normal log again. The retained invalid record remains in already-ended
    // sessions, while an active session stays editable.
    set.invalid = null;
    set.invalid_prompted = false;
  }
  saveLocal();
}

function addRunnerSet(exerciseId) {
  const exerciseState = state.active_session?.exercises?.[exerciseId];
  if (!exerciseState) return;
  const lastWorking = [...exerciseState.sets].reverse().find((set) => !set.is_warmup);
  exerciseState.sets.push({
    is_warmup: false,
    weight: editableWeightValue(lastWorking?.weight),
    reps: lastWorking?.reps ?? workingRepTarget(exerciseState.planned),
    effort: null,
    completed: false,
  });
  saveLocal();
  render();
}

function resetCurrentRunnerSet(exerciseId) {
  const exerciseState = state.active_session?.exercises?.[exerciseId];
  if (!exerciseState) return;
  const set = exerciseState.sets.find((candidate) => !candidate.is_warmup && !candidate.completed && !candidate.skipped)
    || [...exerciseState.sets].reverse().find((candidate) => !candidate.is_warmup && !candidate.skipped);
  if (!set) return;
  // Reset is recovery for the current working row. It deliberately leaves an
  // explicitly skipped exercise alone: skip is a record, never a zero set.
  set.weight = '';
  set.reps = workingRepTarget(exerciseState.planned);
  set.effort = null;
  set.completed = false;
  set.invalid = null;
  set.invalid_prompted = false;
  saveLocal();
  render();
}

function toggleRunnerSet(exerciseId, setIndex) {
  const exerciseState = state.active_session?.exercises?.[exerciseId];
  const set = exerciseState?.sets?.[setIndex];
  if (!set) return;
  if (set.skipped) {
    toast(t('runner_exercise_skipped'));
    return;
  }
  if (set.invalid) {
    set.invalid = null;
    set.invalid_prompted = false;
    saveLocal();
    render();
    return;
  }
  const actualId = exerciseState.swapped_to || exerciseId;
  const workingSets = exerciseState.sets.filter((item) => !item.is_warmup);
  const isFinalWorkingSet = !set.is_warmup && set === workingSets[workingSets.length - 1];
  if (!set.completed) {
    if (!set.is_warmup) {
      const valuesAreValid = hasWorkingWeight(set.weight) && Number.isFinite(Number(set.reps)) && Number(set.reps) >= 1;
      if (valuesAreValid && isFinalWorkingSet && !set.effort) {
        toast('Final set: tap easy, medium, or very hard first.');
        return;
      }
      if (valuesAreValid && exerciseState.sets.some((prior, index) => index < setIndex && prior.is_warmup && !prior.completed)) {
        toast('Finish this exercise’s ramp set first.');
        return;
      }
      const result = applyWorkingSetAttempt(set, new Date().toISOString());
      Object.assign(set, result.set);
      if (result.outcome === 'confirm-invalid') {
        saveLocal();
        render();
        toast(t('runner_invalid_prompt'), 4200);
        return;
      }
      if (result.outcome === 'stored-invalid') {
        saveLocal();
        render();
        toast(t('runner_invalid_saved'), 3200);
        return;
      }
      detectPR(actualId, Number(set.weight), Number(set.reps));
    }
  }
  const wasCompleted = set.completed;
  if (set.is_warmup) set.completed = !set.completed;
  saveLocal();
  render();
  if (!wasCompleted && set.completed && !set.is_warmup) {
    startRest(settings.rest_seconds);
    if (settings.vibrate && navigator.vibrate) navigator.vibrate(50);
  }
}

function nextUnresolvedRunnerExerciseIndex(entries = runnerEntries()) {
  return entries.findIndex(([, exercise]) => !isRunnerExerciseResolved(exercise));
}

function skipRunnerExercise(exerciseId) {
  const active = state.active_session;
  const exercise = active?.exercises?.[exerciseId];
  if (!active || !exercise) return;
  active.exercises[exerciseId] = skipRunnerExerciseState(exercise, new Date().toISOString());
  const next = nextUnresolvedRunnerExerciseIndex();
  if (next >= 0) {
    active.runner_exercise_index = next;
    focusExerciseIdx = next;
  }
  saveLocal();
  render();
  toast(t('runner_exercise_skipped'));
}

function completeRunnerWarmup({ skipped = false } = {}) {
  const warmup = state.active_session?.warmup;
  if (!warmup) return;
  const now = new Date().toISOString();
  if (skipped) {
    warmup.skipped = true;
    warmup.skipped_at = now;
  }
  warmup.completed_at = now;
  state.active_session.phase = 'lifting';
  saveLocal();
  render();
}


function runnerLongPress(exerciseId, exerciseState) {
  let timer = null;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; };
  return {
    onPointerdown: () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        showAltModal(exerciseId, exerciseState);
      }, 600);
    },
    onPointerup: clear,
    onPointercancel: clear,
    onPointerleave: clear,
  };
}

function currentPlaylistPlatform(session) {
  const chosen = settings.music_platform || 'spotify';
  if (chosen === 'none') return null;
  if (Array.isArray(session?.playlists) || session?.playlists?.[chosen]?.length) return chosen;
  return session?.playlists?.spotify?.length ? 'spotify' : null;
}

// This is intentionally the v15 hand-off: show the selected platform's real
// playlist links, open them in a separate tab, and leave playback to Spotify.


// Phase 6: the old v15 workout card, deliberately retained as a card rather
// than another full-screen runner concept. State mutations still go through
// the Phase 4/5 guarded helpers so skip/invalid/weight rules are unchanged.


function showSessionPreview(session) {
  // Preview retired 2026-08-28. Raed: "خلاص ما أبغاه يعرض لي التمارين، على طول،
  // لأنه موجود خطة التمارين" — the plan is already on home, so pressing start
  // begins the session instead of listing the same exercises a second time.
  startSession(session);
  return;
}

function previewedSession() {
  const programme = getActiveProgramme();
  return programme.sessions.find((session) => session.id === state.preview_session_id)
    || getTodayPlannedSession()
    || getNextPlannedSession().session;
}


// The coach searches the 33 Nippard works Raed owns and shows what they actually
// say, each passage with its book and page. It NEVER writes an answer of its own.
// A generated training cue that sounds confident and is wrong is the one failure
// this feature cannot have, so there is no generation path to get wrong: the
// service has none, and neither does this.
// HTTPS, not the raw Tailscale IP. The app is served over HTTPS, and a browser
// refuses to fetch http:// from an https:// page — the request never leaves, and
// it looks like a network fault rather than the policy block it is.
//
// This WAS tailnet-only on :8444, on the reasoning that these passages are the
// text of books Raed paid for. That reasoning still holds, but the arrangement
// did not: :8444 cannot be funnelled, so the coach only ever answered a device
// already on the tailnet — and he does not want Tailscale on his phone.
//
// The trade he is making, stated plainly rather than buried: the endpoint is now
// public and gated by X-Coach-Key, and that key ships inside this file. It stops
// casual access and search engines; it does not stop someone who reads the
// deployed JavaScript. Verified refused without the key and with a wrong one.
// Port 8444 was never publicly reachable. Tailscale Funnel serves only 443,
// 8443 and 10000 — anything else reports "Funnel on" in the status output and
// silently answers nobody from the internet. That is why the coach needed
// Tailscale switched on to work at all, and Raed does not want Tailscale on his
// phone: "ما أبغى تليسكيل".
//
// It now rides the 443 funnel on a path, beside the P180 dashboard already
// there. Verified from the public ingress IP with Tailscale DNS bypassed:
// /coach/health returns 200 and /coach/search returns real passages.
const COACH_URL = 'https://raed-hp.tail53bd35.ts.net/coach';
// The endpoint is reachable from the open internet now, not only the tailnet,
// because Raed asked for the Tailscale requirement gone. That makes a key
// mandatory: without one anyone who found the URL could read the text of books
// he paid for. A key shipped in the app's JS is extractable by someone who
// looks — that is the stated trade — but it stops crawlers and scanners dead
// and can be rotated in one place on the server.
const COACH_KEY = 'oQq1nmXFMvfZ1M6A2gyiGWQeLB9h6xCW1e5DQW5ARWk';
const COACH_EXAMPLES = ['coach_eg_volume', 'coach_eg_failure', 'coach_eg_protein'];
let coachState = { status: 'idle', question: '', results: [], error: '' };

// Raed's library deliberately keeps both editions of two Nippard programmes,
// because their bytes differ and no supersession was ever proven. Retrieval does
// not know that: "how many sets per week" came back with page 92 of file A AND
// page 92 of file B, identical text, one above the other. Keep the first (they
// arrive sorted by score) and drop later passages whose text repeats it.
function dedupePassages(results) {
  const seen = new Set();
  return results.filter((passage) => {
    const key = String(passage.text || '').replace(/\s+/g, ' ').trim().slice(0, 160).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Arabic counts do not work like English ones. "2 مقاطع" is wrong: two takes the
// dual (مقطعان), one takes the singular, and 3–10 take the plural. top_k caps at
// 10 so those three cases are the whole range. English keeps its own simple rule.
function coachFoundLabel(count) {
  if (activeLanguage() !== 'ar') return tf('coach_found', { n: count });
  if (count === 1) return t('coach_found_one_ar');
  if (count === 2) return t('coach_found_two_ar');
  return tf('coach_found', { n: count });
}

async function askCoach(question, context = null) {
  // Only the NAME is sent, appended to the question. Sets, loads and history
  // stay on the device — he asked for a coach that knows which exercise he is
  // on, not one that reads his session.
  const sent = context ? `${question} ${context.name}` : question;
  coachState = { status: 'loading', question, results: [], error: '' };
  renderCoach();
  try {
    const res = await fetch(COACH_URL + '/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Coach-Key': COACH_KEY },
      // 0.5, not the service's 0.45 default. Measured on the re-embedded index:
      // every genuine Arabic answer scored 0.573 or better, while «وصفة كبسة لحم»
      // — a question the library cannot answer — scraped through at 0.486 onto a
      // meal-macros page. Cross-lingual scores sit lower than English ones, so
      // the floor has to clear that band without cutting into real answers.
      body: JSON.stringify({ question: sent, top_k: 5, min_score: 0.5 }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (data.status === 'no_match') {
      // A 200 carrying "nothing matched". Its own state — not an error, and not
      // an empty result list dressed up as an answer.
      coachState = { status: 'no_match', question, results: [], error: '' };
    } else if (data.status === 'ok' && Array.isArray(data.results) && data.results.length) {
      coachState = { status: 'ok', question, results: dedupePassages(data.results), error: '' };
    } else if (res.status === 401 || data.status === 'unauthorized') {
      // Distinct from "the server is down": the library answered, and refused.
      coachState = { status: 'unauthorized', question, results: [], error: '' };
    } else {
      coachState = { status: 'error', question, results: [], error: data.error || data.status || 'unknown' };
    }
  } catch (err) {
    // Unreachable is reported as unreachable. The library is on Raed's own
    // server, so the honest cause is almost always "phone is off Tailscale" —
    // saying that beats a spinner that never resolves.
    coachState = { status: 'offline', question, results: [], error: String(err?.message || err) };
  }
  renderCoach();
}

// What the coach is allowed to know about the session in progress.
//
// Raed asked for exactly this and explicitly NOT for more: "أبغى إذا انتقلت من
// حصة تدريبية إلى المدرب، المدرب يدري أنا في أي تدريب، أو أقدر أفعل هذا الخيار
// أو أطفيه". He turned down a coach that reads his sets and advises on them.
//
// So this is a search context, not an adviser: the name of the movement he is
// standing at, added to the question so he can ask "كم راحة؟" without typing
// which exercise he means. Nothing about his loads, his history or his
// performance crosses over, and the switch is his.
function activeCoachContext() {
  const session = state.active_session;
  if (!session || session.phase === 'warmup') return null;
  const entries = Object.entries(session.exercises || {});
  if (!entries.length) return null;
  const index = Math.min(Math.max(focusExerciseIdx ?? 0, 0), entries.length - 1);
  const [plannedId, exState] = entries[index];
  const actualId = exState?.swapped_to || plannedId;
  const exercise = getAllExercises().find((item) => item.id === actualId);
  if (!exercise) return null;
  return { id: actualId, name: exercise.name, sessionName: session.session_name || '' };
}

function renderCoach() {
  const root = $('#page-coach');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'page-header' }, h('h1', {}, t('coach'))));

  const input = h('input', {
    type: 'text', class: 'coach-input', value: coachState.question,
    placeholder: t('coach_placeholder'), 'data-coach-input': 'true',
    onKeydown: (ev) => { if (ev.key === 'Enter') submit(); },
  });
  const submit = () => {
    const question = input.value.trim();
    // The service rejects anything under 3 characters; catching it here keeps a
    // stray tap from rendering as a server error.
    if (question.length < 3) return;
    // The movement name rides along with the question rather than replacing it,
    // so "كم راحة؟" becomes a question about the machine he is standing at.
    const ctx = activeCoachContext();
    const useContext = ctx && settings.coach_use_context !== false;
    askCoach(question, useContext ? ctx : null);
  };

  // The handoff. Shown only while a session is actually running, because the
  // rest of the time there is nothing to hand off and the row would be chrome.
  const context = activeCoachContext();
  if (context) {
    root.appendChild(h('div', { class: 'coach-context', 'data-coach-context': 'true' },
      h('div', { class: 'coach-context-text' },
        h('span', { class: 'coach-context-label' }, t('coach_context_label')),
        ' ',
        h('bdi', { class: 'ltr-run' }, context.name),
      ),
      h('label', { class: 'coach-context-toggle' },
        h('input', {
          type: 'checkbox', 'data-coach-context-toggle': 'true',
          ...(settings.coach_use_context !== false ? { checked: 'checked' } : {}),
          onChange: (event) => {
            settings.coach_use_context = event.target.checked;
            saveLocal();
            renderCoach();
          },
        }),
        h('span', {}, t('coach_context_use')),
      ),
    ));
  }

  root.appendChild(h('div', { class: 'card compact', 'data-coach-ask': 'true' },
    h('div', { class: 'tiny muted', style: 'margin-bottom:6px;' }, t('coach_intro')),
    h('div', { class: 'coach-row' },
      input,
      h('button', { class: 'btn primary', onClick: submit, 'data-coach-submit': 'true' }, t('coach_ask')),
    ),
  ));

  if (coachState.status === 'idle') {
    root.appendChild(h('div', { class: 'card compact' },
      h('div', { class: 'tiny muted', style: 'margin-bottom:6px;' }, t('coach_try')),
      h('div', { class: 'coach-chips' }, COACH_EXAMPLES.map((example) => h('button', {
        class: 'btn tiny', onClick: () => { input.value = t(example); askCoach(t(example)); },
      }, t(example)))),
    ));
    return;
  }

  if (coachState.status === 'loading') {
    root.appendChild(h('div', { class: 'card compact tiny muted', 'data-coach-loading': 'true' }, t('coach_searching')));
    return;
  }

  // Three outcomes, three different things on screen. Collapsing them is how a
  // retrieval failure turns into a training answer Raed trusts and shouldn't.
  if (coachState.status === 'no_match') {
    root.appendChild(h('div', { class: 'card compact', 'data-coach-no-match': 'true' },
      h('strong', {}, t('coach_no_match')),
      h('p', { class: 'tiny muted' }, t('coach_no_match_hint')),
    ));
    return;
  }
  if (coachState.status === 'unauthorized') {
    root.appendChild(h('div', { class: 'card compact warn', 'data-coach-error': 'true' },
      h('strong', {}, t('coach_unauthorized')),
      h('p', { class: 'tiny muted' }, t('coach_unauthorized_hint')),
    ));
    return;
  }
  if (coachState.status === 'offline' || coachState.status === 'error') {
    root.appendChild(h('div', { class: 'card compact warn', 'data-coach-error': 'true' },
      h('strong', {}, t(coachState.status === 'offline' ? 'coach_offline' : 'coach_error')),
      h('p', { class: 'tiny muted' }, t('coach_offline_hint')),
      h('p', { class: 'tiny muted' }, h('bdi', { class: 'ltr-run' }, coachState.error)),
    ));
    return;
  }

  root.appendChild(h('div', { class: 'tiny muted', style: 'margin:2px 0 6px;', 'data-coach-count': 'true' },
    coachFoundLabel(coachState.results.length)));
  coachState.results.forEach((passage) => {
    root.appendChild(h('article', { class: 'card compact coach-passage', 'data-coach-passage': 'true' },
      h('div', { class: 'coach-source' },
        // Book titles are English and stay English (T1). h() isolates Latin runs
        // on its own, so no manual <bdi> here — that is what produced nested bdi.
        h('strong', {}, passage.work),
        h('span', { class: 'tiny muted' }, ' · ', tf('coach_page', { n: passage.page })),
      ),
      h('p', { class: 'coach-text' }, passage.text),
    ));
  });
  root.appendChild(h('p', { class: 'tiny muted', style: 'text-align:center;margin-top:4px;' }, t('coach_footer')));
}

function discardActiveSessionFromHome() {
  if (!state.active_session || !confirm(t('discard_current_session'))) return;
  state.active_session = null;
  state.forced_next_session = null;
  saveLocal();
  render();
}


function renderHome() {
  const root = $('#page-home');
  root.innerHTML = '';
  const planned = getTodayPlannedSession();
  const next = getNextPlannedSession();
  const streak = getStreak();
  const vol = getWeeklyVolume();
  const dow = ['weekday_sunday','weekday_monday','weekday_tuesday','weekday_wednesday','weekday_thursday','weekday_friday','weekday_saturday'][new Date().getDay()];

  // Header — structured (accent carries state via the progress meter / top rule)
  if (state.active_session) {
    const a = state.active_session;
    const parts = a.session_name.split(' — ');
    root.appendChild(h('div', { class: 'today-banner active', 'data-home-overview': 'true' },
      h('div', { class: 'tb-kicker' }, tf('runner_active_started', { time: fmtTime(a.started_at) })),
      h('h2', {}, parts[0]),
      h('p', {}, parts[1] || ''),
    ));
  } else if (planned) {
    const parts = planned.name.split(' — ');
    root.appendChild(h('div', { class: 'today-banner', 'data-home-overview': 'true' },
      h('div', { class: 'tb-kicker' }, isolate(t(dow)), ' · ', t('gym_day_plain')),
      h('h2', {}, parts[0]),
      // No subtitle when the name has no " — " half. The fallback was the FULL
      // name, so a session called just «سفلي أ» printed its own title twice.
      parts[1] ? h('p', {}, parts[1]) : null,
      h('div', { class: 'tb-meta' }, tf('home_exercise_count', { n: planned.exercises.length }), ' · ~', tf('home_minutes', { n: 70 })),
    ));
  } else {
    // data-home-overview marks "home drew its banner", not "a session is running",
    // so it belongs on all three branches. It was on the active branch alone, which
    // is why the fresh-install deploy gate — the one case that matters on launch
    // day — could not find it.
    root.appendChild(h('div', { class: 'today-banner rest', 'data-home-overview': 'true' },
      h('div', { class: 'tb-kicker' }, t('rest_day_plain')),
      h('h2', {}, tf('home_rest_next', { name: next.session.name.split(' — ')[0] })),
      h('p', {}, tf('home_rest_rotation', { day: next.session.day || next.session.name })),
      h('div', { class: 'tb-meta' }, tf('home_rest_recover', { protein: profileProteinRange() })),
    ));
  }

  // Stats row
  // Raed wanted to see his week before leaving the house. The programme has NO
  // weekday mapping on purpose — he decides which days he trains and the
  // rotation follows his history — so this cannot invent a calendar. What it
  // can say honestly: which days he actually trained (fact), what today is
  // (fact), and how many sessions are left this week (arithmetic).
  // Everything from here to the music card is pre-workout context. During a
  // running session it gets ordered BELOW the exercise (see .home-context in
  // styles.css): the first set row sat at y=952 on an 844px screen, so logging
  // the opening set of every exercise began with a scroll.
  const context = h('div', { class: 'home-context', 'data-home-context': 'true' });
  root.appendChild(context);

  context.appendChild(buildWeekStrip());

  context.appendChild(h('div', { class: 'stat-row', 'data-home-stat-tiles': 'true' },
    h('div', { class: 'stat-tile' },
      h('div', { class: 'stat-num' }, String(streak)),
      h('div', { class: 'stat-cap' }, t('home_streak')),
      h('div', { class: 'stat-sub' }, t('sessions_4wk')),
    ),
    h('div', { class: 'stat-tile' },
      h('div', { class: 'stat-num' }, String(vol.totalSets)),
      h('div', { class: 'stat-cap' }, t('this_week_plain')),
      h('div', { class: 'stat-sub' }, t('working_sets')),
    ),
    h('div', { class: 'stat-tile' },
      h('div', { class: 'stat-num' }, fmtKgTotal(vol.totalKg)),
      h('div', { class: 'stat-cap' }, t('home_tonnage')),
      h('div', { class: 'stat-sub' }, 'kg this week'),
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

  // This is deliberately the v15 block rather than a new music treatment.
  // Raed explicitly approved its glyph, wording, card and playlist chips.
  const activeSession = state.active_session;
  const activeProgrammeSession = activeSession
    ? getActiveProgramme().sessions.find((item) => item.id === activeSession.session_id)
    : null;
  const sessionForMusic = activeProgrammeSession || shownSession;
  const platformPlaylists = getCurrentPlaylists(sessionForMusic);
  if (platformPlaylists.length) {
    context.appendChild(h('div', { class: 'card compact home-v15-spotify', 'data-home-v15-spotify': 'true' },
      h('div', { class: 'tiny muted', 'data-home-spotify-handoff': 'true', style: 'margin-bottom:6px;' }, t('home_spotify_handoff')),
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
  // exercise cards, the terminal controls — never ran. Raed: "ما في زر Next،
  // Next exercise, previous، ما في". Removed so the original code owns this.

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
      root.appendChild(h('button', { class: 'btn danger ghost full', onClick: () => { if (confirm(t('discard_session'))) { state.active_session = null; focusExerciseIdx = null; saveLocal(); render(); } } }, t('discard_session')));
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
      focusExerciseIdx = curIdx;

      const total = exEntries.length;

      // Every exercise resolved — done or skipped. Raed: "إذا انتهى التمرين ما
      // تطلع الصفحة اللي فوق الكبيرة". Keeping the full exercise card, its
      // clips and its set grid on screen after the work is finished left a long
      // page with nothing left to do on it. Show what he asked for instead:
      // how long it took, and the way out.
      if (!sessionDoneDismissed && exEntries.every(([, entry]) => isRunnerExerciseResolved(entry))) {
        root.appendChild(buildSessionDonePanel(a, exEntries));
        root.appendChild(h('div', { class: 'card', style: 'margin-top:16px;' },
          h('button', { class: 'btn primary full', 'data-finish-session': 'true', onClick: endSession }, t('finish_and_save_session')),
          h('div', { class: 'spacer-12' }),
          h('button', { class: 'btn ghost full', onClick: () => { focusExerciseIdx = 0; sessionDoneDismissed = true; render(); } }, t('review_exercises')),
        ));
        return;
      }

      // Progress strip
    root.appendChild(h('div', { style: 'display:flex; gap:4px; margin-bottom:12px;', 'data-v15-session-progress': 'true' },
        exEntries.map(([id, ex], i) => {
          const allDone = isRunnerExerciseResolved(ex);
          return h('div', {
            style: `flex:1; height:6px; border-radius:999px; cursor:pointer; background:${allDone ? 'var(--good)' : (i === curIdx ? 'var(--accent)' : 'var(--border)')}`,
            onClick: () => { focusExerciseIdx = i; render(); }
          });
        })
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
        // but the settings gear sits in the middle of the header, exactly where
        // a swipe across the card ends. It was a <div> chevron before, so this
        // never bit; as a <button> it silently swallowed the gesture.
        // A 60px horizontal drag is unambiguously a swipe, and the click that
        // follows is already suppressed by swipeJustHappened, so the gear still
        // opens on a tap.
        if (e.target.closest('input, textarea, a, button:not(.ex-settings-btn)')) return;
        swipeJustHappened = true;
        const step = dx < 0 ? 1 : -1;
        const nextIdx = Math.min(total - 1, Math.max(0, curIdx + step));
        if (nextIdx === curIdx) return;
        focusExerciseIdx = nextIdx;
        render();
      });

      // Prev / Next nav
      root.appendChild(h('div', { style: 'display:flex; gap:8px; margin-top:12px;' },
        h('button', { class: 'btn', style: 'flex:1;', onClick: () => { focusExerciseIdx = Math.max(0, curIdx - 1); render(); } }, t('previous')),
        curIdx < total - 1
          ? h('button', { class: 'btn primary', style: 'flex:2;', onClick: () => { focusExerciseIdx = curIdx + 1; render(); } }, t('next_exercise_arrow'))
          : h('button', { class: 'btn primary', style: 'flex:2;', onClick: endSession }, t('end_session')),
      ));
    }

    root.appendChild(h('div', { class: 'card', style: 'margin-top:16px;' },
      h('button', { class: 'btn primary full', onClick: endSession }, t('finish_and_save_session')),
      h('div', { class: 'spacer-12' }),
      h('button', { class: 'btn danger ghost full', onClick: () => { if (confirm(t('discard_session'))) { state.active_session = null; focusExerciseIdx = null; saveLocal(); render(); } } }, t('discard_session')),
    ));
  } else {
    // Show today's planned exercises preview
    const sess = planned || next.session;
    root.appendChild(h('div', { class: 'spacer-24' }));
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
            // one isolated LTR run rather than a bare template string — and the
            // row reads left-to-right like the name it carries. Raed: "ترتيب
            // التمارين واحد اثنين... المفروض يصير على left side، لأن التمرين
            // بالإنجليزي".
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

function renderExerciseCard(ex_id, exState) {
  const planned = exState.planned;
  const actualId = exState.swapped_to || ex_id;
  const ex = getAllExercises().find(e => e.id === actualId);
  if (!ex) return h('div', {}, tf('unknown_exercise', { id: actualId }));
  const sug = suggestNextWeight(actualId, planned);
  const last = getLastPerformance(actualId);
  const allWorkingDone = isRunnerExerciseResolved(exState);

  const card = h('div', { class: 'ex' + (allWorkingDone ? ' done' : ''), id: 'ex-' + ex_id });
  const isOpen = card.classList.contains('expanded');

  // Head — thumbnail is the body-anatomy illustration (cleaner than action shots)
  const bodyUrl = RW.bodyImg ? RW.bodyImg(ex.primary) : '';
  const head = h('div', { class: 'ex-head', onClick: () => {
    // Was also rewriting the ▸/▾ glyph on .ex-status. That element is now the
    // settings button, so the query returned null and every header tap threw —
    // collapsing stopped working entirely. The card's own class is the state;
    // nothing needs to mirror it in text.
    card.classList.toggle('expanded');
  }},
    h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
    h('div', { class: 'ex-info' },
      // T1: catalogue exercise names remain English even in the Arabic UI.
      h('h4', {}, h('bdi', { class: 'ltr-run' }, ex.name)),
      h('div', { class: 'meta' },
        ex.primary.map(m => h('span', { class: 'muscle-tag' }, muscleLabel(m))),
        ` ${planned.sets} × ${planned.reps}`,
      ),
      // A swapped card used to show only the replacement, so the programme's own
      // movement vanished with no trace and Raed could not tell a substitution
      // from the plan itself. Name both, and which direction it went.
      exState.swapped_to ? h('div', { class: 'swap-note tiny', 'data-swap-note': 'true' },
        h('span', { class: 'swap-badge' }, t('swapped_badge')),
        ' ',
        tf('swapped_from', { name: originalExerciseName(ex_id) }),
      ) : null,
    ),
    // Was a ▸/▾ chevron that only mirrored the card's state, while the whole
    // header did the collapsing. Raed asked for a settings entry in its place;
    // since the chevron never was the control, replacing it removes nothing —
    // tapping the header still collapses.
    h('button', {
      class: 'ex-settings-btn' + (allWorkingDone ? ' done' : ''),
      'data-exercise-settings': 'true',
      'aria-label': t('exercise_settings'),
      title: t('exercise_settings'),
      onClick: (event) => { event.stopPropagation(); showExerciseSettings(ex_id, exState); },
    }, allWorkingDone ? '✓' : '⚙'),
  );
  card.appendChild(head);

  // Body
  const body = h('div', { class: 'ex-body' });
  if (last) {
    const ws = (last.sets || []).filter(s => !s.is_warmup && s.completed);
    if (ws.length) {
      body.appendChild(h('div', { class: 'last-time' },
        h('strong', {}, 'Last time'), ` (${fmtDate(last.date)}): `,
        ws.map(s => `${s.weight}×${s.reps}`).join(', ')
      ));
    }
  }
  // Videos — Library controls which are visible via state.video_hidden
  const allVideos = buildExerciseVideos(actualId, ex);
  if (allVideos.length) {
    const videoRow = h('div', { class: 'video-row' },
      allVideos.map(v => buildVideoTile(v))
    );
    body.appendChild(videoRow);
    // Note: video selection + JN URL editing live in Library, not here.
  }

  // The one number that actually moves the weight. The engine raises load only
  // when EVERY working set hits the TOP of the rep range, so a range alone left
  // Raed guessing whether 10 or 12 was the point -- and 10 would have held the
  // weight still forever without explaining why.
  // The engine has always explained WHY it suggests this weight. v16 kept the
  // calculation and dropped the render, so the number looked arbitrary — the
  // exact thing Raed complained about not understanding. Shown compactly, above
  // the rep goal, and NOT as a form cue (those he removed on purpose).
  if (exState.machine_weight) {
    // Replaces the load reasoning rather than sitting beside it: with no added
    // weight there is no load to explain, and reps are the only lever left.
    body.appendChild(h('div', { class: 'why-weight tiny', 'data-why-weight': 'true' }, t('machine_weight_note')));
  } else if (sug.note) {
    body.appendChild(h('div', { class: 'why-weight tiny', 'data-why-weight': 'true' }, sug.note));
  }

  const repTop = String(planned.reps).split('-').map((part) => parseInt(part, 10)).filter(Number.isFinite).pop();
  if (repTop) {
    body.appendChild(h('div', { class: 'reps-goal tiny', 'data-reps-goal': 'true' }, tf('reps_goal', { n: repTop })));
  }

  // A1/A2 run back to back. superset_group has been in data.js since the
  // programme was transcribed and was read by nothing, so the app rested 2:00
  // between the paired curl and triceps extension where Jeff prescribes 0.
  const activeSessionPlan = getActiveProgramme()?.sessions?.find((item) => item.id === state.active_session?.session_id);
  const partner = supersetPartner(activeSessionPlan, planned);
  if (partner) {
    body.appendChild(h('div', { class: 'superset-note tiny', 'data-superset': 'true' },
      tf('superset_with', { name: getAllExercises().find((item) => item.id === partner.exercise_id)?.name || partner.exercise_id })));
  }

  // Sets table
  body.appendChild(h('div', { class: 'spacer-12' }));
  body.appendChild(h('div', { class: 'set-grid-headers' },
    h('span', {}, '#'),
    h('span', {}, 'Weight (kg)'),
    h('span', {}, 'Reps'),
    h('span', {}, ''),
  ));
  exState.sets.forEach((set, idx) => {
    const isWarm = set.is_warmup;
    const setNum = isWarm ? `W${idx+1}` : `${idx - exState.sets.filter(s => s.is_warmup).length + 1}`;
    const workingSets = exState.sets.filter((item) => !item.is_warmup);
    const isFinalWorkingSet = !isWarm && set === workingSets[workingSets.length - 1];
    const row = h('div', {
      class: 'set-grid' + (isWarm ? ' warm' : '') + (set.completed && !isWarm ? ' done' : '') + (set.skipped ? ' skipped' : '') + (set.is_extra ? ' extra' : ''),
      'data-session-set-row': String(idx),
      'data-set-kind': isWarm ? 'warmup' : 'working',
    },
      h('div', { class: 'set-num' }, setNum + (isWarm ? '' : '')),
      h('input', {
        type: 'number', step: '0.5', inputmode: 'decimal',
        // lang/dir force Latin digits and a number pad. Without them an Arabic
        // keyboard opens and Raed has to switch language for every set.
        lang: 'en', dir: 'ltr',
        placeholder: exState.machine_weight ? t('machine_weight_short') : suggestedWeightPlaceholder(sug.weight),
        readOnly: Boolean(exState.machine_weight),
        value: editableWeightValue(set.weight),
        'data-runner-weight-input': 'true',
        disabled: Boolean(set.skipped),
        onFocus: (e) => { try { e.target.select(); } catch(_) {} },
        onInput: (e) => { set.weight = e.target.value === '' ? '' : parseFloat(e.target.value); saveLocal(); }
      }),
      h('input', {
        type: 'number', step: '1', inputmode: 'numeric',
        lang: 'en', dir: 'ltr',
        placeholder: String(planned.reps),
        value: set.reps ?? '',
        onFocus: (e) => { try { e.target.select(); } catch(_) {} },
        onInput: (e) => { set.reps = e.target.value === '' ? '' : parseInt(e.target.value, 10); saveLocal(); }
      }),
      h('button', {
        class: 'set-check' + (set.completed ? ' checked' : '') + (set.skipped ? ' skipped' : ''),
        disabled: Boolean(set.skipped),
        onClick: () => {
          if (!set.completed) {
            // hasValidWorkingValues, NOT hasWorkingWeight. The card carried its
            // own stricter copy of the rule requiring weight > 0, so a
            // «وزن الجهاز فقط» set — which is legitimately 0 kg — could be
            // created but never ticked complete. The domain function already
            // distinguishes an explicit 0 from an untouched empty box; keeping
            // a second rule here is what let the two drift apart.
            if (!isWarm && !hasValidWorkingValues(set)) {
              toast(t('required'));
              return;
            }
            if (isFinalWorkingSet && !set.effort) {
              toast(t('final_set_prompt'));
              return;
            }
            if (!isWarm && exState.sets.some((prior, priorIndex) => priorIndex < idx && prior.is_warmup && !prior.completed)) {
              toast('Finish this exercise’s ramp set first.');
              return;
            }
            // PR detection (silent)
            if (!isWarm && set.weight && set.reps) detectPR(actualId, parseFloat(set.weight), parseInt(set.reps, 10));
          }
          set.completed = !set.completed;
          saveLocal();
          render();
          if (set.completed && !isWarm) {
            const restSeconds = prescribedRestSeconds(planned);
            if (restSeconds > 0) startRest(restSeconds);
            if (settings.vibrate && navigator.vibrate) navigator.vibrate(50);
          }
        }
      }, set.skipped ? '↷' : set.completed ? '✓' : ''),
    );
    if (isFinalWorkingSet) {
      // Raed: "ليش ما تحطها بشكل أنظف جنب الجلسة الأخيرة؟ ليش حاطها تحت، كأن
      // مسبب زحمة؟" — it was a full-width block under the sets. Now it is one
      // compact face ON the final row; tapping it reveals the three, and
      // choosing collapses them again. This is v15's own interaction.
      // Raed: it should appear the moment the SECOND-TO-LAST set is ticked,
      // because by then he already knows the last one is coming and the picker
      // is what the last one needs. Waiting until he taps the final check makes
      // him tap twice and reads as the app blocking him.
      // Raed: the trigger button is redundant — the picker already opens by
      // itself when the SECOND-TO-LAST set is ticked, so a face whose only job
      // is to open something that has already opened is chrome. The strip is
      // shown directly: prompting when the prior set is done, and staying
      // visible afterwards to show the choice he made.
      const priorSet = workingSets[workingSets.length - 2];
      const promptNow = Boolean(priorSet?.completed) && !set.effort;
      const openNow = Boolean(set.effort) || promptNow;
      const strip = h('div', { class: 'effort-strip' + (promptNow ? ' prompting' : ''),
                               hidden: openNow ? undefined : true });
      row.appendChild(h('span', { class: 'effort-slot' }));
      strip.appendChild(effortPicker(set, () => { saveLocal(); render(); }));
      body.appendChild(row);
      body.appendChild(strip);
      return;
    }
    // Every other row keeps the fifth cell empty so the columns stay aligned.
    row.appendChild(h('span', { class: 'effort-slot' }));
    body.appendChild(row);
  });

  // Action row: alternatives + add set + warmup helper
  if (planned.warmup) {
    body.appendChild(h('div', { class: 'warmup-block' },
      h('strong', {}, '⚠ ', t('warmup'), ': '), warmupText(planned, sug.weight)
    ));
  }

  // The per-set row is empty now. Everything that used to sit here — + مجموعة,
  // راحة, استبدال, تخطي التمرين, + فيديو, + تمرين, وزن الجهاز فقط — belongs to
  // the EXERCISE, not to the set he is in the middle of, and it now lives in
  // the settings sheet behind the gear. Raed asked for the row under the sets to
  // be clear of them. Nothing was removed; it is one tap away, grouped by what
  // each control actually is.
  //
  // The gear in the card header is the way in, and the header still collapses
  // on tap, so the row costs nothing to reach.

  card.appendChild(body);
  return card;
}

// Raed: "الـexercise هذا ما تبدل، أضف لي exercise على نهاية التمرين". Swapping
// REPLACES a prescribed movement and charges the volume ledger against it.
// Appending adds a movement the programme never asked for, at the end, without
// touching anything above it. They are different actions and he wanted both.
function showAddExerciseModal() {
  const inSession = new Set(Object.keys(state.active_session?.exercises || {}));
  const options = getAllExercises()
    .filter((item) => !inSession.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Same modal plumbing as showAltModal -- #modal + the .show class on the
  // overlay. There is no openModal()/closeModal() helper in this file.
  const modal = $('#modal');
  modal.innerHTML = '';
  modal.appendChild(h('h3', {}, t('add_exercise_title')));
  modal.appendChild(h('p', { class: 'tiny muted' }, t('add_exercise_hint')));
  const search = h('input', {
    type: 'search', class: 'search-input', placeholder: t('search_exercise'),
    onInput: (e) => {
      const needle = e.target.value.trim().toLowerCase();
      modal.querySelectorAll('[data-add-exercise-option]').forEach((node) => {
        node.hidden = Boolean(needle) && !node.textContent.toLowerCase().includes(needle);
      });
    },
  });
  modal.appendChild(search);
  options.forEach((item) => modal.appendChild(h('button', {
    class: 'btn full', style: 'margin-top:6px; text-align:start;',
    'data-add-exercise-option': item.id,
    onClick: () => {
      appendExerciseToSession(item.id);
      $('#modal-overlay').classList.remove('show');
    },
  },
    h('strong', {}, item.name),
    h('span', { class: 'tiny muted' }, ' · ', muscleLabel(item.primary?.[0])),
  )));
  modal.appendChild(h('button', {
    class: 'btn ghost full', style: 'margin-top:10px;',
    onClick: () => $('#modal-overlay').classList.remove('show'),
  }, t('cancel')));
  $('#modal-overlay').classList.add('show');
}

function appendExerciseToSession(exerciseId) {
  const active = state.active_session;
  if (!active) return;
  const exercise = getAllExercises().find((item) => item.id === exerciseId);
  if (!exercise || active.exercises[exerciseId]) return;
  // Three sets of ten is the app's own default, not a prescription from the
  // programme, so the entry is flagged added_by_user and its sets are extra.
  const planned = { exercise_id: exerciseId, sets: 3, reps: '10-12', added_by_user: true };
  const suggested = suggestNextWeight(exerciseId, planned);
  active.exercises[exerciseId] = {
    planned,
    added_by_user: true,
    sets: Array.from({ length: 3 }, () => ({
      is_warmup: false, is_extra: true,
      weight: suggested.weight, reps: workingRepTarget(planned), effort: null, completed: false,
    })),
    swapped_to: null,
  };
  saveLocal();
  render();
  toast(tf('added_to_today', { name: exercise.name }));
}


// The last few sessions for one movement, newest first, each labelled with the
// machine it was performed on. Deliberately every device, not just the selected
// one — the table exists to SHOW the difference between machines, which is
// exactly what the per-device history correctly hides while training.
function exerciseHistoryRows(exerciseId, limit = 6) {
  const rows = [];
  for (let i = state.history.length - 1; i >= 0 && rows.length < limit; i--) {
    const session = state.history[i];
    const entry = session.exercises?.[exerciseId];
    const sets = (entry?.sets || []).filter(isCountableWorkingSet);
    if (!sets.length) continue;
    const top = sets.reduce((best, set) =>
      (Number(set.weight) || 0) > (Number(best.weight) || 0) ? set : best, sets[0]);
    rows.push({
      date: session.date,
      device: entry.device || '',
      sets: sets.length,
      topWeight: Number(top.weight) || 0,
      topReps: Number(top.reps) || 0,
    });
  }
  return rows;
}

// The per-exercise settings sheet.
//
// Everything that belongs to ONE movement lives here. Raed asked for it to be
// designed properly — "neat, جميل, مرتب" — and the reason a flat stack of rows
// would fail is that these controls are not the same KIND of thing:
//
//   الجهاز    what this movement is performed on. Configuration, set once.
//   السجل     what he has actually lifted here. Evidence, read-only.
//   إجراءات   things he can do to this exercise right now. Verbs.
//
// The sheet is structured in that order because it is true of the content, not
// because three sections look tidy. Configuration is what he changes rarely and
// wants to confirm; the record is what he opens the sheet to READ mid-workout;
// the verbs are what he came to press.
//
// The table is the signature. It is the only surface in the app that shows one
// movement across different machines side by side, which is the whole point of
// remembering the machine — a weight history that mixes them is a history of
// nothing. So it gets real typographic care: a header, tabular numerals, the
// load dominant, the machine a quiet tag.
function showExerciseSettings(ex_id, exState) {
  const actualId = exState.swapped_to || ex_id;
  const ex = getAllExercises().find((e) => e.id === actualId);
  const planned = exState.planned;
  const prefs = exercisePrefs(actualId);
  const modal = $('#modal');
  modal.innerHTML = '';

  const close = () => $('#modal-overlay').classList.remove('show');
  const reopen = () => { render(); showExerciseSettings(ex_id, exState); };
  const closeThen = (fn) => { close(); fn(); };

  // ---- header: the movement, and the machine it is on -------------------
  modal.appendChild(h('div', { class: 'xs-head' },
    h('h3', {}, h('bdi', { class: 'ltr-run' }, ex?.name || actualId)),
    h('div', { class: 'xs-sub' },
      prefs.device
        ? h('bdi', { class: 'ltr-run' }, prefs.device)
        : t('no_device_yet')),
  ));

  // ---- 1. الجهاز — configuration ----------------------------------------
  const kindSelect = h('select', {
    'data-equipment-kind': 'true',
    'aria-label': t('equipment_kind'),
    onChange: (e) => { prefs.equipment = e.target.value; saveLocal(); reopen(); },
  },
    h('option', { value: '' }, t('equipment_unset')),
    EQUIPMENT_KINDS.map((kind) => h('option',
      prefs.equipment === kind ? { value: kind, selected: 'selected' } : { value: kind },
      t('equip_' + kind))),
  );

  const deviceInput = h('input', {
    type: 'text', class: 'search-input', maxLength: 40,
    placeholder: t('device_placeholder'), value: prefs.device || '',
  });

  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-label' }, t('equipment_section')),
    // A dropdown, at his request: five kinds wrapped badly as chips, and this is
    // a single-choice field with a stable list — exactly what a select is for.
    h('div', { class: 'xs-field' }, kindSelect),
    prefs.known_devices.length
      ? h('div', { class: 'device-chips', 'data-known-devices': 'true' },
          prefs.known_devices.map((name) => h('button', {
            type: 'button',
            class: 'chip' + (prefs.device === name ? ' active' : ''),
            onClick: () => { prefs.device = prefs.device === name ? '' : name; saveLocal(); reopen(); },
          }, h('bdi', { class: 'ltr-run' }, name))))
      : null,
    h('div', { class: 'xs-add-device' },
      deviceInput,
      h('button', {
        class: 'btn primary',
        onClick: () => { rememberDevice(actualId, deviceInput.value); reopen(); },
      }, t('save')),
    ),
    // Small and quiet: a once-per-exercise fact about the equipment, not an
    // action. It sits with the machine it describes.
    h('label', { class: 'xs-toggle' },
      h('input', {
        type: 'checkbox', 'data-machine-weight': 'true',
        ...(exState.machine_weight ? { checked: 'checked' } : {}),
        onChange: () => {
          exState.machine_weight = !exState.machine_weight;
          if (exState.machine_weight) {
            for (const set of exState.sets) if (!set.is_warmup && !set.completed) set.weight = 0;
          }
          saveLocal(); reopen();
        },
      }),
      h('span', {}, t('machine_weight_only_short')),
    ),
  ));

  // ---- 2. السجل — evidence ----------------------------------------------
  const rows = exerciseHistoryRows(actualId, 3);
  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-label' }, t('exercise_log')),
    rows.length
      ? h('table', { class: 'xs-log', 'data-exercise-log': 'true' },
          h('thead', {}, h('tr', {},
            h('th', {}, t('log_col_date')),
            h('th', {}, t('log_col_best')),
            h('th', {}, t('log_col_sets')),
            h('th', {}, t('log_col_device')),
          )),
          h('tbody', {}, rows.map((row) => h('tr', {},
            h('td', { class: 'xs-log-date' }, fmtDateShort(row.date)),
            h('td', { class: 'xs-log-load' },
              h('bdi', { class: 'ltr-run' }, `${fmtLoadKg(row.topWeight)} × ${row.topReps}`)),
            h('td', { class: 'xs-log-sets' }, h('bdi', { class: 'ltr-run' }, String(row.sets))),
            h('td', { class: 'xs-log-device' },
              row.device ? h('bdi', { class: 'ltr-run' }, row.device) : '—'),
          ))),
        )
      : h('div', { class: 'xs-empty' }, t('exercise_log_empty')),
  ));

  // ---- 3. إجراءات — verbs ------------------------------------------------
  const rest = prescribedRestSeconds(planned);
  modal.appendChild(h('section', { class: 'xs-section' },
    h('div', { class: 'xs-label' }, t('actions_section')),
    // One button, straight to the list. He asked for exactly this: "لا أبغاك
    // ترتبها تكون زر واحد استبدال وعلى طول" — no paragraph explaining it.
    h('button', {
      class: 'btn primary full xs-primary', 'data-open-swap': 'true',
      onClick: () => closeThen(() => showAltModal(ex_id, exState)),
    }, t('swap')),
    h('div', { class: 'xs-grid' },
      h('button', {
        class: 'btn xs-action', 'data-add-set': 'true',
        onClick: () => {
          const lastWorking = [...exState.sets].reverse().find((set) => !set.is_warmup);
          // Marked beyond-plan so the card never implies the programme asked for it.
          exState.sets.push({ is_warmup: false, is_extra: true, weight: editableWeightValue(lastWorking?.weight), reps: workingRepTarget(planned), effort: null, completed: false });
          saveLocal(); close(); render();
        },
      }, t('add_set')),
      rest > 0
        ? h('button', {
            class: 'btn xs-action', 'data-rest-button': 'true',
            onClick: () => closeThen(() => startRest(rest)),
          }, tf('rest_seconds', { seconds: `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}` }))
        // A prescribed zero is an instruction to go straight into the paired
        // movement, not a short rest. Offering a 0:00 timer would be absurd.
        : h('span', { class: 'btn xs-action is-static', 'data-no-rest': 'true' }, t('no_rest_superset')),
      h('button', {
        class: 'btn xs-action', 'data-video-add': 'true',
        onClick: () => closeThen(() => addCustomVideo(ex_id)),
      }, t('video_add_short')),
      h('button', {
        class: 'btn xs-action', 'data-add-exercise': 'true',
        onClick: () => closeThen(() => showAddExerciseModal()),
      }, t('add_exercise_button')),
    ),
    // Skipping ends this movement for the session. It is the one destructive
    // thing in the sheet, so it sits apart from the grid rather than beside
    // "+ set" at the same weight.
    h('button', {
      class: 'btn danger ghost full xs-skip', 'data-runner-skip-exercise': 'true',
      onClick: () => closeThen(() => skipRunnerExercise(ex_id)),
    }, t('runner_skip_exercise')),
  ));

  modal.appendChild(h('button', { class: 'btn full xs-done', onClick: close }, t('done')));
  $('#modal-overlay').classList.add('show');
}

function showAltModal(ex_id, exState) {
  const allEx = getAllExercises();
  const ex = allEx.find(e => e.id === (exState.swapped_to || ex_id));
  const m = $('#modal');
  m.innerHTML = '';

  // Section header helper
  const sectionHead = (title, sub) => h('div', { style: 'margin: 14px 0 6px;' },
    h('div', { style: 'font-size:13px; font-weight:600; color:var(--text);' }, title),
    sub ? h('div', { class: 'tiny muted', style: 'margin-top:2px;' }, sub) : null,
  );
  const altCard = (alt, onClick) => {
    const bodyUrl = RW.bodyImg ? RW.bodyImg(alt.primary) : '';
    return h('div', {
      class: 'ex swap-option', style: 'cursor:pointer; margin-bottom:6px; touch-action:pan-y;',
      onClick,
    },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
        h('div', { class: 'ex-info' },
          h('h4', {}, alt.name),
          h('div', { class: 'meta' }, (alt.primary || []).map(muscleLabel).join(', '), t('tap_inspect')),
        ),
      ),
    );
  };

  m.appendChild(h('h3', {}, t('swap')));

  // ===== SECTION 1: Replace =====
  // The PROGRAMME's own substitutes come first. §8.4 authors a sub1/sub2 for
  // every row — Chest Press Machine prescribes Flat DB Press and Hammer Strength
  // Press — and this modal was reading only the catalogue's generic
  // `alternatives`, which for that same exercise are Incline Chest Press and Pec
  // Deck. Swapping therefore offered movements the programme never chose.
  //
  // The catalogue list still follows, so nothing is taken away; the sourced ones
  // simply lead, because they were picked for THIS slot.
  const plannedRow = exState?.planned || {};
  const programmeSubs = [plannedRow.sub1, plannedRow.sub2].filter(Boolean);
  const orderedIds = [...new Set([...programmeSubs, ...(ex?.alternatives || [])])]
    .filter((id) => id !== (exState?.swapped_to || ex_id));
  const validAlts = orderedIds.map(id => allEx.find(e => e.id === id)).filter(Boolean);
  if (validAlts.length) {
    m.appendChild(sectionHead('Replace with…', 'Tap to calculate the ledger before adopting.'));
    validAlts.forEach(alt => m.appendChild(altCard(alt, () => {
      showSubstitutionScopeModal(ex_id, exState, alt);
    })));
  }

  // ===== SECTION 2: Add another exercise =====
  m.appendChild(sectionHead('Add another exercise to today', 'Appends to the end of this session. Doesn\'t modify the original programme.'));

  const searchInput = h('input', {
    type: 'search', class: 'search-input',
    placeholder: '🔍 Search any exercise…',
    style: 'margin-bottom:8px;',
    onInput: (e) => {
      const q = e.target.value.toLowerCase();
      list.innerHTML = '';
      const matched = allEx
        .filter(x => !state.active_session?.exercises?.[x.id])  // not already in session
        .filter(x => (x.name + ' ' + (x.name_ar || '')).toLowerCase().includes(q))
        .slice(0, 30);
      matched.forEach(x => list.appendChild(altCard(x, () => {
        addExerciseToSession(x.id);
        $('#modal-overlay').classList.remove('show');
        toast(tf('added_to_today', { name: x.name }));
      })));
      if (!matched.length) {
        list.appendChild(h('div', { class: 'tiny muted', style: 'padding:8px; text-align:center;' }, 'No matches.'));
      }
    }
  });
  m.appendChild(searchInput);
  const list = h('div');
  m.appendChild(list);

  m.appendChild(h('button', { class: 'btn ghost full', style: 'margin-top:14px;',
    onClick: () => $('#modal-overlay').classList.remove('show')
  }, 'Cancel'));

  $('#modal-overlay').classList.add('show');
  // Trigger initial empty render so user sees "type to search"
  setTimeout(() => searchInput.focus(), 100);
}

// Append an exercise to the active session. Doesn't touch PROGRAMME.
function addExerciseToSession(exercise_id) {
  if (!state.active_session) return;
  const allEx = getAllExercises();
  const ex = allEx.find(e => e.id === exercise_id);
  if (!ex) return;
  // Default planned spec for an ad-hoc add
  const planned = {
    exercise_id, sets: 3, reps: '10', rpe: '8',
    is_first_of_muscle: false,
  };
  const sug = suggestNextWeight(exercise_id, planned);
  const sets = [];
  for (let i = 0; i < planned.sets; i++) {
    sets.push({ is_warmup: false, weight: editableWeightValue(sug.weight), reps: workingRepTarget(planned), effort: null, completed: false });
  }
  state.active_session.exercises[exercise_id] = { planned, sets };
  saveLocal();
  render();
}

function renderLibrary() {
  const root = $('#page-library');
  root.innerHTML = '';
  const allEx = getAllExercises();
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, 'Exercise library'),
    h('div', { class: 'sub' }, tf('library_group_summary', { n: allEx.length })),
  ));

  let search = window._libSearch || '';
  const searching = search.trim().length > 0;

  const searchInput = h('input', {
    type: 'search', class: 'search-input',
    placeholder: '🔍 Search exercises…',
    value: search,
    onInput: (e) => { window._libSearch = e.target.value; renderLibrary(); }
  });
  root.appendChild(h('div', { class: 'search-row' }, searchInput));

  // + Add Custom Exercise button
  root.appendChild(h('button', {
    class: 'btn primary full', style: 'margin-bottom:14px;',
    onClick: () => openAddCustomExerciseModal(),
  }, '➕ Add Custom Exercise'));

  // Filter exercises by search (applied globally, then re-grouped)
  const matchesSearch = (ex) => {
    if (!searching) return true;
    const q = search.toLowerCase();
    return (ex.name + ' ' + (ex.name_ar || '') + ' ' + (ex.primary || []).join(' ')).toLowerCase().includes(q);
  };

  const filteredEx = allEx.filter(matchesSearch);

  if (!filteredEx.length) {
    root.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '🤷'), 'No exercises match.'));
    return;
  }

  // Render hierarchy
  for (const group of LIB_HIERARCHY) {
    const groupExercises = [];
    const groupSections = [];
    for (const [subKey, subInfo] of Object.entries(group.submuscles)) {
      const subExercises = filteredEx.filter(ex => exerciseInGroup(ex, subInfo.keys));
      if (subExercises.length === 0) continue;
      groupExercises.push(...subExercises);
      groupSections.push({ key: subKey, info: subInfo, exercises: subExercises });
    }
    if (groupExercises.length === 0) continue;

    const groupCount = groupExercises.length;
    const groupOpen = searching || group.id === 'upper'; // open Upper by default; open all when searching
    const groupDetails = h('details', {
      class: 'lib-group',
      ...(groupOpen ? { open: '' } : {}),
    });
    groupDetails.appendChild(h('summary', { class: 'lib-group-summary' },
      h('span', { class: 'icon' }, group.icon),
      h('span', { class: 'label' }, group.label),
      h('span', { class: 'count' }, groupCount + ''),
    ));

    for (const section of groupSections) {
      const subDetails = h('details', {
        class: 'lib-sub',
        ...(searching ? { open: '' } : {}),
      });
      subDetails.appendChild(h('summary', { class: 'lib-sub-summary' },
        h('span', { class: 'label' }, muscleLabel(section.info.keys[0])),
        h('span', { class: 'count' }, section.exercises.length + ''),
      ));
      const grid = h('div', { class: 'lib-grid' });
      section.exercises.forEach(ex => grid.appendChild(renderLibExerciseCard(ex)));
      subDetails.appendChild(grid);
      groupDetails.appendChild(subDetails);
    }
    root.appendChild(groupDetails);
  }
}

// Per-exercise card builder, shared between Library renders
function renderLibExerciseCard(ex) {
    const bodyUrl = RW.bodyImg ? RW.bodyImg(ex.primary) : '';
    const card = h('div', { class: 'ex' });
    const head = h('div', { class: 'ex-head', onClick: () => card.classList.toggle('expanded') },
      h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
      h('div', { class: 'ex-info' },
        h('h4', {}, ex.name),
        h('div', { class: 'meta' },
          h('span', { class: 'muscle-tag' }, muscleLabel(ex.primary[0])),
          ' ' + (ex.name_ar || ''),
        ),
      ),
      h('div', { class: 'ex-status' }, '▸'),
    );
    const body = h('div', { class: 'ex-body' });
    if (ex.cue) body.appendChild(h('div', { class: 'cue' }, h('strong', {}, '💡 '), ex.cue));
    const customVids = state.custom_videos[ex.id] || [];
    const allVideos = buildExerciseVideos(ex.id, ex, { includeHidden: true });
    if (allVideos.length) {
      body.appendChild(h('div', { class: 'tiny muted', style: 'margin-top:10px; margin-bottom:4px;' },
        t('video_tap_hint')));
      body.appendChild(h('div', { class: 'video-row' },
        allVideos.map(v => {
          const hidden = isVideoHidden(ex.id, v.key);
          const wrap = h('div', {
            class: 'video-thumb-wrap' + (hidden ? ' hidden-video' : ''),
            style: 'position:relative;',
          });
          const link = buildVideoTile(v);
          // Toggle button overlay
          const toggle = h('button', {
            type: 'button',
            class: 'video-toggle' + (hidden ? ' off' : ' on'),
            title: hidden ? 'Hidden from session — tap to show' : 'Showing — tap to hide from session',
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); toggleVideoVisibility(ex.id, v.key); renderLibrary(); }
          }, hidden ? '⊘' : '✓');
          wrap.appendChild(link);
          wrap.appendChild(toggle);
          return wrap;
        })
      ));
    }
    body.appendChild(h('div', { class: 'spacer-12' }));
    body.appendChild(h('button', { class: 'btn tiny', onClick: () => {
      // Same validation as the training screen: one path, one rule.
      addCustomVideo(ex.id);
      renderLibrary();
    }}, t('video_add_button')));
    body.appendChild(h('button', {
      class: 'btn tiny',
      style: 'margin-left:6px;',
      onClick: () => editJNUrlPrompt(ex.id),
    }, jnHasCustomOverride(ex.id) ? t('video_edit_jn_custom') : t('video_edit_jn')));
    if (customVids.length) {
      body.appendChild(h('button', { class: 'btn tiny ghost', style: 'margin-left:6px;', onClick: () => {
        if (confirm(t('video_clear_confirm'))) {
          delete state.custom_videos[ex.id];
          saveLocal(); renderLibrary();
        }
      }}, t('video_clear_custom')));
    }
    if (ex.alternatives?.length) {
      body.appendChild(h('div', { class: 'alt-row' },
        h('span', { class: 'tiny muted' }, 'Alternatives: '),
        ex.alternatives.map(altId => {
          const alt = getAllExercises().find(e => e.id === altId);
          return alt ? h('a', { class: 'chip', onClick: (e) => { e.preventDefault(); router('library'); }, href: '#library' }, alt.name) : null;
        })
      ));
    }
    // Custom-exercise: allow delete
    if (ex.is_custom) {
      body.appendChild(h('div', { class: 'spacer-12' }));
      body.appendChild(h('button', {
        class: 'btn tiny danger ghost',
        onClick: () => {
          if (confirm(`Delete custom exercise "${ex.name}"? This cannot be undone.`)) {
            deleteCustomExercise(ex.id);
            renderLibrary();
            toast('Deleted.');
          }
        }
      }, '🗑 Delete this custom exercise'));
    }
    card.appendChild(head);
    card.appendChild(body);
    return card;
}

// ---- Add custom exercise modal -------------------------------
function openAddCustomExerciseModal() {
  const m = $('#modal');
  m.innerHTML = '';
  // Form state captured locally
  const form = { name: '', name_ar: '', primary: 'chest', jeff_nippard: '', mohannad_url: '' };
  const muscleOptions = Object.entries(RW.MUSCLES).map(([k]) =>
    h('option', { value: k, ...(form.primary === k ? { selected: '' } : {}) }, muscleLabel(k))
  );
  m.appendChild(h('h3', {}, '➕ Add Custom Exercise'));
  m.appendChild(h('div', { class: 'tiny muted', style: 'margin-bottom:12px;' },
    'Adds a new exercise to your library. Saved permanently. You can delete it anytime.'));

  const nameRow = h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Name (English)'),
      h('div', { class: 'desc' }, 'Required.')),
    h('input', { type: 'text', placeholder: 'e.g. Cable Pec Crossover',
      onInput: (e) => { form.name = e.target.value; }
    }),
  );
  const nameArRow = h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'الاسم بالعربي'),
      h('div', { class: 'desc' }, 'Optional.')),
    h('input', { type: 'text', placeholder: 'تفتيح كيبل عرضي',
      onInput: (e) => { form.name_ar = e.target.value; }
    }),
  );
  const muscleRow = h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Primary muscle'),
      h('div', { class: 'desc' }, 'Used to put it in the right Library section.')),
    h('select', {
      style: 'min-height:44px; background:var(--bg-elev); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:8px;',
      onChange: (e) => { form.primary = e.target.value; }
    }, muscleOptions),
  );
  const jnRow = h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Jeff Nippard URL'),
      h('div', { class: 'desc' }, 'Optional. Form video. Paste any YouTube link.')),
    h('input', { type: 'text', placeholder: 'https://youtube.com/...',
      onInput: (e) => { form.jeff_nippard = e.target.value; }
    }),
  );
  const mohRow = h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Demo video URL'),
      h('div', { class: 'desc' }, 'Optional. Any short / video showing the movement.')),
    h('input', { type: 'text', placeholder: 'https://youtube.com/shorts/...',
      onInput: (e) => { form.mohannad_url = e.target.value; }
    }),
  );
  m.appendChild(nameRow);
  m.appendChild(nameArRow);
  m.appendChild(muscleRow);
  m.appendChild(jnRow);
  m.appendChild(mohRow);

  m.appendChild(h('div', { style: 'display:flex; gap:8px; margin-top:14px;' },
    h('button', { class: 'btn ghost', style: 'flex:1;',
      onClick: () => $('#modal-overlay').classList.remove('show')
    }, 'Cancel'),
    h('button', { class: 'btn primary', style: 'flex:1;',
      onClick: () => {
        if (!form.name || !form.name.trim()) { toast('Name required.'); return; }
        addCustomExercise(form);
        $('#modal-overlay').classList.remove('show');
        renderLibrary();
        toast(tf('added_to_library', { name: form.name }));
      }
    }, 'Save'),
  ));
  $('#modal-overlay').classList.add('show');
}

function renderHistory() {
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
        if (!v) return;
        state.bodyweight_log.push({ date: todayISO(), kg: v });
        saveLocal();
        toast('Bodyweight logged.');
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
    expanded.appendChild(h('button', {
      class: 'btn danger ghost full', 'data-delete-session': 'true',
      style: 'margin-top:14px;',
      onClick: (event) => {
        event.stopPropagation();
        const position = state.history.indexOf(sess);
        if (position < 0) return;
        if (!confirm(tf('delete_session_confirm', { date: fmtDate(sess.date) }))) return;
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

function stashPreRestore(reason) {
  if (!settings.user_id) return;
  const snapshot = {
    created_at: new Date().toISOString(),
    reason,
    state: stripForSync(state, 'state'),
    settings: syncSettingsPayload(),
  };
  localStorage.setItem(preRestoreKey(settings.user_id), JSON.stringify(snapshot));
}
async function undoPreRestore() {
  if (!settings.user_id) return;
  let snapshot;
  try { snapshot = JSON.parse(localStorage.getItem(preRestoreKey(settings.user_id)) || 'null'); } catch (_) {}
  if (!snapshot) { toast('No restore snapshot found.'); return; }
  await quiesceSyncPipeline();
  const keep = { user_id: settings.user_id, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  state = { ...defaultState(), ...(snapshot.state || {}) };
  settings = { ...defaultSettings(), ...retireLegacyCredentialFields(snapshot.settings || {}), ...keep };
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  toast(pushed ? 'Restored previous local snapshot.' : 'Restored locally. Cloud sync is pending.');
}
function notifyUndoRestore() {
  toast(t('snapshot_restored'), 7000, t('undo'), undoPreRestore);
}
function exportPayload() {
  return {
    exported_at: new Date().toISOString(),
    user_id: settings.user_id,
    state: stripForSync(state, 'state'),
    settings: syncSettingsPayload(),
    latest_rev: readLastRev(settings.user_id),
  };
}
function downloadJson(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
async function downloadCloudExport() {
  try {
    const payload = await syncFetch('/export?user=' + syncUserQuery(settings.user_id));
    downloadJson(`${settings.user_id}-workouts-${todayISO()}.json`, payload);
  } catch (_) {
    downloadJson(`raedworkouts-${settings.user_id}-${todayISO()}.json`, exportPayload());
    toast('Cloud export failed. Downloaded local export instead.');
  }
}
async function restoreRevision(rev) {
  if (!confirm('Restore this cloud snapshot? Current data is saved locally first and the restore becomes a new cloud revision.')) return;
  await quiesceSyncPipeline();
  stashPreRestore('revision ' + rev);
  const snap = await syncFetch('/revision?user=' + syncUserQuery(settings.user_id) + '&rev=' + encodeURIComponent(rev));
  const keep = { user_id: settings.user_id, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  state = { ...defaultState(), ...(snap.state_json || {}) };
  settings = { ...defaultSettings(), ...retireLegacyCredentialFields(snap.settings_json || {}), ...keep };
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  if (pushed) notifyUndoRestore();
  else toast(t('restored_locally_pending'), 5000, t('undo'), undoPreRestore);
}
async function openRestoreModal() {
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
async function importJsonFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  await quiesceSyncPipeline();
  stashPreRestore('import');
  const keep = { user_id: settings.user_id, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  if (parsed.state) state = { ...defaultState(), ...parsed.state };
  if (parsed.settings) settings = { ...defaultSettings(), ...retireLegacyCredentialFields(parsed.settings), ...keep };
  else settings = { ...settings, ...keep };
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  toast(pushed ? t('imported') : t('imported_locally_pending'), 7000, t('undo'), undoPreRestore);
}
async function switchProfile() {
  if (syncDirty || readDirtyMarker(settings.user_id) || syncInFlightPromise) {
    toast(t('syncing_before_switch'), 1200);
    const ok = await flushSync();
    if (!ok || syncDirty || readDirtyMarker(settings.user_id)) {
      toast('Cannot switch until this profile is synced.');
      return;
    }
  }
  await quiesceSyncPipeline();
  focusExerciseIdx = null;
  setActiveUser('');
  state = defaultState();
  settings = defaultSettings();
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  welcomeMode = 'tiles';
  welcomeSelectedProfile = null;
  welcomeProfiles = null;
  render();
}

function renderSettings() {
  const root = $('#page-settings');
  root.innerHTML = '';
  const disclosure = (label, content) => h('details', {
    class: 'settings-disclosure', 'data-settings-disclosure': 'true',
  }, h('summary', {}, label), content);
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, 'Settings'),
    h('div', { class: 'sub' }, 'Profile, programme, sync, and data.'),
  ));
  // Profile
  const profileCard = h('div', { class: 'card' });
  profileCard.appendChild(h('h3', {}, '👤 Profile'));
  const displayName = h('input', {
    type: 'text',
    value: state.profile?.display_name || settings.user_id,
    onChange: (e) => { state.profile.display_name = e.target.value.trim() || settings.user_id; saveLocal(); renderSettings(); }
  });
  const experienceSelect = h('select', {
    onChange: (e) => { state.profile.experience = e.target.value; saveLocal(); renderSettings(); }
  },
    ['beginner','detrained','returning','experienced'].map(v => h('option', { value: v, ...(state.profile?.experience === v ? { selected: '' } : {}) },
      experienceLabel(v)
    ))
  );
  const bwInput = h('input', {
    type: 'number', step: '0.1', inputmode: 'decimal',
    value: state.profile?.bodyweight_kg ?? '',
    placeholder: 'kg',
    onChange: (e) => {
      const kg = parseFloat(e.target.value);
      state.profile.bodyweight_kg = kg || null;
      if (kg) state.bodyweight_log.push({ date: todayISO(), kg });
      saveLocal();
      renderSettings();
    }
  });
  profileCard.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Display name'), h('div', { class: 'desc' }, 'Shown on profile tiles.')),
    displayName,
  ));
  profileCard.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Experience'), h('div', { class: 'desc' }, 'Detrained uses historical loads first; the first two weeks are a re-entry ramp.')),
    experienceSelect,
  ));
  profileCard.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Bodyweight'), h('div', { class: 'desc' }, t('protein_target_settings'))),
    bwInput,
  ));
  profileCard.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, t('cloud_identity')), h('div', { class: 'desc' }, t('separate_v16_cloud_row'))),
    h('button', { class: 'btn tiny', onClick: switchProfile }, 'Switch profile'),
  ));
  root.appendChild(disclosure('الملف', profileCard));

  // Programme — D6 has one adopted, history-driven Upper/Lower rotation.
  // There is intentionally no old 2/3-day variant switch to reinterpret a
  // logged PPL session as a different future programme.
  const activeProgramme = getActiveProgramme();
  const programmeCard = h('div', { class: 'card' },
    h('h3', {}, 'Programme'),
    h('div', { class: 'setting-row' },
      h('div', { class: 'label' },
        h('div', { class: 'name' }, 'Training split'),
        h('div', { class: 'desc' }, t('history_per_exercise')),
      ),
      h('div', { class: 'tiny muted' }, activeProgramme.block_name),
    ),
  );
  root.appendChild(disclosure('البرنامج', programmeCard));

  // Preferences
  const card = h('div', { class: 'card' });
  card.appendChild(h('h3', {}, 'Preferences'));
  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Theme'),
      h('div', { class: 'desc' }, 'Auto follows your system. Or pick one.'),
    ),
    h('div', {},
      ['auto', 'light', 'dark'].map(t =>
        h('button', {
          class: 'btn tiny' + (settings.theme === t ? ' primary' : ''),
          onClick: () => { settings.theme = t; saveLocal(); applyTheme(); renderSettings(); }
        }, t)
      ),
    )
  ));

  // Rest timer.
  //
  // Raed asked why the timer says 2:30 while this box says 120. Because the
  // programme prescribes rest PER EXERCISE (rest_min: 2.5 on Machine Chest
  // Press), and prescribedRestSeconds() rightly prefers it. This value is only
  // reached for a row that has no prescribed rest.
  //
  // The old label said "Default seconds between sets", which reads like the
  // control for every set. A setting that looks like it governs something and
  // is quietly overridden is worse than no setting: he changed it, watched
  // nothing happen, and had to ask.
  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, t('rest_fallback')),
      h('div', { class: 'desc' }, t('rest_fallback_desc')),
    ),
    h('input', {
      type: 'number', value: settings.rest_seconds, min: 30, max: 600, step: 15,
      onChange: (e) => { settings.rest_seconds = parseInt(e.target.value, 10) || 120; saveLocal(); }
    }),
  ));

  // Vibrate
  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Vibrate on rest end'),
      h('div', { class: 'desc' }, 'Phone buzz when rest finishes.'),
    ),
    h('button', { class: 'btn tiny' + (settings.vibrate ? ' primary' : ''), onClick: () => { settings.vibrate = !settings.vibrate; saveLocal(); renderSettings(); } }, settings.vibrate ? 'On' : 'Off'),
  ));

  // Notifications (rest-over alert that fires even when app is backgrounded)
  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Background notifications'),
      h('div', { class: 'desc' }, 'Buzz + banner when rest ends, even if you\'re in another app. iOS: install to Home Screen first.'),
    ),
    h('button', { class: 'btn tiny' + (settings.notifications ? ' primary' : ''),
      onClick: async () => {
        settings.notifications = !settings.notifications;
        if (settings.notifications) {
          const perm = await requestNotifPermissionIfNeeded();
          if (perm !== 'granted') {
            toast('Permission denied. Enable in browser settings.');
            settings.notifications = false;
          }
        }
        saveLocal(); renderSettings();
      }
    }, settings.notifications ? 'On' : 'Off'),
  ));

  // Music platform
  const musicCard = h('div', { class: 'card' });
  musicCard.appendChild(h('h3', {}, '🎧 Music'));
  musicCard.appendChild(h('div', { class: 'tiny muted', style: 'margin-bottom:8px;' },
      t('pick_music_platform')
  ));
  musicCard.appendChild(h('div', { class: 'platform-picker' },
    Object.entries(PLATFORM_INFO).map(([key, info]) =>
      h('div', {
        class: 'opt' + (settings.music_platform === key ? ' active' : ''),
        onClick: () => { settings.music_platform = key; saveLocal(); renderSettings(); }
      },
        h('span', { class: 'icon' }, info.icon),
        h('span', {}, info.label),
      )
    )
  ));

  // Sync status — reflects ACTUAL reachability, not just "is a URL configured".
  const configured = !!(settings.sync_url && settings.sync_key);
  const cloudCard = h('div', { class: 'card', style: 'padding:10px 14px;' },
    h('div', { style: 'display:flex; justify-content:space-between; align-items:center;' },
      h('div', { class: 'tiny muted' }, '☁️ Cloud sync'),
      h('span', { id: 'sync-status', class: 'sync-status off' },
        configured ? t('checking') : 'Not connected'),
    ),
  );
  // Preferences receives the language and advanced controls lower down so all
  // Settings groups begin collapsed, as Raed specified.

  // Cloud + data
  const dataCard = h('div', { class: 'card' });
  dataCard.appendChild(h('h3', {}, '☁️ Cloud & Data'));
  dataCard.appendChild(cloudCard.firstChild);
  dataCard.appendChild(h('div', { class: 'cloud-actions' },
    h('button', { class: 'btn tiny', onClick: testCloudConnection }, 'Test'),
    h('button', { class: 'btn tiny', onClick: openRestoreModal }, 'Restore from backup...'),
    h('button', { class: 'btn tiny', onClick: downloadCloudExport }, 'Download my data'),
    h('button', { class: 'btn tiny', onClick: () => downloadJson(`raedworkouts-${settings.user_id}-${todayISO()}.json`, exportPayload()) }, 'Export JSON'),
    h('button', { class: 'btn tiny', onClick: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try { await importJsonFile(f); }
        catch (e) { alert('Import failed: ' + e.message); }
      };
      inp.click();
    }}, 'Import JSON'),
    h('button', { class: 'btn tiny danger', onClick: () => {
      if (!confirm('Wipe this profile from this device only? Cloud data is untouched.')) return;
      const uid = settings.user_id;
      localStorage.removeItem(stateKey(uid));
      localStorage.removeItem(settingsKey(uid));
      localStorage.removeItem(lastWriteKey(uid));
      localStorage.removeItem(lastRevKey(uid));
      localStorage.removeItem(preRestoreKey(uid));
      localStorage.removeItem(dirtyKey(uid));
      setActiveUser('');
      state = defaultState();
      settings = defaultSettings();
      settings.sync_url = getSyncUrl();
      settings.sync_key = SYNC_KEY;
      render();
      toast('Local profile wiped.');
    }}, 'Wipe local'),
  ));
  // append after the remaining preferences controls are assembled below

  // Silent reachability probe — so the badge tells the truth even when the
  // backend is paused/unreachable (no toast; updates only the badge).
  if (configured) {
    syncFetch('/health', { timeoutMs: 8000 })
      .then(() => setSyncStatus('ok', t('sync_connected')))
      .catch(() => setSyncStatus('err', t('offline')));
  }

  // Advanced settings (collapsed by default)
  const adv = h('details', { class: 'card advanced-settings' },
    h('summary', {}, 'Advanced settings'),
  );

  // The former accent picker is now the three adopted, whole-app skins.
  const skinRow = h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Skin'),
      h('div', { class: 'desc' }, 'Changes the full adopted palette. Theme mode stays separate.'),
    ),
    h('div', { class: 'skin-picker', role: 'group', 'aria-label': 'Skin' },
      Object.entries(SKINS).map(([key, info]) =>
        h('button', {
          type: 'button',
          class: 'skin-swatch' + (activeSkin() === key ? ' active' : ''),
          title: info.label,
          'aria-label': info.label,
          'aria-pressed': activeSkin() === key ? 'true' : 'false',
          style: `background: linear-gradient(135deg, ${info.sw_light} 0%, ${info.sw_light} 50%, ${info.sw_dark} 50%, ${info.sw_dark} 100%);`,
          onClick: () => { settings.skin = key; saveLocal(); applyTheme(); renderSettings(); }
        })
      )
    ),
  );
  // skinRow is placed in the Appearance card below, not in Advanced.

  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Block skin suggestions'),
      h('div', { class: 'desc' }, 'Offers a configured skin at a block boundary. It never changes the skin by itself.'),
    ),
    h('button', { class: 'btn tiny' + (settings.block_auto_color !== false ? ' primary' : ''), onClick: () => {
      settings.block_auto_color = settings.block_auto_color === false;
      saveLocal();
      renderSettings();
    } }, settings.block_auto_color !== false ? 'On' : 'Off'),
  ));

  const suggestionOptions = (block) => {
    const select = h('select', {
      'aria-label': tf('block_number', { n: block }),
      onChange: (event) => {
        settings.block_skin_suggestions = { ...(settings.block_skin_suggestions || {}) };
        if (event.target.value) settings.block_skin_suggestions[block] = event.target.value;
        else delete settings.block_skin_suggestions[block];
        saveLocal();
      },
    },
    h('option', { value: '' }, 'Unset'),
    Object.entries(SKINS).map(([key, info]) => h('option', { value: key }, info.label)));
    select.value = settings.block_skin_suggestions?.[block] || '';
    return h('label', { class: 'block-skin-select' }, tf('block_number', { n: block }), select);
  };
  adv.appendChild(h('div', { class: 'block-skin-config' },
    h('div', { class: 'tiny muted' }, 'Suggestion mapping — intentionally unset by default.'),
    [1, 2, 3].map(suggestionOptions),
  ));


  // PR summary toggle
  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'PR summary at session end'),
      h('div', { class: 'desc' }, 'Show personal records on the finish screen.'),
    ),
    h('button', { class: 'btn tiny' + (settings.show_pr_summary ? ' primary' : ''),
      onClick: () => { settings.show_pr_summary = !settings.show_pr_summary; saveLocal(); renderSettings(); }
    }, settings.show_pr_summary ? 'On' : 'Off'),
  ));

  // Force next session (missed a day override)
  const activeProg = getActiveProgramme();
  const programmeSessions = activeProg?.sessions || [];
  // Session ids are storage keys, never user-facing copy.  Every label comes
  // from the programme's localised name, never from its implementation id.
  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, t('force_session')),
      h('div', { class: 'desc' },
        [t('missed_a_day'), ' — ', t('missed_day_override')]
      ),
    ),
    h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' },
      programmeSessions.map((session) =>
        h('button', {
          class: 'btn tiny' + (state.forced_next_session === session.id ? ' primary' : ''),
          onClick: () => {
            state.forced_next_session = state.forced_next_session === session.id ? null : session.id;
            saveLocal();
            renderSettings();
            toast(t('saved'));
          }
        }, session.name)
      ),
      state.forced_next_session
        ? h('button', { class: 'btn tiny', onClick: () => { state.forced_next_session = null; saveLocal(); renderSettings(); toast(t('saved')); } }, t('clear_button'))
        : null,
    ),
  ));

  // Gym launcher override
  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Gym launcher button URL'),
      h('div', { class: 'desc' },
        t('gym_launcher_default'),
        tf('gym_launcher_shortcut', { name: t('open_in2') })
      ),
    ),
    h('input', {
      type: 'text', placeholder: '(default behavior)',
      value: settings.gym_launch_override || '',
      onInput: (e) => { settings.gym_launch_override = e.target.value.trim(); saveLocal(); }
    }),
  ));

  // Reset PRs
  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Clear PR history'),
      h('div', { class: 'desc' }, 'Wipe stored personal records. Cannot be undone.'),
    ),
    h('button', { class: 'btn tiny danger', onClick: () => {
      if (confirm('Clear all PRs? This cannot be undone.')) {
        state.prs = {}; saveLocal(); toast('PRs cleared.');
      }
    }}, 'Clear PRs'),
  ));

  // Appearance lives here now, above the collapsed advanced block, because the
  // two controls Raed actually uses — the skin and the light/dark mode — were
  // split between a header button and a buried Advanced panel.
  const appearanceCard = h('div', { class: 'card' });
  appearanceCard.appendChild(h('h3', {}, t('appearance')));
  appearanceCard.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, t('theme_mode')),
      h('div', { class: 'desc' }, t('theme_mode_desc')),
    ),
    h('div', { class: 'seg', role: 'group', 'aria-label': t('theme_mode') },
      ['auto', 'light', 'dark'].map((mode) =>
        h('button', {
          type: 'button',
          class: 'seg-btn' + (settings.theme === mode ? ' active' : ''),
          'aria-pressed': settings.theme === mode ? 'true' : 'false',
          onClick: () => { settings.theme = mode; saveLocal(); applyTheme(); renderSettings(); },
        }, t(mode))
      )
    ),
  ));
  appearanceCard.appendChild(skinRow);

  const preferencesContent = h('div', { class: 'settings-disclosure-content' }, card, appearanceCard, adv);

  // Language toggle — bottom of settings
  const langCard = h('div', { class: 'card' },
    h('div', { class: 'setting-row' },
      h('div', { class: 'label' },
        h('div', { class: 'name' }, t('language') + ' / اللغة'),
      ),
      h('div', { style: 'display:flex; gap:8px;' },
        h('button', {
          class: 'btn tiny' + (settings.lang !== 'ar' ? ' primary' : ''),
          onClick: () => { settings.lang = 'en'; saveLocal(); applyLang(); render(); }
        }, 'English'),
        h('button', {
          class: 'btn tiny' + (settings.lang === 'ar' ? ' primary' : ''),
          onClick: () => { settings.lang = 'ar'; saveLocal(); applyLang(); render(); }
        }, 'العربية'),
      ),
    ),
  );
  preferencesContent.appendChild(langCard);
  root.appendChild(disclosure('تفضيلات', preferencesContent));
  root.appendChild(disclosure('الموسيقى', musicCard));
  root.appendChild(disclosure('سحب البيانات', dataCard));
  root.appendChild(disclosure('المساعدة', buildHelpCard()));
}


// Shown once every exercise is resolved. Raed asked for the elapsed time —
// "أبغى بصفحة التمارين يقول لي إنه خلصت التمرين خلال كم" — and the duration is
// worth more than the volume number here: it is the one thing he cannot
// reconstruct later from the log.
// Arabic counts again: 1 singular, 2 dual, 3-10 plural, 11+ back to singular.
// A workout is usually 30-90 minutes so «دقيقة» is right most of the time, but a
// short session lands squarely in the 3-10 band where it is wrong.
function arabicMinutes(n) {
  if (activeLanguage() !== 'ar') return tf('session_done_minutes', { n });
  if (n === 1) return t('minutes_one_ar');
  if (n === 2) return t('minutes_two_ar');
  if (n >= 3 && n <= 10) return tf('minutes_few_ar', { n });
  return tf('session_done_minutes', { n });
}

function buildSessionDonePanel(active, entries) {
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

function buildWeekStrip() {
  const DAY_KEYS = ['weekday_sunday','weekday_monday','weekday_tuesday','weekday_wednesday','weekday_thursday','weekday_friday','weekday_saturday'];
  const today = new Date();
  // Week starts Saturday, as it does in Saudi.
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 1) % 7));
  const iso = (date) => date.toISOString().slice(0, 10);

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

function buildHelpCard() {
  const prog = getActiveProgramme();
  const sessions = prog.sessions || [];
  const firstSession = sessions[0];
  const card = h('div', { class: 'card onboard' });
  card.appendChild(h('h2', {}, 'How the app works'));
  card.appendChild(h('p', {}, 'Pick your profile, complete the warm-up phase, log the actual weight/reps, rate only the final set as easy, medium, or very hard, and finish. The app works offline first and syncs when the server is reachable.'));
  card.appendChild(h('h2', {}, 'Your programme'));
  card.appendChild(h('p', {}, (prog.notes || [])[0] || ''));
  sessions.forEach(sess => {
    card.appendChild(h('h3', {}, sess.name));
    card.appendChild(h('ul', {},
      sess.exercises.map(plan => {
        const ex = getAllExercises().find(e => e.id === plan.exercise_id);
        const sug = suggestNextWeight(plan.exercise_id, plan);
        return h('li', {}, `${ex?.name || plan.exercise_id}: ${plan.sets} x ${plan.reps} @ ${displaySuggestedWeight(sug.weight)}`);
      })
    ));
  });
  card.appendChild(h('h2', {}, 'Weeks 1–2 = re-entry'));
  card.appendChild(h('p', {}, tf('profile_is_level', { level: experienceLabel(state.profile?.experience || 'detrained') }), ' ', t('help_history_effort')));
  card.appendChild(h('h2', {}, 'Progressive overload'));
  card.appendChild(h('p', {}, 'Completed reps drive every increase. Very hard blocks an earned increase; easy can bring a reps-earned increase forward by one complete exposure. Effort never raises load on its own.'));
  card.appendChild(h('h2', {}, 'The rules'));
  card.appendChild(h('ul', {},
    h('li', {}, 'Technique beats weight. No grinding in the re-entry ramp.'),
    h('li', {}, t('help_protein_sleep')),
    (prog.notes || []).map((note) => h('li', {}, note)),
  ));
  card.appendChild(h('h2', {}, 'Library & videos'));
  card.appendChild(h('p', {}, 'Exercises include Mohannad clips and a Jeff Nippard form link. You can add custom videos, hide videos from session view, edit JN links, and add custom exercises.'));
  card.appendChild(h('h2', {}, 'Your data'));
  card.appendChild(h('p', {}, 'Profiles stay separate, sync is automatic, and the server keeps revisions plus scheduled backups. Settings has restore from backup, cloud download, and local JSON export/import. Offline logging stays on this device until sync returns.'));
  card.appendChild(h('h2', {}, 'Install to Home Screen'));
  card.appendChild(h('p', {}, 'iPhone Safari: Share button -> Add to Home Screen. Android Chrome: menu -> Install app or Add to Home screen.'));
  return card;
}

function renderHelp() {
  // Legacy deep links remain safe after Help joined Settings.
  router('settings');
}

// ---- Boot ---------------------------------------------------
function init() {
  loadLocal();
  applyLang();

  // ?user=abdullah — profile picker preselect only; it only selects a profile.
  const urlUser = new URLSearchParams(window.location.search).get('user');
  if (urlUser && !settings.user_id) welcomePreselectUser = urlUser.trim();

  applyTheme();

  // Wire tab bar
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => router(t.dataset.route));
  });
  const gymBtn = $('#gym-launch');
  if (gymBtn) gymBtn.addEventListener('click', launchGymApp);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay' && !e.target.dataset.required)
      $('#modal-overlay').classList.remove('show');
  });
  $('#rest-cancel').addEventListener('click', cancelRest);

  window.addEventListener('hashchange', render);

  if (!window.location.hash) window.location.hash = 'home';
  render();

  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  window.addEventListener('online', () => {
    if (syncDirty) flushSync().catch(() => {});
    if (!welcomeProfiles && !settings.user_id) loadWelcomeProfiles();
  });
  setInterval(() => { if (syncDirty) flushSync().catch(() => {}); }, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && syncDirty) {
      flushSync({ keepalive: true }).then(ok => {
        if (!ok) syncToCloud({ beacon: true, beaconAuth: true }).catch(() => {});
      }).catch(() => {});
    }
  });
  window.addEventListener('pagehide', () => {
    if (syncDirty) syncToCloud({ beacon: true, beaconAuth: true }).catch(() => {});
  });

  // Show profile screen on first launch (no user_id set yet)
  if (!settings.user_id) {
    renderWelcome();
  } else if (settings.sync_url && settings.sync_key) {
    // If this browser has meaningful local data but no revision marker, push first.
    // Server v2 merges stale/legacy writes into the head and returns the accepted state.
    toast('Syncing…', 1200);
    const shouldPushFirst = readDirtyMarker(settings.user_id) || (hasMeaningfulLocalData() && !readLastRev(settings.user_id));
    const bootSync = shouldPushFirst
      ? (markDirty(), flushSync())
      : pullFromCloud();
    bootSync
      .then(ok => { if (ok) { applyTheme(); render(); } })
      .catch(err => {
        setSyncStatus('err', syncFailureReason(err));
        toast(t('sync_failed_offline'), 3000);
      });
  }

  // Register service worker (offline) + auto-apply updates.
  // No more "force refresh" — a new deploy installs in the background and the
  // app reloads itself to show it (deferred if you're mid-set, so nothing is yanked).
  if ('serviceWorker' in navigator) {
    let _reloading = false;
    const hadController = !!navigator.serviceWorker.controller;
    const applyUpdateWhenSafe = () => {
      if (_reloading) return;
      const doReload = () => { _reloading = true; window.location.reload(); };
      // Mid-session + screen visible → wait until you switch away (state is already
      // saved on every keystroke, so the reload never loses data).
      if (state.active_session && !document.hidden) {
        toast(t('update_ready'), 3000);
        const onHide = () => {
          if (document.hidden) { document.removeEventListener('visibilitychange', onHide); doReload(); }
        };
        document.addEventListener('visibilitychange', onHide);
      } else {
        doReload();
      }
    };
    // Fires when a freshly-installed SW takes control (genuine update only).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) applyUpdateWhenSafe();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      reg.update().catch(() => {});
      // Re-check for updates when the app regains focus, and hourly.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
  }

  // Auto-hide bottom nav on scroll-down, show on scroll-up
  initAutoHideNav();

  // Optional: ask for notification permission on first interaction (deferred)
  initNotifications();
}

// ---- Auto-hide bottom nav on scroll --------------------------
function initAutoHideNav() {
  const nav = $('.tab-bar');
  if (!nav) return;
  let lastY = window.scrollY;
  let ticking = false;
  let pinned = false;  // pinned = forced visible (e.g. at very top)
  const threshold = 8;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const dy = y - lastY;
      // near top → always show
      if (y < 120) {
        nav.classList.remove('hidden');
        pinned = true;
      } else if (Math.abs(dy) > threshold) {
        if (dy > 0) {
          // scrolling down → hide
          nav.classList.add('hidden');
        } else {
          // scrolling up → show
          nav.classList.remove('hidden');
        }
        pinned = false;
      }
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
}

// ---- Notifications API ---------------------------------------
function initNotifications() {
  if (!('Notification' in window) || !settings.notifications) return;
  // Don't ask immediately — wait for first set-completion to prompt context.
  // Permission is requested in startRest() if not yet granted.
}
function requestNotifPermissionIfNeeded() {
  if (!('Notification' in window)) return Promise.resolve('denied');
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission();
}
async function fireRestEndNotification() {
  if (!settings.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body: 'Time to lift again. Don\'t scroll past it.',
    icon: './img/body_chest.png',
    badge: './img/body_chest.png',
    tag: 'raedworkouts-rest',
    renotify: true,
    silent: false,
    vibrate: [200, 80, 200],
  };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg && reg.showNotification) {
      reg.showNotification('Rest done 💪', opts);
    } else {
      new Notification('Rest done 💪', opts);
    }
  } catch (e) {}
}
window.addEventListener('DOMContentLoaded', init);
