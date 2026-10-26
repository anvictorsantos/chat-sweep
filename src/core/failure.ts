/**
 * Why a scripted delete did not happen.
 *
 * The first version of this extension reported "47 could not be confirmed" with
 * no reason, which is useless to both the user and whoever has to fix the
 * selectors. Every failure now carries a machine reason and the UI says it in
 * plain language.
 */

export type RemoveFailure =
  | 'aborted'
  | 'navigated'
  | 'no-trigger'
  | 'menu-unopened'
  | 'no-menu-item'
  | 'unconfirmed'
  | 'row-remains';

const HINTS: Record<RemoveFailure, string> = {
  aborted: 'the run was stopped',
  navigated: 'clicking the row opened the conversation instead of its menu',
  'no-trigger': 'no row menu button could be found',
  'menu-unopened': 'the row menu did not open',
  'no-menu-item': 'the row menu opened but had no Delete entry',
  unconfirmed: 'the Delete confirmation never appeared',
  'row-remains': 'Delete was clicked but the conversation is still listed',
};

export function failureHint(failure: RemoveFailure): string {
  return HINTS[failure];
}

/** Most frequent reason wins; ties keep the first one seen. */
export function tallyFailures(failures: readonly RemoveFailure[]): RemoveFailure | null {
  const counts = new Map<RemoveFailure, number>();
  let best: RemoveFailure | null = null;
  let bestCount = 0;

  for (const failure of failures) {
    const next = (counts.get(failure) ?? 0) + 1;
    counts.set(failure, next);
    if (next > bestCount) {
      best = failure;
      bestCount = next;
    }
  }

  return best;
}

export function describeFailures(failures: readonly RemoveFailure[]): string | null {
  if (failures.length === 0) return null;
  const dominant = tallyFailures(failures);
  if (dominant === null) return null;

  const sameForAll = failures.every((failure) => failure === dominant);
  const hint = failureHint(dominant);

  return sameForAll
    ? `${hint} (every attempt)`
    : `${hint} (${failures.filter((failure) => failure === dominant).length} of ${failures.length})`;
}
