/* The profile picker shown until a profile is open. */

import { $, $$, brandMark, h, setUiText } from '../core/dom.js';
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

function renderRegisterPanel(profile) {
  const bw = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', placeholder: 'Bodyweight kg (optional)', value: profile.bodyweight_kg ?? '' });
  const exp = h('select', {},
    ['beginner','returning','experienced'].map(v => h('option', { value: v, ...(profile.experience === v ? { selected: '' } : {}) },
      experienceLabel(v)
    ))
  );
  const status = h('div', { class: 'tiny muted' }, '');
  return h('div', { class: 'register-panel card' },
    h('button', { class: 'btn tiny ghost', onClick: () => { setWelcomeMode('tiles'); renderWelcome(); } }, '← Profiles'),
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
    h('button', { class: 'btn tiny ghost', onClick: () => { setWelcomeMode('tiles'); renderWelcome(); } }, '← Profiles'),
    h('h2', {}, 'Someone else?'),
    h('label', {}, 'Name', name),
    status,
    h('button', { class: 'btn primary full', onClick: () => {
      const value = name.value.trim();
      if (!value) return;
      setWelcomeSelectedProfile({ user_id: value, display_name: value, experience: 'beginner' });
      setWelcomeMode('register');
      renderWelcome();
    }}, 'Continue')
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
    wrap.appendChild(h('button', { class: 'btn ghost full', onClick: () => { setWelcomeMode('other'); renderWelcome(); } }, 'Someone else?'));
    if (welcomeLoading) wrap.appendChild(h('div', { class: 'tiny muted', style: 'text-align:center;margin-top:8px;' }, t('loading_server_profiles')));
  }
  root.appendChild(wrap);
}
