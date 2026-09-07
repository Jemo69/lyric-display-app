import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLyricsHotReload } from '../useLyricsHotReload';
import useLyricsStore from '../../context/LyricsStore';

function setupElectronMock() {
  const changedHandlers = new Set();
  const removedHandlers = new Set();
  window.electronAPI = {
    lyrics: {
      watchFile: vi.fn(async () => ({ success: true })),
      unwatchFile: vi.fn(async () => ({ success: true })),
      onFileChanged: vi.fn((cb) => {
        changedHandlers.add(cb);
        return () => changedHandlers.delete(cb);
      }),
      onFileRemoved: vi.fn((cb) => {
        removedHandlers.add(cb);
        return () => removedHandlers.delete(cb);
      }),
    },
  };
  return { changedHandlers, removedHandlers };
}

function fireChanged(handlers, payload) {
  return Promise.all([...handlers].map((cb) => cb(payload)));
}

describe('useLyricsHotReload on/off', () => {
  beforeEach(() => {
    useLyricsStore.setState({
      lyrics: ['line one', 'line two'],
      rawLyricsContent: 'line one\nline two',
      selectedLine: 1,
      contentMode: 'song',
      hotReloadEnabled: true,
      songMetadata: { title: 'Test', filePath: '/tmp/test.txt' },
    });
    delete window.electronAPI;
  });

  it('defaults hotReloadEnabled to on and watches the loaded file', () => {
    const { changedHandlers } = setupElectronMock();
    expect(useLyricsStore.getState().hotReloadEnabled).toBe(true);

    const processLoadedLyrics = vi.fn(async () => true);
    renderHook(() => useLyricsHotReload({ processLoadedLyrics }));

    expect(window.electronAPI.lyrics.watchFile).toHaveBeenCalledWith('/tmp/test.txt');
    expect(changedHandlers.size).toBe(1);
  });

  it('reloads on disk change and preserves the selected line', async () => {
    setupElectronMock();
    const processLoadedLyrics = vi.fn(async () => true);
    const emitLineUpdate = vi.fn();
    useLyricsStore.setState({ selectedLine: 1 });

    renderHook(() => useLyricsHotReload({ processLoadedLyrics, emitLineUpdate }));

    await act(async () => {
      await fireChanged(
        window.electronAPI.lyrics.onFileChanged.mock.calls.map(([cb]) => cb),
        {
          filePath: '/tmp/test.txt',
          fileName: 'test.txt',
          fileType: 'txt',
          content: 'line one CHANGED\nline two',
        },
      );
    });

    expect(processLoadedLyrics).toHaveBeenCalledTimes(1);
    expect(processLoadedLyrics.mock.calls[0][0]).toMatchObject({
      filePath: '/tmp/test.txt',
      fileType: 'txt',
    });
    // Selection restored + re-emitted so outputs stay on the same slide.
    expect(useLyricsStore.getState().selectedLine).toBe(1);
    expect(emitLineUpdate).toHaveBeenCalledWith(1);
  });

  it('ignores disk changes when toggled off', async () => {
    setupElectronMock();
    const processLoadedLyrics = vi.fn(async () => true);
    useLyricsStore.setState({ hotReloadEnabled: false });

    renderHook(() => useLyricsHotReload({ processLoadedLyrics }));

    expect(window.electronAPI.lyrics.watchFile).not.toHaveBeenCalled();

    await act(async () => {
      await fireChanged(
        window.electronAPI.lyrics.onFileChanged.mock.calls.map(([cb]) => cb),
        {
          filePath: '/tmp/test.txt',
          fileName: 'test.txt',
          fileType: 'txt',
          content: 'something entirely new',
        },
      );
    });

    expect(processLoadedLyrics).not.toHaveBeenCalled();
  });

  it('skips reload when content is identical (own save echo)', async () => {
    setupElectronMock();
    const processLoadedLyrics = vi.fn(async () => true);
    renderHook(() => useLyricsHotReload({ processLoadedLyrics }));

    await act(async () => {
      await fireChanged(
        window.electronAPI.lyrics.onFileChanged.mock.calls.map(([cb]) => cb),
        {
          filePath: '/tmp/test.txt',
          fileName: 'test.txt',
          fileType: 'txt',
          content: 'line one\nline two',
        },
      );
    });

    expect(processLoadedLyrics).not.toHaveBeenCalled();
  });
});
