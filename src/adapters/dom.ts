/**
 * DOM helpers shared by the platform adapters.
 *
 * Two rules keep selector drift survivable: every lookup takes a fallback chain
 * (first selector that matches anything wins) and every interaction waits for
 * an observable outcome instead of sleeping a guessed amount of time.
 */

import { debug } from '../shared/log.ts';

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

function mouseInit(element: HTMLElement): MouseEventInit {
  const rect = element.getBoundingClientRect();
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons: 1,
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

export function pressEscape(): void {
  const target = document.activeElement ?? document.body;
  for (const type of ['keydown', 'keyup'] as const) {
    target.dispatchEvent(
      new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
    );
  }
}

export interface MenuDeleteOptions {
  readonly row: HTMLElement;
  readonly platform: string;
  readonly menuButtonSelectors: readonly string[];
  readonly menuSelectors: readonly string[];
  readonly itemSelectors: readonly string[];
  readonly deleteLabel: RegExp;
  readonly confirmLabel: RegExp;
  readonly signal: AbortSignal;
}

/**
 * Drive one platform conversation delete: hover the row, open its menu, choose
 * Delete, confirm the dialog, then wait for the row to actually leave the DOM.
 * Row removal is the only trustworthy success signal, so it is what we return.
 */
export async function driveMenuDelete(options: MenuDeleteOptions): Promise<boolean> {
  if (options.signal.aborted) return false;

  const button =
    firstMatch(options.row, options.menuButtonSelectors) ??
    (options.row.parentElement === null
      ? null
      : firstMatch(options.row.parentElement, options.menuButtonSelectors));

  if (button === null) {
    debug(options.platform, 'menu button not found on row');
    return false;
  }

  await hover(options.row);
  await hover(button);
  click(button);

  const menu = await waitFor(() => firstMatch(document, options.menuSelectors), {
    timeout: 2500,
    signal: options.signal,
  });
  if (menu === null) {
    debug(options.platform, 'menu did not open');
    return false;
  }

  const entries = collect(menu, options.itemSelectors);
  const target = entries.find((entry) => options.deleteLabel.test(normalizeLabel(textOf(entry))));
  if (target === undefined) {
    debug(options.platform, 'no delete entry in menu', entries.map((e) => normalizeLabel(textOf(e))));
    pressEscape();
    return false;
  }

  click(target);

  const confirm = await waitFor(() => {
    const dialog = firstMatch(document, ['[role="alertdialog"]', '[role="dialog"]']);
    if (dialog === null) return null;
    const buttons = collect(dialog, ['button', '[role="button"]']);
    return buttons.find((entry) => options.confirmLabel.test(normalizeLabel(textOf(entry)))) ?? null;
  }, { timeout: 2000, signal: options.signal });

  if (confirm !== null) click(confirm);

  const gone = await waitFor(() => (options.row.isConnected ? null : true), {
    timeout: 8000,
    signal: options.signal,
  });
  if (gone === null) {
    debug(options.platform, 'row still present after delete flow');
    pressEscape();
  }
  return gone === true;
}
