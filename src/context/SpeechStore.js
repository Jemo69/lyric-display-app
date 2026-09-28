import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SpeechStore');

// ---------------------------------------------------------------------------
// Live Sermon Assist — persisted contract (Phase 0)
//
// INVARIANT: OFF BY DEFAULT, COLD BY DEFAULT.
// `enabled` defaults to `false`, and nothing in this module spawns a process,
// opens a socket, requests a permission, touches `navigator.mediaDevices`, or
// makes a network request — on import, on mount, or on rehydrate. Every action
// below is a plain `set`. A corrupt localStorage value must never turn the
// feature on: rehydration sanitizes non-boolean `enabled` back to `false`.
// ---------------------------------------------------------------------------

const VALID_WHERE = ['local', 'network', 'cloud'];
const VALID_STATUS = ['idle', 'starting', 'listening', 'transcribing', 'error'];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// D10: "local" is two axes — `where` = which MACHINE, `providerId` = which RUNTIME.
// Local leads; cloud is one option, not the default. The default model is the
// best model, not the smallest.
export const speechDefaults = () => ({
  enabled: false,
  where: 'local',
  providerId: 'whispercpp',
  modelId: 'large-v3',
  cloudProviderId: null,
  networkEndpoint: null,
  audio: {
    sourceId: null, // stable identity (deviceId), NOT an index
    sourceKind: null, // 'microphone' | 'usb' | 'line' | 'loopback' | 'network'
    lastSourceLabel: null,
    lastSeenAt: null,
  },
  ui: {
    railCollapsed: true,
    railWidth: 340,
    cloudBadgeVisible: true, // section 10: "Show cloud status badge", default ON
  },
  historyEnabled: true, // D9: transcript history ON BY DEFAULT
});

// Non-persisted runtime status — inert in Phase 0, and never written to disk
// so a crash cannot resurrect a stale "listening" state.
const runtimeDefaults = () => ({
  status: 'idle',
  health: null,
  lastError: null,
});

const PERSISTED_KEYS = [
  'enabled',
  'where',
  'providerId',
  'modelId',
  'cloudProviderId',
  'networkEndpoint',
  'audio',
  'ui',
  'historyEnabled',
];

/**
 * Fill missing keys from defaults (shallow top level, deep for `audio`/`ui`)
 * and harden every safety-relevant field against corrupt data. Runs on every
 * rehydrate path (migrate, merge, and onRehydrateStorage) so a future schema
 * change never loses a user's model choice and a corrupt blob never flips the
 * feature on.
 */
const sanitizeStoredState = (input) => {
  const stored = isPlainObject(input) ? input : {};
  const defaults = speechDefaults();

  const out = { ...defaults };
  for (const key of PERSISTED_KEYS) {
    if (stored[key] !== undefined) out[key] = stored[key];
  }

  // The master switch only accepts a literal boolean; "yes"/1/truthy garbage
  // all collapse to `false`.
  out.enabled = out.enabled === true;

  out.where = VALID_WHERE.includes(out.where) ? out.where : defaults.where;

  if (typeof out.providerId !== 'string' || out.providerId.length === 0) {
    out.providerId = defaults.providerId;
  }
  if (typeof out.modelId !== 'string' || out.modelId.length === 0) {
    out.modelId = defaults.modelId;
  }

  out.cloudProviderId =
    typeof out.cloudProviderId === 'string' || out.cloudProviderId === null
      ? out.cloudProviderId
      : defaults.cloudProviderId;
  out.networkEndpoint =
    typeof out.networkEndpoint === 'string' || out.networkEndpoint === null
      ? out.networkEndpoint
      : defaults.networkEndpoint;

  out.audio = isPlainObject(stored.audio)
    ? { ...defaults.audio, ...stored.audio }
    : { ...defaults.audio };
  out.ui = isPlainObject(stored.ui)
    ? { ...defaults.ui, ...stored.ui }
    : { ...defaults.ui };

  out.historyEnabled =
    typeof out.historyEnabled === 'boolean'
      ? out.historyEnabled
      : defaults.historyEnabled;

  return out;
};

const useSpeechStore = create(
  persist(
    (set) => ({
      ...speechDefaults(),
      ...runtimeDefaults(),

      // --- master off switch (invariant 4: cold by default) -----------------
      setEnabled: (enabled) => set({ enabled: Boolean(enabled) }),

      // --- engine configuration (pure state, no side effects) ---------------
      setWhere: (where) =>
        set({ where: VALID_WHERE.includes(where) ? where : 'local' }),
      setProviderId: (providerId) => set({ providerId }),
      setModelId: (modelId) => set({ modelId }),
      setCloudProviderId: (cloudProviderId) => set({ cloudProviderId }),
      setNetworkEndpoint: (networkEndpoint) => set({ networkEndpoint }),

      // --- audio source identity (fields exist from day one) ----------------
      setAudioSource: (partial) =>
        set((state) => ({
          audio: { ...state.audio, ...partial, lastSeenAt: Date.now() },
        })),
      clearAudioSource: () => set({ audio: { ...speechDefaults().audio } }),

      // --- UI (rail) --------------------------------------------------------
      setUI: (partial) => set((state) => ({ ui: { ...state.ui, ...partial } })),
      setHistoryEnabled: (historyEnabled) =>
        set({ historyEnabled: Boolean(historyEnabled) }),

      // --- runtime status (never persisted) ---------------------------------
      setStatus: (status) =>
        set({ status: VALID_STATUS.includes(status) ? status : 'idle' }),
      setHealth: (health) => set({ health }),
      setLastError: (lastError) => set({ lastError }),

      resetToDefaults: () => set({ ...speechDefaults(), ...runtimeDefaults() }),
    }),
    {
      name: 'speech-store',
      version: 0,
      // A crash must not resurrect a stale "listening" state.
      partialize: (state) => ({
        enabled: state.enabled,
        where: state.where,
        providerId: state.providerId,
        modelId: state.modelId,
        cloudProviderId: state.cloudProviderId,
        networkEndpoint: state.networkEndpoint,
        audio: state.audio,
        ui: state.ui,
        historyEnabled: state.historyEnabled,
      }),
      // Older/partial blobs: fill missing keys from defaults (shallow top
      // level, deep `audio`/`ui`) without losing the user's choices.
      migrate: (persisted) => sanitizeStoredState(persisted),
      // `merge`'s return value replaces the store state, so this is the
      // load-bearing guard: it drops persisted runtime fields, fills missing
      // keys, and forces a non-boolean `enabled` to `false`.
      merge: (persistedState, currentState) => {
        const current = isPlainObject(currentState) ? currentState : {};
        return {
          ...current,
          ...sanitizeStoredState(persistedState),
          // Runtime fields come from the live store, never from storage.
          status: current.status ?? 'idle',
          health: current.health ?? null,
          lastError: current.lastError ?? null,
        };
      },
      // Belt and suspenders: sanitize the rehydrated object in place too.
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        Object.assign(state, sanitizeStoredState(state));
        if (!VALID_STATUS.includes(state.status)) state.status = 'idle';
      },
    }
  )
);

log.info('SpeechStore initialized');

export default useSpeechStore;
