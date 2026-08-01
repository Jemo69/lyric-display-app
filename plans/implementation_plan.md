# Implementation Plan

This plan details the steps to implement three requested features: Transparent Background, Removing Upcoming Song from Stage Mode, and Updating the GitHub Repository links.

## 1. Transparent Background

**Objective:** Allow output windows (specifically Stage and Output displays) to have a transparent background, enabling them to be overlaid on other content (e.g., in OBS or on the desktop).

**Analysis:**
- Currently, `main/windows.js` sets `transparent: false` for all windows.
- The frontend (`src/pages/Stage.jsx`) handles the CSS side of transparency, but the Electron window itself is opaque.

**Steps:**
1.  **Modify `main/windows.js`**:
    - Update the `createWindow` function to accept a `windowOptions` object or specific flags for transparency.
    - Set `transparent: true` and `backgroundColor: '#00000000'` when creating output/stage windows.
    - Ensure `frame: false` is set if not already when transparency is enabled (usually required for transparency to work without artifacts on some platforms).
2.  **Update Window Creation Logic**:
    - Identify where `createWindow` is called for the Stage and Output windows (likely in `main/displayManager.js` or `main/windows.js` itself if it handles routing).
    - Pass the transparency flag during creation.

## 2. Remove Upcoming Song from Stage Mode

**Objective:** Hide the "Upcoming Song" display from the Stage view by default.

**Analysis:**
- `src/pages/Stage.jsx` renders the upcoming song name in the top bar.
- `src/context/LyricsStore.js` holds the default settings.
- `src/components/StageSettingsPanel.jsx` controls the settings.

**Steps:**
1.  **Update Default Settings**:
    - Edit `src/context/LyricsStore.js` to add `showUpcomingSong: false` to the default `stageSettings`.
2.  **Update Stage Component**:
    - Edit `src/pages/Stage.jsx` to destructure `showUpcomingSong` from `stageSettings`.
    - Wrap the "Upcoming Song" rendering block in a conditional check: `{showUpcomingSong && ( ... )}`.
3.  **Update Settings Panel**:
    - Edit `src/components/StageSettingsPanel.jsx` to add a toggle switch for "Show Upcoming Song". This ensures the feature isn't lost forever if the user changes their mind.

## 3. Change Updater to GitHub Fork

**Objective:** Ensure all update and release mechanisms point to `https://github.com/Jemo69/lyric-display-app.git`.

**Analysis:**
- `package.json` already points to the correct repo in the `build.publish` configuration.
- `scripts/release.js` contains hardcoded links to the original repository (`PeterAlaks/lyric-display-app`).

**Steps:**
1.  **Update `scripts/release.js`**:
    - Replace all occurrences of `PeterAlaks/lyric-display-app` with `Jemo69/lyric-display-app`.
    - Verify `gh` CLI commands in the script use the correct context (they usually infer from the git remote, but the script prints links that need to be correct).
2.  **Verify `package.json`**:
    - Double-check the `repository` field and `build.publish` configuration (already done, but good to confirm).

## Execution Order
1.  **Updater**: Quickest fix, isolated.
2.  **Upcoming Song**: Frontend change, low risk.
3.  **Transparency**: Backend/Electron change, requires careful window creation testing.
