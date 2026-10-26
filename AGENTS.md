# AGENTS.md — Threadsweep operating rules

Applies to every agent and every task in this repository. `README.md` explains
what the extension does and, more importantly, what each platform actually
allows. When a document and the source disagree, the source wins — read the file.

## The honesty rule

This extension automates destructive actions on someone's chat history. Two
constraints are non-negotiable:

1. **Never present a weaker action as a stronger one.** Hiding a message is not
   deleting it. If a platform has no per-message delete, the code says so in the
   confirmation dialog, in the popup and in the README. A cheerful "Deleted!"
   for a CSS `display: none` is the worst possible bug in this repo.
2. **Never make the confirmation faster.** Every irreversible action requires an
   acknowledgement plus a typed phrase. Reversible actions state what undoes
   them. `src/core/plan.ts` owns this copy and it is unit tested; do not inline
   confirmation strings in the UI.

## Workflow

1. Name the outcome and the acceptance criterion before touching code.
2. Read the neighbouring adapter, its `Surface` declaration and the matching
   unit test. Follow the pattern already there.
3. Smallest cohesive change, TypeScript, no new runtime dependency without a
   written justification in the PR.
4. Preserve behaviour the task did not ask you to change: Escape handling, focus
   restore, abort, the "no items found" path.
5. Run the checks (below) and report what actually ran.

## Architecture

Dependency direction points inwards:

- `src/core/**` — pure. No DOM except `hide.ts`, which is a documented exception
  because hiding is inherently a DOM operation. No imports from `adapters`,
  `ui`, `content` or `popup`. Unit tested.
- `src/adapters/**` — one platform per file. Declares what it can do through
  `Surface.kind`, never assumes deletion exists. `dom.ts` holds the shared
  interaction helpers; every lookup takes a fallback chain and every interaction
  waits for an observable outcome.
- `src/ui/**` — presentation only. Receives selection callbacks, performs no
  platform work, never touches `chrome.*` except through `shared/browser.ts`.
- `src/content/main.ts` — the only place that performs something irreversible.
- `src/popup/**` — reads status, forwards commands, holds no state.

Rules:

- A new platform is a new file in `src/adapters/` plus a registry entry plus a
  `matches` test. Nothing else.
- **A failed scripted action returns a reason.** `RemoveResult.failure` comes
  from `src/core/failure.ts`; a bare `false` or a generic "could not be
  confirmed" is a bug. The user has to be able to tell whether the row menu was
  missing, the menu opened without a Delete entry, or the row survived the
  click, and the popup must be able to copy that detail.
- **Discovery goes named first, geometry second.** `findTrigger` prefers
  selectors and falls back to `pickTrigger` in `src/core/geometry.ts`. Do not
  remove the fallback and do not rely on CSS `:hover`, which cannot be
  simulated.
- A new surface variant is a new `kind`, and `core/plan.ts` must grow matching
  copy for it — the switch is exhaustive by type, so it will not compile
  otherwise.
- UI strings live in the component that renders them or in `core/plan.ts` for
  anything the user must read before confirming. No duplicated copy.
- The overlay stays inside a shadow root. Never inject a stylesheet, class or
  element into the host page; the host element and its shadow root are the only
  permitted DOM additions, plus the `data-threadsweep-hidden` attribute used by
  hide/undo.
- Accessibility is part of done: every control is a real `<button>`, states are
  exposed (`aria-pressed`, `aria-live`, `role="dialog"`), focus is restored, and
  Escape does the expected thing.

## Acceptance gates

```bash
npm run typecheck
npm test
npm run build
npm run smoke        # headless Chrome; requires Chrome + python3
npm audit --audit-level=high
```

Report each result. `npm run smoke` is mandatory for anything touching
`content/`, `ui/` or `adapters/` — a unit test cannot prove a shadow-DOM
listener fires.

Never claim a check you did not run. Never change a test or the confirmation copy
to make a check pass; fix the behaviour.

## Selector maintenance

When a site changes its DOM:

1. Reproduce with `threadsweep:debug` set to `true` in extension storage.
2. Fix the fallback chain in that platform's adapter only — never in `core`.
3. Add the new selector ahead of the old one, keep the old one while it is
   harmless.
4. Extend `tests/smoke/fixture.html` if the shape you rely on changed.
5. Bump the patch version and note the drift in the commit body.

## Reporting

Changed files, key result, checks run with their outcome, unresolved risks.
Concise. No invented verification.
