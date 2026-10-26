import { snippet } from '../core/transcript.ts';
import { collect, driveMenuDelete, normalizeLabel, textOf } from './dom.ts';
import { matchesHost, type Adapter, type AdapterItem, type Surface } from './types.ts';

const HOSTS = ['claude.ai', 'www.claude.ai'];

const MESSAGE_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-testid="assistant-message"]',
  '.font-claude-response',
  '.font-claude-message',
];

const TRIGGER_SELECTORS = [
  'button[aria-haspopup="menu"]',
  '[role="button"][aria-haspopup="menu"]',
  'button[aria-label*="more" i]',
  'button[aria-label*="options" i]',
  '[data-testid$="menu"]',
];

const thread: Surface = {
  kind: 'view-only',
  label: 'messages in this conversation',
  items(root) {
    const seen = new Set<HTMLElement>();
    const found: HTMLElement[] = [];
    for (const node of collect(root, MESSAGE_SELECTORS)) {
      if (seen.has(node)) continue;
      seen.add(node);
      found.push(node);
    }

    return found.map((element, index): AdapterItem => {
      const isUser = element.matches('[data-testid="user-message"]');
      const role = isUser ? 'user' : 'assistant';
      const text = textOf(element);
      return {
        id: `claude-message-${index}`,
        label: `${isUser ? 'You' : 'Assistant'}: ${snippet(text)}`,
        element,
        role,
        text,
      };
    });
  },
  async remove() {
    return { ok: false, failure: 'no-trigger', detail: 'platform has no per-message delete' };
  },
};

function rowFor(anchor: HTMLElement): HTMLElement {
  return anchor.closest('li') ?? anchor.parentElement ?? anchor;
}

const history: Surface = {
  kind: 'native',
  label: 'conversations in the sidebar',
  items(root) {
    const rows: AdapterItem[] = [];
    const seen = new Set<string>();

    for (const anchor of collect(root, ['nav a[href^="/chat/"]', 'a[href^="/chat/"]'])) {
      const href = anchor.getAttribute('href');
      if (href === null || seen.has(href)) continue;
      seen.add(href);
      const title = normalizeLabel(textOf(anchor));
      rows.push({
        id: href,
        label: title.length > 0 ? title : 'Untitled conversation',
        element: rowFor(anchor),
        role: 'unknown',
        text: title,
      });
    }

    return rows;
  },
  resolve(id, root) {
    const anchor = Array.from(
      root.querySelectorAll<HTMLElement>('nav a[href^="/chat/"], a[href^="/chat/"]'),
    ).find((candidate) => candidate.getAttribute('href') === id);
    if (anchor === undefined || anchor === null) return null;
    const title = normalizeLabel(textOf(anchor));
    return {
      id,
      label: title.length > 0 ? title : 'Untitled conversation',
      element: rowFor(anchor),
      role: 'unknown',
      text: title,
    };
  },
  async remove(item, signal) {
    return driveMenuDelete({
      row: item.element,
      platform: 'claude',
      triggerSelectors: TRIGGER_SELECTORS,
      deleteMatcher: /^delete\b/iu,
      confirmMatcher: /^delete\b/iu,
      signal,
    });
  },
};

export const claude: Adapter = {
  id: 'claude',
  name: 'Claude',
  thread,
  history,
  notices: [
    'Claude has no per-message delete: message selection hides messages in this tab, or copies the conversation without them.',
    'Claude already supports multi-select inside its full Chats view; conversation mode here works on the sidebar list and drives the same “⋮ → Delete” flow.',
  ],
  matches: (url) => matchesHost(url, HOSTS),
};
