# Plan: Add RCCGTPHB Database to Settings

## Goal
Surface the RCCGTPHB database connection configuration (Base URL + API Key) in the
app's **User Preferences** settings panel, instead of only inside the song-search modal.

## Files Modified
- `src/components/UserPreferencesModal.jsx` — Added an `RccgTphbSettings` section
  wired to the existing `src/context/RccgTphbStore.js` (baseUrl + apiKey + isConnected).
  Provides Base URL input, API Key input, Save, Test connection, and Clear.
- `package.json` — Added `test` and `test:watch` scripts.

## Files Created
- `vitest.config.js` — Vitest config with `@`/`shared` aliases + jsdom env.
- `vitest.setup.js` — localStorage polyfill + RTL cleanup.
- `tests/RccgTphbStore.test.js` — Unit tests for the store (url normalization, key, clear).
- `tests/UserPreferencesModal.test.jsx` — Component tests for the new settings section.

## Phase
1. Explored codebase; confirmed `RccgTphbStore` already persisted baseUrl/apiKey.
2. Set up Vitest test framework (none existed).
3. Added settings UI section to User Preferences modal.
4. Wrote unit + component tests.
5. Verified: `vitest run` (9 passing), `vite build` (success).

## Notes
- The modal's in-song RCCGTPHB config screen and this settings section share the same
  persisted store, so they stay in sync.
- "Test connection" calls `${baseUrl}/health` with the Bearer token; adjust endpoint
  if the actual RCCGTPHB API health route differs.
