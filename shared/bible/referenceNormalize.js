/**
 * shared/bible/referenceNormalize.js — spoken reference normalization (Phase 2).
 *
 * Preachers do not say "John 3:16". They say:
 *
 *   "the 16th verse of John chapter 3"      -> John 3:16
 *   "John chapter 3, the 16th verse"         -> John 3:16
 *   "John 316"                               -> John 3:16
 *   "Psalms 4610"                            -> Psalm 46:10
 *   "Mark chapter 8 and 22"                  -> Mark 8:22
 *   "Mark 8 verse 22"                        -> Mark 8:22
 *   "the 23rd psalm"                         -> Psalm 23:1
 *   "Philemon verse 6"                       -> Philemon 1:6
 *   "John 3.16"                              -> John 3:16
 *   "1, john 4"                              -> 1 John 4:1
 *
 * This module rewrites all of those into one canonical "Book Chapter:Verse"
 * form so the existing detector sees a single shape. Selah currently
 * handles only the simplest of these; the glued-digit case in particular is a
 * constant occurrence, because speech-to-text drops the colon.
 *
 * THE RULE THAT MATTERS MOST: NOTHING IS GUESSED.
 *
 * Every pass validates its result against a reference index before committing.
 * If the chapter does not exist in the installed translation, the original text
 * is returned UNCHANGED. This is why "Jeremiah 29" spoken alone must never
 * become "Jeremiah 29:1" — a plausible-looking guess is worse than no
 * suggestion, because the operator cannot tell a guess from a fact. FreeShow's
 * reference detector does default to verse 1 in that case; this module does not,
 * and decision D4 keeps it that way.
 *
 * ORDER MATTERS. The passes are ordered cheapest-and-most-certain first so a
 * string is normalized exactly once, and a later pass cannot undo an earlier
 * one's work. Ordinal prefixes ("first John") are resolved BEFORE numbers are
 * parsed, or "first" becomes the digit 1 and reorders itself into the book name.
 *
 * PURE. Text in, text out. No store, no I/O, no logging.
 */

/**
 * @typedef {object} ReferenceShape
 * @property {Map<string, {verseCount:number, bookName:string, chapterNumber:number}>} [referenceIndex]
 *   "bookname chapter" -> chapter metadata, from the installed translation.
 *   Supplying it is what makes every pass validate rather than guess. Without
 *   it, ONLY the passes that cannot invent a reference are allowed to fire.
 */

/** Ordinal book prefixes: "first John" -> "1 John". */
const ORDINAL_BOOK_PREFIX = /\b(first|second|third|fourth|fifth)\s+(?=\p{L})/giu;
const ORDINAL_WORDS = Object.freeze({
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
});

/**
 * The 66-book canon, lower-cased, for checking that an ordinal word is
 * actually introducing a book.
 *
 * WHY THIS CHECK EXISTS. "first" followed by any word has the same shape as
 * "first John", so an unguarded pass rewrites "he spoke first and then again"
 * into "he spoke 1 and then again" — turning prose into a reference. That is a
 * silent corruption of sermon text, and it is the kind of bug that never shows
 * up in a demo.
 *
 * So the ordinal is only converted when the following word is a real book name.
 * The list is the same Protestant canon `CANONICAL_BOOK_NAMES` in
 * bookAliases.js; it is duplicated rather than imported because this module is
 * loaded by main-process code that must not pull the whole alias table in, and
 * a 66-entry constant is cheaper than that dependency.
 */
const CANONICAL_BOOK_SET = Object.freeze(new Set([
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
  'joshua', 'judges', 'ruth', 'samuel', 'kings', 'chronicles', 'ezra',
  'nehemiah', 'esther', 'job', 'psalm', 'psalms', 'proverbs', 'ecclesiastes',
  'solomon', 'song of solomon', 'isaiah', 'jeremiah', 'lamentations',
  'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah',
  'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
  'matthew', 'mark', 'luke', 'john', 'acts', 'romans', 'corinthians',
  'galatians', 'ephesians', 'philippians', 'colossians', 'thessalonians',
  'timothy', 'titus', 'philemon', 'hebrews', 'james', 'peter', 'jude',
  'revelation', 'revelations',
]));

/**
 * Spoken ordinal words a preacher uses for a verse number.
 *
 * "the sixteenth verse of John chapter 3" is the single most common way an
 * English speaker cites a verse, and it is a WORD, not a digit. Without this
 * table the inverted pass — the one that handles the most common phrasing —
 * silently did nothing on ordinary speech.
 *
 * Only the forms that are unambiguous in isolation are listed. "a" and "the"
 * are excluded deliberately: they are not ordinals and including them would
 * rewrite sentences that contain no reference at all.
 */
const ORDINAL_WORDS_TO_NUMBER = Object.freeze({
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60,
});

/**
 * The alternation, each alternative END-BOUNDED.
 *
 * WHY THE `(?!\p{L})` ON EVERY ALTERNATIVE. A bare `first|second|...` alternation
 * is a prefix trap: in "the sixteenth verse of John 3" the engine tries
 * alternatives in source order, and "sixth" appears before "sixteenth", so
 * "sixth" matches the first six letters of "sixteenth" and the capture groups
 * shift by one. The result was `book: "3", chapter: 0` — a silently wrong
 * reference from a pattern that looked perfectly correct.
 *
 * Each alternative is therefore wrapped so it can only match when followed by a
 * non-letter, which is what "sixth" never is inside "sixteenth".
 */
const ORDINAL_WORD_PATTERN = Object.freeze(
  Object.keys(ORDINAL_WORDS_TO_NUMBER)
    .map((word) => `${word}(?!\\p{L})`)
    .join('|')
);

/**
 * @param {string} word
 * @returns {number|null}
 */
function ordinalWordToNumber(word) {
  if (!word) return null;
  const value = ORDINAL_WORDS_TO_NUMBER[String(word).toLowerCase()];
  return value === undefined ? null : value;
}

/** "the 8th chapter of Romans" -> "Romans 8". Ordinal numerals + chapter word. */
const ORDINAL_CHAPTER_OF = new RegExp(
  String.raw`\b(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s+(?:chapter\s+)?of\s+([1-3]?\s*[\p{L}]+)`,
  'giu'
);

/** "the 23rd psalm" / "Psalm 23" — ordinal psalm phrasing. */
const ORDINAL_PSALM = /\b(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s+(psalm)\b/giu;

/** Trailing chapter word: "Mark chapter 8". */
const TRAILING_CHAPTER_WORD = /\s+chapter\b/giu;

/**
 * Spoken filler words that must never be captured as a book name.
 *
 * The inverted pattern accepts an optional "verse/verses" token so it can read
 * both "the 16th verse of John 3" and the shorter "16 of John 3". That
 * flexibility means a book group can capture "verse" itself. Listed here rather
 * than fixed in the pattern so the guard is one lookup and cannot be forgotten
 * when the pattern is next edited.
 */
const SPOKEN_KEYWORDS = Object.freeze(new Set([
  'verse', 'verses', 'chapter', 'chapters', 'chap', 'of', 'the', 'and', 'or',
  'read', 'reading', 'says', 'said', 'book', 'books',
]));

/** The canonical reference shape this module produces. */
const CANONICAL = /([1-3]?\s*[\p{L}]+)\s+(\d+)\s*:\s*(\d+)/u;

/**
 * Strip the chapter word from a book token: "mark chapter" -> "mark".
 * @param {string} book
 * @returns {string}
 */
function cleanBook(book) {
  return String(book ?? '').replace(TRAILING_CHAPTER_WORD, '').trim();
}

/**
 * Does this book/chapter pair exist in the supplied index?
 *
 * @param {ReferenceShape} shape
 * @param {string} book
 * @param {number} chapter
 * @returns {boolean}
 */
/**
 * Look up a book/chapter in the reference index, tolerating the plural form.
 *
 * Preachers say "Psalms 46:10" and "Revelations 21:4" — the plural is far more
 * common in speech than the canonical singular, so the index key is "psalm" and
 * a naive lookup misses every one of them.
 *
 * @param {ReferenceShape} shape
 * @param {string} book
 * @param {number} chapter
 * @returns {boolean}
 */
function chapterExists(shape, book, chapter) {
  return Boolean(chapterEntry(shape, book, chapter));
}

/**
 * @param {ReferenceShape} shape
 * @param {string} book
 * @param {number} chapter
 * @returns {{verseCount:number}|null}
 */
function chapterEntry(shape, book, chapter) {
  if (!shape?.referenceIndex) return null;
  const clean = cleanBook(book).toLowerCase();

  const direct = shape.referenceIndex.get(`${clean} ${chapter}`);
  if (direct) return direct;

  // "psalms 46" -> "psalm 46". Only a trailing "s" is stripped, and only when
  // the singular actually exists — so "Genesis 1" never tries "genesi 1".
  const singular = clean.endsWith('s') ? clean.slice(0, -1) : null;
  if (singular) {
    const viaSingular = shape.referenceIndex.get(`${singular} ${chapter}`);
    if (viaSingular) return viaSingular;
  }

  return null;
}

/**
 * The verse count of a chapter, or null when unknown.
 * @param {ReferenceShape} shape
 * @param {string} book
 * @param {number} chapter
 * @returns {number|null}
 */
function verseCount(shape, book, chapter) {
  const entry = chapterEntry(shape, book, chapter);
  return entry ? entry.verseCount : null;
}

/**
 * The single-chapter books of the Protestant canon.
 *
 * WHY THIS IS A LIST AND NOT AN INFERENCE. The obvious implementation asks
 * "does the index have chapter 1 but not chapter 2?" — which sounds more robust
 * than hard-coding names. It is not. That question is unanswerable from a
 * PARTIAL index: a translation loaded for one book, a pruned index, or a
 * mid-build cache all look identical to a single-chapter book. In testing,
 * `John 5` in an index holding john 1/3/4 but not john 2 was rewritten to
 * `John 1:5` — a confidently wrong reference on a screen, produced by a
 * plausible-looking inference.
 *
 * Single-chapter-ness is a fact about the canon, not a fact about a data
 * structure. So it is stated. A translation with unusual structure cannot
 * produce a wrong answer here, because this function never consults one.
 */
const SINGLE_CHAPTER_BOOKS = Object.freeze(new Set([
  'jude',
  'philemon',
  '2 john',
  '3 john',
]));

/**
 * Is this a single-chapter book?
 *
 * @param {string} book
 * @returns {boolean}
 */
function isSingleChapterBook(book) {
  return SINGLE_CHAPTER_BOOKS.has(cleanBook(book).toLowerCase().replace(/\s+/g, ' ').trim());
}

// ---------------------------------------------------------------------------
// The passes
// ---------------------------------------------------------------------------

/**
 * Pass 1 — numbered-book punctuation and ordinal prefixes.
 *
 *   "1, john 4"     -> "1 john 4"     (a comma inside a book name is ASR noise)
 *   "first John"    -> "1 John"       (must run BEFORE number parsing, or
 *                                       "first" becomes 1 and reorders)
 *   "second Samuel" -> "2 Samuel"
 *
 * @param {string} text
 * @param {ReferenceShape} _shape
 * @returns {string}
 */
export function normalizeOrdinalBooks(text, _shape) {
  let out = text;

  // An ordinal word becomes a digit ONLY when it introduces a real book name.
  // See CANONICAL_BOOK_SET for why this guard is load-bearing rather than
  // cosmetic: without it, prose like "he spoke first and then" becomes
  // "he spoke 1 and then".
  out = out.replace(
    // The candidate book name is matched NON-GREEDILY up to the first word that
    // is not part of a book name, and the lookahead accepts "chapter" as a
    // terminator because "first John chapter 5 verse 16" is how the sentence
    // actually arrives. Requiring a digit immediately after the book (the
    // earlier version) meant the most common spoken form never converted.
    /\b(first|second|third|fourth|fifth)\s+((?:1\s+|2\s+|3\s+)?(?:song of )?\p{L}[\p{L}]*)(?=\s|$)/giu,
    (match, word, candidate) => {
      const probe = candidate.trim().toLowerCase();
      const stripped = probe.replace(/^(?:1|2|3)\s+/, '');
      const isBook = CANONICAL_BOOK_SET.has(stripped) || CANONICAL_BOOK_SET.has(probe);
      if (!isBook) return match;
      return `${ORDINAL_WORDS[word.toLowerCase()]} ${candidate}`;
    }
  );

  // "1, john" / "1.john" / "1- john" -> "1 john". Only when a 1-3 digit is
  // followed by a word, because that is the shape of a numbered book.
  out = out.replace(/\b([1-3])\s*[,.]\s*(?=[\p{L}])/gu, '$1 ');

  return out;
}

/**
 * Pass 2 — trailing chapter word.
 *
 *   "Mark chapter 8" -> "Mark 8"
 *
 * @param {string} text
 * @param {ReferenceShape} _shape
 * @returns {string}
 */
export function normalizeChapterWord(text, _shape) {
  return text.replace(TRAILING_CHAPTER_WORD, '');
}

/**
 * Pass 3 — ordinal psalm phrasing.
 *
 *   "the 23rd psalm" -> "Psalm 23"
 *
 * @param {string} text
 * @param {ReferenceShape} _shape
 * @returns {string}
 */
export function normalizeOrdinalPsalm(text, _shape) {
  return text.replace(ORDINAL_PSALM, (_match, number, psalm) => `${psalm} ${number}`);
}

/**
 * Pass 4 — ordinal chapter "of" phrasing.
 *
 *   "the 8th chapter of Romans" -> "Romans 8"
 *
 * Runs BEFORE the reference passes, and the result is deliberately left without
 * a verse. Completing it is the DETECTOR's job, and the detector already
 * refuses a chapter with no verse — which is exactly the behaviour we want.
 *
 * @param {string} text
 * @param {ReferenceShape} _shape
 * @returns {string}
 */
export function normalizeOrdinalChapter(text, _shape) {
  return text.replace(ORDINAL_CHAPTER_OF, (_match, chapter, book) => `${cleanBook(book)} ${chapter}`);
}

/**
 * Pass 5 — INVERTED references. The most common way a preacher says it.
 *
 *   "the 16th verse of John chapter 3"  -> "John 3:16"
 *   "verse 16 of John 3"                -> "John 3:16"
 *   "16 of John chapter 3"              -> "John 3:16"
 *
 * @param {string} text
 * @param {ReferenceShape} shape
 * @returns {string}
 */
export function normalizeInverted(text, shape) {
  return text.replace(
    new RegExp(
      // The chapter word is OPTIONAL and must come BEFORE the chapter number,
      // because "verse 16 of John chapter 3" puts it there. It was previously
      // only accepted after the book, which is why the single most common
      // preacher phrasing in English did not normalize at all.
      // The "verse/verses" keyword is OPTIONAL. "verse 16 of John chapter 3"
      // and "16 of John chapter 3" are the same citation, and requiring the
      // keyword meant the shorter — and in practice more common — spoken form
      // never normalized at all.
      String.raw`\b(?:the\s+)?(?:(\d+)(?:st|nd|rd|th)?|(${ORDINAL_WORD_PATTERN}))\s+(?:(?:verse|verses)\s+)?(?:of\s+)?([1-3]?\s*[\p{L}]+?)(?:\s+(?:chapter|chap))?\s+(\d+)\b`,
      'giu'
    ),
    (match, digitVerse, wordVerse, book, chapter, offset, wholeString) => {
      const verse = digitVerse ?? ordinalWordToNumber(wordVerse);
      if (verse === null || verse === undefined) return match;

      // Defensive: a capture-group mistake in this pattern would otherwise
      // produce a confidently wrong reference rather than a visible failure.
      // This bug actually happened during development — an ungrouped
      // alternation shifted every argument by one and yielded
      // "Book 3:0". A malformed capture cannot leave this function.
      if (!/^\p{L}/u.test(String(book))) return match;
      if (!/^\d+$/.test(String(chapter))) return match;

      // The book group must not BE one of the spoken keywords. Making the
      // "verse/verses" token optional means "verse 16 of John 3" can otherwise
      // capture "verse" as the book — which produced "verse John 16 3" while
      // this pass was being written.
      if (SPOKEN_KEYWORDS.has(String(book).toLowerCase().trim())) return match;

      // THIS PASS IS FOR INVERTED PHRASINGS ONLY. "16th of John 3" — the verse
      // number BEFORE the book. If a "verse" keyword follows the chapter number,
      // the sentence is NOT inverted; it is the ordinary "Book 5 verse 16"
      // form, which pass 10 handles correctly. Firing here produced
      // "1 John 5:1 verse 16" — a malformed reference built from a correct
      // sentence, which is the worst kind of wrong.
      const after = String(wholeString ?? '').slice(offset + match.length);
      if (/^\s*(?:verse|verses)\b/iu.test(after)) return match;

      if (!chapterExists(shape, book, chapter)) return match;
      const max = verseCount(shape, book, chapter);
      // A verse past the end of the chapter is a mishearing, not a verse.
      if (max !== null && verse > max) return match;
      return `${cleanBook(book)} ${chapter}:${verse}`;
    }
  );
}

/**
 * Pass 6 — trailing ordinal verse.
 *
 *   "John chapter 3, the 16th verse" -> "John 3:16"
 *
 * @param {string} text
 * @param {ReferenceShape} shape
 * @returns {string}
 */
export function normalizeTrailingVerse(text, shape) {
  return text.replace(
    /\b([1-3]?\s*[\p{L}]+?)(?:\s+chapter)?\s+(\d+)[,\s]+(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s+(?:verse|verses)\b/giu,
    (match, book, chapter, verse) => {
      if (!chapterExists(shape, book, chapter)) return match;
      const max = verseCount(shape, book, chapter);
      if (max !== null && Number(verse) > max) return match;
      return `${cleanBook(book)} ${chapter}:${verse}`;
    }
  );
}

/**
 * Pass 7 — GLUED DIGITS. The highest-frequency pass in practice, because
 * speech-to-text drops the colon and nobody re-does the punctuation.
 *
 *   "John 316"   -> "John 3:16"
 *   "Psalms 4610" -> "Psalm 46:10"
 *   "Jeremiah 2911" -> "Jeremiah 29:11"
 *
 * Three digits split 1+2, four digits split 2+2. Validated against the index,
 * so "John 999" is left alone rather than becoming "John 9:99".
 *
 * @param {string} text
 * @param {ReferenceShape} shape
 * @returns {string}
 */
export function normalizeGluedDigits(text, shape) {
  return text.replace(
    /\b([1-3]?\s*[\p{L}]+)\s+(\d{3,4})\b/gu,
    (match, book, digits) => {
      // TRY BOTH SPLITS, NOT ONE GUESSED SPLIT.
      //
      // A 3-digit run is ambiguous: "John 231" is John 2:31 or John 23:1, and
      // which one is right depends on the book and the translation. Splitting
      // it as 1+2 unconditionally turned "Psalms 231" into "Psalm 2:31" — a
      // confident, wrong, on-screen answer.
      //
      // So every plausible split is generated and validated against the index.
      // The index is the ONLY thing that decides, which is exactly why this
      // pass refuses to run without one.
      const splits = [];
      if (digits.length === 3) {
        // 1+2 BEFORE 2+1, and only these two. A 1+3 style split is not a
        // candidate here: it turned "John 316" into "John 3:1" because 1 is a
        // valid verse number for any chapter, so the split "validated" while
        // being nonsense.
        splits.push([digits.slice(0, 1), digits.slice(1, 3)]);
        splits.push([digits.slice(0, 2), digits.slice(2, 3)]);
      } else if (digits.length === 4) {
        // 2+2 first: it is the only plausible split for a real chapter number,
        // and trying the others first produced "Psalms 4610" -> "Psalm 4:610"
        // style nonsense whenever a smaller chapter happened to exist.
        splits.push([digits.slice(0, 2), digits.slice(2, 4)]);
        splits.push([digits.slice(0, 3), digits.slice(3, 4)]);
      }

      if (!shape?.referenceIndex) return match;

      for (const [chapterPart, versePart] of splits) {
        const chapter = Number.parseInt(chapterPart, 10);
        const verse = Number.parseInt(versePart, 10);
        if (!Number.isFinite(chapter) || !Number.isFinite(verse)) continue;
        if (verse < 1) continue;
        if (!chapterExists(shape, book, chapter)) continue;
        const max = verseCount(shape, book, chapter);
        if (max === null || verse > max) continue;
        return `${cleanBook(book)} ${chapter}:${verse}`;
      }

      // Nothing validated. Return the original — a guess is worse than silence.
      return match;
    }
  );
}

/**
 * Pass 8 — dot, comma, or space between chapter and verse.
 *
 *   "John 3.16" -> "John 3:16"
 *   "John 4 7"  -> "John 4:7"    (only when that chapter actually exists)
 *
 * The second form is ambiguous with two chapters being named, so it is only
 * applied when "Book Chapter:Verse" resolves in the index. Otherwise
 * "Genesis 1 and 2" must stay two chapters.
 *
 * @param {string} text
 * @param {ReferenceShape} shape
 * @returns {string}
 */
export function normalizeSeparators(text, shape) {
  return text.replace(
    /(?<![\d:])\b([1-3]?\s*[\p{L}]+)\s+(\d+)[.\s]+(\d+)\b(?![\s:]*[1-3]?\s*[\p{L}]+)/gu,
    (match, book, chapter, verse) => {
      if (!chapterExists(shape, book, chapter)) return match;
      const max = verseCount(shape, book, chapter);
      if (max !== null && Number(verse) > max) return match;
      return `${cleanBook(book)} ${chapter}:${verse}`;
    }
  );
}

/**
 * Pass 9 — single-chapter books spoken without a chapter.
 *
 *   "Philemon verse 6" -> "Philemon 1:6"
 *   "Jude verse 3"     -> "Jude 1:3"
 *
 * Safe because the book genuinely has one chapter, so the "1" is a fact and not
 * a guess. This is the ONE place this module supplies a missing number, and it
 * is gated on the book being one of the four single-chapter books OF THE CANON —
 * never on the shape of a data structure (see SINGLE_CHAPTER_BOOKS).
 *
 * @param {string} text
 * @param {ReferenceShape} shape
 * @returns {string}
 */
export function normalizeSingleChapterBooks(text, shape) {
  return text.replace(
    // The "verse"/"v." keyword is optional, so "Philemon verse 6" and
    // "Philemon 6" both reach the validator.
    /\b([1-3]?\s*[\p{L}]+)\s+(?:verse\s+|v\.\s*)?(\d+)\b(?![:\d])/giu,
    (match, book, number) => {
      if (!isSingleChapterBook(book)) return match;
      const max = verseCount(shape, book, 1);
      if (max !== null && Number(number) > max) return match;
      return `${cleanBook(book)} 1:${number}`;
    }
  );
}

/**
 * Pass 10 — "chapter N and/or M verse V" and "chapter N verse V".
 *
 *   "Mark chapter 8 and 22"  -> "Mark 8:22"
 *   "Mark 8 verse 22"        -> "Mark 8:22"
 *   "Genesis 1 and 2"        -> unchanged (two chapters, not a verse)
 *
 * @param {string} text
 * @param {ReferenceShape} shape
 * @returns {string}
 */
export function normalizeSpokenReference(text, shape) {
  return text.replace(
    /\b([1-3]?\s*[\p{L}]+?)\s+(\d+)\s+(?:(?:and|or|through|to|,\s*)\s*)?(?:verse\s+)?(\d+)\b/giu,
    (match, book, chapter, verse) => {
      if (!chapterExists(shape, book, chapter)) return match;
      const max = verseCount(shape, book, chapter);
      if (max === null || Number(verse) < 1 || Number(verse) > max) return match;
      return `${cleanBook(book)} ${chapter}:${verse}`;
    }
  );
}

/**
 * Every pass, in the order they must run.
 *
 * Order rationale, since it is load-bearing:
 *
 *   1. ordinal books      "first John" -> "1 John", BEFORE any number parsing
 *   2. chapter word       "Mark chapter 8" -> "Mark 8"
 *   3. ordinal psalm      "the 23rd psalm" -> "Psalm 23"
 *   4. ordinal chapter    "the 8th chapter of Romans" -> "Romans 8"
 *   5. inverted           "the 16th verse of John 3" -> "John 3:16"
 *   6. trailing verse     "John 3, the 16th verse" -> "John 3:16"
 *   7. glued digits       "John 316" -> "John 3:16"     (last structural pass —
 *                                                           it must not see
 *                                                           already-normalized
 *                                                           text and re-split it)
 *   8. separators         "John 3.16" -> "John 3:16"
 *   9. single-chapter     "Jude verse 3" -> "Jude 1:3"
 *  10. spoken reference   "Mark 8 and 22" -> "Mark 8:22"
 */
const PASSES = [
  normalizeOrdinalBooks,
  normalizeChapterWord,
  normalizeOrdinalPsalm,
  normalizeOrdinalChapter,
  normalizeInverted,
  normalizeTrailingVerse,
  normalizeGluedDigits,
  normalizeSeparators,
  normalizeSingleChapterBooks,
  normalizeSpokenReference,
];

/**
 * Normalize a transcript (or a fragment of one) toward canonical references.
 *
 * @param {string} text
 * @param {ReferenceShape} [shape] the installed translation's reference index.
 *   Without it, only the passes that CANNOT invent a reference fire — which is
 *   almost none of them. So in practice: always supply it.
 * @returns {string}
 */
export function normalizeReferences(text, shape) {
  if (typeof text !== 'string' || text.length === 0) return text ?? '';
  let out = text;
  for (const pass of PASSES) out = pass(out, shape);
  return out;
}

/**
 * The first canonical reference found in `text`, or null.
 *
 * The shape the detectors consume, extracted from the normalized form.
 *
 * @param {string} text
 * @param {ReferenceShape} [shape]
 * @returns {{book:string, chapter:number, verse:number, endVerse:number|null}|null}
 */
export function extractReference(text, shape) {
  const normalized = normalizeReferences(text, shape);
  const match = normalized.match(CANONICAL);
  if (!match) return null;

  const chapter = Number.parseInt(match[2], 10);
  const verse = Number.parseInt(match[3], 10);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;

  const max = verseCount(shape, match[1], chapter);
  // Reject a verse past the end of the chapter. A reference that cannot exist is
  // a mishearing, and shipping it is worse than shipping nothing.
  if (max !== null && verse > max) return null;

  return { book: cleanBook(match[1]), chapter, verse, endVerse: null };
}

export default normalizeReferences;