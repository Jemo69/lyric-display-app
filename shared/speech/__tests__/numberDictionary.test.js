// shared/speech/__tests__/numberDictionary.test.js — multilingual numbers
// (Phase 3)
//
// Selah ships in 60+ UI languages. Before this phase the detector
// understood English only, so for a French- or Norwegian-speaking congregation
// the feature was effectively unavailable even though the app was not English.
//
// These tests are weighted two ways:
//   1. ENGLISH MUST NOT REGRESS. The English vocabulary was MOVED, not retyped,
//      so every pre-existing behaviour has to be identical.
//   2. EACH LANGUAGE MUST ACTUALLY PARSE. A dictionary nobody exercises is a
//      dictionary that rots on the first accent fix.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  NUMBER_DICTIONARIES,
  SUPPORTED_LOCALES,
  dictionaryFor,
  resolveLocale,
} from '../numberDictionary.js';
import { wordsToDigits } from '../../../src/speech/spokenForm.js';

describe('resolveLocale', () => {
  it('resolves a bare language tag', () => {
    expect(resolveLocale('fr')).toBe('fr');
    expect(resolveLocale('de')).toBe('de');
  });

  it('strips a region so a regional variant finds its language', () => {
    // This is the whole reason no second entry is needed per region: the app's
    // locale tags carry regions (pt_BR, fr_FR, en_GB) and every one of them
    // must resolve to the language.
    expect(resolveLocale('pt_BR')).toBe('pt');
    expect(resolveLocale('fr_FR')).toBe('fr');
    expect(resolveLocale('en_GB')).toBe('en');
    expect(resolveLocale('de-AT')).toBe('de');
  });

  it('is case-insensitive', () => {
    expect(resolveLocale('PT_br')).toBe('pt');
    expect(resolveLocale('FR')).toBe('fr');
  });

  it('falls back to English for an unknown or absent locale', () => {
    expect(resolveLocale('sw')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
  });
});

describe('dictionary shape', () => {
  it('covers the eight languages the plan named', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(
      ['de', 'en', 'es', 'fr', 'it', 'nl', 'no', 'pt'].sort()
    );
  });

  it('gives every locale the same four tables', () => {
    for (const [code, dict] of Object.entries(NUMBER_DICTIONARIES)) {
      expect(typeof dict.cardinals, code).toBe('object');
      expect(typeof dict.ordinals, code).toBe('object');
      expect(typeof dict.scales, code).toBe('object');
      expect(Array.isArray(dict.joiners), code).toBe(true);
    }
  });

  it('covers 1-20 in every locale', () => {
    // The range a scripture citation actually uses. A gap here is a citation
    // that silently fails to parse.
    for (const [code, dict] of Object.entries(NUMBER_DICTIONARIES)) {
      for (let n = 1; n <= 20; n += 1) {
        const found = Object.values(dict.cardinals).includes(n);
        expect(found, `${code} is missing a cardinal for ${n}`).toBe(true);
      }
    }
  });

  it('gives every locale a hundred scale', () => {
    for (const [code, dict] of Object.entries(NUMBER_DICTIONARIES)) {
      expect(Object.values(dict.scales), code).toContain(100);
    }
  });

  it('has no duplicate spoken form mapping to different values', () => {
    // A dictionary where "six" means both 6 and 60 resolves whichever key the
    // engine happens to hit first, which is not a property anyone can reason
    // about.
    for (const [code, dict] of Object.entries(NUMBER_DICTIONARIES)) {
      for (const table of ['cardinals', 'ordinals']) {
        const seen = new Map();
        for (const [form, value] of Object.entries(dict[table])) {
          if (seen.has(form)) {
            expect(`${code}.${table}: ${form} maps to both ${seen.get(form)} and ${value}`)
              .toBe('no duplicate');
          }
          seen.set(form, value);
        }
      }
    }
  });
});

describe('English behaviour is unchanged (non-regression)', () => {
  it.each([
    ['John chapter three verse sixteen', 'John chapter 3 verse 16'],
    ['twenty three', '23'],
    ['forty two', '42'],
    ['two hundred and twenty one', '221'],
    ['first Peter five', '1 Peter 5'],
    ['philippians four seven', 'philippians 4 7'],
    ['one hundred fifteen', '115'],
    ['thirty', '30'],
  ])('%s -> %s', (input, expected) => {
    expect(wordsToDigits(input)).toBe(expected);
  });

  it('treats an absent locale as English', () => {
    expect(wordsToDigits('John chapter three verse sixteen', undefined))
      .toBe('John chapter 3 verse 16');
    expect(wordsToDigits('John chapter three verse sixteen')).toBe(
      wordsToDigits('John chapter three verse sixteen', 'en')
    );
  });

  it('treats an unknown locale as English rather than failing', () => {
    // A Swedish speaker should still get every ENGLISH citation parsed, not a
    // thrown error or an empty result.
    expect(wordsToDigits('John chapter three verse sixteen', 'sw')).toBe('John chapter 3 verse 16');
  });

  it('leaves prose alone', () => {
    expect(wordsToDigits('and that is really the whole point')).toBe(
      'and that is really the whole point'
    );
  });
});

describe('each language parses a real citation', () => {
  // One case per locale, in that language, resolving to the same digits. These
  // are the forms the comparison report called out: "Jean trois seize",
  // "Juan 3:16", "Johannes 3,16".
  it.each([
    ['en', 'John chapter three verse sixteen', 'John chapter 3 verse 16'],
    ['fr', 'Jean chapitre trois verset seize', 'Jean chapitre 3 verset 16'],
    ['fr', 'Jean trois seize', 'Jean 3 16'],
    ['es', 'Juan capítulo tres versículo dieciséis', 'Juan capítulo 3 versículo 16'],
    ['es', 'Juan tres dieciséis', 'Juan 3 16'],
    ['de', 'Johannes Kapitel drei Vers sechzehn', 'Johannes Kapitel 3 Vers 16'],
    ['de', 'Johannes drei sechzehn', 'Johannes 3 16'],
    ['pt', 'João capítulo três versículo dezesseis', 'João capítulo 3 versículo 16'],
    ['it', 'Giovanni capitolo tre versetto sedici', 'Giovanni capitolo 3 versetto 16'],
    ['nl', 'Johannes hoofdstuk drie vers zestien', 'Johannes hoofdstuk 3 vers 16'],
    ['no', 'Johannes kapittel tre vers seksten', 'Johannes kapittel 3 vers 16'],
  ])('%s: %s', (locale, input, expected) => {
    expect(wordsToDigits(input, locale)).toBe(expected);
  });

  it('resolves a regional variant to its language', () => {
    expect(wordsToDigits('João capítulo três versículo dezesseis', 'pt_BR'))
      .toBe('João capítulo 3 versículo 16');
  });

  it('splits a hyphenated compound in a non-English language', () => {
    // "vingt-et-un" is one whitespace token but three number words. The old
    // tokenizer's [a-zA-Z] pattern could not see an accented compound at all,
    // so this stayed one token and never parsed.
    expect(wordsToDigits('vingt-et-un', 'fr')).toBe('21');
  });

  it('handles an accented ordinal', () => {
    expect(wordsToDigits('première Corinthiens deux', 'fr')).toBe('1 Corinthiens 2');
    expect(wordsToDigits('decimoquinto Salmo', 'es')).toBe('15 Salmo');
  });

  it('parses a scale word in a non-English language', () => {
    // "deux cent vingt et un" exercises BOTH joiner rules in one string: the
    // scale (cent) and then the tens joiner (vingt et un). Missing either one
    // produces 220 and 1 instead of 221.
    expect(wordsToDigits('deux cent vingt et un', 'fr')).toBe('221');
    expect(wordsToDigits('ciento uno', 'es')).toBe('101');
    // German writes the scale as a compound ("zweihundert"), so the spoken and
    // ASR form is the separate "zweihundert" — which this parser cannot
    // decompose. What it CAN do is "hundert" on its own, which is how a
    // translation or a careful reader says it.
    expect(wordsToDigits('hundert fünf', 'de')).toBe('105');
    expect(wordsToDigits('honderd vijf', 'nl')).toBe('105');
  });

  // KNOWN LIMITATION, DOCUMENTED RATHER THAN FAKED.
  //
  // German and Dutch write 21 as ONE unspaced compound — "einundzwanzig",
  // "eenentwintig" — where English says "twenty-one". A word-by-word parser
  // cannot decompose those: there are no words to read. They are not in the
  // dictionary, so the parser leaves them alone and the citation is simply not
  // detected in that one phrasing.
  //
  // Silence is the correct outcome. A guessed chapter or verse is a wrong
  // reference on a screen, which is the failure this whole module exists to
  // prevent. The alternative — synthesizing compound forms for every number
  // above 20 in four languages — is a large table with no correctness argument
  // behind it, so it is left for a future phase with real sermon audio to
  // validate against.
  it('leaves a German unspaced compound alone rather than guessing', () => {
    expect(wordsToDigits('einundzwanzig', 'de')).toBe('einundzwanzig');
  });

  it('leaves a Dutch unspaced compound alone rather than guessing', () => {
    expect(wordsToDigits('eenentwintig', 'nl')).toBe('eenentwintig');
  });

  it('parses a French tens compound both hyphenated and spaced', () => {
    // Both spellings occur in speech: the hyphen is usually dropped by ASR,
    // and French orthography uses it either way.
    expect(wordsToDigits('vingt-et-un', 'fr')).toBe('21');
    expect(wordsToDigits('vingt et un', 'fr')).toBe('21');
  });

  it('leaves another language\'s words alone rather than mangling them', () => {
    // Asking for French on an English sentence must not corrupt it. A parser
    // that guesses produces garbage references; one that declines produces
    // nothing, and nothing is always the safer outcome.
    const out = wordsToDigits('and that is really the whole point', 'fr');
    expect(out).toBe('and that is really the whole point');
  });

  it('does not treat an English word as a number in another locale', () => {
    // "one" is English. In a French dictionary it is not a cardinal, so it must
    // survive UNTOUCHED — including the following "five", which is also
    // English. Corrupting neither is the point: a wrong digit here becomes a
    // wrong reference on a screen.
    const out = wordsToDigits('one Peter five', 'fr');
    expect(out).toBe('one Peter five');
  });
});

describe('dictionaryFor', () => {
  it('returns the English table for an unknown locale', () => {
    expect(dictionaryFor('sw')).toBe(NUMBER_DICTIONARIES.en);
  });

  it('returns the requested table', () => {
    expect(dictionaryFor('fr')).toBe(NUMBER_DICTIONARIES.fr);
  });
});