/**
 * Selection model for the multi-select UI.
 *
 * Holds no DOM references: an item is an opaque string id, and the order array
 * is the authority for what "select all" and shift-range mean. Keeping it pure
 * is what makes range selection testable without a browser.
 */

export interface SelectionState {
  readonly order: readonly string[];
  readonly selected: ReadonlySet<string>;
  /** Anchor for shift-click ranges: the last id clicked without shift. */
  readonly anchor: string | null;
}

export interface ClickModifiers {
  /** Extend from the anchor to this id instead of toggling just this id. */
  readonly shift?: boolean;
}

const NO_IDS: ReadonlySet<string> = new Set<string>();

export const EMPTY_SELECTION: SelectionState = {
  order: [],
  selected: NO_IDS,
  anchor: null,
};

/** Adopt a fresh item list, dropping ids and anchors that no longer exist. */
export function setOrder(state: SelectionState, order: readonly string[]): SelectionState {
  const present = new Set(order);
  const selected = new Set<string>();
  for (const id of order) {
    if (state.selected.has(id)) selected.add(id);
  }
  const anchor = state.anchor !== null && present.has(state.anchor) ? state.anchor : null;
  return { order: [...order], selected, anchor };
}

export function click(state: SelectionState, id: string, modifiers: ClickModifiers = {}): SelectionState {
  const index = state.order.indexOf(id);
  if (index === -1) return state;

  if (modifiers.shift && state.anchor !== null) {
    const anchorIndex = state.order.indexOf(state.anchor);
    if (anchorIndex !== -1) {
      const selected = new Set(state.selected);
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      for (let cursor = start; cursor <= end; cursor += 1) {
        const item = state.order[cursor];
        if (item !== undefined) selected.add(item);
      }
      return { order: state.order, selected, anchor: state.anchor };
    }
  }

  const selected = new Set(state.selected);
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  return { order: state.order, selected, anchor: id };
}

export function selectAll(state: SelectionState): SelectionState {
  const first = state.order[0];
  return {
    order: state.order,
    selected: new Set(state.order),
    anchor: first === undefined ? null : first,
  };
}

export function clear(state: SelectionState): SelectionState {
  return { order: state.order, selected: NO_IDS, anchor: null };
}

export function isSelected(state: SelectionState, id: string): boolean {
  return state.selected.has(id);
}

export function count(state: SelectionState): number {
  return state.selected.size;
}

/** Selected ids in list order — the order deletions are attempted in. */
export function selectedIds(state: SelectionState): string[] {
  return state.order.filter((id) => state.selected.has(id));
}
