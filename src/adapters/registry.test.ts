import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAdapter } from './registry.ts';

const resolve = (href: string): string | null => resolveAdapter(new URL(href))?.id ?? null;

test('chatgpt hosts resolve to the chatgpt adapter', () => {
  assert.equal(resolve('https://chatgpt.com/c/abc'), 'chatgpt');
  assert.equal(resolve('https://chat.openai.com/'), 'chatgpt');
});

test('claude resolves to the claude adapter', () => {
  assert.equal(resolve('https://claude.ai/chat/123'), 'claude');
});

test('cursor is recognised so the popup can explain why it is unsupported', () => {
  const adapter = resolveAdapter(new URL('https://cursor.com/dashboard'));
  assert.equal(adapter?.id, 'cursor');
  assert.equal(adapter?.thread, undefined);
  assert.equal(adapter?.history, undefined);
  assert.match(adapter?.unsupportedReason ?? '', /desktop IDE/u);
});

test('unrelated hosts are ignored', () => {
  assert.equal(resolve('https://example.com/'), null);
  assert.equal(resolve('https://gemini.google.com/app'), null);
});

test('a look-alike host is not matched', () => {
  assert.equal(resolve('https://chatgpt.com.evil.example/c/abc'), null);
  assert.equal(resolve('https://notclaude.ai/chat/1'), null);
});

test('every declared surface reports how it can be acted on', () => {
  for (const adapter of [resolveAdapter(new URL('https://chatgpt.com/')), resolveAdapter(new URL('https://claude.ai/'))]) {
    assert.ok(adapter !== null);
    assert.equal(adapter.thread?.kind, 'view-only');
    assert.equal(adapter.history?.kind, 'native');
  }
});
