import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createLogger } from '../utils/logger.js';
import { DEFAULT_BINDINGS, ALL_SHORTCUT_IDS } from '../constants/hotkeyBindings';

const log = createLogger('HotkeysStore');

// Merge stored bindings with defaults so newly-added shortcuts get a default
// even for users with an older persisted state.
function mergeWithDefaults(stored = {}) {
  const merged = { ...DEFAULT_BINDINGS, ...stored };
  // Drop any bindings whose id no longer exists.
  const cleaned = {};
  for (const id of ALL_SHORTCUT_IDS) {
    if (merged[id]) cleaned[id] = merged[id];
  }
  return cleaned;
}

const useHotkeysStore = create(
  persist(
    (set, get) => ({
      bindings: { ...DEFAULT_BINDINGS },

      setBinding: (id, combo) => {
        if (!ALL_SHORTCUT_IDS.includes(id)) {
          log.warn('Attempted to set unknown shortcut binding', { id });
          return;
        }
        log.info('Shortcut binding updated', { id, combo });
        set((state) => ({
          bindings: { ...state.bindings, [id]: combo },
        }));
      },

      resetBinding: (id) => {
        if (!DEFAULT_BINDINGS[id]) return;
        set((state) => ({
          bindings: { ...state.bindings, [id]: DEFAULT_BINDINGS[id] },
        }));
      },

      resetBindings: () => {
        log.info('All shortcut bindings reset to defaults');
        set({ bindings: { ...DEFAULT_BINDINGS } });
      },

      getBinding: (id) => get().bindings[id] || DEFAULT_BINDINGS[id],
    }),
    {
      name: 'hotkeys-store',
      partialize: (state) => ({ bindings: state.bindings }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.bindings = mergeWithDefaults(state.bindings);
      },
    }
  )
);

export default useHotkeysStore;
