import { matchesHost, type Adapter } from './types.ts';

/**
 * Cursor is a desktop IDE built on VS Code. Its chat history lives in local
 * application state, not in a page a browser extension can reach, so this
 * adapter exists to say that plainly instead of offering a button that fails.
 * Deleting a thread there is: Cursor → chat history → thread → delete.
 */
export const cursor: Adapter = {
  id: 'cursor',
  name: 'Cursor',
  notices: [
    'Cursor runs as a desktop IDE, so a browser extension cannot read or change its chat history.',
  ],
  unsupportedReason:
    'Cursor is a desktop IDE: open its chat history panel and delete the thread there. This extension only works on web chat interfaces.',
  matches: (url) => matchesHost(url, ['cursor.com', 'www.cursor.com', 'cursor.sh']),
};
