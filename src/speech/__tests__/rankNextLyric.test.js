import { describe, it, expect } from 'vitest';
import { rankNextLyric, lyricTail, lyricLineText } from '../rankNextLyric.js';
import { THRESHOLDS } from '../thresholds.js';

const LYRICS = [
  'Verse 1',
  'Amazing grace how sweet the sound',
  'That saved a wretch like me',
  'Chorus',
  'I once was lost but now am found',
  'Was blind but now I see',
];

describe('lyricTail: the last 8–12 words of the transcript', () => {
  it('takes the last maxWords words', () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`);
    const tail = lyricTail(words.join(' '));
    expect(tail.split(' ')).toHaveLength(THRESHOLDS.lyricTail.maxWords);
    expect(tail.endsWith('w19')).toBe(true);
  });

  it('uses a shorter tail as-is (a fragment narrows, never pads)', () => {
    expect(lyricTail('amazing grace')).toBe('amazing grace');
    expect(lyricTail('')).toBe('');
    expect(lyricTail(null)).toBe('');
  });
});

describe('lyricLineText: strings and both group shapes are searchable', () => {
  it('indexes both parts of a translated group', () => {
    const text = lyricLineText({
      type: 'group',
      mainLine: 'Amazing grace',
      translation: '奇异恩典',
    });
    expect(text).toContain('Amazing grace');
    expect(text).toContain('奇异恩典');
  });

  it('indexes both lines of a normal-group', () => {
    const text = lyricLineText({
      type: 'normal-group',
      line1: 'It was blood',
      line2: 'It was my life',
      displayText: 'It was blood\nIt was my life',
    });
    expect(text).toBe('It was blood It was my life');
  });

  it('falls back to displayText for plain display objects and empty for junk', () => {
    expect(lyricLineText({ displayText: 'Blessed assurance' })).toBe('Blessed assurance');
    expect(lyricLineText('Already a string')).toBe('Already a string');
    expect(lyricLineText(null)).toBe('');
    expect(lyricLineText(42)).toBe('');
  });
});

describe('rankNextLyric', () => {
  it('returns null when nothing in the lyrics resembles the transcript', () => {
    expect(rankNextLyric(LYRICS, 'unrelated mumbling about coffee')).toBeNull();
  });

  it('returns null for an empty transcript or empty lyrics', () => {
    expect(rankNextLyric(LYRICS, '')).toBeNull();
    expect(rankNextLyric([], 'Amazing grace')).toBeNull();
    expect(rankNextLyric(null, 'Amazing grace')).toBeNull();
    expect(rankNextLyric(LYRICS, 'Amazing grace', { selectedIndex: 0 })).not.toBeNull();
  });

  it('finds the current line and proposes the line after the match', () => {
    const result = rankNextLyric(LYRICS, 'that saved a wretch like me', {
      selectedIndex: 3,
    });
    expect(result).not.toBeNull();
    expect(result.current.index).toBe(3);
    expect(result.current.text).toBe('Chorus');
    expect(result.match.index).toBe(2);
    expect(result.next.index).toBe(3);
    expect(result.next.text).toBe('Chorus');
    expect(result.match.confidence).toBeGreaterThanOrEqual(THRESHOLDS.suggestion);
  });

  it('next is null after the last line — never a wrapped-around suggestion', () => {
    const atEnd = rankNextLyric(LYRICS, 'was blind but now i see');
    expect(atEnd.match.index).toBe(5);
    expect(atEnd.next).toBeNull();

    const withSelection = rankNextLyric(LYRICS, 'was blind but now i see', {
      selectedIndex: 5,
    });
    expect(withSelection.current.index).toBe(5);
    expect(withSelection.next).toBeNull();
  });

  it('selectedIndex outside the array behaves like no selection', () => {
    const withSel = rankNextLyric(LYRICS, 'amazing grace', { selectedIndex: 99 });
    const withoutSel = rankNextLyric(LYRICS, 'amazing grace');
    expect(withSel.current).toBeNull();
    expect(withoutSel.current).toBeNull();
    expect(withSel.match.index).toBe(withoutSel.match.index);
    expect(withSel.match.index).toBe(1);
  });

  it('segment confidence multiplies into the score and can suppress it', () => {
    const full = rankNextLyric(LYRICS, 'that saved a wretch like me', {
      segmentConfidence: 1,
    });
    const weak = rankNextLyric(LYRICS, 'that saved a wretch like me', {
      segmentConfidence: 0.7,
    });
    expect(weak).not.toBeNull();
    expect(weak.match.confidence).toBeCloseTo(full.match.confidence * 0.7, 5);
    expect(full.match.confidence).toBeLessThanOrEqual(1);

    // Below the shared floor, no lane is shown at all.
    const hopeless = rankNextLyric(LYRICS, 'that saved a wretch like me', {
      segmentConfidence: 0.5,
    });
    expect(hopeless).toBeNull();
  });

  it('returns up to three matches, best first', () => {
    const lyrics = Array.from({ length: 6 }, () => 'Amazing grace how sweet the sound');
    const result = rankNextLyric(lyrics, 'amazing grace how sweet the sound');
    expect(result.matches).toHaveLength(THRESHOLDS.lyricTail.topK);
    for (const match of result.matches) {
      expect(match.confidence).toBeGreaterThanOrEqual(THRESHOLDS.suggestion);
      expect(typeof match.text).toBe('string');
    }
    expect(result.match).toEqual(result.matches[0]);
  });

  it('a verbatim line outranks a partial overlap', () => {
    const lyrics = ['Amazing grace how sweet the sound', 'Grace upon grace upon grace'];
    const result = rankNextLyric(lyrics, 'Amazing grace how sweet the sound');
    expect(result.match.index).toBe(0);
    expect(result.match.confidence).toBeGreaterThan(0.95);
    expect(result.match.confidence).toBeGreaterThanOrEqual(
      result.matches[result.matches.length - 1].confidence
    );
    // A partial-overlap transcript lands on the other line instead.
    const partial = rankNextLyric(lyrics, 'grace upon grace');
    expect(partial.match.index).toBe(1);
  });

  it('handles translated lyric groups (searches main line and translation)', () => {
    const lyrics = [
      { type: 'group', mainLine: 'Amazing grace how sweet the sound', translation: '奇异恩典何等甘甜' },
      { type: 'group', mainLine: 'That saved a wretch like me', translation: '我罪已得赦免' },
    ];
    const en = rankNextLyric(lyrics, 'that saved a wretch like me');
    expect(en.match.index).toBe(1);
    expect(en.next).toBeNull();

    const zh = rankNextLyric(lyrics, '奇异恩典何等甘甜');
    expect(zh.match.index).toBe(0);
    expect(zh.next.index).toBe(1);
  });

  it('handles normal-group lines via their joined text', () => {
    const lyrics = [
      { type: 'normal-group', line1: 'It was blood', line2: 'It was my life', displayText: 'It was blood\nIt was my life' },
      'Chorus',
    ];
    const result = rankNextLyric(lyrics, 'it was my life');
    expect(result.match.index).toBe(0);
    expect(result.next.index).toBe(1);
  });
});
