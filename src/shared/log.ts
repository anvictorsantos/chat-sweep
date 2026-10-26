/**
 * Debug logging stays behind `threadsweep:debug` in local storage so a selector
 * drift can be diagnosed in a real browser without shipping console noise to
 * every user. Messages never include conversation content.
 */

import { api } from './browser.ts';

let enabled = false;

export async function syncDebugFlag(): Promise<void> {
  try {
    const values = await api.storage?.local.get(null);
    enabled = values?.['threadsweep:debug'] === true;
  } catch {
    enabled = false;
  }
}

export function debug(...parts: readonly unknown[]): void {
  if (!enabled) return;
  console.warn('[threadsweep]', ...parts);
}
