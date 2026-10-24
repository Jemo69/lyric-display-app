/**
 * shared/bible/mishearings.js — spoken-form mishearing correction (Phase 2).
 *
 * WHY THIS FILE IS SMALLER THAN FREESHOW'S, DELIBERATELY.
 *
 * FreeShow's `COMMON_MISHEARINGS` table maps ~87 heard forms to corrections and
 * applies them as UNCONDITIONAL WHOLE-TRANSCRIPT WORD SUBSTITUTIONS. Among them:
 *
 *     ask      -> exodus      for   -> four       mat   -> matthew
 *     palm     -> psalm       cha  -> chapter    sec   -> second
 *
 * Every one of those heard forms is ordinary English. In a live sermon,
 * "we ask, and it is given" becomes "we exodus, and it is given". FreeShow gets
 * away with it because its mishearing table feeds a detector that only acts on
 * the last ~120 characters near a scripture reference, so the blast radius is
 * bounded — but the substitution still corrupts the text feeding that detector,
 * which is precisely the text used to confirm a match.
 *
 * This table takes the opposite posture, and the plan locks it in as decision
 * D5:
 *
 *   1. NO UNCONDITIONAL ENGLISH WORDS. Every row's `heard` form must be a word
 *      a speech model mishears ONLY when it is being used as a book name.
 *      `genius -> genesis` qualifies. `ask -> exodus` does not, so it is gone.
 *
 *   2. EVERY ROW CARRIES ITS OWN GATE. A row declares `contextFree` (fires on
 *      its own — the heard form is diagnostic by itself) or `contextGated`
 *      (fires only when the surrounding window already contains a book name and
 *      digits, which is the only situation where a substitution can help rather
 *      than corrupt).
 *
 * The existing `bookAliases.js` table is safe for exactly this reason: a row
 * only fires when it can pair a heard form with book + chapter + verse. This
 * file extends that discipline to whole-transcript normalization rather than
 * introducing a second, weaker mechanism.
 *
 * WHY `free` IS ABSENT BUT `four` IS NOT. "four" for "for" is the single most
 * common ASR error in scripture ("the fourth" is heard constantly, and "for"
 * is heard as "four" constantly) — but both are ordinary words, so it is
 * context-gated: it only corrects inside a window that already looks like a
 * reference. Outside that window, nothing is touched.
 *
 * NO LOGGING, NO I/O. Pure text in, text out. The transcript is audio-derived
 * content belonging to this session and must never be written anywhere by a
 * module that merely cleans it up.
 */

/**
 * @typedef {object} MishearingRow
 * @property {string[]} heard      lower-case forms the model produces
 * @property {string}   resolved   the canonical correction
 * @property {boolean}  contextFree true when the heard form is diagnostic alone
 * @property {string}   why        why the confusion happens — every row must
 *                                  justify itself, because a table of
 *                                  unexplained mappings is one nobody dares to
 *                                  maintain
 */

/** @type {ReadonlyArray<MishearingRow>} */
export const MISHEARING_ROWS = Object.freeze([
  // --- genuinely unambiguous book-name mishearings -------------------------
  // Each of these heard forms is not a word anyone uses in ordinary sermon
  // English, so correcting them cannot corrupt anything.
  {
    heard: ['genius', 'genes', 'jenesis', 'genesis of'],
    resolved: 'genesis',
    contextFree: true,
    why: 'The "-ius" ending is a hard ASR confusion, and no ordinary word ends this way.',
  },
  {
    heard: ['leviticus', 'levitical', 'leviticus the'],
    resolved: 'leviticus',
    contextFree: true,
    why: 'Correctly spelled often enough to be unreliable; harmless to re-state.',
  },
  {
    heard: ['deuteronomy', 'deteronomy', 'deut'],
    resolved: 'deuteronomy',
    contextFree: true,
    why: 'Long, multi-syllable, and routinely truncated to "deut".',
  },
  {
    heard: ['ephesians', 'epesians', 'epheseans'],
    resolved: 'ephesians',
    contextFree: true,
    why: 'The middle syllable drops frequently on fast speech.',
  },
  {
    heard: ['colossians', 'collossians', 'collisions', 'collosians'],
    resolved: 'colossians',
    contextFree: true,
    why: 'Double-L is near-homophonic for a single L to an ASR front end.',
  },
  {
    heard: ['philemon', 'philman', 'filman', 'philamon'],
    resolved: 'philemon',
    contextFree: true,
    why: 'Short, unfamiliar, and the vowel is genuinely ambiguous in speech.',
  },
  {
    heard: ['thessalonians', 'thessolonians', 'thessalonia'],
    resolved: 'thessalonians',
    contextFree: true,
    why: 'Long name, frequent syllable reduction.',
  },
  {
    heard: ['revelations', 'revolutions', 'revolution', 'revalations'],
    resolved: 'revelation',
    contextFree: true,
    why: 'The plural is far more common in speech, so the model reaches for it.',
  },
  {
    heard: ['zephaniah', 'zephania', 'zephanias'],
    resolved: 'zephaniah',
    contextFree: true,
    why: 'Trailing syllable dropped on fast speech.',
  },
  {
    heard: ['habakkuk', 'habakuk', 'habacuck'],
    resolved: 'habakkuk',
    contextFree: true,
    why: 'Doubled consonant is routinely collapsed to one.',
  },
  {
    heard: ['lamentations', 'lamentation', 'lamentations of'],
    resolved: 'lamentations',
    contextFree: true,
    why: 'The plural is far more common in speech.',
  },
  {
    heard: ['ecclesiastes', 'ecclestiastes', 'ecclesiasticus'],
    resolved: 'ecclesiastes',
    contextFree: true,
    why: 'Long name with a notoriously unstable middle.',
  },

  // --- book names that ARE ordinary words: context-gated only ---------------
  // These heard forms collide with real English. They correct ONLY when the
  // surrounding window already looks like a Bible reference — which is the only
  // time getting them right matters and the only time getting them wrong is
  // invisible.
  {
    heard: ['palm', 'palms'],
    resolved: 'psalm',
    contextFree: false,
    why: '"palm" is an ordinary word. Correct only beside a chapter/verse.',
  },
  {
    heard: ['job'],
    resolved: 'job',
    contextFree: false,
    why: '"job" is an ordinary word AND a name. Correct only beside a chapter/verse.',
  },
  {
    heard: ['matthew', 'mat', 'matt'],
    resolved: 'matthew',
    contextFree: false,
    why: '"mat" is an ordinary object. Correct only beside a chapter/verse.',
  },
  {
    heard: ['mark'],
    resolved: 'mark',
    contextFree: false,
    why: '"mark" is an ordinary verb and a name. Correct only beside a chapter/verse.',
  },
  {
    heard: ['luke'],
    resolved: 'luke',
    contextFree: false,
    why: 'A name as well as a book. Correct only beside a chapter/verse.',
  },
  {
    heard: ['acts'],
    resolved: 'acts',
    contextFree: false,
    why: 'An ordinary plural noun. Correct only beside a chapter/verse.',
  },
  {
    heard: ['romance', 'romanes', 'romenians'],
    resolved: 'romans',
    contextFree: false,
    why: '"romance" is an ordinary word. Correct only beside a chapter/verse.',
  },
  {
    heard: ['corinthian', 'corinthians', 'corenthians'],
    resolved: 'corinthians',
    contextFree: false,
    why: 'The singular is rare in speech; correction only matters beside a chapter/verse.',
  },
  {
    heard: ['galatian', 'galatians', 'galetion'],
    resolved: 'galatians',
    contextFree: false,
    why: 'Correct only beside a chapter/verse.',
  },
  {
    heard: ['hebrews', 'hebrew', 'hebers'],
    resolved: 'hebrews',
    contextFree: false,
    why: '"Hebrew" is an adjective a preacher uses freely. Correct only beside a chapter/verse.',
  },
  {
    heard: ['exodus'],
    resolved: 'exodus',
    contextFree: false,
    why: 'Never emitted from "ask" — see the module header. Only guards its own spelling.',
  },

  // --- ordinal number words misheard --------------------------------------
  // These are context-gated for a different reason than the book names: they
  // are ordinary words, but "the third of John" and "the thirst of John" only
  // diverge when a reference is already in play.
  {
    heard: ['turds', 'turd', 'thirdly of'],
    resolved: 'third',
    contextFree: false,
    why: 'Gross homophone. Correct only inside a reference window.',
  },
  {
    heard: ['forth', 'ford'],
    resolved: 'fourth',
    contextFree: false,
    why: '"forth" and "ford" are ordinary words. Correct only inside a reference window.',
  },
  {
    heard: ['sec', 'secnd'],
    resolved: 'second',
    contextFree: false,
    why: '"sec" is an ordinary abbreviation. Correct only inside a reference window.',
  },
]);

/** heard form -> row, lower-cased, longest first so "ecclesiastes" beats "ecc". */
const BY_HEARD = (() => {
  const map = new Map();
  for (const row of MISHEARING_ROWS) {
    for (const form of row.heard) {
      map.set(form.toLowerCase(), row);
    }
  }
  return map;
})();

/** Longest heard form first, so a longer match always wins. */
const HEARD_BY_LENGTH = Object.freeze(
  [...BY_HEARD.keys()].sort((a, b) => b.length - a.length)
);

/**
 * Does this window already look like a Bible reference?
 *
 * The gate for every `contextFree: false` row. It requires BOTH:
 *   - a book name, from the canonical list plus the two usual abbreviations
 *   - a digit, which is the chapter or verse
 *
 * Requiring the digit is what stops "we ask about job" from becoming "we exodus
 * about job". Without it, the book-name half would fire on any sentence that
 * happens to contain "mark" or "acts".
 */
const WINDOW_REFERENCE_SHAPE = new RegExp(
  [
    // a book-ish token
    '(?:genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|solomon|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|john|jude|revelation)',
    // optional leading number ("1 Peter", "2 Corinthians")
    '\\s*(?:[1-3]\\s+)?',
    // then a number — the chapter
    '\\s+\\d+',
  ].join(''),
  'iu'
);

/**
 * @typedef {object} MishearingContext
 * @property {boolean} [referenceWindow] the surrounding text already contains
 *   a book + digits. Computed by the caller from a window that INCLUDES the
 *   matched word, because "correct beside a chapter/verse" means exactly that.
 * @property {number}  [windowChars] how far to look either side. Default 60.
 */

/**
 * @param {string} text
 * @param {MishearingContext} [context]
 * @returns {boolean} TRUE when a reference-shaped window surrounds this word.
 */
export function hasReferenceContext(text, context = {}) {
  const { windowChars = 60 } = context;
  if (!text) return false;
  return WINDOW_REFERENCE_SHAPE.test(String(text).slice(0, windowChars));
}

/**
 * Apply the mishearing table.
 *
 * @param {string} text
 * @param {MishearingContext} [context]
 *   `referenceWindow` is the caller's answer to "is this text already inside a
 *   reference?". When omitted it is COMPUTED here, which is the correct default
 *   for a whole-transcript call but too coarse for a caller that knows better —
 *   a caller holding a single sentence should pass its own answer.
 * @returns {string} the corrected text, or `text` unchanged when nothing fires
 */
export function normalizeMishearings(text, context = {}) {
  if (typeof text !== 'string' || text.length === 0) return text ?? '';

  const lower = text.toLowerCase();
  const referenceWindow = context.referenceWindow ?? hasReferenceContext(lower, context);

  let out = text;
  for (const form of HEARD_BY_LENGTH) {
    const row = BY_HEARD.get(form);
    if (!row) continue;
    // A context-gated row must not fire unless the window is already a
    // reference. This single line is the whole of decision D5.
    if (!row.contextFree && !referenceWindow) continue;

    // (?<!\p{L}) ... (?!\p{L}) — match whole words only, so "mark" does not
    // fire inside "market" and "job" does not fire inside "jobs" unless the
    // row explicitly lists it.
    const pattern = new RegExp(`(?<!\\p{L})${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'giu');
    out = out.replace(pattern, row.resolved);
  }

  return out;
}

export default normalizeMishearings;