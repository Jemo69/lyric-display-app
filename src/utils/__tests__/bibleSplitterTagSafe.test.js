import { describe, it, expect } from 'vitest';
import {
  tokenizeHtml,
  splitHtmlText,
  splitByTagSafe,
  splitByNearestPunctuation,
  splitBibleTextIntoSlides,
  BIBLE_SPLIT_METHODS,
  BIBLE_SPLIT_METHOD_OPTIONS,
  normalizeVerseText,
} from '../bibleSplitter';

const stripTags = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Null when every tag opened in the slide is also closed in it. */
function tagBalanceError(html) {
  const stack = [];
  for (const t of tokenizeHtml(html)) {
    if (t.type !== 'tag' || t.selfClosing || t.comment) continue;
    if (t.closing) {
      const i = stack.lastIndexOf(t.name);
      if (i === -1) return `unmatched closing tag: ${t.name}`;
      stack.splice(i, 1);
    } else {
      stack.push(t.name);
    }
  }
  return stack.length === 0 ? null : `unclosed tags: ${stack.join(', ')}`;
}

const expectValidSlides = (slides) => {
  expect(slides.length).toBeGreaterThan(0);
  for (const slide of slides) {
    expect(tagBalanceError(slide)).toBeNull();
    expect(stripTags(slide).length).toBeGreaterThan(0);
  }
};

// ~180-char red-letter sentence ending at a period, so a 200-char budget
// breaks a two-sentence verse into exactly two slides.
const SENTENCE_1 = 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me. And ye know the way that I go, and ye know it well.';
const SENTENCE_2 = 'Thomas saith unto him, Lord, we know not whither thou goest; and how can we know the way? Believe me that I am in the Father, and the Father in me.';

describe('tokenizeHtml', () => {
  it('splits text and tags, preserving attributes byte-for-byte', () => {
    const tokens = tokenizeHtml('And <span class="wj">Jesus wept</span> with them.');
    expect(tokens).toEqual([
      { type: 'text', value: 'And ' },
      { type: 'tag', html: '<span class="wj">', name: 'span', closing: false, selfClosing: false, comment: false },
      { type: 'text', value: 'Jesus wept' },
      { type: 'tag', html: '</span>', name: 'span', closing: true, selfClosing: false, comment: false },
      { type: 'text', value: ' with them.' },
    ]);
  });

  it('treats void elements and comments as self-contained', () => {
    const tokens = tokenizeHtml('a<br>b<!-- note -->c');
    expect(tokens.map((t) => t.type)).toEqual(['text', 'tag', 'text', 'tag', 'text']);
    expect(tokens[1]).toMatchObject({ name: 'br', selfClosing: true });
    expect(tokens[3]).toMatchObject({ comment: true, selfClosing: true });
  });

  it('leaves a bare < comparison as plain text', () => {
    expect(tokenizeHtml('a < b and c > d')).toEqual([{ type: 'text', value: 'a < b and c > d' }]);
  });

  it('handles nested tags in order', () => {
    const names = tokenizeHtml('<span class="wj"><i>holy</i> words</span>').filter((t) => t.type === 'tag').map((t) => t.html);
    expect(names).toEqual(['<span class="wj">', '<i>', '</i>', '</span>']);
  });
});

describe('splitHtmlText plain-text parity', () => {
  const texts = [
    'Short verse.',
    'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
    'word '.repeat(200).trim(),
    'And the LORD said unto Moses, saying, Go unto Pharaoh, and say unto him, Thus saith the LORD, Let my people go, that they may serve me.',
  ];
  for (const maxChars of [60, 100]) {
    for (const tolerance of [0, 20]) {
      it(`matches nearest-punctuation (maxChars=${maxChars}, tolerance=${tolerance})`, () => {
        for (const text of texts) {
          expect(splitHtmlText(text, maxChars, tolerance)).toEqual(splitByNearestPunctuation(text, maxChars, tolerance));
          expect(splitByTagSafe(text, maxChars, tolerance)).toEqual(splitByNearestPunctuation(text, maxChars, tolerance));
        }
      });
    }
  }
});

describe('splitHtmlText with Words-of-Christ spans', () => {
  const redLetterVerse = `<span class="wj">${SENTENCE_1} ${SENTENCE_2}</span>`;
  const visible = normalizeVerseText(`${SENTENCE_1} ${SENTENCE_2}`);

  it('acceptance: ~400-char red-letter verse splits into two slides of valid HTML', () => {
    expect(visible.length).toBeGreaterThan(300);
    const slides = splitHtmlText(redLetterVerse, 200, 0);
    expect(slides.length).toBe(2);
    expectValidSlides(slides);
    // Styling intact on both slides.
    expect(slides[0]).toContain('<span class="wj">');
    expect(slides[0]).toContain('</span>');
    expect(slides[1]).toContain('<span class="wj">');
    expect(slides[1]).toContain('</span>');
    // No content lost or reordered.
    expect(stripTags(slides.join(' '))).toBe(visible);
  });

  it('auto-closes at the slide end and auto-reopens on the next slide', () => {
    const slides = splitHtmlText(redLetterVerse, 200, 0);
    expect(slides[0].trimEnd().endsWith('</span>')).toBe(true);
    expect(slides[1].startsWith('<span class="wj">')).toBe(true);
  });

  it('keeps a short red-letter verse on a single slide, unchanged', () => {
    const short = '<span class="wj">Jesus wept.</span>';
    expect(splitHtmlText(short, 200, 0)).toEqual([normalizeVerseText(short)]);
  });
});

describe('splitHtmlText with nested tags and italics', () => {
  it('keeps nested spans balanced when the break lands inside them', () => {
    const html = `<span class="wj">${SENTENCE_1} <i>${SENTENCE_2}</i></span>`;
    const slides = splitHtmlText(html, 200, 0);
    expect(slides.length).toBe(2);
    expectValidSlides(slides);
    expect(slides[1]).toContain('<span class="wj">');
    expect(slides[1]).toContain('<i>');
    expect(stripTags(slides.join(' '))).toBe(normalizeVerseText(`${SENTENCE_1} ${SENTENCE_2}`));
  });

  it('preserves italics split across slides', () => {
    const italicBody = `${'Very truly I tell you, whoever hears my word and believes him. '.repeat(4).trim()}`;
    const html = `So Jesus said, <i>${italicBody}</i> Amen.`;
    const slides = splitHtmlText(html, 120, 0);
    expect(slides.length).toBeGreaterThan(1);
    expectValidSlides(slides);
    expect(stripTags(slides.join(' '))).toBe(stripTags(normalizeVerseText(html)));
    const italicSlides = slides.filter((s) => s.includes('<i>'));
    expect(italicSlides.length).toBeGreaterThan(0);
  });
});

describe('splitByTagSafe dispatcher wiring', () => {
  it('is registered as a selectable method', () => {
    expect(BIBLE_SPLIT_METHODS.TAG_SAFE).toBe('tag-safe');
    expect(BIBLE_SPLIT_METHOD_OPTIONS.some((o) => o.id === 'tag-safe')).toBe(true);
  });

  it('matches the default method for plain text through the dispatcher', () => {
    const text = 'And the LORD said unto Moses, saying, Go unto Pharaoh, and say unto him, Thus saith the LORD, Let my people go, that they may serve me. And if thou refuse to let them go, behold, I will smite all thy borders with frogs.';
    const expected = splitBibleTextIntoSlides(text, { splitLongVerses: true, maxChars: 80 });
    const actual = splitBibleTextIntoSlides(text, {
      splitLongVerses: true,
      method: BIBLE_SPLIT_METHODS.TAG_SAFE,
      maxChars: 80,
    });
    expect(actual).toEqual(expected);
  });

  it('splits tagged verses into balanced slides through the dispatcher', () => {
    const html = `<span class="wj">${SENTENCE_1} ${SENTENCE_2}</span>`;
    const slides = splitBibleTextIntoSlides(html, {
      splitLongVerses: true,
      method: BIBLE_SPLIT_METHODS.TAG_SAFE,
      maxChars: 200,
    });
    expect(slides.length).toBe(2);
    expectValidSlides(slides);
  });

  it('applies the saying boundary without breaking tags', () => {
    const html = `<span class="wj">And the LORD spake unto Moses in the wilderness of Sinai, saying, Number the children of Israel after their families, by the house of their fathers, with the number of their names, every male by their polls.</span>`;
    const slides = splitBibleTextIntoSlides(html, {
      splitLongVerses: true,
      method: BIBLE_SPLIT_METHODS.TAG_SAFE,
      maxChars: 100,
    });
    expect(slides.length).toBeGreaterThan(1);
    expectValidSlides(slides);
    const sayingSlide = slides.find((s) => /\bsaying\b/i.test(stripTags(s)));
    expect(sayingSlide).toBeDefined();
    const tailWord = stripTags(sayingSlide).split(/\s+/).pop().replace(/[,.;:!?]+$/, '');
    expect(tailWord.toLowerCase()).toBe('saying');
  });

  it('returns a single slide when splitting is disabled', () => {
    const html = `<span class="wj">${SENTENCE_1} ${SENTENCE_2}</span>`;
    expect(
      splitBibleTextIntoSlides(html, { splitLongVerses: false, method: BIBLE_SPLIT_METHODS.TAG_SAFE })
    ).toEqual([normalizeVerseText(html)]);
  });
});
