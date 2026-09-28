import { describe, it, expect } from 'vitest';
import { lanesForCapabilities, findLane, LANE_IDS } from '../capabilities.js';
import { THRESHOLDS } from '../thresholds.js';

const CAP = (over = {}) => ({
  wordTimestamps: true,
  biasSupport: true,
  ...over,
});

describe('lanesForCapabilities (plan 14: capability gating, D11)', () => {
  it('a provider reporting no word timestamps disables the lyric lane, stated', () => {
    const lanes = lanesForCapabilities(CAP({ wordTimestamps: false }));
    const lyric = findLane(lanes, 'lyric');
    expect(lyric.enabled).toBe(false);
    expect(lyric.reason.length).toBeGreaterThan(0);
    // The other lanes are unaffected — only next-lyric needs word alignment.
    expect(findLane(lanes, 'verse').enabled).toBe(true);
    expect(findLane(lanes, 'note').enabled).toBe(true);
  });

  it('wordTimestamps must be strictly true to enable the lyric lane', () => {
    for (const value of [false, undefined, null, 1, 'yes']) {
      expect(findLane(lanesForCapabilities(CAP({ wordTimestamps: value })), 'lyric').enabled).toBe(
        false
      );
    }
    expect(findLane(lanesForCapabilities(CAP({ wordTimestamps: true })), 'lyric').enabled).toBe(
      true
    );
  });

  it('a provider reporting no bias support surfaces the degradation', () => {
    const lanes = lanesForCapabilities(CAP({ biasSupport: false }));
    expect(findLane(lanes, 'lyric').enabled).toBe(true);
    expect(findLane(lanes, 'lyric').degraded).toBe(true);
    expect(findLane(lanes, 'lyric').reason.length).toBeGreaterThan(0);
    expect(findLane(lanes, 'verse').degraded).toBe(true);
    // The note lane is an editable draft the operator proofreads, so it is
    // never degraded by a capability it does not use.
    expect(findLane(lanes, 'note').degraded).toBe(false);
    expect(findLane(lanes, 'note').enabled).toBe(true);
  });

  it('an unreported capability degrades conservatively (D11 default)', () => {
    const lanes = lanesForCapabilities({});
    const lyric = findLane(lanes, 'lyric');
    // Unknown word timestamps -> the lane is off entirely (disabled is
    // stronger than degraded) and it says so.
    expect(lyric.enabled).toBe(false);
    expect(lyric.reason.length).toBeGreaterThan(0);
    // Unknown bias -> the lanes where book/hymn names decide correctness
    // are degraded rather than disabled.
    expect(findLane(lanes, 'verse').enabled).toBe(true);
    expect(findLane(lanes, 'verse').degraded).toBe(true);
    expect(findLane(lanes, 'note').enabled).toBe(true);
    expect(findLane(lanes, 'note').degraded).toBe(false);
  });

  it('no provider at all disables everything, with a reason on every lane', () => {
    for (const input of [null, undefined, 'whisper', 42]) {
      const lanes = lanesForCapabilities(input);
      expect(lanes.map((lane) => lane.id)).toEqual(LANE_IDS);
      for (const lane of lanes) {
        expect(lane.enabled).toBe(false);
        expect(lane.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('neither failure is silent: every disabled or degraded lane states why', () => {
    const combinations = [
      CAP(),
      CAP({ wordTimestamps: false }),
      CAP({ biasSupport: false }),
      CAP({ wordTimestamps: false, biasSupport: false }),
      CAP({ biasSupport: undefined }),
      {},
      null,
    ];
    for (const input of combinations) {
      for (const lane of lanesForCapabilities(input)) {
        if (!lane.enabled || lane.degraded) {
          expect(
            lane.reason,
            `${JSON.stringify(input)} -> ${lane.id} must state its reason`
          ).toEqual(expect.stringMatching(/\S/));
        }
      }
    }
  });

  it('a fully capable provider gets all three lanes undegraded with no noise', () => {
    const lanes = lanesForCapabilities(CAP());
    expect(lanes.map((lane) => lane.id)).toEqual(['lyric', 'verse', 'note']);
    expect(lanes.every((lane) => lane.enabled && !lane.degraded)).toBe(true);
    expect(lanes.every((lane) => lane.reason === '')).toBe(true);
  });

  it('shares the one suggestion threshold with the detectors', () => {
    expect(THRESHOLDS.suggestion).toBe(0.6);
    expect(THRESHOLDS.lyricFuse).toBeCloseTo(1 - THRESHOLDS.suggestion, 5);
  });

  it('findLane is null for an unknown id rather than throwing', () => {
    expect(findLane(lanesForCapabilities(CAP()), 'chorus')).toBeNull();
    expect(findLane(null, 'lyric')).toBeNull();
  });
});
