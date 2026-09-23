import { describe, it, expect } from 'vitest';
import {
  getDanglingBracketInfo,
  splitByNearestPunctuation,
  splitBibleTextIntoSlides,
} from '../bibleSplitter';

const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();

// KJV-style fixture: pre-change Method-02 severed "[and went]" across slides.
const KJV_VERSE =
  'And it came to pass that when Jesus had finished these parables he departed thence [and went] into his own country and taught them in their synagogue insomuch that they were astonished';

// Second fixture: pre-change Method-02 severed "[that is Christ]" across slides.
const THAT_IS_CHRIST_VERSE =
  'For God so loved the world that he gave his only begotten Son [that is Christ] that whosoever believeth in him should not perish but have everlasting life and peace for evermore';

// NASB-style translator bracket fixture.
const NASB_VERSE =
  'Now the birth of Jesus Christ was on this wise [as written] in the book of the prophet and the angel came unto them with great glory shining round about them all';

describe('getDanglingBracketInfo', () => {
  it('reports not-inside for text without brackets', () => {
    const info = getDanglingBracketInfo('For God so loved the world.', 10);
    expect(info.inside).toBe(false);
    expect(info.adjustedIndex).toBe(10);
  });

  it('reports inside when the break lands in a short bracket', () => {
    const breakIndex = KJV_VERSE.indexOf('and went') + 2;
    const info = getDanglingBracketInfo(KJV_VERSE, breakIndex);
    expect(info.inside).toBe(true);
    expect(info.wordCount).toBe(2);
    expect(info.content).toBe('and went');
    // Break moves back to the bracket open (minus preceding space) so the
    // whole phrase starts the next slide.
    expect(KJV_VERSE[info.bracketStart]).toBe('[');
    expect(info.adjustedIndex).toBeLessThanOrEqual(info.bracketStart);
    expect(KJV_VERSE.slice(info.adjustedIndex, info.bracketEnd)).toContain('[and went]');
  });

  it('reports not-inside when the bracket already closed before the break', () => {
    const afterClose = KJV_VERSE.indexOf(']') + 5;
    expect(getDanglingBracketInfo(KJV_VERSE, afterClose).inside).toBe(false);
  });

  it('reports not-inside when the break is before the bracket', () => {
    expect(getDanglingBracketInfo(KJV_VERSE, 10).inside).toBe(false);
  });

  it('does not protect long brackets (>= 4 words)', () => {
    const text = 'He spoke at length [concerning the many things which had happened] unto the people gathered there.';
    const breakIndex = text.indexOf('many things') + 2;
    const info = getDanglingBracketInfo(text, breakIndex);
    expect(info.inside).toBe(false);
    expect(info.wordCount).toBeGreaterThanOrEqual(4);
  });

  it('leaves unclosed brackets alone', () => {
    const text = 'He departed thence [and went into his own country and taught them';
    expect(getDanglingBracketInfo(text, text.indexOf('went')).inside).toBe(false);
  });

  it('handles empty input', () => {
    expect(getDanglingBracketInfo('', 5).inside).toBe(false);
  });
});

describe('dangling-bracket protection in Method-02 (MF-15)', () => {
  it('keeps the KJV "[and went]" phrase whole instead of severing it', () => {
    const slides = splitByNearestPunctuation(KJV_VERSE, 90, 0);
    expect(slides).toEqual([
      'And it came to pass that when Jesus had finished these parables he departed thence',
      '[and went] into his own country and taught them in their synagogue insomuch that they',
      'were astonished',
    ]);
  });

  it('keeps "[that is Christ]" whole instead of severing it', () => {
    const slides = splitByNearestPunctuation(THAT_IS_CHRIST_VERSE, 70, 0);
    expect(slides).toEqual([
      'For God so loved the world that he gave his only begotten Son',
      '[that is Christ] that whosoever believeth in him should not perish',
      'but have everlasting life and peace for evermore',
    ]);
  });

  it('never leaves a dangling half-bracket on any slide (sweep)', () => {
    const verses = [KJV_VERSE, THAT_IS_CHRIST_VERSE, NASB_VERSE];
    for (const verse of verses) {
      for (const maxChars of [40, 50, 60, 70, 80, 90, 100, 110]) {
        const slides = splitByNearestPunctuation(verse, maxChars, 0);
        for (const slide of slides) {
          const opens = (slide.match(/\[/g) || []).length;
          const closes = (slide.match(/\]/g) || []).length;
          expect(opens, `maxChars=${maxChars} slide=${slide}`).toBe(closes);
        }
        expect(normalize(slides.join(' '))).toBe(normalize(verse));
      }
    }
  });

  it('terminates and stays reversible for long (>= 4 word) brackets', () => {
    const text =
      'He spoke at length [concerning the many things which had happened there] unto the people gathered in the synagogue and they marvelled at his doctrine and wisdom exceedingly.';
    const slides = splitByNearestPunctuation(text, 70, 0);
    expect(slides.length).toBeGreaterThan(1);
    expect(normalize(slides.join(' '))).toBe(normalize(text));
  });

  it('does not change splits for text without brackets (parity)', () => {
    const text =
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
    expect(splitByNearestPunctuation(text, 60, 0)).toEqual([
      'For God so loved the world,',
      'that he gave his only begotten Son,',
      'that whosoever believeth in him should not perish,',
      'but have everlasting life.',
    ]);
  });

  it('applies through the dispatcher default path', () => {
    const slides = splitBibleTextIntoSlides(KJV_VERSE, {
      splitLongVerses: true,
      maxChars: 90,
    });
    const bracketSlide = slides.find((slide) => slide.includes('[and went]'));
    expect(bracketSlide).toBeDefined();
    for (const slide of slides) {
      expect(slide.includes('[')).toBe(slide.includes(']'));
    }
    expect(normalize(slides.join(' '))).toBe(normalize(KJV_VERSE));
  });
});
