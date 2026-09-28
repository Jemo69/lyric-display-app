// src/speech/spokenForm.js — spoken-form normalisation (plan 11, detector 1)
//
// "A pure function converts number words to digits and ordinals to book
//  numbers, then feeds the reference regex that already exists at
//  shared/bible/index.js:148 (REFERENCE_REGEX)."
//
// Examples from the plan, all handled here or by detectVerse on top of it:
//   "John chapter three verse sixteen"  -> "John 3:16"
//   "first Peter five"                  -> "1 Peter 5"
//   "forty two"                         -> "42"
//   "Psalms twenty three"               -> "Psalm 23"   (the ":1" comes from
//      the chapter-only rule in detectVerse; the plural fix is detector 2's
//      confusion table, not this normaliser's job)
//   "sixteen through eighteen"          -> "16-18"
//   "the book of John three verse sixteen" -> "John 3:16"  ("the book of"
//      stripped FIRST, never after)
//
// Pure: takes text, returns text. No I/O, no logging, no store reads.

import { REFERENCE_REGEX } from 'shared/bible';
import { stripBookPrefix } from 'shared/bible/bookAliases.js';

/** Cardinal number words. */
const CARDINALS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

/** Ordinal number words — "first Peter" becomes "1 Peter". */
const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40,
  fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90,
};

/** Scale words. */
const SCALES = { hundred: 100, thousand: 1000, million: 1000000 };

/** Strip edge punctuation and lower-case a token for dictionary lookup. */
function bare(token) {
  return String(token)
    .toLowerCase()
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '');
}

function isNumberWord(word) {
  return (
    Object.prototype.hasOwnProperty.call(CARDINALS, word) ||
    Object.prototype.hasOwnProperty.call(ORDINALS, word) ||
    Object.prototype.hasOwnProperty.call(SCALES, word)
  );
}

/**
 * Split whitespace tokens, breaking letter-hyphen-letter compounds
 * ("twenty-three") into separate words while leaving digit ranges
 * ("16-18") and already-digit references ("3:16") untouched.
 */
function tokenizeWords(text) {
  const out = [];
  for (const token of String(text ?? '').split(/\s+/)) {
    if (!token) continue;
    if (/^[a-zA-Z]+(?:-[a-zA-Z]+)+$/.test(token)) {
      out.push(...token.split('-'));
    } else {
      out.push(token);
    }
  }
  return out;
}

/**
 * Convert English number words to digits, in place, preserving every other
 * token. Handles compounds ("twenty three"), hundreds/thousands
 * ("two hundred and twenty one" -> 221), ordinals ("first" -> 1,
 * "twenty first" -> 21), and leaves digits exactly as they were.
 *
 * @param {string} text
 * @returns {string} the text with number words replaced by digits
 */
export function wordsToDigits(text) {
  const tokens = tokenizeWords(text);
  const out = [];
  let total = 0;
  let current = 0;
  let inNumber = false;
  let afterScale = false; // last number word was hundred/thousand/million
  let openUnit = false; // the open number ENDS with a unit word (< 20)

  const flush = () => {
    if (inNumber) {
      out.push(String(total + current));
      total = 0;
      current = 0;
      inNumber = false;
      afterScale = false;
      openUnit = false;
    }
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const word = bare(token);

    // "two hundred and twenty one": an "and" directly after a scale word
    // joins the parts instead of flushing them. ("three and four" keeps its
    // "and" — that is prose, not a compound number.)
    if (
      word === 'and' &&
      inNumber &&
      afterScale &&
      i + 1 < tokens.length &&
      isNumberWord(bare(tokens[i + 1]))
    ) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(CARDINALS, word)) {
      const value = CARDINALS[word];
      const isUnit = value < 20; // not a tens word (twenty..ninety) or scale
      // Two unit words in a row are TWO numbers, not one: "philippians four
      // seven" is chapter 4 verse 7, and "corinthian five sixteen" is 5:16.
      // Only a tens/scale opener lets a unit continue the same number
      // ("twenty three" -> 23, "one hundred fifteen" -> 115).
      if (inNumber && openUnit && isUnit) flush();
      current += value;
      inNumber = true;
      afterScale = false;
      openUnit = isUnit;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(ORDINALS, word)) {
      // An ordinal closes the number: "first" -> 1, "twenty first" -> 21.
      const value = (inNumber ? total + current : 0) + ORDINALS[word];
      total = 0;
      current = 0;
      inNumber = false;
      afterScale = false;
      openUnit = false;
      out.push(String(value));
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(SCALES, word)) {
      const scale = SCALES[word];
      if (word === 'hundred') {
        current = (current === 0 ? 1 : current) * scale;
      } else {
        total += (current === 0 ? 1 : current) * scale;
        current = 0;
      }
      inNumber = true;
      afterScale = true;
      openUnit = false;
      continue;
    }

    flush();
    out.push(token);
  }
  flush();
  return out.join(' ');
}

/**
 * Remove a leading "the book of" phrase. Re-exported from the confusion
 * table so callers only need this module; kept as its own named step
 * because the plan insists the strip happens BEFORE matching.
 */
export { stripBookPrefix };

/**
 * The full spoken-form normalisation pipeline, in the order the plan
 * specifies:
 *
 *   1. strip "the book of"        (before anything matches)
 *   2. number words -> digits     ("chapter three" -> "chapter 3")
 *   3. spoken ranges -> "-"       ("sixteen through eighteen" -> "16-18")
 *   4. "chapter"/"verse" words -> reference punctuation
 *      ("John 3 verse 16" -> "John 3:16")
 *
 * Already-digit references pass through unchanged; prose passes through
 * unchanged (detectVerse then finds no reference and returns null).
 *
 * @param {string} text
 * @returns {string} normalised text ready for REFERENCE_REGEX
 */
export function normalizeSpokenReference(text) {
  const stripped = stripBookPrefix(text);
  const numbered = wordsToDigits(stripped);

  const ranged = numbered
    // spoken range words between two numbers -> dash
    .replace(/(\d+)\s+(?:through|thru|till|until|to)\s+(\d+)/gi, '$1-$2')
    // normalise dash variants between digits (en/em/minus -> hyphen)
    .replace(/(\d+)\s*[–—−]\s*(\d+)/g, '$1-$2')
    // collapse spaces around an existing digit range ("16 - 18" -> "16-18")
    .replace(/(\d+)\s+-\s+(\d+)/g, '$1-$2');

  return ranged
    // "3 verse 16" / "3 verse 16-18" -> "3:16" / "3:16-18"
    .replace(
      /(\d+)\s+verses?\s+(\d+)(?:\s*-\s*(\d+))?/gi,
      (_m, chapter, start, end) => `${chapter}:${start}${end ? `-${end}` : ''}`
    )
    // a bare "verse 16" with no chapter -> ":16" (only useful mid-reference)
    .replace(/\bverses?\s+(\d+)(?:\s*-\s*(\d+))?/gi, (_m, start, end) => `:${start}${end ? `-${end}` : ''}`)
    // "chapter 3" (or "chapter 3:16") -> "3" / "3:16"
    .replace(/\bchapters?\s+(?=\d)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match REFERENCE_REGEX against the normalised text, anchored at the first
 * position where a resolvable book name begins. The regex is anchored
 * (`^`), so leading filler ("turn to John three", "in John 3:16") is
 * handled by retrying at each word start rather than by mangling the text.
 *
 * Returns the raw regex match parts, or null.
 */
export function matchReference(normalizedText, isKnownBook) {
  const text = String(normalizedText ?? '').trim();
  if (!text) return null;

  const starts = [0];
  for (let i = 1; i < text.length; i += 1) {
    if (/\s/.test(text[i - 1]) && !/\s/.test(text[i])) starts.push(i);
  }

  for (const start of starts) {
    const candidate = start === 0 ? text : text.slice(start);
    const match = candidate.match(REFERENCE_REGEX);
    if (!match) continue;
    if (isKnownBook(match[1])) return match;
  }
  return null;
}

/**
 * Parse a normalised reference into structured parts using
 * REFERENCE_REGEX (shared/bible/index.js:148).
 *
 * Reference shape from the regex:
 *   [1] book part   [2] chapter   [3] verse after : . or ,
 *   [4] verse after a space      [5] range end after -
 *
 * A chapter with no verse resolves to verse 1 — the plan's own example
 * ("Psalms twenty three" -> Psalm 23:1) establishes that convention.
 * A chapter span with no verse ("Psalm 23-24") keeps the chapter and drops
 * the range rather than inventing a verse span.
 *
 * @param {string} normalizedText
 * @param {(bookPart: string) => boolean} isKnownBook
 * @returns {{ bookPart: string, chapter: number, verse: number,
 *             endVerse: number|null } | null}
 */
export function parseReference(normalizedText, isKnownBook) {
  const match = matchReference(normalizedText, isKnownBook);
  if (!match) return null;

  const bookPart = match[1].trim();
  const chapter = Number.parseInt(match[2], 10);
  if (!bookPart || !Number.isFinite(chapter)) return null;

  const versePart = match[3] || match[4] || null;
  const rangeEnd = match[5] || null;

  if (versePart) {
    const verse = Number.parseInt(versePart, 10);
    const endVerse = rangeEnd ? Number.parseInt(rangeEnd, 10) : null;
    if (!Number.isFinite(verse)) return null;
    return { bookPart, chapter, verse, endVerse: Number.isFinite(endVerse) ? endVerse : null };
  }

  return { bookPart, chapter, verse: 1, endVerse: null };
}
