// src/speech/capabilities.js — capability gating (plan 8.2, decision D11)
//
// "A provider reporting `wordTimestamps === false` disables the next-lyric
//  lane, with the reason stated. A provider reporting `biasSupport === false`
//  surfaces the degradation. Neither fails silently."
//  — plan line 1268: "This is the test that makes D11 honest rather than
//    aspirational."
//
// D11: "a provider that fails to report its capabilities gets the
// conservative default behaviour, which is the right direction for that
// failure." So an unknown capability (null/absent) behaves like a missing
// one — off, with a sentence — never like a promise.
//
// Pure: takes the provider object (the catalog entries in
// shared/speech/models.catalog.json have exactly these fields), returns
// display-ready lane states. No store, no engine, no I/O.

/** The three suggestion lanes, in rail order. */
export const LANE_IDS = Object.freeze(['lyric', 'verse', 'note']);

const REASONS = Object.freeze({
  noProvider:
    'No provider capabilities reported — every suggestion lane stays off until an engine connects.',
  wordTimestampsFalse:
    "This provider can't align words to audio, so next-lyric suggestions are disabled.",
  wordTimestampsUnknown:
    'Word timestamps have not been reported yet — the next-lyric lane stays disabled until the engine reports them.',
  biasFalse:
    'Sermon profile biasing (hymn titles, proper nouns) is unavailable with this provider, so accuracy will be lower on church audio.',
  biasUnknown:
    'Bias support has not been reported yet — sermon profile biasing is treated as unavailable until the engine reports it.',
});

const state = (id, enabled, reasons, degraded = false) => ({
  id,
  enabled,
  degraded,
  reason: reasons.filter(Boolean).join(' '),
});

/**
 * Decide, per lane, whether it runs — and say why in plain words whenever
 * it does not run exactly as designed.
 *
 * @param {{ wordTimestamps?: boolean|null, biasSupport?: boolean|null }|null} provider
 * @returns {Array<{ id: 'lyric'|'verse'|'note', enabled: boolean,
 *                   degraded: boolean, reason: string }>}
 *
 * - `wordTimestamps !== true` → the lyric lane is DISABLED with a stated
 *   reason (false: the provider said no; null/absent: the provider has not
 *   said yes — conservative default).
 * - `biasSupport !== true` → the lanes where hymn titles and book names
 *   decide correctness (`lyric`, `verse`) are marked `degraded: true` with
 *   a stated reason. The note lane stays enabled and undegraded: it is an
 *   editable draft, so the operator sees and fixes any miss directly.
 * - `provider` missing entirely → all three lanes off, reason stated.
 *   Nothing is ever silently off: every disabled or degraded entry carries
 *   a non-empty `reason`.
 */
export function lanesForCapabilities(provider) {
  if (!provider || typeof provider !== 'object') {
    return LANE_IDS.map((id) => state(id, false, [REASONS.noProvider]));
  }

  const { wordTimestamps, biasSupport } = provider;

  const lyricReasons = [];
  if (wordTimestamps === false) lyricReasons.push(REASONS.wordTimestampsFalse);
  else if (wordTimestamps !== true) lyricReasons.push(REASONS.wordTimestampsUnknown);

  const lyricEnabled = wordTimestamps === true;

  const biasReason =
    biasSupport === false ? REASONS.biasFalse : biasSupport !== true ? REASONS.biasUnknown : '';

  const lyric = state('lyric', lyricEnabled, [...lyricReasons, biasReason], lyricEnabled && Boolean(biasReason));
  const verse = state('verse', true, [biasReason], Boolean(biasReason));
  const note = state('note', true, []);

  return [lyric, verse, note];
}

/** Convenience: find one lane by id in a lanesForCapabilities() result. */
export function findLane(lanes, id) {
  return (Array.isArray(lanes) ? lanes : []).find((lane) => lane.id === id) ?? null;
}

export default lanesForCapabilities;
