import { describe, it, expect } from 'vitest';
import {
  combine,
  segmentWeight,
  clamp01,
  clearsSuggestionFloor,
} from '../confidence.js';
import { THRESHOLDS } from '../thresholds.js';

describe('combine: match confidence × segment confidence', () => {
  it('is a product, so a hallucination-shaped segment halves the score', () => {
    expect(combine(0.98, 0.5)).toBeCloseTo(0.49, 5);
    expect(combine(0.98, 0.5)).toBeLessThan(THRESHOLDS.suggestion);
  });

  it('never returns >1 or <0 regardless of inputs', () => {
    expect(combine(5, 5)).toBe(1);
    expect(combine(-1, 0.5)).toBe(0);
    expect(combine(0.9, 1.4)).toBe(0.9);
  });

  it('a missing segment confidence is neutral (1), a missing match is 0', () => {
    // Absence of a segment weight is not evidence of noise: the explicit
    // gates in hallucination.js still run before any suggestion is made.
    expect(combine(0.7, undefined)).toBe(0.7);
    expect(combine(0.7, null)).toBe(0.7);
    // But a match with no confidence of its own never reaches a card —
    // garbage-in is suppressed, not promoted to a perfect match.
    expect(combine(undefined, 0.7)).toBe(0);
    expect(Number.isNaN(combine(undefined, 0.7))).toBe(false);
    expect(combine()).toBe(0);
  });

  it('non-numeric confidence is suppressed, never NaN', () => {
    expect(combine('loud', 0.8)).toBe(0);
    expect(combine(0.9, 'loud')).toBe(0);
    expect(Number.isNaN(combine('loud', 'quiet'))).toBe(false);
  });
});

describe('segmentWeight: the segment’s own trust in [0, 1]', () => {
  it('prefers the model’s no_speech_prob (1 − prob)', () => {
    expect(segmentWeight({ noSpeechProb: 0.2 })).toBeCloseTo(0.8, 5);
    expect(segmentWeight({ noSpeechProb: 1 })).toBe(0);
    expect(segmentWeight({ noSpeechProb: 0 })).toBe(1);
  });

  it('falls back to the engine-reported confidence', () => {
    expect(segmentWeight({ confidence: 0.42 })).toBe(0.42);
  });

  it('neutral (1) when the segment reports nothing or is not an object', () => {
    expect(segmentWeight({})).toBe(1);
    expect(segmentWeight(null)).toBe(1);
    expect(segmentWeight('a string segment')).toBe(1);
    expect(segmentWeight({ noSpeechProb: 'loud' })).toBe(1);
  });
});

describe('clamp01', () => {
  it('clamps into [0,1]', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(9)).toBe(1);
    expect(clamp01(undefined)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('clearsSuggestionFloor: one shared floor for every lane', () => {
  it('is exactly THRESHOLDS.suggestion at the boundary', () => {
    expect(THRESHOLDS.suggestion).toBe(0.6);
    expect(clearsSuggestionFloor(0.6)).toBe(true);
    expect(clearsSuggestionFloor(0.59)).toBe(false);
    expect(clearsSuggestionFloor(0.9)).toBe(true);
    expect(clearsSuggestionFloor(-1)).toBe(false);
    expect(clearsSuggestionFloor(Number.NaN)).toBe(false);
  });
});
