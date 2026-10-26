/**
 * The whole user-facing surface: selection badges, the floating toolbar, the
 * confirmation dialog and the result toast, all inside one shadow root.
 *
 * The overlay owns presentation and selection state only. Reading items and
 * performing the work both come from the caller, which keeps the platform
 * specific and irreversible parts in one place (`content/main.ts`).
 */

import { buildConfirm, type ConfirmCopy, type Strategy } from '../core/plan.ts';
import {
  EMPTY_SELECTION,
  clear,
  click as clickSelection,
  count,
  isSelected,
  selectAll,
  selectedIds,
  setOrder,
  type SelectionState,
} from '../core/selection.ts';
import { OVERLAY_CSS } from './styles.ts';

export type Mode = 'thread' | 'history';

export interface OverlayItem {
  readonly id: string;
  readonly label: string;
  readonly element: HTMLElement;
}

export interface RunRequest {
  readonly mode: Mode;
  readonly ids: readonly string[];
  readonly strategy: Strategy;
}

export interface RunReport {
  readonly completed: number;
  readonly failed: number;
  readonly aborted: boolean;
  readonly summary: string;
  /** Present when the result can be reverted, e.g. hidden messages. */
  readonly undo?: () => void;
}

export interface OverlayDeps {
  readonly platform: string;
  readonly readItems: (mode: Mode) => readonly OverlayItem[];
  readonly strategyFor: (mode: Mode) => Strategy | null;
  readonly copyExcluding: (mode: Mode, excluded: readonly string[]) => Promise<string>;
  readonly run: (
    request: RunRequest,
    signal: AbortSignal,
    onProgress: (done: number, total: number) => void,
  ) => Promise<RunReport>;
}

export interface OverlayStatus {
  readonly active: boolean;
  readonly mode: Mode | null;
  readonly count: number;
  readonly busy: boolean;
}

const CHECK_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>';

const MAX_PREVIEW = 5;

function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/gu, (character) => map[character] ?? character);
}

function plural(value: number, one: string, many: string): string {
  return value === 1 ? one : many;
}

interface DialogState {
  readonly mode: Mode;
  readonly strategy: Strategy;
  readonly ids: readonly string[];
  readonly copy: ConfirmCopy;
}

export class SweepOverlay {
  private readonly deps: OverlayDeps;

  private host: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;

  private mode: Mode | null = null;
  private strategy: Strategy | null = null;
  private items: readonly OverlayItem[] = [];
  private selection: SelectionState = EMPTY_SELECTION;
  private readonly badges = new Map<string, HTMLButtonElement>();

  private dialog: DialogState | null = null;
  private busy: { readonly done: number; readonly total: number } | null = null;
  private controller: AbortController | null = null;
  private toast: { readonly text: string; readonly undo?: () => void } | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private layoutQueued = false;

  constructor(deps: OverlayDeps) {
    this.deps = deps;
  }

  mount(): void {
    if (this.host !== null) return;

    const host = document.createElement('div');
    host.setAttribute('data-threadsweep-root', '');
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    shadow.append(style);

    const root = document.createElement('div');
    root.className = 'layer';
    shadow.append(root);

    document.documentElement.append(host);

    this.host = host;
    this.shadow = shadow;
    this.root = root;

    shadow.addEventListener('click', this.onClick);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.requestLayout, { passive: true });
    window.addEventListener('scroll', this.requestLayout, { capture: true, passive: true });

    this.render();
  }

  open(mode: Mode): void {
    const strategy = this.deps.strategyFor(mode);
    if (strategy === null) {
      this.notify(`${this.deps.platform} does not expose that list in a way this extension can drive.`);
      return;
    }

    const items = this.deps.readItems(mode);
    if (items.length === 0) {
      this.notify(
        `No ${mode === 'thread' ? 'messages' : 'conversations'} found. Open a conversation${
          mode === 'history' ? ' history list' : ''
        } and try again.`,
      );
      return;
    }

    this.mode = mode;
    this.strategy = strategy;
    this.items = items;
    this.selection = setOrder(EMPTY_SELECTION, items.map((item) => item.id));
    this.dialog = null;
    this.render();
  }

  close(): void {
    this.mode = null;
    this.strategy = null;
    this.items = [];
    this.selection = EMPTY_SELECTION;
    this.dialog = null;
    this.render();
  }

  /** Re-read the page and keep the selection that still exists. */
  refresh(): void {
    if (this.mode === null || this.busy !== null || this.dialog !== null) return;
    const items = this.deps.readItems(this.mode);
    if (items.length === 0) {
      this.close();
      return;
    }
    this.items = items;
    this.selection = setOrder(this.selection, items.map((item) => item.id));
    this.render();
  }

  status(): OverlayStatus {
    return {
      active: this.mode !== null,
      mode: this.mode,
      count: count(this.selection),
      busy: this.busy !== null,
    };
  }

  /** Commands the toolbar also offers, so the popup can drive the same state. */
  selectAllItems(): void {
    if (this.mode === null) return;
    this.selection = selectAll(this.selection);
    this.syncSelection();
  }

  clearItems(): void {
    if (this.mode === null) return;
    this.selection = clear(this.selection);
    this.syncSelection();
  }

  applyCurrent(): void {
    this.openConfirm();
  }

  activeMode(): Mode | null {
    return this.mode;
  }

  // ---- rendering ---------------------------------------------------------

  private render(): void {
    const root = this.root;
    if (root === null) return;

    const focusedId = this.shadow?.activeElement instanceof HTMLElement
      ? (this.shadow.activeElement.dataset['id'] ?? null)
      : null;

    this.badges.clear();
    root.innerHTML = `
      <div class="layer" data-layer="badges"></div>
      ${this.renderToolbar()}
      ${this.renderToast()}
      ${this.renderDialog()}
    `;

    this.drawBadges();
    this.syncSelection();

    if (focusedId !== null) {
      const restored = this.badges.get(focusedId);
      if (restored !== undefined) restored.focus({ preventScroll: true });
    }

    this.layout();
  }

  private renderToolbar(): string {
    if (this.mode === null) return '';

    const selected = count(this.selection);
    const idle = this.busy === null && this.dialog === null;

    if (this.busy !== null) {
      return `
        <div class="toolbar" role="toolbar" aria-label="Threadsweep progress">
          <span class="toolbar__mode">${this.mode === 'thread' ? 'Messages' : 'Conversations'}</span>
          <span class="toolbar__count" aria-live="polite">Working… ${this.busy.done} of ${this.busy.total}</span>
          <progress max="${this.busy.total}" value="${this.busy.done}"></progress>
          <button type="button" class="action action--ghost" data-act="abort">Stop</button>
        </div>`;
    }

    const isThread = this.mode === 'thread';
    const applyLabel = isThread ? 'Hide selected' : 'Delete selected';

    return `
      <div class="toolbar" role="toolbar" aria-label="Threadsweep selection">
        <span class="toolbar__mode">${isThread ? 'Messages' : 'Conversations'}</span>
        <span class="toolbar__count" data-el="count" aria-live="polite">${selected} selected</span>
        <span class="toolbar__spacer"></span>
        <button type="button" class="action" data-act="all" ${idle ? '' : 'disabled'}>Select all</button>
        <button type="button" class="action" data-act="none" ${selected === 0 ? 'disabled' : ''}>Clear</button>
        ${isThread ? `<button type="button" class="action" data-act="copy" ${selected === 0 ? 'disabled' : ''}>Copy without selected</button>` : ''}
        <button type="button" class="action ${isThread ? 'action--primary' : 'action--danger'}" data-act="apply" ${selected === 0 ? 'disabled' : ''}>${applyLabel}</button>
        <button type="button" class="action action--ghost" data-act="exit">Exit</button>
        <span class="toolbar__hint">Click to select · Shift-click for a range · Esc to exit</span>
      </div>`;
  }

  private renderToast(): string {
    if (this.toast === null) return '';
    return `
      <div class="toast" role="status">
        <span class="toast__text">${escapeHtml(this.toast.text)}</span>
        ${this.toast.undo === undefined ? '' : '<button type="button" class="action" data-act="undo">Undo</button>'}
        <button type="button" class="action action--ghost" data-act="dismiss" aria-label="Dismiss">Dismiss</button>
      </div>`;
  }

  private renderDialog(): string {
    const dialog = this.dialog;
    if (dialog === null) return '';

    const { copy } = dialog;
    const danger = copy.permanent;
    const preview = dialog.ids
      .slice(0, MAX_PREVIEW)
      .map((id) => this.items.find((item) => item.id === id)?.label ?? id);
    const hiddenCount = Math.max(0, dialog.ids.length - preview.length);

    return `
      <div class="scrim">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ts-dialog-title" aria-describedby="ts-dialog-desc" tabindex="-1" data-el="dialog">
          <h2 id="ts-dialog-title">${escapeHtml(copy.title)}</h2>
          <ul id="ts-dialog-desc">${copy.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
          <p class="dialog__consequence">${escapeHtml(copy.consequence)}</p>
          <ul class="dialog__preview" aria-label="Selected items">
            ${preview.map((label) => `<li title="${escapeHtml(label)}">${escapeHtml(label)}</li>`).join('')}
            ${hiddenCount > 0 ? `<li><span>and ${hiddenCount} more ${plural(hiddenCount, 'item', 'items')}</span></li>` : ''}
          </ul>
          ${copy.acknowledgement === null ? '' : `<label><input type="checkbox" data-el="ack"><span>${escapeHtml(copy.acknowledgement)}</span></label>`}
          ${copy.requiredPhrase === null ? '' : `<label class="dialog__field-label" for="ts-phrase">Type ${escapeHtml(copy.requiredPhrase)} to confirm</label><input type="text" id="ts-phrase" data-el="phrase" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${escapeHtml(copy.requiredPhrase)}">`}
          <div class="dialog__actions">
            <button type="button" class="action action--ghost" data-act="cancel">${escapeHtml(copy.cancelLabel)}</button>
            <button type="button" class="action ${danger ? 'action--danger' : 'action--primary'}" data-act="confirm" disabled>${escapeHtml(copy.confirmLabel)}</button>
          </div>
        </div>
      </div>`;
  }

  private drawBadges(): void {
    const layer = this.root?.querySelector('[data-layer="badges"]');
    if (!(layer instanceof HTMLElement) || this.mode === null) return;

    for (const item of this.items) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'badge';
      badge.dataset['act'] = 'toggle';
      badge.dataset['id'] = item.id;
      badge.setAttribute('aria-pressed', 'false');
      badge.setAttribute('aria-label', `Select ${item.label}`);
      badge.title = item.label;
      badge.innerHTML = CHECK_SVG;
      layer.append(badge);
      this.badges.set(item.id, badge);
    }

    const dialog = this.shadow?.querySelector<HTMLElement>('[data-el="dialog"]');
    if (this.dialog !== null) {
      dialog?.addEventListener('input', this.syncConfirmEnabled);
      dialog?.addEventListener('change', this.syncConfirmEnabled);
    }
  }

  private syncSelection(): void {
    for (const [id, badge] of this.badges) {
      const selected = isSelected(this.selection, id);
      badge.classList.toggle('is-selected', selected);
      badge.setAttribute('aria-pressed', String(selected));
    }

    const total = count(this.selection);
    const countNode = this.root?.querySelector('[data-el="count"]');
    if (countNode !== null && countNode !== undefined) {
      countNode.textContent = `${total} selected`;
    }
    const apply = this.root?.querySelector<HTMLButtonElement>('[data-act="apply"]');
    if (apply !== null && apply !== undefined) apply.disabled = total === 0;
    const clearButton = this.root?.querySelector<HTMLButtonElement>('[data-act="none"]');
    if (clearButton !== null && clearButton !== undefined) clearButton.disabled = total === 0;
    const copy = this.root?.querySelector<HTMLButtonElement>('[data-act="copy"]');
    if (copy !== null && copy !== undefined) copy.disabled = total === 0;
  }

  private focusDialog(): void {
    const dialog = this.shadow?.querySelector<HTMLElement>('[data-el="dialog"]');
    dialog?.focus({ preventScroll: true });
  }

  private syncConfirmEnabled = (): void => {
    const copy = this.dialog?.copy;
    if (copy === undefined) return;

    const phraseInput = this.shadow?.querySelector<HTMLInputElement>('[data-el="phrase"]');
    const ack = this.shadow?.querySelector<HTMLInputElement>('[data-el="ack"]');
    const confirm = this.shadow?.querySelector<HTMLButtonElement>('[data-act="confirm"]');
    if (confirm === null || confirm === undefined) return;

    const phraseOk =
      copy.requiredPhrase === null ||
      (phraseInput !== null &&
        phraseInput !== undefined &&
        phraseInput.value.trim().toUpperCase() === copy.requiredPhrase.toUpperCase());
    const ackOk = copy.acknowledgement === null || ack?.checked === true;

    confirm.disabled = !(phraseOk && ackOk);
  };

  // ---- geometry ----------------------------------------------------------

  private requestLayout = (): void => {
    if (this.layoutQueued) return;
    this.layoutQueued = true;
    requestAnimationFrame(() => {
      this.layoutQueued = false;
      this.layout();
    });
  };

  private layout(): void {
    const mode = this.mode;
    if (mode === null) return;

    for (const item of this.items) {
      const badge = this.badges.get(item.id);
      if (badge === undefined) continue;

      const rect = item.element.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        item.element.isConnected;

      badge.hidden = !visible;
      if (!visible) continue;

      const left = mode === 'history' ? rect.right - 36 : Math.max(8, rect.left - 36);
      const top = Math.min(Math.max(8, rect.top + 8), window.innerHeight - 36);
      badge.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }
  }

  // ---- interaction -------------------------------------------------------

  private onClick = (event: Event): void => {
    if (!(event instanceof MouseEvent)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const control = target.closest<HTMLElement>('[data-act]');
    if (control === null) return;

    const act = control.dataset['act'];
    const id = control.dataset['id'];

    switch (act) {
      case 'toggle': {
        if (id === undefined) return;
        event.preventDefault();
        this.selection = clickSelection(this.selection, id, { shift: event.shiftKey });
        this.syncSelection();
        return;
      }
      case 'all':
        this.selection = selectAll(this.selection);
        this.syncSelection();
        return;
      case 'none':
        this.selection = clear(this.selection);
        this.syncSelection();
        return;
      case 'copy':
        void this.copyWithoutSelected();
        return;
      case 'apply':
        this.openConfirm();
        return;
      case 'exit':
        this.close();
        return;
      case 'cancel':
        this.dialog = null;
        this.render();
        return;
      case 'confirm':
        this.confirmAndRun();
        return;
      case 'abort':
        this.controller?.abort();
        return;
      case 'undo':
        this.toast?.undo?.();
        this.hideToast();
        return;
      case 'dismiss':
        this.hideToast();
        return;
      default:
        return;
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.mode === null) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.dialog !== null) {
        this.dialog = null;
        this.render();
      } else if (this.busy === null) {
        this.close();
      }
      return;
    }

    if (this.dialog !== null && event.key === 'Tab') {
      this.trapFocus(event);
      return;
    }

    if (this.dialog === null && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      this.selection = selectAll(this.selection);
      this.syncSelection();
    }
  };

  /** Keep Tab inside the confirmation dialog; the rest of the page is inert. */
  private trapFocus(event: KeyboardEvent): void {
    const dialog = this.shadow?.querySelector<HTMLElement>('[data-el="dialog"]');
    if (dialog === null || dialog === undefined) return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;

    const active = this.shadow?.activeElement;
    if (active === null || active === undefined || !dialog.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private async copyWithoutSelected(): Promise<void> {
    if (this.mode === null) return;
    const ids = selectedIds(this.selection);
    if (ids.length === 0) return;

    try {
      const message = await this.deps.copyExcluding(this.mode, ids);
      this.showToast(message);
    } catch (error) {
      this.showToast(`Copy failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private openConfirm(): void {
    const mode = this.mode;
    const strategy = this.strategy;
    if (mode === null || strategy === null) return;

    const ids = selectedIds(this.selection);
    if (ids.length === 0) return;

    this.dialog = {
      mode,
      strategy,
      ids,
      copy: buildConfirm(mode, strategy, ids.length, this.deps.platform),
    };
    this.render();
    this.focusDialog();
  }

  private confirmAndRun(): void {
    const dialog = this.dialog;
    if (dialog === null) return;

    const confirm = this.shadow?.querySelector<HTMLButtonElement>('[data-act="confirm"]');
    if (confirm === null || confirm === undefined || confirm.disabled) return;

    this.dialog = null;
    void this.execute({ mode: dialog.mode, ids: dialog.ids, strategy: dialog.strategy });
  }

  private async execute(request: RunRequest): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    this.busy = { done: 0, total: request.ids.length };
    this.render();

    try {
      const report = await this.deps.run(request, controller.signal, (done, total) => {
        this.busy = { done, total };
        this.render();
      });

      this.busy = null;
      this.controller = null;
      this.close();
      this.showToast(report.summary, report.undo);
    } catch (error) {
      this.busy = null;
      this.controller = null;
      this.close();
      this.showToast(`Aborted: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private showToast(text: string, undo?: () => void): void {
    this.toast = undo === undefined ? { text } : { text, undo };
    this.render();

    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.toast = null;
      this.render();
    }, 9000);
  }

  private notify(text: string): void {
    this.showToast(text);
  }

  private hideToast(): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toast = null;
    this.render();
  }
}
