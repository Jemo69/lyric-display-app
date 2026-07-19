import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mergeCustomOutputRegistry } from '../../utils/outputs';

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

describe('LyricsStore persistence regression', () => {
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

  describe('mergeCustomOutputRegistry', () => {
    const localRegistry = {
      customOutputs: [{ id: 'custom_side-tv', name: 'Side TV', slug: 'side-tv' }],
      customOutputSettings: { "custom_side-tv": { fontSize: 64 } },
      customOutputEnabled: { "custom_side-tv": true },
    };

    it('preserves local custom outputs when the server registry is empty', () => {
      const result = mergeCustomOutputRegistry(localRegistry, { customOutputs: [], customOutputSettings: {}, customOutputEnabled: {} });
      expect(result.merged).toBe(false);
      expect(result.state.customOutputs).toHaveLength(1);
    });

    it('preserves local custom outputs when server sends nothing', () => {
      const result = mergeCustomOutputRegistry(localRegistry, {});
      expect(result.merged).toBe(false);
      expect(result.state.customOutputs).toHaveLength(1);
    });

    it('applies the server registry when local has no custom outputs', () => {
      const incoming = { customOutputs: [{ id: 'custom_x', name: 'X', slug: 'x' }], customOutputSettings: {}, customOutputEnabled: {} };
      const result = mergeCustomOutputRegistry({ customOutputs: [], customOutputSettings: {}, customOutputEnabled: {} }, incoming);
      expect(result.merged).toBe(true);
      expect(result.state.customOutputs).toHaveLength(1);
    });

    it('applies a non-empty server registry even when local has data', () => {
      const incoming = { customOutputs: [{ id: 'custom_y', name: 'Y', slug: 'y' }], customOutputSettings: {}, customOutputEnabled: {} };
      const result = mergeCustomOutputRegistry(localRegistry, incoming);
      expect(result.merged).toBe(true);
      expect(result.state.customOutputs[0].id).toBe('custom_y');
    });
  });

  it('keeps custom outputs and font settings persisted across restart + empty server currentState', async () => {
    const waitHydration = async (store) => {
      if (store.persist?.hasHydrated?.()) return;
      if (store.persist?.onFinishHydration) {
        await new Promise((resolve) => store.persist.onFinishHydration(resolve));
      }
    };

    const { default: useLyricsStore } = await import('../LyricsStore');
    const store = useLyricsStore;
    await waitHydration(store);

    store.getState().createCustomOutput({ name: 'Side TV', slug: 'side-tv', type: 'regular', sourceOutputKey: 'output1' });
    store.getState().updateOutputSettings('output1', { fontSize: 64, fontStyle: 'Montserrat' });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).state.customOutputs).toHaveLength(1);

    // Simulate app restart: rehydrate from the same localStorage
    vi.resetModules();
    const { default: useLyricsStore2 } = await import('../LyricsStore');
    await waitHydration(useLyricsStore2);

    expect(useLyricsStore2.getState().customOutputs).toHaveLength(1);
    expect(useLyricsStore2.getState().output1Settings?.fontSize).toBe(64);

    // Simulate server sending currentState with EMPTY registry (fresh backend)
    const local = useLyricsStore2.getState();
    const { merged, state } = mergeCustomOutputRegistry(
      { customOutputs: local.customOutputs, customOutputSettings: local.customOutputSettings, customOutputEnabled: local.customOutputEnabled },
      { customOutputs: [], customOutputSettings: {}, customOutputEnabled: {} }
    );
    expect(merged).toBe(false);
    useLyricsStore2.setState(state);

    const persistedAfter = JSON.parse(localStorage.getItem(STORAGE_KEY)).state;
    expect(persistedAfter.customOutputs).toHaveLength(1);
    expect(persistedAfter.customOutputSettings).toHaveProperty('custom_side-tv');
    expect(persistedAfter.output1Settings?.fontSize).toBe(64);
  });
});
