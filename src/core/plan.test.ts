import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIRM_PHRASE, buildConfirm } from './plan.ts';

test('conversation deletion is permanent and gated behind a typed phrase', () => {
  const copy = buildConfirm('history', 'native', 3, 'ChatGPT');
  assert.equal(copy.permanent, true);
  assert.equal(copy.requiredPhrase, CONFIRM_PHRASE);
  assert.equal(copy.acknowledgement !== null, true);
  assert.match(copy.title, /Delete 3 conversations\?/);
  assert.match(copy.lines.join(' '), /ChatGPT's own menu/);
});

test('conversation deletion copy is singular for one item', () => {
  const copy = buildConfirm('history', 'native', 1, 'Claude');
  assert.match(copy.title, /1 conversation\?/);
  assert.match(copy.confirmLabel, /Delete 1 conversation$/);
});

test('hiding messages is reversible, so no typed phrase is required', () => {
  const copy = buildConfirm('thread', 'hide', 2, 'ChatGPT');
  assert.equal(copy.permanent, false);
  assert.equal(copy.requiredPhrase, null);
  assert.notEqual(copy.acknowledgement, null);
  assert.match(copy.lines.join(' '), /no per-message delete/);
  assert.match(copy.consequence, /reload/i);
});

test('a native per-message delete stays permanent', () => {
  const copy = buildConfirm('thread', 'native', 1, 'Some chat');
  assert.equal(copy.permanent, true);
  assert.equal(copy.requiredPhrase, CONFIRM_PHRASE);
});

test('an empty selection is a programming error, not a silent no-op', () => {
  assert.throws(() => buildConfirm('history', 'native', 0, 'ChatGPT'), RangeError);
});
