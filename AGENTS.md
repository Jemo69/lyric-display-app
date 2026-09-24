# Agent Instructions

## Bible import control is a permanent product surface

The app must always provide a visible **Import Bible Translation** button in
`User Preferences > Bible`. Do not remove it, hide it behind an experimental
flag, or replace it with an unreachable import tab.

Keep the shared `src/components/Bible/BibleImportButton.jsx` control wired into
both:

- `src/components/UserPreferencesModal.jsx`
- `src/components/Bible/BibleControlPanel.jsx`

The control must continue to accept `.xml` and `.json` files, parse supported
Bible formats, persist imported translations through `BibleStore`, select the
imported translation, and show success or failure feedback. Any refactor that
touches either surface must retain the button and the regression coverage in
`src/components/Bible/__tests__/BibleImportButton.test.jsx` and
`tests/UserPreferencesModal.test.jsx`.
