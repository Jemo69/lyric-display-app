import { describe, it, expect, beforeEach, vi } from 'vitest';
import useLyricsStore, { defaultMetronomeSettings } from '../LyricsStore';

const STORAGE_KEY = 'lyrics-store';

function setupLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  return store;
}

const waitHydration = async (store) => {
  if (store.persist?.hasHydrated?.()) return;
  if (store.persist?.onFinishHydration) {
    await new Promise((resolve) => store.persist.onFinishHydration(resolve));
  }
};

describe('metronome settings persistence', () => {
  beforeEach(() => {
    setupLocalStorage();
    vi.resetModules();
    if (!globalThis.crypto?.randomUUID) {
      Object.defineProperty(globalThis, 'crypto', {
        value: { randomUUID: () => Math.random().toString(36).slice(2) },
        writable: true,
        configurable: true,
      });
    }
  });

  it('defaults to the FreeShow metronome values', async () => {
    const { default: store } = await import('../LyricsStore');
    await waitHydration(store);

    expect(store.getState().metronomeSettings).toMatchObject({
      tempo: 120,
      beats: 4,
      volume: 1,
      clickSound: 'metal',
    });
  });

  it('round-trips tempo, beats and click sound through a reload', async () => {
    const { default: store } = await import('../LyricsStore');
    await waitHydration(store);

    store.getState().setMetronomeSettings({
      ...store.getState().metronomeSettings,
      tempo: 96,
      beats: 3,
      clickSound: 'wood',
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).state.metronomeSettings).toMatchObject({
      tempo: 96,
      beats: 3,
      clickSound: 'wood',
    });

    // Simulate an app restart.
    vi.resetModules();
    const { default: store2 } = await import('../LyricsStore');
    await waitHydration(store2);

    expect(store2.getState().metronomeSettings).toMatchObject({
      tempo: 96,
      beats: 3,
      clickSound: 'wood',
    });
  });

  it('fills in missing keys from a partial persisted blob', () => {
    useLyricsStore.setState({ metronomeSettings: { tempo: 140 } });
    useLyricsStore.getState().setMetronomeSettings({ tempo: 140 });

    // setMetronomeSettings merges onto the defaults, so a partial blob can
    // never leave the bar without a click sound or a beat count.
    expect(useLyricsStore.getState().metronomeSettings).toEqual({
      ...defaultMetronomeSettings(),
      tempo: 140,
    });
  });

  it('is not polluted by the live beat clock', () => {
    useLyricsStore.getState().setMetronomeSettings({ ...useLyricsStore.getState().metronomeSettings, tempo: 100 });
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)).state.metronomeSettings;

    // playing/beat live in the engine module, not in persisted state.
    expect(persisted).not.toHaveProperty('playing');
    expect(persisted).not.toHaveProperty('beat');
    expect(persisted).not.toHaveProperty('timer');
  });
});
