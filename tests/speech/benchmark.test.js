/**
 * Plan 14 requires three named test groups for the benchmark, and this is the
 * one that decides whether a model choice is defensible:
 *
 *  - "Recommendation logic: Pure-function tests over synthetic result sets:
 *     picks the fastest model within the margin, refuses to recommend a model
 *     failing the RTF gate, and degrades honestly when nothing passes."
 *  - "Benchmark determinism: The same model benchmarked twice yields WER within
 *     noise. If a metric is unstable it cannot be used to choose anything, and
 *     the UI must say so rather than presenting a noisy number as decisive."
 */
import { describe, it, expect } from 'vitest';
import {
  THRESHOLDS,
  recommendModel,
  gatedResults,
  sortByWer,
  passesRtfGate,
  assessStability,
  detectThermalDecay,
  detectCpuFallback,
  assessResult,
} from '../../src/speech/benchmark.js';

/** A result with sensible defaults, so each test states only what it is about. */
const result = (modelId, wer, rtf, extra = {}) => ({ modelId, wer, rtf, backend: 'Metal', ...extra });

// A realistic spread: large-v3 is the most accurate and too slow; turbo-q8_0 is
// the sweet spot; turbo-q5_0 is faster but noticeably worse; base is the floor.
const CATALOG_RESULTS = [
  result('large-v3', 0.041, 1.8),
  result('large-v3-turbo-q8_0', 0.046, 0.5),
  result('large-v3-turbo-q5_0', 0.068, 0.6),
  result('base.en-q8_0', 0.31, 0.12),
];

describe('RTF gate', () => {
  it('anything at or above real time cannot keep up with a live sermon', () => {
    expect(passesRtfGate(result('x', 0.1, 0.99))).toBe(true);
    expect(passesRtfGate(result('x', 0.1, 1.0))).toBe(false);
    expect(passesRtfGate(result('x', 0.1, 1.8))).toBe(false);
  });

  it('an unmeasured model is not treated as passing', () => {
    // Defaulting "we never measured it" to "fine" is how a slow model gets
    // adopted on a machine nobody benchmarked properly.
    expect(passesRtfGate(result('x', 0.1, null))).toBe(false);
    expect(passesRtfGate(result('x', 0.1, undefined))).toBe(false);
    expect(passesRtfGate(result('x', 0.1, 0))).toBe(false);
    expect(passesRtfGate(result('x', 0.1, -1))).toBe(false);
    expect(passesRtfGate(null)).toBe(false);
  });

  it('gatedResults keeps only comparable rows', () => {
    const gated = gatedResults([
      ...CATALOG_RESULTS,
      result('never-measured', 0.05, null),
      { modelId: 'no-wer', rtf: 0.3 },
      null,
    ]);
    expect(gated.map((r) => r.modelId)).toEqual([
      'large-v3-turbo-q8_0',
      'large-v3-turbo-q5_0',
      'base.en-q8_0',
    ]);
  });
});

describe('recommendModel', () => {
  it('picks the fastest model within the WER margin of the best measured', () => {
    const decision = recommendModel(CATALOG_RESULTS);
    // large-v3 has the best WER (0.041) but is 1.8x realtime — gated out.
    // Within the 0.02 margin of the best GATED result, turbo-q8_0 is fastest.
    expect(decision.modelId).toBe('large-v3-turbo-q8_0');
  });

  it('refuses to recommend a model that fails the RTF gate, however accurate', () => {
    const decision = recommendModel([
      result('too-slow-but-perfect', 0.001, 4.0),
      result('fast-and-decent', 0.2, 0.3),
    ]);
    expect(decision.modelId).toBe('fast-and-decent');
    expect(decision.reason).not.toMatch(/too-slow-but-perfect/);
    // ...but the exclusion is REPORTED, so an operator can see which rule
    // dropped their preferred model.
    expect(decision.rejected.map((r) => r.modelId)).toContain('too-slow-but-perfect');
    expect(decision.rejected[0].reason).toMatch(/too slow|4\.00x/i);
  });

  it('degrades honestly when nothing passes', () => {
    const decision = recommendModel([
      result('a', 0.01, 2.0),
      result('b', 0.02, 3.0),
    ]);
    expect(decision.modelId).toBeNull();
    expect(decision.reason).toMatch(/no benchmarked model is fast enough/i);
    expect(decision.rejected).toHaveLength(2);
  });

  it('degrades honestly when nothing has been benchmarked', () => {
    expect(recommendModel([]).modelId).toBeNull();
    expect(recommendModel(null).modelId).toBeNull();
    expect(recommendModel(undefined).reason).toMatch(/nothing has been benchmarked/i);
  });

  it('keeps the best model when nothing is faster within the margin', () => {
    const decision = recommendModel([
      result('best', 0.04, 0.9),
      result('slower', 0.2, 0.95),
    ]);
    expect(decision.modelId).toBe('best');
    expect(decision.reason).toMatch(/best measured error rate/i);
  });

  it('shows the margin and the cost, so the reasoning can be disagreed with', () => {
    // Plan 9.4: "shown with its numbers and its margin so the user can see the
    // reasoning and disagree with it".
    // Both must be ELIGIBLE for the speed trade to happen: the earlier draft
    // used an rtf of 1.8 for 'accurate', which the gate removes, leaving only
    // one candidate and no trade to describe.
    const decision = recommendModel([
      result('accurate', 0.041, 0.9),
      result('fast', 0.055, 0.4),
    ], { margin: 0.02 });
    expect(decision.modelId).toBe('fast');
    expect(decision.margin).toBe(0.02);
    expect(decision.reason).toMatch(/faster/i);
    expect(decision.reason).toMatch(/margin/i);
  });

  it('a model OUTSIDE the margin is not recommended just for being fast', () => {
    // turbo-q5_0 is much worse than turbo-q8_0 here; speed must not buy it.
    const decision = recommendModel([
      result('turbo-q8_0', 0.046, 0.5),
      result('turbo-q5_0', 0.068, 0.2),
    ], { margin: 0.02 });
    expect(decision.modelId).toBe('turbo-q8_0');
  });

  it('is deterministic — the same results always give the same answer', () => {
    const a = recommendModel(CATALOG_RESULTS).modelId;
    const b = recommendModel([...CATALOG_RESULTS].reverse()).modelId;
    expect(a).toBe(b);
  });

  it('sortByWer is a total order, so the table never reshuffles between runs', () => {
    const rows = [result('b', 0.2, 0.3), result('a', 0.2, 0.3), result('c', 0.1, 0.9)];
    expect(sortByWer(rows).map((r) => r.modelId)).toEqual(['c', 'a', 'b']);
    // Ties break on RTF first.
    expect(sortByWer([result('slow', 0.1, 0.9), result('fast', 0.1, 0.2)]).map((r) => r.modelId)).toEqual([
      'fast',
      'slow',
    ]);
    // And it does not mutate its input.
    const input = [...CATALOG_RESULTS];
    sortByWer(input);
    expect(input).toEqual(CATALOG_RESULTS);
  });
});

describe('assessStability', () => {
  it('two close runs are stable and can decide something', () => {
    const verdict = assessStability(result('m', 0.0461, 0.5), result('m', 0.0464, 0.5));
    expect(verdict.stable).toBe(true);
    expect(verdict.delta).toBeCloseTo(0.0003, 10);
    expect(verdict.reason).toMatch(/inside/i);
  });

  it('two runs outside the noise floor are NOT stable, and say so', () => {
    // Plan 14: "the UI must say so rather than presenting a noisy number as
    // decisive."
    const verdict = assessStability(result('m', 0.04, 0.5), result('m', 0.12, 0.5));
    expect(verdict.stable).toBe(false);
    expect(verdict.reason).toMatch(/cannot choose between models/i);
    expect(verdict.reason).toMatch(/run it again/i);
  });

  it('the noise floor is tighter than the recommendation margin, deliberately', () => {
    // If measurement noise were as wide as the decision margin, every
    // recommendation would be a coin toss.
    expect(THRESHOLDS.STABILITY_NOISE).toBeLessThan(THRESHOLDS.WER_MARGIN);
  });

  it('refuses to judge results that are not two runs of one model', () => {
    expect(assessStability(result('a', 0.1, 0.5), result('b', 0.1, 0.5)).stable).toBe(false);
    expect(assessStability(result('a', 0.1, 0.5), null).stable).toBe(false);
    expect(assessStability(result('a', null, 0.5), result('a', 0.1, 0.5)).stable).toBe(false);
  });
});

describe('detectThermalDecay', () => {
  it('flags a model that passes a short test then slows down', () => {
    // Plan 9.3: "a laptop that passes then degrades is worse than one that is
    // uniformly slow, because it fails at minute 25 of a service."
    const verdict = detectThermalDecay({ firstThirdRtf: 0.5, lastThirdRtf: 0.9 });
    expect(verdict.decayed).toBe(true);
    expect(verdict.ratio).toBeCloseTo(1.8, 5);
    expect(verdict.reason).toMatch(/slower/i);
  });

  it('does not flag a model that is uniformly slow', () => {
    const verdict = detectThermalDecay({ firstThirdRtf: 0.9, lastThirdRtf: 0.95 });
    expect(verdict.decayed).toBe(false);
    expect(verdict.reason).toMatch(/steady/i);
  });

  it('says it cannot tell from a partial run rather than guessing', () => {
    expect(detectThermalDecay({ firstThirdRtf: 0.5 }).decayed).toBe(false);
    expect(detectThermalDecay({}).reason).toMatch(/not enough/i);
    expect(detectThermalDecay(null).decayed).toBe(false);
  });
});

describe('detectCpuFallback', () => {
  it('flags a silent CPU fallback and says what to check', () => {
    // Plan 9.1 calls this the single most valuable diagnostic in the set:
    // otherwise a user concludes the model is slow when the GPU sat idle.
    const verdict = detectCpuFallback({ backend: 'cpu', expectedAccel: true });
    expect(verdict.fallback).toBe(true);
    expect(verdict.reason).toMatch(/GPU was never used/i);
  });

  it('does not flag CPU on a machine that has no accelerator', () => {
    const verdict = detectCpuFallback({ backend: 'CPU', expectedAccel: false });
    expect(verdict.fallback).toBe(false);
    expect(verdict.reason).toMatch(/expected/i);
  });

  it('passes a real backend through without complaining', () => {
    for (const backend of ['Metal', 'CUDA', 'Vulkan']) {
      expect(detectCpuFallback({ backend }).fallback, backend).toBe(false);
    }
  });

  it('says so plainly when the engine reported no backend at all', () => {
    expect(detectCpuFallback({}).backend).toBeNull();
    expect(detectCpuFallback({}).reason).toMatch(/did not report/i);
  });
});

describe('assessResult', () => {
  it('collects every concern about one result', () => {
    const notes = assessResult(
      result('m', 0.05, 0.4, { backend: 'cpu', firstThirdRtf: 0.3, lastThirdRtf: 0.9 })
    );
    // rtf 0.4 passes the gate, so this is two warnings (thermal decay + silent
    // CPU fallback), not three — an earlier draft counted the gate as if it
    // had fired.
    const levels = notes.map((n) => n.level);
    expect(notes).toHaveLength(2);
    expect(levels).toEqual(['warn', 'warn']);
    expect(notes.some((n) => /slower/i.test(n.reason))).toBe(true);
    expect(notes.some((n) => /GPU was never used/i.test(n.reason))).toBe(true);
  });

  it('a healthy result produces no notes', () => {
    expect(
      assessResult(result('m', 0.05, 0.4, { backend: 'Metal', firstThirdRtf: 0.4, lastThirdRtf: 0.41 }))
    ).toEqual([]);
  });

  it('a slow model is an error, not a warning', () => {
    const notes = assessResult(result('m', 0.05, 2.0, { backend: 'Metal', firstThirdRtf: 2, lastThirdRtf: 2 }));
    expect(notes.some((n) => n.level === 'error' && /too slow/i.test(n.reason))).toBe(true);
  });
});
