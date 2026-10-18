// src/speech/hallucination.js — the four hallucination gates (plan 11)
//
// "Hallucination is a correctness problem here, not a performance one.
//  A hallucinated 'John 3:16' does not arrive as noise. It arrives as a
//  clean, correctly-formatted, high-confidence Bible verse suggestion, one
//  tap from the sanctuary screens. That is the single worst failure this
//  feature can produce."
//
// Four gates, all pure functions:
//   1. energyGate      — before inference: peak/RMS below the noise floor
//                        never reaches the model at all.
//   2. noSpeechGate    — the model's own no_speech_prob; above the
//                        threshold the segment is discarded outright.
//   3. repetitionGate  — the "Thank you. Thank you. Thank you." signature
//                        that the energy gate cannot see (fan, chair).
//   4. the confidence gate — lives in confidence.js: segment confidence is
//                        multiplied into every match before the card.
//
// No I/O, no logging, no transcript text leaves this module in any form
// other than being returned to its caller.

import THRESHOLDS from './thresholds.js';
import { segmentWeight, clamp01 } from './confidence.js';

/** Machine-readable reasons a segment can be discarded. */
export const GATE_REASONS = Object.freeze({
  BELOW_NOISE_FLOOR: 'below-noise-floor',
  MODEL_FLAGGED_NO_SPEECH: 'model-flagged-no-speech',
  REPEATED_PHRASE: 'repeated-phrase',
});

const pass = () => ({ ok: true, reason: '' });
const fail = (reason) => ({ ok: false, reason });

/**
 * Gate 1 — energy gate before inference.
 *
 * @param {{ peak?: number, rms?: number }} energy normalized float
 *        amplitudes (0..1), the shape Float32 PCM capture produces.
 * @returns {{ ok: boolean, reason: string }}
 *
 * Never submit a segment whose peak OR RMS is below the noise floor.
 * When neither statistic is present the gate has nothing to act on and
 * lets the segment through — the capture side owns attaching these, and
 * the remaining gates still run. A value that IS present but below its
 * floor discards the segment, even if the other statistic is loud.
 */
export function energyGate(energy) {
  const peak = energy && Number.isFinite(Number(energy.peak)) ? Number(energy.peak) : null;
  const rms = energy && Number.isFinite(Number(energy.rms)) ? Number(energy.rms) : null;

  if (peak === null && rms === null) return pass();
  if (peak !== null && peak < THRESHOLDS.noiseFloor.peak) return fail(GATE_REASONS.BELOW_NOISE_FLOOR);
  if (rms !== null && rms < THRESHOLDS.noiseFloor.rms) return fail(GATE_REASONS.BELOW_NOISE_FLOOR);
  return pass();
}

/**
 * Gate 2 — reject on the model's own no_speech_prob.
 *
 * At or above THRESHOLDS.noSpeechProb the segment is discarded and no
 * suggestion is ever generated from it. This is the gate that stops a
 * fabricated reference from reaching the card.
 *
 * A segment that does not report no_speech_prob passes: silence is
 * proven by the value, not by its absence (the protocol's `final` message
 * does not carry the field today).
 */
export function noSpeechGate(segment) {
  const prob = segment && Number.isFinite(Number(segment.noSpeechProb))
    ? Number(segment.noSpeechProb)
    : null;
  if (prob === null) return pass();
  if (prob >= THRESHOLDS.noSpeechProb) return fail(GATE_REASONS.MODEL_FLAGGED_NO_SPEECH);
  return pass();
}

/**
 * Gate 3 — repetition detector.
 *
 * A segment whose tail repeats one identical short phrase is discarded:
 * the whisper-over-silence signature ("Thank you. Thank you. Thank you.")
 * and the fan/chair noises the energy gate misses. Three repeats of a
 * phrase up to four words, over the last THRESHOLDS.repetition.tailWords
 * words. Two repeats ("Amen, amen") are real worship speech and pass.
 *
 * @param {{ text?: string }} segment
 */
export function repetitionGate(segment) {
  const text = segment && typeof segment.text === 'string' ? segment.text : '';
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(-THRESHOLDS.repetition.tailWords);

  const { minRepeats, maxPhraseWords } = THRESHOLDS.repetition;
  for (let phraseWords = 1; phraseWords <= maxPhraseWords; phraseWords += 1) {
    const needed = phraseWords * minRepeats;
    if (needed > words.length) break;
    const tail = words.slice(-needed);
    const phrase = tail.slice(0, phraseWords);
    let repeated = true;
    for (let i = 0; i < tail.length; i += 1) {
      if (tail[i] !== phrase[i % phraseWords]) {
        repeated = false;
        break;
      }
    }
    if (repeated) return fail(GATE_REASONS.REPEATED_PHRASE);
  }
  return pass();
}

/**
 * Run all three segment gates in plan order (energy → model probability →
 * repetition) and return the FIRST failure. `{ ok: true, reason: '' }`
 * means the segment may be transcribed and considered for suggestions.
 */
export function gateSegment(segment) {
  const energy = energyGate(segment);
  if (!energy.ok) return energy;
  const noSpeech = noSpeechGate(segment);
  if (!noSpeech.ok) return noSpeech;
  return repetitionGate(segment);
}

/**
 * The segment's weight for gate 4 — re-exported from confidence.js so the
 * rail imports the whole hallucination surface from one place.
 * 1 − no_speech_prob when reported, engine `confidence` otherwise, 1 when
 * the segment reports nothing.
 */
export { segmentWeight };

/**
 * Gate 4, expressed as a helper: the final, segment-weighted confidence
 * for a match made on this segment. A perfect 0.98 match on a segment the
 * model half-believed was noise arrives here as 0.98 × segment weight —
 * never as a 98% match.
 */
export function segmentWeightedConfidence(matchConfidence, segment) {
  return clamp01(clamp01(matchConfidence) * segmentWeight(segment));
}
