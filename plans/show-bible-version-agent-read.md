# Plan: Show Bible Version When Displaying a Verse

## Goal
When a Bible verse is shown on the stage display and/or the regular output, also show
the Bible translation/version (e.g. `John 3:16 (KJV)`) next to the reference.

## Current State (research)
- `BibleControlPanel.jsx` already passes `bible: currentBible?.name` into `onSelectVerse({...})`.
- `LyricDisplayApp.jsx` `handleBibleVerseSelect` ignores `verseData.bible` — only `verseData.reference` is stored (`setLyricsFileName`).
- `StageOutput.jsx` and `RegularOutput.jsx` both compute `bibleReferenceText` via `extractBibleVerseParts` and render it, but never the version.
- `LyricsStore` has no field for the version.

## Files to Modify
1. `src/context/LyricsStore.js`
   - Add state `bibleVersion: ''` (default).
   - Add `setBibleVersion(version)` setter.
   - Clear `bibleVersion` inside `setLyricsFileName` so loading a song/draft/setlist never shows a stale version.
   - Persist `bibleVersion` in `partialize`.
2. `src/components/LyricDisplayApp.jsx`
   - Pull `setBibleVersion` from store.
   - In `handleBibleVerseSelect`, call `setBibleVersion(verseData.bible || '')` right after `setLyricsFileName`.
3. `src/pages/StageOutput.jsx`
   - Read `bibleVersion` from store.
   - Render `${bibleReferenceText}${bibleVersion ? ` (${bibleVersion})` : ''}`.
4. `src/pages/RegularOutput.jsx`
   - Same change as StageOutput.

## Display Format
`reference (version)` — e.g. `John 3:16 (KJV)`. Only appended when a version is present.

## Tests
- Add a unit test for `extractBibleVerseParts` compatibility (unchanged) is already covered; add a focused test
  for the display combining reference + version. Since the combine logic lives inline in the component, extract a
  pure helper `formatBibleReference(reference, version)` in a shared util and unit-test it. Then use it in both outputs.
- Run existing test suite + lint + typecheck.

## Phases
1. Add `bibleVersion` store field + setter + reset-on-filename logic.
2. Wire `setBibleVersion` into `handleBibleVerseSelect`.
3. Add `formatBibleReference` helper + unit test.
4. Render version in StageOutput and RegularOutput.
5. Verify: lint, typecheck, tests, manual build.
