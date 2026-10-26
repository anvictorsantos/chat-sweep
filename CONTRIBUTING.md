# Contributing

## Ground rules

- Read `AGENTS.md` first. The honesty rule there is the whole design.
- One cohesive change per PR, typed, with the checks run and reported.
- Adding a capability (a new platform, a new surface) is cheap. Changing what a
  capability means for the confirmation copy is a product decision — open an
  issue first.

## Setup

```bash
npm install
npm run build        # dist/chrome, dist/firefox
npm run verify:all   # typecheck + unit + build + headless smoke
```

Load `dist/chrome` unpacked in `chrome://extensions`, or `dist/firefox` in
`about:debugging`. Rebuild and hit *Reload* after each change; the content
script only runs on page load, so reload the chat tab too.

## Debugging in the wild

```js
// extension DevTools console (the page, not the popup)
chrome.storage.local.set({ 'threadsweep:debug': true });
```

Then reload the tab and watch for `[threadsweep]` lines. They name the adapter,
the modes it resolved, and which lookup failed. They never include message text.

If the overlay mounts but finds nothing, the shape of the DOM moved:

1. Inspect the message container. For ChatGPT, turns are
   `article[data-testid^="conversation-turn"]` with
   `[data-message-author-role]` inside. For Claude, user messages are
   `[data-testid="user-message"]` and replies are `.font-claude-response` /
   `.font-claude-message`.
2. Add the new selector to the front of the fallback chain in that adapter.
3. Keep the old one until it stops being harmless.
4. Update `tests/smoke/fixture.html` to match the shape you now depend on, and
   add an assertion to `tests/smoke/driver.js` if the behaviour changed.
5. Run `npm run verify:all` before opening the PR.

If deletions fail, the reason tells you which step to fix — do not widen the
confirmation or retry blindly:

| Reason | Where to look |
| --- | --- |
| `no-trigger` | Row shape, or `pickTrigger` weights in `src/core/geometry.ts` |
| `menu-unopened` | The trigger is not the row's menu, or the menu is a portal we do not match in `findOpenMenu` |
| `no-menu-item` | `deleteMatcher` vs the menu's actual labels (shown in diagnostics) |
| `unconfirmed` | `confirmMatcher` or the dialog's `role` |
| `row-remains` | Delete was clicked but the list did not update; check for a second confirmation step |

`findTrigger` tries named selectors first and geometry second. When adding a
platform, prefer selectors; the geometry fallback exists for renames, not as the
primary path. Geometry tuning is unit tested in `src/core/geometry.test.ts`, so
change weights there with a test that states the new precedence.

## Adding a platform

1. `src/adapters/<platform>.ts` exporting a `Adapter` with `matches`, `notices`,
   and the surfaces it really has (`thread`, `history`, or neither).
2. Declare capability honestly: `kind: 'native'` only if the platform genuinely
   deletes that item from your account. Otherwise `'view-only'` and let the
   overlay hide and export.
3. Add the host to `public/manifest.base.json` (`host_permissions` and
   `content_scripts[0].matches`).
4. Register it in `src/adapters/registry.ts` and add a `matches` test.
5. Run the full gate.

## Testing

- Pure logic: `src/core/*.test.ts` with `node:test`. No DOM library, no bundler.
- Browser behaviour: `tests/smoke/`. The fixture serves a fake ChatGPT DOM at a
  real `chatgpt.com` origin (self-signed TLS, `--ignore-certificate-errors`) so
  the adapter matches the same way it does in production. The driver talks to
  the content script through a stubbed `chrome.runtime` — the same messages the
  popup sends. Add assertions there for anything a unit test cannot see.

## Releases

1. Bump `version` in `package.json` and `public/manifest.base.json` (both).
2. `npm run verify:all`.
3. `npm run build && npm run zip`.
4. Upload `dist/threadsweep-<version>-chrome.zip` and `-firefox.zip`.
