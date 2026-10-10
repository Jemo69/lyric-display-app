/**
 * shared/wer.js — word error rate.
 *
 * Plan 9.3: "WER — word-level error rate. Levenshtein distance between
 * hypothesis and reference, normalised by reference word count." It is the
 * benchmark's PRIMARY SORT KEY, so it has to be provably right: every
 * conclusion the benchmark draws rests on this number.
 *
 * WHY THIS EXISTS RATHER THAN A LIBRARY: plan 9.3, verbatim — "WER reuses the
 * Levenshtein already in main/lyricsProviders/searchAlgorithm.js, extracted to
 * shared/wer.js. Adding an evaluation library to compute the metric would be
 * self-defeating in a plan whose premise is adding zero dependencies."
 * The implementation below IS that extraction; see `levenshtein`.
 *
 * ONE IMPORTANT DIFFERENCE from the lyric-search original: that function takes
 * a `maxDistance` and returns `maxDistance + 1` once the strings are further
 * apart than that, because fuzzy MATCHING only needs "close enough". A WER is
 * a reported measurement, so clamping it would quietly understate a bad
 * transcript — exactly the case where an operator needs the truth. So the
 * shared `levenshtein` here is exact, and `levenshteinDistance` keeps its
 * clamped behaviour for lyric search, which calls it with that contract.
 */

/** Normalisation applied before comparing. Documented because it moves the number. */
export const NORMALISATION = Object.freeze({
  casefold: true,
  stripPunctuation: true,
  collapseWhitespace: true,
});

/**
 * Exact Levenshtein distance over strings or arrays.
 *
 * Accepts arrays so word-level comparison does not have to re-join and re-split
 * (and so "the pastor said 'jesus'" and "jesus" are not one word apart).
 *
 * O(min(m, n)) memory, O(m·n) time. A 90-second reference clip is a few hundred
 * words, so the quadratic term is irrelevant here; it is not the right tool for
 * a full service transcript and nothing should pretend otherwise.
 *
 * @param {string|Array<unknown>} a
 * @param {string|Array<unknown>} b
 * @returns {number} edit distance, 0 when equal
 */
export function levenshtein(a, b) {
  let left = Array.isArray(a) ? a : Array.from(String(a ?? ''));
  let right = Array.isArray(b) ? b : Array.from(String(b ?? ''));

  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  // Iterate the shorter string on the outer axis so the working row stays as
  // small as possible. Swapping the BINDINGS (not the arrays) is what keeps
  // this symmetric: mutating either input would be both wrong and surprising.
  if (left.length > right.length) {
    const swap = left;
    left = right;
    right = swap;
  }

  let previous = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) previous[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    const current = new Array(right.length + 1);
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }

  return previous[right.length];
}

/**
 * Split text into comparable words.
 *
 * Punctuation is stripped rather than treated as a separator, so "word," and
 * "word" are the same word — a transcript engine rarely emits punctuation and a
 * hand-written reference almost always has it, so counting it as a difference
 * would penalise the model for the reference's punctuation habits.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function words(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  let out = text;
  if (NORMALISATION.casefold) out = out.toLowerCase();
  if (NORMALISATION.stripPunctuation) {
    // Strip anything that is not a letter, digit, or whitespace. Unicode-aware,
    // so accented and non-Latin scripts survive rather than being emptied out.
    out = out.replace(/[^\p{L}\p{N}\s]+/gu, ' ');
  }
  if (NORMALISATION.collapseWhitespace) out = out.replace(/\s+/g, ' ').trim();
  return out.length === 0 ? [] : out.split(' ');
}

/**
 * Word-level error rate.
 *
 *   WER = (substitutions + deletions + insertions) / referenceWords
 *
 * A substitution counts as ONE error, not two (that is what separates WER from
 * a character-level rate normalised by reference characters).
 *
 * @param {string} hypothesis what the engine said
 * @param {string} reference  the hand-verified truth
 * @returns {number} 0..Infinity; 0 for a perfect match
 */
export function wer(hypothesis, reference) {
  return werDetail(hypothesis, reference).wer;
}

/**
 * The full breakdown behind a WER.
 *
 * Having S/D/I separately is what makes a benchmark actionable: an operator
 * seeing 40% deletions knows the engine is cutting words off the end, which is
 * a different problem from 40% substitutions on proper nouns.
 *
 * EDGE CASES, stated because each one is a way a WER can lie:
 *  - empty reference: there is nothing to normalise against. Returns Infinity,
 *    which is deliberately awkward to render — a silent 0 would report a
 *    flawless transcript for an empty reference clip.
 *  - empty hypothesis with a non-empty reference: 1.0 (every reference word
 *    was deleted). This is the "engine output nothing" case and must read as
 *    total failure, not as a division by zero.
 *
 * @param {string} hypothesis
 * @param {string} reference
 * @returns {{wer:number, substitutions:number, deletions:number, insertions:number,
 *            referenceWords:number, hypothesisWords:number}}
 */
export function werDetail(hypothesis, reference) {
  const hyp = words(hypothesis);
  const ref = words(reference);

  if (ref.length === 0) {
    return {
      wer: Infinity,
      substitutions: 0,
      deletions: 0,
      insertions: hyp.length,
      referenceWords: 0,
      hypothesisWords: hyp.length,
    };
  }

  // Backtrace over the distance matrix to attribute the edits.
  const rows = ref.length + 1;
  const cols = hyp.length + 1;
  const dist = new Array(rows);
  for (let i = 0; i < rows; i += 1) {
    dist[i] = new Array(cols);
    dist[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) dist[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }

  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dist[i][j] === dist[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      if (ref[i - 1] !== hyp[j - 1]) substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (i > 0 && dist[i][j] === dist[i - 1][j] + 1) {
      deletions += 1;
      i -= 1;
    } else {
      insertions += 1;
      j -= 1;
    }
  }

  const errors = substitutions + deletions + insertions;
  return {
    wer: errors / ref.length,
    substitutions,
    deletions,
    insertions,
    referenceWords: ref.length,
    hypothesisWords: hyp.length,
  };
}

export default wer;
