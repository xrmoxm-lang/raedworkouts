/* Language resolution, date/time and load formatting. */

import { $, $$ } from '../core/dom.js';
import { settings } from '../core/store.js';
import { format as localeFormat, text as localeText } from '../locale.js';

// ---- i18n ---------------------------------------------------
// Every renderer supplies an English source/key to this single locale map.
// Arabic text is the default; English exercise names and numeric runs are
// isolated below so punctuation cannot jump across an RTL sentence.
export const activeLanguage = () => settings?.lang || 'ar';
export const t = (key) => localeText(key, activeLanguage());
export const tf = (key, values) => localeFormat(key, values, activeLanguage());
export const localizeText = (value) => typeof value === 'string' ? localeText(value, activeLanguage()) : value;
// Muscle labels are data labels, not freehand UI copy.  Rendering them through
// this one resolver keeps Home, Library, Help, and legacy cards on data.js's
// approved Arabic label when the locale is Arabic.
export const muscleLabel = (id) => {
  const muscle = RW?.MUSCLES?.[id];
  return (activeLanguage() === 'ar' ? muscle?.ar : muscle?.en) || muscle?.en || id;
};
export const experienceLabel = (experience) => ({
  beginner: t('new_to_gym'),
  detrained: t('trained_before_reentering'),
  returning: t('trained_before_coming_back'),
  experienced: t('currently_training'),
}[experience] || t('returning'));
export function applyLang() {
  const lang = activeLanguage();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app_name');
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $$('[data-i18n-aria-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
}

export const fmtDate = (d) => new Date(d).toLocaleDateString(
  activeLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US',
  { weekday: 'short', month: 'short', day: 'numeric' },
);
// Day and month only. fmtDate includes the weekday, which is right on a session
// card but too long for a four-column table on a 390px screen — it overflowed
// into the load beside it. Three rows of dates do not need a weekday to be read.
export const fmtDateShort = (d) => new Date(d).toLocaleDateString(
  activeLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US',
  { month: 'short', day: 'numeric' },
);
export const fmtTime = (d) => {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(d));
  const hour = parts.find((part) => part.type === 'hour')?.value || '';
  const minute = parts.find((part) => part.type === 'minute')?.value || '';
  const period = parts.find((part) => part.type === 'dayPeriod')?.value;
  if (activeLanguage() === 'ar') return `${hour}:${minute} ${period === 'PM' ? 'م' : 'ص'}`;
  return `${hour}:${minute} ${period || ''}`.trim();
};
// His local calendar date, not UTC's.
//
// This was `new Date().toISOString().slice(0,10)`, which is the date in UTC.
// Riyadh is UTC+3, so between local midnight and 03:00 the app stamped
// YESTERDAY. Proven live at 01:37 on 5 September: the app wrote 2026-09-04.
// Raed trains late — an earlier screenshot shows a session started 12:05 ص — and
// this date stamps his workouts, his personal records, his bodyweight log and
// his exports. A late session landed on the wrong day in every one of them, and
// the week strip then drew it on the wrong square.
//
// Device-local rather than a hardcoded Asia/Riyadh, so it stays right if he
// travels. 'en-CA' is the locale whose short date is already YYYY-MM-DD.
export const localISODate = (date = new Date()) => date.toLocaleDateString('en-CA');
export const todayISO = () => localISODate();
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
export function fmtLoadKg(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

// One money formatter. It lived inside the usage panel as a local `money`, and
// the over-budget notice needs the same rounding — two of them would drift.
export const fmtUsd = (n) => '$' + Number(n || 0).toFixed(Number(n) >= 1 ? 2 : 4);

export function fmtKgTotal(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function fmtKgValue(value) {
  return Number(value).toFixed(1).replace(/\.0$/, '');
}
// Zero is a legitimate load: plenty of machines carry their own stack, and Raed
// logs 0 for those. It used to be rejected, which forced him to invent a 1.
export function hasWorkingWeight(value) {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0;
}
export function displaySuggestedWeight(value) {
  return hasWorkingWeight(value) ? `${fmtKgValue(value)} ${t('kg')}` : '—';
}
export function suggestedWeightPlaceholder(value) {
  // An empty box told Raed nothing -- he could not tell "no suggestion yet" from
  // "the app is broken". With no logged history there IS no number to suggest,
  // so the honest word is «معايرة»: this session is the calibration.
  return hasWorkingWeight(value) ? fmtKgValue(value) : t('calibrate');
}
// Blank and zero are different things, and this used to collapse them.
//
// It was `hasWorkingWeight(value) ? Number(value) : ''`, and hasWorkingWeight is
// `> 0` — so an explicit 0, which the app supports on purpose for a machine that
// carries its own stack, came back as ''. Consequences, all proven on screen:
// a completed 0 kg set re-rendered with an EMPTY weight box, so work he had
// logged looked unrecorded and tapping the tick again answered «مطلوب»; and
// «+ مجموعة» after a 0 kg set created a row holding '' rather than 0, which on
// a readOnly machine-weight card he could never fill in and never complete.
//
// domain/runner-session.js already draws this distinction correctly in
// hasValidWorkingValues. This is the same rule: absent is blank, 0 is a number.
export function editableWeightValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : '';
}
// Shown once every exercise is resolved. Raed asked for the elapsed time —
// "أبغى بصفحة التمارين يقول لي إنه خلصت التمرين خلال كم" — and the duration is
// worth more than the volume number here: it is the one thing he cannot
// reconstruct later from the log.
// Arabic counts again: 1 singular, 2 dual, 3-10 plural, 11+ back to singular.
// A workout is usually 30-90 minutes so «دقيقة» is right most of the time, but a
// short session lands squarely in the 3-10 band where it is wrong.
export function arabicMinutes(n) {
  if (activeLanguage() !== 'ar') return tf('session_done_minutes', { n });
  if (n === 1) return t('minutes_one_ar');
  if (n === 2) return t('minutes_two_ar');
  if (n >= 3 && n <= 10) return tf('minutes_few_ar', { n });
  return tf('session_done_minutes', { n });
}

