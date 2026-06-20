# Performance implementation plan

This plan is intentionally documentation-first. No optimization code has been applied yet.

## Phase 0: restore measurable baseline

1. Install dependencies for this checkout.
   - Expected command: `npm install` or the project-standard equivalent.
2. Run a clean build.
   - `npm run build`
3. Record baseline sizes.
   - Total `dist/` size.
   - Main JS chunk size.
   - CSS size.
   - Font asset total.
4. Smoke test routes.
   - `/`
   - `/output1`
   - `/output2`
   - `/stage`
   - `/new-song`

Acceptance:

- Build succeeds locally.
- Baseline numbers are written into this document or a follow-up report.

## Phase 1: route-level code splitting

Target files:

- `src/App.jsx`
- route page files under `src/pages/`
- `src/components/NewSongCanvas.jsx`

Implementation outline:

```jsx
import React, { Suspense, lazy } from 'react';

const ControlPanel = lazy(() => import('./pages/ControlPanel'));
const Output1 = lazy(() => import('./pages/Output1'));
const Output2 = lazy(() => import('./pages/Output2'));
const Stage = lazy(() => import('./pages/Stage'));
const NewSongCanvas = lazy(() => import('./components/NewSongCanvas'));
```

Use a minimal fallback that does not import heavy UI libraries.

Expected result:

- Output routes stop loading control panel/editor/modal code on first paint.
- Main JS chunk shrinks and route chunks are created.

Risk:

- Electron hash routing must still work in production.
- Suspense fallback must not interfere with transparent output windows.

Verification:

- Build chunk list shows separate chunks for control, output, stage, editor.
- `/output1` and `/stage` render with transparent-background behavior unchanged.

## Phase 2: modal and panel lazy loading

Target files:

- `src/components/LyricDisplayApp.jsx`
- `src/components/OnlineLyricsSearchModal.jsx`
- `src/components/SetlistModal.jsx`
- `src/components/EasyWorshipImportModal.jsx`
- `src/components/RccgTphbSongModal.jsx`
- `src/components/DraftApprovalModal.jsx`
- output/stage template modals

Implementation outline:

- Convert closed-by-default modal imports to `React.lazy`.
- Render a lazy modal only when its `open` state is true.
- Keep tiny open-state controls in the main component.

Expected result:

- Initial control panel bundle excludes rarely used import/search/template flows.

Risk:

- Modal animation timing may need a small loading fallback.
- Any modal that registers Electron listeners at module import time must be checked.

Verification:

- Open every lazy modal once.
- Confirm no duplicated Electron listeners.

## Phase 3: font payload reduction

Target files:

- `src/styles/fonts.css`
- `src/assets/fonts/**`
- `src/components/FontSelect.jsx`
- output/stage display components

Implementation outline:

1. Convert TTF assets to WOFF2.
2. Keep only the default lyric font and app UI font in global CSS.
3. Move optional lyric fonts into small per-font CSS files or a runtime font loader.
4. Load a selected font when the user chooses it.
5. Ensure Electron packaging includes dynamically referenced font assets.

Expected result:

- Font asset payload drops substantially.
- First output window opens faster.

Risk:

- Dynamic font URLs need careful handling with Vite and Electron `base: './'`.
- Output windows must have the selected font available before lyric text appears, or use `font-display: swap` gracefully.

Verification:

- Build emits fewer initial font assets.
- Select every bundled font in the UI.
- Package smoke test confirms fonts load in Electron.

## Phase 4: autosizer optimization

Target files:

- `src/pages/Output1.jsx`
- `src/pages/Output2.jsx`
- `src/pages/Stage.jsx`
- `src/utils/maxLinesCalculator.js`

Implementation outline:

1. Prevent self-triggered recalculation.
   - Remove `adjustedFontSize` from dependencies if not truly needed.
   - Use functional state updates that return the previous value when unchanged.
2. Stop writing volatile `autosizerActive` into global persisted settings every calculation.
   - Either keep local, or emit metrics only when the value changes.
3. Cache measurements by text, font, weight, style, width, height, and font-size candidate.
4. Prefer canvas width measurement and use DOM height measurement only where wrapping must be verified.

Expected result:

- Fewer reflows and fewer global store writes when lyrics change.
- Smoother output transitions with autosizer enabled.

Risk:

- Text fitting is visual-critical. Bible verses, translation groups, all-caps text, borders, and custom fonts need testing.

Verification:

- Long line fits within configured max lines.
- No repeated autosizer updates in React DevTools Profiler.
- Output metrics still report accurately if used by other displays.

## Phase 5: persist only durable state

Target file:

- `src/context/LyricsStore.js`

Implementation outline:

- Keep these persisted: dark mode, has-seen flags, output preferences, autoplay settings, possibly compact recent metadata.
- Remove or move these from automatic localStorage persistence: full `lyrics`, `rawLyricsContent`, large section maps, timestamps, full history lines, transient selected line.
- If full history is needed, store it through an explicit Electron/file/IndexedDB path.

Expected result:

- Faster startup hydration.
- Fewer large localStorage writes.

Risk:

- Current users may expect lyrics to restore after restart.
- Requires migration/backward compatibility for existing `lyrics-store` localStorage data.

Verification:

- Existing stored preferences survive migration.
- Lyrics restore behavior is either preserved through the new storage path or intentionally documented.

## Phase 6: render-path cleanup

Target files:

- `src/hooks/useStoreSelectors.js`
- `src/components/LyricDisplayApp.jsx`
- `src/components/LyricsList.jsx`
- `src/components/NewSongCanvas.jsx`

Implementation outline:

- Split broad selectors into smaller selectors.
- Move subscriptions closer to leaf components.
- Memoize expensive list rows.
- Throttle resize handlers with `requestAnimationFrame` or use `ResizeObserver`.

Expected result:

- Lower render count during line selection, typing, drag/drop, and socket sync.

Risk:

- Splitting selectors can accidentally stale-close callbacks if dependencies are missed.

Verification:

- Use React DevTools Profiler around line selection and editing.
- Confirm keyboard shortcuts and drag/drop still work.

## Suggested first code changes

If you approve implementation, start with:

1. `src/App.jsx` route lazy loading.
2. `src/components/LyricDisplayApp.jsx` lazy modal loading.
3. Autosizer guard changes in `Output1.jsx` and `Output2.jsx`.

These are high-impact and relatively isolated compared with storage migration and font packaging.
