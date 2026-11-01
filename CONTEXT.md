# CONTEXT.md — domain vocabulary and design record

Why this extension is shaped the way it is. `README.md` covers what it does and
how to run it; `AGENTS.md` covers the rules for changing it. This file covers the
words, the platform facts behind the design, and the options that were rejected.

When a statement here contradicts the source, the source wins.

---

## 1. The problem, stated honestly

People want to remove things from a long AI chat: a stale instruction, a pasted
secret, forty throwaway threads. Both ChatGPT and Claude support removing a
**conversation** and neither supports removing a **single message**. There is no
public API for either from a browser extension, and no batch endpoint.

So the product is: a selection layer that makes the action that *does* exist
fast, and that is explicit about the action that does not.

## 2. Platform reality

| Capability | ChatGPT | Claude | Cursor |
| --- | --- | --- | --- |
| Delete a conversation | Yes — row `⋯` → `Delete` → confirm | Yes — row `⋮` → `Delete` → confirm | Desktop app only |
| Delete one message | No | No | No |
| Bulk delete UI | No (one at a time) | Yes, inside the full Chats view | n/a |
| Browser-reachable | Yes (DOM) | Yes (DOM) | No — VS Code-based desktop IDE |

Consequences that shape the code:

- Conversation deletion is **DOM automation of the site's own control**. It is
  the same action a human takes, in the same order, which is what makes the
  result legitimate rather than a local illusion.
- Message "deletion" does not exist, so it is not offered. Message selection
  hides items in the current tab and can export a transcript without them.
- Cursor is detected and refused with an explanation. A button that cannot work
  is worse than no button.

## 3. Vocabulary

Code identifiers are given in backticks so prose and source stay aligned.

| Term | Meaning |
| --- | --- |
| **Sweep** | One selection pass over one surface, ending in one confirmed action. The unit of work. |
| **Mode** (`thread` / `history`) | Which list is being swept: in-conversation messages, or the conversation list in the sidebar. |
| **Item** (`AdapterItem`) | One selectable row: stable-ish `id`, preview `label`, the `element` to act on, `role`, `text`. |
| **Target** (`OverlayItem`) | The overlay's projection of an item: `id`, `label`, `element`, optional `anchor`. No platform knowledge. |
| **Anchor** | The title link inside a history row. The badge is centred on it; `element` (the whole row) is what gets acted on. |
| **Surface** | One list an adapter exposes, with a `kind`: `'native'` (the platform really deletes it) or `'view-only'` (best available is hiding). |
| **Adapter** | One file per platform: `matches`, the surfaces it has, and honest `notices`. |
| **Strategy** (`native` / `hide`) | What the run will actually do, derived from `Surface.kind`. Drives the confirmation copy. |
| **Trigger** | The row's menu control ("⋯"/"⋮"). Found by accessible name first, geometry second. |
| **Menu entry** | The `Delete` item inside the opened menu, matched by label. |
| **Confirmation gate** | The dialog requirements for a run: acknowledgement, typed phrase, or both. |
| **Run** (`RunRequest` → `RunReport`) | Selected ids plus strategy in; counts, abort state and a human summary out. |
| **Failure reason** (`RemoveFailure`) | Machine-readable answer to "which step broke". See §8. |
| **Diagnostics** | Local blob the popup copies: platform, counts, per-row reason and structural note. No message bodies. |

## 4. Pieces and the dependency rule

```
core        pure rules: selection, confirmation copy, failure taxonomy,
            transcript markdown, trigger geometry. No chrome.*, no adapters.
adapters    platform knowledge: item discovery, row-menu driving, DOM helpers.
ui          shadow-DOM overlay: badges, toolbar, dialog, toast. No platform work.
content     composition root: adapter + overlay + the only irreversible action.
popup       status read-out and command forwarding. Holds no state.
shared      browser API shim, debug logging.
```

Dependencies point inwards: `content → {adapters, ui, core}`, `adapters → core`,
`ui → core`. Nothing in `core` imports outwards. `core/hide.ts` is the one DOM
exception, because hiding *is* a DOM operation.

The seam that matters: adapters say **what is possible**, the overlay says **what
it looks like**, and `content/main.ts` is the only place that decides to act.
That is why a platform can be added without touching the confirmation logic, and
why the confirmation logic cannot be bypassed by an adapter.

## 5. Lifecycle of a sweep

1. Content script mounts on a matched host, resolves the adapter, mounts the
   overlay (one shadow root on `document.documentElement`).
2. User opens a mode from popup or overlay. Items are read from the surface;
   empty results produce a message, never an empty toolbar.
3. `setOrder` seeds the selection with the current ids. Badges are positioned
   from live `getBoundingClientRect` and re-laid-out on scroll, resize and DOM
   mutation (throttled 400 ms).
4. Selection is pure state (`core/selection.ts`): click toggles, shift extends
   from the anchor, ⌘/Ctrl+A selects all. Ids that vanish from the DOM are
   pruned, so a streaming page cannot leave phantom selections.
5. *Hide* / *Delete* builds `ConfirmCopy` from `(mode, strategy, count,
   platform)` — the count and the permanence decide what must be satisfied.
6. On confirm, `content/main.ts` re-resolves every id (sidebars re-render),
   then either hides the elements (returning a restore closure for undo) or
   drives the site's menu per row.
7. Each attempt returns `RemoveResult`. Counts go to the progress bar between
   items, so *Stop* stays responsive; the run ends with a summary and, when a
   hide happened, an *Undo* action.

## 6. Selection semantics (deliberate, and tested)

- A plain click **toggles** an item. This is selection mode, not a file manager;
  replacing the selection on every click would fight the checkboxes.
- Shift-click **unions** the range between the anchor and the clicked item, even
  backwards. It never deselects: shift is for growing a sweep.
- Pressing shift with no anchor behaves like a toggle and sets the anchor.
- `select all` walks the order array; `clear` keeps the order so select all works
  again immediately.
- The order array is the single authority for what "all" and "range" mean.

## 7. Confirmation matrix

| Scope | Strategy | Acknowledgement | Typed phrase | Copy says |
| --- | --- | --- | --- | --- |
| conversations | native | required | `DELETE` | permanent, uses the site's own menu |
| messages | native (if it ever exists) | required | `DELETE` | permanent |
| messages | hide | required | none | not a deletion; reload restores |

The gate is data, not markup: `core/plan.ts` returns the copy and the
requirements, and the overlay only renders them. Changing what a user must read
before a destructive action is therefore a reviewed, tested change.

## 8. Failure taxonomy

`RemoveFailure` exists because v0.1 of this extension reported "47 could not be
confirmed", which told nobody anything.

| Reason | Means | Usually fixed in |
| --- | --- | --- |
| `no-trigger` | No menu control found in the row, by name or geometry | row shape / `pickTrigger` weights |
| `menu-unopened` | Trigger clicked, Enter pressed, context menu tried — no menu | trigger choice, portal matching in `findOpenMenu` |
| `no-menu-item` | Menu opened but no `Delete`-like entry | `deleteMatcher`, or the site's labels changed locale |
| `unconfirmed` | Entry clicked, no confirmation dialog and no removal | `confirmMatcher` / dialog role |
| `row-remains` | Delete confirmed but the row is still listed | a second step, or the list did not update |
| `navigated` | The click opened the conversation instead of its menu | trigger selection |
| `aborted` | The user pressed Stop | nothing |

`describeFailures` turns a list of reasons into one sentence ("every attempt" vs
"2 of 3"), which is what the toast shows.

## 9. What we know about the DOMs

Kept here for orientation only. The authority is the adapter file.

- **ChatGPT**: conversation turns are `article[data-testid^="conversation-turn"]`
  with `[data-message-author-role]` inside. Sidebar rows are `a[href^="/c/"]`
  inside `li`s; the row menu is a Radix-style popup with `[role="menuitem"]`.
- **Claude**: user turns are `[data-testid="user-message"]`, replies are
  `.font-claude-response` / `.font-claude-message`. Sidebar rows are
  `a[href^="/chat/"]`; row actions appear in a `[role="menu"]`.
- **Cursor**: nothing. Desktop app.

Two rules follow: platform knowledge never leaves `src/adapters/`, and every
lookup is a fallback chain because these shapes change without announcement.

## 10. Invariants

1. **No stronger claim than the action.** Hide is never called delete.
2. **No irreversible action without the gate.** Both requirements where the
   action is permanent.
3. **Local only.** No network calls, no telemetry, no remote config, no
   background worker to hold state.
4. **Sequential, abortable.** One row at a time with a small gap; Stop wins.
5. **Every failure has a reason**, and the user can copy it.
6. **The host page is untouched** except the overlay host element and the
   `data-chat-sweep-hidden` attribute that undo removes.

## 11. Decisions and rejected alternatives

| Decision | Rejected alternative | Why |
| --- | --- | --- |
| Drive the site's own delete menu | Call internal backend endpoints (`/backend-api/conversation/...`) | Undocumented, auth-scoped, silently breaks, and ToS-questionable. DOM automation performs the same action a person would. |
| Hide + export for messages | Synthesize a "delete" by removing nodes | Would look permanent and not be. The dialog would be lying. |
| One manifest, two build targets | Two hand-maintained manifests | Drift; the only Firefox difference is the Gecko identity block. |
| No background service worker | Service worker for state | Nothing needs to outlive the tab; Firefox MV3 background support is the messiest part of the platform. |
| No framework | Vue/React + store | The UI is one toolbar, one dialog and N badges. Framework weight buys nothing and adds a build surface. |
| Geometry fallback for triggers | Selector-only discovery | CSS `:hover` cannot be simulated, and hover-only buttons lose their names in redesigns. Position survives. |
| Typed phrase + checkbox for permanence | One click, or a single "Are you sure?" | Irreversible and bulk; friction is the feature. |
| Sequential with ~180 ms gap | Parallel burst | Safer with rate limits, keeps Stop meaningful, keeps failures attributable. |
| Per-item failure reasons | Aggregate "could not be confirmed" | The first real-world run deleted 0 of 47 and was undebuggable. |
| Generated PNG icons | Checked-in binaries | Reproducible, reviewable, no drift. |
| `node:test` + headless-Chrome smoke | jsdom unit tests only | The risky part is real DOM interaction; a fixture at a real origin catches what stubs cannot. |

## 12. Known unknowns

- **Portal triggers.** If a site renders the row's menu control outside the row's
  box, geometry will not find it. Diagnostics would show `no-trigger`; the fix is
  a wider search scope, not a weaker confirmation.
- **Localization.** Menu matching is English (`delete`). A non-English UI fails
  at `no-menu-item` with the actual labels in diagnostics.
- **Virtualized lists.** Only mounted rows are selectable; "select all" means all
  *rendered* rows.
- **Message-level delete** may ship on these platforms one day. The adapter
  contract already models it (`kind: 'native'`); no code assumes it will not.
- **Claude's own multi-select** in the full Chats view overlaps with history mode.
  The expectation is that Chat Sweep is used from the sidebar, not from a page
  that already has checkboxes.

## 13. Symptom → file

| Symptom | Look at |
| --- | --- |
| Badges in the wrong place | `src/ui/overlay.ts` (`layout`), `anchor` plumbing in adapters |
| "No conversations found" | adapter `history.items` selectors |
| Run deletes nothing | `src/adapters/dom.ts` (`findTrigger`, `findOpenMenu`), then the adapter's trigger selectors |
| Confirmation dialog missing a requirement | `src/core/plan.ts` and its test |
| Wrong or vague summary | `src/core/failure.ts`, `src/content/main.ts` |
| Copy to clipboard fails | `copyExcluding` in `src/content/main.ts`, `clipboardWrite` permission |
| Firefox does not inject | `dist/firefox/manifest.json`, Firefox site-access settings |
