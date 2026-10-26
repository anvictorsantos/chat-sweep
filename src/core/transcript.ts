/**
 * Transcript export: the fallback that makes message selection useful on
 * platforms with no per-message delete. Copying the conversation without the
 * selected messages gives a clean record that does not depend on the DOM.
 */

export type TranscriptRole = 'user' | 'assistant' | 'unknown';

export interface TranscriptEntry {
  readonly id: string;
  readonly role: TranscriptRole;
  readonly text: string;
}

export interface MarkdownOptions {
  readonly title?: string;
  readonly excluded?: ReadonlySet<string>;
}

const HEADING: Record<TranscriptRole, string> = {
  user: '**You**',
  assistant: '**Assistant**',
  unknown: '**Message**',
};

export function markdownOf(
  entries: readonly TranscriptEntry[],
  options: MarkdownOptions = {},
): string {
  const blocks: string[] = [];
  const title = options.title?.trim();
  if (title !== undefined && title.length > 0) blocks.push(`# ${title}`);

  for (const entry of entries) {
    if (options.excluded?.has(entry.id) === true) continue;
    const body = entry.text.trim();
    if (body.length === 0) continue;
    blocks.push(`${HEADING[entry.role]}\n\n${body}`);
  }

  return blocks.join('\n\n---\n\n');
}

export function snippet(text: string, limit = 90): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}
