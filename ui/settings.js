/* Settings, the coach spend card and the help card. */

import {
  coachRoute,
  coachUsage,
  coachUsageAt,
  setCoachModel,
  setCoachUsage,
  setCoachUsageAt,
} from '../core/coach.js';
import { $, $$, confirmAction, h, icon, isolate, toast, toastSaved } from '../core/dom.js';
import {
  derivedCycle,
  derivedWeek,
  getActiveProgramme,
  recordBodyweight,
  suggestNextWeight,
} from '../core/engine.js';
import {
  applyLang,
  displaySuggestedWeight,
  experienceLabel,
  fmtDateShort,
  fmtLoadKg,
  fmtUsd,
  localizeText,
  t,
  tf,
  todayISO,
} from '../core/i18n.js';
import { requestNotifPermissionIfNeeded } from '../core/rest.js';
import { render } from '../core/shell.js';
import {
  SYNC_KEY,
  TAP_LOG_KEY,
  defaultSettings,
  defaultState,
  dirtyKey,
  getSyncUrl,
  lastRevKey,
  lastWriteKey,
  preRestoreKey,
  replaceSettings,
  replaceState,
  safeRemoveItem,
  saveLocal,
  setActiveUser,
  settings,
  settingsKey,
  state,
  stateKey,
  tapLogOn,
} from '../core/store.js';
import {
  downloadCloudExport,
  downloadJson,
  exportPayload,
  importJsonFile,
  setSyncStatus,
  switchProfile,
  syncFetch,
  testCloudConnection,
} from '../core/sync.js';
import { SKINS, activeSkin, applyTheme } from '../core/theme.js';
import { PLATFORM_INFO, getAllExercises } from '../core/videos.js';
import { openRestoreModal } from '../ui/history.js';

/* ---- the kit this screen is built from ---------------------------------- */

// One row: what it is, what it does, and the control that does it.
const row = (name, desc, control) => h('div', { class: 'setting-row' },
  h('div', { class: 'label' },
    h('div', { class: 'name' }, name),
    desc ? h('div', { class: 'desc' }, desc) : null,
  ),
  control,
);

// Every On/Off in this screen. It was a 36px pill that read «مفعّل»/«متوقف» and
// filled with the accent when on — indistinguishable at a glance from the
// primary action buttons beside it. A switch says its state by its shape, and
// aria-checked says it to a screen reader.
const switchControl = (on, label, onToggle, attrs = {}) => h('button', {
  type: 'button', class: 'switch', role: 'switch',
  'aria-checked': on ? 'true' : 'false',
  'aria-label': label,
  ...attrs,
  onClick: onToggle,
});

// Segmented control: theme, superset mode, language.
const segmented = (options, current, pick, attrs = {}) => h('div', { class: 'seg', role: 'group', ...attrs },
  options.map(([value, label, optionAttrs]) => h('button', {
    type: 'button',
    class: 'seg-btn' + (current === value ? ' active' : ''),
    'aria-pressed': current === value ? 'true' : 'false',
    ...(optionAttrs || {}),
    onClick: () => pick(value),
  }, label)),
);

function renderCoachSettingsCard() {
  const card = h('div', { 'data-coach-settings': 'true' });
  const body = h('div', { 'data-coach-usage-body': 'true' },
    h('div', { class: 'tiny muted' }, t('coach_searching')));
  card.appendChild(body);

  const money = fmtUsd;

  const paint = (usage) => {
    body.innerHTML = '';
    if (!usage || usage.status === 'unavailable') {
      body.appendChild(h('div', { class: 'tiny muted', 'data-coach-usage-error': 'true' },
        t('coach_usage_unavailable')));
      return;
    }
    const tile = (labelKey, bucket, sub) => h('div', { class: 'spend-tile' },
      h('div', { class: 'spend-cap' }, t(labelKey)),
      h('div', { class: 'spend-num' }, h('bdi', { class: 'ltr-run' }, money(bucket.usd))),
      h('div', { class: 'spend-sub' }, sub),
    );
    body.appendChild(h('div', { class: 'spend-row', 'data-coach-spend': 'true' },
      tile('coach_spend_week', usage.week, tf('coach_spend_questions', { n: usage.week.questions })),
      tile('coach_spend_month', usage.month, tf('coach_spend_questions', { n: usage.month.questions })),
      tile('coach_spend_all', usage.all,
        usage.since ? tf('coach_spend_since', { d: usage.since }) : tf('coach_spend_questions', { n: usage.all.questions })),
    ));

    // The limit he set, and whether he is past it. Stated either way: a limit
    // you only hear about when you cross it is a limit you cannot plan against.
    const over = usage.over_alert;
    body.appendChild(h('div', { class: 'spend-alert' + (over ? ' over' : ''), 'data-coach-alert': 'true' },
      tf(over ? 'coach_alert_over' : 'coach_alert_under', { n: usage.alert_usd })));

    // A dropdown, as he asked: "بس يكون دروب داون".
    const select = h('select', {
      class: 'coach-model-select', 'data-coach-model': 'true',
      'aria-label': t('coach_model_label'),
      onChange: (event) => {
        const chosen = event.target.value;
        setCoachModel(chosen).then((ok) => {
          if (ok) { toast(t('coach_model_saved')); setCoachUsageAt(0); renderSettings(); }
        });
      },
    }, (usage.models || []).map((m) => h('option', {
      value: m.id, ...(m.id === usage.model ? { selected: '' } : {}),
    }, `${m.id} — ${m.note}`)));
    const active = (usage.models || []).find((m) => m.id === usage.model);
    // The label, the dropdown and its price line are one field, so their
    // spacing comes from the field rather than from three inline styles.
    body.appendChild(h('label', { class: 'field coach-model-field' },
      h('span', { class: 'tiny muted' }, t('coach_model_label')),
      select,
      active
        ? h('span', { class: 'tiny muted' },
            h('bdi', { class: 'ltr-run' }, `$${active.in} / $${active.out}`), ' ',
            t('coach_model_price_suffix'))
        : null,
    ));
  };

  // Fetched when the section is opened, not when Settings is rendered — a
  // collapsed card that calls the server anyway is a network request for
  // something nobody is looking at.
  card.load = () => {
    if (coachUsage && Date.now() - coachUsageAt < 60000) { paint(coachUsage); return; }
    fetch(coachRoute('usage'), { signal: AbortSignal.timeout(15000) })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((usage) => { setCoachUsage(usage, Date.now()); paint(usage); })
      .catch(() => paint(null));
  };
  return card;
}

export function renderSettings() {
  const root = $('#page-settings');
  root.innerHTML = '';
  // A settings row that answers its own question.
  const disclosure = (label, content, opts = {}) => {
    const summary = h('summary', {},
      opts.icon ? h('span', { class: 'sd-icon', 'aria-hidden': 'true' }, opts.icon) : null,
      h('span', { class: 'sd-text' },
        h('span', { class: 'sd-label' }, label),
        opts.hint ? h('span', { class: 'sd-hint' }, opts.hint) : null),
    );
    const node = h('details', {
      class: 'settings-disclosure' + (opts.danger ? ' is-data' : ''),
      'data-settings-disclosure': 'true',
    }, summary, content);
    // A section may want to fetch the first time it is opened rather than when
    // the page renders. Nothing else needs this yet; the coach card does.
    if (typeof content?.load === 'function') {
      node.addEventListener('toggle', () => { if (node.open) content.load(); }, { once: true });
    }
    return node;
  };
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, t('settings')),
    h('div', { class: 'sub' }, t('profile_programme_sync_data')),
  ));

  /* ---- الملف ------------------------------------------------------------ */
  const profileGroup = h('div', {});
  const displayName = h('input', {
    type: 'text',
    // The label is a sibling <div>, not a <label>, so nothing associated the
    // two and this announced as an unnamed text field.
    'aria-label': t('display_name'),
    value: state.profile?.display_name || settings.user_id,
    onChange: (e) => { state.profile.display_name = e.target.value.trim() || settings.user_id; saveLocal(); renderSettings(); }
  });
  const experienceSelect = h('select', {
    'aria-label': t('experience'),
    onChange: (e) => { state.profile.experience = e.target.value; saveLocal(); renderSettings(); }
  },
    ['beginner','detrained','returning','experienced'].map(v => h('option', { value: v, ...(state.profile?.experience === v ? { selected: '' } : {}) },
      experienceLabel(v)
    ))
  );
  const bwInput = h('input', {
    type: 'number', step: '0.1', inputmode: 'decimal', class: 'num',
    'aria-label': t('bodyweight'),
    value: state.profile?.bodyweight_kg ?? '',
    placeholder: 'kg',
    onChange: (e) => {
      const raw = e.target.value.trim();
      if (raw === '') {
        state.profile.bodyweight_kg = null;
        saveLocal();
        renderSettings();
        return;
      }
      if (!recordBodyweight(parseFloat(raw))) {
        e.target.value = state.profile?.bodyweight_kg ?? '';
        return;
      }
      renderSettings();
    }
  });
  profileGroup.appendChild(row(t('display_name'), t('shown_profile_tiles'), displayName));
  profileGroup.appendChild(row(t('experience'), t('detrained_history_first'), experienceSelect));
  profileGroup.appendChild(row(t('bodyweight'), t('protein_target_settings'), bwInput));
  profileGroup.appendChild(row(t('cloud_identity'), t('separate_v16_cloud_row'),
    h('button', { class: 'btn tiny', onClick: switchProfile }, t('switch_profile'))));
  const bw = state.profile?.bodyweight_kg;
  // A Latin name and a number inside an Arabic line get reordered by bidi —
  // "Raed · 82 kg" rendered as "82 kg · Raed". Each foreign run is isolated, the
  // way every other mixed line in this app already is.
  const profileHint = h('span', {},
    isolate(state.profile?.display_name || settings.user_id),
    bw ? h('span', {}, ' · ', isolate(`${fmtLoadKg(bw)} ${t('kg')}`)) : null,
  );
  root.appendChild(disclosure(t('profile'), profileGroup, { icon: icon('profile'), hint: profileHint }));

  /* ---- البرنامج --------------------------------------------------------- */
  // D6 has one adopted, history-driven Upper/Lower rotation. There is
  // intentionally no old 2/3-day variant switch to reinterpret a logged PPL
  // session as a different future programme.
  const activeProgramme = getActiveProgramme();
  const programmeGroup = h('div', {},
    row(t('training_split'), t('history_per_exercise'),
      // localizeText, not the raw field: block_name arrives from data.js in
      // English and is a data label, not free copy.
      h('div', { class: 'tiny muted' }, localizeText(activeProgramme.block_name))),
  );
  root.appendChild(disclosure(t('programme'), programmeGroup, {
    icon: icon('programme'),
    hint: tf('programme_hint', { week: derivedWeek(), cycle: derivedCycle() }),
  }));

  /* ---- المدرب ----------------------------------------------------------- */
  // The coach's own section, collapsed like every other one. I shipped it
  // open and full-height at the top of the page — Raed: "المفروض فيه زر زي
  // الزر حق الإعدادات الباقية... نفس السهم اللي على اليمين".
  root.appendChild(disclosure(t('coach_settings'), renderCoachSettingsCard(),
    { icon: icon('coach'), hint: t('coach_hint_settings') }));

  /* ---- تفضيلات ---------------------------------------------------------- */
  const prefs = h('div', {});

  // Only a fallback: prescribedRestSeconds prefers the programme's own rest_min,
  // so this value is reached for a row that has none. Raed asked why the timer
  // says 2:30 while this box says 120.
  prefs.appendChild(row(t('rest_fallback'), t('rest_fallback_desc'),
    h('input', {
      type: 'number', class: 'num', value: settings.rest_seconds, min: 30, max: 600, step: 15,
      'aria-label': t('rest_fallback'),
      onChange: (e) => { settings.rest_seconds = parseInt(e.target.value, 10) || 120; saveLocal(); }
    })));

  // Only shown when his programme actually pairs anything. «بس إنه تكون موجودة
  // في الأشياء اللي فيها سوبر سيت فقط» — a control for a thing that is not in
  // his plan is a control that has to be read and dismissed every time.
  const hasSupersets = ((state.programme_overrides || RW.PROGRAMME).blocks || [])
    .some((block) => (block.sessions || [])
      .some((session) => (session.exercises || [])
        .some((r) => /^[A-Z]\d$/.test(String(r.superset_group || '')))));
  if (hasSupersets) {
    const modes = [['auto', 'superset_auto'], ['manual', 'superset_manual'], ['off', 'superset_off']];
    prefs.appendChild(row(t('superset_mode'), t('superset_mode_desc'),
      segmented(
        modes.map(([value, key]) => [value, t(key), { 'data-superset-mode-option': value }]),
        settings.superset_mode || 'auto',
        (value) => { settings.superset_mode = value; saveLocal(); renderSettings(); },
        { 'data-superset-mode': 'true', 'aria-label': t('superset_mode') },
      )));
  }

  prefs.appendChild(row(t('rest_override'), t('rest_override_desc'),
    switchControl(!!settings.rest_override, t('rest_override'),
      () => { settings.rest_override = !settings.rest_override; saveLocal(); renderSettings(); },
      { 'data-rest-override': 'true' })));

  prefs.appendChild(row(t('vibrate'), t('buzz_on_rest_end'),
    switchControl(!!settings.vibrate, t('vibrate'),
      () => { settings.vibrate = !settings.vibrate; saveLocal(); renderSettings(); })));

  // Rest-over alert that fires even when the app is backgrounded.
  prefs.appendChild(row(t('notifications'), t('background_notification_note'),
    switchControl(!!settings.notifications, t('notifications'), async () => {
      settings.notifications = !settings.notifications;
      if (settings.notifications) {
        const perm = await requestNotifPermissionIfNeeded();
        if (perm !== 'granted') {
          toast(t('permission_denied'));
          settings.notifications = false;
        }
      }
      saveLocal(); renderSettings();
    })));

  const taps = Array.isArray(state[TAP_LOG_KEY]) ? state[TAP_LOG_KEY] : [];
  prefs.appendChild(row(t('tap_log'),
    taps.length ? tf('tap_log_count', { n: taps.length }) : t('tap_log_desc'),
    h('div', { class: 'cluster' },
      taps.length
        ? h('button', {
            class: 'btn tiny', 'data-tap-log-export': 'true',
            onClick: () => exportTapLog(),
          }, t('tap_log_export'))
        : null,
      switchControl(tapLogOn(), t('tap_log'), () => {
        settings.tap_log = !tapLogOn();
        // Turning it off clears what was collected. Leaving a record of his
        // taps sitting on the phone after he has switched recording off is
        // not what "off" means.
        if (!settings.tap_log) delete state[TAP_LOG_KEY];
        saveLocal(); renderSettings();
      }, { 'data-tap-log': 'true' }),
    )));

  // Appearance lives here now, above the collapsed advanced block, because the
  // two controls Raed actually uses — the skin and the light/dark mode — were
  // split between a header button and a buried Advanced panel.
  prefs.appendChild(h('div', { class: 'section-label' }, t('appearance')));
  const pickTheme = (mode) => { settings.theme = mode; saveLocal(); applyTheme(); renderSettings(); };
  const themeOptions = () => [['auto', t('auto')], ['light', t('light')], ['dark', t('dark')]];
  // One control for auto/light/dark. v16 rendered the same setting twice («الثيم»
  // and «الوضع»); the duplicate row was removed on 2026-09-08 — same setting, same
  // handler, nothing lost.
  prefs.appendChild(row(t('theme_mode'), t('theme_mode_desc'),
    segmented(themeOptions(), settings.theme, pickTheme, { 'aria-label': t('theme_mode') })));
  // The former accent picker is now the three adopted, whole-app skins. The
  // swatch gradients are painted by the stylesheet from data-skin, so this
  // renderer carries no inline style.
  prefs.appendChild(row(t('skin'), t('adopted_palette_note'),
    h('div', { class: 'skin-picker', role: 'group', 'aria-label': t('skin') },
      Object.entries(SKINS).map(([key, info]) =>
        h('button', {
          type: 'button',
          class: 'skin-swatch' + (activeSkin() === key ? ' active' : ''),
          'data-skin': key,
          title: info.label,
          'aria-label': info.label,
          'aria-pressed': activeSkin() === key ? 'true' : 'false',
          onClick: () => { settings.skin = key; saveLocal(); applyTheme(); renderSettings(); }
        })
      )
    )));

  /* ---- إعدادات متقدمة (inside تفضيلات) ---------------------------------- */
  const adv = h('details', { class: 'advanced-settings' },
    h('summary', {}, t('advanced_settings')),
  );
  adv.appendChild(row(t('skin_suggestions'), t('skin_suggestion_note'),
    switchControl(settings.block_auto_color !== false, t('skin_suggestions'), () => {
      settings.block_auto_color = settings.block_auto_color === false;
      saveLocal();
      renderSettings();
    })));

  const suggestionOptions = (block) => {
    const select = h('select', {
      'aria-label': tf('block_number', { n: block }),
      onChange: (event) => {
        settings.block_skin_suggestions = { ...(settings.block_skin_suggestions || {}) };
        if (event.target.value) settings.block_skin_suggestions[block] = event.target.value;
        else delete settings.block_skin_suggestions[block];
        // Choosing again clears the veto.
        if (settings.block_skin_rejections?.[block]) {
          settings.block_skin_rejections = { ...settings.block_skin_rejections };
          delete settings.block_skin_rejections[block];
        }
        saveLocal();
      },
    },
    h('option', { value: '' }, t('unset')),
    Object.entries(SKINS).map(([key, info]) => h('option', { value: key }, info.label)));
    select.value = settings.block_skin_suggestions?.[block] || '';
    return h('label', { class: 'block-skin-select' },
      h('span', {}, tf('block_number', { n: block })), select);
  };
  // Every block the programme actually has, read from the programme rather
  // than hard-coded.
  const configurableBlocks = [...new Set(((state.programme_overrides || RW.PROGRAMME).blocks || [])
    .map((entry) => entry.block).filter(Number.isFinite))].sort((a, b) => a - b);
  adv.appendChild(h('div', { class: 'block-skin-config' },
    h('div', { class: 'tiny muted' }, t('suggestion_mapping_note')),
    (configurableBlocks.length ? configurableBlocks : [1, 2, 3]).map(suggestionOptions),
  ));

  adv.appendChild(row(t('pr_summary'), t('show_prs_finish'),
    switchControl(!!settings.show_pr_summary, t('pr_summary'),
      () => { settings.show_pr_summary = !settings.show_pr_summary; saveLocal(); renderSettings(); })));

  // Force next session (missed a day override). Session ids are storage keys,
  // never user-facing copy: every label comes from the programme's localised
  // name, never from its implementation id.
  const activeProg = getActiveProgramme();
  const programmeSessions = activeProg?.sessions || [];
  adv.appendChild(row(t('force_session'),
    h('span', {}, t('missed_a_day'), ' — ', t('missed_day_override')),
    h('div', { class: 'cluster' },
      programmeSessions.map((session) =>
        h('button', {
          class: 'btn tiny' + (state.forced_next_session === session.id ? ' primary' : ''),
          'aria-pressed': state.forced_next_session === session.id ? 'true' : 'false',
          onClick: () => {
            state.forced_next_session = state.forced_next_session === session.id ? null : session.id;
            saveLocal();
            renderSettings();
            toastSaved(t('saved'));
          }
        }, session.name)
      ),
      state.forced_next_session
        ? h('button', { class: 'btn tiny ghost', onClick: () => { state.forced_next_session = null; saveLocal(); renderSettings(); toastSaved(t('saved')); } }, t('clear_button'))
        : null,
    )));

  adv.appendChild(row(t('gym_launcher_url'),
    h('span', {}, t('gym_launcher_default'), ' ', tf('gym_launcher_shortcut', { name: t('open_in2') })),
    h('input', {
      type: 'text', placeholder: t('default_behavior'),
      'aria-label': t('gym_launcher_url'),
      value: settings.gym_launch_override || '',
      onInput: (e) => { settings.gym_launch_override = e.target.value.trim(); saveLocal(); }
    })));

  adv.appendChild(row(t('clear_pr_history'), t('wipe_prs_note'),
    h('button', { class: 'btn tiny danger', onClick: async () => {
      if (!await confirmAction({
        title: t('clear_prs'),
        body: t('clear_prs_body'),
        confirmLabel: t('clear_prs'),
      })) return;
      state.prs = {}; saveLocal(); toastSaved(t('prs_cleared'));
    }}, t('clear_prs'))));

  prefs.appendChild(adv);

  // Language — «اللغة / اللغة» is what the old row actually rendered, because
  // it appended the Arabic word to the translated one.
  prefs.appendChild(row(t('language'), null,
    segmented(
      [['en', t('language_english')], ['ar', t('language_arabic')]],
      settings.lang === 'ar' ? 'ar' : 'en',
      (lang) => { settings.lang = lang; saveLocal(); applyLang(); render(); },
      { 'aria-label': t('language') },
    )));

  const skinName = SKINS[activeSkin()]?.label || '';
  const themeName = t(settings.theme === 'light' ? 'theme_light' : settings.theme === 'dark' ? 'theme_dark' : 'theme_auto');
  root.appendChild(disclosure(t('settings_group_preferences'), prefs,
    { icon: icon('sliders'), hint: `${skinName} · ${themeName}` }));

  /* ---- الموسيقى --------------------------------------------------------- */
  const musicGroup = h('div', { class: 'stack' },
    h('div', { class: 'tiny muted' }, t('pick_music_platform')),
    h('div', { class: 'platform-picker' },
      Object.entries(PLATFORM_INFO).map(([key, info]) =>
        h('button', {
          type: 'button',
          class: 'opt' + (settings.music_platform === key ? ' active' : ''),
          'aria-pressed': settings.music_platform === key ? 'true' : 'false',
          onClick: () => { settings.music_platform = key; saveLocal(); renderSettings(); }
        },
          // Decoration the stylesheet hides; the word is the label.
          h('span', { class: 'icon', 'aria-hidden': 'true' }, info.icon),
          h('span', {}, info.label),
        )
      )
    ),
  );
  const platform = PLATFORM_INFO[settings.music_platform || 'spotify']?.label || '';
  root.appendChild(disclosure(t('music'), musicGroup, { icon: icon('music'), hint: isolate(platform) }));

  /* ---- سحب البيانات ----------------------------------------------------- */
  // The badge reflects ACTUAL reachability, not just "is a URL configured".
  const configured = !!(settings.sync_url && settings.sync_key);
  const dataGroup = h('div', {});
  dataGroup.appendChild(h('div', { class: 'between sync-row' },
    h('div', { class: 'row-title' }, t('settings_sync_row')),
    h('span', { id: 'sync-status', class: 'sync-status off' },
      configured ? t('checking') : t('not_connected')),
  ));
  dataGroup.appendChild(h('div', { class: 'cloud-actions' },
    h('button', { class: 'btn', onClick: testCloudConnection }, t('test')),
    h('button', { class: 'btn', onClick: openRestoreModal }, t('restore_backup')),
    h('button', { class: 'btn', onClick: downloadCloudExport }, t('download_data')),
    h('button', { class: 'btn', onClick: () => downloadJson(`raedworkouts-${settings.user_id}-${todayISO()}.json`, exportPayload()) }, t('export_json')),
    h('button', { class: 'btn', onClick: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try { await importJsonFile(f); }
        // alert() is a native dialog: English, unstyled, and suppressible by the
        // PWA shell — an import could fail and say nothing at all.
        catch (e) { toast(tf('import_failed', { reason: e.message }), 6000); }
      };
      inp.click();
    }}, t('import_json')),
    h('button', { class: 'btn danger', onClick: async () => {
      if (!await confirmAction({
        title: t('wipe_local'),
        body: t('wipe_local_body'),
        confirmLabel: t('wipe_local'),
      })) return;
      const uid = settings.user_id;
      safeRemoveItem(stateKey(uid));
      safeRemoveItem(settingsKey(uid));
      safeRemoveItem(lastWriteKey(uid));
      safeRemoveItem(lastRevKey(uid));
      safeRemoveItem(preRestoreKey(uid));
      safeRemoveItem(dirtyKey(uid));
      setActiveUser('');
      replaceState(defaultState());
      replaceSettings(defaultSettings());
      settings.sync_url = getSyncUrl();
      settings.sync_key = SYNC_KEY;
      render();
      toastSaved(t('local_profile_wiped'));
    }}, t('wipe_local')),
  ));

  // Silent reachability probe — so the badge tells the truth even when the
  // backend is paused/unreachable (no toast; updates only the badge).
  if (configured) {
    syncFetch('/health', { timeoutMs: 8000 })
      .then(() => setSyncStatus('ok', t('sync_connected')))
      .catch(() => setSyncStatus('err', t('offline')));
  }

  const lastSync = state.last_sync ? fmtDateShort(state.last_sync) : t('sync_never');
  root.appendChild(disclosure(t('settings_group_data'), dataGroup,
    { icon: icon('cloud'), hint: tf('last_sync_hint', { when: lastSync }), danger: true }));

  /* ---- المساعدة --------------------------------------------------------- */
  root.appendChild(disclosure(t('help'), buildHelpCard(), { icon: icon('info') }));
}


function buildHelpCard() {
  const prog = getActiveProgramme();
  const sessions = prog.sessions || [];
  const card = h('div', { class: 'onboard' });
  card.appendChild(h('h2', {}, t('how_the_app_works')));
  card.appendChild(h('p', {}, t('app_works_explainer')));
  card.appendChild(h('h2', {}, t('your_programme')));
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
  card.appendChild(h('h2', {}, t('reentry_weeks')));
  card.appendChild(h('p', {}, tf('profile_is_level', { level: experienceLabel(state.profile?.experience || 'detrained') }), ' ', t('help_history_effort')));
  card.appendChild(h('h2', {}, t('progressive_overload')));
  card.appendChild(h('p', {}, t('progression_explainer')));
  card.appendChild(h('h2', {}, t('rules')));
  card.appendChild(h('ul', {},
    h('li', {}, t('technique_reentry')),
    h('li', {}, t('help_protein_sleep')),
    (prog.notes || []).map((note) => h('li', {}, note)),
  ));
  card.appendChild(h('h2', {}, t('library_videos')));
  card.appendChild(h('p', {}, t('help_library_videos')));
  card.appendChild(h('h2', {}, t('your_data')));
  card.appendChild(h('p', {}, t('help_data')));
  card.appendChild(h('h2', {}, t('install_home')));
  card.appendChild(h('p', {}, t('install_home_explainer')));
  return card;
}

// Hands the log over as a file HE shares, deliberately: no upload, no
// endpoint, nothing automatic.
function exportTapLog() {
  const rows = Array.isArray(state[TAP_LOG_KEY]) ? state[TAP_LOG_KEY] : [];
  if (!rows.length) return;
  const payload = {
    exported_at: new Date().toISOString(),
    // The service worker's version is what identifies the build he was running
    // when he recorded this, and it is the only place that number lives.
    app_version: (navigator.serviceWorker?.controller?.scriptURL || '').split('?v=').pop() || '',
    // No question text, no weights, no device names — the log is about controls.
    taps: rows,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `raedworkouts-taps-${todayISO()}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a turn of the event loop; revoking immediately can cancel the
  // download on some builds of Safari.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
