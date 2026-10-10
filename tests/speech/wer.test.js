/**
 * WER is the benchmark's primary sort key, so plan 14 requires it "tested
 * against hand-computed cases: perfect match, substitutions, insertions,
 * deletions, empty hypothesis" — because "the benchmark's primary sort key has
 * to be provably right or every conclusion drawn from it is wrong".
 */
import { describe, it, expect } from 'vitest';
import { levenshtein, words, wer, werDetail } from '../../shared/wer.js';
import { levenshteinDistance } from '../../main/lyricsProviders/searchAlgorithm.js';

describe('levenshtein', () => {
  it('is 0 for identical input', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein(['a', 'b'], ['a', 'b'])).toBe(0);
  });

  it('is the length difference when one side is empty', () => {
    expect(levenshtein('', 'abcd')).toBe(4);
    expect(levenshtein('abcd', '')).toBe(4);
  });

  it('counts a substitution as one edit', () => {
    expect(levenshtein('cat', 'cut')).toBe(1);
    expect(levenshtein('cat', 'dog')).toBe(3);
  });

  it('counts insert and delete as one edit each', () => {
    expect(levenshtein('cat', 'cart')).toBe(1); // insertion
    expect(levenshtein('cart', 'cat')).toBe(1); // deletion
  });

  it('is symmetric — the shorter string is not penalised', () => {
    const pairs = [
      ['kitten', 'sitting'],
      ['flaw', 'lawn'],
      ['saturday', 'sunday'],
      ['', 'xyz'],
      ['a', 'abcdefghij'],
    ];
    for (const [a, b] of pairs) {
      expect(levenshtein(a, b), `${a} vs ${b}`).toBe(levenshtein(b, a));
    }
  });

  it('agrees with the extracted lyric-search original on close strings', () => {
    // The regression that matters for extracting it: the shared version is
    // exact, the original clamps at maxDistance, so they must agree for every
    // pair the ORIGINAL could actually answer. If this drifts, lyric search
    // behaviour changes silently.
    const pairs = [
      ['', ''],
      ['a', ''],
      ['', 'b'],
      ['lyrics', 'lyric'],
      ['praise', 'praised'],
      ['amen', 'amen'],
      ['hallelujah', 'hallelujah!'],
      ['jesus', 'joshua'],
    ];
    for (const [a, b] of pairs) {
      expect(levenshtein(a, b), `${a} vs ${b}`).toBe(levenshteinDistance(a, b, 10));
    }
  });

  it('does NOT clamp — a measured WER must not stop counting', () => {
    // The original returns maxDistance+1 here. A WER that stopped counting would
    // understate a bad transcript, which is exactly the case an operator needs
    // the truth about.
    expect(levenshtein('a'.repeat(50), 'b'.repeat(50))).toBe(50);
    expect(levenshteinDistance('a'.repeat(50), 'b'.repeat(50), 10)).toBe(11);
  });
});

describe('words', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(words('  Hello,   WORLD!  ')).toEqual(['hello', 'world']);
    expect(words('one\ttwo\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('keeps accented and non-Latin words whole', () => {
    expect(words('café naïve')).toEqual(['café', 'naïve']);
    expect(words('你好 世界')).toEqual(['你好', '世界']);
  });

  it('returns an empty array for empty or punctuation-only input', () => {
    expect(words('')).toEqual([]);
    expect(words('   ')).toEqual([]);
    expect(words('...!!!')).toEqual([]);
    expect(words(null)).toEqual([]);
  });
});

describe('wer — hand-computed cases', () => {
  it('a perfect match is 0', () => {
    expect(wer('the lord is my shepherd', 'the lord is my shepherd')).toBe(0);
    // Case and punctuation must not create phantom errors.
    expect(wer('The Lord is my shepherd!', 'the lord is my shepherd')).toBe(0);
  });

  // The reference below is FIVE words ("the lord is my shepherd"), so one edit
  // is 1/5 = 0.2, not 0.25. The denominator is the reference word count — the
  // whole point of the metric — so it is stated rather than guessed.
  it('one substitution in five reference words is 0.2', () => {
    expect(wer('the lord is thy shepherd', 'the lord is my shepherd')).toBeCloseTo(0.2, 10);
  });

  it('one deletion in five reference words is 0.2', () => {
    expect(wer('lord is my shepherd', 'the lord is my shepherd')).toBeCloseTo(0.2, 10);
  });

  it('one insertion in five reference words is 0.2', () => {
    expect(wer('the lord is my own shepherd', 'the lord is my shepherd')).toBeCloseTo(0.2, 10);
  });

  it('five substitutions in five reference words is 1.0', () => {
    // No word survives, so every reference word is a substitution — not a
    // deletion. Getting S vs D attribution right is what makes the breakdown
    // useful, so this pins it rather than only the ratio.
    const detail = werDetail('completely different words here now', 'the lord is my shepherd');
    expect(detail.substitutions).toBe(5);
    expect(detail.deletions).toBe(0);
    expect(detail.wer).toBeCloseTo(1, 10);
  });

  it('attributes the edit types separately', () => {
    const detail = werDetail('the lord is my shepherd', 'the lord is my shepherd');
    expect(detail).toMatchObject({ substitutions: 0, deletions: 0, insertions: 0, referenceWords: 5 });

    const substituted = werDetail('the lord is thy shepherd', 'the lord is my shepherd');
    expect(substituted.substitutions).toBe(1);
    expect(substituted.deletions).toBe(0);
    expect(substituted.insertions).toBe(0);
  });

  it('counts a word truncated off the end as deletions, not substitutions', () => {
    // The failure mode worth seeing: an engine that cuts words off the end
    // should read as deletions, which is a different bug from mishearing.
    const detail = werDetail('the lord is my', 'the lord is my shepherd');
    expect(detail.deletions).toBe(1);
    expect(detail.substitutions).toBe(0);
    expect(detail.wer).toBeCloseTo(1 / 5, 10);
  });

  it('an empty hypothesis against a real reference is total failure, not 0', () => {
    // Division by zero here would report a flawless transcript for an engine
    // that said nothing at all.
    const detail = werDetail('', 'the lord is my shepherd');
    expect(detail.deletions).toBe(5); // all five reference words
    expect(detail.substitutions).toBe(0);
    expect(detail.wer).toBe(1);
  });

  it('an empty reference returns Infinity rather than a flattering number', () => {
    expect(wer('anything at all', '')).toBe(Infinity);
    expect(wer('', '')).toBe(Infinity);
  });

  it('extra output beyond the reference counts as insertions', () => {
    const detail = werDetail('the lord is my shepherd and also something else', 'the lord is my shepherd');
    expect(detail.insertions).toBe(4); // "and also something else"
    expect(detail.deletions).toBe(0);
    expect(detail.wer).toBeCloseTo(4 / 5, 10);
  });

  it('is always in the range 0..Infinity and never NaN', () => {
    const cases = [
      ['', ''],
      ['', 'a b c'],
      ['a b c', ''],
      ['a b c', 'a b c'],
      ['x y z', 'a b c'],
      ['!!!', 'the lord'],
    ];
    for (const [hyp, ref] of cases) {
      const value = wer(hyp, ref);
      expect(Number.isNaN(value), `${hyp} vs ${ref} produced NaN`).toBe(false);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('normalisation is symmetric — scoring does not depend on argument order', () => {
    const cases = [
      ['The Lord, my shepherd!', 'the lord my shepherd'],
      ['praise the lord', 'Praise the Lord'],
    ];
    for (const [a, b] of cases) {
      expect(werDetail(a, b).substitutions + werDetail(a, b).deletions + werDetail(a, b).insertions).toBe(
        werDetail(b, a).substitutions + werDetail(b, a).deletions + werDetail(b, a).insertions
      );
    }
  });
});
