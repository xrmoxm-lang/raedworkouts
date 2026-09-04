import assert from 'node:assert/strict';
import test from 'node:test';
// app.js registers its browser boot handler at module evaluation. This inert
// browser surface lets the test import and exercise the exported app path
// without starting the UI or changing local storage.
globalThis.window = { addEventListener() {} };
const { resolveBlockSkinBoundary, resolveSkinSuggestionResponse } = await import('../app.js');

function assertionFailure(assertion) {
  try {
    assertion();
  } catch (error) {
    return error;
  }
  throw new Error('Expected assertion to fail');
}

const persistedSettings = () => ({
  skin: 'hadid',
  block_auto_color: true,
  block_skin_suggestions: { 2: 'waraq' },
  block_skin_rejections: {},
});

// This is the plausible regression Raed rejected: applying a proposal merely
// because the block changed, with no user gesture.
function plausibleWrongBoundary(input) {
  const boundary = resolveBlockSkinBoundary(input);
  return boundary.suggestion
    ? { ...input.settings, skin: boundary.suggestion.skin }
    : input.settings;
}

test('failing-first: a plausible auto-apply boundary implementation changes skin without consent', () => {
  const settings = persistedSettings();
  const wrongResult = plausibleWrongBoundary({ previousBlock: 1, currentBlock: 2, settings });
  const legacyFailure = assertionFailure(() => assert.equal(wrongResult.skin, 'hadid'));

  assert.match(legacyFailure.message, /hadid|waraq/);
  console.log(`PHASE3_FAILING_FIRST: direct block-boundary auto-apply changed hadid to waraq without Accept. Assertion: ${legacyFailure.message}`);
});

test('PHASE3: the app boundary path preserves persisted skin until Accept, and Reject persists', () => {
  const settings = persistedSettings();
  const boundary = resolveBlockSkinBoundary({ previousBlock: 1, currentBlock: 2, settings });

  assert.deepEqual(boundary.suggestion, { block: 2, skin: 'waraq' });
  assert.strictEqual(boundary.settings, settings);
  assert.equal(settings.skin, 'hadid');

  const withoutResponse = resolveSkinSuggestionResponse({ settings, suggestion: boundary.suggestion, response: null });
  assert.strictEqual(withoutResponse, settings);
  assert.equal(withoutResponse.skin, 'hadid');

  const rejected = resolveSkinSuggestionResponse({ settings, suggestion: boundary.suggestion, response: 'reject' });
  assert.equal(rejected.skin, 'hadid');
  assert.deepEqual(rejected.block_skin_rejections, { 2: true });
  assert.equal(resolveBlockSkinBoundary({ previousBlock: 1, currentBlock: 2, settings: rejected }).suggestion, null);

  const accepted = resolveSkinSuggestionResponse({ settings, suggestion: boundary.suggestion, response: 'accept' });
  assert.equal(accepted.skin, 'waraq');
});
