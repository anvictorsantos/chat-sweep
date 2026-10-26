/**
 * Adapter contract.
 *
 * Each platform gets one adapter, and an adapter declares what it can honestly
 * do rather than pretending every surface supports deletion. `kind: 'native'`
 * means the platform's own delete flow is driven; `'view-only'` means the best
 * available action is hiding the item in this tab, and the confirmation copy in
 * `core/plan.ts` has to say so.
 */

import type { RemoveFailure } from '../core/failure.ts';
import type { TranscriptRole } from '../core/transcript.ts';

export type PlatformId = 'chatgpt' | 'claude' | 'cursor';

export interface AdapterItem {
  readonly id: string;
  /** Short, human-readable preview used in the confirmation dialog. */
  readonly label: string;
  readonly element: HTMLElement;
  /**
   * The visible title/link control inside `element`. History surfaces use it to
   * centre the overlay badge on the text line rather than on the whole row.
   */
  readonly anchor?: HTMLElement;
  readonly role: TranscriptRole;
  readonly text: string;
}

export interface RemoveResult {
  readonly ok: boolean;
  readonly failure?: RemoveFailure;
  /** Structural note for the diagnostics blob. Never conversation text. */
  readonly detail?: string;
}

export interface Surface {
  readonly kind: 'native' | 'view-only';
  /** What this surface lists, e.g. "conversations in the sidebar". */
  readonly label: string;
  items(root: ParentNode): AdapterItem[];
  /**
   * Re-read one item by id. Sidebars re-render, so the element captured when
   * the selection was made is often detached by the time deletion runs.
   */
  resolve?(id: string, root: ParentNode): AdapterItem | null;
  /** Resolve and drive the platform's own delete action. */
  remove(item: AdapterItem, signal: AbortSignal): Promise<RemoveResult>;
}

export interface Adapter {
  readonly id: PlatformId;
  readonly name: string;
  /** In-thread messages. Absent when the platform exposes none. */
  readonly thread?: Surface;
  /** Conversation list in the sidebar. Absent when the platform exposes none. */
  readonly history?: Surface;
  /** Shown in the popup and the dialog, e.g. why deletion is not possible. */
  readonly notices: readonly string[];
  /** Set when the platform cannot be automated at all from a browser. */
  readonly unsupportedReason?: string;
  matches(url: URL): boolean;
}

export function matchesHost(url: URL, hosts: readonly string[]): boolean {
  return hosts.includes(url.hostname);
}
