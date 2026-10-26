/**
 * Popup: the only extension page. It reports what the content script found on
 * this tab and forwards commands to it. All state stays in the page, so closing
 * the popup never loses a selection.
 */

import { api } from '../shared/browser.ts';

type Mode = 'thread' | 'history';

interface TabStatus {
  readonly platform: string;
  readonly supported: boolean;
  readonly modes: readonly Mode[];
  readonly notices: readonly string[];
  readonly unsupportedReason: string | null;
  readonly active: boolean;
  readonly mode: Mode | null;
  readonly count: number;
  readonly busy: boolean;
}

const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

const platformTag = byId<HTMLSpanElement>('platform');
const statusLine = byId<HTMLParagraphElement>('status');
const modesBox = byId<HTMLDivElement>('modes');
const quickBox = byId<HTMLDivElement>('quick');
const applyWrap = byId<HTMLDivElement>('apply-wrap');
const applyButton = byId<HTMLButtonElement>('apply');
const selectAllButton = byId<HTMLButtonElement>('select-all');
const clearButton = byId<HTMLButtonElement>('clear');
const notices = byId<HTMLUListElement>('notices');

let current: TabStatus | null = null;

async function send(type: string, mode?: Mode): Promise<TabStatus | null> {
  const tabs = await api.tabs?.query({ active: true, currentWindow: true });
  const tabId = tabs?.[0]?.id;
  if (tabId === undefined) return null;

  try {
    const response = await api.tabs?.sendMessage(tabId, { type, mode });
    return (response as TabStatus | undefined) ?? null;
  } catch {
    return null;
  }
}

async function refresh(type: string, mode?: Mode): Promise<void> {
  const next = await send(type, mode);
  if (next === null) {
    current = null;
  } else {
    current = next;
  }
  render();
}

function render(): void {
  const status = current;

  if (status === null) {
    if (platformTag !== null) platformTag.textContent = 'unsupported page';
    if (statusLine !== null) {
      statusLine.textContent = 'Open a ChatGPT, Claude or Cursor tab to use Threadsweep.';
    }
    modesBox?.replaceChildren();
    if (quickBox !== null) quickBox.hidden = true;
    if (applyWrap !== null) applyWrap.hidden = true;
    if (notices !== null) notices.replaceChildren();
    return;
  }

  if (platformTag !== null) platformTag.textContent = status.platform;

  if (statusLine !== null) {
    if (status.unsupportedReason !== null) {
      statusLine.textContent = status.unsupportedReason;
    } else if (!status.supported) {
      statusLine.textContent =
        'No selectable list was found on this page. Open a conversation or your chat history.';
    } else if (status.busy) {
      statusLine.textContent = 'Working… keep this tab open.';
    } else if (status.active) {
      const noun = status.mode === 'history' ? 'conversation' : 'message';
      statusLine.textContent = `${status.count} ${noun}${status.count === 1 ? '' : 's'} selected.`;
    } else {
      statusLine.textContent = 'Nothing selected yet.';
    }
  }

  modesBox?.replaceChildren();
  if (status.supported && modesBox !== null) {
    for (const mode of status.modes) {
      const isActive = status.active && status.mode === mode;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = isActive ? 'primary' : '';
      button.textContent = isActive
        ? `Stop selecting ${mode === 'thread' ? 'messages' : 'conversations'}`
        : `Select ${mode === 'thread' ? 'messages' : 'conversations'}`;
      button.addEventListener('click', async () => {
        await refresh('threadsweep:open', mode);
        window.close();
      });
      modesBox.append(button);
    }
  }

  const selecting = status.active && !status.busy;
  if (quickBox !== null) quickBox.hidden = !selecting;
  if (applyWrap !== null) applyWrap.hidden = !(selecting && status.count > 0);

  if (applyButton !== null) {
    applyButton.className = status.mode === 'thread' ? 'primary' : 'danger';
    applyButton.textContent = status.mode === 'thread' ? 'Hide selected…' : 'Delete selected…';
  }

  if (notices !== null) {
    notices.replaceChildren();
    for (const note of status.notices) {
      const item = document.createElement('li');
      item.textContent = note;
      notices.append(item);
    }
  }
}

selectAllButton?.addEventListener('click', () => void refresh('threadsweep:select-all'));
clearButton?.addEventListener('click', () => void refresh('threadsweep:clear'));
applyButton?.addEventListener('click', async () => {
  await refresh('threadsweep:apply');
  window.close();
});

void refresh('threadsweep:status');
