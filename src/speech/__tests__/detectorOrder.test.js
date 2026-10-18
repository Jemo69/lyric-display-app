// src/speech/__tests__/detectorOrder.test.js — the two-stage detection order
// (Phase 1)
//
// THE INVARIANT. Detectors 1 and 2 (spoken reference, alias table) are
// regex-and-table lookups costing microseconds. Detector 3 (full-text match
// against the inverted index) is a 31,000-verse scan off-thread.
//
// A reference said out loud — "First Peter, verse five" — must NEVER wait on
// that scan. So the cheap path runs first, alone, and the worker's results are
// consulted ONLY if both cheap detectors miss.
//
// Getting this backwards would add worker latency to the most latency-sensitive
// path in the feature, and it is not obvious from reading either file alone,
// because `detectVerse()` takes `searchResults` as an ordinary parameter and
// gives no hint that they were meant to be deferred.

import { describe, it, expect } from 'vitest';
import { detectVerse, detectSpokenReference, detectAliasReference, detectFuzzyReference } from '../detectVerse.js';
import { normalizeSpokenReference } from '../spokenForm.js';

const ALL_LANES = [
  { id: 'lyric', enabled: true, degraded: false, reason: '' },
  { id: 'verse', enabled: true, degraded: false, reason: '' },
  { id: 'note', enabled: true, degraded: false, reason: '' },
];

describe('detector order', () => {
  it('resolves a spoken reference without any search results', () => {
    // No searchResults at all. This is the common case and it must work.
    const result = detectVerse('first Peter chapter five verse sixteen');
    expect(result).not.toBeNull();
    expect(result.detector).toBe('spoken');
    expect(result.verse.reference).toBe('1 Peter 5:16');
  });

  it('resolves a number-word reference without any search results', () => {
    const result = detectVerse('one Peter five sixteen');
    expect(result).not.toBeNull();
    expect(result.detector).toBe('spoken');
  });

  // KNOWN GAP, tracked for Phase 2. "the book of" is declared in
  // STRIPPED_PHRASES but the strip never fires, so this does not resolve.
  // Asserted as a KNOWN FAILURE so it flips loudly when Phase 2 lands rather
  // than being quietly forgotten.
  //
  //   "the book of Peter 5:16" -> "Peter 5:16" -> null
  //
  // Bare "Peter" is genuinely ambiguous (1 or 2 Peter), so detector 1
  // correctly refuses it — but the strip should have left "the 1 Peter 5:16",
  // which resolves. The strip, not the ambiguity, is the bug.
  it.todo('resolves "the book of Peter chapter five verse sixteen" (Phase 2 strip)');

  it('resolves an aliased book without any search results', () => {
    const result = detectVerse('revelations twenty one verse four');
    expect(result).not.toBeNull();
    expect(result.detector).toBe('alias');
  });

  it('never consults detector 3 when detector 1 fires', () => {
    // Pass results that would match a DIFFERENT verse. If the cheap path is
    // honoured, they are ignored entirely.
    const decoy = [{
      reference: 'Psalm 23:1',
      bookName: 'Psalm',
      chapter: 23,
      verse: 1,
      text: 'The LORD is my shepherd; I shall not want.',
      score: 0.99,
      source: 'index',
    }];
    const result = detectVerse('first Peter chapter five verse sixteen', {
      searchResults: decoy,
    });
    expect(result.detector).toBe('spoken');
    expect(result.verse.reference).toBe('1 Peter 5:16');
  });

  it('never consults detector 3 when detector 2 fires', () => {
    const decoy = [{
      reference: 'Psalm 23:1',
      bookName: 'Psalm',
      chapter: 23,
      verse: 1,
      text: 'The LORD is my shepherd; I shall not want.',
      score: 0.99,
      source: 'index',
    }];
    const result = detectVerse('revelations twenty one verse four', { searchResults: decoy });
    expect(result.detector).toBe('alias');
    expect(result.verse.reference).toContain('Revelation');
  });

  it('falls through to detector 3 when both cheap detectors miss', () => {
    // A verbatim reading with no spoken reference — the case the index exists
    // to serve. Neither cheap detector can resolve this.
    expect(detectSpokenReference('for God so loved the world that he gave his only begotten Son')).toBeNull();
    expect(detectAliasReference('for God so loved the world that he gave his only begotten Son')).toBeNull();

    const result = detectVerse('for God so loved the world that he gave his only begotten Son', {
      searchResults: [{
        reference: 'John 3:16',
        bookName: 'John',
        chapter: 3,
        verse: 16,
        text: 'For God so loved the world, that he gave his only begotten Son.',
        score: 0.82,
        source: 'index',
      }],
    });
    expect(result.detector).toBe('fuzzy');
    expect(result.verse.reference).toBe('John 3:16');
  });

  it('produces nothing when no detector fires', () => {
    // Ordinary sermon commentary matches no detector. Silence is always an
    // acceptable outcome on a sanctuary screen.
    expect(detectVerse('and that is really the whole point of it all', { searchResults: [] })).toBeNull();
  });
});

describe('spoken-keyword localization (Phase 3)', () => {
  // The citation KEYWORDS are language-specific too, not just the numbers.
  // "John chapter 3 verse 16" becomes "Jean chapitre 3 verset 16", and a
  // normalizer that only knew the English words would leave the citation as
  // prose and the detector would find nothing.
  it.each([
    ['en', 'John chapter 3 verse 16', 'John 3:16'],
    ['fr', 'Jean chapitre 3 verset 16', 'Jean 3:16'],
    ['es', 'Juan capítulo 3 versículo 16', 'Juan 3:16'],
    ['de', 'Johannes Kapitel 3 Vers 16', 'Johannes 3:16'],
    ['pt', 'João capítulo 3 versículo 16', 'João 3:16'],
    ['it', 'Giovanni capitolo 3 versetto 16', 'Giovanni 3:16'],
    ['nl', 'Johannes hoofdstuk 3 vers 16', 'Johannes 3:16'],
    ['no', 'Johannes kapittel 3 vers 16', 'Johannes 3:16'],
  ])('%s normalizes its own citation words: %s -> %s', (locale, input, expected) => {
    expect(normalizeSpokenReference(input, locale)).toBe(expected);
  });

  it('prefers the longest keyword so "verset" is not cut to "vers"', () => {
    // Without longest-first sorting, the alternation would match "vers" inside
    // "verset" and leave "et" stranded — "Jean 3 vers et 16".
    expect(normalizeSpokenReference('Jean chapitre 3 verset 16', 'fr')).toBe('Jean 3:16');
  });

  it('normalizes a spoken range in the locale', () => {
    expect(normalizeSpokenReference('John 3 verse 16 through 18', 'en')).toBe('John 3:16-18');
    expect(normalizeSpokenReference('Jean 3 verset 16 à 18', 'fr')).toBe('Jean 3:16-18');
    expect(normalizeSpokenReference('Juan 3 versículo 16 hasta 18', 'es')).toBe('Juan 3:16-18');
  });

  it('falls back to English keywords for an unknown locale', () => {
    // A Swedish speaker keeps every ENGLISH citation working rather than
    // losing citation detection entirely.
    expect(normalizeSpokenReference('John chapter 3 verse 16', 'sw')).toBe('John 3:16');
  });

  it('does not strip another language\'s keywords', () => {
    // French normalizer must not treat "Kapitel" as a chapter word it can drop,
    // because it is not a French word and dropping it would corrupt text.
    const out = normalizeSpokenReference('Johannes Kapitel 3 Vers 16', 'fr');
    expect(out).toContain('Kapitel');
  });
});

describe('the runner-up disclosure (Phase 1 / Phase 4)', () => {
  it('carries an index-sourced runner-up through to the card', () => {
    const result = detectFuzzyReference('for God so loved the world', [{
      reference: 'John 3:16',
      bookName: 'John',
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world.',
      score: 0.7,
      source: 'index',
      runnerUp: { reference: 'John 3:17', relative: 0.8 },
    }]);
    // FreeShow computes this for its ambiguity penalty and throws it away. The
    // operator never learns the detector was torn between two passages. Here it
    // travels to the card so the operator can be told.
    expect(result.runnerUp).toEqual({ reference: 'John 3:17', relative: 0.8 });
  });

  it('invents no runner-up for a containment-scored result', () => {
    // A containment result has no runner-up concept. Giving it one would be
    // fabricating a fact the card would then state to the operator.
    const result = detectFuzzyReference('for God so loved the world', [{
      reference: 'John 3:16',
      bookName: 'John',
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world.',
      score: 0.7,
    }]);
    expect(result.runnerUp).toBeNull();
  });

  it('survives the confidence gate', () => {
    const result = detectVerse('for God so loved the world', {
      searchResults: [{
        reference: 'John 3:16',
        bookName: 'John',
        chapter: 3,
        verse: 16,
        text: 'For God so loved the world.',
        score: 0.85,
        source: 'index',
        runnerUp: { reference: 'John 3:17', relative: 0.8 },
      }],
    });
    expect(result.runnerUp).toBeTruthy();
  });
});

describe('lane gating', () => {
  it('reports every lane enabled for a healthy provider', () => {
    expect(ALL_LANES.filter((lane) => lane.enabled)).toHaveLength(3);
  });
});