import assert from 'node:assert/strict';
import test from 'node:test';

import { describeFailures, failureHint, tallyFailures } from './failure.ts';

test('the most frequent reason wins', () => {
  assert.equal(tallyFailures(['no-trigger', 'menu-unopened', 'no-trigger']), 'no-trigger');
});

test('ties keep the first reason seen', () => {
  assert.equal(tallyFailures(['menu-unopened', 'no-trigger']), 'menu-unopened');
});

test('no failures means no summary', () => {
  assert.equal(tallyFailures([]), null);
  assert.equal(describeFailures([]), null);
});

test('a uniform failure reads as "every attempt"', () => {
  assert.equal(
    describeFailures(['no-trigger', 'no-trigger']),
    `${failureHint('no-trigger')} (every attempt)`,
  );
});

test('a mixed failure reports the dominant share', () => {
  assert.equal(
    describeFailures(['no-trigger', 'no-trigger', 'row-remains']),
    `${failureHint('no-trigger')} (2 of 3)`,
  );
});

test('every reason has plain-language copy', () => {
  const reasons = [
    'aborted',
    'navigated',
    'no-trigger',
    'menu-unopened',
    'no-menu-item',
    'unconfirmed',
    'row-remains',
  ] as const;
  for (const reason of reasons) {
    assert.ok(failureHint(reason).length > 10);
  }
});
