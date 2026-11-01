/**
 * Content script: wires the adapter to the overlay and owns the one place where
 * something irreversible happens.
 *
 * Nothing here reaches the network. Selection, hiding and clipboard export are
 * local; conversation deletion is a scripted click on the site's own controls.
 * Every failure is recorded with a reason so a broken selector surfaces as a
 * sentence a person can act on, not as "47 could not be confirmed".
 */

import { resolveAdapter } from '../adapters/registry.ts';
import { sleep } from '../adapters/dom.ts';
import type { Adapter, AdapterItem, RemoveResult, Surface } from '../adapters/types.ts';
import { describeFailures, type RemoveFailure } from '../core/failure.ts';
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

const ROOT_FLAG = 'data-chat-sweep-root';
const REFRESH_DEBOUNCE_MS = 400;
const DELETE_GAP_MS = 180;

interface FailureNote {
  readonly label: string;
  readonly reason: RemoveFailure;
  readonly detail: string;
}

interface LastRun {
  readonly at: string;
  readonly summary: string;
  readonly attempted: number;
  readonly deleted: number;
  readonly failures: readonly FailureNote[];
}

let lastRun: LastRun | null = null;

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
    ...(item.anchor === undefined ? {} : { anchor: item.anchor }),
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

function capitalise(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

async function execute(
  adapter: Adapter,
  request: RunRequest,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<RunReport> {
  const surface = surfaceFor(adapter, request.mode);
  if (surface === null) throw new Error('that list is not available on this page');

  const total = request.ids.length;
  const snapshot = new Map(surface.items(document).map((item) => [item.id, item]));

  if (request.strategy === 'hide') {
    const targets = request.ids
      .map((id) => surface.resolve?.(id, document) ?? snapshot.get(id) ?? null)
      .filter((item): item is AdapterItem => item !== null);

    if (targets.length === 0) throw new Error('the selected messages are no longer on the page');

    const restore = hide(targets.map((item) => item.element));
    onProgress(targets.length, targets.length);
    lastRun = null;
    return {
      completed: targets.length,
      failed: 0,
      aborted: false,
      summary: `Hidden ${targets.length} in this tab. Nothing was deleted — reload to bring them back.`,
      undo: restore,
    };
  }

  let completed = 0;
  const failures: FailureNote[] = [];

  for (const id of request.ids) {
    if (signal.aborted) break;

    // Re-resolve: sidebars re-render, so the element captured at selection time
    // is frequently detached by the time its turn comes.
    const item = surface.resolve?.(id, document) ?? snapshot.get(id) ?? null;
    if (item === null) {
      failures.push({ label: id, reason: 'row-remains', detail: 'row no longer present' });
      onProgress(completed + failures.length, total);
      continue;
    }

    let result: RemoveResult;
    try {
      result = await surface.remove(item, signal);
    } catch (error) {
      result = {
        ok: false,
        failure: 'row-remains',
        detail: error instanceof Error ? error.message : 'remove threw',
      };
    }

    if (result.ok) {
      completed += 1;
    } else {
      failures.push({
        label: item.label,
        reason: result.failure ?? 'row-remains',
        detail: result.detail ?? '',
      });
    }

    onProgress(completed + failures.length, total);
    if (!signal.aborted) await sleep(DELETE_GAP_MS, signal);
  }

  const aborted = signal.aborted;
  const noun = request.mode === 'thread' ? 'message' : 'conversation';
  const nounPlural = `${noun}s`;
  const described = describeFailures(failures.map((failure) => failure.reason));

  let summary: string;
  if (aborted) {
    summary = `Stopped after ${completed} of ${total} ${nounPlural}.`;
  } else if (failures.length === 0) {
    summary = `Deleted ${completed} ${completed === 1 ? noun : nounPlural} with ${adapter.name}'s own delete action.`;
  } else {
    summary = `Deleted ${completed} of ${total} ${nounPlural}. ${capitalise(
      described ?? 'the rest failed',
    )}. Open the Chat Sweep button → Diagnostics for the detail.`;
  }

  debug('run finished', summary);
  lastRun = {
    at: new Date().toISOString(),
    summary,
    attempted: total,
    deleted: completed,
    failures: failures.slice(0, 8),
  };

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
    lastRun,
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

    if (type === 'chat-sweep:status') {
      respond(status());
      return;
    }
    if (type === 'chat-sweep:open' && (mode === 'thread' || mode === 'history')) {
      toggle(mode);
      respond(status());
      return;
    }
    if (type === 'chat-sweep:select-all') {
      overlay.selectAllItems();
      respond(status());
      return;
    }
    if (type === 'chat-sweep:clear') {
      overlay.clearItems();
      respond(status());
      return;
    }
    if (type === 'chat-sweep:apply') {
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
