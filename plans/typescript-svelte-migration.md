# LyricDisplay: TypeScript + Svelte 5 Migration Plan

## Goal
Migrate the full LyricDisplay Electron app from React/JS to Svelte 5 + TypeScript + SvelteKit, incrementally.

## Tech Stack Changes
| From | To |
|------|-----|
| React 19 + JSX | Svelte 5 (runes, class-based) |
| JavaScript (.js/.jsx) | TypeScript (.ts/.svelte) |
| Vite + React plugin | SvelteKit (Vite-based) |
| Express backend (port 4000) | SvelteKit server routes + Socket.io |
| Zustand stores | Svelte 5 runes ($state, $derived) + class stores |
| shadcn/ui + Radix | shadcn-svelte |

## Migration Phases

### Phase 1: Project Setup (typescript-port/)
- Initialize SvelteKit project in typescript-port/
- Configure TypeScript (tsconfig.json)
- Install: svelte 5, @sveltejs/kit, shadcn-svelte, socket.io, better-sqlite3, keytar
- Set up Electron main process in TypeScript
- Configure Vite for SvelteKit + Electron

### Phase 2: Shared Modules → TypeScript
- Convert `shared/lyricsParsing.js` → `shared/lyricsParsing.ts`
- Convert `shared/lineSplitting.js` → `shared/lineSplitting.ts`
- Convert `shared/bible/` parsers → TypeScript
- Add proper type exports for all shared utilities

### Phase 3: Electron Main → TypeScript ✅ COMPLETE
- Convert `main.js` → `main.ts` ✅
- Convert all `main/*.js` → `main/*.ts` ✅ (37 files converted)
- Convert `preload.js` → `preload.ts` ✅
- Add type definitions for IPC channels ✅
- Update electron-builder config (pending)
- Convert `shared/*.js` → `shared/*.ts` ✅ (9 files converted)
- Convert `main/lyricsProviders/` → TypeScript ✅ (all providers + search algorithm)

### Phase 4: Backend → SvelteKit Server Routes
- Move Express routes to `src/routes/api/`
- Integrate Socket.io in SvelteKit hooks server
- Port JWT auth, rate limiting, file upload
- Convert `server/events.js` to TypeScript

### Phase 5: Frontend React → Svelte 5
- Convert components one-by-one to `.svelte` files
- Replace React hooks with Svelte 5 runes
- Replace Zustand stores with Svelte class stores
- Port shadcn/ui components to shadcn-svelte equivalents
- Convert routing from React Router to SvelteKit file-based routing

### Phase 6: Integration & Testing
- Wire up Socket.io client in Svelte components
- Test Electron IPC with TypeScript preload
- Verify all output displays work
- Test mobile controller flow
- Build and package with electron-builder

## Progress Summary (as of Phase 3 completion)

### Files Converted to TypeScript
- **main/*.ts**: 37 files (all Electron main process modules)
  - adminKey, backend, cleanup, displayDetection, displayManager, easyWorship, fileHandler, inAppBrowser, ipc, loadingWindow, menuBridge, modalBridge, paths, preferences, progressWindow, providerCredentials, recents, secureTokenStore, setlistExport, singleInstance, startup, systemFonts, themePreferences, updater, userTemplates, utils, windows
  - lyricsProviders/: cache, fetchWithTimeout, index, searchAlgorithm
  - lyricsProviders/providers/: chartlyrics, hymnary, lrclib, lyricsOvh, openHymnal, vagalume
- **shared/*.ts**: 9 files (shared utilities)
  - lineSplitting, lyricsParsing
  - bible/: index, xmlUtils, zefaniaBible, osisBible, bebliaBible, openSongBible
  - types

### Build Status
- `npm run build` succeeds with no errors
- All old .js files removed from main/ and shared/
- Vite 6 + SvelteKit working correctly

## Key Decisions
- **Incremental approach**: Convert file-by-file, keep app working
- **Svelte 5 runes**: Use $state, $derived, $effect with class-based components
- **Socket.io stays**: Keep in SvelteKit server hooks for real-time sync
- **Electron in TS**: Full TypeScript coverage including main process
- **Working directory**: typescript-port/

## File Structure (target)
```
typescript-port/
├── src/
│   ├── routes/          # SvelteKit file-based routing
│   │   ├── +page.svelte
│   │   ├── output1/
│   │   ├── output2/
│   │   ├── stage/
│   │   └── api/         # Server routes (replaces Express)
│   ├── lib/
│   │   ├── components/  # Svelte components
│   │   ├── stores/      # Svelte class stores
│   │   ├── hooks/       # Svelte hooks
│   │   └── utils/       # TypeScript utilities
│   └── app.html
├── shared/              # TypeScript shared modules
├── main/                # Electron main (TypeScript)
├── preload.ts           # Electron preload (TypeScript)
├── svelte.config.js
├── tsconfig.json
└── package.json
```
