/**
 * Content script: wires the adapter to the overlay and owns the one place where
 * something irreversible happens.
 *
 * Nothing here reaches the network. Selection, hiding and clipboard export are
 * local; conversation deletion is a scripted click on the site's own controls.
 */

import { resolveAdapter } from '../adapters/registry.ts';
import { sleep } from '../adapters/dom.ts';
import type { Adapter, AdapterItem, Surface } from '../adapters/types.ts';
import { hide } from '../core/hide.ts';
import { markdownOf } from '../core/transcript.ts';
import { api } from '../shared/browser.ts';
import { debug, syncDebugFlag } from '../shared/log.ts';
import {
  SweepOverlay,
  type Mode,
  type OverlayItem,
  type RunReport,
  type RunRequest,
} from '../ui/overlay.ts';

const ROOT_FLAG = 'data-threadsweep-root';
const REFRESH_DEBOUNCE_MS = 400;
const DELETE_GAP_MS = 180;

function surfaceFor(adapter: Adapter, mode: Mode): Surface | null {
  return (mode === 'thread' ? adapter.thread : adapter.history) ?? null;
}

function strategyFor(adapter: Adapter, mode: Mode): 'native' | 'hide' | null {
  const surface = surfaceFor(adapter, mode);
  if (surface === null) return null;
  return surface.kind === 'native' ? 'native' : 'hide';
}

function readItems(adapter: Adapter, mode: Mode): OverlayItem[] {
  const surface = surfaceFor(adapter, mode);
  if (surface === null) return [];
  return surface.items(document).map((item) => ({
    id: item.id,
    label: item.label,
    element: item.element,
  }));
}

async function copyExcluding(
  adapter: Adapter,
  mode: Mode,
  excluded: readonly string[],
): Promise<string> {
  const surface = surfaceFor(adapter, mode);
  if (surface === null) throw new Error('nothing to copy on this page');

  const entries = surface.items(document).map(({ id, role, text }) => ({ id, role, text }));
  const markdown = markdownOf(entries, { excluded: new Set(excluded) });

  await navigator.clipboard.writeText(markdown);

  const kept = entries.length - excluded.length;
  return `Copied ${kept} of ${entries.length} messages to the clipboard, without the ${excluded.length} selected.`;
}

async function execute(
  adapter: Adapter,
  request: RunRequest,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<RunReport> {
  const surface = surfaceFor(adapter, request.mode);
  if (surface === null) throw new Error('that list is not available on this page');

  const available = new Map(surface.items(document).map((item) => [item.id, item]));
  const targets = request.ids
    .map((id) => available.get(id))
    .filter((item): item is AdapterItem => item !== undefined);

  if (targets.length === 0) throw new Error('the selected items are no longer on the page');

  if (request.strategy === 'hide') {
    const restore = hide(targets.map((item) => item.element));
    onProgress(targets.length, targets.length);
    return {
      completed: targets.length,
      failed: 0,
      aborted: false,
      summary: `Hidden ${targets.length} in this tab. Nothing was deleted — reload to bring them back.`,
      undo: restore,
    };
  }

  let completed = 0;
  const failures: string[] = [];

  for (const item of targets) {
    if (signal.aborted) break;
    let removed = false;
    try {
      removed = await surface.remove(item, signal);
    } catch (error) {
      debug('delete failed', error);
    }
    if (removed) {
      completed += 1;
    } else {
      failures.push(item.label);
    }
    onProgress(completed + failures.length, targets.length);
    if (!signal.aborted) await sleep(DELETE_GAP_MS, signal);
  }

  const aborted = signal.aborted && completed + failures.length < targets.length;
  const noun = request.mode === 'thread' ? 'message' : 'conversation';
  const nounPlural = `${noun}s`;

  let summary: string;
  if (aborted) {
    summary = `Stopped after ${completed} of ${targets.length} ${nounPlural}.`;
  } else if (failures.length === 0) {
    summary = `Deleted ${completed} ${completed === 1 ? noun : nounPlural} with ${adapter.name}'s own delete action.`;
  } else {
    summary = `Deleted ${completed} of ${targets.length} ${nounPlural}. ${failures.length} could not be confirmed — ${failures
      .slice(0, 2)
      .join('; ')}.`;
  }

  return { completed, failed: failures.length, aborted, summary };
}

function modesFor(adapter: Adapter): Mode[] {
  const modes: Mode[] = [];
  if (adapter.thread !== undefined) modes.push('thread');
  if (adapter.history !== undefined) modes.push('history');
  return modes;
}

async function start(): Promise<void> {
  if (document.querySelector(`[${ROOT_FLAG}]`) !== null) return;

  const adapter = resolveAdapter(new URL(location.href));
  if (adapter === null) return;

  await syncDebugFlag();
  debug('adapter', adapter.id, 'modes', modesFor(adapter));

  const overlay = new SweepOverlay({
    platform: adapter.name,
    readItems: (mode) => readItems(adapter, mode),
    strategyFor: (mode) => strategyFor(adapter, mode),
    copyExcluding: (mode, excluded) => copyExcluding(adapter, mode, excluded),
    run: (request, signal, onProgress) => execute(adapter, request, signal, onProgress),
  });

  overlay.mount();

  const status = (): Record<string, unknown> => ({
    platform: adapter.name,
    supported: modesFor(adapter).length > 0,
    modes: modesFor(adapter),
    notices: adapter.notices,
    unsupportedReason: adapter.unsupportedReason ?? null,
    ...overlay.status(),
  });

  const toggle = (mode: Mode): void => {
    if (overlay.activeMode() === mode) {
      overlay.close();
    } else {
      overlay.open(mode);
    }
  };

  api.runtime?.onMessage.addListener((message, _sender, respond) => {
    if (typeof message !== 'object' || message === null) return;
    const { type, mode } = message as { type?: unknown; mode?: unknown };

    if (type === 'threadsweep:status') {
      respond(status());
      return;
    }
    if (type === 'threadsweep:open' && (mode === 'thread' || mode === 'history')) {
      toggle(mode);
      respond(status());
      return;
    }
    if (type === 'threadsweep:select-all') {
      overlay.selectAllItems();
      respond(status());
      return;
    }
    if (type === 'threadsweep:clear') {
      overlay.clearItems();
      respond(status());
      return;
    }
    if (type === 'threadsweep:apply') {
      overlay.applyCurrent();
      respond(status());
    }
  });

  // Keep badges attached to the right rows: these UIs stream and re-render.
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const state = overlay.status();
      if (state.active && !state.busy) overlay.refresh();
    }, REFRESH_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void start(), { once: true });
} else {
  void start();
}
