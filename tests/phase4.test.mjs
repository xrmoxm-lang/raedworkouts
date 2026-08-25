import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = { addEventListener() {} };
const { profileEntryMode, validateRegistrationPin } = await import('../app.js');

function assertionFailure(assertion) {
  try {
    assertion();
  } catch (error) {
    return error;
  }
  throw new Error('Expected assertion to fail');
}

// This is the actual regression Raed ruled out: treating every profile as
// PIN-free lets an existing protected profile open without verification.
function plausibleWrongEntryMode() {
  return 'direct';
}

test('failing-first: a plausible optional-PIN implementation bypasses an existing PIN', () => {
  const legacyFailure = assertionFailure(() => assert.equal(plausibleWrongEntryMode({ has_pin: true }), 'pin'));
  assert.match(legacyFailure.message, /direct|pin/);
  console.log(`PHASE4_PIN_FAILING_FIRST: direct entry bypassed an existing PIN. Assertion: ${legacyFailure.message}`);
});

test('PHASE4: empty PIN registration is valid while an existing PIN still gates entry', () => {
  assert.deepEqual(validateRegistrationPin('', ''), { valid: true, pin: '', has_pin: false });
  assert.deepEqual(validateRegistrationPin('1234', '1234'), { valid: true, pin: '1234', has_pin: true });
  assert.equal(validateRegistrationPin('123', '123').valid, false);
  assert.equal(validateRegistrationPin('1234', '4321').valid, false);

  assert.equal(profileEntryMode({ user_id: 'new-profile' }), 'register');
  assert.equal(profileEntryMode({ user_id: 'no-pin', has_pin: false }), 'direct');
  assert.equal(profileEntryMode({ user_id: 'bassam', has_pin: true }), 'pin');
  console.log('PHASE4_PIN_RULE_PASSED');
});
