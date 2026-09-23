import { useEffect, useState } from 'react';

/**
 * Shared render-clock utilities (missing-feature #05, piece 3 of 3).
 *
 * BEFORE (the per-second recalculation path this replaces):
 * - `StageOutput` ran `setInterval(() => setCurrentTime(new Date()), 1000)`
 *   unconditionally, re-rendering the whole output surface every second even
 *   though the visible clock only shows HH:MM (changes ~1x/minute).
 * - The countdown display ran a second `setInterval(..., 1000)` whose effect
 *   depended on the whole `timerState` object, so every socket/custom-event
 *   emit (new object identity) tore the interval down and rebuilt it, and the
 *   interval kept firing `setState` every second forever after expiry.
 * - `useStageDisplayControls` ran a third per-second interval whose effect
 *   depended on the `emitStageTimerUpdate` callback identity, churning the
 *   timer whenever the socket context re-created the emitter.
 * - Plain 1000ms intervals drift against wall-clock seconds, so over an
 *   8am–2pm service the displayed countdown skewed cumulatively.
 *
 * AFTER (this module):
 * - One boundary-aligned timeout chain per clock (fires on the second /
 *   minute edge, no cumulative drift).
 * - `setState` only when the displayed value actually changes (same-string /
 *   same-key guard), so idle ticks are free and post-expiry ticking stops.
 * - Effects depend on primitives (`running`, `paused`, `endTime`), never on
 *   object or callback identity — no teardown/rebuild churn.
 */

export const COUNTDOWN_WARNING_THRESHOLD_MS = 30_000;

/** Milliseconds remaining until `endTime` (epoch ms). Null when unusable. */
export const computeCountdownRemaining = (endTime, now = Date.now()) => {
  const end = Number(endTime);
  const at = Number(now);
  if (!Number.isFinite(end) || end <= 0 || !Number.isFinite(at)) return null;
  return Math.max(0, Math.floor(end - at));
};

/** Format a remaining-ms value as `m:ss`. Null in → null out. */
export const formatCountdown = (remainingMs) => {
  if (remainingMs === null || remainingMs === undefined) return null;
  const clamped = Math.max(0, Math.floor(Number(remainingMs)));
  if (!Number.isFinite(clamped)) return null;
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** True while the countdown is inside the sub-30s warning band. */
export const isCountdownWarning = (remainingMs, thresholdMs = COUNTDOWN_WARNING_THRESHOLD_MS) => {
  const remaining = Number(remainingMs);
  const threshold = Number(thresholdMs);
  return Number.isFinite(remaining) && remaining > 0 && remaining < threshold;
};

/** HH:MM wall-clock string (matches the stage bottom-bar display). */
export const formatWallClock = (date) => {
  const time = date instanceof Date ? date : new Date(date);
  return time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

/** Ms until the next whole-second (or whole-minute) wall-clock boundary. */
export const msToNextBoundary = (now = Date.now(), precisionMs = 1000) => {
  const at = Number(now);
  const step = Number(precisionMs) > 0 ? Number(precisionMs) : 1000;
  if (!Number.isFinite(at)) return step;
  return step - (at % step);
};

const armTimeout = (fn, delay) => {
  const timer = setTimeout(fn, Math.min(Math.max(1, delay), 60000));
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
};

/**
 * Countdown display state driven by a single boundary-aligned timeout chain.
 * Stops ticking once remaining hits zero (calls `onExpire` once). Returns
 * `{ display, remainingMs, isWarning }`.
 */
export const useCountdownDisplay = ({
  running,
  paused,
  endTime,
  frozenRemaining = null,
  onExpire,
} = {}) => {
  const [display, setDisplay] = useState(() => (
    running && !paused && Number.isFinite(Number(endTime))
      ? formatCountdown(computeCountdownRemaining(endTime))
      : (frozenRemaining ?? null)
  ));
  const [remainingMs, setRemainingMs] = useState(() => (
    running && !paused && Number.isFinite(Number(endTime))
      ? computeCountdownRemaining(endTime)
      : null
  ));

  useEffect(() => {
    if (!running || paused || !Number.isFinite(Number(endTime))) {
      setRemainingMs((prev) => (prev === null ? prev : null));
      setDisplay((prev) => {
        const next = frozenRemaining ?? null;
        return prev === next ? prev : next;
      });
      return undefined;
    }
    let timer = null;
    let cancelled = false;
    let expired = false;
    const tick = () => {
      if (cancelled) return;
      const remaining = computeCountdownRemaining(endTime, Date.now());
      setRemainingMs((prev) => (prev === remaining ? prev : remaining));
      setDisplay((prev) => {
        const next = formatCountdown(remaining);
        return prev === next ? prev : next;
      });
      if (remaining === null || remaining <= 0) {
        if (!expired) {
          expired = true;
          try {
            onExpire?.(endTime);
          } catch {
              // Expiry callbacks must never break the clock.
            }
        }
        return;
      }
      timer = armTimeout(tick, msToNextBoundary(Date.now(), 1000));
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [running, paused, endTime, frozenRemaining, onExpire]);

  return { display, remainingMs, isWarning: isCountdownWarning(remainingMs) };
};

/**
 * Wall-clock Date that updates on whole-second (default) or whole-minute
 * boundaries and skips `setState` when the displayed key is unchanged.
 * `precision: 'minute'` matches the HH:MM stage display and cuts idle
 * re-renders ~60x versus the old unconditional per-second `setState`.
 */
export const useWallClock = ({ enabled = true, precision = 'second' } = {}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return undefined;
    const step = precision === 'minute' ? 60000 : 1000;
    const keyOf = (date) => (precision === 'minute'
      ? formatWallClock(date)
      : Math.floor(date.getTime() / 1000));
    let timer = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setNow((prev) => {
        const next = new Date();
        return keyOf(prev) === keyOf(next) ? prev : next;
      });
      timer = armTimeout(tick, msToNextBoundary(Date.now(), step));
    };
    timer = armTimeout(tick, msToNextBoundary(Date.now(), step));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, precision]);

  return now;
};
