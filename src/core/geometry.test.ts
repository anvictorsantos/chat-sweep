import assert from 'node:assert/strict';
import test from 'node:test';

import { pickTrigger, type Box, type TriggerCandidate } from './geometry.ts';

const row: Box = { left: 0, top: 100, width: 280, height: 36 };

const candidate = (
  name: string,
  box: Partial<Box>,
  flags: { hasPopup?: boolean; labelHint?: boolean; tag?: 'button' | 'other' } = {},
): TriggerCandidate<string> => ({
  value: name,
  box: { left: 0, top: 0, width: 24, height: 24, ...box },
  hasPopup: flags.hasPopup ?? false,
  labelHint: flags.labelHint ?? false,
  tag: flags.tag ?? 'button',
});

test('a popup trigger inside the row is chosen', () => {
  const picked = pickTrigger(row, [
    candidate('title-link', { left: 8, top: 106, width: 200, height: 24 }, { tag: 'other' }),
    candidate('options', { left: 244, top: 106 }, { hasPopup: true }),
  ]);
  assert.equal(picked, 'options');
});

test('a geometry-only icon button still wins when it sits inside the row', () => {
  const picked = pickTrigger(row, [
    candidate('link', { left: 4, top: 104, width: 220, height: 28 }, { tag: 'other' }),
    candidate('unknown-icon', { left: 246, top: 106 }),
  ]);
  assert.equal(picked, 'unknown-icon');
});

test('candidates outside the row are ignored even with strong hints', () => {
  const picked = pickTrigger(row, [
    candidate('elsewhere', { left: 0, top: 300 }, { hasPopup: true, labelHint: true }),
  ]);
  assert.equal(picked, null);
});

test('nothing inside the row means no trigger', () => {
  assert.equal(pickTrigger(row, []), null);
});

test('popup metadata outranks a trailing label-only control', () => {
  const picked = pickTrigger(row, [
    candidate('trailing-label', { left: 250, top: 106 }, { labelHint: true }),
    candidate('leading-popup', { left: 10, top: 106 }, { hasPopup: true }),
  ]);
  assert.equal(picked, 'leading-popup');
});

test('zero-sized controls are never picked', () => {
  const picked = pickTrigger(row, [candidate('hidden', { left: 250, top: 106, width: 0, height: 0 })]);
  assert.equal(picked, null);
});
