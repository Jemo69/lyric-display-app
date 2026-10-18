// shared/bible/bookAliases.js — static data for the verse detector (plan 11).
//
// Two things live here, both pure data with derived lookups:
//
//   1. The confusion table — "the highest-leverage data in this feature".
//      Book names speech models reliably mishear, mapped onto the correct
//      book(s), each row carrying the reason it exists. It is a starting
//      set, meant to grow from real services: every miss an operator
//      dismisses becomes a row here. No dependency, no fuzzy-matching
//      library — just data (plan 11, detector 2).
//
//   2. CANONICAL_BOOK_NAMES — the 66-book Protestant canon used to resolve
//      a parsed reference to a real book. "Psalm" (singular) is canonical
//      ON PURPOSE: "Psalms" is handled by the confusion table below, as
//      the plan specifies ("the table normalises rather than rejecting").
//
// "the book of" is a strip rule, not an alias: it must be removed BEFORE
// matching, never after (plan 11 table). It is declared here so the whole
// confusion surface stays in one file.

/** The 66 Protestant canon book names, in order. Detection resolves against these. */
export const CANONICAL_BOOK_NAMES = Object.freeze([
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm',
  'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
  'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
  '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1 Peter', '2 Peter',
  '1 John', '2 John', '3 John', 'Jude', 'Revelation',
]);

/**
 * The confusion table. Every row is { heard, resolved, why }:
 *
 *   heard     lower-case forms the transcription may produce
 *   resolved  a canonical book name, or an array of canonical candidates
 *             when the heard form alone is ambiguous ("1 or 2 Corinthians")
 *   strip     true only for phrases removed BEFORE any matching runs
 *   why       why the confusion happens — every row must justify itself
 *
 * @type {ReadonlyArray<{heard: string[], resolved?: string|string[], strip?: boolean, why: string}>}
 */
export const BOOK_ALIAS_ROWS = Object.freeze([
  {
    heard: ['revelations'],
    resolved: 'Revelation',
    why: 'The plural is far more common in ordinary speech, so the model reaches for it.',
  },
  {
    heard: ['philipians', 'phillipians'],
    resolved: 'Philippians',
    why: 'Double-L transposition, and the correct spelling is rarer in training data.',
  },
  {
    heard: ['thessalonia', 'thessalonians'],
    resolved: ['1 Thessalonians', '2 Thessalonians'],
    why: 'Singular and plural both occur, so the model splits the difference; a bare '
      + '"Thessalonians" names no book at all and is only resolvable from the '
      + 'surrounding chapter and verse.',
  },
  {
    heard: ['eccleseastes'],
    resolved: 'Ecclesiastes',
    why: 'A four-syllable name, low frequency, easily garbled.',
  },
  {
    heard: ['corinthian'],
    resolved: ['1 Corinthians', '2 Corinthians'],
    why: 'Ambiguous alone; resolvable only from the surrounding chapter and verse.',
  },
  {
    heard: ['steven'],
    resolved: 'Zephaniah',
    why: 'Near-homophone of a common first name — the model hears "Steven" where the '
      + 'pastor said "Zephaniah", which only reads as a reference once digits follow it.',
  },
  {
    heard: ['psalms', 'psalm'],
    resolved: 'Psalm',
    why: 'Both are legitimate. The table normalises rather than rejecting.',
  },
  {
    heard: ['philimon'],
    resolved: 'Philemon',
    why: 'Shares its opening with the far more frequent "Philip/Philippians"; the '
      + '"-emon" ending drops out in speech.',
  },
  {
    heard: ['colosians', 'collosians'],
    resolved: 'Colossians',
    why: 'Single/double-S garble on a pastoral-epistle name that is rare outside church audio.',
  },
  {
    heard: ['timothy'],
    resolved: ['1 Timothy', '2 Timothy'],
    why: 'Bare "Timothy" names no book — 1 and 2 Timothy both exist — and it is also a '
      + 'common first name, so it is only resolvable from the surrounding reference.',
  },
  {
    heard: ['jeramiah', 'jerimiah'],
    resolved: 'Jeremiah',
    why: 'Vowel-order garble of a five-syllable name the model rarely sees spelled correctly.',
  },
  {
    heard: ['the book of'],
    strip: true,
    resolved: null,
    why: 'Pastors say it constantly. Must be removed BEFORE matching, not after.',
  },
]);

/**
 * Phrases stripped from the head of a transcript before any reference
 * matching runs. The plan is explicit about the ordering: strip first,
 * then match — otherwise the book candidate becomes "the book of John"
 * and resolves to nothing.
 */
export const STRIPPED_PHRASES = Object.freeze(['the book of', 'book of']);

/** Case-insensitive exact lookup of one heard form. Returns the row or null. */
export function lookupBookAlias(heard) {
  if (typeof heard !== 'string') return null;
  const key = heard.trim().toLowerCase().replace(/^[\s"'“”]+|[\s"'“”.!?,;:]+$/g, '');
  if (!key) return null;
  for (const row of BOOK_ALIAS_ROWS) {
    if (row.strip) continue; // strip rows are not aliases
    if (row.heard.some((form) => form === key)) return row;
  }
  return null;
}

/**
 * Resolve a (possibly misheard) book name to canonical book name(s).
 *
 * @param {string} heard  e.g. "Revelations", "Philimon", "Corinthian"
 * @returns {{ book: string|null, candidates: string[], ambiguous: boolean, why: string }
 *           | null}  null when the table has nothing to say — which means
 *                   the name is either already canonical or not ours to fix.
 *
 * A leading book number is handled: "2 corinthian" resolves through the
 * "corinthian" row to "2 Corinthians" (the number the speaker actually
 * said wins), while "2 philipians" resolves to plain "Philippians" because
 * no numbered Philippians exists.
 */
export function resolveBookAlias(heard) {
  if (typeof heard !== 'string') return null;
  const key = heard.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (!key) return null;

  const direct = lookupBookAlias(key);
  if (direct) return rowToResult(direct);

  const numbered = /^(\d+)\s+(.+)$/.exec(key);
  if (numbered) {
    const [, number, rest] = numbered;
    const row = lookupBookAlias(rest);
    if (row) {
      const resolved = row.resolved;
      if (Array.isArray(resolved)) {
        // Keep the number the speaker said when it picks one candidate out.
        const kept = resolved.filter((name) => name.startsWith(`${number} `));
        if (kept.length === 1) {
          return { book: kept[0], candidates: [kept[0]], ambiguous: false, why: row.why };
        }
        return rowToResult(row);
      }
      // Unnumbered target ("2 philipians") — the stray number was the
      // confusion, not part of the book name.
      return { book: resolved, candidates: [resolved], ambiguous: false, why: row.why };
    }
  }
  return null;
}

function rowToResult(row) {
  const resolved = row.resolved;
  if (Array.isArray(resolved)) {
    return {
      book: resolved[0],
      candidates: [...resolved],
      ambiguous: resolved.length > 1,
      why: row.why,
    };
  }
  return { book: resolved, candidates: [resolved], ambiguous: false, why: row.why };
}

/**
 * Remove a leading "the book of" / "book of" phrase (with the small set of
 * fillers pastors put in front of it). Runs BEFORE reference matching —
 * never after. Leaves everything else untouched.
 */
export function stripBookPrefix(text) {
  return String(text ?? '').replace(
    /^\s*(?:in\s+|at\s+|open\s+to\s+|turn\s+to\s+)?(?:the\s+)?book\s+of\s+/i,
    ''
  );
}
