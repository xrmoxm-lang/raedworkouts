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
    else if (attrs[k] != null && attrs[k] !== false) el.setAttribute(k, attrs[k]);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
};
// ---- i18n ---------------------------------------------------
const STRINGS = {
  en: {
    start_session: 'Start Session', finish_session: '✓ Finish & save session',
    rest_day: '🛋️ Rest day', gym_day: '🏋️ Today is', session_done: 'Session done.',
    next: 'Next:', streak: 'STREAK', this_week: 'THIS WEEK', tonnage: 'TONNAGE',
    settings: 'Settings', history: 'History', library: 'Library', home: 'Home', help: 'Help',
    save: 'Save', cancel: 'Cancel', wipe_data: 'Wipe all data',
    theme: 'Theme', language: 'Language', music: 'Music',
    force_session: 'Force next session', missed_day: 'Missed a day? Override which session starts next.',
    working_sets: 'working sets', last_time: '📊 Last time', today_target: '🎯 Today:',
    warmup: 'Warm-up', add_set: '+ Set', swap: '⇄ Swap', done: 'Done',
    sessions_4wk: 'sessions / 4 wks', kg_this_week: 'kg this week',
    foundation: 'foundation', strength: 'strength', peak: 'peak',
    block: 'Block', week: 'Week', of: 'of',
    auto_color: 'Auto color (by block)', syncing: 'Syncing…', sync_ok: 'Synced',
    welcome: '👋 Welcome', welcome_desc: "What's your name? Keeps your workout data separate.",
    start_arrow: 'Start →', enter_name: 'Enter your name.',
  },
  ar: {
    start_session: 'ابدأ التمرين', finish_session: '✓ حفظ وإنهاء التمرين',
    rest_day: '🛋️ يوم راحة', gym_day: '🏋️ اليوم هو', session_done: 'انتهى التمرين.',
    next: 'التالي:', streak: 'السلسلة', this_week: 'هذا الأسبوع', tonnage: 'الحمولة',
    settings: 'الإعدادات', history: 'السجل', library: 'المكتبة', home: 'الرئيسية', help: 'مساعدة',
    save: 'حفظ', cancel: 'إلغاء', wipe_data: 'مسح كل البيانات',
    theme: 'المظهر', language: 'اللغة', music: 'الموسيقى',
    force_session: 'تحديد الجلسة التالية', missed_day: 'غبت يوم؟ اختر الجلسة التالية يدوياً.',
    working_sets: 'سيت', last_time: '📊 آخر مرة', today_target: '🎯 اليوم:',
    warmup: 'إحماء', add_set: '+ سيت', swap: '⇄ بديل', done: 'تم',
    sessions_4wk: 'جلسات / 4 أسابيع', kg_this_week: 'كغ هذا الأسبوع',
    foundation: 'التأسيس', strength: 'القوة', peak: 'الذروة',
    block: 'بلوك', week: 'أسبوع', of: 'من',
    auto_color: 'لون تلقائي (حسب البلوك)', syncing: 'جارٍ المزامنة…', sync_ok: 'تمت المزامنة',
    welcome: '👋 أهلاً', welcome_desc: 'ما اسمك؟ يحفظ بياناتك منفصلة عن الآخرين.',
    start_arrow: 'ابدأ ←', enter_name: 'أدخل اسمك.',
  },
};
const t = (key) => STRINGS[settings?.lang || 'en']?.[key] ?? STRINGS.en[key] ?? key;

function applyLang() {
  const lang = settings.lang || 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const todayISO = () => new Date().toISOString().slice(0,10);
const toast = (msg, ms = 1800, actionLabel = '', actionFn = null) => {
  const t = $('#toast');
  t.innerHTML = '';
  t.appendChild(document.createTextNode(msg));
  if (actionLabel && actionFn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
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
function nsKey(userId, suffix) {
  return `raedworkouts.${encodeUserKey(userId)}.${suffix}.v1`;
}
function stateKey(userId) { return nsKey(userId, 'state'); }
function settingsKey(userId) { return nsKey(userId, 'settings'); }
function lastWriteKey(userId) { return nsKey(userId, 'lastwrite'); }
function lastRevKey(userId) { return nsKey(userId, 'lastrev'); }
function preRestoreKey(userId) { return nsKey(userId, 'prerestore'); }
function dirtyKey(userId) { return nsKey(userId, 'dirty'); }

// ---- RPE picker -----------------------------------------------
// Maps emoji → numeric RPE used by the progression algorithm.
const RPE_LEVELS = [
  { value: 7, emoji: '😌', label: 'Easy' },
  { value: 8, emoji: '💪', label: 'Right' },
  { value: 9, emoji: '🥵', label: 'Hard' },
];
function rpeEmoji(rpe) {
  if (rpe == null || rpe === '') return '💪';
  const n = parseFloat(rpe);
  if (n <= 7.5) return '😌';
  if (n >= 8.5) return '🥵';
  return '💪';
}
function rpePicker(set, onChange) {
  const wrap = h('div', { style: 'position:relative;' });
  const btn = h('button', {
    class: 'rpe-btn', type: 'button',
    'data-rpe': String(set.rpe || 8),
    onClick: (ev) => {
      ev.stopPropagation();
      pop.classList.toggle('open');
      // close on outside click
      const closer = (e) => {
        if (!wrap.contains(e.target)) {
          pop.classList.remove('open');
          document.removeEventListener('click', closer, true);
        }
      };
      setTimeout(() => document.addEventListener('click', closer, true), 0);
    }
  }, rpeEmoji(set.rpe));
  const pop = h('div', { class: 'rpe-popover' },
    RPE_LEVELS.map(l => h('button', {
      type: 'button',
      class: parseFloat(set.rpe) === l.value ? 'active' : '',
      title: l.label,
      onClick: (ev) => {
        ev.stopPropagation();
        set.rpe = l.value;
        btn.textContent = l.emoji;
        btn.setAttribute('data-rpe', String(l.value));
        pop.classList.remove('open');
        if (onChange) onChange();
      }
    }, l.emoji))
  );
  wrap.appendChild(btn);
  wrap.appendChild(pop);
  return wrap;
}

// ---- Programme variants --------------------------------------
const VARIANTS = {
  fullbody_2x: { label: 'Full-body 2×', desc: 'Tuesday + Saturday' },
  ppl_3x:      { label: 'Push/Pull/Legs 3×', desc: 'Push · Pull · Legs — any 3 days you choose' },
};
function switchVariant(key) {
  if (!VARIANTS[key]) return;
  if ((settings.programme_variant || 'ppl_3x') === key) return;
  settings.programme_variant = key;
  settings.pending_variant = null;
  state.forced_next_session = null;
  saveLocal();
  toast('Programme: ' + VARIANTS[key].label);
  render();
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
      title: 'Mohannad — video ' + (i + 1),
    })),
    ...(jnUrl ? [{
      key: 'jn',
      id: ytIdFromUrl(jnUrl),
      url: jnUrl,
      label: 'JN',
      title: jnHasCustomOverride(exerciseId) ? 'JN (custom)' : 'Jeff Nippard',
      nippard: true,
    }] : []),
    ...customVids.map((url, i) => {
      const isShort = String(url || '').includes('/shorts/');
      return {
        key: 'custom_' + i,
        id: ytIdFromUrl(url),
        url,
        label: isShort ? 'C' + (i + 1) : 'Custom',
        title: 'Custom — video ' + (i + 1),
        custom: true,
      };
    })
  ];
  return opts.includeHidden ? videos : videos.filter(v => !isVideoHidden(exerciseId, v.key));
}
function buildVideoTile(v, opts = {}) {
  const id = v.id || ytIdFromUrl(v.url);
  const isShort = String(v.url || '').includes('/shorts/');
  const label = v.label || (v.nippard ? 'JN' : 'Custom');
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
  const chip = h('span', { class: 'video-label-chip' }, label);
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

  link.appendChild(chip);
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
  current_week: 1,
  current_block: 1,
  profile: null,                // { display_name, experience, bodyweight_kg, created_at }
  active_session: null,        // { date, session_id, started_at, exercises: {...} }
  history: [],                 // [{ date, session_id, started_at, ended_at, notes, exercises: {...}, swaps: {...} }]
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
});

const defaultSettings = () => ({
  theme: 'auto',               // auto | light | dark
  color_theme: 'teal',         // teal | orange | green | red | amber
  weight_unit: 'kg',           // kg | lb
  rest_seconds: 120,
  vibrate: true,
  notifications: true,         // browser notifications when rest ends (req permission)
  focus_mode: true,            // one-exercise-at-a-time during active session
  music_platform: 'spotify',   // spotify | youtube_music | apple_music | none
  programme_variant: 'ppl_3x',  // fullbody_2x | ppl_3x
  pending_variant: null,       // legacy queue value; cleared on boot/switch
  show_pr_summary: true,       // show end-of-session PR review
  // Gym launcher: tries scheme first, falls back to App Store URL
  gym_launch_scheme: 'scope.bit://',                                  // bundle ID-based scheme attempt
  gym_launch_fallback: 'https://apps.apple.com/sa/app/in2-fitness/id1536137282', // App Store fallback
  gym_launch_override: '',     // user-set custom URL (e.g. shortcuts://run-shortcut?name=Open%20IN2)
  sync_url: SYNC_URL,
  sync_key: SYNC_KEY,
  user_key: '',                 // sha256(user_id_lower + ':' + pin); local-only, never synced
  user_id: '',
  pending_registration: null,   // local-only retry data when first profile setup happens offline
  needs_pin_reauth: false,      // local-only: PIN exists server-side, but this browser needs the key
  pin_prompt_dismissed_at: '',
  block_auto_color: true,
  lang: 'en',
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
let welcomePinMessage = '';
let suppressNextPush = false;

function hasMeaningfulLocalData() {
  return (state.history || []).length > 0 || Boolean(state.active_session) || (state.bodyweight_log || []).length > 0;
}

function familyProfileSeeds() {
  return RW.FAMILY_PROFILES || [
    { user_id: 'Raed', display_name: 'Raed', experience: 'returning', bodyweight_kg: 82, allowlisted: true },
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
  if (!state.profile.experience) state.profile.experience = 'returning';
  if (!state.profile.created_at) state.profile.created_at = new Date().toISOString();
}
function registerLocalProfile(profile) {
  const list = getLocalProfiles().filter(p => String(p.user_id).toLowerCase() !== String(profile.user_id).toLowerCase());
  list.push({
    user_id: profile.user_id,
    display_name: profile.display_name || profile.user_id,
    experience: profile.experience || 'returning',
    updated_at: new Date().toISOString(),
  });
  localStorage.setItem(PROFILE_INDEX_KEY, JSON.stringify(list));
}
function getLocalProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILE_INDEX_KEY) || '[]'); } catch (_) { return []; }
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
    ? new Set(['sync_key', 'sync_url', 'user_key', 'last_rev', 'pending_variant', 'pending_registration', 'needs_pin_reauth'])
    : new Set(['last_sync']);
  const out = {};
  Object.entries(value).forEach(([k, v]) => {
    if (k.startsWith('_') || deny.has(k)) return;
    out[k] = stripForSync(v, mode);
  });
  return out;
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
function loadLocal() {
  migrateLegacyStorage();
  activeUser = getActiveUser();
  state = defaultState();
  settings = defaultSettings();
  if (activeUser) {
    try { state = { ...defaultState(), ...JSON.parse(localStorage.getItem(stateKey(activeUser)) || '{}') }; } catch (e) {}
    try { settings = { ...defaultSettings(), ...JSON.parse(localStorage.getItem(settingsKey(activeUser)) || '{}') }; } catch (e) {}
    settings.user_id = settings.user_id || activeUser;
    activeUser = settings.user_id;
    setActiveUser(activeUser);
  }
  if (activeUser && !localStorage.getItem(lastWriteKey(activeUser)) && hasMeaningfulLocalData()) {
    localStorage.setItem(lastWriteKey(activeUser), new Date().toISOString());
  }
  const hadPendingVariant = Boolean(settings.pending_variant);
  settings.pending_variant = null;
  // Always use the baked-in sync endpoint — no manual setup needed
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  if (settings.user_id) {
    ensureProfile();
    backfillSessionUids();
    syncDirty = readDirtyMarker(settings.user_id);
    registerLocalProfile({ user_id: settings.user_id, ...state.profile });
    localStorage.setItem(settingsKey(settings.user_id), JSON.stringify(settings));
    localStorage.setItem(stateKey(settings.user_id), JSON.stringify(state));
  } else {
    syncDirty = false;
  }
  if (hadPendingVariant && settings.user_id) localStorage.setItem(settingsKey(settings.user_id), JSON.stringify(settings));
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
  setSyncStatus(navigator.onLine === false ? 'err' : 'off', navigator.onLine === false ? 'Pending — offline' : 'Pending sync');
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
function applyRemotePayload(remote) {
  const localUserId = settings.user_id || remote.user_id;
  const localUserKey = settings.user_key || '';
  const localLang = settings.lang;
  const localTheme = settings.theme;
  const remoteState = remote.state_json || remote.state || {};
  const remoteSettings = remote.settings_json || remote.settings || {};
  state = { ...defaultState(), ...remoteState };
  settings = { ...defaultSettings(), ...remoteSettings };
  settings.user_id = remote.user_id || localUserId;
  settings.user_key = localUserKey;
  settings.lang = settings.lang || localLang;
  settings.theme = settings.theme || localTheme;
  settings.pending_variant = null;
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  setActiveUser(settings.user_id);
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
    _auth_user_key: settings.user_key || '',
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
function pinErrorMessage(err) {
  const status = syncErrorStatus(err);
  if (status === 401) return 'Wrong PIN. Try again.';
  if (status === 429) return 'Too many tries — wait 15 min.';
  if (isNetworkError(err)) return "Can't reach the server — check connection.";
  return 'Could not verify PIN.';
}
async function retryPendingRegistration() {
  const pending = settings.pending_registration;
  if (!pending || !settings.user_id) return true;
  try {
    const res = await syncFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ user_id: pending.user_id || settings.user_id, pin: pending.pin, _auth_token: settings.sync_key }),
    });
    settings.user_id = res.user_id || settings.user_id;
    settings.user_key = res.user_key || await deriveUserKey(settings.user_id, pending.pin);
    settings.pending_registration = null;
    settings.needs_pin_reauth = false;
    setActiveUser(settings.user_id);
    persistLocal();
    return true;
  } catch (err) {
    const status = syncErrorStatus(err);
    if (isNetworkError(err)) {
      setSyncStatus('err', 'Registration pending — offline');
      return true;
    }
    if (status === 409 || /pin_already_set/.test(String(err?.message || ''))) {
      settings.pending_registration = null;
      settings.needs_pin_reauth = true;
      syncDirty = true;
      writeDirtyMarker(settings.user_id);
      persistLocal();
      render();
      toast('Enter your PIN to reconnect sync.', 3500);
      return false;
    }
    throw err;
  }
}

// ---- Cloud sync (self-hosted on Raed's HP server) ----------
async function syncFetch(path, opts = {}) {
  const { timeoutMs = 15000, signal, ...fetchOpts } = opts;
  const base = (settings.sync_url || getSyncUrl()).replace(/\/$/, '');
  const url = base + path;
  const headers = { ...(fetchOpts.headers || {}) };
  if (settings.sync_key) headers.Authorization = 'Bearer ' + settings.sync_key;
  if (settings.user_key) headers['X-User-Key'] = settings.user_key;
  if (fetchOpts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const canAbort = typeof AbortController !== 'undefined' && timeoutMs > 0 && !signal;
  const controller = canAbort ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { ...fetchOpts, headers, signal: signal || controller?.signal });
    if (!res.ok) throw new Error(`Sync ${res.status}: ${await res.text()}`);
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
  if (settings.pending_registration && !opts.beacon) {
    const canContinue = await retryPendingRegistration();
    if (!canContinue) return false;
  }
  const userIdAtStart = settings.user_id;
  const bodyObj = {
    user_id: settings.user_id,
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
      setSyncStatus('off', 'Merged remotely — pending local edits');
      saveLocal._toastShown = false;
      return true;
    }
    applyRemotePayload(response);
    applyTheme();
    render();
  } else if (rev) {
    writeLastRev(rev, userIdAtStart);
    if (!syncDirty) clearDirtyMarker(userIdAtStart);
  }
  setSyncStatus('ok', (response?.merged ? 'Merged + synced ' : 'Synced ') + fmtTime(Date.now()));
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
      setSyncStatus('err', 'Pending — offline');
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
        setSyncStatus('err', 'Sync failed: ' + (err.message || 'unknown'));
        if (!saveLocal._toastShown) {
          saveLocal._toastShown = true;
          toast('Cloud sync failed — saved locally.', 3500);
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
    remote = await syncFetch('/state?user=' + encodeURIComponent(settings.user_id));
  } catch (e) {
    // 404 = no row yet (first run / fresh user) — not an error, nothing to pull.
    if (/Sync 404/.test(e.message || '')) return false;
    throw e;
  }
  if (remote?.latest_rev && readLastRev(settings.user_id) === remote.latest_rev) {
    setSyncStatus('ok', 'Synced');
    return false;
  }
  if (remote && remote.state_json) {
    applyRemotePayload(remote);
    setSyncStatus('ok', 'Pulled from cloud');
    return true;
  }
  return false;
}

function setSyncStatus(kind, text) {
  const el = $('#sync-status');
  if (!el) return;
  el.className = 'sync-status ' + kind;
  el.textContent = text;
}

async function testCloudConnection() {
  if (!settings.sync_url || !settings.sync_key) {
    toast('Sync is not configured.');
    return;
  }
  toast('Testing…');
  try {
    await syncFetch('/health', { timeoutMs: 8000 });
    setSyncStatus('ok', 'Connected ✓');
    toast('Connection OK.');
  } catch (e) {
    setSyncStatus('err', 'Failed: ' + (e.message || 'unknown'));
    toast('Connection failed: ' + (e.message || 'unknown'), 3500);
  }
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function deriveUserKey(userId, pin) {
  return sha256Hex(`${String(userId).toLowerCase()}:${pin}`);
}
async function loadWelcomeProfiles() {
  if (welcomeLoading) return;
  welcomeLoading = true;
  try {
    const rows = await syncFetch('/users', { timeoutMs: 8000 });
    const merged = [...rows];
    getLocalProfiles().forEach(local => {
      if (!merged.some(p => String(p.user_id).toLowerCase() === String(local.user_id).toLowerCase())) merged.push(local);
    });
    familyProfileSeeds().forEach(seed => {
      if (!merged.some(p => String(p.user_id).toLowerCase() === String(seed.user_id).toLowerCase())) merged.push(seed);
    });
    welcomeProfiles = merged;
  } catch (_) {
    const merged = [...familyProfileSeeds()];
    getLocalProfiles().forEach(local => {
      if (!merged.some(p => String(p.user_id).toLowerCase() === String(local.user_id).toLowerCase())) merged.push(local);
    });
    welcomeProfiles = merged;
  } finally {
    welcomeLoading = false;
    if (!settings.user_id) renderWelcome();
  }
}
function selectProfile(profile) {
  welcomeSelectedProfile = profile;
  welcomePinMessage = '';
  welcomeMode = profile.has_pin ? 'pin' : 'register';
  renderWelcome();
}
function finishLocalSignIn(userId, profile, userKey = '') {
  settings = { ...defaultSettings(), user_id: userId, user_key: userKey, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
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
async function verifyPin(profile, pin) {
  const userId = profile.user_id;
  const key = await deriveUserKey(userId, pin);
  const prev = settings;
  settings = { ...defaultSettings(), sync_url: getSyncUrl(), sync_key: SYNC_KEY, user_id: userId, user_key: key };
  try {
    const remote = await syncFetch('/state?user=' + encodeURIComponent(userId));
    applyRemotePayload({ ...remote, user_id: remote.user_id || userId });
    toast('Signed in.');
    applyTheme();
    render();
  } catch (e) {
    settings = prev;
    throw e;
  }
}
async function verifyReconnectPin(pin) {
  const userId = settings.user_id;
  if (!userId) throw new Error('No active profile.');
  const key = await deriveUserKey(userId, pin);
  const previousKey = settings.user_key;
  settings.user_key = key;
  try {
    await syncFetch('/state?user=' + encodeURIComponent(userId));
    settings.needs_pin_reauth = false;
    settings.pending_registration = null;
    saveLocal({ sync: false, dirty: false });
    markDirty();
    toast('Sync reconnected.');
    render();
    flushSync().catch(() => {});
  } catch (e) {
    settings.user_key = previousKey;
    throw e;
  }
}
async function registerProfile(profile, pin, bodyweight) {
  const body = {
    user_id: profile.user_id || profile.display_name,
    pin,
    _auth_token: SYNC_KEY,
  };
  const prev = settings;
  let claimed = false;
  settings = { ...defaultSettings(), sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  try {
    const res = await syncFetch('/register', { method: 'POST', body: JSON.stringify(body) });
    const userId = res.user_id || profile.user_id;
    const userKey = res.user_key || await deriveUserKey(userId, pin);
    claimed = true;
    finishLocalSignIn(userId, { ...profile, bodyweight_kg: bodyweight ?? profile.bodyweight_kg }, userKey);
    state.profile.experience = profile.experience || state.profile.experience || 'returning';
    if (bodyweight) {
      state.profile.bodyweight_kg = bodyweight;
      state.bodyweight_log = [{ date: todayISO(), kg: bodyweight }];
    }
    saveLocal({ sync: false, dirty: false });
    const pushed = await syncToCloud().catch(err => {
      syncDirty = true;
      writeDirtyMarker(userId);
      setSyncStatus('err', 'Sync failed: ' + (err.message || 'unknown'));
      schedulePush(60000);
      return false;
    });
    toast(pushed ? 'Profile ready.' : 'Profile ready locally. Cloud sync is pending.', pushed ? 1800 : 3500);
    applyTheme();
    render();
  } catch (e) {
    if (!claimed) settings = prev;
    throw e;
  }
}
function renderPinPad(profile) {
  let pin = '';
  let checking = false;
  const dots = h('div', { class: 'pin-dots' }, [0,1,2,3].map(i => h('span', { class: i < pin.length ? 'filled' : '' })));
  const status = h('div', { class: 'tiny muted', style: 'min-height:18px;' }, welcomePinMessage || 'Enter your PIN');
  const refresh = () => {
    dots.innerHTML = '';
    [0,1,2,3].forEach(i => dots.appendChild(h('span', { class: i < pin.length ? 'filled' : '' })));
  };
  const submit = async () => {
    if (checking || pin.length !== 4) return;
    checking = true;
    status.textContent = 'Checking...';
    try {
      await verifyPin(profile, pin);
    } catch (e) {
      pin = '';
      checking = false;
      status.textContent = pinErrorMessage(e);
      dots.classList.add('shake');
      setTimeout(() => dots.classList.remove('shake'), 350);
      refresh();
    }
  };
  const keys = ['1','2','3','4','5','6','7','8','9','←','0','OK'];
  return h('div', { class: 'pin-panel' },
    h('button', { class: 'btn tiny ghost', onClick: () => { welcomePinMessage = ''; welcomeMode = 'tiles'; renderWelcome(); } }, '← Profiles'),
    h('h2', {}, profile.display_name || profile.user_id),
    dots,
    status,
    h('div', { class: 'pin-grid' }, keys.map(k => h('button', {
      type: 'button',
      class: 'pin-key' + (k === 'OK' ? ' ok' : ''),
      onClick: () => {
        if (k === '←') pin = pin.slice(0, -1);
        else if (k === 'OK') submit();
        else if (pin.length < 4) pin += k;
        refresh();
        if (pin.length === 4) submit();
      }
    }, k)))
  );
}
function renderRegisterPanel(profile) {
  const pin1 = h('input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '4 digit PIN' });
  const pin2 = h('input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: 'Repeat PIN' });
  const bw = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', placeholder: 'Bodyweight kg (optional)', value: profile.bodyweight_kg ?? '' });
  const exp = h('select', {},
    ['beginner','returning','experienced'].map(v => h('option', { value: v, ...(profile.experience === v ? { selected: '' } : {}) },
      v === 'beginner' ? 'New to the gym' : v === 'returning' ? 'Trained before, coming back' : 'Currently training'
    ))
  );
  const status = h('div', { class: 'tiny muted' }, '');
  return h('div', { class: 'register-panel card' },
    h('button', { class: 'btn tiny ghost', onClick: () => { welcomePinMessage = ''; welcomeMode = 'tiles'; renderWelcome(); } }, '← Profiles'),
    h('h2', {}, profile.display_name || profile.user_id),
    h('p', { class: 'muted' }, 'Create a PIN. Your workout data stays separate.'),
    h('label', {}, 'Experience', exp),
    h('label', {}, 'PIN', pin1),
    h('label', {}, 'Repeat PIN', pin2),
    h('label', {}, 'Bodyweight', bw),
    status,
    h('button', { class: 'btn primary full', onClick: async () => {
      const p1 = pin1.value.trim();
      const p2 = pin2.value.trim();
      if (!/^\d{4}$/.test(p1)) { status.textContent = 'Use a 4 digit PIN.'; return; }
      if (p1 !== p2) { status.textContent = 'PINs do not match.'; return; }
      status.textContent = 'Creating profile...';
      try {
        await registerProfile({ ...profile, experience: exp.value }, p1, parseFloat(bw.value) || null);
      } catch (e) {
        const statusCode = syncErrorStatus(e);
        if (statusCode === 409 || /pin_already_set/.test(e.message || '')) {
          welcomeSelectedProfile = { ...profile, has_pin: true };
          welcomePinMessage = 'This profile already has a PIN — enter it.';
          welcomeMode = 'pin';
          renderWelcome();
          return;
        }
        if (statusCode === 403 || /not_allowlisted/.test(e.message || '')) {
          status.textContent = 'Ask Raed to add this name first.';
          return;
        }
        if (!isNetworkError(e)) {
          status.textContent = e.message || 'Could not create profile.';
          return;
        }
        const localId = profile.user_id || (profile.display_name || '').trim();
        const userKey = await deriveUserKey(localId, p1);
        finishLocalSignIn(localId, { ...profile, experience: exp.value, bodyweight_kg: parseFloat(bw.value) || null }, userKey);
        settings.pending_registration = { user_id: localId, pin: p1 };
        saveLocal({ sync: false });
        toast('Offline profile created. It will connect when the server is reachable.', 3500);
      }
    }}, 'Create profile')
  );
}
function renderSomeoneElsePanel() {
  const name = h('input', { type: 'text', placeholder: 'Name' });
  const status = h('div', { class: 'tiny muted' }, 'Only Raed-approved names can register.');
  return h('div', { class: 'register-panel card' },
    h('button', { class: 'btn tiny ghost', onClick: () => { welcomePinMessage = ''; welcomeMode = 'tiles'; renderWelcome(); } }, '← Profiles'),
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
  const profiles = welcomeProfiles || (() => {
    const merged = [...familyProfileSeeds()];
    getLocalProfiles().forEach(local => {
      if (!merged.some(p => String(p.user_id).toLowerCase() === String(local.user_id).toLowerCase())) merged.push(local);
    });
    return merged;
  })();
  if (welcomePreselectUser) {
    const pre = profiles.find(p => String(p.user_id).toLowerCase() === welcomePreselectUser.toLowerCase());
    if (pre && welcomeMode === 'tiles') setTimeout(() => selectProfile(pre), 0);
    welcomePreselectUser = '';
  }
  const wrap = h('div', { class: 'welcome-screen' },
    h('div', { class: 'welcome-head' },
      h('div', { class: 'app-title big' }, h('span', { class: 'dot' }), h('span', {}, 'Raedworkouts')),
      h('p', {}, 'Family training profiles. Offline-first, synced when reachable.'),
    )
  );
  if (welcomeMode === 'pin' && welcomeSelectedProfile) {
    wrap.appendChild(renderPinPad(welcomeSelectedProfile));
  } else if (welcomeMode === 'register' && welcomeSelectedProfile) {
    wrap.appendChild(renderRegisterPanel(welcomeSelectedProfile));
  } else if (welcomeMode === 'other') {
    wrap.appendChild(renderSomeoneElsePanel());
  } else {
    wrap.appendChild(h('div', { class: 'profile-grid' },
      profiles.map(profile => h('button', {
        type: 'button',
        class: 'profile-tile',
        onClick: () => selectProfile(profile),
      },
        h('span', { class: 'profile-initial' }, String(profile.display_name || profile.user_id || '?').slice(0,1).toUpperCase()),
        h('span', { class: 'profile-name' }, profile.display_name || profile.user_id),
        h('span', { class: 'profile-meta' }, `${profile.sessions || 0} sessions · ${profile.experience || 'returning'}${profile.has_pin ? ' · PIN' : ''}`),
      ))
    ));
    wrap.appendChild(h('button', { class: 'btn ghost full', onClick: () => { welcomeMode = 'other'; renderWelcome(); } }, 'Someone else?'));
    if (welcomeLoading) wrap.appendChild(h('div', { class: 'tiny muted', style: 'text-align:center;margin-top:8px;' }, 'Loading server profiles...'));
  }
  root.appendChild(wrap);
}
function shouldShowPinPrompt() {
  if (!settings.user_id || settings.user_key || settings.needs_pin_reauth) return false;
  const last = settings.pin_prompt_dismissed_at ? new Date(settings.pin_prompt_dismissed_at).getTime() : 0;
  return !last || (Date.now() - last) > 7 * 86400 * 1000;
}
function openSetPinModal() {
  const overlay = $('#modal-overlay');
  const m = $('#modal');
  m.innerHTML = '';
  const pin1 = h('input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '4 digit PIN', style: 'width:100%;margin:8px 0;' });
  const pin2 = h('input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: 'Repeat PIN', style: 'width:100%;margin:8px 0;' });
  const status = h('div', { class: 'tiny muted' }, '');
  m.appendChild(h('h3', {}, 'Lock this profile'));
  m.appendChild(h('p', { class: 'muted' }, 'Set a PIN so only this profile can read or write its cloud row.'));
  m.appendChild(pin1);
  m.appendChild(pin2);
  m.appendChild(status);
  m.appendChild(h('div', { style: 'display:flex; gap:8px; margin-top:12px;' },
    h('button', { class: 'btn ghost', style: 'flex:1;', onClick: () => {
      settings.pin_prompt_dismissed_at = new Date().toISOString();
      saveLocal({ sync: false, dirty: false });
      overlay.classList.remove('show');
      render();
    }}, 'Later'),
    h('button', { class: 'btn primary', style: 'flex:1;', onClick: async () => {
      const p1 = pin1.value.trim();
      const p2 = pin2.value.trim();
      if (!/^\d{4}$/.test(p1)) { status.textContent = 'Use a 4 digit PIN.'; return; }
      if (p1 !== p2) { status.textContent = 'PINs do not match.'; return; }
      status.textContent = 'Saving...';
      try {
        const res = await syncFetch('/register', { method: 'POST', body: JSON.stringify({ user_id: settings.user_id, pin: p1, _auth_token: settings.sync_key }) });
        settings.user_id = res.user_id || settings.user_id;
        settings.user_key = res.user_key || await deriveUserKey(settings.user_id, p1);
        setActiveUser(settings.user_id);
        saveLocal({ sync: false, dirty: false });
        overlay.classList.remove('show');
        toast('PIN set.');
        render();
      } catch (e) {
        status.textContent = /pin_already_set|409/.test(e.message || '') ? 'PIN already exists. Switch profile and sign in.' : 'Could not set PIN.';
      }
    }}, 'Set PIN'),
  ));
  overlay.classList.add('show');
  setTimeout(() => pin1.focus(), 80);
}
function openReconnectPinModal() {
  const overlay = $('#modal-overlay');
  const m = $('#modal');
  m.innerHTML = '';
  const pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '4 digit PIN', style: 'width:100%;margin:8px 0;' });
  const status = h('div', { class: 'tiny muted' }, '');
  let checking = false;
  const submit = async () => {
    const value = pin.value.trim();
    if (checking) return;
    if (!/^\d{4}$/.test(value)) { status.textContent = 'Use a 4 digit PIN.'; return; }
    checking = true;
    status.textContent = 'Reconnecting...';
    try {
      await verifyReconnectPin(value);
      overlay.classList.remove('show');
    } catch (e) {
      checking = false;
      pin.value = '';
      status.textContent = pinErrorMessage(e);
      pin.focus();
    }
  };
  m.appendChild(h('h3', {}, 'Reconnect sync'));
  m.appendChild(h('p', { class: 'muted' }, 'Enter your PIN to reconnect cloud sync. Local workout data stays on this device and will be merged after verification.'));
  m.appendChild(pin);
  m.appendChild(status);
  m.appendChild(h('div', { style: 'display:flex; gap:8px; margin-top:12px;' },
    h('button', { class: 'btn ghost', style: 'flex:1;', onClick: () => overlay.classList.remove('show') }, 'Cancel'),
    h('button', { class: 'btn primary', style: 'flex:1;', onClick: submit }, 'Reconnect'),
  ));
  pin.addEventListener('input', () => {
    pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
    if (pin.value.length === 4) submit();
  });
  overlay.classList.add('show');
  setTimeout(() => pin.focus(), 80);
}
function renderReconnectBanner() {
  return h('div', { class: 'card compact pin-nudge' },
    h('div', { class: 'setting-row' },
      h('div', { class: 'label' },
        h('div', { class: 'name' }, 'Enter your PIN to reconnect sync'),
        h('div', { class: 'desc' }, 'Local workout data is saved. Reconnect to merge it into cloud storage.'),
      ),
      h('button', { class: 'btn tiny primary', onClick: openReconnectPinModal }, 'Enter PIN'),
    )
  );
}

// ---- Theme --------------------------------------------------
const COLOR_THEMES = {
  teal:   { label: 'Teal',   sw_light: '#0f766e', sw_dark: '#14b8a6' },
  orange: { label: 'Orange', sw_light: '#ea580c', sw_dark: '#ff6b35' },
  green:  { label: 'Green',  sw_light: '#16a34a', sw_dark: '#22c55e' },
  red:    { label: 'Red',    sw_light: '#dc2626', sw_dark: '#ef4444' },
  amber:  { label: 'Amber',  sw_light: '#d97706', sw_dark: '#f59e0b' },
};
const BLOCK_COLORS = { 1: 'teal', 2: 'amber', 3: 'red' };

function getAutoColor() {
  const block = Math.min(state.current_block || 1, 3);
  return BLOCK_COLORS[block] || 'teal';
}

function applyTheme() {
  const t = settings.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  // Apply color — auto derives from training block, manual overrides
  const c = settings.block_auto_color !== false ? getAutoColor() : (settings.color_theme || 'teal');
  if (c === 'teal') document.documentElement.removeAttribute('data-color');
  else document.documentElement.setAttribute('data-color', c);
  // Update meta theme-color (status bar)
  const cInfo = COLOR_THEMES[c] || COLOR_THEMES.teal;
  const metaLight = document.getElementById('theme-color-light');
  const metaDark = document.getElementById('theme-color-dark');
  if (metaLight) metaLight.setAttribute('content', cInfo.sw_light);
  if (metaDark) metaDark.setAttribute('content', '#0a0d10');  // matches --bg dark
  // Toggle label — inline SVG icon (consistent line-icon set) + word
  const tt = $('#theme-toggle');
  if (tt) {
    const S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
    const icons = {
      auto: S + '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
      dark: S + '<path d="M20 13.2A7.5 7.5 0 1 1 10.8 4a6 6 0 0 0 9.2 9.2z"/></svg>',
      light: S + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>',
    };
    tt.innerHTML = (icons[t] || icons.auto) + '<span>' + (t === 'auto' ? 'Auto' : (t === 'dark' ? 'Dark' : 'Light')) + '</span>';
  }
}
function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % 3];
  saveLocal();
  applyTheme();
}

// ---- Programme resolver --------------------------------------
function getActiveProgramme() {
  if (state.programme_overrides) return state.programme_overrides;
  const v = settings.programme_variant || 'ppl_3x';
  if (v === 'ppl_3x' && RW.PROGRAMME_PPL) return RW.PROGRAMME_PPL;
  return RW.PROGRAMME;
}
function getActiveVariant() {
  return settings.programme_variant || 'ppl_3x';
}

// ---- Today's session resolver -------------------------------
function getTodayPlannedSession() {
  const prog = getActiveProgramme();
  // Manual override — user forced a specific session (e.g. missed a day)
  if (state.forced_next_session) {
    return prog.sessions.find(s => s.id === state.forced_next_session) || null;
  }
  if (getActiveVariant() === 'ppl_3x') {
    return resolveNextPPLSession(prog).today;
  }
  // Full-body: Tuesday = 2, Saturday = 6
  const dow = new Date().getDay();
  if (dow === 2) return prog.sessions.find(s => s.id === 'session_a');
  if (dow === 6) return prog.sessions.find(s => s.id === 'session_b');
  return null;
}
function getNextPlannedSession() {
  const prog = getActiveProgramme();
  if (getActiveVariant() === 'ppl_3x') {
    return resolveNextPPLSession(prog).next;
  }
  const dow = new Date().getDay();
  const daysToTue = (2 - dow + 7) % 7 || 7;
  const daysToSat = (6 - dow + 7) % 7 || 7;
  if (daysToTue <= daysToSat) return { session: prog.sessions.find(s => s.id === 'session_a'), in_days: daysToTue };
  return { session: prog.sessions.find(s => s.id === 'session_b'), in_days: daysToSat };
}
function resolveNextPPLSession(prog) {
  // Look at last completed PPL session in history; cycle to next.
  const order = ['ppl_push', 'ppl_pull', 'ppl_legs'];
  let lastIdx = -1;
  for (let i = state.history.length - 1; i >= 0; i--) {
    const sid = state.history[i].session_id;
    const idx = order.indexOf(sid);
    if (idx >= 0) { lastIdx = idx; break; }
  }
  const nextIdx = (lastIdx + 1) % order.length;
  const nextSession = prog.sessions.find(s => s.id === order[nextIdx]);
  // PPL: today's planned = next in cycle (no day-of-week binding)
  return { today: nextSession, next: { session: nextSession, in_days: 0 } };
}

// ---- Smart suggestions -------------------------------------
function getLastPerformance(exercise_id) {
  // Find the most recent session that included this exercise
  for (let i = state.history.length - 1; i >= 0; i--) {
    const h = state.history[i];
    const ex = h.exercises[exercise_id];
    if (ex && ex.sets && ex.sets.length) return { date: h.date, ...ex };
  }
  return null;
}
function getLastTwoPerformances(exercise_id) {
  const out = [];
  for (let i = state.history.length - 1; i >= 0 && out.length < 2; i--) {
    const ex = state.history[i].exercises[exercise_id];
    if (ex && ex.sets && ex.sets.length) out.push({ date: state.history[i].date, ...ex });
  }
  return out;
}
function effectiveStartKg(planned) {
  const base = Number(planned.start_kg) || 0;
  if (!base) return 0;
  const exp = state.profile?.experience || 'returning';
  const factor = exp === 'beginner' ? 0.5 : (exp === 'experienced' ? 1.25 : 1);
  const scaled = base * factor;
  if (exp === 'beginner') return Math.max(2.5, Math.floor(scaled / 2.5) * 2.5);
  return Math.round(scaled / 2.5) * 2.5;
}
function roundToGymIncrement(value) {
  const n = Number(value) || 0;
  return Math.max(2.5, Math.round(n / 2.5) * 2.5);
}
function fmtKgValue(value) {
  return Number(value).toFixed(1).replace(/\.0$/, '');
}
function twoSetWarmupFrom(weight) {
  return [
    { weight: roundToGymIncrement(weight * 0.5), reps: 10 },
    { weight: roundToGymIncrement(weight * 0.75), reps: 6 },
  ];
}
function warmupText(planned, suggestedWeight) {
  if (!planned.warmup) return '';
  if (/^2\s+sets/i.test(planned.warmup)) {
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
  if (!ex) return { weight: startKg, note: 'First time — start light, find your RPE 7.' };
  if (!last2.length) return { weight: startKg, note: `⚡ First time — calibration. Start ~${startKg} kg, find a weight you could do for ${planned.reps} with 2-3 left in the tank. سجّل الوزن الحقيقي.` };
  const latest = last2[0];
  const topReps = parseInt(String(planned.reps).split('-').pop(), 10) || 10;
  // Find the heaviest working set
  const workingSets = (latest.sets || []).filter(s => !s.is_warmup && s.weight && s.reps && s.completed);
  if (!workingSets.length) return { weight: latest.sets?.[0]?.weight || planned.start_kg, note: 'Last session not fully logged — repeat.' };
  const lastTopSet = workingSets[workingSets.length - 1];
  const allHitTarget = workingSets.every(s => s.reps >= topReps && (s.rpe == null || s.rpe <= 8));
  // Check if last 2 sessions both hit target
  const isLowerBody = ['quads','glutes','hamstrings','calves'].some(m => ex.primary.includes(m));
  const isAccessory = ex.pattern && ex.pattern.startsWith('isolation');
  const bump = isLowerBody ? 5 : (isAccessory ? 0 : 2.5);
  if (allHitTarget && last2.length === 2) {
    const prevSets = (last2[1].sets || []).filter(s => !s.is_warmup && s.completed);
    const prevAllHit = prevSets.length && prevSets.every(s => s.reps >= topReps && (s.rpe == null || s.rpe <= 8));
    if (prevAllHit) {
      if (bump > 0) {
        return { weight: lastTopSet.weight + bump, note: `🔥 You hit ${topReps} @ RPE≤8 for 2 sessions. Bump +${bump} kg.` };
      } else {
        return { weight: lastTopSet.weight, note: `Add a rep or a set instead of weight (accessory).` };
      }
    }
  }
  return { weight: lastTopSet.weight, note: `Last session: ${lastTopSet.weight} kg × ${lastTopSet.reps}. Match or beat it.` };
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
          if (!s.is_warmup && s.completed) {
            totalSets++;
            totalKg += (Number(s.weight) || 0) * (Number(s.reps) || 0);
          }
        });
      });
    }
  });
  return { totalSets, totalKg: Math.round(totalKg) };
}

// ---- Active session lifecycle ------------------------------
function startSession(session) {
  if (state.active_session) {
    if (!confirm('You have an active session in progress. Discard it and start a new one?')) return;
  }
  const exercises = {};
  session.exercises.forEach(plan => {
    const sug = suggestNextWeight(plan.exercise_id, plan);
    const sets = [];
    // Warmup sets (not counted) — auto-prefill if `is_first_of_muscle`
    if (plan.is_first_of_muscle && plan.warmup) {
      if (/^2\s+sets/i.test(plan.warmup)) {
        twoSetWarmupFrom(sug.weight).forEach(warm =>
          sets.push({ is_warmup: true, weight: warm.weight, reps: warm.reps, rpe: null, completed: false })
        );
      } else if (/^1\s+light\s+set/i.test(plan.warmup)) {
        sets.push({ is_warmup: true, weight: roundToGymIncrement(sug.weight * 0.5), reps: 10, rpe: null, completed: false });
      }
    }
    for (let i = 0; i < plan.sets; i++) {
      sets.push({ is_warmup: false, weight: sug.weight, reps: '', rpe: '', completed: false });
    }
    exercises[plan.exercise_id] = {
      planned: plan,
      sets,
      swapped_to: null,
      notes: '',
    };
  });
  state.active_session = {
    uid: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : ('sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))),
    date: todayISO(),
    session_id: session.id,
    session_name: session.name,
    started_at: new Date().toISOString(),
    exercises,
  };
  focusExerciseIdx = null;
  // Block transition detection — toast on first session of a new block
  const prevBlock = state._last_toasted_block;
  const curBlock = state.current_block || 1;
  if (prevBlock && prevBlock !== curBlock) {
    const blockNames = { 1: 'foundation', 2: 'strength', 3: 'peak intensity' };
    setTimeout(() => toast(`Block ${curBlock} — ${blockNames[curBlock] || 'new block'} phase begins.`, 4000), 800);
    applyTheme();
  }
  state._last_toasted_block = curBlock;
  saveLocal();
  router('home');
  toast('Session started — let\'s go.');
}

function endSession() {
  if (!state.active_session) return;
  const a = state.active_session;
  // Compute completed flag
  const anyDone = Object.values(a.exercises).some(ex => ex.sets.some(s => s.completed));
  if (!anyDone) {
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
  const finishedSession = { ...a, ended_at: new Date().toISOString(), prs: sessionPRs, stats };
  state.history.push(finishedSession);
  state.active_session = null;
  state.forced_next_session = null;  // clear override after session ends
  state.msg_index = (state.msg_index + 1) % (RW.MOTIVATIONAL_MESSAGES?.length || 20);
  focusExerciseIdx = null;
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
      if (!s.completed || s.is_warmup) continue;
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

    prs.length ? h('div', { class: 'pr-card' },
      h('h3', {}, '🏆 Personal Records'),
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
        `Block ${state.current_block || 1}, Week ${state.current_week || 1} of 12 — ` +
        (['foundation', 'strength', 'peak'][Math.min((state.current_block||1)-1, 2)]) + ' phase'
      ),
      h('strong', {}, 'Next: '),
      (() => {
        const next = getNextPlannedSession();
        return next ? (next.session ? next.session.name : next.name) : 'Block complete.';
      })()
    ),

    h('div', { class: 'end-cta' },
      h('a', { href: '#history', class: 'btn' }, 'View history'),
      h('a', { href: '#home', class: 'btn primary' }, 'Done'),
    ),
  );
  root.appendChild(wrap);
}

function swapExercise(exercise_id, alt_id) {
  if (!state.active_session) return;
  const ex = state.active_session.exercises[exercise_id];
  if (!ex) return;
  ex.swapped_to = alt_id;
  // Recalc suggested weight for the new exercise
  const altPlanned = { ...ex.planned, exercise_id: alt_id };
  const sug = suggestNextWeight(alt_id, altPlanned);
  ex.sets.forEach(s => { if (!s.completed && !s.is_warmup) s.weight = sug.weight; });
  saveLocal();
  render();
  toast('Swapped to ' + (getAllExercises().find(e => e.id === alt_id)?.name || alt_id));
}

// ---- Rest timer --------------------------------------------
let restTimer = { interval: null, end: 0 };
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
let focusExerciseIdx = null;

function render() {
  if (!settings.user_id) {
    renderWelcome();
    return;
  }
  document.body.classList.remove('welcome-mode');
  const route = window.location.hash.replace('#', '') || 'home';
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + route));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === route));
  if (route === 'home') renderHome();
  if (route === 'library') renderLibrary();
  if (route === 'history') renderHistory();
  if (route === 'settings') renderSettings();
  if (route === 'help') renderHelp();
  if (route === 'end') renderSessionEnd();
}
function router(route) {
  window.location.hash = route;
  render();
}

function renderHome() {
  const root = $('#page-home');
  root.innerHTML = '';
  const planned = getTodayPlannedSession();
  const next = getNextPlannedSession();
  const streak = getStreak();
  const vol = getWeeklyVolume();
  const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  // Header — structured (accent carries state via the progress meter / top rule)
  if (state.active_session) {
    const a = state.active_session;
    const totalSets = Object.values(a.exercises).reduce((s,ex) => s + ex.sets.filter(set => !set.is_warmup).length, 0);
    const doneSets = Object.values(a.exercises).reduce((s,ex) => s + ex.sets.filter(set => !set.is_warmup && set.completed).length, 0);
    const pct = totalSets ? Math.round(doneSets / totalSets * 100) : 0;
    const parts = a.session_name.split(' — ');
    root.appendChild(h('div', { class: 'today-banner active' },
      h('div', { class: 'tb-kicker' }, 'In progress · started ' + fmtTime(a.started_at)),
      h('h2', {}, parts[0]),
      h('p', {}, parts[1] || 'Log every set as you go.'),
      h('div', { class: 'progress-meter' },
        h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: `width:${pct}%` })),
        h('div', { class: 'progress-label' },
          h('span', {}, `${doneSets} / ${totalSets} working sets`),
          h('span', { class: 'pct' }, pct + '%'),
        ),
      ),
    ));
  } else if (planned) {
    const parts = planned.name.split(' — ');
    root.appendChild(h('div', { class: 'today-banner' },
      h('div', { class: 'tb-kicker' }, dow + ' · Gym day'),
      h('h2', {}, parts[0]),
      h('p', {}, parts[1] || planned.name),
      h('div', { class: 'tb-meta' }, planned.exercises.length + ' exercises · ~70 min'),
    ));
  } else {
    root.appendChild(h('div', { class: 'today-banner rest' },
      h('div', { class: 'tb-kicker' }, 'Rest day'),
      h('h2', {}, 'Next: ' + next.session.name.split(' — ')[0]),
      h('p', {}, getActiveVariant() === 'ppl_3x' ? `${next.session.day} day · next in rotation` : `${next.session.day} · in ${next.in_days} day${next.in_days===1?'':'s'}`),
      h('div', { class: 'tb-meta' }, `Eat ${profileProteinRange()} protein · Sleep 7+ hrs`),
    ));
  }

  if (settings.needs_pin_reauth) {
    root.appendChild(renderReconnectBanner());
  }

  if (shouldShowPinPrompt()) {
    root.appendChild(h('div', { class: 'card compact pin-nudge' },
      h('div', { class: 'setting-row' },
        h('div', { class: 'label' },
          h('div', { class: 'name' }, 'Lock this profile'),
          h('div', { class: 'desc' }, 'Set a PIN so this cloud row is protected. Legacy sync still works during the grace period.'),
        ),
        h('button', { class: 'btn tiny primary', onClick: openSetPinModal }, 'Set PIN'),
      )
    ));
  }

  // Stats row
  root.appendChild(h('div', { class: 'stat-row' },
    h('div', { class: 'stat-tile' },
      h('div', { class: 'stat-num' }, String(streak)),
      h('div', { class: 'stat-cap' }, 'Streak'),
      h('div', { class: 'stat-sub' }, 'sessions / 4 wks'),
    ),
    h('div', { class: 'stat-tile' },
      h('div', { class: 'stat-num' }, String(vol.totalSets)),
      h('div', { class: 'stat-cap' }, 'This week'),
      h('div', { class: 'stat-sub' }, 'working sets'),
    ),
    h('div', { class: 'stat-tile' },
      h('div', { class: 'stat-num' }, vol.totalKg.toLocaleString()),
      h('div', { class: 'stat-cap' }, 'Tonnage'),
      h('div', { class: 'stat-sub' }, 'kg this week'),
    ),
  ));

  const shownSession = planned || next.session;
  const shortSessionName = (session) => session.name.split(' — ')[0];

  // Action button
  if (state.active_session) {
    root.appendChild(h('button', { class: 'btn primary full', onClick: () => render() },
      'Continue session ↓'
    ));
  } else if (planned) {
    root.appendChild(h('button', { class: 'btn primary full', onClick: () => startSession(planned) },
      '▶ Start ' + shortSessionName(planned)
    ));
  } else {
    root.appendChild(h('button', { class: 'btn primary full', onClick: () => startSession(next.session) },
      '▶ Start ' + shortSessionName(next.session)
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
          onClick: () => startSession(s),
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
      root.appendChild(h('div', { class: 'session-chooser' }, toggle, row));
    }
  }

  // Active session detail
  if (state.active_session) {
    root.appendChild(h('div', { class: 'spacer-24' }));
    const a = state.active_session;
    const session = getActiveProgramme().sessions.find(s => s.id === a.session_id);

    // Mood + playlist row
    if (session.mood) {
      root.appendChild(h('div', { class: 'cue', style: 'margin-bottom:10px;' },
        h('strong', {}, '🎯 Today\'s vibe: '), session.mood
      ));
    }
    const platformPlaylists = getCurrentPlaylists(session);
    if (platformPlaylists && platformPlaylists.length) {
      const platLabel = PLATFORM_INFO[settings.music_platform]?.label || 'Music';
      root.appendChild(h('div', { class: 'card compact', style: 'margin-bottom:14px;' },
        h('div', { class: 'tiny muted', style: 'margin-bottom:6px;' },
          `🎧 ${platLabel} — press play, then forget about it:`
        ),
        h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' },
          platformPlaylists.map(p =>
            h('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'btn tiny', title: p.vibe }, p.label)
          )
        ),
      ));
    }

    // Focus mode toggle
    root.appendChild(h('div', { style: 'display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-bottom:8px;' },
      h('span', { class: 'tiny muted' }, 'Focus mode'),
      h('button', {
        class: 'btn tiny' + (settings.focus_mode ? ' primary' : ''),
        onClick: () => { settings.focus_mode = !settings.focus_mode; saveLocal(); render(); }
      }, settings.focus_mode ? 'On — one exercise at a time' : 'Off — show all'),
    ));

    const exEntries = Object.entries(a.exercises);
    if (settings.focus_mode) {
      // Find the next non-complete exercise
      const findNextIdx = () => exEntries.findIndex(([id, ex]) => !ex.sets.filter(s => !s.is_warmup).every(s => s.completed));
      let curIdx = focusExerciseIdx;
      if (curIdx == null || curIdx >= exEntries.length) {
        const ni = findNextIdx();
        curIdx = ni >= 0 ? ni : 0;
      }
      focusExerciseIdx = curIdx;

      const total = exEntries.length;
      const doneCount = exEntries.filter(([_, ex]) => ex.sets.filter(s => !s.is_warmup).every(s => s.completed)).length;

      // Progress strip
      root.appendChild(h('div', { style: 'display:flex; gap:4px; margin-bottom:12px;' },
        exEntries.map(([id, ex], i) => {
          const allDone = ex.sets.filter(s => !s.is_warmup).every(s => s.completed);
          return h('div', {
            style: `flex:1; height:6px; border-radius:999px; cursor:pointer; background:${allDone ? 'var(--good)' : (i === curIdx ? 'var(--accent)' : 'var(--border)')}`,
            onClick: () => { focusExerciseIdx = i; render(); }
          });
        })
      ));

      root.appendChild(h('div', { class: 'tiny muted', style: 'margin-bottom:8px; text-align:center;' },
        `Exercise ${curIdx + 1} of ${total} · ${doneCount} done`
      ));

      // Render only the current exercise, expanded
      const [curId, curEx] = exEntries[curIdx];
      const card = renderExerciseCard(curId, curEx);
      card.classList.add('expanded');
      root.appendChild(card);

      // Prev / Next nav
      root.appendChild(h('div', { style: 'display:flex; gap:8px; margin-top:12px;' },
        h('button', { class: 'btn', style: 'flex:1;', onClick: () => { focusExerciseIdx = Math.max(0, curIdx - 1); render(); } }, '← Previous'),
        curIdx < total - 1
          ? h('button', { class: 'btn primary', style: 'flex:2;', onClick: () => { focusExerciseIdx = curIdx + 1; render(); } }, 'Next exercise →')
          : h('button', { class: 'btn primary', style: 'flex:2;', onClick: endSession }, '✓ Finish session'),
      ));
    } else {
      exEntries.forEach(([ex_id, exState]) => {
        root.appendChild(renderExerciseCard(ex_id, exState));
      });
    }

    root.appendChild(h('div', { class: 'card', style: 'margin-top:16px;' },
      h('h3', {}, '📝 Session notes'),
      h('textarea', {
        class: 'notes-input',
        placeholder: 'How did it feel? Sleep? Energy?',
        onInput: (e) => { a.notes = e.target.value; saveLocal(); }
      }, a.notes || ''),
      h('div', { class: 'spacer-12' }),
      h('button', { class: 'btn primary full', onClick: endSession }, '✓ Finish & save session'),
      h('div', { class: 'spacer-12' }),
      h('button', { class: 'btn danger ghost full', onClick: () => { if (confirm('Discard this session?')) { state.active_session = null; focusExerciseIdx = null; saveLocal(); render(); } } }, 'Discard session'),
    ));
  } else {
    // Show today's planned exercises preview
    const sess = planned || next.session;
    root.appendChild(h('div', { class: 'spacer-24' }));
    root.appendChild(h('h3', { class: 'section-label' }, planned ? 'Today\'s plan' : 'Next session preview'));
    sess.exercises.forEach((p, i) => {
      const ex = getAllExercises().find(e => e.id === p.exercise_id);
      const sug = suggestNextWeight(p.exercise_id, p);
      const bodyUrl = (ex && RW.bodyImg) ? RW.bodyImg(ex.primary) : '';
      root.appendChild(h('div', { class: 'ex' },
        h('div', { class: 'ex-head' },
          h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
          h('div', { class: 'ex-info' },
            h('h4', {}, `${i+1}. ${ex?.name || p.exercise_id}`),
            h('div', { class: 'meta' },
              h('span', { class: 'muscle-tag' }, RW.MUSCLES[ex?.primary?.[0]]?.en || ''),
              ` ${p.sets} × ${p.reps} @ RPE ${p.rpe} · `,
              h('strong', {}, sug.weight + ' kg'),
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
  if (!ex) return h('div', {}, 'Unknown exercise: ' + actualId);
  const sug = suggestNextWeight(actualId, planned);
  const last = getLastPerformance(actualId);
  const allWorkingDone = exState.sets.filter(s => !s.is_warmup).every(s => s.completed);

  const card = h('div', { class: 'ex' + (allWorkingDone ? ' done' : ''), id: 'ex-' + ex_id });
  const isOpen = card.classList.contains('expanded');

  // Head — thumbnail is the body-anatomy illustration (cleaner than action shots)
  const bodyUrl = RW.bodyImg ? RW.bodyImg(ex.primary) : '';
  const head = h('div', { class: 'ex-head', onClick: () => {
    card.classList.toggle('expanded');
    head.querySelector('.ex-status').textContent = card.classList.contains('expanded') ? '▾' : '▸';
  }},
    h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
    h('div', { class: 'ex-info' },
      h('h4', {}, settings.lang === 'ar' && ex.name_ar ? ex.name_ar : ex.name),
      h('div', { class: 'meta' },
        ex.primary.map(m => h('span', { class: 'muscle-tag' }, RW.MUSCLES[m]?.en || m)),
        ` ${planned.sets} × ${planned.reps} · RPE ${planned.rpe}`,
      ),
    ),
    h('div', { class: 'ex-status' + (allWorkingDone ? ' done' : '') }, allWorkingDone ? '✓' : '▸'),
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
  // Today's target — the one highlight
  body.appendChild(h('div', { class: 'today-target' }, h('strong', {}, 'Today: '), sug.note));

  // Cue — subtle tip
  if (ex.cue) body.appendChild(h('div', { class: 'cue' }, h('strong', {}, 'Cue: '), ex.cue));

  // Videos — Library controls which are visible via state.video_hidden
  const allVideos = buildExerciseVideos(actualId, ex);
  if (allVideos.length) {
    const videoRow = h('div', { class: 'video-row' },
      allVideos.map(v => buildVideoTile(v))
    );
    body.appendChild(videoRow);
    // Note: video selection + JN URL editing live in Library, not here.
  }

  // Sets table
  body.appendChild(h('div', { class: 'spacer-12' }));
  body.appendChild(h('div', { class: 'set-grid-headers' },
    h('span', {}, '#'),
    h('span', {}, 'Weight (kg)'),
    h('span', {}, 'Reps'),
    h('span', {}, 'RPE'),
    h('span', {}, ''),
  ));
  exState.sets.forEach((set, idx) => {
    const isWarm = set.is_warmup;
    const setNum = isWarm ? `W${idx+1}` : `${idx - exState.sets.filter(s => s.is_warmup).length + 1}`;
    const row = h('div', { class: 'set-grid' + (set.completed && !isWarm ? ' done' : ''), style: isWarm ? 'opacity:0.7;' : '' },
      h('div', { class: 'set-num' }, setNum + (isWarm ? '' : '')),
      h('input', {
        type: 'number', step: '0.5', inputmode: 'decimal',
        placeholder: String(sug.weight),
        value: set.weight ?? '',
        onFocus: (e) => { try { e.target.select(); } catch(_) {} },
        onInput: (e) => { set.weight = e.target.value === '' ? '' : parseFloat(e.target.value); saveLocal(); }
      }),
      h('input', {
        type: 'number', step: '1', inputmode: 'numeric',
        placeholder: String(planned.reps),
        value: set.reps ?? '',
        onFocus: (e) => { try { e.target.select(); } catch(_) {} },
        onInput: (e) => { set.reps = e.target.value === '' ? '' : parseInt(e.target.value, 10); saveLocal(); }
      }),
      isWarm
        ? h('div', { style: 'opacity:0.4;text-align:center;font-size:14px;line-height:44px;' }, '—')
        : rpePicker(set, () => saveLocal()),
      h('button', {
        class: 'set-check' + (set.completed ? ' checked' : ''),
        onClick: () => {
          if (!set.completed) {
            // default RPE if user hasn't set one
            if (!isWarm && (set.rpe == null || set.rpe === '')) set.rpe = 8;
            // PR detection (silent)
            if (!isWarm && set.weight && set.reps) detectPR(actualId, parseFloat(set.weight), parseInt(set.reps, 10));
          }
          set.completed = !set.completed;
          saveLocal();
          render();
          if (set.completed && !isWarm) {
            startRest(settings.rest_seconds);
            if (settings.vibrate && navigator.vibrate) navigator.vibrate(50);
          }
        }
      }, set.completed ? '✓' : '○'),
    );
    body.appendChild(row);
  });

  // Action row: alternatives + add set + warmup helper
  if (planned.warmup) {
    body.appendChild(h('div', { class: 'warmup-block' },
      h('strong', {}, 'Warm-up: '), warmupText(planned, sug.weight)
    ));
  }

  const actions = h('div', { class: 'ex-actions' },
    h('button', { class: 'btn tiny', onClick: () => {
      const lastWorking = [...exState.sets].reverse().find(s => !s.is_warmup);
      exState.sets.push({ is_warmup: false, weight: lastWorking?.weight ?? sug.weight, reps: '', rpe: '', completed: false });
      saveLocal(); render();
    }}, '+ Set'),
    h('button', { class: 'btn tiny', onClick: () => startRest(settings.rest_seconds) }, '⏱ Rest ' + settings.rest_seconds + 's'),
    h('button', {
      class: 'btn tiny',
      onClick: () => showAltModal(ex_id, exState)
    }, '⇄ Swap'),
  );
  body.appendChild(actions);

  card.appendChild(body);
  return card;
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
    return h('div', { class: 'ex', style: 'cursor:pointer; margin-bottom:6px;', onClick },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-thumb body-img', style: bodyUrl ? `background-image:url('${bodyUrl}')` : '' }),
        h('div', { class: 'ex-info' },
          h('h4', {}, alt.name),
          h('div', { class: 'meta' }, (alt.primary || []).map(p => RW.MUSCLES[p]?.en).join(', ')),
        ),
      ),
    );
  };

  m.appendChild(h('h3', {}, '⇄ Swap'));

  // ===== SECTION 1: Replace =====
  const validAlts = (ex?.alternatives || []).map(id => allEx.find(e => e.id === id)).filter(Boolean);
  if (validAlts.length) {
    m.appendChild(sectionHead('Replace with…', 'Same muscle, different machine. Auto-recalculates the suggested weight.'));
    validAlts.forEach(alt => m.appendChild(altCard(alt, () => {
      swapExercise(ex_id, alt.id);
      $('#modal-overlay').classList.remove('show');
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
        toast('Added "' + x.name + '" to today.');
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
    exercise_id, sets: 3, reps: '10', start_kg: 0, rpe: '8',
    is_first_of_muscle: false,
  };
  const sug = suggestNextWeight(exercise_id, planned);
  const sets = [];
  for (let i = 0; i < planned.sets; i++) {
    sets.push({ is_warmup: false, weight: sug.weight, reps: '', rpe: '', completed: false });
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
    h('div', { class: 'sub' }, allEx.length + ' exercises · tap any group to expand'),
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
        h('span', { class: 'label' }, section.info.en),
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
          h('span', { class: 'muscle-tag' }, RW.MUSCLES[ex.primary[0]]?.en || ''),
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
        'Tap to open. Tap the ⊘ corner toggle to hide it from the session view.'));
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
      const url = prompt('Paste a YouTube link to add to this exercise:');
      if (!url) return;
      state.custom_videos[ex.id] = state.custom_videos[ex.id] || [];
      state.custom_videos[ex.id].push(url);
      saveLocal();
      renderLibrary();
    }}, '+ Add video'));
    body.appendChild(h('button', {
      class: 'btn tiny',
      style: 'margin-left:6px;',
      onClick: () => editJNUrlPrompt(ex.id),
    }, jnHasCustomOverride(ex.id) ? '✏️ JN URL (custom)' : '✏️ Edit JN URL'));
    if (customVids.length) {
      body.appendChild(h('button', { class: 'btn tiny ghost', style: 'margin-left:6px;', onClick: () => {
        if (confirm('Remove all custom videos for this exercise?')) {
          delete state.custom_videos[ex.id];
          saveLocal(); renderLibrary();
        }
      }}, 'Clear custom'));
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
  const muscleOptions = Object.entries(RW.MUSCLES).map(([k, v]) =>
    h('option', { value: k, ...(form.primary === k ? { selected: '' } : {}) }, v.en + ' (' + v.ar + ')')
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
        toast('Added "' + form.name + '" to your library.');
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
    h('div', { class: 'sub' }, state.history.length + ' sessions logged'),
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
          const rpeEmoji_ = s.rpe ? rpeEmoji(s.rpe) : '';
          return `${s.weight}×${s.reps}${rpeEmoji_ ? ' '+rpeEmoji_ : ''}${isPR ? ' 🏆' : ''}`;
        }).join(', '),
      );
      expanded.appendChild(row);
    });
    if (sess.notes) expanded.appendChild(h('div', { class: 'cue', style: 'margin-top:8px;' }, h('strong', {}, 'Notes: '), sess.notes));
    const fallbackSessionName = ({ session_a: 'Session A', session_b: 'Session B', ppl_push: 'Push', ppl_pull: 'Pull', ppl_legs: 'Legs' })[sess.session_id] || sess.session_id;
    card.appendChild(h('div', { onClick: () => { expanded.style.display = expanded.style.display === 'none' ? 'block' : 'none'; } },
      h('div', { class: 'date' }, fmtDate(sess.date) + ' · ' + (sess.session_name || fallbackSessionName)),
      h('h3', { style: 'margin:4px 0;' }, totalSets + ' sets · ' + Math.round(totalKg).toLocaleString() + ' kg total'),
      h('div', { class: 'summary' },
        Object.keys(sess.exercises).slice(0, 5).map(ex_id => {
          const ex = getAllExercises().find(e => e.id === ex_id);
          return h('span', { class: 'ex-pill' }, ex?.name?.split(' ')[0] || ex_id);
        }),
      ),
    ));
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
  const keep = { user_id: settings.user_id, user_key: settings.user_key, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  state = { ...defaultState(), ...(snapshot.state || {}) };
  settings = { ...defaultSettings(), ...(snapshot.settings || {}), ...keep };
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  toast(pushed ? 'Restored previous local snapshot.' : 'Restored locally. Cloud sync is pending.');
}
function notifyUndoRestore() {
  toast('Snapshot restored.', 7000, 'Undo', undoPreRestore);
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
    const payload = await syncFetch('/export?user=' + encodeURIComponent(settings.user_id));
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
  const snap = await syncFetch('/revision?user=' + encodeURIComponent(settings.user_id) + '&rev=' + encodeURIComponent(rev));
  const keep = { user_id: settings.user_id, user_key: settings.user_key, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  state = { ...defaultState(), ...(snap.state_json || {}) };
  settings = { ...defaultSettings(), ...(snap.settings_json || {}), ...keep };
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  if (pushed) notifyUndoRestore();
  else toast('Restored locally. Cloud sync is pending.', 5000, 'Undo', undoPreRestore);
}
async function openRestoreModal() {
  const overlay = $('#modal-overlay');
  const m = $('#modal');
  m.innerHTML = '';
  m.appendChild(h('h3', {}, 'Restore from backup'));
  m.appendChild(h('p', { class: 'muted' }, 'Restoring creates a new head. Older revisions stay on the server.'));
  const list = h('div', { class: 'revision-list' }, h('div', { class: 'tiny muted' }, 'Loading...'));
  m.appendChild(list);
  m.appendChild(h('button', { class: 'btn ghost full', style: 'margin-top:12px;', onClick: () => overlay.classList.remove('show') }, 'Close'));
  overlay.classList.add('show');
  try {
    const rows = await syncFetch('/revisions?user=' + encodeURIComponent(settings.user_id) + '&limit=30');
    list.innerHTML = '';
    rows.forEach(row => list.appendChild(h('button', {
      type: 'button',
      class: 'revision-row',
      onClick: () => {
        overlay.classList.remove('show');
        restoreRevision(row.rev).catch(e => toast('Restore failed: ' + (e.message || 'unknown'), 3500));
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
  const keep = { user_id: settings.user_id, user_key: settings.user_key, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  if (parsed.state) state = { ...defaultState(), ...parsed.state };
  if (parsed.settings) settings = { ...defaultSettings(), ...parsed.settings, ...keep };
  else settings = { ...settings, ...keep };
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  toast(pushed ? 'Imported.' : 'Imported locally. Cloud sync is pending.', 7000, 'Undo', undoPreRestore);
}
async function switchProfile() {
  if (syncDirty || readDirtyMarker(settings.user_id) || syncInFlightPromise) {
    toast('Syncing before switch...', 1200);
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
  welcomePinMessage = '';
  welcomeProfiles = null;
  render();
}

function renderSettings() {
  const root = $('#page-settings');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, 'Settings'),
    h('div', { class: 'sub' }, 'Profile, programme, sync, and data.'),
  ));
  if (settings.needs_pin_reauth) {
    root.appendChild(renderReconnectBanner());
  }

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
    ['beginner','returning','experienced'].map(v => h('option', { value: v, ...(state.profile?.experience === v ? { selected: '' } : {}) },
      v === 'beginner' ? 'New to the gym' : v === 'returning' ? 'Trained before, coming back' : 'Currently training'
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
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Experience'), h('div', { class: 'desc' }, 'Only affects first-time calibration weights.')),
    experienceSelect,
  ));
  profileCard.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Bodyweight'), h('div', { class: 'desc' }, `Protein target: ${profileProteinRange()}/day.`)),
    bwInput,
  ));
  profileCard.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, h('div', { class: 'name' }, 'Cloud identity'), h('div', { class: 'desc' }, settings.user_key ? 'PIN protected.' : 'Legacy token until a PIN is set.')),
    h('button', { class: 'btn tiny', onClick: switchProfile }, 'Switch profile'),
  ));
  root.appendChild(profileCard);

  // Programme
  const progVariant = getActiveVariant();
  root.appendChild(h('div', { class: 'card' },
    h('h3', {}, 'Programme'),
    h('div', { class: 'setting-row' },
      h('div', { class: 'label' },
        h('div', { class: 'name' }, 'Training split'),
        h('div', { class: 'desc' }, 'History and suggestions stay per exercise.'),
      ),
      h('div', { class: 'variant-switch', style: 'margin:0;' },
        h('button', {
          type: 'button',
          class: progVariant === 'fullbody_2x' ? 'active' : '',
          onClick: () => switchVariant('fullbody_2x'),
        }, '2-day'),
        h('button', {
          type: 'button',
          class: progVariant === 'ppl_3x' ? 'active' : '',
          onClick: () => switchVariant('ppl_3x'),
        }, '3-day'),
      ),
    ),
  ));

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

  // Rest timer
  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Rest timer'),
      h('div', { class: 'desc' }, 'Default seconds between sets.'),
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
    'Pick your platform. The session screen will show pre-curated playlists for that service.'
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
        configured ? 'Checking…' : 'Not connected'),
    ),
  );
  root.appendChild(card);
  root.appendChild(musicCard);

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
  root.appendChild(dataCard);

  // Silent reachability probe — so the badge tells the truth even when the
  // backend is paused/unreachable (no toast; updates only the badge).
  if (configured) {
    syncFetch('/health', { timeoutMs: 8000 })
      .then(() => setSyncStatus('ok', 'Connected'))
      .catch(() => setSyncStatus('err', 'Offline — tap Test below'));
  }

  // Advanced settings (collapsed by default)
  const adv = h('details', { class: 'card advanced-settings' },
    h('summary', {}, 'Advanced settings'),
  );

  // Accent color picker — 5 options as colored swatches
  const colorRow = h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Accent color'),
      h('div', { class: 'desc' }, 'Changes buttons + highlights. The dark/light theme stays the same.'),
    ),
    h('div', { class: 'color-picker' },
      Object.entries(COLOR_THEMES).map(([key, info]) =>
        h('button', {
          type: 'button',
          class: 'color-swatch' + (settings.color_theme === key ? ' active' : ''),
          title: info.label,
          style: `background: linear-gradient(135deg, ${info.sw_light} 0%, ${info.sw_light} 50%, ${info.sw_dark} 50%, ${info.sw_dark} 100%);`,
          onClick: () => { settings.color_theme = key; saveLocal(); applyTheme(); renderSettings(); }
        })
      )
    ),
  );
  adv.appendChild(colorRow);


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
  const sessionKeys = activeProg ? activeProg.sessions.map(s => s.id) : [];
  const fmtSessionKey = k => k.replace('session_', '').replace('ppl_', '').toUpperCase();
  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Force next session'),
      h('div', { class: 'desc' },
        state.forced_next_session
          ? `Forced: ${fmtSessionKey(state.forced_next_session)} — will clear after that session ends.`
          : 'Missed a day? Override which session starts next. Auto-resets after the session.'
      ),
    ),
    h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' },
      sessionKeys.map(key =>
        h('button', {
          class: 'btn tiny' + (state.forced_next_session === key ? ' primary' : ''),
          onClick: () => {
            state.forced_next_session = state.forced_next_session === key ? null : key;
            saveLocal();
            renderSettings();
            toast(state.forced_next_session
              ? 'Next session forced to ' + fmtSessionKey(key) + '.'
              : 'Session override cleared.');
          }
        }, fmtSessionKey(key))
      ),
      state.forced_next_session
        ? h('button', { class: 'btn tiny', onClick: () => { state.forced_next_session = null; saveLocal(); renderSettings(); toast('Cleared.'); } }, '✕ Clear')
        : null,
    ),
  ));

  // Gym launcher override
  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Gym launcher button URL'),
      h('div', { class: 'desc' },
        'Default opens IN2 Fitness via scope.bit:// scheme, falls back to App Store. ',
        'If that doesn\'t work, create an iOS Shortcut named "Open IN2" and paste: ',
        h('code', {}, 'shortcuts://run-shortcut?name=Open%20IN2')
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

  root.appendChild(adv);

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
  root.appendChild(langCard);
}

function renderHelp() {
  const root = $('#page-help');
  root.innerHTML = '';
  const prog = getActiveProgramme();
  const variant = getActiveVariant();
  const sessions = prog.sessions || [];
  const firstSession = sessions[0];
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, 'How this works'),
    h('div', { class: 'sub' }, `${state.profile?.display_name || settings.user_id} · ${VARIANTS[variant]?.label || 'Programme'}`),
  ));
  const card = h('div', { class: 'card onboard' });
  card.appendChild(h('h2', {}, 'How the app works'));
  card.appendChild(h('p', {}, 'Pick your profile, start the next session, log the actual weight/reps/RPE, and finish. The app works offline first and syncs when the server is reachable.'));
  card.appendChild(h('h2', {}, 'Your programme'));
  card.appendChild(h('p', {}, variant === 'ppl_3x'
    ? 'Push/Pull/Legs cycles by history. Pick any 3 days with 24h+ rest.'
    : 'Full-body 2-day uses Session A and Session B. The app can still start either session when your week shifts.'
  ));
  sessions.forEach(sess => {
    card.appendChild(h('h3', {}, sess.name));
    card.appendChild(h('ul', {},
      sess.exercises.map(plan => {
        const ex = getAllExercises().find(e => e.id === plan.exercise_id);
        const sug = suggestNextWeight(plan.exercise_id, plan);
        return h('li', {}, `${ex?.name || plan.exercise_id}: ${plan.sets} x ${plan.reps} @ ~${sug.weight} kg`);
      })
    ));
  });
  card.appendChild(h('h2', {}, 'First sessions = calibration'));
  card.appendChild(h('p', {}, `Your profile is "${state.profile?.experience || 'returning'}". First-time weights scale from the reference programme, then your own history takes over. RPE: 😌 easy = 3 reps left, 💪 right = 1-2 left, 🥵 hard = maybe 1 left.`));
  card.appendChild(h('h2', {}, 'Progressive overload'));
  card.appendChild(h('p', {}, 'If the last two sessions hit the top of the rep range at RPE 8 or easier, the app suggests +2.5 kg upper body or +5 kg lower body. Accessories add reps before weight.'));
  card.appendChild(h('h2', {}, 'The rules'));
  card.appendChild(h('ul', {},
    h('li', {}, 'Technique beats weight. No grinding in calibration.'),
    h('li', {}, `Protein target: ${profileProteinRange()}/day. Sleep 7+ hours.`),
    h('li', {}, 'No barbell back squat or conventional deadlift in Block 1. RDL comes after form is ready.'),
  ));
  card.appendChild(h('h2', {}, 'Library & videos'));
  card.appendChild(h('p', {}, 'Exercises include Mohannad clips and a Jeff Nippard form link. You can add custom videos, hide videos from session view, edit JN links, and add custom exercises.'));
  card.appendChild(h('h2', {}, 'Your data'));
  card.appendChild(h('p', {}, 'Profiles use PINs, sync is automatic, and the server keeps revisions plus scheduled backups. Settings has restore from backup, cloud download, and local JSON export/import. Offline logging stays on this device until sync returns.'));
  card.appendChild(h('h2', {}, 'Install to Home Screen'));
  card.appendChild(h('p', {}, 'iPhone Safari: Share button -> Add to Home Screen. Android Chrome: menu -> Install app or Add to Home screen.'));
  root.appendChild(card);
}

// ---- Boot ---------------------------------------------------
function init() {
  loadLocal();
  applyLang();

  // ?user=abdullah — profile picker preselect only. It never bypasses PIN.
  const urlUser = new URLSearchParams(window.location.search).get('user');
  if (urlUser && !settings.user_id) welcomePreselectUser = urlUser.trim();

  applyTheme();

  // Wire tab bar
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => router(t.dataset.route));
  });
  $('#theme-toggle').addEventListener('click', cycleTheme);
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
        setSyncStatus('err', 'Pull failed: ' + (err.message || 'unknown'));
        toast('Sync failed — working offline.', 3000);
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
        toast('New version ready — updating when you switch away.', 3000);
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
