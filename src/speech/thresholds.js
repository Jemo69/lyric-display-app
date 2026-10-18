// src/speech/thresholds.js — the one place a reviewer sees every number
//
// Plan section 11: "Ranking functions as pure modules with a shared
// confidence threshold." Every lane (next lyric, Bible verse, sermon note)
// and every hallucination gate reads from this single object. Changing a
// threshold is a one-line diff here, never a magic number scattered across
// detectors.
//
// All confidences are 0..1. `suggestion` is the shared floor: a lane's
// FINAL confidence — match confidence already multiplied by segment
// confidence — must reach it before any card may be rendered. Silence is
// always an acceptable outcome on a sanctuary screen; a wrong suggestion
// never is.

export const THRESHOLDS = Object.freeze({
  /**
   * The shared confidence floor for all three lanes. Applied to the final,
   * segment-weighted confidence — never to the raw match alone.
   */
  suggestion: 0.6,

  /**
   * Fuse.js threshold for the next-lyric lane (0 = exact match only,
   * 1 = match anything). Fuse drops results whose score exceeds this, so a
   * lyric match's confidence (1 - score) is at least (1 - lyricFuse) before
   * segment weighting. Kept exactly aligned with `suggestion` so the lane is
   * not double-tightened at segment confidence 1.0.
   */
  lyricFuse: 0.4,

  /**
   * Per-detector base confidences (before segment weighting). The plan
   * orders the detectors by precision — "the first is far more precise than
   * the second and the second far more precise than the third" — and these
   * numbers are that ordering expressed numerically.
   *
   *   spoken  0.95 — a fully-formed reference with a canonical book name.
   *   alias   0.85 — resolved through the confusion table (the heard form
   *                  was itself ambiguous, so slightly below spoken).
   *   ambiguous-alias 0.70 — the book NUMBER is a guess (e.g. "Corinthian"
   *                  → 1 or 2 Corinthians); the surrounding reference is
   *                  meant to disambiguate, so the card carries candidates.
   *   fuzzy    raw overlap score — detector 3 reports the match score
   *                  itself (0..1), gated by `suggestion` like everything
   *                  else. There is no fixed base to fake precision with.
   */
  detectors: Object.freeze({
    spoken: 0.95,
    alias: 0.85,
    aliasAmbiguous: 0.7,
  }),

  /**
   * Energy gate (runs BEFORE inference; plan section 11). Amplitudes are
   * normalized floats (0..1), the shape Float32 PCM capture produces.
   * Room tone and a distant fan sit well below both floors; even a quiet
   * lapel mic on a spoken syllable sits above them.
   */
  noiseFloor: Object.freeze({
    peak: 0.02, // ≈ −34 dBFS: anything quieter than this is not a voice
    rms: 0.005, // ≈ −46 dBFS: sustained energy floor for speech
  }),

  /**
   * The model's own no_speech_prob. At or above this, the segment is
   * discarded outright and NO suggestion is ever generated from it — this
   * is the gate that stops a hallucinated "John 3:16" from reaching the
   * card. 0.6 mirrors the cutoff whisper's own VAD logic uses: real
   * speech typically reports well under 0.4, room tone reports over 0.8.
   */
  noSpeechProb: 0.6,

  /**
   * Repetition detector. A tail that repeats one identical short phrase
   * this many times is discarded — the "Thank you. Thank you. Thank you."
   * hallucination signature. Three repeats of a phrase up to four words,
   * searched over the last `tailWords` words of the segment. Two repeats
   * ("Amen, amen") are real worship speech and pass.
   */
  repetition: Object.freeze({
    minRepeats: 3,
    maxPhraseWords: 4,
    tailWords: 12,
  }),

  /**
   * Next-lyric lane (plan 11, lane 1): "the last 8–12 words of the
   * transcript tail". maxWords is the window; minWords documents the
   * intended minimum context — a shorter tail still searches (a fragment
   * is better than silence), it is just never padded or invented.
   */
  lyricTail: Object.freeze({
    minWords: 8,
    maxWords: 12,
    topK: 3,
  }),

  /**
   * Worker-based full-text verse search (detector 3). minScore reuses the
   * shared floor: a candidate that could never clear `suggestion` even at
   * segment confidence 1.0 is not worth posting across the worker
   * boundary. minMatches guards short tails — one shared word ("Lord")
   * must not score as a perfect match against 30,000 verses.
   */
  verseSearch: Object.freeze({
    maxResults: 5,
    minScore: 0.6, // == suggestion; kept literal so the file reads standalone
    minMatches: 3,
  }),
});

export default THRESHOLDS;
