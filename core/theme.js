/* Skins and the block-boundary suggestion. A boundary proposes; only a tap applies. */

import { $, h, toast, toastSaved } from '../core/dom.js';
import { t, tf } from '../core/i18n.js';
import { renderSettings } from '../core/shell.js';
import { replaceSettings, saveLocal, settings } from '../core/store.js';
import { rejectedSkinSuggestion, suggestionForBlockBoundary } from '../domain/skin-suggestions.mjs';

export const SKINS = {
  // bg_light / bg_dark are the page grounds the status bar should match (styles.css tokens).
  hadid: { label: 'حديد', sw_light: '#b8451a', sw_dark: '#e8622d', bg_light: '#f3ede4', bg_dark: '#121010', theme_dark: '#121010' },
  waraq: { label: 'ورق', sw_light: '#7c1f2e', sw_dark: '#743d4a', bg_light: '#f8f5ef', bg_dark: '#121110', theme_dark: '#121110' },
  rukham: { label: 'رخام', sw_light: '#2f4858', sw_dark: '#a8b8c0', bg_light: '#eaece8', bg_dark: '#111517', theme_dark: '#111517' },
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

// The theme attribute is RESOLVED here (never absent): index.html's inline script
// sets it before first paint from the same settings, and this keeps it in step.
// `data-theme-mode` records the preference (auto|light|dark) for the UI.
const darkQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;
export function resolvedTheme(mode = settings.theme || 'auto') {
  if (mode === 'light' || mode === 'dark') return mode;
  return darkQuery && darkQuery.matches ? 'dark' : 'light';
}
export function applyTheme() {
  const mode = settings.theme || 'auto';
  const resolved = resolvedTheme(mode);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-mode', mode);
  const skin = activeSkin();
  root.setAttribute('data-skin', skin);
  // Status bar follows the page ground of the active skin; block transitions never call this.
  const skinInfo = SKINS[skin];
  const metaLight = document.getElementById('theme-color-light');
  const metaDark = document.getElementById('theme-color-dark');
  if (metaLight) metaLight.setAttribute('content', skinInfo.bg_light);
  if (metaDark) metaDark.setAttribute('content', skinInfo.bg_dark);
}
// While the preference is «auto», follow the phone when it switches at sunset.
if (darkQuery && typeof darkQuery.addEventListener === 'function') {
  darkQuery.addEventListener('change', () => {
    if ((settings.theme || 'auto') === 'auto') applyTheme();
  });
}

function closeSkinSuggestion() {
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

