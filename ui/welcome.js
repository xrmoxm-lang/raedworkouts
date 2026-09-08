/* The profile picker shown until a profile is open. */

import { $, $$, brandMark, h, isolate, setUiText } from '../core/dom.js';
import { experienceLabel, t } from '../core/i18n.js';
import {
  createProfile,
  isNetworkError,
  loadWelcomeProfiles,
  selectProfile,
  setWelcomeMode,
  setWelcomePreselectUser,
  setWelcomeSelectedProfile,
  syncErrorStatus,
  welcomeLoading,
  welcomeMode,
  welcomePreselectUser,
  welcomeProfiles,
  welcomeProfilesForV16,
  welcomeSelectedProfile,
} from '../core/sync.js';

// One labelled field. The label is the <label> itself, so the control is named
// without a for/id pair that has to be kept unique across two panels.
function field(labelKey, control, hintKey) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, t(labelKey)),
    control,
    hintKey ? h('span', { class: 'desc' }, t(hintKey)) : null,
  );
}

function backToProfiles() {
  return h('button', {
    type: 'button', class: 'btn tiny ghost',
    onClick: () => { setWelcomeMode('tiles'); renderWelcome(); },
  }, t('profiles'));
}

function renderRegisterPanel(profile) {
  // The placeholder used to be the whole Arabic label — inside a numeric input,
  // which the stylesheet renders centred, LTR and monospaced. It read as broken
  // text. The words are the field's label and hint now; the box holds a number.
  const bw = h('input', {
    type: 'number', inputmode: 'decimal', step: '0.1', class: 'num',
    'aria-label': t('bodyweight'), placeholder: 'kg',
    value: profile.bodyweight_kg ?? '',
  });
  const exp = h('select', { 'aria-label': t('experience') },
    ['beginner','returning','experienced'].map(v => h('option', { value: v, ...(profile.experience === v ? { selected: '' } : {}) },
      experienceLabel(v)
    ))
  );
  const status = h('div', { class: 'tiny muted' }, '');
  return h('div', { class: 'register-panel' },
    backToProfiles(),
    h('h2', {}, isolate(profile.display_name || profile.user_id)),
    h('p', { class: 'muted' }, t('workout_data_separate')),
    field('experience', exp),
    field('bodyweight', bw, 'bodyweight_optional'),
    status,
    h('button', { class: 'btn primary full', onClick: async () => {
      setUiText(status, t('creating_profile'));
      try {
        await createProfile({ ...profile, experience: exp.value }, parseFloat(bw.value) || null);
      } catch (e) {
        const statusCode = syncErrorStatus(e);
        if (statusCode === 403 || /not_allowlisted/.test(e.message || '')) {
          setUiText(status, t('ask_raed'));
          return;
        }
        if (!isNetworkError(e)) {
          setUiText(status, e.message || t('could_not_create_profile'));
          return;
        }
        throw e;
      }
    }}, t('create_profile'))
  );
}

function renderSomeoneElsePanel() {
  const name = h('input', { type: 'text', 'aria-label': t('name') });
  const status = h('div', { class: 'tiny muted' }, t('approved_names_only'));
  return h('div', { class: 'register-panel' },
    backToProfiles(),
    h('h2', {}, t('someone_else')),
    field('name', name),
    status,
    h('button', { class: 'btn primary full', onClick: () => {
      const value = name.value.trim();
      if (!value) return;
      setWelcomeSelectedProfile({ user_id: value, display_name: value, experience: 'beginner' });
      setWelcomeMode('register');
      renderWelcome();
    }}, t('continue'))
  );
}

export function renderWelcome() {
  document.body.classList.add('welcome-mode');
  const root = $('#page-home');
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-home'));
  $$('.tab').forEach(t => { t.classList.remove('active'); t.removeAttribute('aria-current'); });
  root.innerHTML = '';
  if (!welcomeProfiles && !welcomeLoading) loadWelcomeProfiles();
  const profiles = welcomeProfiles || welcomeProfilesForV16();
  if (welcomePreselectUser) {
    const pre = profiles.find(p => String(p.user_id).toLowerCase() === welcomePreselectUser.toLowerCase());
    if (pre && welcomeMode === 'tiles') setTimeout(() => selectProfile(pre), 0);
    setWelcomePreselectUser('');
  }
  const wrap = h('div', { class: 'welcome-screen' },
    h('div', { class: 'welcome-head' },
      h('div', { class: 'app-title big' }, brandMark(), h('span', {}, t('app_name'))),
      h('p', {}, t('family_profiles_offline')),
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
          h('span', { class: 'profile-initial num' }, String(name || '?').slice(0,1).toUpperCase()),
          h('span', { class: 'profile-name' }, isolate(name)),
          h('span', { class: 'profile-meta' },
            h('span', { class: 'num' }, String(profile.sessions || 0)), ' ', t('sessions'), ' · ', t(experience),
          ),
        );
      })
    ));
    wrap.appendChild(h('button', {
      class: 'btn ghost full',
      onClick: () => { setWelcomeMode('other'); renderWelcome(); },
    }, t('someone_else')));
    if (welcomeLoading) wrap.appendChild(h('p', { class: 'tiny muted welcome-loading' }, t('loading_server_profiles')));
  }
  root.appendChild(wrap);
}
