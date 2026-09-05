import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_EXERCISE_NAMES,
  ALLOWED_NUMERALS,
  ALLOWED_PLAYLIST_TITLES,
  ALLOWED_PROPER_NOUN_ABBREVIATIONS,
  ALLOWED_PROPER_NOUNS,
  ALLOWED_WARMUP_DRILL_NAMES,
  LOCALE,
} from '../locale.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(repoRoot, 'styles.css'), 'utf8');
const dataSource = fs.readFileSync(path.join(repoRoot, 'data.js'), 'utf8');
const failures = [];
const fail = (message) => failures.push(message);
const require = (condition, message) => { if (!condition) fail(message); };

const englishToKey = new Map(Object.entries(LOCALE).map(([key, pair]) => [pair.en, key]));
const latinRun = /[A-Za-z]/;
const arabicDigits = /[٠-٩]/;
const allowedNames = new Set(ALLOWED_EXERCISE_NAMES);
const allowedDrills = new Set(ALLOWED_WARMUP_DRILL_NAMES);
const allowedPlaylists = new Set(ALLOWED_PLAYLIST_TITLES);
const allowedProperNounAbbreviations = new Set(ALLOWED_PROPER_NOUN_ABBREVIATIONS);
const allowedProperNouns = new Set(ALLOWED_PROPER_NOUNS);
const unmappedData = new Map();
const unmappedSource = new Map();
const deferredProgramme = new Map();
const translatedKeys = new Set();
const actualPlaylistTitles = new Set();
const noteMissing = (bucket, value, source) => {
  if (!bucket.has(value)) bucket.set(value, new Set());
  bucket.get(value).add(source);
};

// An empty exception list makes an absence check vacuous.  These are the only
// user-visible English runs Phase 4 permits (plus generated Western numerals).
require(allowedNames.size > 0, 'Arabic allow-list is empty: exercise names must be explicit');
require(allowedDrills.size > 0, 'Arabic allow-list is empty: warm-up drill names must be explicit');
require(allowedPlaylists.size > 0, 'Arabic allow-list is empty: Spotify playlist titles must be explicit');
require(allowedProperNounAbbreviations.size > 0, 'Arabic allow-list is empty: proper-noun abbreviations must be explicit');
require(allowedProperNouns.size > 0, 'Arabic allow-list is empty: proper nouns must be explicit');
require(ALLOWED_NUMERALS instanceof RegExp, 'Arabic allow-list is missing the Western-numeral matcher');
require(ALLOWED_NUMERALS.source.trim().length > 0, 'Arabic allow-list has an empty Western-numeral matcher');

for (const [key, pair] of Object.entries(LOCALE)) {
  require(typeof pair.en === 'string' && pair.en.trim(), `locale.${key} is missing its English source`);
  require(typeof pair.ar === 'string' && pair.ar.trim(), `locale.${key} is missing its approved Arabic value`);
  require(!arabicDigits.test(pair.ar), `locale.${key} uses Arabic-Indic numerals: ${pair.ar}`);
}
const requiredTerms = {
  runner_active_started: 'جارية · بدأت {time}',
  runner_video: 'الشرح',
  runner_last_time: 'آخر مرة',
  runner_add_set: '+ مجموعة',
  runner_rest: 'راحة',
  runner_log_set: 'سجّل المجموعة',
  runner_skip_warmup: 'تخطّي الإحماء',
  runner_finish_warmup: 'أكمل الإحماء',
  warmup_spotify: 'سبوتيفاي — شغّل',
  // The live line is home_music_handoff now: this one hardcoded «سبوتيفاي» and
  // printed it whatever platform he had chosen, which he reported twice. The old
  // key is kept only so an older cached shell still resolves something, and its
  // emoji went with the rest of them.
  home_spotify_handoff: 'سبوتيفاي — شغّل وانسَ الموضوع:',
  home_music_handoff: '{platform} — شغّل وانسَ الموضوع:',
  kg: 'kg',
};
for (const [key, expected] of Object.entries(requiredTerms)) {
  require(LOCALE[key]?.ar === expected, `locale.${key} differs from ARABIC-TERMS.md: ${LOCALE[key]?.ar ?? '(missing)'}`);
}
require(LOCALE.programme_tied_block_one_rule?.programme_tied === true, 'the archived Block 1 help rule must remain marked programme-tied until its wording is reviewed');
const requiredProgrammeTerms = {
  programme_upper_a: 'علوي أ',
  programme_lower_a: 'سفلي أ',
  programme_upper_b: 'علوي ب',
  programme_lower_b: 'سفلي ب',
  programme_block_a: 'علوي/سفلي — الكتلة أ (أسابيع 1–4)',
  programme_block_b: 'علوي/سفلي — الكتلة ب (أسابيع 5–8)',
  programme_block_c: 'علوي/سفلي — الكتلة ج (أسابيع 9–11)',
  programme_block_deload: 'أسبوع التفريغ (الأسبوع 12)',
  programme_note_history_rotation: 'الجلسة التالية تُختار من سجلّ ما أكملته، لا من يوم الأسبوع.',
  programme_note_block_b: 'الكتلة ب تُبقي المركّبات الأساسية كما هي، ولا تبدّل إلا تمارين العزل المذكورة.',
  programme_note_history_seed: 'ابدأ كل وزن عمل أول من سجلّك حين يوجد؛ والتدرّج الاستكشافي بديل عند غيابه لا الأصل.',
  programme_note_reentry: 'الأسبوعان 1–2 تدرّج عودة: قيّد الجهد وحجم الحركة السالبة، ولا تُنقص الوزن عمدًا على من ترك التدريب وعاد.',
};
for (const [key, expected] of Object.entries(requiredProgrammeTerms)) {
  require(LOCALE[key]?.ar === expected, `locale.${key} differs from ARABIC-TERMS.md Round 5: ${LOCALE[key]?.ar ?? '(missing)'}`);
}

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(dataSource, sandbox, { filename: 'data.js' });
const rw = sandbox.window.RW;
require(Boolean(rw), 'data.js did not expose window.RW for Arabic verification');

const resolveMapped = (value) => {
  if (typeof value !== 'string') return null;
  return englishToKey.get(value) || englishToKey.get(value.trim()) || null;
};
const requireMapped = (value, source) => {
  if (typeof value !== 'string') return;
  const normalized = value.trim();
  if (!normalized || !latinRun.test(normalized)) return;
  if (allowedNames.has(normalized) || allowedDrills.has(normalized) || allowedPlaylists.has(normalized) || allowedProperNouns.has(normalized) || normalized === 'kg') return;
  const key = resolveMapped(value);
  if (key) translatedKeys.add(key);
  else noteMissing(unmappedData, normalized, source);
};
for (const exercise of rw?.EXERCISES || []) {
  require(allowedNames.has(exercise.name), `exercise allow-list is stale or incomplete: ${exercise.name}`);
  requireMapped(exercise.cue, `cue for ${exercise.name}`);
}
for (const drill of Object.values(rw?.SESSION_WARMUPS || {}).flatMap((phase) => phase.drills || [])) {
  require(allowedDrills.has(drill.movement), `warm-up drill allow-list is stale or incomplete: ${drill.movement}`);
}
for (const [id, muscle] of Object.entries(rw?.MUSCLES || {})) {
  require(typeof muscle.en === 'string' && muscle.en.trim(), `muscle ${id} is missing its English label`);
  require(typeof muscle.ar === 'string' && muscle.ar.trim(), `muscle ${id} is missing its Arabic label`);
  require(!arabicDigits.test(muscle.ar || ''), `muscle ${id} uses Arabic-Indic numerals: ${muscle.ar}`);
}
const programmeSessions = (programme) => (
  Array.isArray(programme?.blocks)
    ? programme.blocks.flatMap((block) => block?.sessions || [])
    : (programme?.sessions || [])
);
for (const programme of [rw?.PROGRAMME]) {
  if (!programme) continue;
  requireMapped(programme.block_name, 'programme block name');
  for (const note of programme.notes || []) requireMapped(note, 'programme note');
  for (const block of programme.blocks || []) {
    requireMapped(block.block_name, `programme block ${block.id || block.block} name`);
  }
  for (const session of programmeSessions(programme)) {
    requireMapped(session.day, 'programme session day');
    requireMapped(session.name, 'programme session name');
    requireMapped(session.mood, 'programme session mood');
    for (const platform of Object.values(session.playlists || {})) {
      for (const playlist of platform) {
        actualPlaylistTitles.add(playlist.label);
        require(allowedPlaylists.has(playlist.label), `playlist-title allow-list is stale or incomplete: ${playlist.label}`);
        requireMapped(playlist.vibe, 'playlist description');
      }
    }
  }
}
for (const title of allowedPlaylists) {
  require(actualPlaylistTitles.has(title), `playlist-title allow-list contains a title absent from data.js: ${title}`);
}
for (const name of allowedProperNouns) {
  // The locale map counts, exactly as it does for abbreviations on the next
  // line. The product name moved into LOCALE.app_name so a rename happens in
  // one place; requiring a literal in app.js would force it to be duplicated.
  require(
    appSource.includes(name) || JSON.stringify(LOCALE).includes(name),
    `proper-noun allow-list contains a name absent from app.js and the locale map: ${name}`,
  );
}
for (const abbreviation of allowedProperNounAbbreviations) {
  require(appSource.includes(`'${abbreviation}'`) || appSource.includes(`\"${abbreviation}\"`) || JSON.stringify(LOCALE).includes(abbreviation), `proper-noun abbreviation allow-list contains a value absent from app.js or the locale map: ${abbreviation}`);
}

// Static UI copy goes through h(), which localizes all text children and the
// three user-facing attributes.  Catch newly introduced raw UI phrases before
// they can render as English.  Classes, ids, URLs and storage/API strings are
// deliberately not human-copy candidates.
const isHumanCopy = (value) => {
  const trimmed = value.trim();
  if (!latinRun.test(trimmed) || /^https?:|^[./#?]|^[\w.-]+$/.test(trimmed)) return false;
  if (/^translate\(|^\[data-|^\$\{/.test(trimmed)) return false;
  if (/(?:^|;)\s*[a-z-]+\s*:/.test(trimmed)) return false;
  if (/^\{\w+\}$/.test(trimmed)) return false;
  if (/^(?:[\w-]+\s+)*[\w-]+$/.test(trimmed) && trimmed === trimmed.toLowerCase()) return false;
  return true;
};
const isAllowedRawRun = (value) => (
  allowedNames.has(value)
  || allowedDrills.has(value)
  || allowedPlaylists.has(value)
  || allowedProperNouns.has(value)
  || allowedProperNounAbbreviations.has(value)
  || value === 'kg'
  || value === 'Spotify'
  || value === 'JN'
  || value === 'OK'
);
const copySink = /\bh\(|\btoast\(|\bsetUiText\(|\bprompt\(|\bconfirm\(|\bplaceholder\s*:|\btitle\s*:|aria-label/;
const literal = /(['"])((?:\\.|(?!\1).)*)\1/g;
for (const [offset, line] of appSource.split('\n').entries()) {
  if (!copySink.test(line)) continue;
  for (const match of line.matchAll(literal)) {
    const value = match[2].replace(/\\(['"])/g, '$1');
    const normalized = value.trim();
    if (!normalized || !isHumanCopy(value) || isAllowedRawRun(normalized)) continue;
    const key = resolveMapped(value);
    if (key) translatedKeys.add(key);
    else noteMissing(unmappedSource, value, `app.js:${offset + 1}`);
  }
}

for (const [value, sources] of unmappedData) {
  fail(`data-visible copy lacks a { en, ar } locale entry (${[...sources].join(', ')}): ${JSON.stringify(value)}`);
}
for (const [value, sources] of unmappedSource) {
  fail(`raw UI copy lacks a locale entry (${[...sources].join(', ')}): ${JSON.stringify(value)}`);
}

require(appSource.includes("localizedTextNode(c)"), 'h() no longer routes text children through the locale resolver');
require(appSource.includes("localizeText(attrs[k])"), 'h() no longer routes labels, placeholders, and titles through the locale resolver');
require(/const setUiText = \(el, value\) => \{ el\.replaceChildren\(localizedTextNode\(value\)\); \}/.test(appSource), 'direct textContent updates bypass the locale resolver');
require(/\.ltr-run\s*\{[^}]*unicode-bidi\s*:\s*isolate/.test(styleSource), 'LTR runs are not explicitly bidi-isolated in CSS');

console.log(`ARABIC_UI_TRANSLATED entries=${translatedKeys.size}`);
console.log(`ARABIC_UI_ALLOW_LISTED exerciseNames=${allowedNames.size} warmupDrills=${allowedDrills.size} playlistTitles=${allowedPlaylists.size} properNouns=${allowedProperNouns.size} properNounAbbreviations=${allowedProperNounAbbreviations.size} westernNumerals=enabled kg=enabled`);
console.log(`ARABIC_UI_DEFERRED count=${deferredProgramme.size}`);
for (const [value, sources] of [...deferredProgramme.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`DEFERRED — requires approved Arabic wording after the Upper/Lower port (${[...sources].join(', ')}): ${JSON.stringify(value)}`);
}

if (failures.length) {
  console.error('ARABIC_UI_VERIFICATION_FAILED');
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log('ARABIC_UI_VERIFIED');
}
