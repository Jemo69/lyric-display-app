# Split Line Delay Fix

## Problem

When a long `.lrc` lyric line is split into multiple display lines, the app can introduce an artificial pause before advancing to the next split segment.

This happens because:

1. `parseLrcContent()` keeps the same timestamp for every segment produced by `splitLongLine()`.
2. `calculateTimestampDelay()` computes `nextTime - currentTime`.
3. Two adjacent split segments from the same original line therefore produce `0ms`.
4. `calculateTimestampDelay()` rejects delays below `100ms` and returns `null`.
5. `useAutoplayManager()` falls back to the manual autoplay interval, which creates the visible delay.

Relevant code:

- `shared/lyricsParsing.js:289-290`
- `shared/lyricsParsing.js:675`
- `src/utils/timestampHelpers.js:48-52`
- `src/hooks/useAutoplayManager.js:168-170`

## Root Cause

The split-line feature itself is not slow. The delay is caused by how timestamp-based autoplay interprets split lines that share one source timestamp.

The current logic treats `0ms` as invalid instead of as "advance immediately to the next split segment".

## Fix

Use a small explicit delay for same-timestamp adjacent lines instead of falling back to the global autoplay interval.

Recommended behavior:

1. If `nextTime > currentTime`, keep using the real timestamp gap.
2. If `nextTime === currentTime`, return a small delay such as `50ms`.
3. If `nextTime < currentTime`, still treat it as invalid and return `null`.
4. Keep rejecting obviously bad large gaps above the current upper bound.

This preserves natural timestamp playback while making split segments advance almost immediately.

## Concrete Code Changes

### 1. Update timestamp delay calculation

File: `src/utils/timestampHelpers.js`

Change `calculateTimestampDelay()` so same-timestamp neighbors no longer return `null`.

Suggested logic:

```js
const delayInMs = (nextTime - currentTime) * 10;

if (delayInMs < 0 || delayInMs > 30000) {
  return null;
}

if (delayInMs === 0) {
  return 50;
}

if (delayInMs < 100) {
  return 100;
}

return delayInMs;
```

Why this is the smallest safe change:

- It fixes the visible delay without changing parsing structure.
- It keeps all timestamp logic in one place.
- It avoids new metadata or special-case branching in the autoplay hook.

### 2. Keep autoplay fallback unchanged

File: `src/hooks/useAutoplayManager.js`

No structural change should be required here if `calculateTimestampDelay()` returns a usable value for same-timestamp split lines.

Current logic can remain:

```js
const delay = calculateTimestampDelay(currentTimestamps, currentIndex, nextIndex);
const finalDelay = delay !== null ? delay : (currentSettings.interval * 1000);
```

## Secondary Fixes

These do not directly cause the split-line playback delay, but they should be fixed because they make split behavior inconsistent across environments.

### 3. Pass splitting options to the worker

File: `src/utils/asyncLyricsParser.js`

Current worker payload omits `enableSplitting` and `splitConfig`.

Update:

```js
const workerPromise = sendToWorker({
  action: 'parse-file',
  payload: {
    fileType: options.fileType,
    file: file ?? null,
    content: options.rawText ?? null,
    enableSplitting: options.enableSplitting ?? false,
    splitConfig: options.splitConfig || {},
  },
});
```

Without this, browser worker parsing may ignore split settings.

### 4. Pass splitting options through Electron IPC

Files:

- `src/utils/asyncLyricsParser.js`
- `main/ipc.js`

Renderer payload should include:

```js
const payload = {
  fileType,
  name: options.name || file?.name || '',
  path: file?.path || options.path || null,
  rawText: options.rawText || null,
  enableSplitting: options.enableSplitting ?? false,
  splitConfig: options.splitConfig || {},
};
```

Main-process handler should read and forward them:

```js
const { fileType = 'txt', path: filePath, rawText, enableSplitting, splitConfig } = payload || {};
const parser = fileType === 'lrc' ? parseLrcContent : parseTxtContent;
const result = parser(content, { enableSplitting, splitConfig });
```

Without this, Electron parsing can behave differently from worker and direct parsing.

## What Not To Change

- Do not change `splitLongLine()` for this issue.
- Do not add extra per-line metadata unless the simple timestamp fix proves insufficient.
- Do not move split logic into autoplay.

The delay issue is caused by timestamp interpretation, not by the split algorithm itself.

## Verification Plan

### Manual test

Use an `.lrc` sample where one long timestamped line is split into two or more segments.

Example expectation:

1. Import `.lrc` lyrics with intelligent splitting enabled.
2. Start intelligent autoplay.
3. Observe a split line pair that came from one source timestamp.
4. Confirm the next segment appears almost immediately instead of waiting for the fallback autoplay interval.

### Regression checks

Verify all of the following:

1. Normal `.lrc` lines with different timestamps still respect their real timing.
2. Invalid timestamp order still falls back safely.
3. Plain `.txt` autoplay behavior is unchanged.
4. Worker parsing and Electron parsing both honor `enableSplitting`.

## Optional Follow-Up

If `50ms` feels too fast or too abrupt visually, make the same-timestamp delay a named constant in `src/utils/timestampHelpers.js`, for example:

```js
const SAME_TIMESTAMP_SPLIT_DELAY_MS = 50;
```

That makes the behavior easy to tune without changing the parser or autoplay hook.

## Recommended Order

1. Fix `calculateTimestampDelay()`.
2. Fix worker payload forwarding.
3. Fix Electron IPC forwarding.
4. Test with a split `.lrc` file in both browser and Electron flows.

This is the minimal path that should remove the user-visible delay and also make split-line behavior consistent across code paths.
