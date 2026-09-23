import { describe, it, expect } from 'vitest';
import {
  isChordLine,
  isChordToken,
  isDirectiveLine,
  stripChordSheet,
  stripInlineChordsFromLine,
} from '../chordStripper';

describe('chordStripper', () => {
  describe('isChordToken', () => {
    it.each(['Am', 'F', 'G', 'C', 'Dm', 'Em', 'Bb', 'F#m', 'G/B', 'Asus4', 'Am7', 'Cmaj7', 'Dsus2', 'Gadd9', 'A'])(
      'recognizes %s as a chord',
      (token) => {
        expect(isChordToken(token)).toBe(true);
      }
    );

    it.each(['Amazing', 'grace', 'And', 'moment', 'Hallelujah', 'sound', 'the'])(
      'rejects lyric word %s',
      (token) => {
        expect(isChordToken(token)).toBe(false);
      }
    );
  });

  describe('isChordLine', () => {
    it('flags chord-over-lyric lines', () => {
      expect(isChordLine('Am        F         G')).toBe(true);
      expect(isChordLine('C G/B Am F')).toBe(true);
    });

    it('keeps lyric lines', () => {
      expect(isChordLine('Amazing grace how sweet the sound')).toBe(false);
      expect(isChordLine('Am I dreaming')).toBe(false);
    });

    it('keeps section tags, timestamps and metadata lines', () => {
      expect(isChordLine('[Verse]')).toBe(false);
      expect(isChordLine('[00:12.34] Amazing grace')).toBe(false);
      expect(isChordLine('[ti:Amazing Grace]')).toBe(false);
    });

    it('treats ChordPro directives as removable lines', () => {
      expect(isChordLine('{title: Amazing Grace}')).toBe(true);
      expect(isDirectiveLine('{comment: Verse 1}')).toBe(true);
      expect(isDirectiveLine('Amazing grace')).toBe(false);
    });
  });

  describe('stripInlineChordsFromLine', () => {
    it('removes inline bracketed chords', () => {
      const { line, removed } = stripInlineChordsFromLine('[Am]Amazing [F]grace');
      expect(line).toBe('Amazing grace');
      expect(removed).toBe(2);
    });

    it('preserves section tags, timestamps and metadata', () => {
      const { line, removed } = stripInlineChordsFromLine('[Verse] [00:12.34] Amazing grace');
      expect(line).toBe('[Verse] [00:12.34] Amazing grace');
      expect(removed).toBe(0);
    });
  });

  describe('stripChordSheet', () => {
    it('cleans a pasted chord sheet in one pass, keeping lyrics', () => {
      const input = [
        '{title: Amazing Grace}',
        '[Verse]',
        'Am        F         G',
        '[Am]Amazing [F]grace how [G]sweet the sound',
        'C         G        Am',
        'That saved a wretch like me',
      ].join('\n');

      const result = stripChordSheet(input);

      expect(result.text).toBe(
        ['[Verse]', 'Amazing grace how sweet the sound', 'That saved a wretch like me'].join('\n')
      );
      expect(result.removedChordLines).toBe(2);
      expect(result.removedInlineChords).toBe(3);
      expect(result.removedDirectives).toBe(1);
    });

    it('leaves plain lyrics untouched', () => {
      const input = 'Amazing grace\nHow sweet the sound';
      const result = stripChordSheet(input);
      expect(result.text).toBe(input);
      expect(result.removedChordLines).toBe(0);
      expect(result.removedInlineChords).toBe(0);
    });
  });
});
