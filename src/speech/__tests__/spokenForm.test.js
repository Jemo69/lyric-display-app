// src/speech/__tests__/spokenForm.test.js
//
// Plan 14 (Pure-function unit tests): "Spoken-form normalisation — the
// number-word and ordinal normaliser against a table of real phrasings:
// 'chapter three verse sixteen', 'first Peter', 'forty two', 'sixteen
// through eighteen', 'the book of Acts'. Pure function, fully
// table-testable, and the highest-value detector in the feature."
import { describe, it, expect } from 'vitest';
import {
  wordsToDigits,
  normalizeSpokenReference,
  stripBookPrefix,
  parseReference,
} from '../spokenForm.js';
import { CANONICAL_BOOK_NAMES } from 'shared/bible/bookAliases.js';

const isCanonical = (bookPart) =>
  CANONICAL_BOOK_NAMES.some((name) => name.toLowerCase() === String(bookPart).trim().toLowerCase());

describe('wordsToDigits: number words become digits', () => {
  const table = [
    ['forty two', '42'],
    ['twenty three', '23'],
    ['three', '3'],
    ['first', '1'],
    ['second', '2'],
    ['sixteenth', '16'],
    ['twenty first', '21'],
    ['one hundred', '100'],
    ['two hundred and twenty one', '221'],
    ['two hundred twenty one', '221'],
    ['three hundred fifteen', '315'],
    ['twenty-three', '23'],
    ['two thousand five', '2005'],
  ];
  for (const [input, expected] of table) {
    it(`"${input}" -> "${expected}"`, () => {
      expect(wordsToDigits(input)).toBe(expected);
    });
  }

  it('leaves already-digit references untouched', () => {
    expect(wordsToDigits('John 3:16')).toBe('John 3:16');
    expect(wordsToDigits('1 Peter 5')).toBe('1 Peter 5');
    expect(wordsToDigits('Psalm 23:1-3')).toBe('Psalm 23:1-3');
  });

  it('leaves prose words untouched', () => {
    expect(wordsToDigits('the coffee is warm this morning')).toBe(
      'the coffee is warm this morning'
    );
    // "three and four" is prose, not a compound — the "and" join only
    // applies directly after hundred/thousand/million.
    expect(wordsToDigits('three and four')).toBe('3 and 4');
  });
});

describe('normalizeSpokenReference: the plan examples, verbatim', () => {
  it('"John chapter three verse sixteen" -> "John 3:16"', () => {
    expect(normalizeSpokenReference('John chapter three verse sixteen')).toBe('John 3:16');
  });

  it('"first Peter five" -> "1 Peter 5"', () => {
    expect(normalizeSpokenReference('first Peter five')).toBe('1 Peter 5');
  });

  it('"forty two" -> "42"', () => {
    expect(normalizeSpokenReference('forty two')).toBe('42');
  });

  it('"Psalms twenty three" -> "Psalm 23" numbers, plural left for the confusion table', () => {
    // The plan's full example is "Psalm 23:1" — the ":1" is added by the
    // chapter-only rule in detectVerse and the plural fix belongs to the
    // confusion table (detector 2), so the normaliser only does numbers.
    expect(normalizeSpokenReference('Psalms twenty three')).toBe('Psalms 23');
  });

  it('"sixteen through eighteen" -> the range "16-18"', () => {
    expect(normalizeSpokenReference('sixteen through eighteen')).toBe('16-18');
  });

  it('spoken ranges inside a reference -> "John 3:16-18"', () => {
    expect(normalizeSpokenReference('John chapter three verse sixteen through eighteen')).toBe(
      'John 3:16-18'
    );
    expect(normalizeSpokenReference('John three verse sixteen to eighteen')).toBe('John 3:16-18');
  });
});

describe('normalizeSpokenReference: "the book of" is stripped FIRST', () => {
  it('stripBookPrefix removes the phrase before anything matches', () => {
    expect(stripBookPrefix('the book of Acts')).toBe('Acts');
    expect(stripBookPrefix('the book of John three verse sixteen')).toBe(
      'John three verse sixteen'
    );
    expect(stripBookPrefix('book of Ruth')).toBe('Ruth');
    expect(stripBookPrefix('in the book of John')).toBe('John');
  });

  it('the string only resolves after stripping — unstripped, the book candidate is "the book of John"', () => {
    // Numbers normalised but prefix NOT stripped: REFERENCE_REGEX then
    // captures "the book of John" as the book, which resolves to nothing.
    const unstripped = wordsToDigits('the book of John three verse sixteen');
    expect(unstripped).toBe('the book of John 3 verse 16');
    const rawMatch = unstripped.match(/^(\S+(?: \S+)*?)\s+(\d+)/);
    expect(rawMatch[1].toLowerCase()).toBe('the book of john');
    expect(isCanonical(rawMatch[1])).toBe(false);

    // With the strip running first, the same input produces a book that
    // resolves.
    const normalised = normalizeSpokenReference('the book of John three verse sixteen');
    expect(normalised).toBe('John 3:16');
    const parsed = parseReference(normalised, isCanonical);
    expect(parsed).toMatchObject({ bookPart: 'John', chapter: 3, verse: 16 });
    expect(isCanonical(parsed.bookPart)).toBe(true);
  });
});

describe('normalizeSpokenReference: other plan phrasings', () => {
  it('"chapter three verse sixteen" -> "3:16"', () => {
    expect(normalizeSpokenReference('chapter three verse sixteen')).toBe('3:16');
  });

  it('"first Peter" -> "1 Peter"', () => {
    expect(normalizeSpokenReference('first Peter')).toBe('1 Peter');
  });

  it('"the book of Acts" -> "Acts"', () => {
    expect(normalizeSpokenReference('the book of Acts')).toBe('Acts');
  });

  it('"second Timothy three" -> "2 Timothy 3"', () => {
    expect(normalizeSpokenReference('second Timothy three')).toBe('2 Timothy 3');
  });

  it('chapter/verse words separated by digits without the words', () => {
    expect(normalizeSpokenReference('philippians four seven')).toBe('philippians 4 7');
  });
});

describe('normalizeSpokenReference: pass-through and negatives', () => {
  it('already-digit references pass through unchanged', () => {
    for (const ref of ['John 3:16', 'Psalm 23:1-3', '1 Peter 5', 'Revelation 20:13-14', 'John 3 16']) {
      expect(normalizeSpokenReference(ref)).toBe(ref);
    }
  });

  it('unparseable prose passes through unchanged (detectVerse then returns null)', () => {
    const prose = 'the coffee is warm this morning';
    expect(normalizeSpokenReference(prose)).toBe(prose);
  });

  it('is safe on empty and non-string input', () => {
    expect(normalizeSpokenReference('')).toBe('');
    expect(normalizeSpokenReference(null)).toBe('');
    expect(normalizeSpokenReference(undefined)).toBe('');
  });
});

describe('parseReference: chapter-only becomes verse 1 (plan: Psalm 23:1)', () => {
  it('chapter only -> verse 1', () => {
    expect(parseReference('Psalm 23', isCanonical)).toMatchObject({
      bookPart: 'Psalm',
      chapter: 23,
      verse: 1,
      endVerse: null,
    });
  });

  it('chapter:verse range keeps the end verse', () => {
    expect(parseReference('John 3:16-18', isCanonical)).toMatchObject({
      chapter: 3,
      verse: 16,
      endVerse: 18,
    });
  });

  it('returns null when the book is not a known book', () => {
    expect(parseReference('coffee 3:16', isCanonical)).toBeNull();
    expect(parseReference('', isCanonical)).toBeNull();
  });
});
