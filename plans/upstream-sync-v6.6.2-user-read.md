# Upstream Sync to v6.6.2 — User Summary

**Goal:** Bring your fork (6.3.5) up to upstream 6.6.2 while keeping everything you added and preferring your code on conflicts.

## Keep Yours (not in upstream)
- **Bible Module:** Browser, ControlPanel, Import, Search Modal, Store (IndexedDB + worker), bible reference overlay on outputs.
- **Custom Outputs:** Your `createCustomOutput({name,slug,type,sourceOutputKey})` logic, `customOutputSettings/Enabled`.
- **Automation:** `outputActions` HTTP endpoint `http://localhost:5505/` with on/off actions.
- **UI States:** `vimMode`, `sidebarCollapsed`, `settingsCollapsed`, `sidebarWidth`, `headerCompact`.

## Nice Features Coming from Upstream (v6.6.2)

1. **Lyric Video Studio** — create lyric videos (timeline, preview, export). Previously in labs.
2. **NDI Output** — professional NDI for vMix/OBS, needs companion repo `lyricdisplay-ndi`.
3. **OBS Dock + Headless** — runs inside OBS as custom dock, auto-start at sign-in, low-power mode (`obs-dock.html`).
4. **Timer Control** — preaching timer module + TimeDisplay page, spacebar handling.
5. **Better Imports** — drop `.md`, `.rtf`, `.docx` (Worship team docs) via text extraction, plus PresentationImport + UserMedia with bundled backgrounds.
6. **Stability Hardening** — socket auth fixes, memory leak / ballooning fixes, idle output perf drop, log retention capping, external display tightening.
7. **New Parser Pipeline** — modular `shared/lyricsParsing/*` with safer cleanup, timestamp UI, translation grouping preserved.
8. **User Preferences** — MIDI, OSC, NDI, Security, Advanced settings.
9. **Health & Safety** — Operator Action Log, Pre-service Health Check, projection sync, escape handling.
10. **UI Polish** — quick parser popover, split settings sections, fullscreen media, transitions, rounded buttons, loading window revamp.

## How It Lands

- **Single big merge** via `jj bookmark sync-6.6.2`.
- Order internally: Foundation (main/ipc, shared) → Server (auth/realtime/routes) → Store (keep yours, add timer/preferences keys) → Components/Hooks → NDI clone → Video Studio + OBS Dock → Imports → Polish → Tests.
- Conflict rule: if both implement same feature, pick yours.
- NDI: will clone companion and enable fully per your choice.

## What to Test After

- Bible import/search/split send.
- Custom output create/delete.
- .docx/.md drop.
- Timer start + TimeDisplay.
- OBS dock HTML present, Lyric Video Studio route.
- `bun run test`, `bun run build`.

## Risks

- Electron IPC modularization may break build — fixed by testing `electron-dev` early.
- customOutputs: your format stays, adapter for upstream registry.
- Server rewrite: mobile join code tested.

Version bumps to 6.6.2 after success.
