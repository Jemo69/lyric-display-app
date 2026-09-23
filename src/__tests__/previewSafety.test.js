import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveLineClick,
  resolveFirePreview,
  shouldBlockDestructive,
  movePreviewSelection,
  DESTRUCTIVE_ACTIONS,
} from '../utils/previewSafety.js';

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

describe('previewSafety pure logic (feature #02)', () => {
  describe('resolveLineClick', () => {
    it('fires live immediately when preview mode is OFF (current behavior preserved)', () => {
      expect(resolveLineClick({ previewMode: false, index: 3 })).toEqual({ fireLive: true, previewIndex: null });
      expect(resolveLineClick({ previewMode: undefined, index: 3 }).fireLive).toBe(true);
    });

    it('stages a preview and emits nothing live when preview mode is ON', () => {
      const decision = resolveLineClick({ previewMode: true, index: 4 });
      expect(decision.fireLive).toBe(false);
      expect(decision.previewIndex).toBe(4);
    });
  });

  describe('resolveFirePreview', () => {
    it('fires the staged preview line on Enter / double-click', () => {
      expect(resolveFirePreview({ previewSelectedLine: 7 })).toBe(7);
    });

    it('returns null when nothing is staged', () => {
      expect(resolveFirePreview({ previewSelectedLine: null })).toBe(null);
    });

    it('falls back to an explicit index when no preview is staged', () => {
      expect(resolveFirePreview({ previewSelectedLine: null, fallbackIndex: 2 })).toBe(2);
    });
  });

  describe('shouldBlockDestructive', () => {
    it('never blocks when output is hidden', () => {
      for (const action of DESTRUCTIVE_ACTIONS) {
        expect(shouldBlockDestructive({ isOutputOn: false, action })).toBe(false);
      }
    });

    it('blocks delete-song / remove-setlist / clear-setlist while live', () => {
      expect(shouldBlockDestructive({ isOutputOn: true, action: 'delete-song' })).toBe(true);
      expect(shouldBlockDestructive({ isOutputOn: true, action: 'remove-setlist' })).toBe(true);
      expect(shouldBlockDestructive({ isOutputOn: true, action: 'clear-setlist' })).toBe(true);
    });

    it('does not block unknown actions while live', () => {
      expect(shouldBlockDestructive({ isOutputOn: true, action: 'rename-song' })).toBe(false);
    });
  });

  describe('movePreviewSelection (vim j/k never fires live)', () => {
    it('moves down/up one line, clamped at the ends', () => {
      expect(movePreviewSelection({ current: 0, direction: 'down', length: 5 })).toBe(1);
      expect(movePreviewSelection({ current: 4, direction: 'down', length: 5 })).toBe(4);
      expect(movePreviewSelection({ current: 4, direction: 'up', length: 5 })).toBe(3);
      expect(movePreviewSelection({ current: 0, direction: 'up', length: 5 })).toBe(0);
    });

    it('supports first/last jumps', () => {
      expect(movePreviewSelection({ current: 2, direction: 'first', length: 5 })).toBe(0);
      expect(movePreviewSelection({ current: 2, direction: 'last', length: 5 })).toBe(4);
    });
  });
});

describe('previewMode store default (LOCAL WINS, default OFF)', () => {
  beforeEach(() => {
    vi.resetModules();
    setupLocalStorage();
    if (!globalThis.crypto?.randomUUID) {
      Object.defineProperty(globalThis, 'crypto', {
        value: { randomUUID: () => Math.random().toString(36).slice(2) },
        writable: true,
        configurable: true,
      });
    }
  });

  it('defaults previewMode to OFF with no staged preview', async () => {
    const { default: useLyricsStore } = await import('../context/LyricsStore');
    const state = useLyricsStore.getState();
    expect(state.previewMode).toBe(false);
    expect(state.previewSelectedLine).toBe(null);
  });

  it('toggles preview mode and stages/clears preview selection', async () => {
    const { default: useLyricsStore } = await import('../context/LyricsStore');
    useLyricsStore.getState().setPreviewMode(true);
    expect(useLyricsStore.getState().previewMode).toBe(true);
    useLyricsStore.getState().setPreviewSelectedLine(3);
    expect(useLyricsStore.getState().previewSelectedLine).toBe(3);
    // Leaving preview mode clears the staged preview.
    useLyricsStore.getState().setPreviewMode(false);
    expect(useLyricsStore.getState().previewMode).toBe(false);
    expect(useLyricsStore.getState().previewSelectedLine).toBe(null);
  });

  it('loading new lyrics clears any staged preview', async () => {
    const { default: useLyricsStore } = await import('../context/LyricsStore');
    useLyricsStore.getState().setPreviewMode(true);
    useLyricsStore.getState().setPreviewSelectedLine(2);
    useLyricsStore.getState().setLyrics(['a', 'b', 'c']);
    expect(useLyricsStore.getState().previewSelectedLine).toBe(null);
    expect(useLyricsStore.getState().previewMode).toBe(true);
  });
});

describe('useLiveSafetyBridge guard (toast + confirm-override)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('runs immediately when output is hidden (no toast, no modal)', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useLiveSafetyBridge } = await import('../hooks/useLiveSafetyBridge.js');
    const showToast = vi.fn();
    const showModal = vi.fn();
    const { result } = renderHook(() =>
      useLiveSafetyBridge({ isOutputOn: false, showToast, showModal }),
    );
    expect(result.current.isLocked).toBe(false);
    const fn = vi.fn(async () => {});
    let outcome;
    await act(async () => {
      outcome = await result.current.guardDestructive('clear-setlist', fn);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ blocked: false, overridden: false });
    expect(showToast).not.toHaveBeenCalled();
    expect(showModal).not.toHaveBeenCalled();
  });

  it('blocks while live: toasts and waits for confirm-override (cancel keeps screen safe)', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useLiveSafetyBridge } = await import('../hooks/useLiveSafetyBridge.js');
    const showToast = vi.fn();
    const showModal = vi.fn(async () => 'cancel');
    const { result } = renderHook(() =>
      useLiveSafetyBridge({ isOutputOn: true, showToast, showModal }),
    );
    expect(result.current.isLocked).toBe(true);
    const fn = vi.fn(async () => {});
    let outcome;
    await act(async () => {
      outcome = await result.current.guardDestructive('remove-setlist', fn);
    });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0].title).toMatch(/live safety/i);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
    expect(outcome).toEqual({ blocked: true, overridden: false });
  });

  it('override confirmation runs the destructive action while live', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useLiveSafetyBridge } = await import('../hooks/useLiveSafetyBridge.js');
    const showToast = vi.fn();
    const showModal = vi.fn(async () => 'override');
    const { result } = renderHook(() =>
      useLiveSafetyBridge({ isOutputOn: true, showToast, showModal }),
    );
    const fn = vi.fn(async () => {});
    let outcome;
    await act(async () => {
      outcome = await result.current.guardDestructive('clear-setlist', fn);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ blocked: true, overridden: true });
  });
});
