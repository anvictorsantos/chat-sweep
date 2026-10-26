/**
 * Geometry-based trigger discovery.
 *
 * Sidebars hide their per-row menu button with CSS hover or render it in a
 * portal, so a selector-based lookup misses it and CSS `:hover` cannot be
 * simulated. What survives layout changes is position: the "⋯" control is a
 * small control inside the row, usually on the trailing edge. This module keeps
 * that choice pure so it can be tested without a browser.
 */

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TriggerCandidate<T> {
  readonly value: T;
  readonly box: Box;
  /** `aria-haspopup`, `aria-expanded` or a menu role: the strongest signal. */
  readonly hasPopup: boolean;
  /** An accessible name mentioning options, more, actions or a menu. */
  readonly labelHint: boolean;
  readonly tag: 'button' | 'other';
}

const PAD = 8;

function centerInside(row: Box, box: Box): boolean {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return (
    cx >= row.left - PAD &&
    cx <= row.left + row.width + PAD &&
    cy >= row.top - PAD &&
    cy <= row.top + row.height + PAD
  );
}

function score(row: Box, candidate: TriggerCandidate<unknown>): number {
  // Weighted in tiers so the ordering is obvious: a menu trigger beats a name
  // hint, which beats being a small trailing button.
  let value = 0;
  if (candidate.hasPopup) value += 100;
  if (candidate.labelHint) value += 30;
  if (candidate.tag === 'button') value += 5;

  // Small controls are icon buttons; a row-sized control is the link itself.
  const area = candidate.box.width * candidate.box.height;
  if (area > 0 && area <= 2200) value += 4;

  // Trailing edge beats leading edge when signals tie.
  const center = candidate.box.left + candidate.box.width / 2;
  if (center > row.left + row.width / 2) value += 3;

  return value;
}

/** Best trigger inside the row, or null when nothing plausible sits inside it. */
export function pickTrigger<T>(
  row: Box,
  candidates: readonly TriggerCandidate<T>[],
): T | null {
  let best: TriggerCandidate<T> | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (candidate.box.width <= 0 || candidate.box.height <= 0) continue;
    if (!centerInside(row, candidate.box)) continue;

    const candidateScore = score(row, candidate);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  return best === null ? null : best.value;
}
