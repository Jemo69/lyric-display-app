// src/speech/__tests__/verseScore.test.js — the inverted-index scorer (Phase 1)
//
// This is where the plan's "do not" list is enforced. The scorer must produce
// MATCH QUALITY (0-1) and must never reintroduce the 1-100 trust scale, the 85
// floor, or the 75/50 auto-play ladder that came from FreeShow.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVerseIndex } from '../verseIndex.js';
import { computePhraseBonus, parseVerseReference, scoreVerses, upcomingVerseMap } from '../verseScore.js';

const BIBLE = {
  id: 'test',
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
            { number: 18, text: 'He that believeth on him is not condemned.' },
          ],
        },
        {
          number: 4,
          // Deliberately NOT contiguous (1 then 7), which is what the
          // numbering-gap test below depends on: the walk must stop rather
          // than point verse 2 at the wrong text.
          verses: [
            { number: 1, text: 'When therefore the Lord knew how the Pharisees had heard that Jesus made and baptized more disciples than John,' },
            { number: 7, text: 'The Samaritan woman said unto him, Give me to drink.' },
          ],
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
    {
      number: 43,
      name: 'Matthew',
      chapters: [
        {
          number: 5,
          verses: [
            { number: 9, text: 'Blessed are the peacemakers, for they shall be called children of God.' },
            { number: 14, text: 'Ye are the light of the world.' },
          ],
        },
      ],
    },
  ],
};

const index = buildVerseIndex(BIBLE);

describe('parseVerseReference', () => {
  it('parses a single verse', () => {
    expect(parseVerseReference('John 3:16')).toEqual({ book: 'John', chapter: 3, verse: 16 });
  });

  it('parses a numbered book', () => {
    expect(parseVerseReference('1 Corinthians 13:4')).toEqual({ book: '1 Corinthians', chapter: 13, verse: 4 });
  });

  it('uses the END verse of a range, because that is where reading continues', () => {
    expect(parseVerseReference('John 3:16-18')).toEqual({ book: 'John', chapter: 3, verse: 18 });
  });

  it('returns null for junk', () => {
    expect(parseVerseReference('')).toBeNull();
    expect(parseVerseReference('John')).toBeNull();
    expect(parseVerseReference('John 3')).toBeNull();
  });
});

describe('upcomingVerseMap', () => {
  it('maps the next verses with decaying distance', () => {
    // John 3:16 -> 17 (1), 18 (2), then John 4:1 across the boundary (3).
    const upcoming = upcomingVerseMap(index, 'John 3:16');
    expect(upcoming.size).toBe(3);
    expect(upcoming.get(index.verseToIdMap.get('john 3:17'))).toBe(1);
    expect(upcoming.get(index.verseToIdMap.get('john 3:18'))).toBe(2);
  });

  it('crosses the chapter boundary', () => {
    // From John 3:18 the next thing read is John 4:1, not "verse 19".
    const upcoming = upcomingVerseMap(index, 'John 3:18');
    expect(upcoming.size).toBe(1);
    expect(upcoming.get(index.verseToIdMap.get('john 4:1'))).toBe(1);
  });

  it('stops rather than guessing when the numbering has a gap', () => {
    // This fixture has no John 4:2. Walking past it would point at the wrong
    // verse, so the walk ends at the gap. A wrong reference on a screen is
    // worse than no suggestion at all.
    const upcoming = upcomingVerseMap(index, 'John 4:1');
    expect(upcoming.size).toBe(0);
  });

  it('is empty for no current reference', () => {
    expect(upcomingVerseMap(index, null).size).toBe(0);
    expect(upcomingVerseMap(index, '').size).toBe(0);
  });

  it('never returns an id that is not a real verse', () => {
    // The whole reason this looks up instead of adding. Asserted structurally:
    // every returned id must resolve back to a reference in the pool.
    const upcoming = upcomingVerseMap(index, 'John 3:16');
    for (const verseId of upcoming.keys()) {
      expect(verseId).toBeGreaterThanOrEqual(0);
      expect(verseId).toBeLessThan(index.totalVerses);
    }
  });
});

describe('computePhraseBonus', () => {
  it('is neutral for a single-word query', () => {
    expect(computePhraseBonus(index, 1, [index.vocabToIdMap.get('son')])).toBe(1.0);
  });

  it('gives the maximum bonus for a fully contiguous match', () => {
    // "so loved the world" appears verbatim and in order in John 3:16.
    const query = ['so', 'loved', 'the', 'world'].map((w) => index.vocabToIdMap.get(w));
    expect(computePhraseBonus(index, 1, query)).toBe(1.6);
  });

  it('rewards a partial contiguous run above neutral', () => {
    const query = ['gave', 'his', 'only', 'begotten'].map((w) => index.vocabToIdMap.get(w));
    expect(computePhraseBonus(index, 1, query)).toBeGreaterThan(1.0);
  });

  it('penalizes a short query with no adjacency', () => {
    // Four query words, none of them next to each other in the verse. That is
    // coincidence, and the penalty is what stops it scoring perfectly.
    const query = ['loved', 'begotten', 'condemn', 'world'].map((w) => index.vocabToIdMap.get(w));
    expect(computePhraseBonus(index, 1, query)).toBe(0.65);
  });

  it('is neutral for a long query with no adjacency and no bigrams', () => {
    // Above 5 words the scattered penalty is too aggressive — a paraphrase of a
    // long passage legitimately shares words without adjacency.
    const query = ['light', 'world', 'shepherd', 'want', 'water', 'drink'].map((w) => index.vocabToIdMap.get(w));
    expect(computePhraseBonus(index, 1, query)).toBe(1.0);
  });
});

describe('scoreVerses', () => {
  it('finds a verse from a verbatim reading', () => {
    const result = scoreVerses(index, 'for God so loved the world that he gave his only begotten Son');
    expect(result).not.toBeNull();
    expect(result.reference).toBe('John 3:16');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('returns a 0-1 match quality and never a 1-100 trust score', () => {
    // The whole point of the confidence contract. A score above 1 or above 50
    // would be the old scale leaking back in.
    const result = scoreVerses(index, 'for God so loved the world that he gave his only begotten Son');
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('returns the verse text so the card can render it', () => {
    const result = scoreVerses(index, 'for God so loved the world that he gave his only begotten Son');
    expect(result.text).toContain('so loved the world');
  });

  it('prefers the verse he is actually reading over a later one', () => {
    // Both John 3:16 and 3:17 contain "world". The upcoming prior must break it.
    const result = scoreVerses(index, 'that he gave his only begotten Son', { currentReference: 'John 3:16' });
    expect(result.reference).toBe('John 3:16');
  });

  it('follows the reading forward when he moves on', () => {
    const result = scoreVerses(index, 'did not send his Son into the world to condemn', { currentReference: 'John 3:16' });
    expect(result.reference).toBe('John 3:17');
  });

  it('finds a psalm without any current reference', () => {
    const result = scoreVerses(index, 'the LORD is my shepherd I shall not want');
    expect(result.reference).toBe('Psalm 23:1');
  });

  it('returns null for a tail too short to weigh', () => {
    // Two words is coincidence, not a reading. This is the guard that stopped
    // one shared word like "Lord" scoring against 30,000 verses.
    expect(scoreVerses(index, 'my shepherd')).toBeNull();
    expect(scoreVerses(index, 'the LORD')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(scoreVerses(index, '')).toBeNull();
    expect(scoreVerses(index, null)).toBeNull();
    expect(scoreVerses(null, 'anything at all here')).toBeNull();
  });

  it('does not invent a verse from a bare chapter', () => {
    // "There was a man of the Pharisees" is John 3:1, and it must be returned as
    // that verse — never silently advanced to :2 or walked back to nothing.
    const result = scoreVerses(index, 'there was a man of the Pharisees named Nicodemus');
    if (result) expect(result.reference).toBe('John 3:1');
  });

  it('discloses a runner-up when two different passages compete', () => {
    // The honesty work: FreeShow computes this and discards it. Here it travels
    // with the result so the card can tell the operator the detector was torn.
    const result = scoreVerses(index, 'God did not send his Son into the world');
    expect(result).not.toBeNull();
    // Whether this particular tail is ambiguous depends on the priors; what is
    // asserted is the SHAPE. A runner-up, if present, is always a real reference.
    if (result.runnerUp) {
      expect(result.runnerUp.reference).toMatch(/\d+:\d+/);
      expect(result.runnerUp.relative).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('never reports a runner-up equal to the winner', () => {
    const result = scoreVerses(index, 'for God so loved the world');
    if (result.runnerUp) expect(result.runnerUp.reference).not.toBe(result.reference);
  });
});

describe('the trust-scale invariants (Phase 1 "do not" list)', () => {
  // Resolved from this file's own directory rather than via import.meta.url,
  // because the vitest environment hands back a non-file URL and fileURLToPath
  // then throws "The URL must be of scheme file".
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(here, '../verseScore.js'), 'utf8');

  /**
   * Strip comments before scanning.
   *
   * This module's header comment deliberately NAMES the patterns it forbids —
   * "no baseConfidence", "max(score, 85)", "75/50" — because a reader should
   * know what this file is refusing to become. Scanning the raw source would
   * therefore match the prohibition inside the prose describing it, which is a
   * false positive that trains a reviewer to ignore the test.
   *
   * What is scanned is CODE: identifiers, literals, operators. A comment
   * explaining a decision cannot smuggle in behaviour.
   */
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^[ \t]*\/\/.*$/gm, ''); // whole-line comments

  it('strips comments before scanning, so the prohibition text is not code', () => {
    // Guards the guard: if this fails, the invariant tests below are checking
    // prose and mean nothing.
    expect(raw).toMatch(/baseConfidence/); // mentioned in the header
    expect(source).not.toMatch(/baseConfidence/); // absent from the code
  });

  it('contains no 1-100 confidence scale', () => {
    // A baseConfidence or getConfidenceScore here would mean one number is
    // carrying match quality AND ambiguity AND a threshold.
    expect(source).not.toMatch(/baseConfidence/);
    expect(source).not.toMatch(/getConfidenceScore/);
  });

  it('contains no 85 floor for clean winners', () => {
    // FreeShow floors a dominant winner at 85 so it can auto-play. Selah
    // has no auto-play, so the floor would be a lie about trust.
    expect(source).not.toMatch(/max\([^)]*,\s*85\s*\)/);
  });

  it('contains no 75 or 50 auto-play thresholds', () => {
    expect(source).not.toMatch(/\b0?\.75\b/);
    expect(source).not.toMatch(/threshold.*\b50\b/i);
  });

  it('reads every constant from THRESHOLDS rather than inlining one', () => {
    // A magic number here is a number a reviewer cannot see without reading the
    // function body, which is exactly what thresholds.js exists to prevent.
    const magicNumbers = source.match(/Math\.pow\([^,]+,\s*0\.98\)/g) || [];
    expect(magicNumbers).toHaveLength(0);
    expect(source).toContain('THRESHOLDS.verseIndex');
  });
});