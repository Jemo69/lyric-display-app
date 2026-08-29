# Changelog

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
