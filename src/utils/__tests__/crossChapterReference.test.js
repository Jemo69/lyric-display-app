import { describe, it, expect } from 'vitest';
import {
  searchBible,
  expandCrossChapterSegment,
  splitMultiPartReferences,
  REFERENCE_REGEX,
  CROSS_CHAPTER_REGEX,
  CHAPTER_SPAN_REGEX
} from 'shared/bible';
import { splitBibleTextIntoSlides } from '../bibleSplitter';

function chapter(number, count, tag) {
  const verses = [];
  for (let n = 1; n <= count; n++) {
    verses.push({ number: n, text: `${tag} ${number}:${n} text` });
  }
  return { number, verses };
}

function makeBible() {
  return {
    id: 'b1',
    name: 'KJV',
    books: [
      { number: 1, name: 'Genesis', abbreviation: 'Gen', chapters: [chapter(1, 31, 'Gen1'), chapter(2, 25, 'Gen2')] },
      { number: 19, name: 'Psalms', abbreviation: 'Ps', chapters: [chapter(23, 6, 'Ps23')] },
      { number: 43, name: 'John', abbreviation: 'Jn', chapters: [chapter(3, 36, 'Jn3')] },
      { number: 45, name: 'Romans', abbreviation: 'Rom', chapters: [chapter(8, 39, 'Rom8'), chapter(9, 33, 'Rom9')] }
    ]
  };
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('cross-chapter reference regexes', () => {
  it('REFERENCE_REGEX still matches plain single references', () => {
    expect('John 3:16'.match(REFERENCE_REGEX)).not.toBeNull();
    expect('Ps 23:1-3'.match(REFERENCE_REGEX)).not.toBeNull();
  });

  it('CROSS_CHAPTER_REGEX matches verse spans across chapters', () => {
    expect('Gen 1:26-2:3'.match(CROSS_CHAPTER_REGEX)).not.toBeNull();
    expect('Rom 8:38-9:2'.match(CROSS_CHAPTER_REGEX)).not.toBeNull();
  });

  it('CHAPTER_SPAN_REGEX matches whole-chapter spans but not same-chapter ranges', () => {
    expect('Gen 1-2'.match(CHAPTER_SPAN_REGEX)).not.toBeNull();
    expect('John 3:16-18'.match(CHAPTER_SPAN_REGEX)).toBeNull();
    expect('John 3:16-18'.match(CROSS_CHAPTER_REGEX)).toBeNull();
  });

  it('splitMultiPartReferences splits on semicolons', () => {
    expect(splitMultiPartReferences('Ps 23:1-3; John 3:16')).toEqual(['Ps 23:1-3', 'John 3:16']);
    expect(splitMultiPartReferences('John 3:16')).toEqual(['John 3:16']);
  });
});

describe('searchBible cross-chapter spans', () => {
  it('Gen 1:26-2:3 resolves to per-chapter verse groups', () => {
    const results = searchBible(makeBible(), 'Gen 1:26-2:3', {}, 50);
    expect(results).toHaveLength(2);

    expect(results[0].bookName).toBe('Genesis');
    expect(results[0].chapter).toBe(1);
    expect(results[0].verses).toEqual(range(26, 31));
    expect(results[0].reference).toBe('Genesis 1:26-31');
    expect(results[0].text).toContain('Gen1 1:26 text');
    expect(results[0].text).toContain('Gen1 1:31 text');
    expect(results[0].text).not.toContain('Gen2');

    expect(results[1].chapter).toBe(2);
    expect(results[1].verses).toEqual([1, 2, 3]);
    expect(results[1].reference).toBe('Genesis 2:1-3');

    for (const [index, result] of results.entries()) {
      expect(result.isCrossChapter).toBe(true);
      expect(result.groupReference).toBe('Genesis 1:26-2:3');
      expect(result.groupIndex).toBe(index);
      expect(result.groupSize).toBe(2);
    }
  });

  it('Rom 8:38-9:2 resolves across the chapter boundary', () => {
    const results = searchBible(makeBible(), 'Rom 8:38-9:2', {}, 50);
    expect(results).toHaveLength(2);
    expect(results[0].verses).toEqual([38, 39]);
    expect(results[0].reference).toBe('Romans 8:38-39');
    expect(results[1].verses).toEqual([1, 2]);
    expect(results[1].reference).toBe('Romans 9:1-2');
    expect(results[1].groupReference).toBe('Romans 8:38-9:2');
  });

  it('accepts en-dash separators', () => {
    const results = searchBible(makeBible(), 'Gen 1:26–2:3', {}, 50);
    expect(results).toHaveLength(2);
    expect(results[0].verses).toEqual(range(26, 31));
    expect(results[1].verses).toEqual([1, 2, 3]);
  });

  it('whole-chapter spans expand to full chapters', () => {
    const results = searchBible(makeBible(), 'Gen 1-2', {}, 50);
    expect(results).toHaveLength(2);
    expect(results[0].reference).toBe('Genesis 1');
    expect(results[0].verses).toEqual(range(1, 31));
    expect(results[1].reference).toBe('Genesis 2');
    expect(results[1].verses).toEqual(range(1, 25));
    expect(results[0].groupReference).toBe('Genesis 1-2');
  });

  it('one typed string yields grouped slide sets', () => {
    const results = searchBible(makeBible(), 'Gen 1:26-2:3', {}, 50);
    const slideSets = results.map((result) =>
      splitBibleTextIntoSlides(result.text, { splitLongVerses: false })
    );
    expect(slideSets).toHaveLength(2);
    expect(slideSets[0]).toEqual([results[0].text]);
    expect(slideSets[1]).toEqual([results[1].text]);
  });
});

describe('searchBible multi-part references', () => {
  it('"Ps 23:1-3; John 3:16" resolves both parts in order', () => {
    const results = searchBible(makeBible(), 'Ps 23:1-3; John 3:16', {}, 50);
    expect(results).toHaveLength(2);

    expect(results[0].bookName).toBe('Psalms');
    expect(results[0].verses).toEqual([1, 2, 3]);
    expect(results[0].reference).toBe('Psalms 23:1-3');
    expect(results[0].partIndex).toBe(0);
    expect(results[0].partTotal).toBe(2);

    expect(results[1].bookName).toBe('John');
    expect(results[1].verses).toEqual([16]);
    expect(results[1].reference).toBe('John 3:16');
    expect(results[1].partIndex).toBe(1);
    expect(results[1].partTotal).toBe(2);
  });

  it('continuation parts inherit the previous book and chapter', () => {
    const byChapter = searchBible(makeBible(), 'Rom 8:28; 9:1', {}, 50);
    expect(byChapter).toHaveLength(2);
    expect(byChapter[0].reference).toBe('Romans 8:28');
    expect(byChapter[1].reference).toBe('Romans 9:1');

    const byVerse = searchBible(makeBible(), 'Ps 23:1; 3', {}, 50);
    expect(byVerse).toHaveLength(2);
    expect(byVerse[0].reference).toBe('Psalms 23:1');
    expect(byVerse[1].reference).toBe('Psalms 23:3');
  });

  it('a non-reference part degrades gracefully instead of failing', () => {
    const results = searchBible(makeBible(), 'John 3:16; love', {}, 50);
    expect(results).toHaveLength(1);
    expect(results[0].reference).toBe('John 3:16');
  });
});

describe('single-reference regressions', () => {
  it('"John 3:16" keeps its exact legacy shape', () => {
    const results = searchBible(makeBible(), 'John 3:16', {}, 50);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      book: 43,
      bookName: 'John',
      chapter: 3,
      verse: 16,
      endVerse: 16,
      verses: [16],
      reference: 'John 3:16',
      bibleId: 'b1',
      bibleName: 'KJV'
    });
    expect(results[0]).not.toHaveProperty('partIndex');
    expect(results[0]).not.toHaveProperty('groupReference');
  });

  it('"Ps 23:1-3" still resolves as one same-chapter range', () => {
    const results = searchBible(makeBible(), 'Ps 23:1-3', {}, 50);
    expect(results).toHaveLength(1);
    expect(results[0].verses).toEqual([1, 2, 3]);
    expect(results[0].reference).toBe('Psalms 23:1-3');
  });

  it('whole-chapter queries still return per-verse results', () => {
    const results = searchBible(makeBible(), 'Genesis 1', {}, 50);
    expect(results).toHaveLength(31);
    expect(results[0].reference).toBe('Genesis 1:1');
  });

  it('fuzzy keyword search is unchanged', () => {
    const results = searchBible(makeBible(), 'ps23', {}, 50);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).not.toHaveProperty('partIndex');
  });

  it('non-reference text with a semicolon falls back instead of crashing', () => {
    expect(searchBible(makeBible(), 'love; grace', {}, 50)).toEqual([]);
  });
});

describe('expandCrossChapterSegment', () => {
  it('returns empty groups for invalid spans', () => {
    const bible = makeBible();
    const genesis = bible.books[0];
    expect(expandCrossChapterSegment(bible, genesis, { chapter: 2, verse: 3 }, { chapter: 1, verse: 26 })).toEqual([]);
    expect(expandCrossChapterSegment(bible, null, { chapter: 1, verse: 26 }, { chapter: 2, verse: 3 })).toEqual([]);
  });

  it('skips chapters missing from the translation', () => {
    const bible = makeBible();
    bible.books[0] = { ...bible.books[0], chapters: [bible.books[0].chapters[0]] };
    const groups = expandCrossChapterSegment(
      bible,
      bible.books[0],
      { chapter: 1, verse: 30 },
      { chapter: 2, verse: 3 }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].chapter).toBe(1);
    expect(groups[0].verses).toEqual([30, 31]);
  });
});
