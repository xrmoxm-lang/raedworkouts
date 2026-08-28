import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// The picker is intentionally separate from the installed app. Its C3 rows
// are hand-reviewed PDF evidence, so this guard verifies exact source context
// rather than pretending a fuzzy video match is safe.
const pickerPath = path.resolve(process.cwd(), '..', 'link-picker.html');

test('C3 link picker renders all nine source-backed rows with verbatim PDF context', async () => {
  const source = await readFile(pickerPath, 'utf8');
  const backlog = source.match(/const BACKLOG_ROWS = \[(.*?)\n\];/s)?.[1] || '';
  const rows = [
    'chest_press_machine', 'shoulder_press_machine', 'face_pull', 'biceps_curl', 'hammer_curl',
    'reverse_curl', 'hack_squat', 'prone_leg_curl', 'standing_leg_curl',
  ];
  assert.equal((backlog.match(/id:'backlog:/g) || []).length, 9, 'C3 must stay a nine-row evidence queue');
  for (const id of rows) assert.match(backlog, new RegExp(`id:'backlog:${id}'`), `missing C3 row ${id}`);
  for (const context of [
    'Machine Chest Press Weighted Dip ~3 min',
    'Machine Shoulder Press ~2 min Standing DB Arnold Press',
    'Omni-Direction Face Pull 3 1 30s EZ-Bar Curl',
    'Keep your elbow behind your torso throughout the range of motion, focus on squeezing your bicep.',
    'Hack Squat (Heavy) Exercise Warm-up Sets (see page 15 for details) Hack Squat',
  ]) assert.ok(backlog.includes(context), `verbatim PDF context lost: ${context}`);
  assert.match(source, /السياق حرفيًا: “\$\{v\.context\}”/, 'the rendered C3 card must print its source context verbatim');
  console.log('LINK_PICKER_C3_CONTEXT_VERIFIED');
});
