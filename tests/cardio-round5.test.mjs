// The cool-down's round-5 rulings, at the level where they are decided.
//
// Round 4 built this block against km/h. Raed settled the unit on 2026-09-23 —
// the belt reads MPH, so his 5.1 base is 137 m/min and is jogged, not walked —
// and that single fact moves the equation, the coaching, the progression order
// and the grade ceiling. Those are the assertions here, plus the critical
// defect that shipped with the suggestion: it handed the UI a whole previous
// RECORD where a prescription belonged.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BASE_METS_BAND,
  DEFAULT_SPEED_UNIT,
  GRADE_MAX_RUN,
  boutTotals,
  convertCardioUnit,
  convertSpeed,
  defaultCardio,
  displayDistance,
  idealGradeFor,
  normalizeUnit,
  paceKind,
  prescriptionOf,
  suggestNext,
} from '../domain/cardio.js';

// The bout he described: 15 minutes, base 5.1, 2.5%, four 30-second bursts at
// 7.3 — completed last session, which is what makes it dangerous to spread.
const completedBout = () => ({
  ...defaultCardio('mph'),
  started_at: '2026-09-20T18:00:00.000Z',
  completed_at: '2026-09-20T18:20:00.000Z',
});

test('a suggestion is a prescription — it can never carry the previous bout\'s timestamps', () => {
  const previous = completedBout();
  const suggestion = suggestNext(previous, 'mph');

  // The seven fields that describe the work, and nothing else. Anything more is
  // a record field, and a record field applied to today's block back-dates a
  // cool-down he has not done.
  assert.deepEqual(
    Object.keys(suggestion.cardio).sort(),
    ['base_speed', 'burst_count', 'burst_seconds', 'burst_speed', 'incline', 'planned_minutes', 'unit'],
  );
  assert.ok(!('completed_at' in suggestion.cardio), 'a suggestion must not carry completed_at');
  assert.ok(!('started_at' in suggestion.cardio), 'a suggestion must not carry started_at');
  assert.ok(!('skipped' in suggestion.cardio), 'a suggestion must not carry skipped');

  // And the shape the UI actually performs: applying it to the live, unlogged
  // bout must leave it unlogged.
  const live = defaultCardio('mph');
  Object.assign(live, suggestion.cardio);
  assert.equal(live.completed_at, null, 'applying a suggestion must not mark today as already done');
  assert.equal(live.started_at, null);
  assert.equal(live.planned_minutes, 20, 'and it must still apply the change it promised');
});

test('prescriptionOf keeps the seven numbers and drops everything else', () => {
  const picked = prescriptionOf({ ...completedBout(), junk: true });
  assert.ok(!('junk' in picked));
  assert.ok(!('completed_at' in picked));
  assert.equal(picked.base_speed, 5.1);
});

test('the unit is mph: defaults, the fallback, and the same workout in km/h', () => {
  assert.equal(DEFAULT_SPEED_UNIT, 'mph');
  // An older settings blob has no speed_unit at all. Reading that as km/h
  // silently rewrites his jog into a brisk walk.
  assert.equal(normalizeUnit(undefined), 'mph');
  const mph = defaultCardio(undefined);
  assert.equal(mph.unit, 'mph');
  assert.equal(mph.base_speed, 5.1, 'his own base, in his own unit');
  assert.equal(mph.burst_speed, 7.3);

  // The km/h column is the SAME speeds converted, so flipping the unit changes
  // the numerals and not the workout.
  const kmh = defaultCardio('kmh');
  assert.equal(kmh.base_speed, 8.2);
  assert.equal(kmh.burst_speed, 11.7);
  assert.equal(boutTotals(mph).met_minutes, boutTotals(kmh).met_minutes);
});

test('his base is a jog, priced by the running equation at about 9.7 METs', () => {
  const totals = boutTotals(defaultCardio('mph'));
  assert.equal(totals.pace_kind, 'run');
  assert.equal(paceKind(5.1, 'mph'), 'run');
  // 0.2*136.79 + 0.9*136.79*0.025 + 3.5 = 33.94 ml/kg/min => 9.7 METs. The
  // walking equation would have called the same belt 5.5 METs — the wrong ruler.
  assert.equal(totals.base_mets, 9.7);
  assert.equal(totals.met_minutes, 153);
  // No band verdict for a jog: the Zone 2 band is a walking-equation idea.
  assert.equal(totals.band_state, null);
});

test('with mph defaults the first thing to change is the duration, not the incline', () => {
  const first = suggestNext(defaultCardio('mph'), 'mph');
  assert.equal(first.field, 'planned_minutes');
  assert.equal(first.reason, 'duration');
  assert.equal(first.to, 20);
  // And no solved grade is offered for a jog.
  assert.equal(first.ideal, null);
});

test('the running ladder ends at the grade, capped at 4%', () => {
  // Everything else at its ceiling: 30 minutes, 8 bursts, burst speed past the
  // 10 mph cap. Only then does the grade move, and only by half a step.
  const maxed = { ...defaultCardio('mph'), planned_minutes: 30, burst_count: 8, burst_speed: 10 };
  const step = suggestNext(maxed, 'mph');
  assert.equal(step.field, 'incline');
  assert.equal(step.to, 3, 'half a step up from 2.5');

  const atCap = suggestNext({ ...maxed, incline: GRADE_MAX_RUN }, 'mph');
  assert.equal(atCap, null, 'every lever at its ceiling: say nothing rather than invent a rung');
});

test('a walking base keeps the solved grade and gets a three-state verdict', () => {
  // 3.0 mph is 80.5 m/min — inside the walking equation.
  assert.equal(paceKind(3.0, 'mph'), 'walk');
  assert.equal(idealGradeFor(3.0, 'mph'), 5.5, 'the grade that puts this walk in the band');

  const walk = { ...defaultCardio('mph'), base_speed: 3.0, incline: 2.5, burst_count: 0 };
  assert.equal(boutTotals(walk).band_state, 'under');
  // In the band at the solved grade.
  const inBand = boutTotals({ ...walk, incline: 5.5 });
  assert.equal(inBand.band_state, 'in');
  assert.ok(inBand.base_mets >= BASE_METS_BAND.low && inBand.base_mets <= BASE_METS_BAND.high);
  // Over it — the state that used to print «under the zone», which is the one
  // direction where the advice it implies is backwards.
  assert.equal(boutTotals({ ...walk, incline: 9 }).band_state, 'over');

  // And a walking base still leads with the incline.
  assert.equal(suggestNext(walk, 'mph').field, 'incline');
});

test('switching the unit converts the belt, and 5.1 mph round-trips', () => {
  const kmh = convertSpeed(5.1, 'mph', 'kmh');
  assert.equal(kmh, 8.2);
  assert.ok(Math.abs(convertSpeed(kmh, 'kmh', 'mph') - 5.1) <= 0.05, 'the round trip must not drift the belt');

  const bout = defaultCardio('mph');
  convertCardioUnit(bout, 'kmh');
  assert.equal(bout.unit, 'kmh');
  assert.equal(bout.base_speed, 8.2);
  assert.equal(bout.burst_speed, 11.7);
  // A blank box has nothing to convert and must not become 0.
  assert.equal(convertSpeed('', 'mph', 'kmh'), '');
});

test('distance is stored in km and shown in his unit', () => {
  const totals = boutTotals(defaultCardio('mph'));
  assert.equal(totals.distance_km, 2.17, 'the ground covered, as a fact');
  assert.equal(totals.distance_display, 1.35, 'and as his treadmill reads it');
  assert.equal(displayDistance(2.17, 'kmh'), 2.17);
});

test('a box he cleared is not a zero', () => {
  const blank = { ...defaultCardio('mph'), base_speed: '' };
  const totals = boutTotals(blank);
  assert.deepEqual(totals.missing, ['base_speed']);
  assert.equal(totals.incomplete, true);
  // NaN gets there too, through a paste or a stray keystroke.
  assert.equal(boutTotals({ ...defaultCardio('mph'), incline: NaN }).incomplete, true);
  // Burst speed only matters when there are bursts.
  assert.equal(boutTotals({ ...defaultCardio('mph'), burst_count: 0, burst_speed: '' }).incomplete, false);
  assert.equal(boutTotals(defaultCardio('mph')).incomplete, false);
});
