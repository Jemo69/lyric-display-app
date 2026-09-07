# Changelog

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
