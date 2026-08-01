# Keyboard Shortcuts with TanStack Hotkeys — Implementation Plan

## Goal
Migrate the app's keyboard shortcuts to `@tanstack/react-hotkeys`, add a user-configurable
keyboard-shortcut menu in User Preferences (display + remap), add a shortcut to cycle Bible
translations, and make `Ctrl/Cmd+F` focus the song search in lyrics mode and the Bible search in
Bible mode.

## Files created
- `src/constants/hotkeyBindings.js` — `DEFAULT_BINDINGS` (id → combo) and `SHORTCUT_GROUPS`
  (categories + labels for the UI cheatsheet / remap list).
- `src/context/HotkeysStore.js` — zustand `persist` store holding `bindings`, with
  `setBinding(id, combo)`, `resetBindings()`, and selector helpers.
- `src/utils/shortcutHelpers.js` — pure, testable helpers:
  - `cycleTranslation(currentId, ids)` → next id (wraps around).
  - `getSearchTargetForContentType(contentType)` → `'bible' | 'song'`.
  - `serializeRecordedHotkey(event)` → canonical combo string (uses `parseKeyboardEvent`,
    `hasNonModifierKey`, `normalizeKeyName` from `@tanstack/hotkeys`); forces `Mod` for the
    primary Ctrl/Cmd modifier so bindings stay cross-platform.
- `src/hooks/LyricDisplayApp/__tests__/shortcutHelpers.test.js` + `hotkeysStore.test.js` (Vitest).

## Files modified
- `src/hooks/LyricDisplayApp/useKeyboardShortcuts.js` — full rewrite. Every shortcut is registered
  via `useHotkey(bindings[id], handler, options)` reading live bindings from `HotkeysStore`.
  Includes:
  - `Mod+F` → focus song search when `contentType==='lyrics'`, else focus Bible search.
  - `Mod+Shift+B` (new) → switch to Bible mode if needed, then `cycleTranslation`.
  - All previously manual shortcuts preserved, plus `Enter` (jump match, scoped to search input)
    and `Escape` (clear search when query present).
- `src/components/LyricDisplayApp.jsx` — pass `contentType`, `activeBibleId`, ordered bible ids,
  and `setActiveBible` into `useKeyboardShortcuts`. Wrap tree in `<HotkeysProvider>` with sensible
  defaults (`preventDefault: true`).
- `src/components/UserPreferencesModal.jsx` — add a "Keyboard Shortcuts" section: grouped list of
  every shortcut with current combo (`formatForDisplay`), a "Record" button (custom recorder using
  `serializeRecordedHotkey`), and a "Reset" button per shortcut + "Reset all".
- `src/constants/shortcuts.js` — add the new cycle-translation entry and keep help text accurate.
- `package.json` — add `vitest` devDependency and `test` script.

## Phases
1. Install `@tanstack/react-hotkeys` + `@tanstack/hotkeys` (done).
2. Create `hotkeyBindings`, `HotkeysStore`, `shortcutHelpers`.
3. Rewrite `useKeyboardShortcuts` to use `useHotkey`.
4. Wire `LyricDisplayApp` (props + `HotkeysProvider`).
5. Add remap UI to `UserPreferencesModal`.
6. Update help constants.
7. Add Vitest config + tests; run lint/typecheck/tests.

## Risks / notes
- `useHotkey` default `ignoreInputs` is true for single keys (j/k/arrows/1/2/3) so they won't fire
  while typing — safer than before. Ctrl/Meta combos fire everywhere (desired for Ctrl+F).
- `Enter` registered with `ignoreInputs:false` + in-handler guard on `data-search-input`.
- `Escape` enabled only when a search query exists, avoiding modal-close conflicts.
