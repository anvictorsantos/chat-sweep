/**
 * Confirmation copy builder.
 *
 * The whole point of the extension is that nothing irreversible happens on a
 * single click, so the requirements for a confirmation live here as data and
 * are unit tested: a permanent action demands a typed phrase plus an
 * acknowledgement, a reversible one does not.
 */

export type Scope = 'thread' | 'history';
export type Strategy = 'native' | 'hide';

export interface ConfirmCopy {
  readonly title: string;
  readonly lines: readonly string[];
  readonly consequence: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** When set, the user must type this word before the confirm button unlocks. */
  readonly requiredPhrase: string | null;
  /** When set, the user must tick a box before the confirm button unlocks. */
  readonly acknowledgement: string | null;
  readonly permanent: boolean;
}

export const CONFIRM_PHRASE = 'DELETE';

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function buildConfirm(
  scope: Scope,
  strategy: Strategy,
  count: number,
  platform: string,
): ConfirmCopy {
  if (count < 1) throw new RangeError('a confirmation needs at least one selected item');

  const items = plural(count, 'item', 'items');
  const permanent = strategy === 'native';

  if (scope === 'history') {
    return {
      title: `Delete ${count} ${plural(count, 'conversation', 'conversations')}?`,
      lines: [
        `Threadsweep will open ${platform}'s own menu on each selected conversation and use its Delete action, one conversation at a time.`,
        `This is the same action you would take by hand, so it is just as permanent. The conversations leave your account's history; ${platform} then applies its own backend deletion policy.`,
        'Anything you need from these conversations should be exported first.',
      ],
      consequence: 'This cannot be undone from Threadsweep or from the site.',
      confirmLabel: `Delete ${count} ${plural(count, 'conversation', 'conversations')}`,
      cancelLabel: 'Cancel',
      requiredPhrase: CONFIRM_PHRASE,
      acknowledgement: `I understand ${count} ${items} will be permanently deleted.`,
      permanent,
    };
  }

  if (strategy === 'native') {
    return {
      title: `Delete ${count} ${plural(count, 'message', 'messages')}?`,
      lines: [
        `${platform} exposes a per-message Delete action, so Threadsweep will use it for each selected message.`,
        'Deletion is permanent, and later replies that referenced the message stay as they are.',
      ],
      consequence: 'This cannot be undone.',
      confirmLabel: `Delete ${count} ${plural(count, 'message', 'messages')}`,
      cancelLabel: 'Cancel',
      requiredPhrase: CONFIRM_PHRASE,
      acknowledgement: `I understand ${count} ${items} will be permanently deleted.`,
      permanent,
    };
  }

  return {
    title: `Hide ${count} ${plural(count, 'message', 'messages')} from view?`,
    lines: [
      `${platform} has no per-message delete, so Threadsweep cannot remove a single message from the conversation.`,
      'Instead it removes the selected messages from what this tab renders, which is useful before a screenshot, a screen share or a demo.',
      'Nothing is deleted from your account. The conversation is unchanged for everyone else and for future sessions.',
    ],
    consequence: 'A page reload brings the messages back.',
    confirmLabel: `Hide ${count} ${plural(count, 'message', 'messages')}`,
    cancelLabel: 'Cancel',
    requiredPhrase: null,
    acknowledgement: 'I understand this only changes what I see on this screen.',
    permanent,
  };
}
