#!/usr/bin/env node
/**
 * Verify the live CSS token matrix for all adopted skins and colour modes.
 *
 * The numbers in the output are calculated from styles.css. No palette hex or
 * precomputed contrast ratio is embedded here: this is deliberately an
 * independent check of the adopted-token implementation.
 *
 * CSS constraint: token rules use one ungrouped selector each. This small
 * parser intentionally does not expand comma-grouped selectors, so do not
 * combine :root token scopes into a selector list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(rootDir, 'styles.css');
const mockupsPath = path.resolve(rootDir, '..', 'design', 'theme-mockups.py');
const customCssPath = process.argv[2] === '--css' ? process.argv[3] : null;
if (process.argv[2] && !customCssPath) {
  console.error('Usage: node scripts/lint-contrast.mjs [--css path/to/styles.css]');
  process.exit(2);
}
const inspectedCssPath = customCssPath ? path.resolve(customCssPath) : cssPath;
const css = fs.readFileSync(inspectedCssPath, 'utf8');
const mockups = fs.readFileSync(mockupsPath, 'utf8');

const skins = [
  ['hadid', 'حديد'],
  ['waraq', 'ورق'],
  ['rukham', 'رخام'],
];

function adoptedMutedTokens() {
  const adoptedStart = mockups.indexOf('ADOPTED = [');
  const adoptedEnd = mockups.indexOf('\n\nIRON =', adoptedStart);
  if (adoptedStart === -1 || adoptedEnd === -1) {
    throw new Error('Could not locate ADOPTED palette in design/theme-mockups.py');
  }
  const adopted = mockups.slice(adoptedStart, adoptedEnd);
  return Object.fromEntries(skins.map(([, label]) => {
    const skinStart = adopted.indexOf(`("${label}"`);
    const nextSkinStart = adopted.indexOf('\n    ("', skinStart + 1);
    const skinSource = adopted.slice(skinStart, nextSkinStart === -1 ? adopted.length : nextSkinStart);
    const modes = [...skinSource.matchAll(/m\([^)]*\)/g)]
      .map((match) => [...match[0].matchAll(/#[0-9a-f]{3,6}/gi)].map((hex) => hex[0]));
    if (modes.length !== 2) {
      throw new Error(`Could not parse adopted muted tokens for ${label}`);
    }
    if (modes.some((tokens) => tokens.length !== 8)) {
      throw new Error(`Could not parse eight adopted palette values for ${label}`);
    }
    return [label, { light: modes[0][5], dark: modes[1][5] }];
  }));
}

const adoptedMuted = adoptedMutedTokens();

const requiredTokens = [
  '--bg', '--bg-card', '--bg-elev', '--border', '--border-strong', '--text',
  '--text-muted', '--accent', '--accent-label', '--accent-strong', '--accent-fg',
  '--accent-soft', '--warning', '--warning-soft', '--danger', '--danger-soft',
  '--good', '--good-soft',
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const failures = [];

function fail(message) {
  failures.push(message);
}

function parseHex(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(normalized)) return null;
  const expanded = normalized.length === 4
    ? `#${[...normalized.slice(1)].map((channel) => channel + channel).join('')}`
    : normalized;
  return [1, 3, 5].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16));
}

function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return NaN;
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function lightnessStar(hex) {
  const relativeLuminance = luminance(hex);
  return relativeLuminance <= 216 / 24389
    ? relativeLuminance * 24389 / 27
    : 116 * Math.cbrt(relativeLuminance) - 16;
}

function rgbToHls(hex) {
  const [red, green, blue] = parseHex(hex).map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, lightness, 0];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue / 6, lightness, saturation];
}

function hlsToHex(hue, lightness, saturation) {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
  }
  const hueToRgb = (lower, upper, position) => {
    let value = position;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return lower + (upper - lower) * 6 * value;
    if (value < 1 / 2) return upper;
    if (value < 2 / 3) return lower + (upper - lower) * (2 / 3 - value) * 6;
    return lower;
  };
  const upper = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const lower = 2 * lightness - upper;
  const channels = [
    hueToRgb(lower, upper, hue + 1 / 3),
    hueToRgb(lower, upper, hue),
    hueToRgb(lower, upper, hue - 1 / 3),
  ].map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0'));
  return `#${channels.join('')}`;
}

function fitOwnLightness(source, surfaces, direction, target) {
  const [hue, lightness, saturation] = rgbToHls(source);
  for (let step = 0; step <= 100000; step += 1) {
    const candidateLightness = direction === 'darker'
      ? lightness - step / 100000
      : lightness + step / 100000;
    if (candidateLightness < 0 || candidateLightness > 1) break;
    const candidate = hlsToHex(hue, candidateLightness, saturation);
    if (surfaces.every((surface) => contrast(candidate, surface) >= target)) return candidate;
  }
  return null;
}

function d29Label(accent, surfaces) {
  if (surfaces.every((surface) => contrast(accent, surface) >= 4.5)) return accent.toLowerCase();
  const [hue, lightness, saturation] = rgbToHls(accent);
  for (let step = 1; step <= 100; step += 1) {
    const candidate = hlsToHex(hue, Math.min(1, lightness + (step / 100) * (1 - lightness)), saturation);
    if (surfaces.every((surface) => contrast(candidate, surface) >= 4.6)) return candidate;
  }
  return null;
}

function hueDistance(left, right) {
  const distance = Math.abs(left - right);
  return Math.min(distance, 1 - distance);
}

function validDarkerPressedState(accent, foreground) {
  const [hue, lightness, saturation] = rgbToHls(accent);
  const accentLightness = lightnessStar(accent);
  for (let step = 0; step < 1000; step += 1) {
    const candidate = hlsToHex(hue, step / 1000, saturation);
    if (lightnessStar(candidate) <= accentLightness - 8 && contrast(foreground, candidate) >= 4.5) {
      return true;
    }
  }
  return false;
}

function declarationsFor(selector) {
  const matcher = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^{}]*)\\}`, 'g');
  const rules = [];
  for (const match of css.matchAll(matcher)) {
    const declarations = {};
    for (const declaration of match[1].matchAll(/(--[a-z-]+)\s*:\s*([^;{}]+)\s*;/g)) {
      declarations[declaration[1]] = declaration[2].trim();
    }
    rules.push({ index: match.index, declarations });
  }
  return rules;
}

function rulesUsingCustomProperty(customProperty) {
  const matcher = new RegExp(`([^{}]+)\\{[^{}]*var\\(\\s*${escapeRegExp(customProperty)}\\s*\\)[^{}]*\\}`, 'g');
  return [...css.matchAll(matcher)]
    // A comment directly above a rule is swept up with its selector, so a
    // documented rule reported as its own paragraph of prose. Strip comments
    // before trimming, not after.
    .map((match) => match[1].replace(/\/\*[\s\S]*?\*\//g, ' ').trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

function inDarkMedia(selector) {
  const mediaMatcher = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/g;
  for (const media of css.matchAll(mediaMatcher)) {
    let depth = 1;
    let index = media.index + media[0].length;
    for (; index < css.length && depth > 0; index += 1) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
    }
    if (css.slice(media.index, index).includes(selector)) return true;
  }
  return false;
}

const ruleSpecs = [
  { selector: ':root', applies: () => true },
  { selector: ':root:not([data-theme="light"])', applies: ({ mode }) => mode === 'auto-dark' },
  { selector: ':root[data-theme="dark"]', applies: ({ mode }) => mode === 'dark' },
];

for (const [skin] of skins) {
  ruleSpecs.push(
    { selector: `:root[data-skin="${skin}"]`, applies: ({ currentSkin }) => currentSkin === skin },
    { selector: `:root[data-skin="${skin}"]:not([data-theme="light"])`, applies: ({ currentSkin, mode }) => currentSkin === skin && mode === 'auto-dark' },
    { selector: `:root[data-skin="${skin}"][data-theme="dark"]`, applies: ({ currentSkin, mode }) => currentSkin === skin && mode === 'dark' },
  );
}

for (const spec of ruleSpecs.filter((rule) => rule.selector.includes(':not([data-theme="light"])'))) {
  if (!inDarkMedia(spec.selector)) fail(`structure: ${spec.selector} is not inside prefers-color-scheme: dark media`);
}

function resolveTokens(currentSkin, mode) {
  const context = { currentSkin, mode };
  return ruleSpecs
    .flatMap((rule) => rule.applies(context) ? declarationsFor(rule.selector) : [])
    .sort((left, right) => left.index - right.index)
    .reduce((tokens, rule) => Object.assign(tokens, rule.declarations), {});
}

function checkPair(skin, mode, leftToken, rightToken, tokens, floor) {
  const left = tokens[leftToken];
  const right = tokens[rightToken];
  const ratio = contrast(left, right);
  if (!Number.isFinite(ratio)) {
    fail(`${skin}/${mode} ${leftToken} on ${rightToken}: token is not a direct hex colour`);
    return null;
  } else if (ratio < floor) {
    fail(`${skin}/${mode} ${leftToken} on ${rightToken}: ${ratio.toFixed(2)}:1 < ${floor}:1`);
  }
  return ratio;
}

function formatRatio(ratio) {
  return Number.isFinite(ratio) ? `${ratio.toFixed(2)}:1` : 'UNRESOLVED';
}

for (const [skin, label] of skins) {
  for (const mode of ['light', 'auto-dark', 'dark']) {
    const tokens = resolveTokens(skin, mode);
    for (const token of requiredTokens) {
      if (!parseHex(tokens[token] ?? '')) fail(`${label}/${mode} ${token}: missing direct hex token`);
    }

    for (const surface of ['--bg-card', '--bg-elev', '--bg']) {
      checkPair(label, mode, '--text', surface, tokens, 4.5);
      checkPair(label, mode, '--text-muted', surface, tokens, 4.5);
      checkPair(label, mode, '--warning', surface, tokens, 4.5);
      checkPair(label, mode, '--danger', surface, tokens, 4.5);
      checkPair(label, mode, '--good', surface, tokens, 4.5);
    }
    const cardRatio = checkPair(label, mode, '--accent-label', '--bg-card', tokens, 4.5);
    const elevRatio = checkPair(label, mode, '--accent-label', '--bg-elev', tokens, 4.5);
    const foregroundRatio = checkPair(label, mode, '--accent-fg', '--accent', tokens, 4.5);
    const pressedForegroundRatio = checkPair(label, mode, '--accent-fg', '--accent-strong', tokens, 4.5);
    const softForegroundRatio = checkPair(label, mode, '--text', '--accent-soft', tokens, 4.5);

    const mutedMode = mode === 'light' ? 'light' : 'dark';
    const adoptedMutedValue = adoptedMuted[label]?.[mutedMode];
    const mutedSurfaces = ['--bg-card', '--bg-elev', '--bg'].map((token) => tokens[token]);
    if (parseHex(adoptedMutedValue ?? '') && mutedSurfaces.every((surface) => parseHex(surface))) {
      const expectedMuted = mutedSurfaces.every((surface) => contrast(adoptedMutedValue, surface) >= 4.5)
        ? adoptedMutedValue.toLowerCase()
        : fitOwnLightness(adoptedMutedValue, mutedSurfaces, mode === 'light' ? 'darker' : 'lighter', 4.6);
      if (!expectedMuted) {
        fail(`${label}/${mode} --text-muted: no own-hue lightness value clears 4.6:1 on card, elev, and bg`);
      } else if (tokens['--text-muted']?.toLowerCase() !== expectedMuted) {
        fail(`${label}/${mode} --text-muted: expected ${expectedMuted}, found ${tokens['--text-muted']}`);
      }
    }

    if (parseHex(tokens['--accent']) && parseHex(tokens['--accent-strong'])) {
      const [accentHue, accentHslLightness, accentSaturation] = rgbToHls(tokens['--accent']);
      const [strongHue, strongHslLightness, strongSaturation] = rgbToHls(tokens['--accent-strong']);
      const lightnessDelta = Math.abs(lightnessStar(tokens['--accent']) - lightnessStar(tokens['--accent-strong']));
      const direction = strongHslLightness < accentHslLightness ? 'darker' : 'lighter';
      if (hueDistance(accentHue, strongHue) > 0.006 || Math.abs(accentSaturation - strongSaturation) > 0.015) {
        fail(`${label}/${mode} --accent-strong must retain --accent hue and saturation`);
      }
      if (lightnessDelta < 8) {
        fail(`${label}/${mode} --accent-strong L* delta ${lightnessDelta.toFixed(2)} < 8.00`);
      }
      if (direction === 'lighter' && validDarkerPressedState(tokens['--accent'], tokens['--accent-fg'])) {
        fail(`${label}/${mode} --accent-strong is lighter although a valid darker pressed state exists`);
      }
      if (mode !== 'auto-dark') {
        console.log(`${label} ${mode}: accent-strong ${tokens['--accent-strong']} ${direction}; L* delta ${lightnessDelta.toFixed(2)}; accent-fg/strong ${formatRatio(pressedForegroundRatio)}`);
      }
    }

    const d29Inputs = [tokens['--accent'], tokens['--bg-card'], tokens['--bg-elev']];
    if (d29Inputs.every((value) => parseHex(value))) {
      const expectedLabel = d29Label(tokens['--accent'], [tokens['--bg-card'], tokens['--bg-elev']]);
      if (!expectedLabel) {
        fail(`${label}/${mode} --accent-label D29: no same-hue lightened value clears 4.6:1 on card and elev`);
      } else if (tokens['--accent-label']?.toLowerCase() !== expectedLabel) {
        fail(`${label}/${mode} --accent-label D29: expected ${expectedLabel}, found ${tokens['--accent-label']}`);
      }
    }
    if (parseHex(tokens['--warning'] ?? '') && parseHex(tokens['--accent'] ?? '')) {
      const [warningHue] = rgbToHls(tokens['--warning']);
      const [accentHue] = rgbToHls(tokens['--accent']);
      const hueGap = hueDistance(warningHue, accentHue) * 360;
      const warningAccentContrast = contrast(tokens['--warning'], tokens['--accent']);
      if (hueGap < 40 && warningAccentContrast < 1.5) {
        fail(`${label}/${mode} --warning separation from --accent: ${hueGap.toFixed(2)}° < 40° and ${warningAccentContrast.toFixed(2)}:1 < 1.5:1`);
      }
      if (mode !== 'auto-dark') {
        console.log(`${label} ${mode}: warning/accent hue delta ${hueGap.toFixed(2)}°; contrast ${warningAccentContrast.toFixed(2)}:1`);
      }
    }

    if (mode !== 'auto-dark') {
      console.log(`${label} ${mode}: accent-fg/accent ${formatRatio(foregroundRatio)}; accent-label ${tokens['--accent-label'] ?? 'UNRESOLVED'} card ${formatRatio(cardRatio)}; elev ${formatRatio(elevRatio)}; text/accent-soft ${formatRatio(softForegroundRatio)}`);
    }
  }
}

// --accent-label is the lightened accent that clears 4.5:1 on a card. The point
// of this gate is that it must have a REAL consumer, or the whole D29 ramp above
// is arithmetic nobody sees and the next label written with plain --accent (1.7:1
// in ورق dark) sails through.
//
// It used to name .runner-current-set-label specifically. That selector belongs
// to the Phase 4 full-viewport runner, which Phase 6 retired — app.js only ever
// REMOVES `runner-mode`, never adds it — so the gate had been certifying a rule
// that no longer renders. Requiring a named dead selector is worse than
// requiring a live one: it passes for the wrong reason and blocks nothing.
const accentLabelRules = rulesUsingCustomProperty('--accent-label');
if (!accentLabelRules.length) {
  fail('--accent-label is defined in every skin and consumed by no rule; either use it for label text or drop it');
} else {
  console.log(`accent-label used by ${accentLabelRules.join(', ')}`);
}

if (/--text-dim|--accent[-]glow/.test(css)) fail('retired token remains in styles.css');
const shadowAccent = [...css.matchAll(/--shadow-accent\s*:\s*([^;]+);/g)].map((match) => match[1]);
if (!shadowAccent.length || shadowAccent.some((value) => /var\(--accent\)/.test(value))) {
  fail('--shadow-accent must be defined as a neutral shadow');
}

if (failures.length) {
  for (const message of failures) console.error(`CONTRAST_LINT_FAIL: ${message}`);
  process.exit(1);
}

console.log('D29_LABEL_RULE_PASSED');
console.log('CONTRAST_LINT_PASSED');
