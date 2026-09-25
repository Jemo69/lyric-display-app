import { describe, expect, it } from 'vitest';
import { parseLyricsFileAsync } from '../asyncLyricsParser.js';
import {
  chordToScaleDegree,
  formatChordLyricLine,
  hasChordPro,
  isChordChart,
  isChordLine,
  isChordToken,
  parseChordPro,
  parseChordProSource,
  stripChordsFromText,
  transposeChord,
} from 'shared/chords.js';

const SAMPLE = `{title: Amazing Grace}
{artist: John Newton}
{key: G}

{start_of_verse: Verse 1}
[G]Amazing grace how [C]sweet the [G]sound
That saved a wretch like [D]me
{end_of_verse}

{start_of_chorus}
My [G]chains are [Em]gone, I've been set [C]free [D]
{end_of_chorus}`;

describe('isChordToken', () => {
  it.each(['C', 'G', 'Am', 'F#m7', 'Bb', 'Cmaj7', 'Dsus4', 'G/B', 'E7', 'Aadd9', 'Dm7b5', 'F#', 'Gsus', 'N.C.'])(
    'accepts chord %s',
    (chord) => expect(isChordToken(chord)).toBe(true),
  );

  it.each(['Chorus', 'Amazing', 'Verse 1', 'translation', 'Capo 3', '[C]', 'Hallelujah', `C${'9'.repeat(50)}`, ''])(
    'rejects non-chord %s',
    (token) => expect(isChordToken(token)).toBe(false),
  );
});

describe('isChordLine', () => {
  it('detects a chord-only line', () => {
    expect(isChordLine('C G Am F')).toBe(true);
    expect(isChordLine('  F#m7   B7  Em  ')).toBe(true);
  });

  it('rejects lyric lines', () => {
    expect(isChordLine('Amazing grace how sweet')).toBe(false);
    expect(isChordLine('')).toBe(false);
    expect(isChordLine('C grace how sweet')).toBe(false);
  });
});

describe('isChordChart', () => {
  it('accepts parser output and rejects malformed socket data', () => {
    expect(isChordChart(parseChordPro(SAMPLE))).toBe(true);
    expect(isChordChart({ sections: [null] })).toBe(false);
    expect(isChordChart({ key: 42, sections: [] })).toBe(false);
    expect(isChordChart({ sections: [{ id: 'x', label: 'Verse', lines: [{ segments: [{ chord: 42, text: 'x' }] }] }] })).toBe(false);
    expect(isChordChart(null)).toBe(false);
  });
});

describe('hasChordPro', () => {
  it('detects inline and chords-over-lyrics formats', () => {
    expect(hasChordPro('[G]Amazing grace')).toBe(true);
    expect(hasChordPro('C G Am F\nAmazing grace how sweet')).toBe(true);
  });

  it('requires a real chord symbol', () => {
    expect(hasChordPro('{title: Foo}\n{key: C}\nJust lyrics here')).toBe(false);
    expect(hasChordPro('Amazing grace how sweet the sound\nThat saved a wretch like me')).toBe(false);
    expect(hasChordPro('[Verse 1]\nAmazing grace\n[Chorus]\nMy chains are gone')).toBe(false);
    expect(hasChordPro('')).toBe(false);
  });
});

describe('parseChordPro', () => {
  it('parses metadata, sections, and inline chords', () => {
    const chart = parseChordPro(SAMPLE);
    expect(chart.title).toBe('Amazing Grace');
    expect(chart.artist).toBe('John Newton');
    expect(chart.key).toBe('G');
    expect(chart.sections.map((section) => section.label)).toEqual(['Verse 1', 'Chorus']);

    const firstLine = chart.sections[0].lines[0];
    expect(firstLine.segments.map((segment) => segment.chord)).toEqual(['G', 'C', 'G']);
    expect(firstLine.segments.map((segment) => segment.text).join('')).toBe('Amazing grace how sweet the sound');
  });

  it('pairs chords-over-lyrics lines by character offset', () => {
    const chart = parseChordPro('C     G\nHello world\n');
    expect(chart.sections).toHaveLength(1);
    const [line] = chart.sections[0].lines;
    expect(line.segments[0]).toMatchObject({ chord: 'C', text: 'Hello ' });
    expect(line.segments[1]).toMatchObject({ chord: 'G', text: 'world' });
  });

  it('treats non-chord bracket headers as section labels', () => {
    const chart = parseChordPro('[Verse 2]\n[C]Praise Him\n');
    expect(chart.sections[0].label).toBe('Verse 2');
  });

  it('keeps comment directives in the operator chart', () => {
    const chart = parseChordPro('{c: Softly here}\n[G]Sing\n');
    expect(chart.sections[0].lines[0]).toMatchObject({ comment: 'Softly here' });
  });

  it('never throws on odd input', () => {
    expect(() => parseChordPro(null)).not.toThrow();
    expect(parseChordPro('').sections).toEqual([]);
    expect(parseChordPro('{{{oops').sections).toHaveLength(1);
  });
});

describe('parseChordProSource', () => {
  it('returns the chart and clean audience lyrics for ChordPro text', () => {
    const source = `{key: G}\n{comment: Softly}\n{start_of_verse: Verse 1}\n[G]Amazing [C]grace\n{end_of_verse}`;
    const result = parseChordProSource(source);

    expect(result.chart.key).toBe('G');
    expect(result.lyricsText).toContain('[Verse 1]');
    expect(result.lyricsText).toContain('Amazing grace');
    expect(result.lyricsText).not.toContain('[G]');
    expect(result.lyricsText).not.toContain('[C]');
    expect(result.lyricsText).not.toContain('{key:');
    expect(result.lyricsText).not.toContain('Softly');
  });

  it('strips metadata even when no chord symbols are present', () => {
    const source = '{title: Amazing Grace}\n{key: G}\nAmazing grace';
    expect(parseChordProSource(source)).toEqual({ chart: null, lyricsText: 'Amazing grace' });
  });

  it('passes plain lyrics through unchanged', () => {
    const plain = '[Verse 1]\nAmazing grace\nHow sweet the sound';
    expect(parseChordProSource(plain)).toEqual({ chart: null, lyricsText: plain });
  });

  it('allows sanitized ChordPro text to become empty', async () => {
    const source = parseChordProSource('C     G\n');
    expect(source.lyricsText).toBe('');

    const parsed = await parseLyricsFileAsync(null, {
      fileType: 'txt',
      rawText: source.lyricsText,
    });
    expect(parsed.processedLines).toEqual([]);
  });
});

describe('stripChordsFromText', () => {
  it('removes chord scaffolding while retaining lyric section labels', () => {
    const stripped = stripChordsFromText(SAMPLE);
    expect(stripped).toContain('[Verse 1]');
    expect(stripped).toContain('Amazing grace how sweet the sound');
    expect(stripped).toContain('My chains are gone');
    const bracketTokens = [...stripped.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim());
    expect(bracketTokens.filter(isChordToken)).toEqual([]);
    expect(stripped).not.toContain('{key:');
    expect(stripped).not.toContain('{start_of_verse');
  });
});

describe('transposeChord', () => {
  it('transposes up and down with sharps', () => {
    expect(transposeChord('C', 2)).toBe('D');
    expect(transposeChord('G', -2)).toBe('F');
    expect(transposeChord('Am', 3)).toBe('Cm');
    expect(transposeChord('F#m7', 1)).toBe('Gm7');
  });

  it('preserves flat spelling', () => {
    expect(transposeChord('Bb', 2)).toBe('C');
    expect(transposeChord('Eb', -1)).toBe('D');
  });

  it('handles slash chords and wraps octaves', () => {
    expect(transposeChord('G/B', 2)).toBe('A/C#');
    expect(transposeChord('B', 1)).toBe('C');
    expect(transposeChord('C', 12)).toBe('C');
    expect(transposeChord('Cmaj7', 0)).toBe('Cmaj7');
  });
});

describe('formatChordLyricLine', () => {
  it('aligns chords above their lyric syllables in mono', () => {
    const { chords, lyrics } = formatChordLyricLine([
      { chord: 'G', text: 'Amazing ' },
      { chord: 'C', text: 'grace' },
    ]);
    expect(lyrics).toBe('Amazing grace');
    expect(chords[0]).toBe('G');
    expect(chords.indexOf('C')).toBe('Amazing '.length);
  });

  it('keeps a long chord when it overhangs a short lyric', () => {
    const { chords, lyrics } = formatChordLyricLine([{ chord: 'Cmaj7', text: 'Hi' }]);
    expect(chords).toBe('Cmaj7');
    expect(lyrics).toBe('Hi');
  });

  it('renders degree labels in number mode and keeps alignment', () => {
    const { chords, lyrics } = formatChordLyricLine([
      { chord: 'G', text: 'Amazing ' },
      { chord: 'C', text: 'grace' },
    ], 0, { notation: 'numbers', key: 'C' });

    expect(lyrics).toBe('Amazing grace');
    expect(chords).toBe('5       1');
  });
});

describe('chordToScaleDegree', () => {
  it('numbers the diatonic triads of a major key', () => {
    expect(chordToScaleDegree('C', 'C')).toBe('1');
    expect(chordToScaleDegree('D', 'C')).toBe('2');
    expect(chordToScaleDegree('E', 'C')).toBe('3');
    expect(chordToScaleDegree('F', 'C')).toBe('4');
    expect(chordToScaleDegree('G', 'C')).toBe('5');
    expect(chordToScaleDegree('A', 'C')).toBe('6');
    expect(chordToScaleDegree('B', 'C')).toBe('7');
  });

  it('keeps chord quality in the suffix', () => {
    expect(chordToScaleDegree('Am', 'C')).toBe('6m');
    expect(chordToScaleDegree('Em', 'C')).toBe('3m');
    expect(chordToScaleDegree('Dm7', 'C')).toBe('2m7');
    expect(chordToScaleDegree('G7', 'C')).toBe('57');
    expect(chordToScaleDegree('Cmaj7', 'C')).toBe('1maj7');
    expect(chordToScaleDegree('Dsus4', 'C')).toBe('2sus4');
    expect(chordToScaleDegree('Bdim', 'C')).toBe('7dim');
    expect(chordToScaleDegree('G5', 'C')).toBe('5(5)');
  });

  it('handles slash chords and non-C keys', () => {
    expect(chordToScaleDegree('G/B', 'C')).toBe('5/7');
    expect(chordToScaleDegree('D/F#', 'C')).toBe('2/♯4');
    expect(chordToScaleDegree('C/G', 'G')).toBe('4/1');
    expect(chordToScaleDegree('Am', 'G')).toBe('2m');
  });

  it('prefixes accidentals that fall outside the key', () => {
    expect(chordToScaleDegree('Db', 'C')).toBe('♭2');
    expect(chordToScaleDegree('F#', 'C')).toBe('♯4');
    expect(chordToScaleDegree('B', 'C#')).toBe('♭7');
    expect(chordToScaleDegree('C', 'C#')).toBe('♭1');
  });

  it('numbers minor keys from the minor tonic', () => {
    expect(chordToScaleDegree('Am', 'Am')).toBe('1');
    expect(chordToScaleDegree('C', 'Am')).toBe('3');
    expect(chordToScaleDegree('G', 'Am')).toBe('7');
    expect(chordToScaleDegree('E', 'Am')).toBe('5');
    expect(chordToScaleDegree('F', 'Am')).toBe('6');
    expect(chordToScaleDegree('Bdim', 'Am')).toBe('2dim');
  });

  it('keeps the minor marker on a minor-key tonic that is extended', () => {
    expect(chordToScaleDegree('Am7', 'Am')).toBe('1m7');
    expect(chordToScaleDegree('Am9', 'Am')).toBe('1m9');
    expect(chordToScaleDegree('Am', 'C')).toBe('6m');
  });

  it('treats a spelled-out minor triad as the bare tonic', () => {
    expect(chordToScaleDegree('Amin', 'Am')).toBe('1');
    expect(chordToScaleDegree('Amin7', 'Am')).toBe('1m7');
  });

  it('returns null without a usable key so callers can fall back to letters', () => {
    expect(chordToScaleDegree('G', '')).toBeNull();
    expect(chordToScaleDegree('G', null)).toBeNull();
    expect(chordToScaleDegree('G', undefined)).toBeNull();
    expect(chordToScaleDegree('G', '   ')).toBeNull();
    expect(chordToScaleDegree('', 'C')).toBeNull();
  });

  it('ignores extra key text after the tonic', () => {
    expect(chordToScaleDegree('Am', 'Am')).toBe('1');
    expect(chordToScaleDegree('G', 'G major')).toBe('1');
    expect(chordToScaleDegree('A', 'Am')).toBe('1');
  });
});

describe('formatChordLyricLine in number mode', () => {
  it('falls back to transposed letters when the song has no key', () => {
    const { chords } = formatChordLyricLine([{ chord: 'G', text: 'Sing' }], 2, { notation: 'numbers', key: '' });
    expect(chords).toBe('A');
  });

  it('ignores transpose in number mode because degrees are key-relative', () => {
    const atPitch = formatChordLyricLine([{ chord: 'G', text: 'Sing' }], 0, { notation: 'numbers', key: 'C' });
    const transposed = formatChordLyricLine([{ chord: 'G', text: 'Sing' }], 5, { notation: 'numbers', key: 'C' });
    expect(transposed.chords).toBe(atPitch.chords);
    expect(transposed.chords).toBe('5');
  });

  it('defaults to letters when no notation option is given', () => {
    expect(formatChordLyricLine([{ chord: 'G', text: 'Sing' }], 0, { key: 'C' }).chords).toBe('G');
  });
});
