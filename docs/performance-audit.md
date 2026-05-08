# Performance audit: LyricDisplay

Date: 2026-05-08

## Scope

Static scan of the React/Vite/Electron app, current `dist/` output, routing, major render paths, socket sync paths, and asset payloads. No source optimization changes were made yet.

## Measurement notes

- `npm run build` could not be re-run because this checkout has no `node_modules/` and Vite cannot resolve `@vitejs/plugin-react`.
- Existing `dist/` was used for bundle and asset size observations.
- Current built payload is dominated by fonts and one large app bundle.

## Current built payload hotspots

Largest files in `dist/`:

| Asset | Size | Note |
| --- | ---: | --- |
| `dist/assets/NotoSans-Italic-VariableFont...ttf` | 2.30 MB | TTF font bundled up front |
| `dist/assets/NotoSans-VariableFont...ttf` | 2.04 MB | TTF font bundled up front |
| `dist/assets/index-lyLL2hV0.js` | 1.34 MB | Single main JS bundle |
| `dist/assets/Inter-Italic-VariableFont...ttf` | 904 KB | TTF font bundled up front |
| `dist/assets/Inter-VariableFont...ttf` | 875 KB | TTF font bundled up front |
| `dist/assets/Montserrat-Italic...ttf` | 701 KB | TTF font bundled up front |
| `dist/assets/Montserrat-Variable...ttf` | 689 KB | TTF font bundled up front |
| `dist/images/support-dev.jpg` | 688 KB | Large static image |
| `dist/assets/index-K0Q-4l35.css` | 84 KB | Includes all font-face declarations |

`dist/` total is about 17 MB. More than half of the largest payload is font files.

## Findings

### 1. All custom fonts are declared globally and emitted into the build

Files:

- `src/index.css`
- `src/styles/fonts.css`
- `src/assets/fonts/**`

`src/index.css` imports `src/styles/fonts.css`, which declares every bundled display font as TTF. Vite emits every referenced font even if a user only uses one font. This creates a large startup payload and can slow first output windows.

Impact: high for first load, Electron app startup, and output windows.

Recommended direction:

- Convert bundled TTF fonts to WOFF2.
- Only preload the default output font and app UI font.
- Lazy-load other lyric fonts when selected.
- Consider system fonts for the control UI where possible.

### 2. App routes and large modal/editor code are loaded eagerly

Files:

- `src/App.jsx`
- `src/components/LyricDisplayApp.jsx`
- `src/components/NewSongCanvas.jsx`
- `src/components/OnlineLyricsSearchModal.jsx`
- `src/components/OutputSettingsPanel.jsx`

`App.jsx` imports every route directly: control panel, both output pages, stage page, and new song editor. `LyricDisplayApp.jsx` then imports large closed-by-default modals and settings panels. The current build has one large `index` JS bundle, so opening `/output1`, `/output2`, or `/stage` still pays for control panel/editor/modal code.

Impact: high for output windows and startup.

Recommended direction:

- Use `React.lazy`/`Suspense` for routes.
- Lazy-load closed modals: online lyrics search, setlist, EasyWorship import, RCCG modal, draft approval, preview outputs, template modals.
- Keep output display routes minimal and independent.

### 3. Autosizing text performs repeated DOM measurement and can self-trigger extra renders

Files:

- `src/pages/Output1.jsx`
- `src/pages/Output2.jsx`
- `src/pages/Stage.jsx`
- `src/utils/maxLinesCalculator.js`

`calculateOptimalFontSize()` creates hidden DOM nodes and calls `getBoundingClientRect()` many times during binary search. In `Output1.jsx` and `Output2.jsx`, the autosizer effect depends on `adjustedFontSize` and then calls `setAdjustedFontSize()`, so it can run one extra cycle per change. It also writes `autosizerActive` back into global output settings, which can trigger more subscribers and persistence work.

Impact: medium to high when max-lines/autosizer is enabled, especially during live lyric updates.

Recommended direction:

- Remove `adjustedFontSize` from the autosizer effect dependency list unless required.
- Only update `adjustedFontSize` and `autosizerActive` when values actually change.
- Do not persist/write volatile `autosizerActive` on every render tick.
- Replace hidden DOM width measurement with a cached canvas `measureText` path where possible, and limit DOM height measurement to final candidates.

### 4. Output windows duplicate very similar code

Files:

- `src/pages/Output1.jsx`
- `src/pages/Output2.jsx`

The two output routes are near-duplicates. Both import `framer-motion`, socket handling, media preloading, autosizing, and rendering logic. This makes bundle splitting less effective and increases maintenance risk.

Impact: medium.

Recommended direction:

- Extract a shared `OutputDisplay` component that receives `outputId` and settings selectors.
- Put route-specific wrappers in small files.
- This makes lazy-loaded chunks smaller and reduces duplicated logic.

### 5. Zustand persistence includes large and frequently changing state

File:

- `src/context/LyricsStore.js`

Persisted state includes `lyrics`, `rawLyricsContent`, `lyricsSections`, `lineToSection`, `lyricsTimestamps`, `lyricsHistory`, and all output settings. Persisting full lyrics/history can make localStorage hydration and writes heavy, particularly with setlists and imported files.

Impact: medium for startup and editing sessions.

Recommended direction:

- Persist only durable preferences by default.
- Move large session state to explicit recent/history storage or IndexedDB/Electron file storage.
- Keep live lyrics, selected line, autosizer state, and transient sync state out of `zustand/persist`.

### 6. Control panel subscribes to broad store slices

Files:

- `src/hooks/useStoreSelectors.js`
- `src/components/LyricDisplayApp.jsx`
- `src/components/LyricsList.jsx`

Selectors such as `useLyricsState()` return many fields and actions. Components using this broad selector re-render on changes they may not visually need. `LyricDisplayApp.jsx` pulls a large set of lyrics, settings, setlist, autoplay, and socket state at the top level.

Impact: medium during line selection, typing, and socket updates.

Recommended direction:

- Split selectors by surface: current line selection, lyrics array, metadata, actions.
- In large components, subscribe closer to the leaf component that uses the state.
- Keep stable action selectors separate from changing data selectors.

### 7. `LyricsList` is virtualized but still has re-render pressure

File:

- `src/components/LyricsList.jsx`

Good: `react-window` is already used. Potential cost remains from hover state at list level, selection set recreation, resize state based on `window.innerWidth/innerHeight`, and complex row rendering inside one very large component.

Impact: low to medium, depending on lyric length and selection/edit actions.

Recommended direction:

- Memoize row components and pass only row-specific props.
- Throttle/debounce resize state updates or use `ResizeObserver` for the actual list container.
- Keep hover state inside rows where possible.

### 8. Resize/listener patterns should be throttled

Files:

- `src/components/LyricsList.jsx`
- `src/components/NewSongCanvas.jsx`
- `src/pages/Stage.jsx`
- `src/components/FontSelect.jsx`

Several components update React state directly on `resize` or layout-related events. Some are already guarded by `requestAnimationFrame`; others can still trigger high-frequency renders.

Impact: low to medium.

Recommended direction:

- Use a shared `useRafThrottle` or `useResizeObserver` hook.
- Avoid storing viewport dimensions globally when only a container size is needed.

### 9. Server has per-socket periodic sync intervals

File:

- `server/events.js`

Each socket gets a 60-second interval that fingerprints state and emits `periodicStateSync` if changed. This is acceptable for a few clients, but scales linearly with open output/control clients.

Impact: low now, medium if many remotes are connected.

Recommended direction:

- Keep event-driven sync as primary.
- Replace per-socket intervals with one shared scheduler, or only schedule periodic sync for clients that need it.

## Highest-value optimization order

1. Route/code split output, stage, control panel, and editor.
2. Convert and lazy-load fonts.
3. Fix autosizer render loop and reduce DOM measurement.
4. Narrow persisted Zustand state.
5. Split broad selectors and memoize list rows.

## Verification needed after implementation

- Reinstall dependencies or restore `node_modules`.
- Run `npm run build` and compare `dist/` files.
- Open `/output1`, `/output2`, `/stage`, and `/` and capture bundle chunk loading.
- Test autosizer with max-lines enabled on long Bible verses and translated lyric groups.
- Confirm Electron packaged build still includes any fonts loaded dynamically.
