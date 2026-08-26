import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  isV16SyncUserId,
  localProfileIdFromV16SyncId,
  v16SyncUserId,
} from '../domain/sync-identity.js';

test('Deploy safety: every v16 family profile resolves only to its namespaced HP row', () => {
  const expected = {
    Raed: 'raed-v16',
    bassam: 'bassam-v16',
    abdullah: 'abdullah-v16',
  };

  for (const [local, remote] of Object.entries(expected)) {
    assert.equal(v16SyncUserId(local), remote);
    assert.notEqual(remote, local.toLocaleLowerCase(), `${local} must never target its bare v15 server row`);
    assert.ok(isV16SyncUserId(remote));
    assert.equal(localProfileIdFromV16SyncId(remote), local.toLocaleLowerCase());
  }
  assert.equal(localProfileIdFromV16SyncId('raed'), null, 'a bare v15 server row is never a v16 profile row');
  assert.throws(() => v16SyncUserId(''), /local profile id is required/);
  console.log('V16_SYNC_NAMESPACE_PASSED');
});

test('Deploy safety: provisioning v16 server identities is additive and leaves v15 allowlist keys untouched', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'raedworkouts-v16-allowlist-'));
  const allowlist = path.join(directory, 'allowlist.json');
  const v15 = {
    users: {
      raed: { display_name: 'Raed', experience: 'returning', bodyweight_kg: 82 },
      bassam: { display_name: 'Bassam', experience: 'returning' },
      abdullah: { display_name: 'Abdullah', experience: 'beginner' },
    },
  };
  try {
    await writeFile(allowlist, JSON.stringify(v15));
    const output = execFileSync('python3', ['server/add-v16-allowlist.py', '--allowlist', allowlist], {
      cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'),
      encoding: 'utf8',
    });
    const updated = JSON.parse(await readFile(allowlist, 'utf8'));
    assert.deepEqual(
      Object.fromEntries(['raed', 'bassam', 'abdullah'].map((id) => [id, updated.users[id]])),
      v15.users,
      'the provisioning helper must never migrate or modify v15 rows',
    );
    assert.deepEqual(Object.keys(updated.users).filter((id) => id.endsWith('-v16')).sort(), [
      'abdullah-v16', 'bassam-v16', 'raed-v16',
    ]);
    assert.match(output, /V16_ALLOWLIST_READY/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log('V16_ALLOWLIST_ADDITIVE_PASSED');
});
