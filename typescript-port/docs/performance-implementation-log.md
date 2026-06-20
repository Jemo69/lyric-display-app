# Performance implementation log

Date: 2026-05-08

## Changes applied

### 1. Route-level lazy loading

File changed:

- `src/App.jsx`

Routes are now loaded with `React.lazy` and wrapped in `Suspense`:

- `/`
- `/output1`
- `/output2`
- `/stage`
- `/new-song`

Expected effect:

- Output and stage windows no longer need to parse the control panel/editor route code before rendering.
- The Vite production build should create route chunks instead of one route-heavy entry bundle.

### 2. Heavy modal lazy loading

File changed:

- `src/components/LyricDisplayApp.jsx`

These components now load only behind a lazy boundary:

- `SetlistModal`, only when `setlistModalOpen` is true on desktop and mobile
- `OnlineLyricsSearchModal`, only when opened
- `RccgTphbSongModal`, only when opened
- `EasyWorshipImportModal`, only when opened
- `DraftApprovalModal`, split into a separate chunk while still mounted for its draft event listener

Expected effect:

- Initial control panel code is lighter.
- Rarely used import/search/setlist flows are deferred until needed.

### 3. Output autosizer guard

Files changed:

- `src/pages/Output1.jsx`
- `src/pages/Output2.jsx`

Changes:

- Added `autosizerActiveRef` to avoid writing `autosizerActive` to global output settings unless the value changes.
- Avoided state updates when `adjustedFontSize` or truncation state are unchanged.
- Removed `adjustedFontSize` from the autosizer effect dependency loop.

Expected effect:

- Fewer repeated autosizer calculations.
- Fewer global store writes and re-renders during live lyric changes.
- Less chance of stutter when max-lines/autosizer is enabled.

## Not yet applied

- Font payload reduction and WOFF2 conversion.
- Zustand persistence migration.
- Shared `OutputDisplay` refactor for `Output1`/`Output2`.
- Measurement cache/canvas-based autosizer rewrite.

## Verification status

A Vite dev error appeared from a broken/incomplete Babel install:

```text
Cannot find module '../../vendor/import-meta-resolve.js'
```

I repaired dependencies by pinning Babel to a version that includes `lib/vendor/import-meta-resolve.js`:

```bash
npm install -D @babel/core@7.27.7
```

Then verified:

```bash
npm run dev
npm run build
```

Result: dev server starts and build passes.

Confirmed chunk output includes separate route/modal chunks, including:

- `Output1-*.js`
- `Output2-*.js`
- `Stage-*.js`
- `ControlPanel-*.js`
- `NewSongCanvas-*.js`
- `SetlistModal-*.js`
- `OnlineLyricsSearchModal-*.js`
- `EasyWorshipImportModal-*.js`
- `RccgTphbSongModal-*.js`
- `DraftApprovalModal-*.js`

Remaining warning: the main `index-*.js` chunk is still over 500 kB. The next major reduction should target shared dependencies and fonts.
