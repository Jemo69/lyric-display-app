import { describe, it, expect } from 'vitest';
import {
  energyGate,
  noSpeechGate,
  repetitionGate,
  gateSegment,
  segmentWeightedConfidence,
  segmentWeight,
  GATE_REASONS,
} from '../hallucination.js';
import { THRESHOLDS } from '../thresholds.js';

const seg = (text, extra = {}) => ({
  sessionId: 'a',
  text,
  tStartMs: 0,
  tEndMs: 1000,
  ...extra,
});

describe('gate 1: energyGate', () => {
  it('passes when no stats were captured (the capture side attaches them)', () => {
    expect(energyGate({}).ok).toBe(true);
    expect(energyGate(undefined).ok).toBe(true);
  });

  it('rejects a peak or RMS strictly below the noise floor', () => {
    const t = THRESHOLDS.noiseFloor;
    expect(energyGate({ peak: t.peak / 2 }).ok).toBe(false);
    expect(energyGate({ rms: t.rms / 2 }).ok).toBe(false);
    expect(energyGate({ peak: t.peak / 2 }).reason).toBe(GATE_REASONS.BELOW_NOISE_FLOOR);
    // Room tone with a loud transient still fails on RMS, and vice versa:
    // a present-but-quiet statistic discards the segment.
    expect(energyGate({ peak: t.peak * 4, rms: t.rms / 2 }).ok).toBe(false);
    expect(energyGate({ peak: t.peak * 2, rms: t.rms * 2 }).ok).toBe(true);
  });

  it('non-numeric stats never gate', () => {
    expect(energyGate({ peak: 'loud', rms: 'louder' }).ok).toBe(true);
  });
});

describe('gate 2: noSpeechGate', () => {
  it('passes when the detector value is absent', () => {
    expect(noSpeechGate({}).ok).toBe(true);
    expect(noSpeechGate({ noSpeechProb: null }).ok).toBe(true);
    expect(noSpeechGate(seg('anything')).ok).toBe(true);
  });

  it('rejects at or above the no-speech threshold', () => {
    expect(noSpeechGate({ noSpeechProb: 0.93 }).ok).toBe(false);
    expect(noSpeechGate({ noSpeechProb: 0.6 }).ok).toBe(false);
    expect(noSpeechGate({ noSpeechProb: 0.93 }).reason).toBe(
      GATE_REASONS.MODEL_FLAGGED_NO_SPEECH
    );
    expect(noSpeechGate({ noSpeechProb: 0.3 }).ok).toBe(true);
  });
});

describe('gate 3: repetitionGate', () => {
  it('passes prose and single/double repeats', () => {
    expect(repetitionGate(seg('Thank you Lord for your mercy today')).ok).toBe(true);
    expect(repetitionGate(seg('Thank you. Thank you.')).ok).toBe(true);
    expect(repetitionGate(seg('Amen, amen')).ok).toBe(true);
  });

  it('rejects a thrice-repeated filler phrase (the hallucination tell)', () => {
    const out = repetitionGate(seg('Thank you. Thank you. Thank you.'));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(GATE_REASONS.REPEATED_PHRASE);
    expect(repetitionGate(seg('Thank you thank you thank you')).ok).toBe(false);
    // four words repeated three times — still caught
    expect(repetitionGate(seg('the Lord is good the Lord is good the Lord is good')).ok).toBe(
      false
    );
  });

  it('ignores long repeated passages (only short fillers repeat)', () => {
    const long =
      'the Lord is my shepherd I shall not want he makes me lie down in green pastures ' +
      'the Lord is my shepherd I shall not want he makes me lie down in green pastures ' +
      'the Lord is my shepherd I shall not want he makes me lie down in green pastures';
    expect(repetitionGate(seg(long)).ok).toBe(true);
  });

  it('only scans the tail of longer transcripts', () => {
    // Old repetition far back, fresh speech since -> the gate stays open.
    const head = Array(3).fill('thank you').join(' ');
    const recent = 'and then the offering was collected by the ushers today';
    expect(repetitionGate(seg(`${head} ${recent}`)).ok).toBe(true);

    // A triple repeat inside the tail -> still caught.
    const filler = Array(10).fill('hmm').join(' ');
    const tail = Array(3).fill('thank you').join(' ');
    expect(repetitionGate(seg(`${filler} ${tail}`)).ok).toBe(false);
  });

  it('passes silently on segments without text', () => {
    expect(repetitionGate({}).ok).toBe(true);
    expect(repetitionGate(null).ok).toBe(true);
  });
});

describe('gateSegment: plan order, first failure wins', () => {
  it('passes a clean segment with an empty reason', () => {
    const out = gateSegment(seg('Amazing grace how sweet the sound'));
    expect(out.ok).toBe(true);
    expect(out.reason).toBe('');
  });

  it('rejects the hallucinated scripture read at high no_speech_prob', () => {
    const out = gateSegment(seg('John 3:16', { noSpeechProb: 0.93 }));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(GATE_REASONS.MODEL_FLAGGED_NO_SPEECH);
  });

  it('reports energy and repetition failures with their own reasons', () => {
    expect(gateSegment(seg('hmm', { peak: 0.001 })).reason).toBe(
      GATE_REASONS.BELOW_NOISE_FLOOR
    );
    expect(
      gateSegment(seg('Thank you. Thank you. Thank you.', { peak: 0.4 })).reason
    ).toBe(GATE_REASONS.REPEATED_PHRASE);
  });

  it('runs energy before no_speech before repetition', () => {
    // All three killers present -> the earliest gate in plan order reports.
    const out = gateSegment(
      seg('Thank you. Thank you. Thank you.', { peak: 0.001, noSpeechProb: 0.99 })
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(GATE_REASONS.BELOW_NOISE_FLOOR);

    const noSpeech = gateSegment(
      seg('Thank you. Thank you. Thank you.', { peak: 0.4, noSpeechProb: 0.99 })
    );
    expect(noSpeech.reason).toBe(GATE_REASONS.MODEL_FLAGGED_NO_SPEECH);
  });
});

describe('gate 4: segmentWeightedConfidence — never a 98% match on noise', () => {
  it('multiplies: 0.98 × 0.5 = 0.49, which is below the shared floor', () => {
    const value = segmentWeightedConfidence(0.98, { confidence: 0.5 });
    expect(value).toBeCloseTo(0.49, 5);
    expect(value).not.toBe(0.98);
    expect(value).toBeLessThan(THRESHOLDS.suggestion);
    // the same multiplication via no_speech_prob
    expect(segmentWeightedConfidence(0.98, { noSpeechProb: 0.5 })).toBeCloseTo(0.49, 5);
  });

  it('clamps to [0,1]', () => {
    expect(segmentWeightedConfidence(5, { confidence: 2 })).toBe(1);
    expect(segmentWeightedConfidence(-1, { confidence: 1 })).toBe(0);
  });

  it('a clean segment passes the match through untouched', () => {
    expect(segmentWeightedConfidence(0.95, { noSpeechProb: 0.05 })).toBeCloseTo(
      0.95 * 0.95,
      5
    );
    expect(segmentWeightedConfidence(0.95, {})).toBeCloseTo(0.95, 5);
  });

  it('the weight itself is the shared segmentWeight helper', () => {
    expect(segmentWeight({ confidence: 0.3 })).toBeCloseTo(0.3, 5);
    expect(segmentWeightedConfidence(1, { confidence: 0.3 })).toBeCloseTo(0.3, 5);
  });
});
