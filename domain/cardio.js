/*
 * Post-workout conditioning — the arithmetic behind the cool-down block.
 *
 * Raed 2026-09-22: «i want to have postworkout cardio option like the warm up
 * but different … calculating the suggested and most beneficial incline degree
 * and the speed … in total I calculate it in my head and I want to put it so I
 * can outdo myself later on.»
 *
 * Two of those asks cannot be answered by distance. Twenty minutes at 5.1 with
 * the belt flat and twenty minutes at 5.1 on a 4% grade cover the same ground
 * and are not the same work, so a distance total can neither rank his bouts nor
 * price a grade. The ACSM metabolic equations do both: they convert belt speed
 * and grade into oxygen cost, which is the quantity the incline is actually
 * buying. Everything on the block is derived from them.
 *
 * Source: ACSM's Guidelines for Exercise Testing and Prescription, metabolic
 * calculations for treadmill walking and running. S is belt speed in m/min and
 * G is the grade as a fraction (2.5% => 0.025); VO2 comes out in ml/kg/min.
 *
 *   walking   VO2 = 0.1*S + 1.8*S*G + 3.5
 *   running   VO2 = 0.2*S + 0.9*S*G + 3.5
 *
 * The walking form is validated from 1.9 to 4.0 mph (50-100 m/min). Above that
 * a treadmill is jogged rather than walked and the running form takes over, so
 * his 30-second bursts are priced by the running equation and his base by the
 * walking one — which is what makes a burst worth more than the minute it costs.
 */

// Where the walking equation stops describing what the body is doing.
const WALK_MAX_M_MIN = 100;
// One MET is resting oxygen uptake, and it is the divisor that turns VO2 into a
// number worth showing.
const ML_PER_MET = 3.5;

// Belt speed to m/min. Saudi treadmills read km/h; the mph branch exists because
// he said "mile" and a unit he cannot change is a number he cannot trust.
const M_PER_MIN = Object.freeze({ kmh: 1000 / 60, mph: 1609.344 / 60 });

export const SPEED_UNITS = Object.freeze(['kmh', 'mph']);
// Raed 2026-09-23: «الوحدة ميل» — the treadmill he uses reads mph, so 5.1 and 7.3
// are mph and every default here is stated in mph first. An older settings blob
// has no `speed_unit` at all, and reading that as km/h would silently rewrite his
// jog into a brisk walk, so the fallback is his unit and not the alphabet's.
export const DEFAULT_SPEED_UNIT = 'mph';
// 1 mile = 1609.344 m exactly (international mile), which is also where M_PER_MIN
// comes from; named because the display conversion needs it on its own.
export const KM_PER_MILE = 1.609344;
export const DURATION_CHOICES = Object.freeze([10, 15, 20, 25, 30]);
export const BURST_SECOND_CHOICES = Object.freeze([20, 30, 45, 60]);

// The Zone 2 band this block aims the BASE walk at. A 26-year-old building a
// base sits near 40-60% of VO2max, which for a moderate VO2max of about 40
// ml/kg/min is roughly 4.5 to 6.9 METs. 5.5 is the middle of that, and it is
// deliberately a band rather than a target so the app never nags him over 0.2.
export const BASE_METS_TARGET = 5.5;
export const BASE_METS_BAND = Object.freeze({ low: 5.0, high: 6.0 });
// Treadmill grade keys step by 0.5, and nothing above 10% is a Zone 2 walk.
export const GRADE_STEP = 0.5;
export const GRADE_MAX = 10;
// One session moves one variable by one step. Raed's own pattern is 2-3% and
// occasionally 0, so a jump straight to the computed ideal would be a different
// workout, not a progression.
const GRADE_SESSION_STEP = 0.5;
const MAX_BURSTS = 8;
/*
 * A jogged base gets a much lower grade ceiling than a walked one. At 5.1 mph
 * (137 m/min) every 1% of grade adds 0.9*S = 1.23 ml/kg/min of oxygen cost AND
 * loads the calf and Achilles at flight speed; 4% is where a treadmill jog stops
 * being a jog and becomes a hill run. The 10% ceiling above is a WALKING number
 * — a 10% grade at 137 m/min is a 13-MET effort, which is not a cool-down.
 */
export const GRADE_MAX_RUN = 4;
/*
 * The last rung of the running ladder. Without a ceiling on burst speed the
 * grade lever below it could never be reached, and a 30-second burst above
 * 10 mph (268 m/min, ~18 METs) is a sprint he has to mount and dismount from a
 * moving belt — the one part of this block that can hurt him.
 */
const BURST_SPEED_MAX = Object.freeze({ mph: 10, kmh: 16 });

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

export function normalizeUnit(unit) {
  return SPEED_UNITS.includes(unit) ? unit : DEFAULT_SPEED_UNIT;
}

/*
 * A field he has cleared is not a zero.
 *
 * `numField` writes '' into the model the moment he empties the box, and Number('')
 * is 0 — so a blank speed used to price a bout at 3.5 METs of standing still and
 * print a total for a workout that does not exist. Anything that is not a finite
 * number is missing, and the block says so instead of computing.
 */
export function isBlankNumber(value) {
  if (value === '' || value == null) return true;
  return !Number.isFinite(Number(value));
}

/* Belt speed in the chosen unit -> m/min. */
export function toMetersPerMinute(speed, unit) {
  return num(speed) * M_PER_MIN[normalizeUnit(unit)];
}

/* m/min -> the chosen unit, for printing a solved speed back to him. */
export function fromMetersPerMinute(mPerMin, unit) {
  return num(mPerMin) / M_PER_MIN[normalizeUnit(unit)];
}

/* True when this belt speed is jogged rather than walked. */
export function isRunningPace(speed, unit) {
  return toMetersPerMinute(speed, unit) > WALK_MAX_M_MIN;
}

/*
 * Which equation — and which coaching — this base belongs to.
 *
 * Raed 2026-09-23 settled the unit: his 5.1 is mph, i.e. 137 m/min, well past the
 * walking form's 100 m/min ceiling. That is not a detail of arithmetic: the Zone 2
 * band and the solved grade below are BUILT on the walking equation, so pointing
 * them at a jog measures it with the wrong ruler. Everything downstream asks this
 * function first.
 */
export function paceKind(speed, unit) {
  return isRunningPace(speed, unit) ? 'run' : 'walk';
}

/*
 * The same belt speed, read off a machine set to the other unit.
 *
 * Switching the unit must change the numerals and not the workout — 5.1 mph and
 * 8.2 km/h are the same jog — so the setting converts what he already typed
 * instead of relabelling it. A blank stays blank: there is nothing to convert.
 */
export function convertSpeed(speed, from, to) {
  if (isBlankNumber(speed)) return speed;
  const a = normalizeUnit(from);
  const b = normalizeUnit(to);
  if (a === b) return round1(num(speed));
  return round1(fromMetersPerMinute(toMetersPerMinute(speed, a), b));
}

/* Both belt speeds of one bout, moved to another unit. Everything else is unitless. */
export function convertCardioUnit(cardio, to) {
  if (!cardio) return cardio;
  const from = normalizeUnit(cardio.unit);
  const unit = normalizeUnit(to);
  cardio.base_speed = convertSpeed(cardio.base_speed, from, unit);
  cardio.burst_speed = convertSpeed(cardio.burst_speed, from, unit);
  cardio.unit = unit;
  return cardio;
}

/*
 * Distance is STORED in km — it is a fact about the ground, and a log that mixes
 * miles into it becomes unreadable the day he changes the setting — but it is
 * SHOWN in the unit his treadmill is showing him. 2.17 km is «1.35 ميل».
 */
export function displayDistance(km, unit) {
  return normalizeUnit(unit) === 'mph' ? round2(num(km) / KM_PER_MILE) : round2(num(km));
}

/*
 * Oxygen cost of one steady stretch, in ml/kg/min. `gradePercent` is the number
 * printed on the treadmill (2.5 means 2.5%), not a fraction — the equations take
 * a fraction and forgetting that is an eighty-fold error, so the conversion
 * happens here once instead of at four call sites.
 */
export function vo2For(speed, unit, gradePercent) {
  const s = toMetersPerMinute(speed, unit);
  if (s <= 0) return 0;
  const g = num(gradePercent) / 100;
  return s > WALK_MAX_M_MIN
    ? (0.2 * s) + (0.9 * s * g) + ML_PER_MET
    : (0.1 * s) + (1.8 * s * g) + ML_PER_MET;
}

export function metsFor(speed, unit, gradePercent) {
  return vo2For(speed, unit, gradePercent) / ML_PER_MET;
}

/*
 * The grade that would put a given belt speed at a target intensity — this is
 * the "most beneficial incline" he asked for, solved rather than guessed.
 * Inverting the walking equation for G:
 *
 *   G = (VO2_target - 0.1*S - 3.5) / (1.8*S)
 *
 * Returns null when the speed itself already exceeds the target with the belt
 * flat, because the honest answer then is "walk flat, or walk slower" and not a
 * negative grade the machine cannot produce.
 */
export function idealGradeFor(speed, unit, targetMets = BASE_METS_TARGET) {
  const s = toMetersPerMinute(speed, unit);
  if (s <= 0) return null;
  const target = num(targetMets) * ML_PER_MET;
  const running = s > WALK_MAX_M_MIN;
  const flat = running ? (0.2 * s) + ML_PER_MET : (0.1 * s) + ML_PER_MET;
  const perGrade = running ? (0.9 * s) : (1.8 * s);
  if (perGrade <= 0) return null;
  const grade = ((target - flat) / perGrade) * 100;
  if (grade <= 0) return null;
  return clamp(round1(Math.round(grade / GRADE_STEP) * GRADE_STEP), 0, GRADE_MAX);
}

/*
 * His default bout: what he told me he already does — 15 minutes, base 5.1,
 * 2.5% grade, four 30-second bursts at 7.3, in MPH (Raed 2026-09-23).
 *
 * The km/h column is those SAME speeds converted, not a second opinion about how
 * he trains: 5.1 mph = 8.2 km/h and 7.3 mph = 11.7 km/h. Flipping the unit may
 * change the numerals on screen and must never change the workout.
 *
 * The unit is normalised before it is read. The old body branched on the raw
 * `unit` argument while the record was stamped with the normalised one, so an
 * older settings blob with no `speed_unit` produced a record labelled mph
 * carrying km/h numbers — a bout priced 1.6× wrong, silently.
 */
export function defaultCardio(unit = DEFAULT_SPEED_UNIT) {
  const u = normalizeUnit(unit);
  return {
    planned_minutes: 15,
    unit: u,
    base_speed: u === 'mph' ? 5.1 : 8.2,
    incline: 2.5,
    burst_count: 4,
    burst_seconds: 30,
    burst_speed: u === 'mph' ? 7.3 : 11.7,
    started_at: null,
    completed_at: null,
    skipped: false,
  };
}

/*
 * Split the planned time into burst minutes and the base walk that surrounds
 * them. He runs the bursts INSIDE the bout rather than after it, so the base is
 * the remainder — which is also why over-filling the bout has to be caught: six
 * one-minute bursts inside a ten-minute walk leaves four minutes of walking, and
 * eleven would leave a negative number.
 */
export function splitBout(cardio) {
  const planned = Math.max(0, num(cardio?.planned_minutes));
  const burstMinutes = Math.max(0, num(cardio?.burst_count) * num(cardio?.burst_seconds) / 60);
  const capped = Math.min(burstMinutes, planned);
  return {
    planned_minutes: planned,
    burst_minutes: round2(capped),
    base_minutes: round2(Math.max(0, planned - capped)),
    // True when the bursts alone would fill or overrun the bout, which means the
    // numbers on screen no longer describe a workout he can actually do.
    over_filled: burstMinutes > planned,
  };
}

/*
 * Everything the block prints, and the single number his next bout has to beat.
 *
 * `met_minutes` is METs x minutes. It is the only total here that prices the
 * grade and the bursts together, so it — not distance, not time — is what
 * ranks one bout against another.
 */
export function boutTotals(cardio) {
  const unit = normalizeUnit(cardio?.unit);
  const split = splitBout(cardio);
  // Which numbers he has actually given. Burst speed only counts as missing when
  // there ARE bursts — a bout of plain walking is complete without one.
  const missing = [];
  if (isBlankNumber(cardio?.base_speed)) missing.push('base_speed');
  if (isBlankNumber(cardio?.incline)) missing.push('incline');
  if (num(cardio?.burst_count) > 0 && isBlankNumber(cardio?.burst_speed)) missing.push('burst_speed');
  const baseMets = metsFor(cardio?.base_speed, unit, cardio?.incline);
  // A burst is run at the same grade unless he drops it; the belt does not
  // level itself between repeats.
  const burstMets = metsFor(cardio?.burst_speed, unit, cardio?.incline);
  const metMinutes = (baseMets * split.base_minutes) + (burstMets * split.burst_minutes);
  const distance = (toMetersPerMinute(cardio?.base_speed, unit) * split.base_minutes)
    + (toMetersPerMinute(cardio?.burst_speed, unit) * split.burst_minutes);
  const kind = paceKind(cardio?.base_speed, unit);
  return {
    ...split,
    unit,
    base_mets: round1(baseMets),
    burst_mets: round1(burstMets),
    met_minutes: Math.round(metMinutes),
    // Kilometres regardless of the belt's unit: the distance is a fact about the
    // ground, and mixing miles into the record would make old bouts unreadable.
    distance_km: round2(distance / 1000),
    // The same ground in the unit he is reading off the machine.
    distance_display: displayDistance(distance / 1000, unit),
    avg_mets: split.planned_minutes > 0 ? round1(metMinutes / split.planned_minutes) : 0,
    // Which equation priced the base, and therefore which coaching applies.
    pace_kind: kind,
    /*
     * Three states, not two — and only for a walk.
     *
     * `in_band` was a boolean, so the block printed «the walk is UNDER the zone»
     * for a base that was over it, which is a lie in the one direction where the
     * fix is the opposite one. And the band itself is a walking-equation idea:
     * for a jogged base there is no verdict to give, so the state is null and the
     * block prints the MET fact instead.
     */
    band_state: kind === 'run' ? null
      : baseMets < BASE_METS_BAND.low ? 'under'
        : baseMets > BASE_METS_BAND.high ? 'over' : 'in',
    // Fields he has emptied. Non-empty means the totals below are arithmetic on
    // numbers he never gave, and the block must refuse to show them.
    missing,
    incomplete: missing.length > 0,
  };
}

/* The best bout in his log, which is the thing he is trying to beat. */
export function bestBout(history = []) {
  let best = null;
  for (const session of history) {
    const c = session?.cardio;
    if (!c || c.skipped || !c.completed_at) continue;
    const totals = boutTotals(c);
    if (totals.incomplete || totals.met_minutes <= 0) continue;
    if (!best || totals.met_minutes > best.met_minutes) {
      best = { ...totals, date: session.date || session.started_at || null };
    }
  }
  return best;
}

/* The most recent bout, for "last time you did X". */
export function lastBout(history = []) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const c = history[i]?.cardio;
    if (c && !c.skipped && c.completed_at) return { cardio: c, totals: boutTotals(c), date: history[i].date || null };
  }
  return null;
}

/*
 * The PRESCRIPTION half of a bout — what to do — with none of the record half.
 *
 * This separation is the fix for a critical bug (Round 5): `suggestNext` used to
 * return `{ ...previous }` with one field changed, and `previous` is by
 * construction a COMPLETED bout — `completed_at` non-null, `started_at` stamped
 * days ago. The UI Object.assign()s the suggestion onto the live session, so one
 * tap on «طبّقه» flipped today's cool-down into its "already logged" state and
 * archived a bout he never did, dated to the previous session, where it then
 * competed in bestBout(). A suggestion may carry only the seven numbers that
 * describe the work.
 */
const PRESCRIPTION_KEYS = Object.freeze([
  'planned_minutes', 'unit', 'base_speed', 'incline',
  'burst_count', 'burst_seconds', 'burst_speed',
]);
export function prescriptionOf(cardio) {
  const out = {};
  for (const key of PRESCRIPTION_KEYS) out[key] = cardio?.[key];
  return out;
}

/*
 * What to change next, and why — one variable per session.
 *
 * Order matters and it is not arbitrary, and since 2026-09-23 there are two
 * orders because there are two kinds of base.
 *
 * A WALKED base keeps the round-4 ladder: grade first, because at walking speed
 * it is the cheapest real intensity on the machine — it costs no extra minutes
 * and no joint load, and his own 2-3% sits under the Zone 2 band the walk is
 * supposed to occupy. Then duration to the half hour he named, then bursts, then
 * burst speed.
 *
 * A JOGGED base (his own 5.1 mph = 137 m/min) inverts it. The grade is no longer
 * free there: 0.9*S per unit grade at flight speed is both a large oxygen cost
 * and real Achilles load, and the Zone 2 band that justified "grade first" does
 * not even apply to a jog. So: duration → bursts → burst speed → grade LAST,
 * capped at 4%.
 */
export function suggestNext(previous, unit = DEFAULT_SPEED_UNIT) {
  const u = normalizeUnit(previous?.unit || unit);
  const base = previous ? { ...prescriptionOf(previous), unit: u } : prescriptionOf(defaultCardio(u));
  const running = paceKind(base.base_speed, u) === 'run';
  // The solved grade is a walking-equation answer; for a jog there is none to
  // offer, and the block prints the MET fact instead of a band verdict.
  const ideal = running ? null : idealGradeFor(base.base_speed, u, BASE_METS_TARGET);
  const grade = num(base.incline);
  const step = (field, to, reason) => ({
    field,
    from: field === 'planned_minutes' || field === 'burst_count' ? num(base[field]) : round1(num(base[field])),
    to,
    // Only the prescription. Never `...base` — see PRESCRIPTION_KEYS above.
    cardio: { ...base, [field]: to },
    // Named so the block can print the reason rather than an arrow.
    reason,
    ideal,
  });

  // `ideal` is null for a jog, which is what takes the grade off the front of
  // the ladder — no second guard is needed, and a second guard would be a
  // condition no test could ever move.
  if (ideal != null && grade + 0.01 < ideal) {
    return step('incline', clamp(round1(grade + GRADE_SESSION_STEP), 0, ideal), 'incline');
  }
  if (num(base.planned_minutes) < DURATION_CHOICES[DURATION_CHOICES.length - 1]) {
    const next = DURATION_CHOICES.find((m) => m > num(base.planned_minutes))
      || DURATION_CHOICES[DURATION_CHOICES.length - 1];
    return step('planned_minutes', next, 'duration');
  }
  if (num(base.burst_count) < MAX_BURSTS) {
    return step('burst_count', num(base.burst_count) + 1, 'bursts');
  }
  // The belt goes faster. Half a unit (0.3 mph), which is one key press.
  const fasterBursts = round1(num(base.burst_speed) + (u === 'mph' ? 0.3 : 0.5));
  if (!running) return step('burst_speed', fasterBursts, 'burst_speed');
  if (fasterBursts <= BURST_SPEED_MAX[u]) return step('burst_speed', fasterBursts, 'burst_speed');
  // Jogging base, everything else at its ceiling: now, and only now, the grade.
  if (grade + 0.01 < GRADE_MAX_RUN) {
    return step('incline', clamp(round1(grade + GRADE_SESSION_STEP), 0, GRADE_MAX_RUN), 'incline');
  }
  // Every lever is at its ceiling. Saying nothing is the honest answer; the
  // block simply shows no suggestion rather than inventing a rung.
  return null;
}

/* Is this bout better than the bar, and by how much. */
export function compareToBest(cardio, best) {
  const totals = boutTotals(cardio);
  if (!best || !best.met_minutes) return { totals, best: null, delta: null, beaten: false };
  const delta = totals.met_minutes - best.met_minutes;
  return { totals, best, delta, beaten: delta > 0 };
}
