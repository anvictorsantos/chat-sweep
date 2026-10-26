import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_SELECTION,
  clear,
  click,
  count,
  isSelected,
  selectAll,
  selectedIds,
  setOrder,
} from './selection.ts';

const ids = ['a', 'b', 'c', 'd', 'e'];
const fresh = (): ReturnType<typeof setOrder> => setOrder(EMPTY_SELECTION, ids);

test('plain click toggles one item and moves the anchor', () => {
  const once = click(fresh(), 'c');
  assert.deepEqual(selectedIds(once), ['c']);
  assert.equal(once.anchor, 'c');

  const twice = click(once, 'c');
  assert.deepEqual(selectedIds(twice), []);
  assert.equal(twice.anchor, 'c');
});

test('shift-click selects the range between anchor and target', () => {
  const state = click(click(fresh(), 'b'), 'd', { shift: true });
  assert.deepEqual(selectedIds(state), ['b', 'c', 'd']);
  assert.equal(state.anchor, 'b');
});

test('shift-click backwards selects the same range', () => {
  const state = click(click(fresh(), 'e'), 'c', { shift: true });
  assert.deepEqual(selectedIds(state), ['c', 'd', 'e']);
});

test('shift-click unions with an existing selection', () => {
  const state = click(click(click(fresh(), 'a'), 'e'), 'c', { shift: true });
  assert.deepEqual(selectedIds(state), ['a', 'c', 'd', 'e']);
});

test('shift-click does not remove already selected items', () => {
  const state = click(click(click(click(fresh(), 'b'), 'c'), 'd'), 'b', { shift: true });
  assert.deepEqual(selectedIds(state), ['b', 'c', 'd']);
});

test('shift-click without an anchor falls back to a toggle', () => {
  const state = click(fresh(), 'd', { shift: true });
  assert.deepEqual(selectedIds(state), ['d']);
  assert.equal(state.anchor, 'd');
});

test('select all selects every item in order', () => {
  assert.deepEqual(selectedIds(selectAll(fresh())), ids);
});

test('clear keeps the order so select all still works afterwards', () => {
  const state = clear(selectAll(fresh()));
  assert.equal(count(state), 0);
  assert.deepEqual(selectedIds(selectAll(state)), ids);
});

test('setOrder prunes selected ids that disappeared from the DOM', () => {
  const state = click(click(fresh(), 'a'), 'b');
  const rebuilt = setOrder(state, ['b', 'c']);
  assert.deepEqual(selectedIds(rebuilt), ['b']);
  assert.equal(rebuilt.anchor, 'b');
});

test('setOrder drops the anchor when its item is gone', () => {
  const rebuilt = setOrder(click(fresh(), 'a'), ['b', 'c']);
  assert.equal(rebuilt.anchor, null);
  assert.equal(isSelected(rebuilt, 'a'), false);
});

test('clicking an unknown id is a no-op', () => {
  const state = click(fresh(), 'zzz');
  assert.deepEqual(selectedIds(state), []);
});
