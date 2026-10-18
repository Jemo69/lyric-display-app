// shared/bible/__tests__/mishearings.test.js — the scoped mishearing table
// (Phase 2, decision D5)
//
// This is the highest-risk file in the plan. Getting it wrong does not produce
// an error — it produces a wrong verse on a sanctuary screen, which is the one
// outcome this feature exists to prevent. So the tests here are weighted
// toward the NEGATIVE cases: proving that ordinary English survives.

import { describe, it, expect } from 'vitest';
import {
  MISHEARING_ROWS,
  hasReferenceContext,
  normalizeMishearings,
} from '../mishearings.js';

describe('the regression that defines this table', () => {
  it('leaves ordinary sermon English byte-identical', () => {
    // THE test. FreeShow's table turns this into "we exodus, and it is given,
    // for he is good" because ask -> exodus and for -> four are unconditional.
    const spoken = 'we ask, and it is given, for he is good';
    expect(normalizeMishearings(spoken)).toBe(spoken);
  });

  it.each([
    ['we ask the father', 'ask is one of the most common sermon verbs'],
    ['the job of a pastor', '"job" is an ordinary word AND a name'],
    ['mark the spot', '"mark" is an ordinary verb'],
    ['take note of what I just said about the market', '"market" must never become "mark"'],
    ['she acts wisely', '"acts" is an ordinary plural noun'],
    ['a romance novel', '"romance" is an ordinary noun'],
    ['a palm tree', '"palm" is an ordinary noun'],
    ['he said it forth without thinking', '"forth" is an ordinary word'],
    ['a mat on the floor', '"mat" is an ordinary object'],
    ['good jobs and good works', 'plural forms must survive too'],
  ])('leaves %j untouched (%s)', (spoken) => {
    expect(normalizeMishearings(spoken)).toBe(spoken);
  });

  it('never substitutes across a word boundary', () => {
    // The `(?<!\p{L})` / `(?!\p{L})` guards. Without them "market" -> "matthew".
    const spoken = 'the marketplace was full and the jobs were many';
    expect(normalizeMishearings(spoken)).toBe(spoken);
  });

  it('leaves a sentence with no reference window completely alone', () => {
    // Even the genuinely-diagnostic rows are gated on this path, because
    // normalizeMishearings is called on the WHOLE transcript and most of a
    // sermon is not a reference.
    const spoken = 'and so we continue to study the book together';
    expect(normalizeMishearings(spoken)).toBe(spoken);
  });
});

describe('context-free rows', () => {
  it.each([
    ['genius', 'genesis'],
    ['genes', 'genesis'],
    ['revolutions', 'revelation'],
    ['lamentation', 'lamentations'],
    ['philman', 'philemon'],
    ['collisions', 'colossians'],
    ['habakuk', 'habakkuk'],
    ['zephanias', 'zephaniah'],
  ])('corrects %s -> %s with no reference context', (heard, expected) => {
    const out = normalizeMishearings(`he read from ${heard} today`);
    expect(out).toBe(`he read from ${expected} today`);
  });

  it('does NOT context-free correct an ordinal mishearing', () => {
    // "turds" -> "third" is context-gated, not context-free, because "third" is
    // an ordinary word. Asserted explicitly because it is the row most likely to
    // be "improved" into an unconditional one later — it looks like a safe
    // correction and is not.
    expect(normalizeMishearings('he read from turds today')).toBe('he read from turds today');
    expect(normalizeMishearings('he read from turds today', { referenceWindow: true }))
      .toContain('third');
  });

  it('corrects a diagnostic row even mid-sentence', () => {
    // "genius" is not an English word anyone uses in a sermon, so this is safe
    // to fix regardless of surrounding context.
    const out = normalizeMishearings('he said genius one to a man');
    expect(out).toContain('genesis');
  });
});

describe('context-gated rows', () => {
  it('corrects a book name once a reference is in play', () => {
    const out = normalizeMishearings('he turned to mark chapter eight and read', {
      referenceWindow: true,
    });
    expect(out).toContain('mark');
  });

  it('refuses to correct the same row with no reference window', () => {
    // Same word, same table, opposite outcome — decided purely by context. This
    // pair is the clearest statement of what D5 means.
    expect(normalizeMishearings('mark my words')).toBe('mark my words');
  });

  it('does not fire a context-gated row on ordinary text even by accident', () => {
    // A whole sentence containing a book-ish word and NO digits must be safe.
    // If this fails, the gate is too loose to trust.
    const spoken = 'I asked him about the job and he said it was a good one';
    expect(normalizeMishearings(spoken)).toBe(spoken);
  });
});

describe('hasReferenceContext', () => {
  it('detects a book plus a number', () => {
    expect(hasReferenceContext('he read john 3:16 today')).toBe(true);
    expect(hasReferenceContext('turn to psalm 23')).toBe(true);
    expect(hasReferenceContext('first peter 5 16')).toBe(true);
  });

  it('rejects a book with no number', () => {
    // The digit requirement is load-bearing. Without it, "we ask about job"
    // would satisfy the gate and the ask -> exodus row would fire.
    expect(hasReferenceContext('we ask about job')).toBe(false);
    expect(hasReferenceContext('mark the spot and act on it')).toBe(false);
  });

  it('rejects a number with no book', () => {
    expect(hasReferenceContext('chapter 3 and verse 16')).toBe(false);
  });

  it('rejects ordinary prose', () => {
    expect(hasReferenceContext('and that is really the whole point')).toBe(false);
    expect(hasReferenceContext('')).toBe(false);
  });
});

describe('table hygiene', () => {
  it('gives every row a reason', () => {
    // A table of unexplained mappings is one nobody dares to maintain.
    for (const row of MISHEARING_ROWS) {
      expect(typeof row.why).toBe('string');
      expect(row.why.length).toBeGreaterThan(20);
    }
  });

  it('declares a gate on every row', () => {
    for (const row of MISHEARING_ROWS) {
      expect(typeof row.contextFree).toBe('boolean');
    }
  });

  it('contains no row that would corrupt ordinary English unconditionally', () => {
    // The specific rows removed from FreeShow's table. If any of these ever
    // reappear as context-free, ordinary sermon language starts being rewritten.
    const forbiddenUnconditional = ['ask', 'for', 'cha', 'first', 'second', 'third', 'fourth'];
    for (const form of forbiddenUnconditional) {
      const row = MISHEARING_ROWS.find((candidate) => candidate.heard.includes(form));
      if (row) {
        expect(row.contextFree).toBe(false);
      }
    }
  });

  it('never maps anything onto "exodus" except exodus itself', () => {
    // The single most damaging row in FreeShow's table. It must be impossible
    // to reintroduce by accident.
    for (const row of MISHEARING_ROWS) {
      expect(row.heard).not.toContain('ask');
      if (row.resolved === 'exodus') {
        expect(row.heard).toEqual(['exodus']);
      }
    }
  });

  it('resolves every row to a non-empty string', () => {
    for (const row of MISHEARING_ROWS) {
      expect(row.resolved.length).toBeGreaterThan(0);
      expect(Array.isArray(row.heard)).toBe(true);
      expect(row.heard.length).toBeGreaterThan(0);
    }
  });
});

describe('input handling', () => {
  it('passes through junk without throwing', () => {
    // A normalizer that throws mid-sermon takes the rail down.
    expect(normalizeMishearings(null)).toBe('');
    expect(normalizeMishearings(undefined)).toBe('');
    expect(normalizeMishearings(42)).toBe(42);
  });

  it('is a no-op on empty text', () => {
    expect(normalizeMishearings('')).toBe('');
  });
});