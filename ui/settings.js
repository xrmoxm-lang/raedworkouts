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

export function renderCoachSettingsCard() {
  const card = h('div', { class: 'card', 'data-coach-settings': 'true' });
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
    body.appendChild(h('div', { class: 'm-label tiny muted', style: 'margin-top:14px;' },
      t('coach_model_label')));
    const select = h('select', {
      class: 'coach-model-select', 'data-coach-model': 'true',
      onChange: (event) => {
        const chosen = event.target.value;
        setCoachModel(chosen).then((ok) => {
          if (ok) { toast(t('coach_model_saved')); setCoachUsageAt(0); renderSettings(); }
        });
      },
    }, (usage.models || []).map((m) => h('option', {
      value: m.id, ...(m.id === usage.model ? { selected: '' } : {}),
    }, `${m.id} — ${m.note}`)));
    body.appendChild(select);
    const active = (usage.models || []).find((m) => m.id === usage.model);
    if (active) {
      body.appendChild(h('div', { class: 'tiny muted', style: 'margin-top:5px;' },
        h('bdi', { class: 'ltr-run' }, `$${active.in} / $${active.out}`), ' ',
        t('coach_model_price_suffix')));
    }
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
    h('h1', {}, 'Settings'),
    h('div', { class: 'sub' }, 'Profile, programme, sync, and data.'),
  ));
  // Profile
  const profileCard = h('div', { class: 'card' });
  profileCard.appendChild(h('h3', { class: 'h3-icon' }, icon('profile', 17), h('span', {}, 'Profile')));
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
    type: 'number', step: '0.1', inputmode: 'decimal',
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
  const bw = state.profile?.bodyweight_kg;
  // A Latin name and a number inside an Arabic line get reordered by bidi —
  // "Raed · 82 kg" rendered as "82 kg · Raed". Each foreign run is isolated, the
  // way every other mixed line in this app already is.
  const profileHint = h('span', {},
    isolate(state.profile?.display_name || settings.user_id),
    bw ? h('span', {}, ' · ', isolate(`${fmtLoadKg(bw)} ${t('kg')}`)) : null,
  );
  root.appendChild(disclosure('الملف', profileCard, { icon: icon('profile'), hint: profileHint }));

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
  root.appendChild(disclosure('البرنامج', programmeCard, {
    icon: icon('programme'),
    hint: tf('programme_hint', { week: derivedWeek(), cycle: derivedCycle() }),
  }));

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

  // Only a fallback: prescribedRestSeconds prefers the programme's own rest_min,
  // so this value is reached for a row that has none. Raed asked why the timer
  // says 2:30 while this box says 120.
  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, t('rest_fallback')),
      h('div', { class: 'desc' }, t('rest_fallback_desc')),
    ),
    h('input', {
      type: 'number', value: settings.rest_seconds, min: 30, max: 600, step: 15,
      'aria-label': t('rest_fallback'),
      onChange: (e) => { settings.rest_seconds = parseInt(e.target.value, 10) || 120; saveLocal(); }
    }),
  ));
  // Only shown when his programme actually pairs anything. «بس إنه تكون موجودة
  // في الأشياء اللي فيها سوبر سيت فقط» — a control for a thing that is not in
  // his plan is a control that has to be read and dismissed every time.
  const hasSupersets = ((state.programme_overrides || RW.PROGRAMME).blocks || [])
    .some((block) => (block.sessions || [])
      .some((session) => (session.exercises || [])
        .some((row) => /^[A-Z]\d$/.test(String(row.superset_group || '')))));
  if (hasSupersets) {
    const modes = [['auto', 'superset_auto'], ['manual', 'superset_manual'], ['off', 'superset_off']];
    card.appendChild(h('div', { class: 'setting-row' },
      h('div', { class: 'label' },
        h('div', { class: 'name' }, t('superset_mode')),
        h('div', { class: 'desc' }, t('superset_mode_desc')),
      ),
      h('div', { class: 'seg', 'data-superset-mode': 'true' }, modes.map(([value, key]) => h('button', {
        type: 'button',
        // .seg-btn, not .opt — .opt is scoped to .platform-picker and would have
        // rendered these three unstyled.
        class: 'seg-btn' + ((settings.superset_mode || 'auto') === value ? ' active' : ''),
        'data-superset-mode-option': value,
        onClick: () => { settings.superset_mode = value; saveLocal(); renderSettings(); },
      }, t(key)))),
    ));
  }

  const taps = Array.isArray(state[TAP_LOG_KEY]) ? state[TAP_LOG_KEY] : [];
  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, t('tap_log')),
      h('div', { class: 'desc' }, taps.length ? tf('tap_log_count', { n: taps.length }) : t('tap_log_desc')),
    ),
    h('div', { style: 'display:flex; gap:6px; align-items:center;' },
      taps.length
        ? h('button', {
            class: 'btn tiny', 'data-tap-log-export': 'true',
            onClick: () => exportTapLog(),
          }, t('tap_log_export'))
        : null,
      h('button', {
        class: 'btn tiny' + (tapLogOn() ? ' primary' : ''), 'data-tap-log': 'true',
        onClick: () => {
          settings.tap_log = !tapLogOn();
          // Turning it off clears what was collected. Leaving a record of his
          // taps sitting on the phone after he has switched recording off is
          // not what "off" means.
          if (!settings.tap_log) delete state[TAP_LOG_KEY];
          saveLocal(); renderSettings();
        },
      }, tapLogOn() ? 'On' : 'Off'),
    ),
  ));

  card.appendChild(h('div', { class: 'setting-row' },
    h('div', { class: 'label' },
      h('div', { class: 'name' }, t('rest_override')),
      h('div', { class: 'desc' }, t('rest_override_desc')),
    ),
    h('button', {
      class: 'btn tiny' + (settings.rest_override ? ' primary' : ''),
      'data-rest-override': 'true',
      onClick: () => { settings.rest_override = !settings.rest_override; saveLocal(); renderSettings(); },
    }, settings.rest_override ? 'On' : 'Off'),
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
  musicCard.appendChild(h('h3', { class: 'h3-icon' }, icon('music', 17), h('span', {}, 'Music')));
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
      h('div', { class: 'tiny muted' }, 'Cloud sync'),
      h('span', { id: 'sync-status', class: 'sync-status off' },
        configured ? t('checking') : 'Not connected'),
    ),
  );
  // Preferences receives the language and advanced controls lower down so all
  // Settings groups begin collapsed, as Raed specified.

  // Cloud + data
  const dataCard = h('div', { class: 'card' });
  dataCard.appendChild(h('h3', { class: 'h3-icon' }, icon('cloud', 17), h('span', {}, 'Cloud & Data')));
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
        // alert() is a native dialog: English, unstyled, and suppressible by the
        // PWA shell — an import could fail and say nothing at all.
        catch (e) { toast(tf('import_failed', { reason: e.message }), 6000); }
      };
      inp.click();
    }}, 'Import JSON'),
    h('button', { class: 'btn tiny danger', onClick: async () => {
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
      toastSaved('Local profile wiped.');
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
        // Choosing again clears the veto.
        if (settings.block_skin_rejections?.[block]) {
          settings.block_skin_rejections = { ...settings.block_skin_rejections };
          delete settings.block_skin_rejections[block];
        }
        saveLocal();
      },
    },
    h('option', { value: '' }, 'Unset'),
    Object.entries(SKINS).map(([key, info]) => h('option', { value: key }, info.label)));
    select.value = settings.block_skin_suggestions?.[block] || '';
    return h('label', { class: 'block-skin-select' }, tf('block_number', { n: block }), select);
  };
  // Every block the programme actually has, read from the programme rather
  // than hard-coded.
  const configurableBlocks = [...new Set(((state.programme_overrides || RW.PROGRAMME).blocks || [])
    .map((entry) => entry.block).filter(Number.isFinite))].sort((a, b) => a - b);
  adv.appendChild(h('div', { class: 'block-skin-config' },
    h('div', { class: 'tiny muted' }, 'Suggestion mapping — intentionally unset by default.'),
    (configurableBlocks.length ? configurableBlocks : [1, 2, 3]).map(suggestionOptions),
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
            toastSaved(t('saved'));
          }
        }, session.name)
      ),
      state.forced_next_session
        ? h('button', { class: 'btn tiny', onClick: () => { state.forced_next_session = null; saveLocal(); renderSettings(); toastSaved(t('saved')); } }, t('clear_button'))
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
    h('button', { class: 'btn tiny danger', onClick: async () => {
      if (!await confirmAction({
        title: t('clear_prs'),
        body: t('clear_prs_body'),
        confirmLabel: t('clear_prs'),
      })) return;
      state.prs = {}; saveLocal(); toastSaved('PRs cleared.');
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
  // The coach's own section, collapsed like every other one. I shipped it
  // open and full-height at the top of the page — Raed: "المفروض فيه زر زي
  // الزر حق الإعدادات الباقية... نفس السهم اللي على اليمين".
  const skinName = SKINS[activeSkin()]?.label || "";
  const themeName = t(settings.theme === 'light' ? 'theme_light' : settings.theme === 'dark' ? 'theme_dark' : 'theme_auto');
  const platform = PLATFORM_INFO[settings.music_platform || 'spotify']?.label || '';
  const lastSync = state.last_sync ? fmtDateShort(state.last_sync) : t('sync_never');
  root.appendChild(disclosure(t('coach_settings'), renderCoachSettingsCard(), { icon: icon('coach'), hint: t('coach_hint_settings') }));
  root.appendChild(disclosure('تفضيلات', preferencesContent, { icon: icon('sliders'), hint: `${skinName} · ${themeName}` }));
  root.appendChild(disclosure('الموسيقى', musicCard, { icon: icon('music'), hint: isolate(platform) }));
  root.appendChild(disclosure('سحب البيانات', dataCard, { icon: icon('cloud'), hint: tf('last_sync_hint', { when: lastSync }), danger: true }));
  root.appendChild(disclosure('المساعدة', buildHelpCard(), { icon: icon('info') }));
}


export function buildHelpCard() {
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

// Hands the log over as a file HE shares, deliberately: no upload, no
// endpoint, nothing automatic.
export function exportTapLog() {
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

