# AGENTS.md

## Vocabulary (User Approved: Use existing naming)

- **output1 / output2 / stage / customOutputs / customOutputSettings / customOutputEnabled** – display targets, not "displays" or "screens". Keep existing custom output model (createCustomOutput, slug logic, sourceOutputKey) as source of truth.
- **lyrics / selectedLine / lyricsFileName / rawLyricsContent / lyricsTimestamps** – current song session state.
- **lyricsSections / lineToSection / Sections** – grouping of lyric lines.
- **lyric line / slide** – individual displayable unit.
- **Bible module** – first-class tab: BibleStore, BibleControlPanel, BibleBrowser, BibleSearchModal, BibleImportModal, bibleMetadata, activeBibleId, defaultBibleId, bibleHistory, bibles (IndexedDB via bibleDb), bibleReferencePosition, bibleReferenceSize, showBibleVersion, bibleVersion. Search via bibleSearch.worker.js using shared/bible.
- **automation / outputActions** – user-defined HTTP endpoint automation (http://localhost:5505/) with onAction/offAction, payloadFormat boolean/action, enabled flag. Keep runAllOutputActions.
- **setlist / setlistFiles / setlistModalOpen** – collection of songs for service.
- **lyric provider / online search** – LRCLIB, ChartLyrics etc via main/lyricsProviders.
- **NDI / lyricdisplay-ndi** – NDI companion repo for NDI outputs.
- **OBS Dock / Headless Mode** – obs-dock.html, headless electron entry, protocol launcher.
- **Timer Control Module / TimeDisplay / TimerStore** – preaching timer.
- **Lyric Video Studio / LyricVideoStudio** – labs merged feature for creating lyric videos.
- **UserPreferencesModal / preferencesSlice** – advanced, NDI, MIDI, OSC, security prefs.
- **Operator Action Log / actionLog** – audit of operator actions.
- **PreServiceHealthModal** – pre-service diagnostics.
- **ProjectOutputModal / OutputPage / RegularOutput** – generic output rendering.

## Workflow Conventions

- Use `jj` for version control (repo has .jj). Use `bun` for JS/TS tasks.
- Preserve Bible module as first-class alongside new features.
- Keep outputActions, vimMode, sidebarCollapsed, settingsCollapsed, sidebarWidth, headerCompact.
- Migration strategy: when merging upstream's split store slices (appShellSlice, autoplaySlice, lyricsSessionSlice, outputSlice, preferencesSlice, setlistSlice, stageSlice, timerSlice), reconcile with existing LyricsStore shape without losing Bible overlay fields.
- Electron IPC is modularized in upstream: main/ipc/*. Preserve existing ipc handlers for Bible if any.
- Tests: vitest run; add regression for Bible splitting.

## Nice-to-Have Upstream Features Identified (v6.2.8 -> v6.6.2)

1. **Lyric Video Studio** – IntroOverlay, LyricVideoPreview, Timeline, Transport, ExportModal, StyleModal, LyricVideoSettingsPanel, pages LyricVideoStudio, LyricVideoLiveOutput, LyricVideoExportFrame, utils lyricVideoTimeline.
2. **NDI Output** – NdiStore, NdiOutputSettingsModal, NdiBridge, main/ndi/*, full hardening commit a1ad954.
3. **OBS Dock / Headless** – obs-dock.html, ObsDockLayout, ObsDockInfoModal, ObsSetup page, TimerControlRoute, ObsDockRoute, electron-dev-headless script, obsDockStartup, headless launch flow.
4. **Timer Control** – TimerControlModule, TimeDisplay, useSharedTimer, timerSlice, timerUtils, spacebar handling, sanitization.
5. **Enhanced Imports** – .md/.markdown/.rtf/.docx via shared/documentTextExtraction.js, shared/lyricImportRegistry.js, PresentationImportModal, UserMediaModal with bundled template media.
6. **Stability Hardening** – Socket auth (server/auth/*), clientTypes, permissions, connectionManager, logRetention, logger fixes, idle output performance drop, memory ballooning fixes, external display tightening.
7. **Parser Revamp** – shared/lyricsParsing/* modularized (constants, grouping, helpers, lrcParser, txtParser, txtProcessor, sections, translation, etc), safer cleanup, timestamp UI, preserved edit-source.
8. **User Preferences & External Control** – UserPreferencesModal with NdiPreferencesSection, MidiPreferences, OscPreferences, Advanced, Security, midiController.js, oscController.js, useExternalControl.
9. **ActionLog & Health** – OperatorActionLogModal, PreServiceHealthModal, server/realtime/actionLog, projection state sync, timer control features.
10. **UI Polish** – QuickParserPopover, Output settings sections split, background band, fullscreen element media, transition settings, paint-picker, slider, tutorial-popover, loading window revamp, button rounded-full.

## Project Structure Reminder

- Electron main in main/ and main.js, preload.js
- Server in server/ (express + socket.io)
- Shared parser in shared/
- Frontend React in src/: components, pages, context, hooks, utils, workers
- Tests in tests/ and src/**/__tests__
