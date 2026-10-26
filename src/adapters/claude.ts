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
    return false;
  },
};

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
      const row = anchor.closest('li') ?? anchor.parentElement ?? anchor;
      const title = normalizeLabel(textOf(anchor));
      rows.push({
        id: href,
        label: title.length > 0 ? title : 'Untitled conversation',
        element: row,
        role: 'unknown',
        text: title,
      });
    }

    return rows;
  },
  async remove(item, signal) {
    return driveMenuDelete({
      row: item.element,
      platform: 'claude',
      menuButtonSelectors: [
        'button[aria-label*="more options" i]',
        'button[aria-label*="options" i]',
        'button[data-testid$="menu"]',
        '[role="button"][aria-label*="more" i]',
        'button[aria-haspopup="menu"]',
      ],
      menuSelectors: ['[role="menu"]', '[data-radix-menu-content]'],
      itemSelectors: ['[role="menuitem"]'],
      deleteLabel: /^delete$/iu,
      confirmLabel: /^delete$/iu,
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
