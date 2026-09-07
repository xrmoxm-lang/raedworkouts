/* Skins and the block-boundary suggestion. A boundary proposes; only a tap applies. */

import { $, h, toast, toastSaved } from '../core/dom.js';
import { t, tf } from '../core/i18n.js';
import { renderSettings } from '../core/shell.js';
import { replaceSettings, saveLocal, settings } from '../core/store.js';
import { rejectedSkinSuggestion, suggestionForBlockBoundary } from '../domain/skin-suggestions.mjs';

// ---- Theme --------------------------------------------------
export const SKINS = {
  hadid: { label: 'حديد', sw_light: '#b8451a', sw_dark: '#e8622d', theme_dark: '#17130f' },
  waraq: { label: 'ورق', sw_light: '#7c1f2e', sw_dark: '#743d4a', theme_dark: '#121110' },
  rukham: { label: 'رخام', sw_light: '#2f4858', sw_dark: '#a8b8c0', theme_dark: '#121618' },
};

export function activeSkin() {
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

export function applyTheme() {
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

export function closeSkinSuggestion() {
  const el = $('#toast');
  el.classList.remove('show', 'skin-suggestion');
}

export function showSkinSuggestion(suggestion) {
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
      replaceSettings(resolveSkinSuggestionResponse({ settings, suggestion, response: 'accept' }));
      saveLocal();
      applyTheme();
      closeSkinSuggestion();
      toastSaved(t('saved'));
      if ($('#page-settings').classList.contains('active')) renderSettings();
    } }, t('change_it')),
    h('button', { type: 'button', class: 'btn tiny', onClick: () => {
      replaceSettings(resolveSkinSuggestionResponse({ settings, suggestion, response: 'reject' }));
      saveLocal();
      closeSkinSuggestion();
      toast(t('keep_this_one'));
    } }, t('keep_this_one')),
  ));
}

