import { chatgpt } from './chatgpt.ts';
import { claude } from './claude.ts';
import { cursor } from './cursor.ts';
import type { Adapter } from './types.ts';

export const ADAPTERS: readonly Adapter[] = [chatgpt, claude, cursor];

/** First matching adapter wins; an unknown host is simply not our business. */
export function resolveAdapter(url: URL): Adapter | null {
  return ADAPTERS.find((adapter) => adapter.matches(url)) ?? null;
}
