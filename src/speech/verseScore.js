/**
 * src/speech/verseScore.js — scoring for detector 3 (Phase 1).
 *
 * Ported from FreeShow's `BibleSearchDetector.evaluateContentMatch()`, with
 * three deliberate changes, all recorded in the plan:
 *
 *   1. THIS FILE HAS NO 1-100 SCALE. Everything here is 0-1. FreeShow's
 *      confidence mixed match quality with ambiguity and a hard
 *      `max(score, 85)` floor, then set auto-play thresholds at 75 and 50
 *      against it. This codebase multiplies match quality by segment weight
 *      and gates at 0.6. A number that means two things cannot be half of a
 *      product. So: no `baseConfidence`, no floor, no `getConfidenceScore`.
 *      A test asserts those literals never appear.
 *
 *   2. THE RUNNER-UP IS RETURNED, NOT DISCARDED. FreeShow computes a second
 *      candidate to apply an ambiguity penalty and then throws it away. The
 *      operator never learns the detector was undecided. On a sanctuary
 *      screen, "also considered John 3:17" is worth more than the penalty.
 *
 *   3. NO POSITIONAL WINDOW SWEEP. FreeShow tries 20/60/80/120-word tails and
 *      bails on the first confident one. Here the whole tail is scored once.
 *      The sweep existed to keep the renderer responsive; in a worker it is
 *      four times the work for no benefit, and it made the result depend on
 *      which tail size happened to clear the bar first.
 *
 * WHAT EACH TERM IS FOR, since the constants look arbitrary until you know:
 *
 *   IDF weighting      "I read the plans" must beat a paragraph sharing four
 *                      common words. Rare words are the signal.
 *
 *   positional decay   The preacher is reading NOW. A word 40 tokens back is
 *                      weaker evidence than the last thing he said.
 *
 *   phrase bonus       Three matching words sitting NEXT TO EACH OTHER in the
 *                      verse are how a human reads aloud. Three scattered
 *                      ones are coincidence. This is the single highest
 *                      value-per-line term in the whole port.
 *
 *   verse coverage     Three common words can cover a short verse entirely.
 *                      Requiring the match to be worth what it covers stops
 *                      "the LORD is my shepherd" scoring perfectly against
 *                      every other psalm verse.
 *
 *   upcoming prior     Preachers read forward. The next three verses are
 *                      strong candidates; verse 400 of the same chapter is not.
 *
 *   ambiguity          When the runner-up is within 75% of the winner AND they
 *                      are different passages, the match is genuinely unclear
 *                      and gets scaled down rather than presented as certain.
 *
 * PURE. No store, no I/O, no clock. The index and the tail are parameters.
 */

import THRESHOLDS from './thresholds.js';
import { tokenizeVerseText } from './verseIndex.js';

/**
 * Parse "Matthew 7:1-2" into its parts.
 *
 * @param {string} reference
 * @returns {{book:string, chapter:number, verse:number}|null}
 */
export function parseVerseReference(reference) {
  if (!reference) return null;
  const match = String(reference).match(/^((?:[1-3]\s+)?[\p{L}\s]+?)\s+(\d+):(\d+)(?:-(\d+))?$/u);
  if (!match) return null;
  return {
    book: match[1].trim(),
    chapter: Number(match[2]),
    // A range's END verse is what makes the next read predictable, so that is
    // what "where is he now" means for a range.
    verse: match[4] ? Number(match[4]) : Number(match[3]),
  };
}

/**
 * The next few verses after a reference, as a Map of verseId -> distance.
 *
 * Walks across the chapter boundary too, because "and the next verse" at the
 * end of a chapter is the first verse of the next one.
 *
 * WHY THIS LOOKS UP INSTEAD OF ADDING. The obvious implementation is
 * `chapterData.startVerseId + (nextVerse - 1)`, and that is what FreeShow does.
 * It quietly assumes every chapter's verse numbers run contiguously from 1, so
 * that a verse id is a linear offset from the chapter start. Real translations
 * mostly honour that, and some do not — and when one does not, the arithmetic
 * silently points at the WRONG VERSE rather than failing. That is not a crash
 * you notice in development; it is a wrong verse on a screen during a service.
 *
 * So this resolves every candidate through `verseToIdMap`, which is keyed on
 * the actual reference string. Same cost, no assumption, and it is correct for
 * any numbering a translation happens to use.
 *
 * @param {import('./verseIndex.js').VerseIndex} index
 * @param {string|null} currentReference
 * @param {number} [maxLookahead]
 * @returns {Map<number, number>}
 */
export function upcomingVerseMap(index, currentReference, maxLookahead = THRESHOLDS.verseIndex.lookahead) {
  const upcoming = new Map();
  const parsed = parseVerseReference(currentReference || '');
  if (!parsed) return upcoming;

  let { book, chapter, verse } = parsed;

  const idFor = (b, c, v) => {
    const id = index.verseToIdMap.get(`${b} ${c}:${v}`);
    return id === undefined ? null : id;
  };

  for (let distance = 1; distance <= maxLookahead; distance += 1) {
    const nextVerse = verse + 1;
    const sameChapterId = idFor(book.toLowerCase(), chapter, nextVerse);

    if (sameChapterId !== null) {
      upcoming.set(sameChapterId, distance);
      verse = nextVerse;
      continue;
    }

    // Chapter exhausted. Cross the boundary, but only if the chapter we are
    // leaving actually continues — otherwise a gap would read as "skip ahead",
    // which is exactly the wrong behaviour for a preacher who paused.
    const currentChapterData = index.referenceIndex.get(`${book.toLowerCase()} ${chapter}`);
    if (currentChapterData && nextVerse <= currentChapterData.verseCount) {
      // Numbering gap inside the chapter. Give up rather than guess.
      break;
    }

    const nextChapter = index.referenceIndex.get(`${book.toLowerCase()} ${chapter + 1}`);
    if (!nextChapter || nextChapter.verseCount < 1) break;

    const firstVerseId = idFor(book.toLowerCase(), chapter + 1, 1);
    if (firstVerseId === null) break;

    upcoming.set(firstVerseId, distance);
    chapter += 1;
    verse = 1;
  }

  return upcoming;
}

/**
 * How much of the verse's IDF weight the query accounts for.
 *
 * @param {import('./verseIndex.js').VerseIndex} index
 * @param {number} verseId
 * @param {Set<number>} queryWordIds
 * @returns {number} 0..1
 */
function verseCoverage(index, verseId, queryWordIds) {
  let total = 0;
  let covered = 0;

  for (let i = index.verseTokensOffsets[verseId]; i < index.verseTokensOffsets[verseId + 1]; i += 1) {
    const wordId = index.verseTokens[i];
    const idf = index.wordIdf[wordId];
    if (idf <= THRESHOLDS.verseIndex.tokenIdfFloor) continue;
    total += idf;
    if (queryWordIds.has(wordId)) covered += idf;
  }

  return total > 0 ? covered / total : 0;
}

/**
 * Reward contiguous matches, punish scattered ones.
 *
 * The longest contiguous run of query tokens appearing in order inside the
 * verse:
 *   whole query contiguous  -> full phrase, strong signal  (1.6x)
 *   3+ words contiguous    -> partial phrase               (1.2-1.5x)
 *   any matching bigram    -> weak evidence                (1.0-1.4x)
 *   3-5 query words, zero  -> coincidence, not a match    (0.65x)
 *   anything else          -> neutral                      (1.0)
 *
 * @param {import('./verseIndex.js').VerseIndex} index
 * @param {number} verseId
 * @param {number[]} queryWordIds every query token id, in order
 * @returns {number}
 */
export function computePhraseBonus(index, verseId, queryWordIds) {
  if (queryWordIds.length < 2) return 1.0;

  const start = index.verseTokensOffsets[verseId];
  const end = index.verseTokensOffsets[verseId + 1];
  const verseLength = end - start;
  if (verseLength === 0) return 1.0;

  const queryLength = queryWordIds.length;
  let longestRun = 0;

  for (let i = start; i < end; i += 1) {
    for (let j = 0; j < queryLength; j += 1) {
      if (index.verseTokens[i] !== queryWordIds[j]) continue;
      let run = 1;
      while (
        i + run < end &&
        j + run < queryLength &&
        index.verseTokens[i + run] === queryWordIds[j + run]
      ) {
        run += 1;
      }
      if (run > longestRun) longestRun = run;
    }
  }

  if (longestRun === queryLength) return THRESHOLDS.verseIndex.phraseBonusExact;
  if (longestRun >= 3) {
    return THRESHOLDS.verseIndex.phraseBonusPartialMin
      + (longestRun / queryLength) * THRESHOLDS.verseIndex.phraseBonusPartialSpread;
  }

  let matchingBigrams = 0;
  const totalBigrams = queryLength - 1;
  for (let j = 0; j < totalBigrams; j += 1) {
    const w1 = queryWordIds[j];
    const w2 = queryWordIds[j + 1];
    for (let i = start; i < end - 1; i += 1) {
      if (index.verseTokens[i] === w1 && index.verseTokens[i + 1] === w2) {
        matchingBigrams += 1;
        break;
      }
    }
  }

  if (matchingBigrams > 0) {
    return 1.0 + (matchingBigrams / totalBigrams) * THRESHOLDS.verseIndex.bigramBonusWeight;
  }

  // A short query with no adjacency anywhere is noise, not a reading.
  if (queryLength >= 3 && queryLength <= 5) return THRESHOLDS.verseIndex.phraseBonusScattered;

  return 1.0;
}

/**
 * Score the whole index against a transcript tail.
 *
 * @param {import('./verseIndex.js').VerseIndex} index
 * @param {string} text the transcript tail
 * @param {object} [options]
 * @param {string|null} [options.currentReference] what is on screen now
 * @returns {{reference:string, bookName:string, chapter:number, verse:number,
 *            text:string, score:number, runnerUp:null}|null}
 *          `score` is MATCH QUALITY 0-1, never a trust level.
 */
export function scoreVerses(index, text, options = {}) {
  const { currentReference = null } = options;
  if (!index || typeof text !== 'string') return null;

  const queryTokens = tokenizeVerseText(text);
  // Below 3 tokens there is nothing to weigh against a posting list. A
  // two-word tail matching a short verse is noise, not a reading.
  if (queryTokens.length < THRESHOLDS.verseIndex.minQueryTokens) return null;

  const currentParsed = parseVerseReference(currentReference || '');
  const upcoming = upcomingVerseMap(index, currentReference);

  // --- candidate generation: only verses containing a high-IDF query word ---
  const weighted = [];
  const totalTokens = queryTokens.length;

  for (let i = 0; i < queryTokens.length; i += 1) {
    const wordId = index.vocabToIdMap.get(queryTokens[i]);
    if (wordId === undefined) continue;
    const idf = index.wordIdf[wordId];
    if (idf <= THRESHOLDS.verseIndex.tokenIdfFloor) continue;
    weighted.push({ wordId, weightedIdf: idf * THRESHOLDS.verseIndex.positionalDecay ** (totalTokens - 1 - i) });
  }

  if (weighted.length < THRESHOLDS.verseIndex.minCandidateWords) return null;

  const scores = new Map();
  const matchedIdf = new Map();
  const matchedCount = new Map();

  for (const item of weighted) {
    const from = index.wordPostingsOffsets[item.wordId];
    const to = index.wordPostingsOffsets[item.wordId + 1];
    for (let offset = from; offset < to; offset += 1) {
      const verseId = index.wordPostings[offset];
      scores.set(verseId, (scores.get(verseId) || 0) + item.weightedIdf);
      matchedIdf.set(verseId, (matchedIdf.get(verseId) || 0) + item.weightedIdf);
      matchedCount.set(verseId, (matchedCount.get(verseId) || 0) + 1);
    }
  }

  if (scores.size === 0) return null;

  // Denominator: what a perfect match of this tail against anything would be
  // worth. Without it the ratio is scale-free and a rare-word tail scores the
  // same as a common-word tail.
  const recentIdfSum = weighted.reduce((sum, item) => sum + item.weightedIdf, 0);
  if (recentIdfSum <= 0) return null;

  const queryWordIdSet = new Set(weighted.map((item) => item.wordId));
  const queryWordIds = queryTokens
    .map((token) => index.vocabToIdMap.get(token))
    .filter((id) => id !== undefined);
  const currentVerseId = currentReference
    ? index.verseToIdMap.get(String(currentReference).toLowerCase())
    : undefined;
  const isShortQuery = queryWordIdSet.size <= THRESHOLDS.verseIndex.shortQueryWords;

  const candidates = [];

  for (const [verseId, accumulatedIdf] of scores.entries()) {
    const count = matchedCount.get(verseId) || 0;
    const isCurrent = currentVerseId === verseId;
    const upcomingDistance = upcoming.get(verseId) ?? null;

    // A non-current, non-upcoming verse needs one more matching word to
    // qualify than the verse he is obviously reading. The prior is worth
    // exactly one word of evidence, not an exemption from it.
    const required = isCurrent
      ? THRESHOLDS.verseIndex.minMatchesCurrent
      : upcomingDistance !== null
        ? THRESHOLDS.verseIndex.minMatchesUpcoming
        : THRESHOLDS.verseIndex.minMatchesOther;
    if (count < required) continue;

    let ratio = Math.min(1, (matchedIdf.get(verseId) || 1) / recentIdfSum);
    ratio *= computePhraseBonus(index, verseId, queryWordIds);

    // A handful of common words can cover a long verse completely. Require the
    // match to be worth a real share of what the verse contains — but do not
    // penalize a short distinct phrase against a long verse, which is the
    // normal case when he reads a single verse aloud.
    if (!isShortQuery) {
      const target = Math.min(
        THRESHOLDS.verseIndex.coverageTargetMax,
        Math.max(THRESHOLDS.verseIndex.coverageTargetMin, queryWordIdSet.size * THRESHOLDS.verseIndex.coverageTargetPerWord)
      );
      ratio *= Math.min(1, verseCoverage(index, verseId, queryWordIdSet) / target);
    }

    if (isCurrent) {
      ratio *= THRESHOLDS.verseIndex.priorCurrent;
    } else if (upcomingDistance === 1) {
      ratio *= THRESHOLDS.verseIndex.priorUpcoming1;
    } else if (upcomingDistance === 2) {
      ratio *= THRESHOLDS.verseIndex.priorUpcoming2;
    } else if (upcomingDistance === 3) {
      ratio *= THRESHOLDS.verseIndex.priorUpcoming3;
    } else if (currentParsed) {
      const parsed = parseVerseReference(index.versePool[verseId]);
      if (parsed && parsed.book.toLowerCase() === currentParsed.book.toLowerCase()) {
        if (parsed.chapter === currentParsed.chapter) {
          ratio *= parsed.verse < currentParsed.verse
            ? THRESHOLDS.verseIndex.priorBehindSameChapter
            : THRESHOLDS.verseIndex.priorAheadSameChapter ** (parsed.verse - currentParsed.verse - 1);
        } else {
          ratio *= THRESHOLDS.verseIndex.priorOtherChapter;
        }
      } else {
        ratio *= THRESHOLDS.verseIndex.priorOtherBook;
      }
    }

    const threshold = isCurrent || upcomingDistance === 1
      ? THRESHOLDS.verseIndex.acceptCurrent
      : isShortQuery
        ? THRESHOLDS.verseIndex.acceptShortQuery
        : THRESHOLDS.verseIndex.acceptOther;

    if (ratio < threshold) continue;

    candidates.push({ verseId, reference: index.versePool[verseId], ratio, isCurrent, upcomingDistance });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.ratio - a.ratio);
  const top = candidates[0];

  // --- ambiguity: was there a real runner-up? ---
  //
  // Scaled, not rejected. Two verses in DIFFERENT chapters scoring within 75%
  // of each other means the detector genuinely could not tell — that is worth
  // showing at a reduced score AND telling the operator about, not hiding.
  let ambiguityPenalty = 1.0;
  let runnerUp = null;

  if (candidates.length > 1) {
    const second = candidates[1];
    const relative = second.ratio / (top.ratio || 1);
    if (relative >= THRESHOLDS.verseIndex.ambiguityRatio) {
      const topParsed = parseVerseReference(top.reference);
      const secondParsed = parseVerseReference(second.reference);
      if (topParsed && secondParsed
        && (topParsed.book.toLowerCase() !== secondParsed.book.toLowerCase()
          || topParsed.chapter !== secondParsed.chapter)) {
        ambiguityPenalty = 1 - (relative - THRESHOLDS.verseIndex.ambiguityRatio);
        runnerUp = {
          reference: second.reference,
          relative,
        };
      }
    }
  }

  const score = Math.min(1, Math.max(0, top.ratio * ambiguityPenalty));

  const parsed = parseVerseReference(top.reference);
  if (!parsed) return null;

  // The verse text is carried through so the card can render it without a
  // second lookup — see VerseSuggestionCard, which shows the resolved text and
  // names the translation it resolved against.
  const verseText = index.verseTextById ? (index.verseTextById.get(top.verseId) ?? null) : null;

  return {
    reference: top.reference,
    bookName: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse,
    text: verseText,
    score,
    runnerUp,
  };
}

export default scoreVerses;