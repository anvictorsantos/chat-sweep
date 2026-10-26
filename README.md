# Threadsweep

Select many chat conversations — or many messages inside one — then delete them
behind a confirmation that says exactly what will happen.

A Chrome/Firefox extension (Manifest V3, no build-time framework, no network
access) for **ChatGPT** and **Claude**. Cursor is recognised and explained, not
faked: it is a desktop IDE, so a browser extension cannot reach its history.

**Docs:** this file for use and behaviour · [`CONTEXT.md`](./CONTEXT.md) for the
vocabulary, platform facts and rejected alternatives · [`AGENTS.md`](./AGENTS.md)
for the rules any agent or contributor must follow · [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for setup, debugging and adding a platform.

## What this actually does (read this first)

The premise is worth being precise about, because two of the three products you
named do not support deleting a single message:

| Surface | ChatGPT | Claude | Cursor |
| --- | --- | --- | --- |
| Delete **conversations** | ✅ real deletion, driven through the site's own `⋯ → Delete` | ✅ same flow | ❌ desktop app, not a web page |
| Delete **one message** | ❌ no such feature exists | ❌ no such feature exists | ❌ |
| Hide messages from view | ✅ local to the tab, reversible | ✅ local to the tab, reversible | ❌ |
| Copy the thread without selected messages | ✅ to clipboard | ✅ to clipboard | ❌ |

So message selection does not delete anything, and the confirmation dialog says
so in those words before you can continue. Conversation selection does delete,
via the same menu a human would click, one conversation at a time.

If a platform ever ships a per-message delete, its adapter declares
`kind: 'native'` and the message flow becomes real deletion automatically — the
confirmation copy switches to the permanent wording at that point.

## Features

- **Selection mode** injected as an overlay in a shadow root, so page CSS cannot
  break it and it cannot break the page.
- **Click to toggle, Shift-click for a range, ⌘/Ctrl+A for select all**, plus
  explicit `Select all` / `Clear` buttons in both the in-page toolbar and the
  popup.
- **Confirmation before anything happens.** Conversation deletion requires a
  typed `DELETE` **and** an acknowledgement checkbox; hiding requires the
  acknowledgement only, and states that a reload undoes it.
- **Undo** for hidden messages, with a toast that reports exactly what happened
  (deleted count, failed count, or "stopped").
- **Progress and Stop** during a batch; failures are reported per item rather
  than silently skipped.
- **No network calls, no telemetry, no analytics, no remote config.** Nothing
  leaves the tab.

## Install (unpacked)

```bash
npm install
npm run build
```

- **Chrome / Edge / Brave:** `chrome://extensions` → enable *Developer mode* →
  *Load unpacked* → `dist/chrome`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on*
  → `dist/firefox/manifest.json`. Firefox applies its own site-access controls;
  if the toolbar reports the extension cannot run, allow access for the site in
  the extension's permissions panel.

`npm run zip` produces `dist/threadsweep-<version>-{chrome,firefox}.zip` for a
store upload. Requires the `zip` binary.

## Use

1. Open a conversation or your chat history on a supported site.
2. Click the Threadsweep toolbar button → *Select messages* or
   *Select conversations*.
3. Click the checkbox badges next to items. Shift-click extends from the last
   clicked item; ⌘/Ctrl+A or *Select all* takes everything.
4. *Hide selected* (messages) or *Delete selected* (conversations) opens the
   confirmation dialog. Read it, satisfy its requirements, confirm.
5. Messages: *Undo* in the toast restores them. Conversations: they are gone,
   exactly as if you had used the site's own menu.

Escape closes the dialog, then leaves selection mode.

### When a batch fails

Every attempt reports *why*, so a failed run reads like
`Deleted 0 of 47 conversations. No row menu button could be found (every attempt).`

The row menu is found two ways: by accessible name (`aria-haspopup`, "options",
"more") and, when that name is gone, **by geometry** — the small control inside
the row's box, preferring the trailing edge. If the menu opens but has no Delete
entry, or the confirmation never appears, the toast says which of those it was.

For anything that still fails: open the extension toolbar button → **Copy
diagnostics**. It copies the platform, the counts, the failure reason per row and
a short structural note (`<li role=- controls=2>`) or the menu's item labels.
There is no conversation content in it beyond the row titles you selected.

## Permissions

| Permission | Why |
| --- | --- |
| `host_permissions` for chatgpt.com, chat.openai.com, claude.ai, cursor.com | Inject the selection overlay on those sites only |
| `storage` | One optional debug flag (`threadsweep:debug`), nothing else is stored |
| `clipboardWrite` | *Copy without selected* writes the transcript you asked for |

No background service worker, no `scripting`, no `<all_urls>`, no `tabs`
permission beyond what `activeTab`-style messaging needs.

## Known limits

- **Selectors drift, and a run can fail.** Nothing about a failed attempt is
  guessed: the toast names the step that broke (trigger not found, menu did not
  open, no Delete entry, confirmation missing, row still listed) and the popup
  copies a diagnostics blob. Set `threadsweep:debug` to `true` in extension
  storage for `[threadsweep]` console lines. See `CONTRIBUTING.md`.
- **Only the loaded part of a sidebar is selectable**, because only that is in
  the DOM. Scroll the history list first.
- **Hidden messages come back on reload**, and the site keeps re-rendering while
  a response streams; badges follow the DOM, hidden items stay hidden only in
  this tab.
- **Deleting the conversation you are reading** leaves you on a dead route; the
  site handles that the same way it does when you delete it by hand.
- The delete flow is deliberately sequential (one row per ~200 ms) to stay under
  the sites' own rate limits and to keep *Stop* responsive.

## Development

```
src/core/      pure rules: selection, confirmation copy, failure taxonomy,
               transcript markdown, trigger geometry
src/adapters/  one file per platform: selectors + its own delete flow
src/ui/        shadow-DOM overlay: badges, toolbar, dialog, toast
src/content/   composition: adapter + overlay + the irreversible action
src/popup/     the extension action popup
src/shared/    browser API shim and debug logging
tests/smoke/   fixture + driver that exercise the built bundle in real Chrome
```

Naming and the reasoning behind each piece are in [`CONTEXT.md`](./CONTEXT.md);
the working rules are in [`AGENTS.md`](./AGENTS.md).

Checks:

```bash
npm run typecheck   # strict TS, no emit
npm test            # unit tests over the pure core (node:test, type stripping)
npm run build       # dist/chrome + dist/firefox
npm run smoke       # headless Chrome drives the built bundle against a fixture
npm run verify:all  # all of the above
```

`npm run smoke` is the one that proves the bundle runs: it serves a fixture that
mimics ChatGPT's DOM at `chatgpt.com` (self-signed TLS), loads `dist/chrome`,
then clicks badges, shift-ranges, opens both confirmation dialogs, hides,
undoes, and deletes conversations through a fake site menu — including a row
whose trigger has **no accessible name** (geometry path) and a row that cannot be
driven at all (failure reporting). It needs Chrome and `python3`. Set
`CHROME_PATH` to point elsewhere.

## Privacy

Everything runs in the tab you are looking at. There is no server, no account,
no sync. Selected text is only read to render a badge label and, if you ask for
it, to write a transcript to your clipboard.

## Licence

MIT.
