import { describe, it, expect } from 'vitest';
import {
  CASING_MODES,
  applyCasingToLine,
  applyCasingToText,
  toTitleCaseLine,
  toUpperCaseLine,
  toSentenceCaseLine,
} from '../textCasing';

describe('textCasing', () => {
  describe('toTitleCaseLine', () => {
    it('capitalizes every word', () => {
      expect(toTitleCaseLine('amazing grace how sweet the sound')).toBe(
        'Amazing Grace How Sweet The Sound'
      );
    });

    it('lowercases shouted words before capitalizing', () => {
      expect(toTitleCaseLine('AMAZING GRACE')).toBe('Amazing Grace');
    });

    it('preserves LRC timestamp prefixes', () => {
      expect(toTitleCaseLine('[00:12.34]amazing grace')).toBe('[00:12.34]Amazing Grace');
    });

    it('preserves section tags and leaves full-line metadata tags untouched', () => {
      expect(toTitleCaseLine('[Verse]amazing grace')).toBe('[Verse]Amazing Grace');
      expect(toTitleCaseLine('[ti:amazing grace]')).toBe('[ti:amazing grace]');
    });

    it('leaves blank lines untouched', () => {
      expect(toTitleCaseLine('')).toBe('');
      expect(toTitleCaseLine('   ')).toBe('   ');
    });
  });

  describe('toUpperCaseLine', () => {
    it('uppercases lyrics but keeps timestamp prefix intact', () => {
      expect(toUpperCaseLine('[00:12.34]amazing grace')).toBe('[00:12.34]AMAZING GRACE');
    });

    it('keeps section tags readable', () => {
      expect(toUpperCaseLine('[Chorus] holy holy')).toBe('[Chorus] HOLY HOLY');
    });
  });

  describe('toSentenceCaseLine', () => {
    it('capitalizes the first word and lowercases the rest', () => {
      expect(toSentenceCaseLine('AMAZING GRACE how SWEET')).toBe('Amazing grace how sweet');
    });

    it('capitalizes after sentence-ending punctuation', () => {
      expect(toSentenceCaseLine('amazing grace. how sweet the sound')).toBe(
        'Amazing grace. How sweet the sound'
      );
    });

    it('preserves leading timestamps', () => {
      expect(toSentenceCaseLine('[00:01.00]AMAZING GRACE')).toBe('[00:01.00]Amazing grace');
    });
  });

  describe('applyCasingToText', () => {
    it('applies the mode to every line and keeps blank lines', () => {
      const input = 'amazing grace\nhow sweet the sound\n\nthat saved a wretch';
      expect(applyCasingToText(input, CASING_MODES.TITLE)).toBe(
        'Amazing Grace\nHow Sweet The Sound\n\nThat Saved A Wretch'
      );
    });

    it('returns unknown modes unchanged', () => {
      expect(applyCasingToLine('hello world', 'nope')).toBe('hello world');
    });

    it('handles empty input', () => {
      expect(applyCasingToText('', CASING_MODES.UPPER)).toBe('');
    });
  });
});
