# Plan: upstream-sync-v6.6.2 — Agent Read

**Plan Name:** upstream-sync-v6.6.2  
**Main Goal:** Single big merge of upstream PeterAlaks/lyric-display-app 6.6.2 (commit a1ad954) into Jemo69 fork while preserving ALL local additions (Bible module, customOutputs createCustomOutput/slug/sourceOutputKey, outputActions automation via runAllOutputActions, vimMode, sidebarCollapsed, settingsCollapsed, sidebarWidth, headerCompact) and preferring local implementation when both implement same feature.

Source repo: https://github.com/PeterAlaks/lyric-display-app
Local base: 6.3.5 (README says 6.2.8) with custom Bible + automation + customOutputs
Target: 6.6.2 (a1ad954 NDI Hardening, etc)

---

## Research Summary

Upstream diff `refs/heads/main..refs/heads/upstream-master` shows ~180 file changes:

- Fork point ~ nzpnwltz (4f514f70) but local diverged with:
  - `src/context/BibleStore.js` + 4 Bible components + worker `bibleSearch.worker.js` + `db.js` + `shared/bible/` (not listed in diff because upstream deleted them)
  - `src/context/LyricsStore.js` extended with bibleReferencePosition/Size, showBibleVersion, customOutputs map, outputActions, vimMode, sidebar states
  - `src/pages/RegularOutput.jsx` / StageOutput.jsx with bibleReference overlay
  - Output automation utils
- Upstream deletes Bible files (D in diff) — **must restore them** per user decision.
- Upstream adds modular IPC: `main/ipc/*.js` vs old `main/ipc.js`+handlers mixed. Old file must be reconciled — keep any Bible/global modal bridges, migrate rest to modular.
- Server restructuring: old `server/index.js` monolithic + `events.js`, `joinCodeGuard.js`, `secretManager.js` -> new `server/auth/*`, `server/config/*`, `server/realtime/*`, `server/routes/*`, `server/security/*`, `server/media/*`, `server/middleware/*`
- Parser: `shared/lyricsParsing.js` monolithic -> `shared/lyricsParsing/{constants,grouping,helpers,index,lineSplitting,lrcParser,normalGroupCandidates,onlineParser,repeatableSections,runtimeConfig,sections,separators,structureTags,textCleanup,translation,txtParser,txtProcessor}.js` + `shared/documentTextExtraction.js`, `shared/lyricImportRegistry.js`, `shared/outputRegistry.js`, `shared/setlistLimits.js`
- UI: LyricVideoStudio 8 components, NdiOutputSettingsModal, ObsDockLayout/ObsDockInfoModal/ObsSetupRoute/TimerControlRoute/ObsDockRoute, ProjectOutputModal, OperatorActionLogModal, PreServiceHealthModal, PresentationImportModal, UserMediaModal, UserPreferencesModal with 4 sections, QuickParserPopover, backgroundBand/transition/fullscreen sections split.

---

## Vocabulary Alignment (AGENTS.md)

Use existing naming: output1/output2/stage/customOutputs, lyrics/selectedLine/lyricsFileName, Bible module terminology, setlist, automation/outputActions. Preserve AGENTS.md terms.

---

## Files Modifying vs Creating

### Modifying (must merge, prefer mine on conflict)

- `package.json` (+ scripts electron-dev-headless, verify-blockmaps, write-build-info, etc, keep bun.lock, keep custom deps)
- `main.js` (headless startup flow, tray, devServer, obsDockStartup)
- `preload.js` (new bridges: NdiBridge, PreferencesLoaderBridge, UpdaterBridge)
- `src/App.jsx` (routing: ObsDockRoute, TimerControlRoute, LyricVideo pages, keep LazyBoundary + Bible sidebar logic)
- `src/components/AboutAppModal.jsx`
- `src/components/AuthStatusIndicator.jsx`
- `src/components/AutoplaySettings.jsx`
- `src/components/ConnectionBackoffBanner.jsx`
- `src/components/ConnectionDiagnosticsModal.jsx`
- `src/components/DraftApprovalModal.jsx`
- `src/components/EasyWorshipImportModal.jsx`
- `src/components/FontSelect.jsx`
- `src/components/HelpContent.jsx`
- `src/components/IntegrationInstructions.jsx`
- `src/components/IntelligentAutoplayInfo.jsx`
- `src/components/LyricDisplayApp.jsx` — **CRITICAL**: Keep bibleIds, showBibleSidebar, isBibleMode, BibleControlPanel import, outputActions, sidebarCollapsed/width, headerCompact, createCustomOutput local impl (user said keep yours). Merge upstream new hooks: useControlPanelFileActions, useCustomOutputActions (but adapt to keep yours), useOutputControlActions, useLineCounterText, useLrcTimestampHydration, etc.
- `src/components/LyricsList.jsx` — split into LyricRow, LyricLineContent, ContextMenu, SectionChips
- `src/components/MobileLayout.jsx`
- `src/components/NewSongCanvas.jsx` — keep canvas logic + add CanvasContextMenu, FloatingToolbar, MeasurementLayer, SearchPanel, Header
- `src/components/OnlineLyricsSearchModal.jsx` + ProviderAdvancedPanel, LyricsSearchResults
- `src/components/OnlineLyricsWelcomeSplash.jsx`
- `src/components/OutputSettingsPanel.jsx` + 7 section components
- `src/components/OutputSettingsShared.jsx`
- `src/components/OutputTemplatesModal.jsx`
- `src/components/PreviewOutputsModal.jsx`
- `src/components/QRCodeDialog.jsx`
- `src/components/SaveTemplateModal.jsx`
- `src/components/SearchBar.jsx`
- `src/components/SetlistModal.jsx`
- `src/components/SongInfoModal.jsx`
- `src/components/StageSettingsPanel.jsx`
- `src/components/StageTemplatesModal.jsx`
- `src/components/SupportDevelopmentModal.jsx`
- `src/components/WelcomeSplash.jsx`
- `src/components/WindowChrome/DesktopShell.jsx`, `TopMenuBar.jsx`
- `src/components/modal/ModalProvider.jsx`
- `src/components/toast/ToastProvider.jsx`
- `src/components/ui/*` (color-picker, input, select, switch, tooltip, slider, paint-picker, tutorial-popover)
- `src/constants/easyWorship.js`, `shortcuts.js` + `modalEvents.js`, `presentationImport.js` (new)
- `src/context/ControlSocketProvider.jsx`
- `src/context/LyricsStore.js` — **CRITICAL CONFLICT**: Upstream split into 8 slices `src/context/lyricsStore/*Slice.js`. Local has monolithic + customOutputs + bibleReference fields + outputActions + vimMode + sidebar states. Resolution: Keep monolithic as base but incorporate new slices as internal functions — OR keep monolithic and create compatibility layer: create `lyricsStore/*Slice.js` that re-export from monolithic? Better: preserve your LyricsStore structure (user says pick mine) and create shim slices that delegate to your store for timerSlice etc missing. Include new fields: timer controls, preferences, appShell. Ensure partialize keeps your fields + new ones. Preserve `createCustomOutput` slug+type+sourceOutputKey, keep `outputActions`, `bibleReference*`, etc.
- `src/hooks/LyricDisplayApp/*` (useDragAndDrop, useElectronListeners, useKeyboardShortcuts, useLyricsLoader, useMenuShortcuts, useOutputSettings, useSetlistActions, useSupportDevModal)
- `src/hooks/OutputSettingsPanel/*`
- `src/hooks/SetlistModal/useSetlistLoader.js`
- `src/hooks/WindowChrome/*`
- `src/hooks/useAuth.js`, `useAutoplayManager.js`, `useDarkModeSync.js`, `useFileUpload.js`, `useMultipleFileUpload.js`, `useSearch.js`, `useSocket.js`, `useSocketEvents.js`, `useStoreSelectors.js`, `useSyncOutputs.js`, `useToast.js`
- `src/index.css`
- `src/main.jsx` (AppProviders, bridges)
- `src/pages/Output1.jsx`, `Output2.jsx`, `Stage.jsx` — keep bibleReference overlay, merge new OutputPage/RegularOutput abstraction
- `src/utils/*` (artistDetection, asyncLyricsParser, connectionManager, errorClassification, logger, lyricsFormat, markdownParser, maxLinesCalculator, network, outputTemplates, parseLyrics, timestampHelpers, toastSounds)
- `src/workers/lyricsParser.worker.js`
- `server/index.js` + new structure files (keep socket auth logic but align)
- `main/*` non-ipc files (backend, cleanup, displayDetection, displayManager, fileHandler, etc)

### Creating (from upstream, new in target — add as-is)

- `obs-dock.html` (primary headless entry)
- `build/Start LyricDisplay Dock Mode.cmd`, `entitlements.mac.plist`, `installer.nsh`
- `docs/PROJECT_STRUCTURE.md`, `docs/openapi.yaml`, `docs/asyncapi.yaml`, `docs/crossplatformbuilds.md`
- `.github/FUNDING.yml`, workflows `build-release.yml`, `test-platform-builds.yml`
- `main/appIdentity.js`, `main/devServer.js`, `main/externalControl.js`, `main/ipc/{app.js,auth.js,display.js,easyworship.js,files.js,index.js,lyricVideoExport.js,lyrics.js,misc.js,preferences.js,presentation.js,recents.js,security.js,setlist.js,templates.js,updater.js,window.js}`, `main/logRetention.js`, `main/logging.js`, `main/lyricVideoMediaProtocol.js`, `main/lyricsProviders/*`, `main/menuBridge.js`, `main/midiController.js`, `main/ndi/{installer.js,ipcClient.js,outputSettings.js}`, `main/ndiManager.js`, `main/obsDockStartup.js`, `main/oscController.js`, `main/presentation.js`, `main/tray.js`, `main/userPreferences.js`, `scripts/check-static.js`, `electron-dev-headless.js`, `register-dev-protocol.js`, `verify-blockmaps.js`, `write-build-info.js`
- `server/auth/{httpAuth.js,joinCodeGuard.js,obsDockPairing.js,permissions.js,socketAuth.js,tokens.js}`, `server/config/clientTypes.js`, `server/media/{backgroundMedia.js,mediaTypes.js,paths.js,uploads.js,userMedia.js}`, `server/middleware/{cors.js,localhostOnly.js}`, `server/realtime/{actionLog.js,broadcast.js,handlers/*,liveSafety.js,sessionPersistence.js,state.js,utils.js}`, `server/routes/{adminSecrets.js,appControl.js,auth.js,connection.js,health.js,integrations.js,media.js,outputs.js,templates.js}`, `server/security/secretManager.js`
- `shared/*` new modular parsing files (documentTextExtraction, lyricImportRegistry, outputRegistry, setlistLimits, lyricsParsing/*)
- `src/components/AppErrorBoundary.jsx`, `AppProviders.jsx`
- `src/components/LyricDisplayApp/{ControlPanelHeaderActions,ControlPanelModals,LyricsDragOverlay,LyricsWorkspace,QuickParserPopover}.jsx`
- `src/components/LyricVideoStudio/*` 8 files
- `src/components/LyricsList/*` 6 files
- `src/components/NdiOutputSettingsModal.jsx`
- `src/components/NewSongCanvas/{CanvasContextMenu,CanvasFloatingToolbar,CanvasMeasurementLayer,CanvasSearchPanel,SongCanvasHeader}.jsx`
- `src/components/ObsDockInfoModal.jsx`, `ObsDockLayout.jsx`
- `src/components/OnlineLyricsSearchModal/{LyricsSearchResults,ProviderAdvancedPanel}.jsx`
- `src/components/OperatorActionLogModal.jsx`
- `src/components/OutputSettingsPanel/*` section components
- `src/components/PreServiceHealthModal.jsx`, `PresentationImportModal.jsx`, `ProjectOutputModal.jsx`, `ProjectionExitHint.jsx`
- `src/components/TimerControlModule.jsx`, `UserMediaModal.jsx`
- `src/components/UserPreferencesModal.jsx` + 4 sections
- `src/components/bridges/{NdiBridge,NdiUpdaterBridge,PreferencesLoaderBridge,UpdaterBridge,WelcomeSplashBridge,index.js}` + move existing bridges
- `src/components/modal/modalActions.jsx`
- `src/components/output/LyricVisualFrame.jsx`
- `src/components/routes/{ConditionalDesktopShell,MainWindowShell,ObsDockRoute,ObsSetupRoute,TimerControlRoute}.jsx`
- `src/components/ui/{paint-picker,slider,tutorial-popover}.jsx`
- `src/context/NdiStore.js`, `src/context/lyricsStore/{appShellSlice,autoplaySlice,lyricsSessionSlice,outputSlice,preferencesSlice,setlistSlice,stageSlice,timerSlice}.js`
- `src/hooks/LyricDisplayApp/{useControlPanelFileActions,useCustomOutputActions,useLineCounterText,useLrcTimestampHydration,useOutputControlActions,usePendingLyricsLoad,usePendingSavedVersionPrompt,useQuickParserControls,useRegisterCustomOutputs,useResetLyricsScroll,useSetlistNavigation}.js`
- `src/hooks/LyricsList/{useLyricsListGrouping,useLyricsListHistory,useLyricsListRows,useLyricsListSelection,useSectionNavigation,useStageOnlyTutorial}.js`
- `src/hooks/NewSongCanvas/{useCanvasDismissalEffects,useCanvasEditorInteractions,useCanvasEditorLayout,useCanvasLoadLifecycle,useCanvasNavigationActions,useCanvasSearchHighlight,useDraftEvents,useDraftLoader,useEditorUndoRedoShortcuts,usePendingCanvasFocus}.js`
- `src/hooks/OnlineLyricsSearchModal/useLyricsProviderKeys.js`
- `src/hooks/OutputSettingsPanel/{useFullscreenAdvancedAutoExpand,useFullscreenElementMedia}.js`
- `src/hooks/UserPreferencesModal/{useMidiPreferences,useNdiPreferences,useNumberPreferenceDrafts,useOscPreferences,usePreferencesPersistence,useSecurityPreferences}.js`
- `src/hooks/{useActionLogBridge,useExternalControl,useLiveSafetyBridge,useSharedTimer}.js`
- `src/integrations/obs/{createObsBrowserSource,obsWebSocketClient}.js`, `src/integrations/sourceUrls.js`
- `src/pages/{LyricVideoExportFrame,LyricVideoLiveOutput,LyricVideoStudio,ObsSetup,OutputPage,TimeDisplay}.jsx`
- `src/utils/{chunkLoadRecovery,clientType,lyricDisplayDock,lyricLineNavigation,lyricVideoLineText,lyricVideoStudioState,lyricVideoTimeline,lyricsSyncPayload,outputLabels,paint,stageMessages,timerUtils}.js`
- `tests/*` (27 new test files)

### Preserving (your unique files that upstream deleted — KEEP)

- `src/components/Bible/BibleBrowser.jsx`
- `src/components/Bible/BibleControlPanel.jsx`
- `src/components/Bible/BibleImportModal.jsx`
- `src/components/Bible/BibleSearchModal.jsx`
- `src/context/BibleStore.js`
- `src/utils/bibleReference.js`
- `src/utils/bibleSearch.worker.js`
- `src/utils/db.js` (bibleDb)
- `shared/bible/` directory (parser)
- `src/components/RccgTphbSongModal.jsx` (?) — upstream deleted, check if you still need; keep if referenced.
- Any `RccgTphbStore` if present.
- `src/utils/shortcutHelpers.js` bible helpers
- `API.md`, existing custom docs

---

## Phases (Single Big Merge, internal order matters)

Despite user choice "single big merge" (one jj bookmark), execution must be ordered to reduce conflicts.

### Phase 0 — Safety & Tooling
- `jj` status, create bookmark `sync-6.6.2`
- `bun install` verify, `bun run test` baseline (your fork has bible tests)
- Backup current `src/context/LyricsStore.js` and `src/components/LyricDisplayApp.jsx` to `/tmp/opencode` for diff reference
- Enable `careful` guard for destructive operations
- Write detailed log to `plans/implementation_log.md`

### Phase 1 — Foundation: Build infra, Main process, Shared
- Merge `package.json` scripts (electron-dev-headless, check-static, etc). Keep version 6.3.5 -> bump to 6.6.2 after success. Merge deps (no drop).
- Merge `main.js`, `preload.js` from upstream, re-insert Bible ipc if needed.
- Create `main/ipc/*.js` modular structure from upstream; keep local fileHandler + provider credentials.
- Merge `main/` rest: appIdentity, devServer, externalControl, logRetention, logging, midiController, ndi/*, ndiManager, obsDockStartup, oscController, presentation, tray, userPreferences, cleanup, etc.
- Merge `scripts/*`
- Merge `shared/` — **preserve your shared/bible/** alongside new `shared/lyricsParsing/*`. Adapt `shared/lyricsParsing.js` old to re-export new index for backward compat. Create `shared/documentTextExtraction.js`, `lyricImportRegistry.js`, `outputRegistry.js` (but keep your customOutput slug logic as override — see decision), `setlistLimits.js`.
- Merge `public/` new backgrounds/logos.
- Merge `build/` templates, `obs-dock.html`.

Acceptance: `bun run build` still passes at least vite build? Try `vite build`.

### Phase 2 — Server Hardening
- Replace `server/` old monolith with new structure:
  - `server/auth/*` (socketAuth with client purpose normalization, obsDockPairing, joinCodeGuard, permissions)
  - `server/config/clientTypes.js`
  - `server/middleware/*`
  - `server/media/*`
  - `server/realtime/*` with new handlers + actionLog + liveSafety + sessionPersistence
  - `server/routes/*`
  - `server/security/secretManager.js`
- Keep any custom routes for Bible? none.
- Ensure port 4000 stays.
- Add `server/package.json` if upstream changed.
- Test: `bun run server` alone, check socket auth still allows mobile.

### Phase 3 — Store & Core State (Most Conflict)
- LyricsStore: User demanded "pick mine". So:
  - Keep existing `src/context/LyricsStore.js` as primary.
  - Create new `src/context/lyricsStore/*Slice.js` files from upstream but rewrite their internals to proxy to main store? Alternative acceptable: keep your monolith AND add new slices as separate stores that coexist. Simpler: refactor your store to include new keys: timer controls (timerSlice), preferences (preferencesSlice with MIDI/OSC/NDI settings), appShell, stage improvements, etc. Merge their defaults without losing your bibleReference*, customOutputs, outputActions, vimMode, sidebar* fields.
  - Preserve `partialize` list to include your fields + new timer fields.
  - Create `src/context/NdiStore.js` as-is from upstream.
  - KEEP `src/context/BibleStore.js` as-is (no merge).
- `useStoreSelectors.js` — merge upstream selectors + your customOutput, bibleVersion, outputActions selectors.
- Ensure zustand persist version bump handled via `onRehydrateStorage` keeping migration from localStorage to IndexedDB for bibles (your logic).

### Phase 4 — Frontend Components & Hooks
- `src/components/LyricDisplayApp.jsx`: Merge upstream's split into `LyricsWorkspace`, `ControlPanelHeaderActions`, etc., but keep Bible tab logic, outputActions UI if exists, custom new-output form logic. Keep LazyBoundary + lazy SetlistModal.
- `src/components/LyricsList.jsx` -> new subcomponents row/content.
- `src/components/NewSongCanvas.jsx` -> add floating toolbar, context menu, measurable layer.
- `src/components/OutputSettingsPanel.jsx` -> merge section splits while keeping bibleReference position control.
- `src/components/StageSettingsPanel.jsx` -> same.
- Add all new components listed in "Creating".
- Merge hooks: `useDragAndDrop` with pending lyrics handling, `useKeyboardShortcuts` with bible hotkeys (keep your cycleTranslation), `useLyricsLoader` with new text extraction, `useSetlistActions`, etc.
- Add new hooks entirely from upstream (list in Creating).
- `src/pages/Output1/2/Stage` + new `OutputPage`, `RegularOutput`, `TimeDisplay`, `LyricVideoStudio`, etc. Keep your bibleReference overlay implementation but ensure it uses new LyricVisualFrame.
- Add `src/integrations/obs/*` etc.

### Phase 5 — NDI Full Enable
- User wants Full NDI.
- Clone companion: `git clone https://github.com/PeterAlaks/lyricdisplay-ndi` into `lyricdisplay-ndi/` per CONTRIBUTING.
- Run its install steps (npm install in that dir, check main/ndi/installer.js expects path).
- Wire `main/ndiManager.js` + `NdiBridge`.
- Add `NdiOutputSettingsModal` into TopMenuBar actions.
- Test: build with NDI dev flag; if fails, log and stub.

### Phase 6 — Lyric Video Studio & OBS Dock
- Add Lyric Video Studio pages + timeline utils.
- Add obs-dock.html dev mode `?mode=dev`.
- Merge `src/App.jsx` routing to include `/lyric-video-studio`, `/obs-setup`, `/timer-control`, `/output/*` dynamic.
- Add TimerControlModule to control panel.
- Verify headless flow: `npm run electron-dev:headless` launches without main window, protocol `lyricdisplay://`.
- Test OBS dock setup page.

### Phase 7 — Enhanced Imports
- Ensure `shared/documentTextExtraction.js` handles .md/.rtf/.docx via upstream implementation (uses JS libs already in deps).
- Wire into `useFileUpload` + `useMultipleFileUpload` + `useDragAndDrop` + `useControlPanelFileActions`.
- Add `PresentationImportModal` + `UserMediaModal` with bundled template media.
- Verify bundled media copy from `public/backgrounds/*`.

### Phase 8 — Polish & Hardening
- Merge UI polish: button rounded-full, settings sections, background band, fullscreen element media, transition settings, paint-picker, slider, tutorial-popover, loading window revamp.
- Merge QuickParserPopover.
- Merge OperatorActionLogModal, PreServiceHealthModal, ProjectionExitHint.
- Apply socket auth fixes: clientTypes normalization.
- Apply logRetention capping.
- Ensure mobile secondary controllers still work.

### Phase 9 — Tests & Verification
- Run existing tests: `bun run test` / `vitest run`
- Port upstream tests that cover parser, NDI, lyric-video-timeline, timer-utils, etc. Ensure 27 new tests pass.
- Add regression test for Bible splitting (already have bibleReference.test.js etc) — keep.
- Manual QA checklist:
  - Load bible xml, search 3+ chars, select verse, verify splits into slides, send to Output1.
  - Load lyrics .txt + .md + .docx, verify parsing.
  - Create custom output via your original UI, verify persists.
  - Toggle outputActions endpoint (if UI exists) verify runAllOutputActions still triggers.
  - Preview Output1/2/Stage.
  - Open TimerControlModule, start timer, check TimeDisplay page shows.
  - If NDI cloned, open NDI settings modal.
  - Check ActionLog modal.
  - Check PreServiceHealth.
  - Build electron: `bun run build && electron-builder --dir` (dir only for speed).
  - Check OBS dock HTML exists.

### Phase 10 — Release Bump
- Bump version to 6.6.2 (or 6.7.0-bible) in package.json.
- Run `node scripts/update-version.js` (keeps README).
- Update INSTALLATION.md if needed.
- Update AGENTS.md if new vocab added.
- Clean jj bookmark: `jj describe -m "feat: sync upstream v6.6.2, preserve Bible+customOutputs+outputActions, prefer mine on conflict"`

---

## Conflict Resolution Policy (User: pick mine)

- When file exists both in fork and upstream with different implementation: **keep fork logic + append upstream keys**.
  - Example: LyricsStore customOutputs — keep your `createCustomOutput({name,slug,type,sourceOutputKey})` signature, ignore upstream's alternative if conflicting. If upstream expects `outputRegistry.js` to read customOutputs, add adapter.
  - Example: OutputSettingsPanel — keep bibleReference position/size controls (upstream has them but slightly moved), ensure your showBibleVersion stays.
  - Example: App.jsx routing — keep Bible sidebar state + your headerCompact etc.
- Deleted files in upstream that are your additions: **restore**.
- New files upstream: **add as-is**.
- Modified files where yours adds nothing upstream loses: **merge with yours winning on same line** (use jj's 3-way merge favor).

---

## Tools & Commands

- Version control: `jj` (repo has .jj). Use `jj new`, `jj bookmark create sync-6.6.2`, `jj diff`, `jj log`.
- JS tasks: `bun` (NOT npm). Use `bun install`, `bun run dev`, `bun run test`, `bun run build`.
- Tests: `vitest run` (via bun).
- Safety: Use `freeze` skill to restrict edits to specific dir when debugging stability.
- Lint: Check `package.json` scripts for lint if present (not found, skip).
- NDI companion: clone to `./lyricdisplay-ndi` (gitignored? check .gitignore — if ignored, keep).

---

## Nice-to-Have Justification (for User Read)

- Lyric Video Studio: creates lyric videos for social/church without After Effects — high value for your community.
- NDI: pro churches use NDI for video mixing; adds revenue path.
- OBS Dock/Headless: runs on same low-power streaming PC as OBS, auto-start, reduce hardware.
- Timer Control: preaching timer is asked by many churches.
- Enhanced imports: .docx/.md/.rtf from worship teams everyday.
- Hardening: fixes memory ballooning observed in your logs.txt? capped logs prevents infinite growth.

All features are backward compatible with Bible module.

---

## Risks & Mitigations

- Risk: Large merge breaks Electron IPC. Mitigation: Phase 1 focuses on main/ipc modularization, test electron-dev early.
- Risk: customOutputs mismatch causes outputs to disappear. Mitigation: migration shim + preserve your store shape.
- Risk: NDI companion not present breaks build. Mitigation: Try catch require in main/ndiManager.
- Risk: Bible search worker conflicts with new parser worker. Mitigation: Keep separate workers, namespace `bibleSearch.worker.js` vs `lyricsParser.worker.js`.
- Risk: Server rewrite breaks mobile join code. Mitigation: Keep old joinCodeGuard logic in new location, test.

---

## Definition of Done

- `bun run test` passes including your 5 existing tests + upstream 27 new.
- `bun run build` completes.
- Bible module still functional (import xml, search, split verses, overlay on Output1/Stage).
- Custom outputs creation still works with your UI.
- outputActions preserved.
- New features present: TimerControlModule visible, LyricVideoStudio route accessible, OBS dock HTML present, NDI settings if companion cloned.
- AGENTS.md updated, plans/*.md + .html generated.
