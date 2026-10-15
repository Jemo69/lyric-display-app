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

  // The bug this pins: an engine that has not reported its capabilities
  // (the default state, on a fresh install) produced a lyric-lane reason AND a
  // verse-lane reason containing the SAME bias sentence. The operator read one
  // warning twice, which reads as a broken rail and trains people to skip the
  // notice. Two lanes, two sentences.
  it('two lanes affected by one missing capability never read identically', () => {
    for (const biasSupport of [false, undefined, null]) {
      const lanes = lanesForCapabilities({ wordTimestamps: false, biasSupport });
      const lyric = findLane(lanes, 'lyric');
      const verse = findLane(lanes, 'verse');
      expect(verse.reason.length).toBeGreaterThan(0);
      expect(verse.reason, 'the verse lane needs its own wording').not.toBe(lyric.reason);
      // Neither may CONTAIN the other — a substring overlap renders the same
      // words twice just as surely as an exact match does.
      expect(verse.reason.includes(lyric.reason)).toBe(false);
      expect(lyric.reason.includes(verse.reason)).toBe(false);
    }
  });

  it('no two lanes carry the same sentence', () => {
    for (const capabilities of [{}, { wordTimestamps: false }, { biasSupport: false }]) {
      const sentences = lanesForCapabilities(capabilities)
        .map((lane) => lane.reason)
        .filter(Boolean)
        .flatMap((reason) => reason.split(/(?<=\.)\s+/));
      expect(new Set(sentences).size, `duplicated sentence: ${sentences.join(' / ')}`).toBe(
        sentences.length
      );
    }
  });

  // A missing provider is the ONE case where every lane is off for the same
  // reason, and repeating that single sentence three times is exactly the
  // duplication this whole change exists to remove. It is also the state a
  // fresh install sits in, so it is the state an operator sees first.
  it('a missing provider reports its one reason once, not once per lane', () => {
    const lanes = lanesForCapabilities(null);
    expect(lanes.every((lane) => !lane.enabled)).toBe(true);
    const reasons = new Set(lanes.map((lane) => lane.reason));
    expect(reasons.size, 'three identical sentences is one sentence too many').toBe(1);
    // Still one reason per lane in the data — the deduping happens at render,
    // so no consumer of this function loses the explanation.
    expect(lanes.every((lane) => lane.reason.length > 0)).toBe(true);
  });

  it('still states every disabled and degraded lane — deduping never silences one', () => {
    const lanes = lanesForCapabilities({});
    for (const lane of lanes) {
      if (!lane.enabled || lane.degraded) {
        expect(lane.reason.length, `${lane.id} must carry a reason`).toBeGreaterThan(0);
      }
    }
  });
});
