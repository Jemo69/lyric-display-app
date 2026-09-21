import { describe, expect, it } from 'vitest';
import {
  buildCcliCsv,
  collectCcliEntries,
  extractCcliNumber,
  formatChordLyricLine,
  hasChordPro,
  isChordLine,
  isChordToken,
  parseChordPro,
  stripChordsFromText,
  transposeChord,
  transposeSong,
} from 'shared/chords.js';

const SAMPLE = `{title: Amazing Grace}
{artist: John Newton}
{key: G}
{ccli: 2762836}

{start_of_verse: Verse 1}
[G]Amazing grace how [C]sweet the [G]sound
That saved a wretch like [D]me
{end_of_verse}

{start_of_chorus}
My [G]chains are [Em]gone, I've been set [C]free [D]
{end_of_chorus}`;

describe('isChordToken', () => {
  it.each(['C', 'G', 'Am', 'F#m7', 'Bb', 'Cmaj7', 'Dsus4', 'G/B', 'E7', 'Aadd9', 'Dm7b5', 'F#', 'Gsus'])(
    'accepts chord %s',
    (chord) => expect(isChordToken(chord)).toBe(true),
  );
  it.each(['Chorus', 'Amazing', 'Verse 1', 'translation', 'Capo 3', '[C]', 'Hallelujah', 'N.C.', ''])(
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

describe('hasChordPro', () => {
  it('detects inline chords', () => {
    expect(hasChordPro('[G]Amazing grace')).toBe(true);
  });
  it('detects directives', () => {
    expect(hasChordPro('{title: Foo}\nJust lyrics here')).toBe(true);
    expect(hasChordPro('{key: C}\nJust lyrics here')).toBe(true);
  });
  it('detects chords-over-lyrics pairs', () => {
    expect(hasChordPro('C G Am F\nAmazing grace how sweet')).toBe(true);
  });
  it('leaves plain lyrics alone', () => {
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
    expect(chart.ccli).toBe('2762836');
    expect(chart.sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus']);
    const firstLine = chart.sections[0].lines[0];
    expect(firstLine.segments.map((s) => s.chord)).toEqual(['G', 'C', 'G']);
    expect(firstLine.segments.map((s) => s.text).join('')).toBe('Amazing grace how sweet the sound');
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

  it('keeps comment directives as comment lines', () => {
    const chart = parseChordPro('{c: Softly here}\n[G]Sing\n');
    expect(chart.sections[0].lines[0]).toMatchObject({ comment: 'Softly here' });
  });

  it('never throws on odd input', () => {
    expect(() => parseChordPro(null)).not.toThrow();
    expect(parseChordPro('').sections).toEqual([]);
    expect(parseChordPro('{{{oops').sections).toHaveLength(1);
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

describe('transposeSong', () => {
  it('transposes key and every chord without mutating the original', () => {
    const chart = parseChordPro(SAMPLE);
    const shifted = transposeSong(chart, 2);
    expect(shifted.key).toBe('A');
    expect(shifted.sections[0].lines[0].segments.map((s) => s.chord)).toEqual(['A', 'D', 'A']);
    expect(chart.key).toBe('G');
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
    expect(chords['Amazing '.length]).toBe('C');
    // Every chord sits exactly above its lyric offset.
    expect(chords.indexOf('C')).toBe('Amazing '.length);
  });

  it('pads short lyrics when a chord overhangs', () => {
    const { chords, lyrics } = formatChordLyricLine([{ chord: 'Cmaj7', text: 'Hi' }]);
    expect(chords).toBe('Cmaj7');
    expect(lyrics).toBe('Hi');
  });
});

describe('stripChordsFromText', () => {
  it('returns singable lyrics only', () => {
    const stripped = stripChordsFromText(SAMPLE);
    expect(stripped).toContain('Amazing grace how sweet the sound');
    expect(stripped).not.toContain('[G]');
    expect(stripped).not.toContain('{key:');
    expect(stripped).not.toContain('{start_of_verse');
  });
});

describe('extractCcliNumber', () => {
  it('finds CCLI numbers in directives and prose', () => {
    expect(extractCcliNumber('{ccli: 2762836}')).toBe('2762836');
    expect(extractCcliNumber('CCLI # 12345')).toBe('12345');
    expect(extractCcliNumber('CCLI Song No. 678-90')).toBe('67890');
    expect(extractCcliNumber('no number here')).toBe('');
  });
  it('prefers explicit metadata', () => {
    expect(extractCcliNumber('{ccli: 111}', { ccliNumber: '222' })).toBe('222');
  });
});

describe('collectCcliEntries + buildCcliCsv', () => {
  it('builds one row per setlist song with correct columns', () => {
    const entries = collectCcliEntries(
      [
        { displayName: 'Amazing Grace', content: '{ccli: 2762836}\n[G]Amazing' },
        { displayName: 'Own Song', content: 'la la la', metadata: { ccliNumber: '999', uses: 3, serviceDates: ['2026-09-06', '2026-09-13'] } },
      ],
      { serviceDate: '2026-09-20' },
    );
    expect(entries).toEqual([
      { title: 'Amazing Grace', ccliNumber: '2762836', uses: 1, dates: ['2026-09-20'] },
      { title: 'Own Song', ccliNumber: '999', uses: 3, dates: ['2026-09-06', '2026-09-13'] },
    ]);
    const csv = buildCcliCsv(entries);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Song Title,CCLI Number,Uses,Service Dates,Notes');
    expect(lines[1]).toBe('Amazing Grace,2762836,1,2026-09-20,');
    expect(lines[2]).toBe('Own Song,999,3,2026-09-06; 2026-09-13,');
  });

  it('quotes fields containing commas or quotes', () => {
    const csv = buildCcliCsv([{ title: 'Grace, "Amazing"', ccliNumber: '', uses: 1, dates: ['2026-09-20'] }]);
    expect(csv).toContain('"Grace, ""Amazing"""');
  });
});
