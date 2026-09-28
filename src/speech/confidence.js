// src/speech/confidence.js — segment-weighted confidence
//
// Plan section 11, hallucination gates, fourth gate:
//   "The confidence gate applies to the segment, not just the match.
//    A perfect verse match built on a segment the model itself flagged as
//    noise is not a 98% match. Confidence is multiplied by segment
//    confidence before it reaches the card."
//
// This module is that multiplication — the single place where a match
// confidence and a segment confidence become the final confidence that is
// compared against THRESHOLDS.suggestion.

import THRESHOLDS from './thresholds.js';

/** Clamp a numeric value into [0, 1]. */
export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * The segment's own confidence in [0, 1].
 *
 * Preferred source is the model's `no_speech_prob` (1 − prob): a segment
 * the model half-believed was silence deserves less trust even when it
 * clears the gate. Falls back to an engine-reported `confidence` when
 * `no_speech_prob` is absent (the protocol's `final` message does not carry
 * either field today), and to 1 only when the segment reports nothing at
 * all — absence of data is not evidence of noise, and the explicit gates
 * in hallucination.js still run before any suggestion is generated.
 */
export function segmentWeight(segment) {
  if (!segment || typeof segment !== 'object') return 1;
  const prob = Number(segment.noSpeechProb);
  if (Number.isFinite(prob)) return clamp01(1 - prob);
  const conf = Number(segment.confidence);
  if (Number.isFinite(conf)) return clamp01(conf);
  return 1;
}

/**
 * Final confidence = match confidence × segment confidence, clamped to
 * [0, 1]. A 0.98 match on a segment weighted 0.5 reaches the card as 0.49 —
 * below THRESHOLDS.suggestion, so it does not reach the card at all.
 *
 * @param {number} matchConfidence  detector confidence before weighting
 * @param {number} [segmentConfidence=1]  segment weight (see segmentWeight)
 * @returns {number} final confidence in [0, 1]
 */
export function combine(matchConfidence, segmentConfidence = 1) {
  const match = clamp01(matchConfidence);
  const segment = segmentConfidence === undefined || segmentConfidence === null
    ? 1
    : clamp01(segmentConfidence);
  return match * segment;
}

/**
 * Does this final confidence clear the shared floor every lane is held to?
 * @param {number} confidence final, segment-weighted confidence
 */
export function clearsSuggestionFloor(confidence) {
  return combine(confidence, 1) >= THRESHOLDS.suggestion;
}

export default combine;
