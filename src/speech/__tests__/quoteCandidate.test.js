/**
 * src/speech/__tests__/quoteCandidate.test.js — the quote lane's classifier
 * (Phase 7)
 *
 * The classifier reads a pastor's words and proposes a note. Its failure modes
 * are therefore the ordinary failure modes of a hallucinating model, and every
 * test below is one of them:
 *
 *   - it invents a quote that was never said
 *   - it launders a Bible citation into a "takeaway"
 *   - it returns a confident quote from a fragment
 *   - it produces malformed output and the app renders it anyway
 *
 * The other half is structural: this lane must be incapable of producing
 * anything that reaches an output window.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUOTE_ALLOWED_TYPES,
  QUOTE_MAX_WORDS,
  QUOTE_MIN_CONFIDENCE,
  QUOTE_MIN_WORDS,
  QUOTE_SYSTEM_PROMPT,
  looksLikeCitation,
  parseQuoteResponse,
  validateQuoteResponse,
} from '../quoteCandidate.js';
import { textOverlapScore } from '../verseCorpus.js';

const GOOD = 'God does not want your religion, he wants your faith';

describe('validateQuoteResponse — the happy path', () => {
  it('accepts a real, self-contained takeaway', () => {
    const result = validateQuoteResponse({ type: 'quote', content: GOOD, confidence: 90 });
    expect(result).toEqual({ type: 'quote', content: GOOD, confidence: 90 });
  });

  it('trims surrounding whitespace', () => {
    const result = validateQuoteResponse({ type: 'quote', content: `  ${GOOD}  `, confidence: 90 });
    expect(result.content).toBe(GOOD);
  });

  it('rounds a float confidence rather than rejecting it', () => {
    const result = validateQuoteResponse({ type: 'quote', content: GOOD, confidence: 87.6 });
    expect(result.confidence).toBe(88);
  });

  it('accepts an announcement', () => {
    const result = validateQuoteResponse({
      type: 'announcement',
      content: 'Prayer meeting tonight at seven in the fellowship hall',
      confidence: 85,
    });
    expect(result.type).toBe('announcement');
  });
});

describe('"empty" is a correct answer, not a failure', () => {
  it('accepts empty with no content', () => {
    // Returning nothing costs the operator nothing. Returning a fabricated
    // quote costs them a note they did not make. These are not equal outcomes.
    expect(validateQuoteResponse({ type: 'empty', content: '', confidence: 0 }))
      .toEqual({ type: 'empty', content: '', confidence: 0 });
  });

  it('rejects "empty" that carries text', () => {
    // The schema rule FreeShow states and this enforces: "empty" with content is
    // a rejection the model failed to strip, and stripping it ourselves would
    // mean guessing which part was the rejection.
    expect(validateQuoteResponse({ type: 'empty', content: 'something', confidence: 0 })).toBeNull();
  });
});

describe('a citation is never a quote', () => {
  // The four that NAME a reference. `looksLikeCitation` catches these on shape.
  it.each([
    'John 3:16 says that God so loved the world',
    'The book of Romans chapter eight is about the Spirit',
    'Psalm 23 tells us the Lord is my shepherd',
    'We read verse 16 of John 3 this morning',
  ])('refuses %j', (content) => {
    // The structural half of the anchor rule. The prompt asks nicely; this
    // refuses regardless of what the model said.
    expect(validateQuoteResponse({ type: 'quote', content, confidence: 95 })).toBeNull();
  });

  it('detects a citation shape conservatively', () => {
    expect(looksLikeCitation('John 3:16')).toBe(true);
    expect(looksLikeCitation('Romans chapter 8')).toBe(true);
    expect(looksLikeCitation('The Bible says this')).toBe(false);
    expect(looksLikeCitation('God does not want your religion')).toBe(false);
  });

  it('cannot shape-detect scripture quoted WITHOUT its reference', () => {
    // Stated plainly because it is a real limitation of the shape check, and
    // pretending otherwise would be worse than naming it: a preacher reading
    // John 3:16 verbatim, with no "John" and no "3:16" in the sentence, looks
    // exactly like an original takeaway. No regex can tell those apart.
    //
    // The cover is the DETECTOR, not this function — see the next test.
    expect(looksLikeCitation('For God so loved the world, that he gave his only begotten Son'))
      .toBe(false);
  });

  it('the detector catches what the shape check cannot', () => {
    // The app already ships the scorer that answers this question, so the rail
    // does not need a second, weaker guess. `textOverlapScore` is the
    // containment function behind detector 3, and a near-1.0 score against
    // installed scripture is the signal that this is a quotation.
    const verse = 'For God so loved the world, that he gave his only begotten Son';
    const original = 'God does not want your religion, he wants your faith';

    expect(textOverlapScore(verse, verse)).toBeGreaterThan(0.9);
    expect(textOverlapScore(original, verse)).toBeLessThan(0.5);
  });
});

describe('length bounds', () => {
  it('refuses a fragment', () => {
    const short = 'Amen.'.repeat(1);
    expect(validateQuoteResponse({ type: 'quote', content: short, confidence: 95 })).toBeNull();
  });

  it('refuses something too long to be a takeaway', () => {
    const long = Array.from({ length: QUOTE_MAX_WORDS + 5 }, (_, i) => `word${i}`).join(' ');
    expect(validateQuoteResponse({ type: 'quote', content: long, confidence: 95 })).toBeNull();
  });

  it('accepts something at the lower bound', () => {
    const exact = Array.from({ length: QUOTE_MIN_WORDS }, (_, i) => `word${i}`).join(' ');
    expect(validateQuoteResponse({ type: 'quote', content: exact, confidence: 95 })).not.toBeNull();
  });
});

describe('confidence floor', () => {
  it('refuses a quote the model itself is unsure about', () => {
    expect(validateQuoteResponse({ type: 'quote', content: GOOD, confidence: QUOTE_MIN_CONFIDENCE - 1 }))
      .toBeNull();
  });

  it('accepts one exactly at the floor', () => {
    expect(validateQuoteResponse({ type: 'quote', content: GOOD, confidence: QUOTE_MIN_CONFIDENCE }))
      .not.toBeNull();
  });

  it('honours a caller-supplied floor', () => {
    expect(validateQuoteResponse({ type: 'quote', content: GOOD, confidence: 60 }, { minConfidence: 50 }))
      .not.toBeNull();
  });
});

describe('malformed output renders as nothing', () => {
  it.each([
    [null],
    [undefined],
    ['a string'],
    [42],
    [{}],
    [{ type: 'quote' }],
    [{ content: GOOD }],
    [{ type: 'scripture', content: GOOD, confidence: 95 }],
    [{ type: 'quote', content: GOOD, confidence: 'high' }],
    [{ type: 'quote', content: GOOD, confidence: null }],
  ])('refuses %j', (raw) => {
    // A model asked for JSON will occasionally return prose or a confidence of
    // 150. Anything that does not survive here must produce null, because the
    // rail renders whatever it is handed.
    expect(validateQuoteResponse(raw)).toBeNull();
  });

  it('refuses a type outside the allowed set', () => {
    // FreeShow's classifier emits scripture and lyrics from one call. Separating
    // the lanes is what lets each keep its own gates — so those types are
    // refused here rather than passed through.
    for (const type of ['scripture', 'lyrics', 'quote-ish', '']) {
      expect(validateQuoteResponse({ type, content: GOOD, confidence: 95 })).toBeNull();
    }
  });

  it('accepts a confidence above 100 but does not pretend it is bounded', () => {
    // A model returning 150 is odd but not dangerous; the value is used for a
    // threshold comparison only, never displayed as a percentage.
    expect(validateQuoteResponse({ type: 'quote', content: GOOD, confidence: 150 })).not.toBeNull();
  });
});

describe('parseQuoteResponse', () => {
  it('parses plain JSON', () => {
    expect(parseQuoteResponse('{"type":"empty","content":"","confidence":0}').type).toBe('empty');
  });

  it('parses a fenced json block', () => {
    // Models return fences often enough that not handling it makes the lane look
    // broken for reasons that have nothing to do with the model being bad.
    const fenced = '```json\n{"type":"quote","content":"hi there friend","confidence":90}\n```';
    expect(parseQuoteResponse(fenced).type).toBe('quote');
  });

  it('parses an unlabelled fence', () => {
    const fenced = '```\n{"type":"empty","content":"","confidence":0}\n```';
    expect(parseQuoteResponse(fenced).type).toBe('empty');
  });

  it('returns null for prose and junk', () => {
    expect(parseQuoteResponse('I am sorry, I cannot help with that')).toBeNull();
    expect(parseQuoteResponse('')).toBeNull();
    expect(parseQuoteResponse(null)).toBeNull();
  });
});

describe('the prompt keeps the rules that matter', () => {
  it('keeps the anchor rule', () => {
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/scripture|citation/i);
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/never handles scripture|never/i);
  });

  it('keeps the chapter-only prohibition', () => {
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/never guess verse 1/i);
  });

  it('preserves the spoken language', () => {
    // Phase 3 made the whole feature multilingual. A classifier that
    // anglophoneises a quote undoes that.
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/preserve the spoken language/i);
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/never translate/i);
  });

  it('rejects filler', () => {
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/filler/i);
  });

  it('states that silence is the correct answer', () => {
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/silence is always the correct answer/i);
  });

  it('forbids improving the wording', () => {
    // A "quote" the model tidied up is not a quote the pastor said.
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/do not improve the grammar/i);
  });
});

describe('the lane is structurally incapable of reaching an output', () => {
  it('can emit only note-bound types', () => {
    expect(QUOTE_ALLOWED_TYPES).toEqual(['quote', 'announcement', 'empty']);
    expect(QUOTE_ALLOWED_TYPES).not.toContain('scripture');
    expect(QUOTE_ALLOWED_TYPES).not.toContain('lyrics');
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const card = readFileSync(
    resolve(here, '../../components/Speech/QuoteSuggestionCard.jsx'),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('the card has no send-to-output action anywhere in it', () => {
    // A source-level assertion, not a review note. The only send-to-output
    // functions in this codebase are sendVerseLive and loadBibleVerse; if
    // either appears in this component, a wrong suggestion can reach a screen.
    expect(card).not.toMatch(/sendVerseLive|loadBibleVerse|emitBibleVerseLoaded/);
    expect(card).not.toMatch(/toOutput|isOutputOn/);
  });

  it('the card sends to Free Note instead', () => {
    expect(card).toMatch(/toFreeNoteDraft|Send to Free Note/i);
  });
});