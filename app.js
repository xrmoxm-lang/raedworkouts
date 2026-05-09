/* ============================================================
   Raedworkouts — app.js
   Vanilla JS PWA. Pure-frontend logic + optional Supabase sync.
   ============================================================ */

// Pre-configured Supabase — anon key is safe to commit (designed to be public).
const DEFAULT_SUPABASE_URL = 'https://ujcrewuikmjrhdjbjlrm.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_2_m7AXyYXc4KlZjHkxT-Pw_U0geTslv';

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
const toast = (msg, ms = 1800) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), ms);
};

// ---- State / storage layer ----------------------------------
const STORAGE_KEY = 'raedworkouts.v1';
const SETTINGS_KEY = 'raedworkouts.settings.v1';

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
  fullbody_2x: { label: 'Full-body 2×', desc: 'Tuesday + Saturday. Active.' },
  ppl_3x:      { label: 'Push/Pull/Legs 3×', desc: '3 days/week. Activates at block boundary.' },
};
function isAtBlockBoundary() {
  // Boundary if we're starting a new block (week 1, 5, 9) or week 12 deload complete.
  const w = state.current_week || 1;
  return w === 1 || w === 5 || w === 9 || w >= 12;
}
function attemptVariantChange(newVariant) {
  if ((settings.programme_variant || 'fullbody_2x') === newVariant) {
    settings.pending_variant = null;
    saveLocal(); renderSettings();
    return;
  }
  if (isAtBlockBoundary()) {
    settings.programme_variant = newVariant;
    settings.pending_variant = null;
    saveLocal();
    toast('Programme switched to ' + VARIANTS[newVariant].label + '.');
    renderSettings();
  } else {
    if (confirm(
      `You're mid-block (week ${state.current_week}). Switching now destroys calibration data.\n\n` +
      `Queue the switch for the next block boundary instead?`
    )) {
      settings.pending_variant = newVariant;
      saveLocal();
      toast('Switch queued for next block.');
      renderSettings();
    }
  }
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
  if (!url) return '';
  const m = String(url).match(/(?:shorts\/|v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
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
  programme_variant: 'fullbody_2x',  // fullbody_2x | ppl_3x  (PPL queued, applies at next block boundary)
  pending_variant: null,       // queued variant change waiting for block boundary
  show_pr_summary: true,       // show end-of-session PR review
  // Gym launcher: tries scheme first, falls back to App Store URL
  gym_launch_scheme: 'scope.bit://',                                  // bundle ID-based scheme attempt
  gym_launch_fallback: 'https://apps.apple.com/sa/app/in2-fitness/id1536137282', // App Store fallback
  gym_launch_override: '',     // user-set custom URL (e.g. shortcuts://run-shortcut?name=Open%20IN2)
  supabase_url: DEFAULT_SUPABASE_URL,
  supabase_key: DEFAULT_SUPABASE_KEY,
  user_id: '',
  block_auto_color: true,
  lang: 'en',
});

let state = defaultState();
let settings = defaultSettings();

function loadLocal() {
  try { state = { ...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch (e) {}
  try { settings = { ...defaultSettings(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) {}
  // Always use the baked-in credentials — no manual setup needed
  settings.supabase_url = DEFAULT_SUPABASE_URL;
  settings.supabase_key = DEFAULT_SUPABASE_KEY;
}
function saveLocal() {
  state.last_sync = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (settings.supabase_url && settings.supabase_key) {
    syncToCloud().catch(err => {
      setSyncStatus('err', 'Sync failed: ' + (err.message || 'unknown'));
      if (!saveLocal._toastShown) {
        saveLocal._toastShown = true;
        toast('Cloud sync failed — check Settings → Cloud sync.', 3500);
      }
    });
  }
}

// ---- Supabase sync (optional) ------------------------------
async function supaFetch(path, opts = {}) {
  const url = settings.supabase_url.replace(/\/$/, '') + path;
  const headers = {
    'apikey': settings.supabase_key,
    'Authorization': 'Bearer ' + settings.supabase_key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(opts.headers || {})
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function syncToCloud() {
  if (!settings.supabase_url || !settings.supabase_key || !settings.user_id) return;
  const payload = {
    user_id: settings.user_id,
    state_json: state,
    settings_json: settings,
    updated_at: new Date().toISOString(),
  };
  await supaFetch(`/rest/v1/raedworkouts?on_conflict=user_id`, {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
  setSyncStatus('ok', 'Synced ' + fmtTime(Date.now()));
  saveLocal._toastShown = false;  // reset so next failure is visible again
}

async function pullFromCloud() {
  if (!settings.supabase_url || !settings.supabase_key || !settings.user_id) return;
  const userId = settings.user_id;
  const rows = await supaFetch(`/rest/v1/raedworkouts?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
  if (rows && rows.length) {
    const remote = rows[0];
    if (remote.state_json) {
      state = { ...defaultState(), ...remote.state_json };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
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
  if (!settings.supabase_url || !settings.supabase_key) {
    toast('Configure Supabase URL and key first.');
    return;
  }
  toast('Testing…');
  try {
    await supaFetch('/rest/v1/raedworkouts?limit=1');
    setSyncStatus('ok', 'Connected ✓');
    toast('Connection OK.');
  } catch (e) {
    setSyncStatus('err', 'Failed: ' + (e.message || 'unknown'));
    toast('Connection failed: ' + (e.message || 'unknown'), 3500);
  }
}

function showNameModal() {
  const overlay = $('#modal-overlay');
  const m = $('#modal');
  m.innerHTML = '';
  overlay.dataset.required = 'true';  // blocks outside-click dismiss
  const nameInput = h('input', {
    type: 'text',
    placeholder: 'e.g. Raed, Ahmed...',
    style: 'width:100%;margin:12px 0;font-size:1.1rem;',
  });
  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) { toast('Enter your name.'); return; }
    settings.user_id = name.toLowerCase().replace(/\s+/g, '_');
    delete overlay.dataset.required;
    saveLocal();
    overlay.classList.remove('show');
    toast('Welcome, ' + name + '!');
    if (settings.supabase_url && settings.supabase_key) {
      pullFromCloud().then(ok => { if (ok) render(); }).catch(() => {});
    }
  };
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  m.appendChild(h('h3', { style: 'margin-bottom:8px;' }, t('welcome')));
  m.appendChild(h('p', { class: 'muted', style: 'margin-bottom:4px;' }, t('welcome_desc')));
  m.appendChild(nameInput);
  m.appendChild(h('button', { class: 'btn primary', style: 'width:100%;', onClick: submit }, t('start_arrow')));
  overlay.classList.add('show');
  setTimeout(() => nameInput.focus(), 150);
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
  if (metaDark) metaDark.setAttribute('content', '#0b0d10');  // dark bg stays the same
  // Toggle label
  const tt = $('#theme-toggle');
  if (tt) tt.textContent = t === 'auto' ? '🌓 Auto' : (t === 'dark' ? '🌙 Dark' : '☀️ Light');
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
  const v = settings.programme_variant || 'fullbody_2x';
  if (v === 'ppl_3x' && RW.PROGRAMME_PPL) return RW.PROGRAMME_PPL;
  return RW.PROGRAMME;
}
function getActiveVariant() {
  return settings.programme_variant || 'fullbody_2x';
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

function suggestNextWeight(exercise_id, planned) {
  // Returns { weight, note } — based on last 2 sessions
  const last2 = getLastTwoPerformances(exercise_id);
  const ex = getAllExercises().find(e => e.id === exercise_id);
  if (!ex) return { weight: planned.start_kg, note: 'First time — start light, find your RPE 7.' };
  if (!last2.length) return { weight: planned.start_kg, note: '⚡ First session — calibrate. Start with ' + planned.start_kg + ' kg.' };
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
      // Two warmup placeholders for first exercise of muscle — user logs them
      sets.push({ is_warmup: true, weight: Math.round(sug.weight * 0.5 * 2) / 2, reps: 10, rpe: null, completed: false });
      sets.push({ is_warmup: true, weight: Math.round(sug.weight * 0.75 * 2) / 2, reps: 6, rpe: null, completed: false });
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
    date: todayISO(),
    session_id: session.id,
    session_name: session.name,
    started_at: new Date().toISOString(),
    exercises,
  };
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
function render() {
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

  // Banner
  if (state.active_session) {
    const a = state.active_session;
    const totalSets = Object.values(a.exercises).reduce((s,ex) => s + ex.sets.filter(set => !set.is_warmup).length, 0);
    const doneSets = Object.values(a.exercises).reduce((s,ex) => s + ex.sets.filter(set => !set.is_warmup && set.completed).length, 0);
    root.appendChild(h('div', { class: 'today-banner' },
      h('h2', {}, '🏋️ In progress: ' + a.session_name.split(' — ')[0]),
      h('p', {}, `${doneSets} / ${totalSets} working sets done`),
      h('span', { class: 'pill' }, 'Started ' + fmtTime(a.started_at)),
    ));
  } else if (planned) {
    root.appendChild(h('div', { class: 'today-banner' },
      h('h2', {}, '🔥 Today is ' + dow + ' — gym day'),
      h('p', {}, planned.name),
      h('span', { class: 'pill' }, planned.exercises.length + ' exercises · ~70 min'),
    ));
  } else {
    root.appendChild(h('div', { class: 'today-banner' },
      h('h2', {}, '🛋️ Rest day'),
      h('p', {}, `Next: ${next.session.day} (${next.in_days} day${next.in_days===1?'':'s'}) — ${next.session.name.split(' — ')[0]}`),
      h('span', { class: 'pill' }, 'Eat 130–160g protein. Sleep 7+ hours.'),
    ));
  }

  // Stats row
  root.appendChild(h('div', { class: 'card-row', style: 'margin-bottom:14px;' },
    h('div', { class: 'card compact', style: 'flex:1; text-align:center;' },
      h('div', { class: 'tiny muted' }, 'STREAK'),
      h('div', { style: 'font-size:24px; font-weight:700;' }, String(streak)),
      h('div', { class: 'tiny muted' }, 'sessions / 4 wks'),
    ),
    h('div', { class: 'card compact', style: 'flex:1; text-align:center;' },
      h('div', { class: 'tiny muted' }, 'THIS WEEK'),
      h('div', { style: 'font-size:24px; font-weight:700;' }, String(vol.totalSets)),
      h('div', { class: 'tiny muted' }, 'working sets'),
    ),
    h('div', { class: 'card compact', style: 'flex:1; text-align:center;' },
      h('div', { class: 'tiny muted' }, 'TONNAGE'),
      h('div', { style: 'font-size:20px; font-weight:700;' }, vol.totalKg.toLocaleString()),
      h('div', { class: 'tiny muted' }, 'kg this week'),
    ),
  ));

  // Action button
  if (state.active_session) {
    root.appendChild(h('button', { class: 'btn primary full', onClick: () => render() },
      'Continue session ↓'
    ));
  } else if (planned) {
    root.appendChild(h('button', { class: 'btn primary full', onClick: () => startSession(planned) },
      '▶ Start ' + planned.name.split(' — ')[0]
    ));
  } else {
    root.appendChild(h('button', { class: 'btn ghost full', onClick: () => startSession(next.session) },
      'Train anyway: ' + next.session.name.split(' — ')[0]
    ));
  }

  // Active session detail
  if (state.active_session) {
    root.appendChild(h('div', { class: 'spacer-24' }));
    const a = state.active_session;
    const session = getActiveProgramme().sessions.find(s => s.id === a.session_id);
    a._currentSession = session;

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
      let curIdx = a._focus_idx;
      if (curIdx == null || curIdx >= exEntries.length) {
        const ni = findNextIdx();
        curIdx = ni >= 0 ? ni : 0;
      }
      a._focus_idx = curIdx;

      const total = exEntries.length;
      const doneCount = exEntries.filter(([_, ex]) => ex.sets.filter(s => !s.is_warmup).every(s => s.completed)).length;

      // Progress strip
      root.appendChild(h('div', { style: 'display:flex; gap:4px; margin-bottom:12px;' },
        exEntries.map(([id, ex], i) => {
          const allDone = ex.sets.filter(s => !s.is_warmup).every(s => s.completed);
          return h('div', {
            style: `flex:1; height:6px; border-radius:999px; cursor:pointer; background:${allDone ? 'var(--good)' : (i === curIdx ? 'var(--accent)' : 'var(--border)')}`,
            onClick: () => { a._focus_idx = i; render(); }
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
        h('button', { class: 'btn', style: 'flex:1;', onClick: () => { a._focus_idx = Math.max(0, curIdx - 1); render(); } }, '← Previous'),
        curIdx < total - 1
          ? h('button', { class: 'btn primary', style: 'flex:2;', onClick: () => { a._focus_idx = curIdx + 1; render(); } }, 'Next exercise →')
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
        style: 'width:100%; min-height:60px; background:var(--bg-elev); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:8px; font-family:inherit; font-size:14px;',
        placeholder: 'How did it feel? Sleep? Energy?',
        onInput: (e) => { a.notes = e.target.value; saveLocal(); }
      }, a.notes || ''),
      h('div', { class: 'spacer-12' }),
      h('button', { class: 'btn primary full', onClick: endSession }, '✓ Finish & save session'),
      h('div', { class: 'spacer-12' }),
      h('button', { class: 'btn danger ghost full', onClick: () => { if (confirm('Discard this session?')) { state.active_session = null; saveLocal(); render(); } } }, 'Discard session'),
    ));
  } else {
    // Show today's planned exercises preview
    const sess = planned || next.session;
    root.appendChild(h('div', { class: 'spacer-24' }));
    root.appendChild(h('h3', { style: 'margin:8px 0 12px; font-size:15px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;' }, planned ? 'Today\'s plan' : 'Next session preview'));
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
        h('strong', {}, '📊 Last time'), ` (${fmtDate(last.date)}): `,
        ws.map(s => `${s.weight}×${s.reps}`).join(', ')
      ));
    }
  }
  // Suggestion note
  body.appendChild(h('div', { class: 'last-time' }, h('strong', {}, '🎯 Today: '), sug.note));

  // Cue
  if (ex.cue) body.appendChild(h('div', { class: 'cue' }, h('strong', {}, '💡 Cue: '), ex.cue));

  // Videos — Library controls which are visible via state.video_hidden
  const customVids = state.custom_videos[actualId] || [];
  const jnUrl = getJNUrl(actualId);
  const jnId = ytIdFromUrl(jnUrl);
  const allVideos = [
    ...(ex.mohannad || []).map((id, i) => ({
      key: 'mohannad_' + i,
      url: 'https://www.youtube.com/shorts/' + id, thumb: RW.thumb(id), label: 'Mohannad'
    })),
    ...(jnUrl ? [{
      key: 'jn',
      url: jnUrl,
      thumb: jnId ? RW.thumb(jnId) : '',
      label: jnHasCustomOverride(actualId) ? 'JN (custom)' : 'Jeff Nippard',
      nippard: true
    }] : []),
    ...customVids.map((url, i) => {
      const id = ytIdFromUrl(url);
      return { key: 'custom_' + i, url, thumb: id ? RW.thumb(id) : '', label: 'Custom' };
    })
  ].filter(v => !isVideoHidden(actualId, v.key));
  if (allVideos.length) {
    const videoRow = h('div', { class: 'video-row' },
      allVideos.map(v => h('a', {
        href: v.url, target: '_blank', rel: 'noopener',
        class: 'video-thumb' + (v.nippard ? ' nippard' : ''),
        style: v.thumb ? `background-image:url('${v.thumb}')` : 'background:var(--bg-elev);',
        title: v.label,
      }))
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
    const row = h('div', { class: 'set-grid', style: isWarm ? 'opacity:0.7;' : '' },
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
      h('strong', {}, '🔥 Warmup: '), planned.warmup
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
    const jnUrl = getJNUrl(ex.id);
    const jnId = ytIdFromUrl(jnUrl);
    const allVideos = [
      ...(ex.mohannad || []).map((id, i) => ({
        key: 'mohannad_' + i,
        url: 'https://www.youtube.com/shorts/' + id, thumb: RW.thumb(id), label: 'M' + (i+1)
      })),
      ...(jnUrl ? [{ key: 'jn', url: jnUrl, thumb: jnId ? RW.thumb(jnId) : '', label: 'JN', nippard: true }] : []),
      ...customVids.map((url, i) => {
        const id = ytIdFromUrl(url);
        return { key: 'custom_' + i, url, thumb: id ? RW.thumb(id) : '', label: '+', custom: true };
      })
    ];
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
          const link = h('a', {
            href: v.url, target: '_blank', rel: 'noopener',
            class: 'video-thumb' + (v.nippard ? ' nippard' : ''),
            style: v.thumb ? `background-image:url('${v.thumb}')` : 'background:var(--bg-elev);',
            title: v.label,
          });
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
    card.appendChild(h('div', { onClick: () => { expanded.style.display = expanded.style.display === 'none' ? 'block' : 'none'; } },
      h('div', { class: 'date' }, fmtDate(sess.date) + ' · ' + (sess.session_id === 'session_a' ? 'Session A' : 'Session B')),
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

function renderSettings() {
  const root = $('#page-settings');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, 'Settings'),
    h('div', { class: 'sub' }, 'Theme, sync, and data export.'),
  ));

  const card = h('div', { class: 'card' });

  // Theme
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

  // Sync status — minimal, hidden from users, just a status line
  const cloudCard = h('div', { class: 'card', style: 'padding:10px 14px;' },
    h('div', { style: 'display:flex; justify-content:space-between; align-items:center;' },
      h('div', { class: 'tiny muted' }, '☁️ Cloud sync'),
      h('span', { id: 'sync-status', class: 'sync-status ' + (settings.supabase_url ? 'ok' : 'off') },
        settings.supabase_url ? 'Connected' : 'Not connected'),
    ),
  );
  root.appendChild(card);
  root.appendChild(musicCard);
  root.appendChild(cloudCard);

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

  // Programme variant
  const variant = settings.programme_variant || 'fullbody_2x';
  const queued = settings.pending_variant;
  adv.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, 'Programme variant'),
      h('div', { class: 'desc' },
        queued
          ? `Queued: ${VARIANTS[queued]?.label}. Will activate at next block boundary.`
          : 'Locked to block boundaries. Switching mid-block destroys calibration data.'
      ),
    ),
    h('div', { style: 'display:flex; gap:6px;' },
      Object.entries(VARIANTS).map(([key, v]) =>
        h('button', {
          class: 'btn tiny' + (variant === key ? ' primary' : (queued === key ? ' primary' : '')),
          onClick: () => attemptVariantChange(key)
        }, v.label)
      )
    ),
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
      h('div', { class: 'name' }, 'Gym launcher (🏟 button) URL'),
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

  // Data export / import / wipe
  const dataCard = h('div', { class: 'card' });
  dataCard.appendChild(h('h3', {}, '💾 Data'));
  dataCard.appendChild(h('div', { style: 'display:flex; gap:8px; flex-wrap:wrap;' },
    h('button', { class: 'btn', onClick: () => {
      const blob = new Blob([JSON.stringify({ state, settings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'raedworkouts-backup-' + todayISO() + '.json'; a.click();
      URL.revokeObjectURL(url);
    }}, '⬇ Export JSON'),
    h('button', { class: 'btn', onClick: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        const text = await f.text();
        try {
          const parsed = JSON.parse(text);
          if (parsed.state) state = { ...defaultState(), ...parsed.state };
          if (parsed.settings) settings = { ...defaultSettings(), ...parsed.settings };
          saveLocal(); applyTheme(); render();
          toast('Imported.');
        } catch (e) { alert('Import failed: ' + e.message); }
      };
      inp.click();
    }}, '⬆ Import JSON'),
    h('button', { class: 'btn danger', onClick: () => {
      if (!confirm('Wipe ALL local data? This cannot be undone (unless you have cloud sync set up and pull again).')) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
      state = defaultState(); settings = defaultSettings();
      applyTheme(); render(); toast('Wiped.');
    }}, '🗑 Wipe local data'),
  ));
  root.appendChild(dataCard);

  // Athlete profile (read-only summary)
  const profile = h('div', { class: 'card' });
  profile.appendChild(h('h3', {}, '👤 Athlete profile'));
  Object.entries(RW.ATHLETE).forEach(([k, v]) => {
    if (Array.isArray(v)) v = v.join(', ');
    if (typeof v === 'object') return;
    profile.appendChild(h('div', { class: 'setting-row' },
      h('div', { class: 'label' }, h('div', { class: 'name' }, k.replace(/_/g, ' '))),
      h('div', { class: 'tiny muted' }, String(v)),
    ));
  });
  root.appendChild(profile);

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
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, 'How this works'),
    h('div', { class: 'sub' }, 'Read this once. It explains everything.'),
  ));
  root.appendChild(h('div', { class: 'card onboard', html: `
    <h2>The programme</h2>
    <p>Full-body × 2 days/week — Tuesday (Session A) + Saturday (Session B). Each muscle hits twice a week. Block 1 is calibration: 5 exercises per session, RPE 7–8, no grinding.</p>

    <h2>Each session day</h2>
    <ol>
      <li>Open the app on Home → tap <strong>Start Session</strong>.</li>
      <li>The first exercise of each muscle has 2 warm-up sets pre-filled (50% × 10, 75% × 6). Log them and check them off.</li>
      <li>Working sets show your <strong>suggested weight</strong> based on your last 2 sessions. Hit it. Tick the circle when done — rest timer starts automatically.</li>
      <li>Machine taken? Tap <strong>⇄ Swap</strong> on any exercise to use a pre-curated alternative for the same muscle.</li>
      <li>When done, tap <strong>Finish & save session</strong>. The session goes to History.</li>
    </ol>

    <h2>Progressive overload (auto)</h2>
    <p>If you hit the top of the rep range at RPE ≤ 8 for <strong>two sessions in a row</strong>, the next session suggests +2.5 kg (upper) or +5 kg (lower). Accessories add reps before weight. You don't have to remember anything.</p>

    <h2>Rules</h2>
    <ul>
      <li>RPE 7–8: leave 2–3 reps in the tank. Never grind.</li>
      <li>Technique always beats weight. If form breaks, drop the weight.</li>
      <li>No barbell back squat or conventional deadlift in Block 1. RDL introduced in Block 2.</li>
      <li>Eat 130–160 g protein/day. Sleep ≥ 7 hours. Without these, the gym does nothing.</li>
    </ul>

    <h2>Library</h2>
    <p>30 exercises. Each has Mohannad's short clips (the small thumbnails) and one Jeff Nippard form video (the teal-bordered one labeled JN). You can paste your own YouTube links per exercise. They're saved permanently.</p>

    <h2>Cloud sync (Supabase)</h2>
    <p>Optional. By default, your data lives only in this browser. To sync across phones/laptops:</p>
    <ol>
      <li>Make a free account at <code>supabase.com</code>.</li>
      <li>New project. Copy the <strong>Project URL</strong> and <strong>anon key</strong> from Project Settings → API.</li>
      <li>Run this SQL in the Supabase SQL editor:</li>
    </ol>
    <pre style="background:var(--bg-elev); padding:10px; border-radius:8px; font-size:11px; overflow-x:auto;"><code>create table raedworkouts (
  user_id text primary key,
  state_json jsonb not null,
  settings_json jsonb,
  updated_at timestamptz default now()
);
alter table raedworkouts enable row level security;
create policy "anon all" on raedworkouts for all using (true) with check (true);</code></pre>
    <p>Then paste URL + anon key in Settings. Use <strong>Push</strong> to upload, <strong>Pull</strong> on a new device to download.</p>

    <h2>Add to home screen</h2>
    <p><strong>iPhone Safari:</strong> Share button → "Add to Home Screen". Now it opens like a native app.</p>
    <p><strong>Android Chrome:</strong> menu → "Install app" or "Add to Home screen".</p>

    <h2>Backup</h2>
    <p>Settings → Export JSON. Email it to yourself once a week. Belt + suspenders.</p>
  `}));
}

// ---- Boot ---------------------------------------------------
function init() {
  loadLocal();
  applyLang();

  // ?user=ahmed — shareable link pre-fills name
  // Write directly to localStorage (no syncToCloud) — pull happens next to avoid overwriting cloud data
  const urlUser = new URLSearchParams(window.location.search).get('user');
  if (urlUser && !settings.user_id) {
    settings.user_id = urlUser.toLowerCase().replace(/\s+/g, '_');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

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

  // Show name screen on first launch (no user_id set yet)
  if (!settings.user_id) {
    showNameModal();
  } else if (settings.supabase_url && settings.supabase_key) {
    // Pull from cloud on load — only when user_id is known
    toast('Syncing…', 1200);
    pullFromCloud()
      .then(ok => { if (ok) { applyTheme(); render(); } })
      .catch(err => {
        setSyncStatus('err', 'Pull failed: ' + (err.message || 'unknown'));
        toast('Sync failed — working offline.', 3000);
      });
  }

  // Register service worker (offline)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
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
