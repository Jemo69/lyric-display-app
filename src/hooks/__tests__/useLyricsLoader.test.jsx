import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLyricsLoader } from '../LyricDisplayApp/useLyricsLoader.js';
import { getLineOutputText } from '../../utils/parseLyrics.js';

const CHORD_SONG = `{title: Amazing Grace}
{key: G}
[G]Amazing [C]grace
How [G]sweet the sound`;

function createLoader(overrides = {}) {
  const emitLyricsLoad = vi.fn(() => true);
  const setChordChart = vi.fn();
  const setRawLyricsContent = vi.fn();
  const hook = renderHook(() => useLyricsLoader({
    setLyrics: vi.fn(),
    setLyricsSections: vi.fn(),
    setLineToSection: vi.fn(),
    setRawLyricsContent,
    setChordChart,
    setLyricsTimestamps: vi.fn(),
    selectLine: vi.fn(),
    setLyricsFileName: vi.fn(),
    setSongMetadata: vi.fn(),
    emitLyricsLoad,
    emitFileNameUpdate: vi.fn(() => true),
    emitContentLoaded: vi.fn(() => true),
    socket: null,
    showToast: vi.fn(),
    ...overrides,
  }));

  return { hook, emitLyricsLoad, setChordChart, setRawLyricsContent };
}

describe('useLyricsLoader ChordPro handling', () => {
  it('loads clean audience lyrics and carries the chart separately', async () => {
    const { hook, emitLyricsLoad, setChordChart, setRawLyricsContent } = createLoader();
    let loaded = false;

    await act(async () => {
      loaded = await hook.result.current.processLoadedLyrics({
        content: CHORD_SONG,
        fileName: 'Amazing Grace.txt',
        fileType: 'txt',
        enableSplitting: false,
      });
    });

    expect(loaded).toBe(true);
    expect(setChordChart).toHaveBeenCalledWith(expect.objectContaining({ key: 'G' }));
    expect(setRawLyricsContent).toHaveBeenCalledWith(CHORD_SONG);

    const payload = emitLyricsLoad.mock.calls[0][0];
    expect(payload.chords.key).toBe('G');
    const audienceLyrics = payload.lyrics.map(getLineOutputText).join('\n');
    expect(audienceLyrics).toContain('Amazing grace');
    expect(audienceLyrics).toContain('How sweet the sound');
    expect(audienceLyrics).not.toMatch(/\[(G|C)\]/);
    expect(audienceLyrics).not.toContain('{');
  });

  it('clears stale charts for plain lyric files', async () => {
    const { hook, emitLyricsLoad, setChordChart } = createLoader();

    await act(async () => {
      await hook.result.current.processLoadedLyrics({
        content: 'Just lyrics\nHow sweet the sound',
        fileName: 'Plain Song.txt',
        fileType: 'txt',
        enableSplitting: false,
      });
    });

    expect(setChordChart).toHaveBeenCalledWith(null);
    expect(Array.isArray(emitLyricsLoad.mock.calls[0][0])).toBe(true);
  });
});
