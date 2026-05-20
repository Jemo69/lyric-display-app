# Performance Optimization Proposal

This proposal addresses the "stutter and delay" issues reported on older hardware by optimizing rendering, reducing CPU load, and providing user-controllable performance settings.

## Problem Analysis
The app currently suffers from performance bottlenecks on older machines due to:
1. **Disabled Hardware Acceleration**: Forcing the CPU to render all graphics.
2. **Expensive Font Calculations**: Binary search with DOM manipulation on every slide change.
3. **Animation Overhead**: `framer-motion` being heavy on low-end CPUs without GPU help.
4. **Memory Usage**: High RAM consumption from video preloading.

## Proposed Fixes

### 1. Rendering Engine (Main Process)
**File**: `main.js`
- **Change**: Make `app.disableHardwareAcceleration()` conditional.
- **Rationale**: Re-enabling GPU acceleration is the single most effective way to improve performance on most systems.

### 2. Font Auto-Sizing Optimization
**File**: `src/utils/maxLinesCalculator.js`
- **Change**: Implement a result cache (Memoization).
- **Rationale**: Prevents repeated expensive calculations for choruses or common lines. If the text and screen size haven't changed, the app should use the cached font size immediately.

### 3. Performance Mode & Settings
**Files**: `src/context/LyricsStore.js`, `src/components/OutputSettingsPanel.jsx`
- **Change**: Add a new **Performance** category in the settings panel with:
    - **Low Power Mode**: Disables all animations and transitions.
    - **Disable Video Preloading**: Reduces RAM usage by streaming videos directly from disk.
    - **Reduced Graphics**: Simplifies text shadows and borders.

### 4. Optimized Output Rendering
**Files**: `src/pages/RegularOutput.jsx`, `src/pages/StageOutput.jsx`
- **Change**: Respect performance settings by disabling `framer-motion` components when Low Power Mode is active.
- **Change**: Optimize the sync logic to reduce the frequency of full-state requests.

## Implementation Timeline
1. **Phase 1**: Optimization of `maxLinesCalculator` and re-enabling Hardware Acceleration.
2. **Phase 2**: Adding Performance settings to the UI.
3. **Phase 3**: Updating Output windows to respect Performance settings.

---
**Drafted by**: Antigravity (AI Assistant)
**Date**: May 19, 2026
