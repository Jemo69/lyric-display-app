import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildCurrentState,
  getCurrentLyricsState,
  loadRawTextInternal,
  parseSongText,
} from '../../server/events.js';
import { createSessionSnapshot } from '../../server/sessionPersistence.js';
import { getLineOutputText } from '../utils/parseLyrics.js';
import { isChordToken } from 'shared/chords.js';

const CHORD_SONG = `{title: Amazing Grace}
{key: G}
{comment: Softly}
{start_of_verse: Verse 1}
[G]Amazing grace how [C]sweet the [G]sound
{end_of_verse}`;

const lyricText = (lines) => lines.map((line) => getLineOutputText(line));

describe('server ChordPro flow', () => {
  beforeEach(() => {
    loadRawTextInternal('Plain Song', '[Verse 1]\nJust lyrics\nHow sweet the sound');
  });

  it('keeps ChordPro metadata and markup out of audience lyric lines', () => {
    const parsed = parseSongText(CHORD_SONG);
    const displayLines = lyricText(parsed.processedLines);

    expect(displayLines).toContain('Amazing grace how sweet the sound');
    const audienceText = displayLines.join('\n');
    const bracketTokens = [...audienceText.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim());
    expect(bracketTokens.filter(isChordToken)).toEqual([]);
    expect(audienceText).not.toContain('{');
    expect(audienceText).not.toContain('Softly');
    expect(parsed.sections.map((section) => section.label)).toContain('Verse 1');
    expect(parsed.chart.key).toBe('G');
  });

  it('loads clean lyrics and exposes the chart only to stage/desktop state', () => {
    loadRawTextInternal('Amazing Grace', CHORD_SONG);
    const state = getCurrentLyricsState();
    const outputState = buildCurrentState({ type: 'output1' });
    const stageState = buildCurrentState({ type: 'stage' });

    expect(lyricText(state.lyrics)).toContain('Amazing grace how sweet the sound');
    expect(state.chordChart?.key).toBe('G');
    expect(outputState).not.toHaveProperty('chords');
    expect(stageState.chords?.key).toBe('G');
  });

  it('persists the parsed chart without referencing undefined state', () => {
    loadRawTextInternal('Amazing Grace', CHORD_SONG);
    const snapshot = createSessionSnapshot();

    expect(snapshot.currentChordChart?.key).toBe('G');
    expect(lyricText(snapshot.currentLyrics)).toContain('Amazing grace how sweet the sound');
  });
});
