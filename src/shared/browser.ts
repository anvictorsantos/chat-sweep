/**
 * Minimal cross-browser extension API surface.
 *
 * Firefox exposes promises under `browser`, Chrome exposes them under `chrome`
 * for every namespace used here (MV3, Chrome 116+). Only the members this
 * extension actually calls are declared, so there is no runtime type package to
 * keep in sync and no `any` leaking into the UI code.
 */

export interface StorageArea {
  get(keys: null): Promise<Record<string, unknown>>;
}

export interface MessageSender {
  readonly tab?: { readonly id?: number };
}

export interface RuntimeApi {
  readonly id?: string;
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(
      listener: (message: unknown, sender: MessageSender, respond: (response: unknown) => void) => void,
    ): void;
  };
}

export interface TabsApi {
  query(query: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

export interface ExtensionApi {
  readonly runtime?: RuntimeApi;
  readonly tabs?: TabsApi;
  readonly storage?: { readonly local: StorageArea };
}

const globalScope = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };

export const api: ExtensionApi = globalScope.browser ?? globalScope.chrome ?? {};

export function requireRuntime(): RuntimeApi {
  if (api.runtime === undefined) throw new Error('extension runtime unavailable');
  return api.runtime;
}
