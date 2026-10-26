/**
 * DOM helpers shared by the platform adapters.
 *
 * Three rules keep selector drift survivable:
 *  - every lookup takes a fallback chain (first selector that matches anything wins);
 *  - every interaction waits for an observable outcome instead of a guessed sleep;
 *  - when a control cannot be found by name, it is found by geometry, because
 *    a sidebar's "⋯" button is the small control inside the row whether or not
 *    its accessible name survived the last redesign.
 *
 * Every failure is reported as a reason, never as a silent `false`.
 */

import { pickTrigger, type TriggerCandidate } from '../core/geometry.ts';
import { debug } from '../shared/log.ts';
import type { RemoveResult } from './types.ts';

const LABEL_HINT = /\b(option|more|action|menu|settings)\b|⋯|\.\.\./iu;
const NOT_DELETE = /\bdelete all\b|\bclear all\b/iu;

export function firstMatch(root: ParentNode, selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found instanceof HTMLElement) return found;
  }
  return null;
}

/** Fallback chain: the first selector that yields anything is authoritative. */
export function collect(root: ParentNode, selectors: readonly string[]): HTMLElement[] {
  for (const selector of selectors) {
    const found = Array.from(root.querySelectorAll(selector)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    if (found.length > 0) return found;
  }
  return [];
}

export function textOf(element: Element | null | undefined): string {
  if (element === null || element === undefined) return '';
  const value = element instanceof HTMLElement ? element.innerText : element.textContent;
  return (value ?? '').replace(/\u00a0/gu, ' ');
}

export function normalizeLabel(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return getComputedStyle(element).visibility !== 'hidden';
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface WaitOptions {
  readonly timeout?: number;
  readonly interval?: number;
  readonly signal?: AbortSignal;
}

/** Poll a probe until it returns a non-null value, the timeout expires, or abort. */
export async function waitFor<T>(
  probe: () => T | null,
  options: WaitOptions = {},
): Promise<T | null> {
  const timeout = options.timeout ?? 3000;
  const interval = options.interval ?? 80;
  const started = Date.now();

  for (;;) {
    if (options.signal?.aborted === true) return null;
    const value = probe();
    if (value !== null) return value;
    if (Date.now() - started >= timeout) return null;
    await sleep(interval, options.signal);
  }
}

function mouseInit(element: HTMLElement, buttons = 1): MouseEventInit {
  const rect = element.getBoundingClientRect();
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}

/** A full pointer sequence: React handlers on these sites ignore a bare click(). */
export function click(element: HTMLElement): void {
  const init = mouseInit(element);
  const pointer = (type: string): void => {
    if (typeof PointerEvent !== 'function') return;
    element.dispatchEvent(
      new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }),
    );
  };

  pointer('pointerover');
  pointer('pointerenter');
  element.dispatchEvent(new MouseEvent('mouseover', init));
  pointer('pointerdown');
  element.dispatchEvent(new MouseEvent('mousedown', init));
  pointer('pointerup');
  element.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
  element.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
  debug('clicked', element.tagName, element.getAttribute('aria-label') ?? '');
}

/** Hover first: these UIs render row actions only after a real mouseover. */
export async function hover(element: HTMLElement): Promise<void> {
  const init = mouseInit(element);
  if (typeof PointerEvent === 'function') {
    element.dispatchEvent(new PointerEvent('pointerover', { ...init, pointerId: 1, isPrimary: true }));
    element.dispatchEvent(new PointerEvent('pointermove', { ...init, pointerId: 1, isPrimary: true }));
  }
  element.dispatchEvent(new MouseEvent('mouseover', init));
  element.dispatchEvent(new MouseEvent('mousemove', init));
  await sleep(40);
}

export function pressKey(element: HTMLElement, key: string): void {
  element.focus();
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    element.dispatchEvent(
      new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }),
    );
  }
}

export function pressEscape(): void {
  pressKey((document.activeElement instanceof HTMLElement ? document.activeElement : document.body), 'Escape');
}

export function openContextMenu(element: HTMLElement): void {
  const init = mouseInit(element);
  element.dispatchEvent(new MouseEvent('contextmenu', { ...init, button: 2, buttons: 2 }));
}

/**
 * Find the row's menu control.
 *
 * Fast path: a named selector inside the row or its two wrappers. Fallback:
 * geometry — the small trailing control inside the row's box. The fallback is
 * what keeps this working when a site renames or removes the accessible name.
 */
export function findTrigger(row: HTMLElement, selectors: readonly string[]): HTMLElement | null {
  const scopes: Array<HTMLElement | null> = [
    row,
    row.parentElement,
    row.parentElement?.parentElement ?? null,
  ];

  for (const scope of scopes) {
    if (scope === null) continue;
    for (const selector of selectors) {
      const node = scope.querySelector(selector);
      if (node instanceof HTMLElement && isVisible(node)) return node;
    }
  }

  const rowBox = row.getBoundingClientRect();
  const candidates: Array<TriggerCandidate<HTMLElement>> = [];

  for (const node of document.querySelectorAll<HTMLElement>('button, [role="button"], [aria-haspopup]')) {
    if (!isVisible(node)) continue;
    const box = node.getBoundingClientRect();
    candidates.push({
      value: node,
      box: { left: box.left, top: box.top, width: box.width, height: box.height },
      hasPopup: node.hasAttribute('aria-haspopup') || node.getAttribute('aria-expanded') !== null,
      labelHint: LABEL_HINT.test(`${node.getAttribute('aria-label') ?? ''} ${node.textContent ?? ''}`),
      tag: node.tagName === 'BUTTON' ? 'button' : 'other',
    });
  }

  return pickTrigger(
    { left: rowBox.left, top: rowBox.top, width: rowBox.width, height: rowBox.height },
    candidates,
  );
}

export function findOpenMenu(): HTMLElement | null {
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="menu"], [data-radix-menu-content], [data-radix-popper-content-wrapper]',
    ),
  ).filter(isVisible);
  return containers[containers.length - 1] ?? null;
}

const ITEM_SELECTORS =
  '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [data-radix-collection-item], button, [role="button"], a, [tabindex]';

export function findMenuEntry(menu: HTMLElement, matcher: RegExp): HTMLElement | null {
  const candidates = Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTORS)).filter(
    isVisible,
  );

  for (const candidate of candidates) {
    const label = normalizeLabel(textOf(candidate));
    if (label.length > 90) continue; // a container, not an item
    if (matcher.test(label) && !NOT_DELETE.test(label)) return candidate;
  }

  // Some menus are a single element whose own text is the item.
  const selfLabel = normalizeLabel(textOf(menu));
  return matcher.test(selfLabel) && !NOT_DELETE.test(selfLabel) ? menu : null;
}

export function findConfirmButton(matcher: RegExp): HTMLElement | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="alertdialog"], [role="dialog"]'),
  ).filter(isVisible);

  for (const dialog of dialogs) {
    const buttons = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [role="button"]'),
    ).filter(isVisible);

    for (const button of buttons) {
      const label = normalizeLabel(textOf(button));
      if (/cancel|keep|back/iu.test(label)) continue;
      if (matcher.test(label)) return button;
    }
  }

  return null;
}

/** Menu labels are UI copy, not conversation content, so they are safe to log. */
export function menuLabels(menu: HTMLElement): string {
  const labels = Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTORS))
    .map((item) => normalizeLabel(textOf(item)))
    .filter((label) => label.length > 0 && label.length <= 40);

  return Array.from(new Set(labels)).slice(0, 6).join(' / ') || '(no items)';
}

function describeRow(row: HTMLElement): string {
  const buttons = row.querySelectorAll('button, [role="button"]').length;
  const role = row.getAttribute('role') ?? '-';
  return `<${row.tagName.toLowerCase()} role=${role} controls=${buttons}>`;
}

export interface MenuDeleteOptions {
  readonly row: HTMLElement;
  readonly platform: string;
  readonly triggerSelectors: readonly string[];
  readonly deleteMatcher: RegExp;
  readonly confirmMatcher: RegExp;
  readonly signal: AbortSignal;
}

/**
 * Drive one conversation delete: find the row menu, open it (click, then
 * keyboard, then context menu), choose Delete, confirm if asked, and only report
 * success when the row has actually left the DOM.
 */
export async function driveMenuDelete(options: MenuDeleteOptions): Promise<RemoveResult> {
  if (options.signal.aborted) return { ok: false, failure: 'aborted' };

  const startHref = location.href;
  const row = options.row;
  const rowNote = describeRow(row);

  const trigger = findTrigger(row, options.triggerSelectors);
  if (trigger === null) {
    debug(options.platform, 'no row menu trigger', rowNote);
    return { ok: false, failure: 'no-trigger', detail: rowNote };
  }

  await hover(row);
  await hover(trigger);
  click(trigger);

  let menu = await waitFor(findOpenMenu, { timeout: 1200, signal: options.signal });

  if (menu === null) {
    pressKey(trigger, 'Enter');
    menu = await waitFor(findOpenMenu, { timeout: 900, signal: options.signal });
  }

  if (menu === null) {
    openContextMenu(row);
    menu = await waitFor(findOpenMenu, { timeout: 900, signal: options.signal });
  }

  if (menu === null) {
    if (location.href !== startHref) {
      debug(options.platform, 'row click navigated instead of opening a menu');
      return { ok: false, failure: 'navigated', detail: rowNote };
    }
    debug(options.platform, 'menu never opened', rowNote);
    pressEscape();
    return { ok: false, failure: 'menu-unopened', detail: rowNote };
  }

  const entry = findMenuEntry(menu, options.deleteMatcher);
  if (entry === null) {
    const labels = menuLabels(menu);
    debug(options.platform, 'no delete entry', labels);
    pressEscape();
    return { ok: false, failure: 'no-menu-item', detail: `menu: ${labels}` };
  }

  click(entry);

  const confirm = await waitFor(() => findConfirmButton(options.confirmMatcher), {
    timeout: 2000,
    signal: options.signal,
  });
  if (confirm !== null) click(confirm);

  const removed = await waitFor(() => (!row.isConnected ? true : null), {
    timeout: 9000,
    signal: options.signal,
  });

  if (removed === null) {
    const failure = confirm === null ? 'unconfirmed' : 'row-remains';
    debug(options.platform, failure, rowNote);
    pressEscape();
    return { ok: false, failure, detail: rowNote };
  }

  return { ok: true };
}
