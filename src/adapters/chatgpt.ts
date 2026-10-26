import { snippet } from '../core/transcript.ts';
import { collect, driveMenuDelete, normalizeLabel, textOf } from './dom.ts';
import { matchesHost, type Adapter, type AdapterItem, type Surface } from './types.ts';

const HOSTS = [
  'chatgpt.com',
  'chat.openai.com',
  'chatgpt.com.',
  'www.chatgpt.com',
];

/** Each turn is an <article data-testid="conversation-turn-N"> with the role inside. */
const TURN_SELECTORS = ['article[data-testid^="conversation-turn"]', 'article'];

function turnId(element: HTMLElement, index: number): string {
  const testId = element.dataset['testid'];
  if (testId !== undefined && testId.length > 0) return testId;
  const turnId = element.dataset['turnId'];
  if (turnId !== undefined && turnId.length > 0) return turnId;
  return `turn-${index}`;
}

const thread: Surface = {
  kind: 'view-only',
  label: 'messages in this conversation',
  items(root) {
    const seen = new Set<HTMLElement>();
    const turns: HTMLElement[] = [];
    for (const node of collect(root, TURN_SELECTORS)) {
      const article = node.closest('article') ?? node;
      if (seen.has(article)) continue;
      seen.add(article);
      turns.push(article);
    }

    return turns.map((element, index): AdapterItem => {
      const roleNode = element.querySelector('[data-message-author-role]');
      const rawRole = roleNode?.getAttribute('data-message-author-role') ?? 'unknown';
      const role = rawRole === 'user' || rawRole === 'assistant' ? rawRole : 'unknown';
      const text = textOf(element);
      return {
        id: turnId(element, index),
        label: `${role === 'unknown' ? 'Message' : role === 'user' ? 'You' : 'Assistant'}: ${snippet(text)}`,
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

    for (const anchor of collect(root, ['nav a[href^="/c/"]', 'a[href^="/c/"]'])) {
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
      platform: 'chatgpt',
      menuButtonSelectors: [
        'button[aria-label^="Open conversation options" i]',
        'button[data-testid$="-options"]',
        'button[aria-haspopup="menu"]',
        'button[aria-label*="options" i]',
      ],
      menuSelectors: ['[role="menu"]', '[data-radix-menu-content]'],
      itemSelectors: ['[role="menuitem"]', '[role="menuitemcheckbox"]'],
      deleteLabel: /^delete$/iu,
      confirmLabel: /^delete/iu,
      signal,
    });
  },
};

export const chatgpt: Adapter = {
  id: 'chatgpt',
  name: 'ChatGPT',
  thread,
  history,
  notices: [
    'ChatGPT has no per-message delete: message selection hides messages in this tab, or copies the conversation without them.',
    'Conversation deletion drives ChatGPT’s own “⋯ → Delete” menu, one conversation at a time.',
  ],
  matches: (url) => matchesHost(url, HOSTS),
};
