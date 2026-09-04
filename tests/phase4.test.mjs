import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const localeSource = await readFile(new URL('../locale.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('Phase 6: the shipped client has no PIN route, keypad, credential derivation, or reauthentication prompt', () => {
  // This is deliberately a production-source assertion, complemented by the
  // deploy-safe browser flow. Renaming a PIN helper cannot make the browser
  // test green, and hiding a keypad cannot make this test green.
  assert.doesNotMatch(appSource, /\b(?:validateRegistrationPin|profileEntryMode|renderPinPad|verifyPin|verifyReconnectPin|openSetPinModal|openReconnectPinModal|deriveUserKey|hasLocalProfileCredential|profileWithLocalCredential|retryPendingRegistration|pinErrorMessage)\b/);
  assert.doesNotMatch(appSource, /(?:X-User-Key|_auth_user_key|server_has_pin)/);
  assert.doesNotMatch(localeSource, /^\s*(?:enter_pin|pin_|repeat_pin|four_digit_pin|use_four_digit_pin|pins_do_not_match|wrong_pin|too_many_tries|profile_requires_pin|profile_already_has_pin)\s*:/m);
  assert.doesNotMatch(styleSource, /\.pin-(?:panel|dots|grid|key|nudge)\b|@keyframes\s+pinShake/);
  console.log('V16_PIN_REMOVAL_SOURCE_PASSED');
});
