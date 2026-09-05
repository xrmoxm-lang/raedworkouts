/* ============================================================
   Raedworkouts — data.js
   Single source of truth for the exercise library and programme.
   Edit this file (or use the in-app Library editor) to add
   alternatives, change videos, or update the programme.
   ============================================================ */

// ---- Helpers -------------------------------------------------
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;
const ytShort = (id) => `https://www.youtube.com/shorts/${id}`;
const thumb = (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

// Body illustration per primary muscle. Returns a relative path
// to a colored anatomy image in /img/. Falls back to a default.
const BODY_IMG = {
  chest: './img/body_chest.png',
  upper_chest: './img/body_chest.png',
  shoulders: './img/body_chest.png',     // upper-body card uses chest body until shoulders illustration is added
  side_delts: './img/body_chest.png',
  rear_delts: './img/body_back.png',
  triceps: './img/body_bicep.png',       // arm illustration covers triceps too (single-arm view)
  biceps: './img/body_bicep.png',
  forearms: './img/body_bicep.png',
  back: './img/body_back.png',
  upper_back: './img/body_back.png',
  abs: './img/body_chest.png',
  quads: './img/body_quads.png',
  hamstrings: './img/body_glutes.png',
  glutes: './img/body_glutes.png',
  calves: './img/body_calves.png',
};
const bodyImg = (primary_arr) => {
  const m = (primary_arr && primary_arr[0]) || 'chest';
  return BODY_IMG[m] || './img/body_chest.png';
};

// ---- Muscle groups ------------------------------------------
const MUSCLES = {
  chest: { en: 'Chest', ar: 'صدر', region: 'anterior' },
  upper_chest: { en: 'Upper Chest', ar: 'الصدر العلوي', region: 'anterior' },
  shoulders: { en: 'Shoulders', ar: 'أكتاف', region: 'anterior' },
  side_delts: { en: 'Side Delts', ar: 'الكتف الجانبي', region: 'anterior' },
  triceps: { en: 'Triceps', ar: 'تراي', region: 'anterior' },
  quads: { en: 'Quads', ar: 'مقدمة الفخذ', region: 'anterior' },
  abs: { en: 'Abs', ar: 'بطن', region: 'anterior' },
  back: { en: 'Back / Lats', ar: 'ظهر', region: 'posterior' },
  upper_back: { en: 'Upper Back', ar: 'ظهر علوي', region: 'posterior' },
  rear_delts: { en: 'Rear Delts', ar: 'الكتف الخلفي', region: 'posterior' },
  biceps: { en: 'Biceps', ar: 'باي', region: 'posterior' },
  forearms: { en: 'Forearms', ar: 'ساعد', region: 'posterior' },
  glutes: { en: 'Glutes', ar: 'أرداف', region: 'posterior' },
  hamstrings: { en: 'Hamstrings', ar: 'خلف الفخذ', region: 'posterior' },
  calves: { en: 'Calves', ar: 'سمانة', region: 'posterior' },
};

// The library retains its 15 anatomical display buckets. The Phase 5 weekly
// ledger deliberately reports the 13 §8.5 tracked groups instead: chest
// variants merge, vertical pulls are Lats, horizontal rows are Mid-back, and
// forearms are intentionally outside D4's volume-floor audit.
const VOLUME_MUSCLE_TAXONOMY = Object.freeze({
  chest: 'Chest',
  upper_chest: 'Chest',
  back: 'Lats',
  upper_back: 'Mid-back',
  shoulders: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
  forearms: null,
});

// ---- Exercise library ---------------------------------------
// Each exercise: id, name, muscles, mohannad_videos[], jeff_nippard, alternatives[], notes
const EXERCISES = [
  // ====== UPPER BODY — PUSH ======
  {
    id: 'incline_chest_press',
    name: 'Incline Chest Press (Machine)',
    name_ar: 'بنش مايل (آلة)',
    primary: ['upper_chest'],
    secondary: ['shoulders', 'triceps'],
    pattern: 'horizontal_push',
    mohannad: ['-PT6BQcrm_I', 'wMksQXD01K0', 'o0Ud3RU59hw'],
    jeff_nippard: 'https://www.youtube.com/shorts/xGMqmmn5Z7Q',
    alternatives: ['chest_press_machine', 'incline_db_press'],
    cue: 'Set bench 30°. Drive elbows down and in, no flare.',
  },
  {
    id: 'chest_press_machine',
    name: 'Chest Press Machine',
    name_ar: 'بنش آلة',
    aliases: ['Machine Chest Press'],
    primary: ['chest'],
    secondary: ['shoulders', 'triceps'],
    pattern: 'horizontal_push',
    mohannad: ['Q1S9ybWYMjE', 'ogj1igwlc9I'],
    extra: ['https://youtu.be/z-cSrfEePg8'],
    jeff_nippard: 'https://youtu.be/k1S_Any3NIA?t=240',
    alternatives: ['incline_chest_press', 'pec_dec'],
    cue: 'Handles in line with mid-chest. Squeeze pecs at lockout.',
  },
  {
    id: 'chest_fly',
    name: 'Chest Fly Machine',
    name_ar: 'تفتيح صدر آلة',
    primary: ['chest'],
    secondary: ['shoulders'],
    pattern: 'isolation_push',
    mohannad: ['g3T7LsEeDWQ', 'iEvy-65Q5g4', 'fgXSA2-o0NM'],
    jeff_nippard: 'https://www.youtube.com/watch?v=-EIhKMDSjBY',
    alternatives: ['pec_dec', 'cable_fly'],
    cue: 'Slight bend in elbows, lock them. Stretch deep, squeeze hard.',
  },
  {
    id: 'pec_dec',
    name: 'Pec Deck',
    name_ar: 'بكدك',
    primary: ['chest'],
    secondary: [],
    pattern: 'isolation_push',
    mohannad: ['GAPCETzYmuI'],
    jeff_nippard: 'https://www.youtube.com/watch?v=-EIhKMDSjBY',
    alternatives: ['chest_fly', 'cable_fly'],
    cue: 'Arms pinned to pads. Drive elbows together, not hands.',
  },
  {
    id: 'incline_db_press',
    name: 'Incline Dumbbell Press',
    name_ar: 'بنش مايل دمبل',
    aliases: ['DB Incline Press', 'DB Incline Press (15–30°)'],
    primary: ['upper_chest'],
    secondary: ['shoulders', 'triceps'],
    pattern: 'horizontal_push',
    mohannad: [],
    jeff_nippard: 'https://www.youtube.com/shorts/xGMqmmn5Z7Q',
    alternatives: ['incline_chest_press', 'chest_press_machine'],
    cue: 'Bench at 30°. Press up and slightly in. Don\'t bang the bells at the top.',
  },
  {
    id: 'cable_fly',
    name: 'Cable Fly (Crossover)',
    name_ar: 'تفتيح كيبل',
    primary: ['chest'],
    secondary: ['shoulders'],
    pattern: 'isolation_push',
    mohannad: [],
    jeff_nippard: 'https://www.youtube.com/watch?v=-EIhKMDSjBY',
    alternatives: ['chest_fly', 'pec_dec'],
    cue: 'Slight forward lean. Drive across the chest, brief squeeze, slow eccentric.',
  },
  {
    id: 'shoulder_press_machine',
    name: 'Shoulder Press (Machine/DB)',
    name_ar: 'ضغط أكتاف',
    aliases: ['Seated DB Shoulder Press'],
    primary: ['shoulders'],
    secondary: ['triceps', 'upper_chest', 'side_delts'],
    pattern: 'vertical_push',
    mohannad: ['QjAoqZ6EpFg', 'WvLMauqrnK8'],
    extra: ['https://youtu.be/ae9IxwoEpQ8?t=507'],
    jeff_nippard: 'https://www.youtube.com/watch?v=flr4ohSl0j8',
    alternatives: ['machine_shoulder_press', 'standing_db_press'],
    cue: 'Slight forward lean. Press up and slightly back, not behind your head.',
  },
  {
    id: 'lateral_raise_db',
    name: 'Lateral Raise (DB)',
    name_ar: 'رفعة جانبية دمبل',
    aliases: ['DB Lateral Raise'],
    primary: ['side_delts'],
    secondary: [],
    pattern: 'isolation_push',
    mohannad: ['AyaiYr0RIwE', 'bB_FNepte6A'],
    jeff_nippard: 'https://www.youtube.com/shorts/jy8L7l-3hRI',
    alternatives: ['lateral_raise_cable'],
    cue: 'Lean slightly forward. Lead with elbows, pinky up at top.',
  },
  {
    id: 'lateral_raise_cable',
    name: 'Lateral Raise (Cable)',
    name_ar: 'رفعة جانبية كيبل',
    aliases: ['Cable Lateral Raise'],
    primary: ['side_delts'],
    secondary: [],
    pattern: 'isolation_push',
    mohannad: ['1AmmsXlf8MU'],
    jeff_nippard: 'https://www.youtube.com/shorts/HeovYNoZDRg',
    alternatives: ['lateral_raise_db'],
    cue: 'Cable from low pulley behind you. Constant tension wins.',
  },
  {
    id: 'seated_dips',
    name: 'Seated Dip Machine',
    name_ar: 'ديبس جالس',
    primary: ['triceps'],
    secondary: ['chest', 'shoulders'],
    pattern: 'compound_push',
    mohannad: ['KHPrFieVd6g', '2NOglxsG1wE'],
    jeff_nippard: 'https://www.youtube.com/watch?v=yN6Q1UI_xkE',
    alternatives: ['tricep_pushdown'],
    cue: 'Elbows tight to ribs. Full lockout at the bottom.',
  },
  {
    id: 'tricep_pushdown',
    name: 'Tricep Pushdown (Cable)',
    name_ar: 'ضغط ترايسبس كيبل',
    aliases: ['Triceps Pressdown'],
    primary: ['triceps'],
    secondary: [],
    pattern: 'isolation_push',
    mohannad: [],
    jeff_nippard: 'https://www.youtube.com/watch?v=popGXI-qs98',
    alternatives: ['overhead_rope'],
    cue: 'Elbows pinned. Lockout with knuckles flexed away.',
  },
  {
    id: 'overhead_rope',
    name: 'Overhead Rope Tricep Extension',
    name_ar: 'تمديد ترايسبس فوق الرأس',
    aliases: ['Overhead Cable Triceps Extension', 'Overhead Cable Extension'],
    primary: ['triceps'],
    secondary: [],
    pattern: 'isolation_push',
    mohannad: ['Q3bO1Fh4734', 'MiiLWxoz8fU'],
    jeff_nippard: 'https://www.youtube.com/watch?v=popGXI-qs98',
    alternatives: ['tricep_pushdown'],
    cue: 'Long head emphasis. Stretch deep at the bottom.',
  },

  // ====== UPPER BODY — PULL ======
  {
    id: 'lat_pulldown',
    name: 'Lat Pulldown',
    name_ar: 'سحب علوي',
    primary: ['back'],
    secondary: ['biceps', 'rear_delts'],
    pattern: 'vertical_pull',
    mohannad: ['goIzUxshgGI', 'uqPK1Vz6Xks'],
    jeff_nippard: 'https://www.youtube.com/shorts/SqQxuEpXnF4',
    alternatives: ['lat_pulldown_neutral'],
    cue: 'Pull the bar to upper chest. Drive elbows down and back, not just bend them.',
  },
  {
    id: 'lat_pulldown_neutral',
    name: 'Lat Pulldown (Neutral Grip)',
    name_ar: 'سحب علوي قبضة محايدة',
    aliases: ['Neutral-Grip Lat Pulldown'],
    primary: ['back'],
    secondary: ['biceps', 'rear_delts', 'upper_back'],
    pattern: 'vertical_pull',
    mohannad: ['goIzUxshgGI'],
    jeff_nippard: 'https://www.youtube.com/shorts/SqQxuEpXnF4',
    alternatives: ['lat_pulldown'],
    cue: 'Palms face each other. Better stretch on the lats, kinder on shoulders.',
  },
  {
    id: 'tbar_row',
    name: 'T-Bar Row',
    name_ar: 'سحب تي بار',
    aliases: ['Chest-Supported T-Bar Row'],
    primary: ['upper_back'],
    secondary: ['back', 'rear_delts', 'biceps'],
    pattern: 'horizontal_pull',
    mohannad: ['36sT4np_G1E', '8bHhLWBAvBU'],
    jeff_nippard: 'https://www.youtube.com/shorts/fgSyNdEsqlM',
    alternatives: ['low_row_machine', 'seated_cable_row'],
    cue: 'Hinge to ~30°. Pull to lower ribs. Squeeze shoulder blades.',
  },
  {
    id: 'low_row_machine',
    name: 'Low Row Machine',
    name_ar: 'سحب آلة منخفض',
    primary: ['upper_back'],
    secondary: ['rear_delts', 'biceps'],
    pattern: 'horizontal_pull',
    mohannad: ['uLb1R5sjUw0', '2dbhfV8ErjY', 'yFo-EFYzf1s'],
    jeff_nippard: 'https://www.youtube.com/shorts/fgSyNdEsqlM',
    alternatives: ['tbar_row', 'seated_cable_row'],
    cue: 'Chest against the pad. Pull to ribs, no torso swing.',
  },
  {
    id: 'seated_cable_row',
    name: 'Seated Cable Row',
    name_ar: 'سحب كيبل جالس',
    primary: ['upper_back'],
    secondary: ['back', 'biceps', 'rear_delts'],
    pattern: 'horizontal_pull',
    mohannad: ['z7C7PxVDAD0', 'dCLRdVqKRkk', 'fPbfYDgzIgA'],
    jeff_nippard: 'https://www.youtube.com/shorts/fgSyNdEsqlM',
    alternatives: ['low_row_machine', 'tbar_row'],
    cue: 'Stretch all the way forward. Pull to belly, brief squeeze.',
  },
  {
    id: 'face_pull',
    name: 'Face Pull (Cable)',
    name_ar: 'سحب الوجه',
    aliases: ['Seated Face Pull'],
    primary: ['rear_delts'],
    secondary: ['upper_back'],
    pattern: 'isolation_pull',
    mohannad: ['McDrW7uI4JI', 'DVxfKB0BnlY', 'TxoDSfcObdU'],
    extra: [],
    jeff_nippard: 'https://www.youtube.com/watch?v=uoWXumFUeCc',
    alternatives: ['rear_delt_fly'],
    cue: 'Pull rope to forehead. External rotation at the top — keep elbows high.',
  },
  {
    id: 'rear_delt_fly',
    name: 'Rear Delt Fly Machine',
    name_ar: 'تفتيح خلفي',
    aliases: ['Reverse Pec Deck'],
    primary: ['rear_delts'],
    secondary: ['upper_back'],
    pattern: 'isolation_pull',
    mohannad: ['PZq3CJGLj6M'],
    // dwb-ccqK1WE removed from YouTube (oEmbed + thumbnail both 404, 2026-09-01).
    retired_videos: ['dwb-ccqK1WE'],
    jeff_nippard: 'https://www.youtube.com/shorts/P5CXx_jgTDE',
    alternatives: ['face_pull'],
    cue: 'Lead with elbows, hands stay neutral. Slow eccentric.',
  },
  {
    id: 'biceps_curl',
    name: 'Biceps Curl (DB or Cable)',
    name_ar: 'باي سبس',
    aliases: ['DB Supinated Curl'],
    primary: ['biceps'],
    secondary: ['forearms'],
    pattern: 'isolation_pull',
    mohannad: ['iui51E31sX8', 'cHxRJdSVIkA'],
    extra: ['https://youtu.be/i1YgFZB6alI?t=487', 'https://youtu.be/aNGJGcS4YMI', 'https://youtu.be/_aoad2yuP5w'],
    jeff_nippard: 'https://www.youtube.com/watch?v=tw1h5XOD23Y',
    alternatives: ['hammer_curl'],
    cue: 'Elbows tucked. Don\'t swing — if you swing, the weight is too heavy.',
  },
  {
    id: 'hammer_curl',
    name: 'Hammer Curl',
    name_ar: 'هامر',
    primary: ['biceps'],
    secondary: ['forearms'],
    pattern: 'isolation_pull',
    mohannad: ['8nCxfkRSN4o'],
    // n87rX0fNkBQ removed from YouTube (oEmbed + thumbnail both 404, 2026-09-01).
    retired_videos: ['n87rX0fNkBQ'],
    extra: ['https://youtu.be/VuEclXR7sZY'],
    jeff_nippard: 'https://www.youtube.com/watch?v=Kd3tbUnbueU',
    alternatives: ['biceps_curl', 'reverse_curl'],
    cue: 'Neutral grip. Targets brachialis — adds arm thickness.',
  },
  {
    id: 'reverse_curl',
    name: 'Reverse Curl',
    name_ar: 'باي عكسي',
    primary: ['forearms'],
    secondary: ['biceps'],
    pattern: 'isolation_pull',
    mohannad: ['jtOP4m8MXh4', '4U2tiGjXobY'],
    extra: ['https://youtu.be/vm6E-iNWQUw', 'https://youtu.be/ZG2n5IcYIcY'],
    jeff_nippard: 'https://www.youtube.com/results?search_query=reverse+curl+jeff+nippard',
    alternatives: ['hammer_curl'],
    cue: 'Overhand grip. Forearms will scream — that\'s the point.',
  },

  // ====== LOWER BODY ======
  {
    id: 'leg_press',
    name: 'Leg Press',
    name_ar: 'مكبس الرجل',
    primary: ['quads'],
    secondary: ['glutes', 'hamstrings'],
    pattern: 'compound_quad',
    mohannad: ['ahaJTts1f3s', 'vNaDK5l39_A'],
    jeff_nippard: 'https://www.youtube.com/shorts/nDh_BlnLCGc',
    alternatives: ['hack_squat'],
    cue: 'Feet shoulder-width, mid-platform. Don\'t let lower back round.',
  },
  {
    id: 'hack_squat',
    name: 'Hack Squat',
    name_ar: 'هاك سكوات',
    primary: ['quads'],
    secondary: ['glutes'],
    pattern: 'compound_quad',
    mohannad: ['tb5KeF00yII', 'udzewuz-BQY'],
    extra: ['https://www.youtube.com/watch?v=wEgQUCdtFLg', 'https://youtu.be/Zgd6eFxPTxM'],
    jeff_nippard: 'https://www.youtube.com/results?search_query=hack+squat+jeff+nippard',
    alternatives: ['leg_press'],
    cue: 'Feet slightly forward of hips. Drive through whole foot.',
  },
  {
    id: 'leg_extension',
    name: 'Leg Extension',
    name_ar: 'تمديد الرجل',
    primary: ['quads'],
    secondary: [],
    pattern: 'isolation_quad',
    mohannad: ['1BIIORHJ2XI', 'XQeytI_bCsk'],
    jeff_nippard: 'https://www.youtube.com/shorts/ztNBgrGy6FQ',
    alternatives: ['leg_press', 'machine_squat', 'goblet_squat'],
    cue: 'Pin to top, slow eccentric, don\'t bang the pin.',
  },
  {
    id: 'prone_leg_curl',
    // Raed: "lying and prone leg curl، مو هم نفس الشيء؟" — they are. Both are
    // face-down on the same machine, same primary, same pattern. They were two
    // catalogue entries, and every clip he added went to THIS one while the
    // programme ran the other, so the card he actually saw was empty.
    // Merged into this id because it also carries five sessions of his v15
    // history. 'Lying Leg Curl' stays as an alias: the programme names its rows,
    // it does not reference ids.
    name: 'Prone Leg Curl',
    aliases: ['Lying Leg Curl'],
    name_ar: 'ثني الرجل بطن',
    primary: ['hamstrings'],
    // No glutes. A prone curl is knee flexion with the hip pinned to the pad;
    // the glutes are hip extensors and the hip does not move. Its own siblings
    // agree — seated and standing curls carry no glute claim, while glute-ham
    // raise and RDL, which DO extend the hip, correctly do. This entry was the
    // outlier, and the merge would have carried its error into the programme.
    secondary: [],
    pattern: 'isolation_hamstring',
    mohannad: ['ANKSmhT0dTk', 'FMCq0hT3KRU', '0fuxdoKUCHA'],
    jeff_nippard: 'https://youtu.be/lGNeJsdqJwg',
    alternatives: ['standing_leg_curl', 'seated_leg_curl', 'rdl'],
    cue: 'Hips pressed into pad. Point toes — better hamstring activation.',
  },
  {
    id: 'standing_leg_curl',
    name: 'Standing Leg Curl',
    name_ar: 'ثني الرجل واقف',
    primary: ['hamstrings'],
    secondary: [],
    pattern: 'isolation_hamstring',
    mohannad: ['P2KTb8zyqsM'],
    extra: ['https://youtu.be/i6zmbXp4Ico'],
    jeff_nippard: 'https://www.youtube.com/results?search_query=standing+leg+curl+jeff+nippard',
    alternatives: ['prone_leg_curl', 'seated_leg_curl'],
    cue: 'One leg at a time. Brutal — you\'ll feel the stretch.',
  },
  {
    id: 'seated_leg_curl',
    name: 'Seated Leg Curl',
    name_ar: 'ثني الرجل جالس',
    primary: ['hamstrings'],
    secondary: [],
    pattern: 'isolation_hamstring',
    mohannad: [],
    jeff_nippard: 'https://www.youtube.com/shorts/Lh3iMIcbkBQ',
    alternatives: ['prone_leg_curl', 'standing_leg_curl'],
    cue: 'Hip-flexed position — better stretch on hamstrings than prone. Slow eccentric.',
  },
  {
    id: 'hip_thrust',
    name: 'Hip Thrust (Machine or BB)',
    name_ar: 'دفع الورك',
    aliases: ['Barbell Hip Thrust'],
    primary: ['glutes'],
    secondary: ['hamstrings'],
    pattern: 'compound_hinge',
    mohannad: ['Va6Wg_jKilM', 'KPng97k1Opg'],
    jeff_nippard: 'https://youtu.be/xDmFkJxPzeM?t=97',
    alternatives: ['rdl'],
    cue: 'Chin tucked. Squeeze glutes at top. Don\'t over-extend lower back.',
  },
  {
    id: 'rdl',
    name: 'Romanian Deadlift',
    name_ar: 'الرفعة الرومانية',
    aliases: ['DB Romanian Deadlift', 'Romanian Deadlift (Week 3+)'],
    primary: ['hamstrings'],
    secondary: ['glutes'],
    pattern: 'compound_hinge',
    mohannad: [],
    jeff_nippard: 'https://www.youtube.com/watch?v=_oyxCn2iSjU',
    alternatives: ['hip_thrust', 'prone_leg_curl'],
    cue: 'Hinge, don\'t squat. Bar slides down thighs. Stop when hamstrings stretch.',
  },
  {
    id: 'standing_calf',
    name: 'Standing Calf Raise',
    name_ar: 'سمانة واقف',
    primary: ['calves'],
    secondary: [],
    pattern: 'isolation_calf',
    mohannad: ['ArhbcO-TPKM', 'pHm6LFuGGbs', 'GnrwIpDtuto'],
    jeff_nippard: 'https://www.youtube.com/shorts/baEXLy09Ncc',
    alternatives: ['seated_calf'],
    cue: 'Full stretch at the bottom (1 sec pause), full contraction at top.',
  },
  {
    id: 'seated_calf',
    name: 'Seated Calf Raise',
    name_ar: 'سمانة جالس',
    primary: ['calves'],
    secondary: [],
    pattern: 'isolation_calf',
    mohannad: [],
    // vCOlZ-zk80o removed from YouTube (oEmbed + thumbnail both 404, 2026-09-01).
    // The Jeff Nippard clip still covers this movement.
    retired_videos: ['vCOlZ-zk80o'],
    jeff_nippard: 'https://www.youtube.com/shorts/baEXLy09Ncc',
    alternatives: ['standing_calf'],
    cue: 'Targets soleus. Slow, controlled — calves love volume.',
  },
  {
    id: 'ab_crunch',
    name: 'Cable Crunch',
    name_ar: 'بطن',
    aliases: ['Ab Crunch (Machine or Cable)'],
    primary: ['abs'],
    secondary: [],
    pattern: 'isolation_core',
    mohannad: ['vBhXL83WbII'],
    jeff_nippard: 'https://www.youtube.com/watch?v=1G0y8D5rFDc',
    alternatives: ['machine_crunch'],
    cue: 'Curl spine, don\'t hinge at hips. Exhale at peak contraction.',
  },
];

// ---- Phase 5 Upper/Lower catalogue expansion ----------------
// These records deliberately have no guessed video. A new exercise renders
// “no video yet” until Raed enters or source-links a clip.
// jeff_nippard is a parameter, not a hardcoded blank: the Phase 5 port created
// these fourteen movements with no way to carry a demo link, so a verified
// source-linked video had nowhere to go. Callers pass one only when it was
// extracted from a PDF Raed owns (D8 — never a guessed video).
const phase5Exercise = ({ id, name, primary, secondary = [], pattern, aliases = [], alternatives = [], jeff_nippard = '' }) => ({
  id,
  name,
  name_ar: '',
  aliases,
  primary: [primary],
  secondary,
  pattern,
  mohannad: [],
  jeff_nippard,
  alternatives,
  cue: '',
});

EXERCISES.push(
  // The fourteen programme movements which were not in the v15 library.
  phase5Exercise({ id: 'reverse_grip_lat_pulldown', name: 'Reverse-Grip Lat Pulldown', primary: 'back', secondary: ['biceps', 'rear_delts', 'upper_back'], pattern: 'vertical_pull', alternatives: ['reverse_grip_assisted_pullup', 'single_arm_pulldown'] }),
  // Raed: "خليه لترايسبس ما هو للصدر". The dip he actually performs is the
  // close-grip version — which is also what the Nippard PDF's own clip shows —
  // and that loads triceps, not chest. Chest keeps a secondary claim because it
  // still contributes. This MOVES the exercise's volume in the weekly ledger
  // from chest to triceps, so what counts as a safe substitution for it changes
  // too; that is the intended consequence, not a side effect.
  phase5Exercise({ id: 'assisted_dip', name: 'Assisted Dip', primary: 'triceps', secondary: ['chest', 'shoulders'], pattern: 'compound_push', alternatives: ['decline_db_press', 'chest_press_machine'], jeff_nippard: 'https://youtu.be/mpcPTUAhfto?si=VHNG-WmxfbY9hmjn' }),
  phase5Exercise({ id: 'single_arm_rope_triceps_extension', name: 'Single-Arm Rope Triceps Extension', primary: 'triceps', pattern: 'isolation_push', alternatives: ['tricep_pushdown'] }),
  phase5Exercise({ id: 'goblet_squat', name: 'Goblet Squat', primary: 'quads', secondary: ['glutes', 'hamstrings'], pattern: 'compound_quad', alternatives: ['hack_squat', 'leg_press'] }),
  phase5Exercise({ id: 'db_walking_lunge', name: 'DB Walking Lunge', primary: 'quads', secondary: ['glutes'], pattern: 'compound_quad', alternatives: ['db_step_up'] }),
  phase5Exercise({ id: 'hanging_leg_raise', name: 'Hanging Leg Raise', primary: 'abs', pattern: 'isolation_core', jeff_nippard: 'https://youtu.be/2RrGnjxSsiA?t=247', alternatives: ['reverse_crunch', 'roman_chair_crunch'] }),
  phase5Exercise({ id: 'ez_bar_curl', name: 'EZ Bar Curl', primary: 'biceps', secondary: ['forearms'], pattern: 'isolation_pull', jeff_nippard: 'https://www.youtube.com/watch?v=Dd0t5UOCEUc', alternatives: ['biceps_curl', 'cable_ez_curl'] }),
  phase5Exercise({ id: 'machine_lateral_raise', name: 'Machine Lateral Raise', primary: 'side_delts', pattern: 'isolation_push', jeff_nippard: 'https://youtu.be/-9QsrJ542ao', alternatives: ['lateral_raise_cable', 'lateral_raise_db'] }),
  // §8.4 DOES give this one substitutes — Cable Crunch and Machine Crunch, on its
// Block B Lower A row. I previously told Raed it "appears nowhere in §8.4" and
// therefore had no sourced alternative; that was wrong. I had checked whether it
// appeared as a programme ROW in Block A rather than whether the table gave it
// subs, and he made a decision on that bad information.
phase5Exercise({ id: 'bicycle_crunch', name: 'Bicycle Crunch', primary: 'abs', pattern: 'isolation_core', alternatives: ['ab_crunch', 'machine_crunch'], jeff_nippard: 'https://youtu.be/OXs4DCS8Ei8?si=0WCCbNRrf2eaWePi' }),
  phase5Exercise({ id: 'db_incline_curl', name: 'DB Incline Curl', primary: 'biceps', secondary: ['forearms'], pattern: 'isolation_pull', alternatives: ['hammer_curl', 'bayesian_cable_curl'] }),
  phase5Exercise({ id: 'single_leg_leg_extension', name: 'Single-Leg Leg Extension', primary: 'quads', pattern: 'isolation_quad', alternatives: ['leg_extension', 'goblet_squat'] }),
  phase5Exercise({ id: 'leg_press_toe_press', name: 'Leg Press Toe Press', primary: 'calves', pattern: 'isolation_calf', jeff_nippard: 'https://youtu.be/VJ_9xii47Sk', alternatives: ['standing_calf', 'db_standing_calf_raise', 'seated_calf'] }),
  phase5Exercise({ id: 'machine_crunch', name: 'Machine Crunch', primary: 'abs', pattern: 'isolation_core', alternatives: ['ab_crunch'] }),

  // Every named §8.4 substitute resolves through the same catalogue and
  // therefore through the substitution ledger. None is a fuzzy video match.
  phase5Exercise({ id: 'flat_db_press', name: 'Flat DB Press', primary: 'chest', secondary: ['shoulders', 'triceps'], pattern: 'horizontal_push', alternatives: ['chest_press_machine', 'hammer_strength_press'] }),
  phase5Exercise({ id: 'hammer_strength_press', name: 'Hammer Strength Press', primary: 'chest', secondary: ['shoulders', 'triceps'], pattern: 'horizontal_push', alternatives: ['chest_press_machine', 'flat_db_press'] }),
  phase5Exercise({ id: 'two_grip_lat_pulldown', name: '2-Grip Lat Pulldown', primary: 'back', secondary: ['biceps', 'rear_delts'], pattern: 'vertical_pull', alternatives: ['lat_pulldown_neutral', 'machine_pulldown'] }),
  phase5Exercise({ id: 'machine_pulldown', name: 'Machine Pulldown', primary: 'back', secondary: ['biceps', 'rear_delts'], pattern: 'vertical_pull', alternatives: ['lat_pulldown_neutral', 'two_grip_lat_pulldown'] }),
  phase5Exercise({ id: 'machine_shoulder_press', name: 'Machine Shoulder Press', primary: 'shoulders', secondary: ['triceps', 'chest'], pattern: 'vertical_push', alternatives: ['shoulder_press_machine', 'standing_db_press'] }),
  phase5Exercise({ id: 'standing_db_press', name: 'Standing DB Press', primary: 'shoulders', secondary: ['triceps', 'chest'], pattern: 'vertical_push', alternatives: ['shoulder_press_machine', 'machine_shoulder_press'] }),
  phase5Exercise({ id: 'chest_supported_db_row', name: 'Chest-Supported DB Row', primary: 'back', secondary: ['biceps', 'rear_delts'], pattern: 'horizontal_pull', alternatives: ['tbar_row', 'machine_row'] }),
  phase5Exercise({ id: 'machine_row', name: 'Machine Row', primary: 'back', secondary: ['biceps', 'rear_delts'], pattern: 'horizontal_pull', alternatives: ['tbar_row', 'chest_supported_db_row'] }),
  phase5Exercise({ id: 'cable_ez_curl', name: 'Cable EZ Curl', primary: 'biceps', secondary: ['forearms'], pattern: 'isolation_pull', alternatives: ['biceps_curl', 'ez_bar_curl'] }),
  phase5Exercise({ id: 'machine_squat', name: 'Machine Squat', primary: 'quads', secondary: ['glutes'], pattern: 'compound_quad', alternatives: ['leg_press', 'hack_squat'] }),
  phase5Exercise({ id: 'barbell_rdl', name: 'Barbell RDL', primary: 'hamstrings', secondary: ['glutes', 'back'], pattern: 'compound_hinge', alternatives: ['rdl'] }),
  phase5Exercise({ id: 'degree_45_hyperextension', name: '45 Degree Hyperextension', primary: 'hamstrings', secondary: ['glutes', 'back'], pattern: 'compound_hinge' }),
  phase5Exercise({ id: 'glute_ham_raise', name: 'Glute-Ham Raise', primary: 'hamstrings', secondary: ['glutes'], pattern: 'isolation_hamstring', alternatives: ['prone_leg_curl', 'seated_leg_curl'] }),
  phase5Exercise({ id: 'db_standing_calf_raise', name: 'DB Standing Calf Raise', primary: 'calves', pattern: 'isolation_calf', alternatives: ['standing_calf', 'leg_press_toe_press'] }),
  phase5Exercise({ id: 'crunch', name: 'Crunch', primary: 'abs', pattern: 'isolation_core', alternatives: ['ab_crunch', 'machine_crunch'] }),
  phase5Exercise({ id: 'machine_incline_press', name: 'Machine Incline Press', primary: 'chest', secondary: ['shoulders', 'triceps'], pattern: 'horizontal_push', alternatives: ['incline_db_press', 'incline_smith_press'] }),
  phase5Exercise({ id: 'incline_smith_press', name: 'Incline Smith Press', primary: 'chest', secondary: ['shoulders', 'triceps'], pattern: 'horizontal_push', alternatives: ['incline_db_press', 'machine_incline_press'] }),
  phase5Exercise({ id: 'reverse_grip_assisted_pullup', name: 'Reverse-Grip Assisted Pull-up', primary: 'back', secondary: ['biceps'], pattern: 'vertical_pull', alternatives: ['reverse_grip_lat_pulldown', 'single_arm_pulldown'] }),
  phase5Exercise({ id: 'single_arm_pulldown', name: 'Single-Arm Pulldown', primary: 'back', secondary: ['biceps'], pattern: 'vertical_pull', alternatives: ['reverse_grip_lat_pulldown', 'reverse_grip_assisted_pullup'] }),
  phase5Exercise({ id: 'decline_db_press', name: 'Decline DB Press', primary: 'chest', secondary: ['shoulders', 'triceps'], pattern: 'horizontal_push', alternatives: ['assisted_dip', 'chest_press_machine'] }),
  phase5Exercise({ id: 'single_arm_db_row', name: 'Single-Arm DB Row', primary: 'back', secondary: ['biceps', 'rear_delts'], pattern: 'horizontal_pull', alternatives: ['seated_cable_row', 'tbar_row'] }),
  phase5Exercise({ id: 'bayesian_cable_curl', name: 'Bayesian Cable Curl', primary: 'biceps', secondary: ['forearms'], pattern: 'isolation_pull', alternatives: ['hammer_curl', 'db_incline_curl'] }),
  phase5Exercise({ id: 'cable_reverse_flye', name: 'Cable Reverse Flye', primary: 'rear_delts', secondary: ['upper_back'], pattern: 'isolation_pull', alternatives: ['rear_delt_fly', 'face_pull'] }),
  phase5Exercise({ id: 'db_single_leg_hip_thrust', name: 'DB Single-Leg Hip Thrust', primary: 'glutes', secondary: ['hamstrings'], pattern: 'compound_hinge', alternatives: ['hip_thrust', 'leg_extension_machine_hip_thrust'] }),
  phase5Exercise({ id: 'leg_extension_machine_hip_thrust', name: 'Leg-Extension-Machine Hip Thrust', primary: 'glutes', secondary: ['hamstrings'], pattern: 'compound_hinge', alternatives: ['hip_thrust', 'db_single_leg_hip_thrust'] }),
  phase5Exercise({ id: 'db_leg_curl', name: 'DB Leg Curl', primary: 'hamstrings', secondary: ['glutes'], pattern: 'isolation_hamstring', alternatives: ['seated_leg_curl', 'prone_leg_curl'] }),
  phase5Exercise({ id: 'reverse_lunge', name: 'Reverse Lunge', primary: 'quads', secondary: ['glutes'], pattern: 'compound_quad' }),
  phase5Exercise({ id: 'db_step_up', name: 'DB Step-Up', primary: 'quads', secondary: ['glutes'], pattern: 'compound_quad', alternatives: ['db_walking_lunge'] }),
  phase5Exercise({ id: 'reverse_crunch', name: 'Reverse Crunch', primary: 'abs', pattern: 'isolation_core', alternatives: ['hanging_leg_raise', 'roman_chair_crunch'] }),
  phase5Exercise({ id: 'roman_chair_crunch', name: 'Roman Chair Crunch', primary: 'abs', pattern: 'isolation_core', alternatives: ['hanging_leg_raise', 'reverse_crunch'] }),
  phase5Exercise({ id: 'ez_bar_skull_crusher', name: 'EZ Bar Skull Crusher', primary: 'triceps', pattern: 'isolation_push' }),
  phase5Exercise({ id: 'plate_weighted_crunch', name: 'Plate-Weighted Crunch', primary: 'abs', pattern: 'isolation_core' }),
);

// ---- v15 programme archive (not exported or scheduled) ------
// Block 1 (Weeks 1-4) = trimmed full-body for calibration.
// Block 2 (Weeks 5-8) = adds volume + RDL + pec deck.
// Block 3 (Weeks 9-12) = peak. Week 12 = deload.
//
// Format per session: { day, name, exercises: [{exercise_id, sets, reps, start_kg, rpe, is_first_of_muscle}] }
// `is_first_of_muscle` triggers the warmup prompt.
const PROGRAMME_V15_FULLBODY_ARCHIVE = {
  block: 1,
  block_name: 'Block 1 — Re-entry (Weeks 1–4)',
  weeks: 4,
  notes: [
    'Compound ramps: 2 sets (50% × 6–10, 70% × 4–6). Isolation: 1 set at 60% or none. Repeated movement patterns get no ramp.',
    'Completed reps drive progression. Final-set effort is only a brake: very hard blocks an earned increase; easy can land one reps-earned increase one exposure sooner.',
    'Add load after every working set reaches the top of its rep range in 2 consecutive sessions; deterministic safety clamps decide the final weight.',
    'Weeks 1–2 are a re-entry ramp. Start from logged history when it exists; do not deliberately under-load a detrained lifter.',
    'No barbell back squat or conventional deadlift yet. Romanian Deadlift introduced in Block 2.',
  ],
  sessions: [
    {
      id: 'session_a',
      day: 'Tuesday',
      name: 'Session A — Quad-dominant + horizontal push + vertical pull',
      mood: 'Focused. Heavy compounds early. Build, don\'t grind.',
      playlists: {
        spotify: [
          { label: 'Beast Mode',        url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', vibe: 'Hip-hop heavy, classics' },
          { label: 'Power Workout',     url: 'https://open.spotify.com/playlist/37i9dQZF1DX35oM5SPECmN', vibe: 'High BPM, pump' },
          { label: 'Workout Twerkout',  url: 'https://open.spotify.com/playlist/37i9dQZF1DWUVpAXiEPK8P', vibe: 'Rap, deep groove' },
        ],
        youtube_music: [
          { label: 'Workout — Heavy Lifting', url: 'https://music.youtube.com/search?q=heavy+lifting+workout+playlist', vibe: 'Search; pick algorithm' },
          { label: 'Hip-Hop Gym',             url: 'https://music.youtube.com/search?q=hip+hop+gym+playlist', vibe: 'Rap, focus' },
          { label: 'Hard Rap Workout',        url: 'https://music.youtube.com/search?q=hard+rap+workout', vibe: 'Aggressive' },
        ],
        apple_music: [
          { label: 'Pure Workout',   url: 'https://music.apple.com/us/playlist/pure-workout/pl.b5e8e7b97d404cffb7b0be9b9c9d84f7', vibe: 'Curated bangers' },
          { label: 'Hip-Hop Workout', url: 'https://music.apple.com/us/playlist/hip-hop-workout/pl.45eb2cdec7c647519ad1e25c9d041b9f', vibe: 'Rap-driven' },
          { label: 'Pump Up',         url: 'https://music.apple.com/us/playlist/pump-up/pl.d77b5b47abc545f9b6dd7ca99e7ecf9b', vibe: 'High energy' },
        ],
      },
      exercises: [
        { exercise_id: 'leg_press',            sets: 3, reps: '8-10',  start_kg: 60,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 30kg×10, 40kg×6' },
        { exercise_id: 'incline_chest_press',  sets: 3, reps: '8-10',  start_kg: 25,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 12.5kg×10, 17.5kg×6' },
        { exercise_id: 'lat_pulldown',         sets: 3, reps: '8-10',  start_kg: 30,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 15kg×10, 20kg×6' },
        { exercise_id: 'leg_extension',        sets: 3, reps: '10-12', start_kg: 17.5, rpe: '7-8', is_first_of_muscle: false },
        { exercise_id: 'lateral_raise_db',     sets: 3, reps: '10-12', start_kg: 4,    rpe: '8',   is_first_of_muscle: true,  warmup: '1 light set' },
      ],
    },
    {
      id: 'session_b',
      day: 'Saturday',
      name: 'Session B — Hip-dominant + horizontal push + vertical pull variant',
      mood: 'Weekend energy. Glutes lead. Slower tempo, more time under tension.',
      playlists: {
        spotify: [
          { label: 'Mood Booster',  url: 'https://open.spotify.com/playlist/37i9dQZF1DX3rxVfibe1L0', vibe: 'Upbeat, less aggressive' },
          { label: 'Rock Hard',     url: 'https://open.spotify.com/playlist/37i9dQZF1DWWJOmJ7nRx0C', vibe: 'Rock for hip thrusts' },
          { label: 'Locker Room',   url: 'https://open.spotify.com/playlist/37i9dQZF1DX6n3yo7jHCsj', vibe: 'Tempo, steady' },
        ],
        youtube_music: [
          { label: 'Mood Booster',     url: 'https://music.youtube.com/search?q=mood+booster+workout', vibe: 'Upbeat search' },
          { label: 'Workout Rock',     url: 'https://music.youtube.com/search?q=workout+rock+playlist', vibe: 'Rock energy' },
          { label: 'Pop Workout',      url: 'https://music.youtube.com/search?q=pop+workout+playlist', vibe: 'Upbeat pop' },
        ],
        apple_music: [
          { label: 'Pop Workout',     url: 'https://music.apple.com/us/playlist/pop-workout/pl.bdbb1395ec1843ada06afde26ed30734', vibe: 'Pop bangers' },
          { label: 'Rock Workout',    url: 'https://music.apple.com/us/playlist/rock-workout/pl.6125c1ca00794c4a930d72aaadbc55f0', vibe: 'Rock-driven' },
          { label: 'Cardio',          url: 'https://music.apple.com/us/playlist/cardio/pl.0adfb46c0b984e3e8a3d2ac5e3066d6e', vibe: 'Steady BPM' },
        ],
      },
      exercises: [
        { exercise_id: 'hip_thrust',           sets: 3, reps: '8-10',  start_kg: 20,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 10kg×10, 12.5kg×6' },
        { exercise_id: 'chest_press_machine',  sets: 3, reps: '8-10',  start_kg: 25,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 12.5kg×10, 17.5kg×6' },
        { exercise_id: 'lat_pulldown_neutral', sets: 3, reps: '8-10',  start_kg: 30,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 15kg×10, 20kg×6' },
        { exercise_id: 'prone_leg_curl',       sets: 3, reps: '10-12', start_kg: 10,   rpe: '7-8', is_first_of_muscle: true,  warmup: '1 light set' },
        { exercise_id: 'face_pull',            sets: 3, reps: '10-12', start_kg: 10,   rpe: '8',   is_first_of_muscle: true,  warmup: '0 sets — go straight in' },
      ],
    },
  ],
};

// ---- v15 PPL archive (not exported or scheduled) -------------
const PROGRAMME_V15_PPL_ARCHIVE = {
  block: 1,
  block_name: 'Block 1 — Re-entry (Weeks 1–4) — PPL 3×',
  weeks: 4,
  notes: [
    'Same re-entry rules as full-body. Completed reps lead; final-set effort can only slow an earned increase. No grind.',
    'Pick any 3 days that give 24h+ rest between adjacent sessions (Sat/Mon/Wed works well).',
    'Order is fixed: Push → Pull → Legs. Loop. The app shows what\'s next based on history, not day-of-week.',
    'Romanian Deadlift introduced Block 2. No barbell back squat in Block 1.',
  ],
  sessions: [
    {
      id: 'ppl_push',
      day: 'Push',
      name: 'Push — Chest, shoulders, triceps',
      mood: 'Big presses first. Save shoulders + tris for the back half.',
      playlists: {
        spotify: [
          { label: 'Beast Mode',        url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', vibe: 'Hip-hop heavy' },
          { label: 'Power Workout',     url: 'https://open.spotify.com/playlist/37i9dQZF1DX35oM5SPECmN', vibe: 'High BPM' },
        ],
        youtube_music: [
          { label: 'Heavy Lifting',     url: 'https://music.youtube.com/search?q=heavy+lifting+workout+playlist', vibe: 'Search' },
          { label: 'Hip-Hop Gym',       url: 'https://music.youtube.com/search?q=hip+hop+gym+playlist', vibe: 'Rap focus' },
        ],
        apple_music: [
          { label: 'Pure Workout',      url: 'https://music.apple.com/us/playlist/pure-workout/pl.b5e8e7b97d404cffb7b0be9b9c9d84f7', vibe: 'Curated' },
          { label: 'Pump Up',           url: 'https://music.apple.com/us/playlist/pump-up/pl.d77b5b47abc545f9b6dd7ca99e7ecf9b', vibe: 'High energy' },
        ],
      },
      exercises: [
        { exercise_id: 'incline_chest_press',  sets: 3, reps: '8-10',   start_kg: 25,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 12.5kg×10, 17.5kg×6' },
        { exercise_id: 'chest_press_machine',  sets: 3, reps: '8-10',   start_kg: 25,   rpe: '7-8', is_first_of_muscle: false, warmup: '0 sets — chest is warm' },
        { exercise_id: 'shoulder_press_machine', sets: 3, reps: '8-10', start_kg: 7.5,  rpe: '7-8', is_first_of_muscle: true,  warmup: '1 light set' },
        { exercise_id: 'lateral_raise_db',     sets: 3, reps: '10-12',  start_kg: 4,    rpe: '8',   is_first_of_muscle: false },
        { exercise_id: 'tricep_pushdown',      sets: 3, reps: '10-12',  start_kg: 15,   rpe: '8',   is_first_of_muscle: true,  warmup: '0 sets' },
      ],
    },
    {
      id: 'ppl_pull',
      day: 'Pull',
      name: 'Pull — Back, rear delts, biceps',
      mood: 'Squeeze every rep. Slow eccentric. Pull with your back, not your arms.',
      playlists: {
        spotify: [
          { label: 'Workout Twerkout', url: 'https://open.spotify.com/playlist/37i9dQZF1DWUVpAXiEPK8P', vibe: 'Rap, deep groove' },
          { label: 'Power Workout',    url: 'https://open.spotify.com/playlist/37i9dQZF1DX35oM5SPECmN', vibe: 'High BPM' },
        ],
        youtube_music: [
          { label: 'Pull Day',         url: 'https://music.youtube.com/search?q=pull+day+workout', vibe: 'Search' },
          { label: 'Hip-Hop Gym',      url: 'https://music.youtube.com/search?q=hip+hop+gym+playlist', vibe: 'Rap' },
        ],
        apple_music: [
          { label: 'Hip-Hop Workout',  url: 'https://music.apple.com/us/playlist/hip-hop-workout/pl.45eb2cdec7c647519ad1e25c9d041b9f', vibe: 'Rap-driven' },
        ],
      },
      exercises: [
        { exercise_id: 'lat_pulldown',         sets: 3, reps: '8-10',   start_kg: 30,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 15kg×10, 20kg×6' },
        { exercise_id: 'seated_cable_row',     sets: 3, reps: '8-10',   start_kg: 25,   rpe: '7-8', is_first_of_muscle: false, warmup: '1 light set' },
        { exercise_id: 'face_pull',            sets: 3, reps: '10-12',  start_kg: 10,   rpe: '8',   is_first_of_muscle: true,  warmup: '0 sets' },
        { exercise_id: 'biceps_curl',          sets: 3, reps: '10-12',  start_kg: 5,    rpe: '8',   is_first_of_muscle: true,  warmup: '0 sets' },
        { exercise_id: 'hammer_curl',          sets: 3, reps: '10-12',  start_kg: 4,    rpe: '8',   is_first_of_muscle: false },
      ],
    },
    {
      id: 'ppl_legs',
      day: 'Legs',
      name: 'Legs — Quads, glutes, hamstrings, calves',
      mood: 'Long session. Pace yourself. The pump on this day is real.',
      playlists: {
        spotify: [
          { label: 'Beast Mode',       url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', vibe: 'Hip-hop heavy' },
          { label: 'Locker Room',      url: 'https://open.spotify.com/playlist/37i9dQZF1DX6n3yo7jHCsj', vibe: 'Tempo' },
        ],
        youtube_music: [
          { label: 'Leg Day',          url: 'https://music.youtube.com/search?q=leg+day+workout', vibe: 'Search' },
          { label: 'Heavy Lifting',    url: 'https://music.youtube.com/search?q=heavy+lifting+workout+playlist', vibe: 'Search' },
        ],
        apple_music: [
          { label: 'Pure Workout',     url: 'https://music.apple.com/us/playlist/pure-workout/pl.b5e8e7b97d404cffb7b0be9b9c9d84f7', vibe: 'Curated' },
        ],
      },
      exercises: [
        { exercise_id: 'leg_press',            sets: 3, reps: '8-10',   start_kg: 60,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 30kg×10, 40kg×6' },
        { exercise_id: 'leg_extension',        sets: 3, reps: '10-12',  start_kg: 17.5, rpe: '7-8', is_first_of_muscle: false, warmup: '0 sets — quads warm' },
        { exercise_id: 'hip_thrust',           sets: 3, reps: '8-10',   start_kg: 20,   rpe: '7',   is_first_of_muscle: true,  warmup: '2 sets: 10kg×10, 12.5kg×6' },
        { exercise_id: 'prone_leg_curl',       sets: 3, reps: '10-12',  start_kg: 10,   rpe: '7-8', is_first_of_muscle: true,  warmup: '1 light set' },
        { exercise_id: 'standing_calf',        sets: 3, reps: '10-12',  start_kg: 25,   rpe: '8',   is_first_of_muscle: true,  warmup: '0 sets' },
      ],
    },
  ],
};

// ---- Phase 5 Upper/Lower programme --------------------------
// §8.4 is transcribed by exact catalogue name/alias only. This is not a fuzzy
// matcher: an absent source name throws while data.js loads, and the Phase 5
// crosswalk test pins the two dangerous non-pairings separately.
const catalogueIdFor = (sourceName) => {
  const exercise = EXERCISES.find((entry) => entry.name === sourceName || (entry.aliases || []).includes(sourceName));
  if (!exercise) throw new Error(`Phase 5 programme references an unmapped catalogue source: ${sourceName}`);
  return exercise.id;
};

const rawProgrammeRow = (order, exercise, ramp_sets, work_sets, rep_lo, rep_hi, rpe, rest_min, superset_group, sub1, sub2) => ({
  order,
  exercise,
  ramp_sets,
  work_sets,
  rep_lo,
  rep_hi,
  rpe_set1: rpe[0],
  rpe_set2: rpe[1],
  rpe_set3: rpe[2] ?? null,
  rest_min,
  superset_group: superset_group || null,
  sub1,
  sub2,
});

const programmeRow = (source) => ({
  ...source,
  exercise_id: catalogueIdFor(source.exercise),
  sub1_label: source.sub1,
  sub2_label: source.sub2,
  sub1: catalogueIdFor(source.sub1),
  sub2: catalogueIdFor(source.sub2),
  // v16 runner compatibility while it transitions to the explicit columns.
  sets: source.work_sets,
  reps: `${source.rep_lo}-${source.rep_hi}`,
  rpe: [source.rpe_set1, source.rpe_set2, source.rpe_set3].filter((value) => value != null).join(' / '),
});

const UPPER_LOWER_SESSION_ORDER = ['upper_a', 'lower_a', 'upper_b', 'lower_b'];
const UPPER_LOWER_SESSION_META = {
  upper_a: { name: 'Upper A', warmup_type: 'upper', mood: 'Big presses first. Save shoulders and arms for the second half.' },
  lower_a: { name: 'Lower A', warmup_type: 'lower', mood: 'Start heavy on legs. Deadlift cleanly, not heavier.' },
  upper_b: { name: 'Upper B', warmup_type: 'upper', mood: 'Incline first while fresh. More pulling than pressing today.' },
  lower_b: { name: 'Lower B', warmup_type: 'lower', mood: 'Squat and hips lead today. The rest completes, not exhausts.' },
};
// All three platforms, because the picker offers all three.
//
// v15 carried spotify / youtube_music / apple_music per session. v16 ported only
// Spotify, and the Settings picker kept offering the other two — so choosing
// Apple Music or YouTube Music silently fell back to Spotify. Raed found this
// himself: "إذا غيرت مصدر الموسيقى بالإعدادات ما يتغير". A control that offers a
// choice and ignores it is worse than not offering it.
//
// Spotify keeps its curated playlist links, which are stable public Spotify
// editorial IDs. The other two use SEARCH urls on purpose: v15's Apple Music
// entries were hardcoded playlist GUIDs that nobody has verified since, and a
// dead link in a gym is worse than a search that always resolves. Same reasoning
// as D8 for videos — an honest search beats a confident broken link.
const UPPER_LOWER_PLAYLISTS = {
  spotify: [
    { label: 'Beast Mode', url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', vibe: 'Hip-hop heavy' },
    // These are the two v15 Spotify chips Raed approved for the Home card.
    // Keep Spotify's literal title and link, rather than translating either.
    { label: 'Power Workout', url: 'https://open.spotify.com/playlist/37i9dQZF1DX35oM5SPECmN', vibe: 'High BPM' },
  ],
  youtube_music: [
    { label: 'Heavy Lifting', url: 'https://music.youtube.com/search?q=heavy+lifting+workout+playlist', vibe: 'Hip-hop heavy' },
    { label: 'Hard Rap Workout', url: 'https://music.youtube.com/search?q=hard+rap+workout+playlist', vibe: 'High BPM' },
  ],
  apple_music: [
    { label: 'Pure Workout', url: 'https://music.apple.com/sa/search?term=pure%20workout', vibe: 'Hip-hop heavy' },
    { label: 'Pump Up', url: 'https://music.apple.com/sa/search?term=pump%20up%20workout', vibe: 'High BPM' },
  ],
};

const UPPER_LOWER_BLOCK_A_ROWS = {
  upper_a: [
    rawProgrammeRow(1, 'Machine Chest Press', 2, 3, 8, 10, [7, 7, 8], 2.5, null, 'Flat DB Press', 'Hammer Strength Press'),
    rawProgrammeRow(2, 'Neutral-Grip Lat Pulldown', 2, 3, 10, 12, [7, 8, 8], 2.5, null, '2-Grip Lat Pulldown', 'Machine Pulldown'),
    rawProgrammeRow(3, 'Seated DB Shoulder Press', 1, 3, 10, 12, [7, 8, 8], 2.0, null, 'Machine Shoulder Press', 'Standing DB Press'),
    rawProgrammeRow(4, 'Chest-Supported T-Bar Row', 1, 3, 10, 12, [7, 8, 8], 2.0, null, 'Chest-Supported DB Row', 'Machine Row'),
    rawProgrammeRow(5, 'DB Supinated Curl', 1, 2, 10, 12, [8, 8], 0.0, 'A1', 'Cable EZ Curl', 'EZ Bar Curl'),
    rawProgrammeRow(6, 'Single-Arm Rope Triceps Extension', 1, 2, 10, 12, [8, 8], 1.5, 'A2', 'Triceps Pressdown', 'Overhead Cable Extension'),
    rawProgrammeRow(7, 'Cable Lateral Raise', 1, 3, 10, 12, [8, 8, 9], 1.5, null, 'Machine Lateral Raise', 'DB Lateral Raise'),
  ],
  lower_a: [
    rawProgrammeRow(1, 'Leg Press', 2, 3, 10, 12, [7, 7, 8], 2.5, null, 'Machine Squat', 'Hack Squat'),
    rawProgrammeRow(2, 'DB Romanian Deadlift', 2, 3, 10, 12, [7, 7, 8], 2.5, null, 'Barbell RDL', '45 Degree Hyperextension'),
    rawProgrammeRow(3, 'Lying Leg Curl', 1, 3, 10, 12, [8, 8, 8], 1.5, null, 'Seated Leg Curl', 'Glute-Ham Raise'),
    rawProgrammeRow(4, 'Leg Extension', 1, 3, 10, 12, [8, 8, 9], 1.5, null, 'Single-Leg Leg Extension', 'Goblet Squat'),
    rawProgrammeRow(5, 'Standing Calf Raise', 1, 3, 10, 12, [8, 8, 9], 0.0, 'A1', 'DB Standing Calf Raise', 'Leg Press Toe Press'),
    rawProgrammeRow(6, 'Cable Crunch', 0, 3, 10, 12, [8, 8, 9], 1.5, 'A2', 'Machine Crunch', 'Crunch'),
  ],
  upper_b: [
    rawProgrammeRow(1, 'DB Incline Press', 2, 3, 8, 10, [7, 7, 8], 2.5, null, 'Machine Incline Press', 'Incline Smith Press'),
    rawProgrammeRow(2, 'Reverse-Grip Lat Pulldown', 2, 3, 10, 12, [7, 8, 8], 2.5, null, 'Reverse-Grip Assisted Pull-up', 'Single-Arm Pulldown'),
    rawProgrammeRow(3, 'Assisted Dip', 1, 3, 10, 12, [7, 8, 8], 2.0, null, 'Decline DB Press', 'Machine Chest Press'),
    rawProgrammeRow(4, 'Seated Cable Row', 1, 3, 10, 12, [7, 8, 8], 2.0, null, 'Single-Arm DB Row', 'Chest-Supported T-Bar Row'),
    rawProgrammeRow(5, 'DB Lateral Raise', 1, 3, 10, 12, [8, 8, 9], 0.0, 'A1', 'Cable Lateral Raise', 'Machine Lateral Raise'),
    rawProgrammeRow(6, 'Hammer Curl', 1, 3, 10, 12, [8, 8, 8], 1.5, 'A2', 'DB Incline Curl', 'Bayesian Cable Curl'),
    rawProgrammeRow(7, 'Reverse Pec Deck', 1, 2, 10, 12, [8, 9], 1.5, null, 'Seated Face Pull', 'Cable Reverse Flye'),
  ],
  lower_b: [
    rawProgrammeRow(1, 'Goblet Squat', 2, 3, 10, 12, [7, 7, 8], 2.5, null, 'Hack Squat', 'Leg Press'),
    rawProgrammeRow(2, 'Barbell Hip Thrust', 2, 3, 10, 12, [7, 7, 8], 2.5, null, 'DB Single-Leg Hip Thrust', 'Leg-Extension-Machine Hip Thrust'),
    rawProgrammeRow(3, 'Seated Leg Curl', 1, 3, 10, 12, [8, 8, 8], 1.5, null, 'Lying Leg Curl', 'DB Leg Curl'),
    rawProgrammeRow(4, 'DB Walking Lunge', 1, 3, 10, 10, [7, 8, 8], 2.0, null, 'Reverse Lunge', 'DB Step-Up'),
    rawProgrammeRow(5, 'Seated Calf Raise', 1, 3, 10, 12, [8, 8, 9], 0.0, 'A1', 'Leg Press Toe Press', 'Standing Calf Raise'),
    rawProgrammeRow(6, 'Hanging Leg Raise', 0, 3, 10, 12, [8, 8, 9], 1.5, 'A2', 'Reverse Crunch', 'Roman Chair Crunch'),
  ],
};

const blockBEffortOverlay = (row) => {
  const compound = row.rpe_set1 === 7;
  return {
    ...row,
    rpe_set1: compound ? 7 : 8,
    rpe_set2: compound ? 8 : 9,
    rpe_set3: row.rpe_set3 == null ? null : (compound ? 8 : 9),
  };
};

// §8.2 lists changed rows only. Every other row below first receives the
// Block-B effort overlay, then remains otherwise identical to Block A.
const UPPER_LOWER_BLOCK_B_OVERRIDES = {
  upper_a: {
    // D18 overrides `20` §8.2's rep-band drop here: 6–8 would put a compound below 8,
    // and D18 is Raed's locked "ما ننزل عن ثمانية للمركبات". The lower-body first
    // exercises still drop 10–12 → 8–10, which honours the intent without breaking the rule.
    1: rawProgrammeRow(1, 'Machine Chest Press', 2, 3, 8, 10, [7, 8, 8], 2.5, null, 'Flat DB Press', 'Hammer Strength Press'),
    5: rawProgrammeRow(5, 'EZ Bar Curl', 1, 2, 10, 12, [8, 9], 0.0, 'A1', 'Cable EZ Curl', 'DB Supinated Curl'),
    6: rawProgrammeRow(6, 'Overhead Cable Triceps Extension', 1, 2, 10, 12, [8, 9], 1.5, 'A2', 'EZ Bar Skull Crusher', 'Triceps Pressdown'),
    7: rawProgrammeRow(7, 'Machine Lateral Raise', 1, 3, 10, 12, [8, 9, 9], 1.5, null, 'Cable Lateral Raise', 'DB Lateral Raise'),
  },
  lower_a: {
    1: rawProgrammeRow(1, 'Leg Press', 2, 3, 8, 10, [7, 8, 8], 2.5, null, 'Machine Squat', 'Hack Squat'),
    4: rawProgrammeRow(4, 'Single-Leg Leg Extension', 1, 3, 10, 12, [8, 9, 9], 1.5, null, 'Leg Extension', 'Goblet Squat'),
    6: rawProgrammeRow(6, 'Bicycle Crunch', 0, 3, 10, 12, [8, 9, 9], 1.5, 'A2', 'Cable Crunch', 'Machine Crunch'),
  },
  upper_b: {
    // D18, same as upper_a above: 6–8 is below Raed's locked compound floor of 8.
    1: rawProgrammeRow(1, 'DB Incline Press', 2, 3, 8, 10, [7, 8, 8], 2.5, null, 'Machine Incline Press', 'Incline Smith Press'),
    5: rawProgrammeRow(5, 'Cable Lateral Raise', 1, 3, 10, 12, [8, 9, 9], 0.0, 'A1', 'Machine Lateral Raise', 'DB Lateral Raise'),
    6: rawProgrammeRow(6, 'DB Incline Curl', 1, 3, 10, 12, [8, 9, 9], 1.5, 'A2', 'Hammer Curl', 'Bayesian Cable Curl'),
    7: rawProgrammeRow(7, 'Seated Face Pull', 1, 2, 10, 12, [8, 9], 1.5, null, 'Reverse Pec Deck', 'Cable Reverse Flye'),
  },
  lower_b: {
    1: rawProgrammeRow(1, 'Goblet Squat', 2, 3, 8, 10, [7, 8, 8], 2.5, null, 'Hack Squat', 'Leg Press'),
    5: rawProgrammeRow(5, 'Leg Press Toe Press', 1, 3, 10, 12, [8, 9, 9], 0.0, 'A1', 'Seated Calf Raise', 'Standing Calf Raise'),
    6: rawProgrammeRow(6, 'Machine Crunch', 0, 3, 10, 12, [8, 9, 9], 1.5, 'A2', 'Plate-Weighted Crunch', 'Hanging Leg Raise'),
  },
};

const programmeSessionsFrom = (rowsBySession) => UPPER_LOWER_SESSION_ORDER.map((id) => ({
  id,
  ...UPPER_LOWER_SESSION_META[id],
  playlists: UPPER_LOWER_PLAYLISTS,
  exercises: rowsBySession[id].map(programmeRow),
}));

// The week-12 backstop deload, and it is not optional.
//
// `research/06-beginner-protocol.md` §7.2 ruled on this explicitly:
//
//   "No scheduled deload in the first block. Deload on trigger, with a week-12
//    backstop."
//   "if no deload has fired by week 12, take one anyway. That is [LADDER]'s own
//    stated maximum interval and it prevents a purely trigger-based rule from
//    running indefinitely."
//
// The programme stopped at week 8, and derivedWeek() clamped there, so week 12
// was unreachable and that backstop could never fire. Raed would have trained
// indefinitely with no deload at all — repeating Block B for ever.
//
// Contents are the sourced numbers, §7.4, all from [LADDER] L9821-9829:
//   volume  3 sets -> 2, 2 sets -> 1   ("cutting one or two sets per exercise")
//   effort  about two RPE points off   (compounds 8/9/9 -> 6/7/7,
//                                       isolation 9/9/10 -> 7/7/8)
//   load    unchanged — "keep the same weight, take the RPE cut instead"
// Same exercises, per L9842. It is a technique week, not a week off.
const DELOAD_RPE_FLOOR = 6;
const deloadOverlay = (row) => {
  const cut = (value) => (value == null ? null : Math.max(DELOAD_RPE_FLOOR, value - 2));
  return {
    ...row,
    work_sets: Math.max(1, (row.work_sets || 1) - 1),
    rpe_set1: cut(row.rpe_set1),
    rpe_set2: cut(row.rpe_set2),
    rpe_set3: null,          // the third working set is the one that goes
    deload: true,
  };
};

const UPPER_LOWER_BLOCK_A_SESSIONS = programmeSessionsFrom(UPPER_LOWER_BLOCK_A_ROWS);
const UPPER_LOWER_BLOCK_B_SESSIONS = programmeSessionsFrom(Object.fromEntries(
  UPPER_LOWER_SESSION_ORDER.map((sessionId) => [sessionId, UPPER_LOWER_BLOCK_A_ROWS[sessionId].map((row) =>
    UPPER_LOWER_BLOCK_B_OVERRIDES[sessionId]?.[row.order] || blockBEffortOverlay(row)
  )]),
));

const UPPER_LOWER_BLOCK_B_ROWS = Object.fromEntries(
  UPPER_LOWER_SESSION_ORDER.map((sessionId) => [sessionId, UPPER_LOWER_BLOCK_A_ROWS[sessionId].map((row) =>
    UPPER_LOWER_BLOCK_B_OVERRIDES[sessionId]?.[row.order] || blockBEffortOverlay(row)
  )]),
);
// Weeks 9-11 keep Block B's prescription: [LADDER] L9842 says a deload uses the
// SAME exercises, and nothing in the sources calls for a fourth exercise
// rotation before the deload. What changes in week 12 is volume and effort.
const UPPER_LOWER_BLOCK_C_SESSIONS = programmeSessionsFrom(UPPER_LOWER_BLOCK_B_ROWS);
const UPPER_LOWER_DELOAD_SESSIONS = programmeSessionsFrom(Object.fromEntries(
  UPPER_LOWER_SESSION_ORDER.map((sessionId) => [sessionId, UPPER_LOWER_BLOCK_B_ROWS[sessionId].map(deloadOverlay)]),
));

const PROGRAMME = {
  id: 'upper_lower',
  block: 1,
  block_name: 'Upper/Lower — Block A (Weeks 1–4)',
  weeks: 12,   // a full mesocycle: A(1-4) B(5-8) C(9-11) deload(12)
  rotation_order: UPPER_LOWER_SESSION_ORDER,
  weekly_layout: ['upper_a', 'lower_a', 'rest', 'upper_b', 'lower_b', 'rest', 'rest'],
  three_day_fallback: {
    sessions_per_week: 3,
    rule: 'Continue the same session rotation; do not reshuffle the split.',
  },
  notes: [
    'The next session is selected from completed-session history, never from the weekday.',
    'Block B retains the same primary compounds and rotates only the listed isolation slots.',
    // D13 + D19. The port dropped this and the phase-2 test caught it: Raed is
    // detrained, not untrained, so first loads come from his logged history where it
    // exists and the probe is only the fallback. Weeks 1-2 are a re-entry ramp that
    // caps effort and eccentric volume — it does not withhold load.
    'Seed each first working weight from logged history where it exists; the ramp probe is the fallback, not the default.',
    'Weeks 1–2 are a re-entry ramp: cap effort and eccentric volume, never deliberately under-load a detrained lifter.',
  ],
  sessions: UPPER_LOWER_BLOCK_A_SESSIONS,
  blocks: [
    { id: 'A', block: 1, week_start: 1, week_end: 4, block_name: 'Upper/Lower — Block A (Weeks 1–4)', sessions: UPPER_LOWER_BLOCK_A_SESSIONS },
    { id: 'B', block: 2, week_start: 5, week_end: 8, block_name: 'Upper/Lower — Block B (Weeks 5–8)', sessions: UPPER_LOWER_BLOCK_B_SESSIONS },
    { id: 'C', block: 3, week_start: 9, week_end: 11, block_name: 'Upper/Lower — Block C (Weeks 9–11)', sessions: UPPER_LOWER_BLOCK_C_SESSIONS },
    { id: 'DELOAD', block: 4, week_start: 12, week_end: 12, block_name: 'Deload Week (Week 12)', deload: true, sessions: UPPER_LOWER_DELOAD_SESSIONS },
  ],
};

// ---- v16 session warm-up phases -----------------------------
// The general phase is deliberately short: treadmill first, then ten-rep
// drills, then each exercise's own ramp rows. Upper never includes leg drills.
// Warm-up drills carry a `videos` array like the catalogue exercises do. It was
// missing entirely, so there was nowhere for a warm-up demo to live and no way
// for Raed to add one. Empty until he fills warmup-picker.html — a blank beats a
// guessed clip (D8), and these are the movements he is least sure of.
const SESSION_WARMUPS = {
  upper: {
    cap_minutes: 15,
    treadmill_minutes: [5, 7, 10],
    drills: [
      { id: 'arm_swings', movement: 'Arm swings', reps: 10, videos: ['https://youtube.com/shorts/lzR7tzI1JUI'] },
      { id: 'arm_circles', movement: 'Arm circles', reps: 10, videos: ['https://youtube.com/shorts/XTbPqeswd-Y'] },
      { id: 'cable_external_rotation', movement: 'Cable external rotation', reps: 10, videos: ['https://youtu.be/n17FcALDB60'] },
      { id: 'cable_internal_rotation', movement: 'Cable internal rotation', reps: 10, videos: ['https://youtube.com/shorts/kBhQ4B7rl0w'] },
    ],
  },
  lower: {
    cap_minutes: 15,
    treadmill_minutes: [5, 7, 10],
    drills: [
      { id: 'arm_swings', movement: 'Arm swings', reps: 10, videos: ['https://youtube.com/shorts/lzR7tzI1JUI'] },
      { id: 'arm_circles', movement: 'Arm circles', reps: 10, videos: ['https://youtube.com/shorts/XTbPqeswd-Y'] },
      // Raed asked for bodyweight squats in the leg warm-up, and not as an
      // option: "مو optional، حط squatting". Before the swings, so the knees and
      // hips move through full range before anything ballistic.
      { id: 'bodyweight_squat', movement: 'Bodyweight squat', reps: 10, videos: ['https://youtube.com/shorts/n_xLyzPEX7A'] },
      { id: 'front_back_leg_swings', movement: 'Front/back leg swings', reps: 10, videos: ['https://youtube.com/shorts/ya7xU4Obypg'] },
      { id: 'side_side_leg_swings', movement: 'Side/side leg swings', reps: 10, videos: ['https://youtube.com/shorts/fDZozdHbXww'] },
      { id: 'cable_external_rotation', movement: 'Cable external rotation', reps: 10, videos: ['https://youtu.be/n17FcALDB60'] },
      { id: 'cable_internal_rotation', movement: 'Cable internal rotation', reps: 10, videos: ['https://youtube.com/shorts/kBhQ4B7rl0w'] },
    ],
  },
};

// ---- Athlete profile (from SKILL.md) ------------------------
const ATHLETE = {
  name: 'Raed',
  goal: 'Body recomposition — muscle gain + fat loss',
  experience: 'Detrained lifter returning after a 2-year layoff',
  schedule: 'Tuesday + Saturday AM',
  session_cap_min: 80,
  bodyweight_kg: 82,
  protein_target_g: '130–160',
  injuries: 'None confirmed',
  supplements: ['Creatine', 'Lion\'s Mane', 'Vitamin D', 'Fish liver oil'],
  chest_priority: true,
  rules: [
    'Never grind to failure on Block 1.',
    'Technique > weight. Always.',
    'No barbell back squat or conventional deadlift until form review.',
    'Eat 130–160g protein/day or training does nothing.',
    'Sleep ≥7h or skip the gym — under-recovered training is just damage.',
  ],
};

const FAMILY_PROFILES = [
  { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', bodyweight_kg: 82, allowlisted: true },
  { user_id: 'bassam', display_name: 'Bassam', experience: 'returning', bodyweight_kg: null, allowlisted: true },
  { user_id: 'abdullah', display_name: 'Abdullah', experience: 'beginner', bodyweight_kg: null, allowlisted: true },
];

// ---- Motivational end-of-session messages -------------------
// Rotate one per session. Mix of recovery/nutrition/process reminders.
const MOTIVATIONAL_MESSAGES = [
  'بروتين اليوم: 130–160 جم. لا تنام قبل ما تحسب.',
  'نوم ≥ 7 ساعات الليلة. النوم هو اللي يبني، مش الجلسة.',
  'اشرب 2 لتر ماء قبل الغروب. الجفاف يقلل القوة 10%.',
  'مشي 8000 خطوة يوم الراحة. NEAT أهم من الكارديو.',
  'لا تزن نفسك يومياً. يوم في الأسبوع، صباحاً، ريق.',
  'لو كنت متعب اليوم، يومين راحة أحسن من جلسة سيئة.',
  'الـ creatine اليومية: 5 جم. ما تفرق متى تأخذها.',
  'القياس الحقيقي: الصور كل أسبوعين، نفس الإضاءة.',
  'لو طلعت متوتر من الشغل، الجلسة تذيب التوتر. اطلع.',
  'الكافيين قبل الجيم بـ 30 دقيقة. مش بعد، مش معاه.',
  'عضلاتك تكبر وأنت نايم، مش وأنت ترفع.',
  'أسبوع ضعيف لا يعني شي. شهر ضعيف، نراجع.',
  'لا تقارن جلستك اليوم بجلسة محسن. قارنها بجلستك الماضية.',
  'الـ stretching بعد الجلسة 5 دقائق. كافي.',
  'وجبة بعد الجيم خلال ساعة. بروتين + كارب.',
  'لو ركبتك تؤلم، أوقف. الألم ≠ التحدي.',
  'الانتظام أهم من الشدة. كل أسبوع، حتى لو ضعيف.',
  'ما في تمرين سحري. كلهم يعطون نتائج لو نفّذتهم صح.',
  'اللي يفرق بعد سنة: من جا، مش من رفع أكثر.',
  'هذي جلستك. لا تشاركها على instagram. ركّز.',
];

// Export to global scope for the app
window.RW = { MUSCLES, VOLUME_MUSCLE_TAXONOMY, EXERCISES, PROGRAMME, SESSION_WARMUPS, ATHLETE, FAMILY_PROFILES, MOTIVATIONAL_MESSAGES, yt, ytShort, thumb, bodyImg, BODY_IMG };
