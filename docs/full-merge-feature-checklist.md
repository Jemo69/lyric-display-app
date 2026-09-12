# Full Merge — Feature Checklist (contract)

Merge rule: **LOCAL WINS.** This repo is the base. Upstream features are added only where
they are additive and do not replace or restructure anything local. Every box below must
pass after the merge. Nothing merges until every box is checked.

## A · Local-only features (must survive unchanged)

### Bible & worship
- [ ] Bible browser / control panel / import / search
- [ ] Bible splitter (legacy, punctuation, hybrid, geometry)
- [ ] RCCG TPHB song library
- [ ] Instant verse select + auto first-line
- [ ] Switch-in-place on translation change
- [ ] Bible content stays in IndexedDB (`src/utils/db.js` `BibleDatabase`), never localStorage

### App architecture
- [ ] Custom output registry (localStorage-persisted)
- [ ] Lite controller + dynamic output routes
- [ ] Hotkeys store + vim mode
- [ ] Electron modal bridges
- [ ] Display detection modal

## B · Save-on-close (four layers, all must survive)

- [ ] Layer 1 · zustand persist (LyricsStore, HotkeysStore) → localStorage
- [ ] Layer 1b · IndexedDB Bible content via `src/utils/db.js`
- [ ] Layer 2 · electron-store (preferences, dark mode, theme, display assignments)
- [ ] Layer 3 · main-process files (recent files, templates, encrypted secrets)
- [ ] Layer 4 · server session state → `userData/backend/realtime-session-state.json`
- [ ] Close-confirmation flow in `main.js` + `performCleanup()` unchanged
- [ ] `shows.json` / setlist / lyrics save paths still write on quit

## C · Upstream additive features (port where self-contained, non-conflicting)

### Operator tools
- [x] File navigator (indexed search, sort, limits)
  - **PR #20 status:** indexer, IPC, preload, and the renderer UI all landed. `FileNavigatorModal` (browse/search/preview/roots management) and the "Load lyrics file" entry point (ControlPanel button, Ctrl+O/App menu) are wired; the navigator is fully reachable and usable from the desktop app.
- [x] Atomic file save with collision policy
  - **PR #20 status:** `FileNavigatorSaveModal` + `saveWithFileNavigator` are wired into the editor save flows (`useFileSave`: Save, Save & Load, Save New, overwrite-conflict handling) with native-dialog fallback when no indexed folder is available. Writes go through the atomic `write-file` path with `prepareFileNavigatorSave` collision grants.
- [ ] Schedule-driven timer + creator wizard
- [ ] Preview multiview
- [ ] MIDI mappings + preferences

### Robustness
- [ ] DOM sanitization, token rotation, secrets
- [ ] Command-safety policy, IPC sender validation
- [ ] Timer render-clock fix, memory fixes, log caps
- [ ] Rolldown code-splitting, lazy loading
- [ ] Storage error handling + session reconciliation

## D · Persist schema union

- [ ] All local `LyricsStore` fields present after merge (`customOutputs`, `vimMode`, `autoGroupLines`, …)
- [ ] Upstream new fields added alongside (never replacing local)
- [ ] No Bible content moved to localStorage
- [ ] localStorage keys before/after comparison shows only store names + metadata

## Verification gates
- [ ] `bunx vitest run` — all 58+ baseline tests pass
- [ ] `bun run build` — production build succeeds
- [ ] Save-on-close test suite (§06) passes
- [ ] Memory fixes applied one-per-commit with snapshot (§07)
- [ ] GPU Effects toggle shipped with before/after screenshot proof (§08)