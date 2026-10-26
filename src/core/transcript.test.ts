import assert from 'node:assert/strict';
import test from 'node:test';

import { markdownOf, snippet, type TranscriptEntry } from './transcript.ts';

const entries: TranscriptEntry[] = [
  { id: '1', role: 'user', text: '  what is a sweep?  ' },
  { id: '2', role: 'assistant', text: 'A sweep is a selection pass.' },
  { id: '3', role: 'user', text: '' },
  { id: '4', role: 'unknown', text: 'summary line' },
];

test('every entry gets a role heading and a blank line', () => {
  const markdown = markdownOf(entries);
  assert.equal(
    markdown,
    '**You**\n\nwhat is a sweep?\n\n---\n\n**Assistant**\n\nA sweep is a selection pass.\n\n---\n\n**Message**\n\nsummary line',
  );
});

test('empty messages are skipped rather than left as bare headings', () => {
  assert.doesNotMatch(markdownOf(entries), /\*\*You\*\*\n\n---/u);
});

test('excluded ids are removed, which is the redacted export', () => {
  const markdown = markdownOf(entries, { excluded: new Set(['2']) });
  assert.doesNotMatch(markdown, /selection pass/u);
  assert.match(markdown, /what is a sweep/u);
});

test('a title is emitted as a heading when present', () => {
  assert.match(markdownOf(entries, { title: 'Debugging session' }), /^# Debugging session\n\n/u);
  assert.doesNotMatch(markdownOf(entries, { title: '   ' }), /^#/u);
});

test('snippet flattens whitespace and truncates on a word boundary', () => {
  assert.equal(snippet('a\n\n  b'), 'a b');
  assert.equal(snippet('x'.repeat(200)).length, 90);
  assert.match(snippet('x'.repeat(200)), /…$/u);
});
