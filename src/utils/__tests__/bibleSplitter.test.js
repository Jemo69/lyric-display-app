import { describe, it, expect } from 'vitest';
import {
  splitByNearestPunctuation,
  splitByGeometry,
  estimateLines,
  resolveBibleGeometry,
  splitBibleTextIntoSlides,
  splitByLegacyPunctuation,
  splitByGeometryPunctuation,
  BIBLE_SPLIT_METHODS,
} from '../bibleSplitter';

const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();

describe('splitByNearestPunctuation', () => {
  it('returns the text unchanged when it fits the budget', () => {
    expect(splitByNearestPunctuation('Short verse.', 100, 0)).toEqual(['Short verse.']);
  });

  it('never cuts mid-word and preserves content (reversible)', () => {
    const text = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.';
    const slides = splitByNearestPunctuation(text, 60, 0);
    expect(slides.length).toBeGreaterThan(2);
    expect(normalize(slides.join(' '))).toBe(normalize(text));
    for (const slide of slides) {
      expect(slide.length).toBeLessThanOrEqual(60);
      expect(slide.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not hard-cap the number of slides (fixes maxSegments=3 bug)', () => {
    const long = 'word '.repeat(200).trim();
    const slides = splitByNearestPunctuation(long, 100, 0);
    expect(slides.length).toBeGreaterThan(3);
    expect(normalize(slides.join(' '))).toBe(normalize(long));
  });
});

describe('splitByLegacyPunctuation', () => {
  it('caps at 3 balanced slides and preserves content (reversible)', () => {
    const text = 'word '.repeat(200).trim();
    const slides = splitByLegacyPunctuation(text, 100, 0);
    expect(slides.length).toBeLessThanOrEqual(3);
    expect(slides.length).toBeGreaterThan(1);
    expect(normalize(slides.join(' '))).toBe(normalize(text));
  });
});

describe('splitByGeometryPunctuation', () => {
  it('produces slides whose estimated lines fit the line budget', () => {
    const text = 'God is our refuge and strength, a very present help in trouble. Therefore will not we fear, though the earth be removed, and though the mountains be carried into the midst of the sea. Though the waters thereof roar and be troubled, though the mountains shake with the swelling thereof.';
    const slides = splitByGeometryPunctuation(text, { charsPerLine: 30, linesCount: 3 });
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides) {
      expect(estimateLines(slide, 30)).toBeLessThanOrEqual(3);
    }
    expect(normalize(slides.join(' '))).toBe(normalize(text));
  });
});

describe('splitByGeometry', () => {
  it('produces slides whose estimated lines fit the line budget', () => {
    const text = 'God is our refuge and strength, a very present help in trouble. Therefore will not we fear, though the earth be removed, and though the mountains be carried into the midst of the sea. Though the waters thereof roar and be troubled, though the mountains shake with the swelling thereof.';
    const slides = splitByGeometry(text, { charsPerLine: 30, linesCount: 3 });
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides) {
      expect(estimateLines(slide, 30)).toBeLessThanOrEqual(3);
    }
    expect(normalize(slides.join(' '))).toBe(normalize(text));
  });

  it('splits a long verse into multiple slides instead of one oversized slide', () => {
    const text = 'word '.repeat(120).trim();
    const geometry = resolveBibleGeometry({ fontSize: 48, primaryViewportHeight: 1080 });
    const slides = splitByGeometry(text, { ...geometry });
    expect(slides.length).toBeGreaterThan(3);
    for (const slide of slides) {
      expect(estimateLines(slide, geometry.charsPerLine)).toBeLessThanOrEqual(geometry.linesCount);
    }
    expect(normalize(slides.join(' '))).toBe(text);
  });

  it('never cuts mid-word in a long single sentence', () => {
    const oneSentence = [...Array(50).keys()].map((i) => 'majesticword'.repeat((i % 3) + 1)).join(' ');
    const slides = splitByGeometry(oneSentence, { charsPerLine: 30, linesCount: 3 });
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides) {
      const head = slide[0];
      const tail = slide[slide.length - 1];
      expect(head).not.toBe(' ');
      expect(tail).not.toBe(' ');
    }
    expect(normalize(slides.join(' '))).toBe(normalize(oneSentence));
  });
});

describe('resolveBibleGeometry', () => {
  it('computes charsPerLine from font size and linesCount from height', () => {
    const geometry = resolveBibleGeometry({ fontSize: 72, primaryViewportHeight: 1080, primaryViewportWidth: 1920 });
    expect(geometry.charsPerLine).toBe(36);
    expect(geometry.linesCount).toBeGreaterThan(0);
  });

  it('caps slide height to maxLines when autosizing is enabled', () => {
    const geometry = resolveBibleGeometry({
      fontSize: 72,
      primaryViewportHeight: 1080,
      primaryViewportWidth: 1920,
      maxLinesEnabled: true,
      maxLines: 3,
    });
    expect(geometry.linesCount).toBe(3);
  });

  it('caps default slide height to 3 lines (aggressive splitting)', () => {
    const geometry = resolveBibleGeometry({ fontSize: 48, primaryViewportHeight: 1080 });
    expect(geometry.linesCount).toBeLessThanOrEqual(3);
    expect(geometry.linesCount).toBeGreaterThan(0);
  });

  it('falls back to sane defaults without output settings', () => {
    const geometry = resolveBibleGeometry({});
    expect(geometry.charsPerLine).toBeGreaterThan(10);
    expect(geometry.linesCount).toBeGreaterThan(0);
  });
});

describe('splitBibleTextIntoSlides dispatcher', () => {
  it('returns single slide when splitting is disabled', () => {
    const text = 'Some long verse '.repeat(30).trim();
    expect(splitBibleTextIntoSlides(text, { splitLongVerses: false })).toEqual([normalize(text)]);
  });

  it('uses nearest-punctuation by default', () => {
    const text = 'word '.repeat(200).trim();
    const slides = splitBibleTextIntoSlides(text, { splitLongVerses: true, maxChars: 100 });
    expect(normalize(slides.join(' '))).toBe(text);
  });

  it('uses geometry method when selected', () => {
    const text = 'word '.repeat(200).trim();
    const slides = splitBibleTextIntoSlides(text, {
      splitLongVerses: true,
      method: BIBLE_SPLIT_METHODS.GEOMETRY,
      geometry: { charsPerLine: 30, linesCount: 3 },
    });
    expect(slides.length).toBeGreaterThan(1);
    expect(normalize(slides.join(' '))).toBe(text);
  });

  it('uses legacy method when selected and preserves the legacy 3-segment cap behaviour', () => {
    const text = 'word '.repeat(200).trim();
    const slides = splitBibleTextIntoSlides(text, {
      splitLongVerses: true,
      method: BIBLE_SPLIT_METHODS.LEGACY,
      maxChars: 100,
    });
    expect(slides.length).toBeLessThanOrEqual(3);
    expect(normalize(slides.join(' '))).toBe(text);
  });

  it('uses legacy-punctuation hybrid when selected (cap at 3, reversible)', () => {
    const text = 'word '.repeat(200).trim();
    const slides = splitBibleTextIntoSlides(text, {
      splitLongVerses: true,
      method: BIBLE_SPLIT_METHODS.LEGACY_PUNCTUATION,
      maxChars: 100,
    });
    expect(slides.length).toBeLessThanOrEqual(3);
    expect(normalize(slides.join(' '))).toBe(text);
  });

  it('uses geometry-punctuation hybrid when selected', () => {
    const text = 'word '.repeat(200).trim();
    const slides = splitBibleTextIntoSlides(text, {
      splitLongVerses: true,
      method: BIBLE_SPLIT_METHODS.GEOMETRY_PUNCTUATION,
      geometry: { charsPerLine: 30, linesCount: 3 },
    });
    expect(slides.length).toBeGreaterThan(1);
    expect(normalize(slides.join(' '))).toBe(text);
  });
});

describe('splitOnSayingBoundary (via dispatcher)', () => {
  const longText = 'And the LORD said unto Moses, saying, Go unto Pharaoh, and say unto him, Thus saith the LORD, Let my people go, that they may serve me. And if thou refuse to let them go, behold, I will smite all thy borders with frogs.';

  it('breaks at "saying," so "saying" is the last word on its slide', () => {
    const slides = splitBibleTextIntoSlides(longText, {
      splitLongVerses: true,
      maxChars: 80,
    });
    expect(slides.length).toBeGreaterThan(1);
    const sayingSlide = slides.find((slide) => /\bsaying\b/i.test(slide));
    expect(sayingSlide).toBeDefined();
    const tailWord = sayingSlide.trim().split(/\s+/).pop().replace(/[,.;:!?]+$/, '');
    expect(tailWord.toLowerCase()).toBe('saying');
  });

  it('preserves content reversibly', () => {
    const slides = splitBibleTextIntoSlides(longText, {
      splitLongVerses: true,
      maxChars: 80,
    });
    expect(normalize(slides.join(' '))).toBe(normalize(longText));
  });

  it('does not introduce a break when the verse fits on one slide', () => {
    const shortText = 'And the LORD said unto Moses, saying, Go unto Pharaoh.';
    const slides = splitBibleTextIntoSlides(shortText, {
      splitLongVerses: true,
      maxChars: 200,
    });
    expect(slides).toEqual([shortText]);
  });

  it('applies across all split methods', () => {
    const methods = [
      BIBLE_SPLIT_METHODS.NEAREST_PUNCTUATION,
      BIBLE_SPLIT_METHODS.LEGACY,
      BIBLE_SPLIT_METHODS.LEGACY_PUNCTUATION,
      BIBLE_SPLIT_METHODS.GEOMETRY,
      BIBLE_SPLIT_METHODS.GEOMETRY_PUNCTUATION,
    ];
    for (const method of methods) {
      const slides = splitBibleTextIntoSlides(longText, {
        splitLongVerses: true,
        method,
        maxChars: 80,
        geometry: { charsPerLine: 30, linesCount: 3 },
      });
      expect(slides.length, `method ${method}`).toBeGreaterThan(1);
      const sayingSlide = slides.find((slide) => /\bsaying\b/i.test(slide));
      expect(sayingSlide, `method ${method}`).toBeDefined();
      const tailWord = sayingSlide.trim().split(/\s+/).pop().replace(/[,.;:!?]+$/, '');
      expect(tailWord.toLowerCase(), `method ${method}`).toBe('saying');
    }
  });

  it('is a no-op for verses without "saying"', () => {
    const text = 'word '.repeat(60).trim();
    const slides = splitBibleTextIntoSlides(text, {
      splitLongVerses: true,
      maxChars: 80,
    });
    expect(normalize(slides.join(' '))).toBe(text);
  });
});