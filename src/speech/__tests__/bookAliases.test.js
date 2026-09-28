// src/speech/__tests__/bookAliases.test.js
//
// Plan 14: "Phonetic confusion table — Every alias in bookAliases.js
// resolves to a real book, and no alias can resolve to two different books
// ambiguously without the surrounding chapter and verse disambiguating.
// Aliases are pure data, so this is a cheap test with a real payoff."
import { describe, it, expect } from 'vitest';
import {
  BOOK_ALIAS_ROWS,
  CANONICAL_BOOK_NAMES,
  STRIPPED_PHRASES,
  lookupBookAlias,
  resolveBookAlias,
  stripBookPrefix,
} from 'shared/bible/bookAliases.js';
import { REFERENCE_REGEX } from 'shared/bible';
import { detectVerse } from '../detectVerse.js';

const canonicalSet = new Set(CANONICAL_BOOK_NAMES.map((name) => name.toLowerCase()));

const stripRow = BOOK_ALIAS_ROWS.find((row) => row.heard.includes('the book of'));
const aliasRows = BOOK_ALIAS_ROWS.filter((row) => !row.strip);

describe('the confusion table as data', () => {
  it('every row carries a why, and every heard form resolves', () => {
    for (const row of BOOK_ALIAS_ROWS) {
      expect(typeof row.why, `row ${JSON.stringify(row.heard)} must explain itself`).toBe('string');
      expect(row.why.trim().length, `row ${JSON.stringify(row.heard)} why is too short`).toBeGreaterThan(10);
      expect(row.heard.length).toBeGreaterThan(0);
      for (const heard of row.heard) {
        if (row.strip) continue;
        expect(resolveBookAlias(heard), `"${heard}" must resolve`).not.toBeNull();
      }
    }
  });

  it('every resolved name is a real canonical book', () => {
    for (const row of aliasRows) {
      const resolved = Array.isArray(row.resolved) ? row.resolved : [row.resolved];
      expect(resolved.length).toBeGreaterThan(0);
      for (const name of resolved) {
        expect(canonicalSet.has(name.toLowerCase()), `"${name}" must be canonical`).toBe(true);
      }
    }
  });

  it('no heard form appears in two rows (one heard form, one answer)', () => {
    const seen = new Map();
    for (const row of aliasRows) {
      for (const heard of row.heard) {
        expect(seen.has(heard), `"${heard}" declared twice`).toBe(false);
        seen.set(heard, row);
      }
    }
  });

  it('ambiguous rows resolve to numbered candidates, flagged ambiguous', () => {
    for (const row of aliasRows) {
      if (!Array.isArray(row.resolved)) continue;
      expect(row.resolved.length).toBeGreaterThanOrEqual(2);
      for (const heard of row.heard) {
        const result = resolveBookAlias(heard);
        expect(result.ambiguous, `"${heard}" is ambiguous alone`).toBe(true);
        expect(result.candidates).toEqual(row.resolved);
        // The disambiguation info travels with the result: the card shows
        // "1 or 2 Corinthians" until the surrounding reference decides.
        expect(result.candidates.every((name) => canonicalSet.has(name.toLowerCase()))).toBe(true);
      }
    }
  });
});

describe('every plan row resolves exactly as specified', () => {
  const table = [
    ['Revelations', 'Revelation'],            // plural is what speech reaches for
    ['Philipians', 'Philippians'],            // double-L transposition
    ['Phillipians', 'Philippians'],
    ['Eccleseastes', 'Ecclesiastes'],         // four syllables, low frequency
    ['Steven', 'Zephaniah'],                  // near-homophone of a first name
    ['Psalms', 'Psalm'],                      // normalise rather than reject
    ['Psalm', 'Psalm'],
    ['Philimon', 'Philemon'],                 // Philip-shaped opening
    ['Colosians', 'Colossians'],              // single/double-S garble
    ['Jeramiah', 'Jeremiah'],                 // vowel-order garble
  ];

  for (const [heard, expected] of table) {
    it(`"${heard}" resolves to "${expected}"`, () => {
      expect(resolveBookAlias(heard).book).toBe(expected);
    });
  }

  it('"Thessalonia" and bare "Thessalonians" resolve to 1 or 2 Thessalonians', () => {
    for (const heard of ['Thessalonia', 'Thessalonians']) {
      const result = resolveBookAlias(heard);
      expect(result.ambiguous).toBe(true);
      expect(result.candidates).toEqual(['1 Thessalonians', '2 Thessalonians']);
    }
  });

  it('"Corinthian" resolves to 1 or 2 Corinthians', () => {
    const result = resolveBookAlias('Corinthian');
    expect(result.ambiguous).toBe(true);
    expect(result.candidates).toEqual(['1 Corinthians', '2 Corinthians']);
  });

  it('bare "Timothy" resolves to 1 or 2 Timothy', () => {
    const result = resolveBookAlias('timothy');
    expect(result.ambiguous).toBe(true);
    expect(result.candidates).toEqual(['1 Timothy', '2 Timothy']);
  });

  it('a number the speaker said picks one candidate out', () => {
    expect(resolveBookAlias('2 corinthian').book).toBe('2 Corinthians');
    expect(resolveBookAlias('2 corinthian').ambiguous).toBe(false);
    expect(resolveBookAlias('2 thessalonians').book).toBe('2 Thessalonians');
    // No numbered Philippians exists — the stray number was the confusion.
    expect(resolveBookAlias('2 philipians').book).toBe('Philippians');
  });

  it('unknown names return null (the table only speaks when it knows)', () => {
    expect(resolveBookAlias('Coffee')).toBeNull();
    expect(resolveBookAlias('John')).toBeNull();
    expect(lookupBookAlias('zechariah')).toBeNull();
  });
});

describe('"the book of" is stripped BEFORE matching, not after', () => {
  it('is declared as a strip row, not an alias', () => {
    expect(stripRow).toBeDefined();
    expect(stripRow.strip).toBe(true);
    expect(STRIPPED_PHRASES).toContain('the book of');
    // It never resolves as an alias.
    expect(resolveBookAlias('the book of')).toBeNull();
  });

  it('the plan string only matches after stripping', () => {
    // Raw: REFERENCE_REGEX would take "the book of John" as the book
    // candidate — which resolves to no book at all.
    const rawMatch = 'the book of John three verse sixteen'.match(REFERENCE_REGEX);
    expect(rawMatch).toBeNull(); // no digits yet — numbers must normalise first

    const withNumbers = 'the book of John 3:16';
    expect(withNumbers.match(REFERENCE_REGEX)[1].trim().toLowerCase()).toBe('the book of john');
    expect(canonicalSet.has('the book of john')).toBe(false);

    // After stripping, the same shape resolves to John.
    const stripped = stripBookPrefix(withNumbers);
    expect(stripped.match(REFERENCE_REGEX)[1].trim().toLowerCase()).toBe('john');
    expect(detectVerse('the book of John three verse sixteen').verse.reference).toBe('John 3:16');
  });
});

describe('Psalms and Psalm both normalise to Psalm', () => {
  it('plural and singular both land on the canonical name', () => {
    expect(resolveBookAlias('Psalms').book).toBe('Psalm');
    expect(resolveBookAlias('psalm').book).toBe('Psalm');
    expect(resolveBookAlias('PSALMS').book).toBe('Psalm');
  });

  it('the full plan example resolves: "Psalms twenty three" -> Psalm 23:1', () => {
    const suggestion = detectVerse('Psalms twenty three');
    expect(suggestion.verse).toMatchObject({ book: 'Psalm', chapter: 23, verse: 1 });
    expect(suggestion.verse.reference).toBe('Psalm 23:1');
    // The plural fix belongs to the table (detector 2), not the normaliser.
    expect(suggestion.detector).toBe('alias');
  });
});
