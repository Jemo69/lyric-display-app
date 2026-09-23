import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  computeCountdownRemaining,
  formatCountdown,
  isCountdownWarning,
  formatWallClock,
  msToNextBoundary,
  useCountdownDisplay,
  useWallClock,
} from '../renderClock.js';

describe('computeCountdownRemaining', () => {
  it('returns whole ms remaining against the supplied now', () => {
    expect(computeCountdownRemaining(10_000, 4_999)).toBe(5001);
  });
  it('clamps overdue timers at zero instead of going negative', () => {
    expect(computeCountdownRemaining(1_000, 60_000)).toBe(0);
  });
  it('returns null for unusable end times', () => {
    expect(computeCountdownRemaining(null)).toBeNull();
    expect(computeCountdownRemaining(undefined)).toBeNull();
    expect(computeCountdownRemaining('garbage')).toBeNull();
    expect(computeCountdownRemaining(0)).toBeNull();
    expect(computeCountdownRemaining(-5)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('formats m:ss with zero-padded seconds', () => {
    expect(formatCountdown(300_000)).toBe('5:00');
    expect(formatCountdown(9_400)).toBe('0:09');
    expect(formatCountdown(61_000)).toBe('1:01');
  });
  it('clamps at 0:00 and passes null through', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-500)).toBe('0:00');
    expect(formatCountdown(null)).toBeNull();
    expect(formatCountdown(undefined)).toBeNull();
  });
});

describe('isCountdownWarning', () => {
  it('is true only inside the sub-30s band', () => {
    expect(isCountdownWarning(29_999)).toBe(true);
    expect(isCountdownWarning(30_000)).toBe(false);
    expect(isCountdownWarning(0)).toBe(false);
    expect(isCountdownWarning(null)).toBe(false);
    expect(isCountdownWarning(120_000)).toBe(false);
  });
});

describe('msToNextBoundary', () => {
  it('measures to the next whole-second edge without drift accumulation', () => {
    expect(msToNextBoundary(1_000, 1000)).toBe(1000);
    expect(msToNextBoundary(1_500, 1000)).toBe(500);
    expect(msToNextBoundary(61_000, 60_000)).toBe(59_000);
  });
});

describe('formatWallClock', () => {
  it('renders an HH:MM string', () => {
    expect(formatWallClock(new Date('2026-09-20T08:05:00'))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('useCountdownDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T08:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks down on second boundaries and fires onExpire exactly once', async () => {
    const onExpire = vi.fn();
    // Stable endTime across re-renders (like the real consumers pass): an
    // inline Date.now()+N in the render callback would push the deadline on
    // every render and freeze the countdown — that input pattern is wrong.
    const endTime = Date.now() + 5000;
    const { result } = renderHook(() => useCountdownDisplay({
      running: true,
      paused: false,
      endTime,
      onExpire,
    }));
    expect(result.current.display).toBe('0:05');
    expect(result.current.isWarning).toBe(true);

    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(result.current.display).toBe('0:04');

    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(result.current.display).toBe('0:00');
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Post-expiry the chain stops: no more work per tick, no repeat expire.
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(result.current.display).toBe('0:00');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('shows the frozen remaining value while paused or stopped', () => {
    const frozenEndTime = Date.now() + 60_000;
    const paused = renderHook(() => useCountdownDisplay({
      running: true, paused: true, endTime: frozenEndTime, frozenRemaining: '4:59',
    }));
    expect(paused.result.current.display).toBe('4:59');

    const stopped = renderHook(() => useCountdownDisplay({
      running: false, paused: false, endTime: null, frozenRemaining: null,
    }));
    expect(stopped.result.current.display).toBeNull();
  });
});

describe('useWallClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T08:00:30.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('minute precision skips re-renders until the displayed minute changes', async () => {
    const { result } = renderHook(() => useWallClock({ precision: 'minute' }));
    const first = result.current;
    await act(async () => { vi.advanceTimersByTime(20_000); }); // 08:00:50, same minute
    expect(result.current).toBe(first);
    await act(async () => { vi.advanceTimersByTime(15_000); }); // 08:01:05, new minute
    expect(result.current).not.toBe(first);
    expect(formatWallClock(result.current)).toMatch(/^\d{2}:01$/);
  });
});
