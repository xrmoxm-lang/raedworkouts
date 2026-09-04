import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The picker is intentionally separate from the installed app. Its C3 rows
// are hand-reviewed PDF evidence, so this guard verifies exact source context
// rather than pretending a fuzzy video match is safe.
// Resolved from THIS FILE, not from process.cwd(): the picker lives beside the
// worktree, one level above the repo, so a cwd-relative path only worked when
// the suite happened to be run from ~/RaedWorkoutsV2/worktree-v16. From the main
// checkout it resolved to a file that does not exist and the test failed for a
// reason that had nothing to do with the picker.
const pickerPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'link-picker.html');

test('C3 link picker renders all nine source-backed rows with verbatim PDF context', async (t) => {
  // The picker is an authoring tool that lives OUTSIDE the repository, so a
  // clone will not have it. Skipping with a reason is honest; failing is a false
  // alarm and passing silently would be worse.
  if (!existsSync(pickerPath)) {
    t.skip(`link-picker.html is not in this checkout (${pickerPath}) — it lives beside the worktree`);
    return;
  }
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
