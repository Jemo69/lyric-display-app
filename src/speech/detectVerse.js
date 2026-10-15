// src/speech/detectVerse.js — Bible verse detection (plan 11, lane 2)
//
// "Three detectors, tried in strict order, because the first is far more
//  precise than the second and the second far more precise than the third."
//  Nothing, when none of them fire.
//
//   1. Spoken-form normalisation  — number words and ordinals become
//      digits, "the book of" is stripped, then REFERENCE_REGEX
//      (shared/bible/index.js:148) resolves a canonical book name.
//   2. Phonetic / confusion matching — shared/bible/bookAliases.js maps
//      the heard book name onto the right one, then the same reference
//      parse runs. The table is data; this file only applies it.
//   3. Full-text fuzzy match — scored verse candidates produced off-thread
//      by src/workers/verseSearch.worker.js (caller passes them in).
//
// The functions take data and never fetch it: the caller passes the
// transcript and, when detector 3 is needed, the worker's results.
//
// Confidence is segment-weighted before anything is returned (hallucination
// gate 4): a perfect match on a segment the model flagged as noise is not a
// 98% match, and below THRESHOLDS.suggestion it is not a match at all.

import THRESHOLDS from './thresholds.js';
import { combine } from './confidence.js';
import { normalizeSpokenReference, parseReference } from './spokenForm.js';
import { CANONICAL_BOOK_NAMES, resolveBookAlias } from 'shared/bible/bookAliases.js';
import { gateSegment, segmentWeight } from './hallucination.js';
import { textOverlapScore } from './verseCorpus.js';

/** Canonical book lookup (case-insensitive, exact). */
function isCanonicalBook(bookPart) {
  if (typeof bookPart !== 'string') return false;
  const key = bookPart.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  if (!key) return false;
  return CANONICAL_BOOK_NAMES.some((name) => name.toLowerCase() === key);
}

function canonicalBookName(bookPart) {
  const key = String(bookPart).trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  return CANONICAL_BOOK_NAMES.find((name) => name.toLowerCase() === key) ?? null;
}

/**
 * Format ambiguous candidates for a card: ["1 Corinthians", "2 Corinthians"]
 * -> "1 or 2 Corinthians". Falls back to joining whole names when the
 * candidates do not share a trailing book name.
 */
function ambiguousChoice(candidates) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];

  const heads = [];
  const tails = [];
  for (const candidate of list) {
    const match = String(candidate).match(/^\s*(\d+)\s+(.+)$/);
    if (!match) return list.join(' or ');
    heads.push(match[1]);
    tails.push(match[2]);
  }
  if (!tails.every((tail) => tail.toLowerCase() === tails[0].toLowerCase())) {
    return list.join(' or ');
  }
  return `${heads.join(' or ')} ${tails[0]}`;
}

function buildVerse(resolvedBook, parsed) {
  const reference =
    `${resolvedBook} ${parsed.chapter}:${parsed.verse}` +
    `${parsed.endVerse ? `-${parsed.endVerse}` : ''}`;
  return {
    book: resolvedBook,
    chapter: parsed.chapter,
    verse: parsed.verse,
    endVerse: parsed.endVerse,
    reference,
    text: null,
  };
}

/**
 * Detector 1 — spoken-form normalisation + canonical book resolution.
 * Returns a verse object or null. Runs REFERENCE_REGEX over the
 * normalised text at every word start, resolving the book against the
 * canonical canon; an unresolvable book means this detector did not fire.
 */
export function detectSpokenReference(text) {
  const normalized = normalizeSpokenReference(text);
  const parsed = parseReference(normalized, isCanonicalBook);
  if (!parsed) return null;
  const book = canonicalBookName(parsed.bookPart);
  if (!book) return null;
  return buildVerse(book, parsed);
}

/**
 * Detector 2 — phonetic / confusion matching (the static table in
 * shared/bible/bookAliases.js). Same reference parse as detector 1, but
 * the book name is resolved through the confusion table. An ambiguous row
 * ("Corinthian" → 1 or 2 Corinthians) returns BOTH candidates with
 * `ambiguous: true` so the card can show the choice — the surrounding
 * chapter and verse is what the plan says disambiguates it.
 */
export function detectAliasReference(text) {
  const normalized = normalizeSpokenReference(text);
  const parsed = parseReference(normalized, (bookPart) => resolveBookAlias(bookPart) !== null);
  if (!parsed) return null;

  const alias = resolveBookAlias(parsed.bookPart);
  if (!alias || !alias.book) return null;

  const verse = buildVerse(alias.book, parsed);
  if (alias.ambiguous) {
    // "1 Corinthians"/"2 Corinthians" -> "1 or 2 Corinthians 5:16": the book
    // name is common to every candidate, so say it once.
    const suffix = `${parsed.chapter}:${parsed.verse}`
      + `${parsed.endVerse ? `-${parsed.endVerse}` : ''}`;
    verse.reference = `${ambiguousChoice(alias.candidates)} ${suffix}`;
    verse.book = alias.candidates[0];
  }
  return {
    verse,
    ambiguous: Boolean(alias.ambiguous),
    candidates: alias.candidates,
    why: alias.why,
  };
}

/**
 * Detector 3 — full-text fuzzy match over pre-scored verse candidates
 * (produced off-thread by src/workers/verseSearch.worker.js). Picks the
 * best-scoring candidate; results without a `score` are scored here with
 * the same containment function the worker uses.
 */
export function detectFuzzyReference(text, searchResults) {
  if (!Array.isArray(searchResults) || searchResults.length === 0) return null;

  let best = null;
  for (const result of searchResults) {
    if (!result || typeof result.reference !== 'string') continue;
    const score = Number.isFinite(Number(result.score))
      ? Number(result.score)
      : typeof result.text === 'string'
        ? textOverlapScore(text, result.text)
        : NaN;
    if (!Number.isFinite(score)) continue;
    if (!best || score > best.score) best = { result, score };
  }
  if (!best) return null;

  const { result, score } = best;
  return {
    score,
    verse: {
      book: result.bookName ?? null,
      chapter: Number(result.chapter),
      verse: Number(result.verse),
      endVerse: Number.isFinite(Number(result.endVerse)) ? Number(result.endVerse) : null,
      reference: result.reference,
      text: typeof result.text === 'string' ? result.text : null,
    },
  };
}

function suggestion(verse, detector, matchConfidence, segmentConfidence, extra = {}) {
  const confidence = combine(matchConfidence, segmentConfidence);
  if (confidence < THRESHOLDS.suggestion) return null; // confidence-gated suppression
  return {
    verse,
    detector,
    confidence,
    matchConfidence,
    ...extra,
  };
}

/**
 * Detect a Bible verse reference in a transcript — strict detector order.
 *
 * @param {string} text  the transcript tail (never logged, never stored)
 * @param {object} [options]
 * @param {Array}  [options.searchResults] scored candidates from
 *                verseSearch.worker.js — required for detector 3
 * @param {number} [options.segmentConfidence=1] the segment's own weight;
 *                multiply BEFORE the shared threshold (hallucination gate 4)
 * @returns {{ verse, detector: 'spoken'|'alias'|'fuzzy', confidence,
 *             matchConfidence, ... }|null}  null when nothing fires
 *
 * Detector order is asserted by tests: if detector 1 resolves, 2 and 3 are
 * never consulted. The rail runs this without `searchResults` first and
 * only spins up the verse-search worker when it returns null — a reference
 * said out loud must never wait on a 30,000-verse scan.
 */
export function detectVerse(text, options = {}) {
  const { searchResults = [], segmentConfidence = 1 } = options;
  if (typeof text !== 'string' || text.trim().length === 0) return null;

  // 1 — spoken-form normalisation (most precise)
  const spoken = detectSpokenReference(text);
  if (spoken) {
    return suggestion(spoken, 'spoken', THRESHOLDS.detectors.spoken, segmentConfidence);
  }

  // 2 — phonetic / confusion table
  const alias = detectAliasReference(text);
  if (alias) {
    const base = alias.ambiguous
      ? THRESHOLDS.detectors.aliasAmbiguous
      : THRESHOLDS.detectors.alias;
    return suggestion(
      alias.verse,
      'alias',
      base,
      segmentConfidence,
      { ambiguous: alias.ambiguous, candidates: alias.candidates, why: alias.why }
    );
  }

  // 3 — full-text fuzzy match against the active translation (least precise)
  const fuzzy = detectFuzzyReference(text, searchResults);
  if (fuzzy) {
    return suggestion(fuzzy.verse, 'fuzzy', fuzzy.score, segmentConfidence);
  }

  return null;
}

/**
 * The rail's entry point for one transcript segment: run the hallucination
 * gates FIRST, then detect. A segment the gates discard produces no
 * suggestion at all — this is the shape of the plan's worst-case test:
 *
 *   a hallucinated "John 3:16" built on a segment with no_speech_prob
 *   above threshold produces NO suggestion.
 *
 * @param {{ text?: string, noSpeechProb?: number, peak?: number,
 *           rms?: number }} segment
 * @param {object} [options] passed through to detectVerse (searchResults…)
 * @returns {object|null}
 */
export function detectVerseFromSegment(segment, options = {}) {
  const gate = gateSegment(segment);
  if (!gate.ok) return null;
  return detectVerse(typeof segment?.text === 'string' ? segment.text : '', {
    ...options,
    segmentConfidence: segmentWeight(segment),
  });
}

export default detectVerse;
