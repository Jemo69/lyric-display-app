import { describe, it, expect } from 'vitest';
import { getBibleVerseText } from 'shared/bible';

function makeBible(overrides = {}) {
  return {
    id: 'b1',
    name: 'KJV',
    books: [
      {
        number: 1,
        name: 'Genesis',
        chapters: [
          {
            number: 1,
            verses: [
              { number: 1, text: 'In the beginning God created the heaven and the earth.' },
              { number: 2, text: 'And the earth was without form, and void.' }
            ]
          }
        ]
      }
    ],
    ...overrides
  };
}

const reference = { book: 1, chapters: ['1'] };

describe('getBibleVerseText', () => {
  it('returns empty string when no bible or reference is given', () => {
    expect(getBibleVerseText(null, reference, [[1]])).toBe('');
    expect(getBibleVerseText(makeBible(), null, [[1]])).toBe('');
  });

  it('returns the verse text for a present reference', () => {
    expect(getBibleVerseText(makeBible(), reference, [[1]])).toBe('In the beginning God created the heaven and the earth.');
  });

  it('joins multiple selected verses with a space', () => {
    expect(getBibleVerseText(makeBible(), reference, [[1, 2]])).toBe(
      'In the beginning God created the heaven and the earth. And the earth was without form, and void.'
    );
  });

  it('returns empty string when the book is missing', () => {
    expect(getBibleVerseText(makeBible(), { book: 99, chapters: ['1'] }, [[1]])).toBe('');
  });

  it('returns empty string when the chapter is missing', () => {
    expect(getBibleVerseText(makeBible(), { book: 1, chapters: ['5'] }, [[1]])).toBe('');
  });

  it('returns empty string when the verse is missing', () => {
    expect(getBibleVerseText(makeBible(), reference, [[99]])).toBe('');
  });

  it('uses bookMap/chapterMap/verseMap lookups when available', () => {
    const bible = makeBible();
    bible.bookMap = { 1: bible.books[0] };
    bible.books[0].chapterMap = { 1: bible.books[0].chapters[0] };
    bible.books[0].chapters[0].verseMap = { 1: bible.books[0].chapters[0].verses[0] };
    expect(getBibleVerseText(bible, reference, [[1]])).toBe('In the beginning God created the heaven and the earth.');
  });
});
