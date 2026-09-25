# Changelog

## [6.10.0] - 2026-09-25

### Added

- **Scale-degree chord notation on the stage display:** the stage chord line can render number charts relative to the song's key (`C` → `1`, `G7` → `57`, `D/F#` → `2/♯4`) with a `1 = G` reference badge; letter names stay the default and songs without a `{key:}` directive keep letter chords instead of printing wrong numbers (`shared/chords.js`, `src/components/Stage/ChordChartView.jsx`).
- **Collapsible show-control dock:** the show-control bar and announcement ticker fold away so the song list stays above the fold; the collapsed header keeps reporting the active show state and queue depth (`src/components/ShowControlBar.jsx`, `src/components/AnnouncementTickerPanel.jsx`).
- **Mobile show control:** the Flutter controller gains the show state machine and announcement ticker, with a fallback to the legacy master boolean so older servers still drive it (`mobile/lib/core/models.dart`, `mobile/lib/core/server_api.dart`).

### Fixed

- The preview multiview smoke test is no longer timing-dependent when the suite runs in parallel.

## [6.9.0] - 2026-09-24

### Added

- **Service scheduler and run sheet:** schedule services with a creator wizard, run-sheet timer panel, and late-start reconciliation wizard that realigns the schedule when a service begins late (`src/components/ScheduleCreatorWizard.jsx`, `src/components/SchedulePanel.jsx`, `src/components/ScheduleStartReconciliationWizard.jsx`, `server/realtime/timerScheduler.js`, `shared/scheduleMath.js`).
- **Preview safety and multiview:** preview-lines mode with a live-command safety bridge and on-screen safety bar, plus a configurable preview multiview route for monitoring several outputs at once (`src/components/PreviewSafetyBar.jsx`, `src/hooks/useLiveSafetyBridge.js`, `src/utils/previewSafety.js`, `src/utils/previewMultiview.js`, `src/pages/Preview.jsx`).
- **Pre-service health and connected-output strip:** pre-service health check modal and a live strip showing which outputs are currently connected (`src/components/PreServiceHealthModal.jsx`, `src/components/ConnectedOutputsStrip.jsx`, `src/hooks/useOutputPresence.js`, `server/realtime/outputPresence.js`).
- **Document import:** DOCX, RTF, and Markdown importers plus full EasyWorship database import through a unified presentation import modal (`src/components/PresentationImportModal.jsx`).
- **OBS dock and WebSocket pairing:** headless OBS dock page with OBS-WebSocket auto source setup and authenticated pairing (`src/pages/ObsDock.jsx`, `src/integrations/obs/obsWebSocketClient.js`, `server/auth/obsDockPairing.js`, `main/obsDockStartup.js`).
- **Offline generative motion backgrounds:** built-in motion background presets rendered on the output canvas with operator controls — no internet or media files required (`src/components/outputs/CanvasMotionBackground.jsx`, `src/components/outputs/MotionBackgroundControls.jsx`, `src/utils/motionPresets.js`).
- **Professional song canvas tooling:** floating toolbar and measurement layer for the song canvas, with Vim editing workflow preserved (`src/components/NewSongCanvas/CanvasFloatingToolbar.jsx`, `src/components/NewSongCanvas/CanvasMeasurementLayer.jsx`).
- **Hardware MIDI and OSC automation:** control lyrics, slides, and show actions from MIDI controllers and OSC surfaces with a dedicated settings panel (`main/midiController.js`, `main/oscController.js`, `main/hardwareControl.js`, `src/components/MidiOscSettings.jsx`, `src/hooks/useHardwareCommands.js`, `shared/hardwareCommands.js`).
- **NDI video-over-IP output:** send output over NDI with status monitoring and runtime management (`main/ndi/`, `src/components/NdiOutputSection.jsx`, `src/hooks/useNdiStatus.js`, `src/utils/ndi.js`).
- **Parallel Bible translations:** display two translations side by side with a link control to keep them in sync (`src/components/Bible/ParallelBibleDisplay.jsx`, `src/components/Bible/ParallelBibleLinkControl.jsx`, `src/utils/bibleParallel.js`).
- **Bible verse editor (experimental):** editable Bible verse editor via `Alt+Shift+Enter`, gated behind an experimental preferences toggle (`src/components/Bible/BibleChapterEditorModal.jsx`).
- **Shared Bible import control:** reusable Import Bible Translation button wired into both User Preferences and the Bible Control Panel (`src/components/Bible/BibleImportButton.jsx`).
- **Mobile QR pairing and permissions:** instant QR pairing, camera/location permission flows, and setlist state sync in the Flutter mobile controller (`mobile/`).
- **Show-control bar and announcements:** clear/blackout/logo show-control bar with an announcement ticker overlay; queued announcements can be routed to selected outputs (`src/components/ShowControlBar.jsx`, `src/components/AnnouncementTickerPanel.jsx`, `src/components/outputs/TickerOverlay.jsx`, `shared/showControl.js`).
- **Chord charts and CCLI export:** chord chart support with SongSelect bridge and CCLI export; Stage display shows chord charts with a current-line-only view while audience lyrics stay clean (`shared/chords.js`, `src/components/Stage/ChordChartView.jsx`, `src/utils/chordStripper.js`).
- **Safe persistent storage bridge:** persistent storage with quota and corruption handling (`src/utils/persistentStorage.js`).
- **Batched main-process logging:** log writer with size and retention caps (`main/batchedLogWriter.js`).
- Alt-click and Alt+Enter Bible staging so operators can preview or prepare a verse without changing the live output.
- Local feature audit and Bible XML teardown reference documents.

### Changed

- Completed the unified desktop and Flutter mobile controller feature set, including session state, file navigation, Bible search, output templates, free notes, and cross-platform synchronization.
- Queued announcements are routed to the operator-selected outputs instead of broadcasting everywhere.
- CI now builds slash-prefixed feature branches.

### Fixed

- Stage chord charts stay Stage-only and audience lyrics are sanitized of chord markup.
- Bible translation import controls remain accessible in preferences and the Bible panel.
- Bible verse editor no longer double-fires on `Alt+Shift+Enter` in the search input and no longer loops on fallback loads.
- Render clock is boundary-aligned without per-tick compounding drift.
- User preferences support direct navigation to a section via `initialSection`.
- Removed a duplicate `useLyricsStore` import that broke the build.

### Security

- Output HTML sanitization, secret rotation, and IPC validation hardening (`main/ipcSecurity.js`, `src/utils/controlAuth.js`).

### Operations

- Pre-service health check and connected-output presence tracking for operator confidence before going live.
- Batched main-process log writer with size and retention caps.

## [6.6.2] - 2026-09-07

### Added

- Unified Flutter mobile controller app: LAN discovery, QR/manual pairing, live lyric control, setlists, Bible quick-load, output toggles, tablet layouts, and branded app icon (`mobile/`).
- Persistent desktop session state with atomic writes and reconnect synchronization (`src/context/sessionModel.js`, `src/hooks/useSessionHydration.js`).
- File navigator with indexed folders, token-index search, recent files, and atomic saves (`shared/navigatorTokenIndex.js`, `main/lyricWatcher.js`).
- Bible preview, splitter improvements, and worker-backed search caching (`src/utils/biblePreview.js`, `src/utils/bibleSplitter.js`).
- Output template sync, mode templates, and HTTP action buttons with dedicated worker (`src/hooks/useOutputTemplateSync.js`, `src/utils/modeTemplates.js`, `src/workers/httpAction.worker.js`).
- Keyboard hint (FHint) overlay mode, free-note mode, and lyrics hot-reload (`src/hooks/useFHintMode.js`, `src/utils/freeNote.js`, `src/hooks/useLyricsHotReload.js`).
- Mobile socket service tests and desktop platform runners (`mobile/test/socket_service_test.dart`).

### Changed

- Improved lyric, Bible, setlist, and output state synchronization across desktop, web, output, and mobile clients.
- Stricter upload, import, file navigation, and server request limits.

### Fixed

- Cleaned up disconnected output instances and stale worker Bible data.
- Preserved custom output and display settings across server and client reconnects.

## [6.6.1] - 2026-08-29

### Added

- Keyboard shortcut `Ctrl/Cmd+Shift+D` to open the RCCGTPHB Song Database (`src/constants/hotkeyBindings.js:15`, `src/hooks/LyricDisplayApp/useKeyboardShortcuts.js:145`), rebindable in User Preferences, with menu hint in `src/components/LyricDisplayApp.jsx:932`.
- `Auto-break long lines` preference to toggle intelligent lyric splitting globally, persisted in `src/context/LyricsStore.js:235` and honored by `src/hooks/LyricDisplayApp/useLyricsLoader.js:40` and `src/hooks/useFileUpload.js:15`.

### Changed

- User Preferences `Lyrics` section now exposes both `Auto-break long lines` and `Auto-group lyric lines`.

## [6.6.0] - 2026-08-29

### Added

- Flutter mobile controller for LAN discovery, QR/manual pairing, live lyric control, setlists, Bible quick-load, output toggles, and tablet layouts.
- Persistent desktop session state with atomic writes and reconnect synchronization.
- File navigator with indexed folders, search, recent files, and atomic saves.
- Bible search across translations, geometry-aware slide splitting, previews, and worker-backed search caching.
- Custom output screens, HTTP action buttons, mode templates, keyboard hint mode, bundled fonts, and performance controls.
- Release workflow for building and publishing cross-platform desktop installers.

### Changed

- Expanded REST and Socket.IO API documentation for mobile controllers, setlists, drafts, metrics, and session state.
- Improved lyric, Bible, setlist, and output state synchronization across desktop, web, output, and mobile clients.
- Added stricter upload, import, file navigation, and server request limits.

### Fixed

- Cleaned up disconnected output instances and stale worker Bible data.
- Preserved custom output and display settings across server and client reconnects.
- Updated mobile setlist reordering to use Flutter's current reorder callback API.
