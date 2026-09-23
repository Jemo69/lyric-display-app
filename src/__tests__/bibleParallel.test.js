import { describe, it, expect } from 'vitest';
import {
  buildOffsetId,
  resolveVersificationOffset,
  applyVersificationOffset,
  buildTraditionPsalmOffsets,
  isLinkedPair,
  getPairedReference,
  normalizePairInput,
  getParallelVerseText,
  zipParallelSlides,
  sanitizeParallelPayload,
  normalizeParallelLayout,
  DEFAULT_VERSIFICATION_OFFSETS,
  DEFAULT_PARALLEL_LAYOUT,
} from '../utils/bibleParallel.js';

const esBible = {
  id: 'es',
  name: 'RVR1960',
  books: [{
    number: 1,
    name: 'Génesis',
    chapters: [{
      number: 1,
      verses: [
        { number: 1, text: 'ES uno' },
        { number: 2, text: 'ES dos' },
        { number: 3, text: 'ES tres' },
      ],
    }],
  }],
};

const reference = { id: 'kjv', book: 1, chapters: ['1'], verses: [[1]] };

describe('bibleParallel offset table', () => {
  it('builds offsetIds as `${bibleId}-${book}-${chapter}`', () => {
    expect(buildOffsetId('es', 19, '51')).toBe('es-19-51');
  });

  it('resolves 0 by default and ships empty defaults', () => {
    expect(DEFAULT_VERSIFICATION_OFFSETS).toEqual({});
    expect(resolveVersificationOffset(undefined, 'es', 1, '1')).toBe(0);
    expect(resolveVersificationOffset({}, 'es', 1, '1')).toBe(0);
  });

  it('resolves integer overrides and ignores junk', () => {
    const offsets = { 'es-1-1': 1, 'es-19-51': -1, 'es-1-2': 'x' };
    expect(resolveVersificationOffset(offsets, 'es', 1, '1')).toBe(1);
    expect(resolveVersificationOffset(offsets, 'es', 19, '51')).toBe(-1);
    expect(resolveVersificationOffset(offsets, 'es', 1, '2')).toBe(0);
    expect(resolveVersificationOffset(offsets, 'es', 2, '1')).toBe(0);
  });

  it('clamps shifted verses to >= 1 and drops non-integers', () => {
    expect(applyVersificationOffset([1, 2], 1)).toEqual([2, 3]);
    expect(applyVersificationOffset([1, 2], -1)).toEqual([1, 1]);
    expect(applyVersificationOffset([1, 'x', null], 0)).toEqual([1]);
    expect(applyVersificationOffset([], 5)).toEqual([]);
  });

  it('namespaces tradition Psalm shifts per bible id', () => {
    expect(buildTraditionPsalmOffsets('es', { '19-51': -1, '19-9': 0 })).toEqual({ 'es-19-51': -1 });
    expect(buildTraditionPsalmOffsets('', { '19-51': -1 })).toEqual({});
  });
});

describe('bibleParallel pairing', () => {
  it('detects linked pairs only when both halves exist', () => {
    expect(isLinkedPair(reference, 'es')).toBe(true);
    expect(isLinkedPair(reference, null)).toBe(false);
    expect(isLinkedPair(null, 'es')).toBe(false);
  });

  it('exposes a pair view without mutating the single reference', () => {
    const pair = getPairedReference(reference, 'es');
    expect(pair.primary).toBe(reference);
    expect(pair.secondary).toEqual({ bibleId: 'es', book: 1, chapters: ['1'], verses: [[1]] });
    expect(getPairedReference(reference, null)).toBeNull();
  });

  it('normalizes single references and {primary, secondary} pairs', () => {
    expect(normalizePairInput(reference, 'es')).toEqual({ reference, linkedBibleId: 'es' });
    const pair = { primary: reference, secondary: { bibleId: 'es' } };
    expect(normalizePairInput(pair, null)).toEqual({ reference, linkedBibleId: 'es' });
    const byName = { primary: reference, secondary: { bible: 'es' } };
    expect(normalizePairInput(byName, null)).toEqual({ reference, linkedBibleId: 'es' });
  });

  it('reads the same passage from the secondary bible', () => {
    expect(getParallelVerseText(esBible, 'es', reference, [[1]], {})).toBe('ES uno');
  });

  it('applies the versification offset before lookup', () => {
    // Psalm-style divergence: secondary verse 1 lives at primary verse 2.
    expect(getParallelVerseText(esBible, 'es', reference, [[1]], { 'es-1-1': 1 })).toBe('ES dos');
  });

  it('returns empty when the secondary bible or reference is missing', () => {
    expect(getParallelVerseText(null, 'es', reference, [[1]], {})).toBe('');
    expect(getParallelVerseText(esBible, 'es', null, [[1]], {})).toBe('');
  });
});

describe('bibleParallel slides + payload', () => {
  it('zips slides by index, pairing extras with null', () => {
    expect(zipParallelSlides(['a', 'b'], ['x'])).toEqual([
      { primary: 'a', secondary: 'x' },
      { primary: 'b', secondary: null },
    ]);
    expect(zipParallelSlides([], [])).toEqual([]);
  });

  it('sanitizes the socket secondary field and never throws', () => {
    const clean = sanitizeParallelPayload({ bible: 'RVR1960', text: 't', fullText: 'f', slides: ['s1', '  ', 's2'] });
    expect(clean).toEqual({ bible: 'RVR1960', text: 't', fullText: 'f', slides: ['s1', 's2'] });
    expect(sanitizeParallelPayload(null)).toBeNull();
    expect(sanitizeParallelPayload('nope')).toBeNull();
    expect(sanitizeParallelPayload({})).toBeNull();
    expect(sanitizeParallelPayload(undefined)).toBeNull();
  });

  it('normalizes layouts with a side-by-side default', () => {
    expect(DEFAULT_PARALLEL_LAYOUT).toBe('side-by-side');
    expect(normalizeParallelLayout('stacked')).toBe('stacked');
    expect(normalizeParallelLayout('side-by-side')).toBe('side-by-side');
    expect(normalizeParallelLayout('diagonal')).toBe('side-by-side');
    expect(normalizeParallelLayout(undefined)).toBe('side-by-side');
  });
});
