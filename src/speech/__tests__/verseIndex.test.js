// src/speech/__tests__/verseIndex.test.js — the inverted index (Phase 1)
//
// The index is pure derived data, so every test here is a property of the
// structure rather than of timing or the DOM. What matters is that the
// packing is correct: if an offset is off by one, every score downstream is
// quietly wrong and nothing else would catch it.

import { describe, it, expect } from 'vitest';
import { buildVerseIndex, tokenizeVerseText, verseTokenIds } from '../verseIndex.js';

/** A tiny synthetic bible — three chapters, known words, known counts. */
const BIBLE = {
  id: 'test-bible',
  name: 'Test',
  books: [
    {
      number: 43,
      name: 'John',
      chapters: [
        {
          number: 3,
          verses: [
            { number: 1, text: 'There was a man of the Pharisees, named Nicodemus.' },
            { number: 16, text: 'For God so loved the world, that he gave his only begotten Son.' },
            { number: 17, text: 'For God did not send his Son into the world to condemn the world.' },
          ],
        },
        {
          number: 4,
          verses: [{ number: 7, text: 'His wife answered and said, I have no husband.' }],
        },
      ],
    },
    {
      number: 19,
      name: 'Psalm',
      chapters: [
        {
          number: 23,
          verses: [{ number: 1, text: 'The LORD is my shepherd; I shall not want.' }],
        },
      ],
    },
  ],
};

describe('tokenizeVerseText', () => {
  it('lower-cases and strips punctuation', () => {
    expect(tokenizeVerseText('The LORD is my shepherd;')).toEqual(['the', 'lord', 'is', 'my', 'shepherd']);
  });

  it('drops single characters', () => {
    // "a" is one token long and carries no signal, so it is not indexed.
    expect(tokenizeVerseText('a b cd')).toEqual(['cd']);
  });

  it('removes the apostrophe so dont and don’t agree', () => {
    // Both sides of a match must normalize identically or a good match is lost.
    // Replacing the apostrophe with a SPACE instead would yield ["don", "t"],
    // and the length filter would then drop the "t" — leaving a useless "don".
    expect(tokenizeVerseText("don't")).toEqual(['dont']);
    expect(tokenizeVerseText("don't")).toEqual(tokenizeVerseText('dont'));
  });

  it('keeps possessives searchable', () => {
    expect(tokenizeVerseText("God's love")).toEqual(['gods', 'love']);
  });

  it('splits hyphens into words so a phrase matches either spelling', () => {
    // "only begotten" is how it is read aloud and how it appears elsewhere in
    // a translation. Joining the hyphen would make the phrase unmatchable.
    expect(tokenizeVerseText('only-begotten Son')).toEqual(['only', 'begotten', 'son']);
  });

  it('returns empty for junk', () => {
    expect(tokenizeVerseText(null)).toEqual([]);
    expect(tokenizeVerseText('')).toEqual([]);
    expect(tokenizeVerseText('!!! ...')).toEqual([]);
  });
});

describe('buildVerseIndex', () => {
  const index = buildVerseIndex(BIBLE);

  it('returns null without usable books', () => {
    expect(buildVerseIndex(null)).toBeNull();
    expect(buildVerseIndex({})).toBeNull();
    expect(buildVerseIndex({ books: [] })).toBeNull();
  });

  it('counts every verse', () => {
    // John 3:1, 3:16, 3:17 (three), John 4:7 (one), Psalm 23:1 (one) = 5.
    expect(index.totalVerses).toBe(5);
  });

  it('maps a lower-cased reference to its verse id', () => {
    expect(index.verseToIdMap.get('john 3:16')).toBe(1);
    expect(index.verseToIdMap.get('psalm 23:1')).toBe(4);
  });

  it('indexes chapter metadata for the reference index', () => {
    const john3 = index.referenceIndex.get('john 3');
    expect(john3).toEqual({ bookName: 'John', chapterNumber: 3, startVerseId: 0, verseCount: 3 });

    // A single-chapter book must report a real count, because reference
    // normalization uses this to decide "Philemon verse 6" -> "Philemon 1:6".
    expect(index.referenceIndex.get('psalm 23').verseCount).toBe(1);
  });

  it('builds an idf that drops common words and keeps rare ones', () => {
    const the = index.vocabToIdMap.get('the');
    const son = index.vocabToIdMap.get('son');
    expect(the).toBeDefined();
    expect(son).toBeDefined();
    // "the" appears in 3 of 4 verses; "son" in 1 of 4. The ratio is what makes
    // "son" diagnostic and "the" noise.
    expect(index.wordIdf[son]).toBeGreaterThan(index.wordIdf[the]);
  });

  it('smooths idf so a word in every verse is not a division by zero', () => {
    // "for" opens two of the four verses here. Unsmoothed that is log(4/2),
    // fine; the point of the +1 is the all-verses case, which must be finite.
    const forId = index.vocabToIdMap.get('for');
    expect(Number.isFinite(index.wordIdf[forId])).toBe(true);
  });

  it('packs postings offsets so every word points at exactly its verses', () => {
    const wordId = index.vocabToIdMap.get('world');
    const from = index.wordPostingsOffsets[wordId];
    const to = index.wordPostingsOffsets[wordId + 1];
    const verses = Array.from(index.wordPostings.subarray(from, to)).sort((a, b) => a - b);
    // "world" is in John 3:16 and John 3:17.
    expect(verses).toEqual([1, 2]);
  });

  it('terminates the postings offset array', () => {
    // An unterminated final offset is an off-by-one that reads past the array.
    expect(index.wordPostingsOffsets[index.vocabPool.length])
      .toBe(index.wordPostings.length);
  });

  it('packs verse tokens in reading order', () => {
    // Psalm 23:1 — order is load-bearing for the phrase bonus.
    expect(verseTokenIds(index, 4).map((id) => index.vocabPool[id]))
      .toEqual(['the', 'lord', 'is', 'my', 'shepherd', 'shall', 'not', 'want']);
  });

  it('terminates the verse token offsets array', () => {
    expect(index.verseTokensOffsets[index.totalVerses]).toBe(index.verseTokens.length);
  });

  it('gives an empty token list for an out-of-range verse', () => {
    expect(verseTokenIds(index, 999)).toEqual([]);
    expect(verseTokenIds(index, -1)).toEqual([]);
    expect(verseTokenIds(null, 0)).toEqual([]);
  });

  it('carries the raw verse text so the card can render it', () => {
    // The card shows the resolved text so the operator can CHECK the match.
    // Without this the card would show a reference alone, which is exactly
    // the FreeShow gap this plan exists to close.
    expect(index.verseTextById.get(4)).toBe('The LORD is my shepherd; I shall not want.');
  });

  it('records the bible id and token floor for cache management', () => {
    expect(index.bibleId).toBe('test-bible');
    expect(index.tokenThreshold).toBeGreaterThan(0);
  });

  it('lists book names in corpus order', () => {
    expect(index.bookNames).toEqual(['John', 'Psalm']);
  });

  it('is deterministic — the same bible builds the same index twice', () => {
    // The worker caches this across a whole service. Nondeterminism here would
    // mean scores drifting between chunks for no visible reason.
    const again = buildVerseIndex(BIBLE);
    expect(again.versePool).toEqual(index.versePool);
    expect(Array.from(again.wordIdf)).toEqual(Array.from(index.wordIdf));
    expect(Array.from(again.wordPostings)).toEqual(Array.from(index.wordPostings));
  });
});