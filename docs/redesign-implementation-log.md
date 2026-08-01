# Redesign implementation log

Date: 2026-05-08

## Direction

Implemented first pass of the approved **Sanctuary Deck** redesign: dark-first, low-glare, production-console UI for live worship operation.

## Files changed

- `src/index.css`
- `src/components/LyricDisplayApp.jsx`
- `src/components/LyricsList.jsx`
- `src/components/OutputSettingsPanel.jsx`
- `src/components/MobileLayout.jsx`

## What changed

### Product shell

Added Sanctuary Deck component classes in `src/index.css`:

- `sanctuary-shell`
- `sanctuary-sidebar`
- `sanctuary-header-surface`
- `sanctuary-icon-button`
- `sanctuary-primary-action`
- `sanctuary-live-card`
- `sanctuary-content-surface`
- `lyric-line` state classes

These use low-glare OKLCH surfaces and restrained semantic color.

### Desktop control panel

Updated `LyricDisplayApp.jsx`:

- Reworked the main background and sidebar into a darker production-console surface.
- Made icon buttons consistent across the top toolbar.
- Replaced the gradient load button with a calmer signal-blue primary action.
- Converted output on/off into a live-state card with clearer copy: `Output live` / `Output hidden`.
- Tightened panel spacing and made the right lyric workspace feel like a deliberate control surface.

### Lyrics list

Updated `LyricsList.jsx`:

- Replaced generic gray/blue line states with dedicated lyric row classes.
- Current output line is more obvious and uses a small internal live indicator.
- Search and multi-select states are visually distinct without relying on color alone.
- Section chips now sit on a firmer sticky control strip.

### Output settings

Updated `OutputSettingsPanel.jsx`:

- Settings rows now sit in quiet bordered control bands.
- Header now includes a compact label and helper copy.
- Controls feel grouped and operational rather than flat dashboard rows.

### Mobile controller

Updated `MobileLayout.jsx`:

- Applied the same Sanctuary Deck shell and header surface.
- Mobile icon buttons now match the desktop button vocabulary.
- Create Lyrics uses the calmer primary action style.
- Main mobile lyric surface uses the new content surface.

## Verification

Ran:

```bash
npm run build
```

Result: build passes.

Remaining warning: Vite still warns about a large main chunk. That is expected from existing shared dependencies and font payload, not from the redesign pass.
