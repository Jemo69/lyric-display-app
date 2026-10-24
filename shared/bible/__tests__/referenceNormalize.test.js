// shared/bible/__tests__/referenceNormalize.test.js — spoken reference
// normalization (Phase 2)
//
// The test that matters most in this file is the LAST one: a chapter with no
// verse must stay chapterless. Everything else here is about turning the way
// preachers actually speak into the one shape the detectors understand.

import { describe, it, expect } from 'vitest';
import {
  extractReference,
  normalizeGluedDigits,
  normalizeInverted,
  normalizeOrdinalBooks,
  normalizeReferences,
  normalizeSeparators,
  normalizeSingleChapterBooks,
  normalizeSpokenReference,
  normalizeTrailingVerse,
} from '../referenceNormalize.js';

/**
 * A reference index standing in for one installed translation.
 * Shaped exactly like BibleCacheManager's `referenceIndex`, because that is
 * what the caller actually has at runtime.
 */
const INDEX = new Map([
  ['john 1', { bookName: 'John', chapterNumber: 1, verseCount: 51 }],
  ['john 3', { bookName: 'John', chapterNumber: 3, verseCount: 36 }],
  ['john 4', { bookName: 'John', chapterNumber: 4, verseCount: 54 }],
  ['mark 1', { bookName: 'Mark', chapterNumber: 1, verseCount: 45 }],
  ['mark 8', { bookName: 'Mark', chapterNumber: 8, verseCount: 38 }],
  ['genesis 1', { bookName: 'Genesis', chapterNumber: 1, verseCount: 31 }],
  ['genesis 2', { bookName: 'Genesis', chapterNumber: 2, verseCount: 25 }],
  ['genesis 3', { bookName: 'Genesis', chapterNumber: 3, verseCount: 24 }],
  ['psalm 23', { bookName: 'Psalm', chapterNumber: 23, verseCount: 6 }],
  ['psalm 46', { bookName: 'Psalm', chapterNumber: 46, verseCount: 11 }],
  ['jeremiah 29', { bookName: 'Jeremiah', chapterNumber: 29, verseCount: 32 }],
  ['romans 8', { bookName: 'Romans', chapterNumber: 8, verseCount: 39 }],
  ['matthew 18', { bookName: 'Matthew', chapterNumber: 18, verseCount: 20 }],
  ['matthew 28', { bookName: 'Matthew', chapterNumber: 28, verseCount: 20 }],
  // Numbered books appear under BOTH the numbered and bare keys, because a
  // speaker says "first John" (numbered) and "the Gospel of John" (bare), and
  // the index is built from whatever the translation happens to use.
  ['1 john 5', { bookName: '1 John', chapterNumber: 5, verseCount: 21 }],
  ['john 5', { bookName: '1 John', chapterNumber: 5, verseCount: 21 }],
  ['philippians 4', { bookName: 'Philippians', chapterNumber: 4, verseCount: 23 }],
  // Single-chapter books — chapter 1 present, chapter 2 absent.
  ['philemon 1', { bookName: 'Philemon', chapterNumber: 1, verseCount: 25 }],
  ['jude 1', { bookName: 'Jude', chapterNumber: 1, verseCount: 25 }],
  ['2 john 1', { bookName: '2 John', chapterNumber: 1, verseCount: 13 }],
]);

const shape = { referenceIndex: INDEX };

describe('normalizeOrdinalBooks', () => {
  it('resolves an ordinal book prefix', () => {
    expect(normalizeOrdinalBooks('first John 5:16')).toContain('1 John');
    expect(normalizeOrdinalBooks('second Samuel 1:1')).toContain('2 Samuel');
    expect(normalizeOrdinalBooks('third John 1:1')).toContain('3 John');
  });

  it('strips punctuation inside a numbered book', () => {
    expect(normalizeOrdinalBooks('1, john 4')).toContain('1 john');
    expect(normalizeOrdinalBooks('2. corinthians 5')).toContain('2 corinthians');
  });

  it('leaves an ordinary word alone', () => {
    // "first" followed by a word looks exactly like "first John". It is only a
    // book prefix when the word after it is a book name, which needs the
    // reference index — without one, the pass declines rather than guessing.
    // This test pins that: the pass must not rewrite prose on its own.
    expect(normalizeOrdinalBooks('he spoke first and then again', {}))
      .toContain('spoke first and then');
  });
});

describe('normalizeInverted', () => {
  it('handles the most common preacher form', () => {
    expect(normalizeInverted('the sixteenth verse of John chapter 3', shape)).toContain('John 3:16');
  });

  it('handles a digit ordinal', () => {
    expect(normalizeInverted('the 16th verse of John 3', shape)).toContain('John 3:16');
  });

  it('handles "verse N of Book chapter C"', () => {
    expect(normalizeInverted('verse 16 of John chapter 3', shape)).toContain('John 3:16');
  });

  it('refuses to invent a chapter that does not exist', () => {
    // No "john 99" in the index. Returning the text unchanged is the whole
    // point: a plausible-looking guess is worse than no suggestion.
    expect(normalizeInverted('the 16th verse of John chapter 99', shape)).toBe(
      'the 16th verse of John chapter 99'
    );
  });

  it('refuses a verse past the end of the chapter', () => {
    // John 3 has 36 verses. "John 3:99" cannot exist.
    expect(normalizeInverted('the 99th verse of John chapter 3', shape)).toBe(
      'the 99th verse of John chapter 3'
    );
  });

  it('refuses to complete an inverted phrase with no verse', () => {
    // "the chapter of John" names no verse. Completing it would be guessing.
    expect(normalizeInverted('the chapter of John', shape)).toBe('the chapter of John');
  });
});

describe('normalizeTrailingVerse', () => {
  it('handles a trailing ordinal verse', () => {
    expect(normalizeTrailingVerse('John chapter 3, the 16th verse', shape)).toContain('John 3:16');
  });

  it('handles a trailing digit verse', () => {
    expect(normalizeTrailingVerse('John 3 the 16 verse', shape)).toContain('John 3:16');
  });

  it('refuses an impossible verse', () => {
    expect(normalizeTrailingVerse('John 3 the 99 verse', shape)).toBe('John 3 the 99 verse');
  });
});

describe('normalizeGluedDigits', () => {
  it.each([
    ['John 316', 'John 3:16'],
    ['Psalms 4610', 'Psalm 46:10'],
    ['Jeremiah 2911', 'Jeremiah 29:11'],
    ['Psalms 231', 'Psalm 23:1'],
  ])('splits %s into %s', (input, expected) => {
    // The highest-frequency pass in practice: speech-to-text drops the colon.
    const out = normalizeGluedDigits(input, shape);
    expect(out).toContain(expected.split(' ')[0]);
    expect(out).toMatch(/\d+:\d+/);
  });

  it('does NOT split a two-digit chapter', () => {
    // "Genesis 11" is Genesis chapter 11, NOT Genesis 1:1. A two-digit number is
    // a chapter on its own — only 3- and 4-digit runs are glued references.
    // This is the whole reason the pass requires {3,4} and not {2,3,4}.
    expect(normalizeGluedDigits('Genesis 11', shape)).toBe('Genesis 11');
  });

  it('refuses a glued number whose chapter does not exist', () => {
    // "John 999" must not become "John 9:99".
    expect(normalizeGluedDigits('John 999', shape)).toBe('John 999');
  });

  it('refuses a glued verse past the end of the chapter', () => {
    expect(normalizeGluedDigits('John 399', shape)).toBe('John 399');
  });

  it('refuses to split without an index — an unvalidated split is a guess', () => {
    expect(normalizeGluedDigits('John 316', {})).toBe('John 316');
    expect(normalizeGluedDigits('John 316', null)).toBe('John 316');
  });
});

describe('normalizeSeparators', () => {
  it('normalizes a dot separator', () => {
    expect(normalizeSeparators('John 3.16', shape)).toContain('John 3:16');
  });

  it('normalizes a space separator when the chapter exists', () => {
    expect(normalizeSeparators('John 4 7', shape)).toContain('John 4:7');
  });

  it('does not read two chapters as a chapter and a verse', () => {
    // "Genesis 1 and 2" is two chapters. Reading it as Genesis 1:2 would be a
    // confident, wrong, on-screen answer.
    expect(normalizeSeparators('Genesis 1 and 2', shape)).toBe('Genesis 1 and 2');
  });

  it('does not touch an already-canonical reference', () => {
    expect(normalizeSeparators('John 3:16', shape)).toBe('John 3:16');
  });
});

describe('normalizeSingleChapterBooks', () => {
  it('supplies the chapter for a genuine single-chapter book', () => {
    // The one place this module supplies a missing number, and it is safe
    // because the book genuinely has one chapter. That is a fact, not a guess.
    expect(normalizeSingleChapterBooks('Philemon verse 6', shape)).toContain('Philemon 1:6');
    expect(normalizeSingleChapterBooks('Jude verse 3', shape)).toContain('Jude 1:3');
  });

  it('does not touch a multi-chapter book', () => {
    expect(normalizeSingleChapterBooks('John 5', shape)).toBe('John 5');
  });

  it('refuses a verse past the end of the single chapter', () => {
    expect(normalizeSingleChapterBooks('Philemon verse 99', shape)).toBe('Philemon verse 99');
  });
});

describe('normalizeSpokenReference', () => {
  // NOTE ON COMPOSITION. This pass runs at position 10 in the pipeline, AFTER
  // the chapter-word pass has stripped "chapter". So it receives "Mark 8 and
  // 22", not "Mark chapter 8 and 22". Testing it against the raw spoken form
  // would assert a behaviour the pass was never designed to have — the two
  // are different inputs, and the pipeline is what turns one into the other.
  it('handles "chapter N and M" after the chapter word is stripped', () => {
    expect(normalizeSpokenReference('Mark 8 and 22', shape)).toContain('Mark 8:22');
  });

  it('handles the raw spoken form through the full pipeline', () => {
    // The form a preacher actually says, end to end.
    expect(normalizeReferences('Mark chapter 8 and 22', shape)).toBe('Mark 8:22');
  });

  it('handles "chapter N verse M"', () => {
    expect(normalizeSpokenReference('Mark 8 verse 22', shape)).toContain('Mark 8:22');
  });

  it('refuses an out-of-range verse', () => {
    expect(normalizeSpokenReference('Mark 8 verse 99', shape)).toBe('Mark 8 verse 99');
  });
});

describe('the full pipeline', () => {
  it.each([
    ['the sixteenth verse of John chapter 3', 'John 3:16'],
    ['John chapter 3, the 16th verse', 'John 3:16'],
    ['John 316', 'John 3:16'],
    ['Philemon verse 6', 'Philemon 1:6'],
    ['first John chapter 5 verse 16', 'John 5:16'],
  ])('normalizes %j to a canonical reference', (input) => {
    const ref = extractReference(input, shape);
    expect(ref).not.toBeNull();
    expect(ref.chapter).toBeGreaterThan(0);
    expect(ref.verse).toBeGreaterThan(0);
  });

  it('normalizes "the 23rd psalm" to a chapter with NO verse', () => {
    // "Psalm 23" is a real, correct, COMPLETE citation on its own — the
    // operator asked for the whole chapter. Emitting "Psalm 23:1" would be a
    // DIFFERENT passage. So this module stops at the chapter and lets the
    // detector decide, and the detector already refuses a chapter with no verse.
    // This is asserted separately precisely because expecting a full reference
    // here would encode the guess this module refuses to make.
    const normalized = normalizeReferences('the 23rd psalm', shape);
    expect(normalized).toMatch(/psalm 23$/i);
    expect(normalized).not.toMatch(/23:1/);
    expect(extractReference('the 23rd psalm', shape)).toBeNull();
  });

  it('produces the exact expected reference for each form', () => {
    // Spell out the expectations rather than asserting only the shape, so a
    // regression names the reference that changed.
    expect(extractReference('the sixteenth verse of John chapter 3', shape))
      .toMatchObject({ chapter: 3, verse: 16 });
    expect(extractReference('John 316', shape))
      .toMatchObject({ chapter: 3, verse: 16 });
    expect(extractReference('Psalms 4610', shape))
      .toMatchObject({ chapter: 46, verse: 10 });
    expect(extractReference('Philemon verse 6', shape))
      .toMatchObject({ chapter: 1, verse: 6 });
  });

  it('is a no-op on prose with no reference', () => {
    const prose = 'and that is really the whole point of it all';
    expect(normalizeReferences(prose, shape)).toBe(prose);
  });

  it('handles junk without throwing', () => {
    // A normalizer that throws mid-sermon takes the rail down.
    expect(normalizeReferences(null, shape)).toBe('');
    expect(normalizeReferences(undefined, shape)).toBe('');
    expect(normalizeReferences('', shape)).toBe('');
    expect(normalizeReferences(123, shape)).toBe(123);
  });
});

describe('THE INVARIANT: nothing is guessed', () => {
  it('leaves a bare chapter without a verse chapterless', () => {
    // THE test. FreeShow's detector returns "Jeremiah 29:1" at 75% confidence
    // when a book and chapter are spoken with no verse. This module does not,
    // and decision D4 keeps it that way — a plausible guess is worse than no
    // suggestion, because the operator cannot tell a guess from a fact.
    const normalized = normalizeReferences('he was reading from Jeremiah 29 today', shape);
    expect(normalized).not.toContain('Jeremiah 29:1');
    expect(extractReference('he was reading from Jeremiah 29 today', shape)).toBeNull();
  });

  it('leaves an unknown chapter unresolved', () => {
    expect(normalizeReferences('he read Obadiah 99 yesterday', shape)).toBe(
      'he read Obadiah 99 yesterday'
    );
  });

  it('never emits a verse past the end of a chapter', () => {
    // John 3 has 36 verses. Nothing anywhere in this pipeline may produce :99.
    const outputs = [
      normalizeInverted('the 99th verse of John chapter 3', shape),
      normalizeTrailingVerse('John 3 the 99 verse', shape),
      normalizeGluedDigits('John 399', shape),
      normalizeSeparators('John 3.99', shape),
      normalizeSpokenReference('John 3 verse 99', shape),
    ];
    for (const out of outputs) {
      expect(out).not.toMatch(/John 3:99/);
    }
  });

  it('refuses every reference pass when no index is supplied', () => {
    // Without an index nothing can be validated, so nothing that INVENTS a
    // reference may fire. This is the conservative direction, which is the
    // right direction for a failed lookup.
    const unvalidated = 'the sixteenth verse of John chapter 3';
    expect(normalizeReferences(unvalidated, {})).not.toContain('John 3:16');
    expect(normalizeGluedDigits('John 316', {})).toBe('John 316');
  });

  it('still does the non-inventing passes without an index', () => {
    // "first John" -> "1 John" invents nothing — it restates what was said.
    expect(normalizeOrdinalBooks('first John 5:16')).toContain('1 John');
  });
});