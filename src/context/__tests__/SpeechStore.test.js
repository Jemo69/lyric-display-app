import { describe, it, expect, beforeEach, vi } from 'vitest';
import useSpeechStore, { speechDefaults } from '../SpeechStore';

const STORAGE_KEY = 'speech-store';

/** Full default state, including the non-persisted runtime slice. */
const defaultState = () => ({
  ...speechDefaults(),
  status: 'idle',
  health: null,
  lastError: null,
});

const waitHydration = async (store) => {
  if (store.persist?.hasHydrated?.()) return;
  if (store.persist?.onFinishHydration) {
    await new Promise((resolve) => store.persist.onFinishHydration(resolve));
  }
};

/** Import a fresh copy of the store so it rehydrates from localStorage. */
const importFreshStore = async () => {
  vi.resetModules();
  const { default: fresh } = await import('../SpeechStore');
  await waitHydration(fresh);
  return fresh;
};

describe('SpeechStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSpeechStore.setState(defaultState());
  });

  describe('defaults (off by default, cold by default)', () => {
    it('starts disabled, local, and idle', () => {
      const state = useSpeechStore.getState();
      expect(state.enabled).toBe(false);
      expect(state.where).toBe('local');
      expect(state.modelId).toBe('large-v3');
      expect(state.providerId).toBe('whispercpp');
      expect(state.cloudProviderId).toBeNull();
      expect(state.networkEndpoint).toBeNull();
      expect(state.historyEnabled).toBe(true);
      expect(state.status).toBe('idle');
      expect(state.health).toBeNull();
      expect(state.lastError).toBeNull();
    });

    it('starts with the rail collapsed and the cloud badge visible', () => {
      const { ui } = useSpeechStore.getState();
      expect(ui.railCollapsed).toBe(true);
      expect(ui.railWidth).toBe(340);
      expect(ui.cloudBadgeVisible).toBe(true);
    });

    it('has the audio source identity field from day one', () => {
      const { audio } = useSpeechStore.getState();
      expect(audio).toHaveProperty('sourceId', null);
      expect(audio).toHaveProperty('sourceKind', null);
      expect(audio).toHaveProperty('lastSourceLabel', null);
      expect(audio).toHaveProperty('lastSeenAt', null);
    });
  });

  describe('actions', () => {
    it('flips the master switch and restores every default on reset', () => {
      useSpeechStore.getState().setEnabled(true);
      expect(useSpeechStore.getState().enabled).toBe(true);

      useSpeechStore.getState().setModelId('small');
      useSpeechStore.getState().setUI({ railCollapsed: false, railWidth: 420 });
      useSpeechStore.getState().setStatus('listening');
      useSpeechStore.getState().setLastError('boom');

      useSpeechStore.getState().resetToDefaults();

      const state = useSpeechStore.getState();
      expect(state).toMatchObject(defaultState());
      expect(state.modelId).toBe('large-v3');
      expect(state.ui.railCollapsed).toBe(true);
      expect(state.ui.railWidth).toBe(340);
      expect(state.status).toBe('idle');
      expect(state.lastError).toBeNull();
    });

    it('merges setUI without clobbering sibling ui keys', () => {
      useSpeechStore.getState().setUI({ railWidth: 420 });
      const { ui } = useSpeechStore.getState();
      expect(ui.railWidth).toBe(420);
      expect(ui.railCollapsed).toBe(true);
      expect(ui.cloudBadgeVisible).toBe(true);
    });

    it('merges setAudioSource and stamps lastSeenAt', () => {
      const before = Date.now();
      useSpeechStore.getState().setAudioSource({ sourceId: 'abc', sourceKind: 'loopback' });
      const { audio } = useSpeechStore.getState();
      expect(audio.sourceId).toBe('abc');
      expect(audio.sourceKind).toBe('loopback');
      expect(audio.lastSourceLabel).toBeNull();
      expect(typeof audio.lastSeenAt).toBe('number');
      expect(audio.lastSeenAt).toBeGreaterThanOrEqual(before);
    });

    it('clearAudioSource nulls the source identity but keeps ui intact', () => {
      useSpeechStore.getState().setUI({ railCollapsed: false });
      useSpeechStore.getState().setAudioSource({ sourceId: 'abc', sourceKind: 'microphone', lastSourceLabel: 'USB Mic' });
      useSpeechStore.getState().clearAudioSource();

      const { audio, ui } = useSpeechStore.getState();
      expect(audio.sourceId).toBeNull();
      expect(audio.sourceKind).toBeNull();
      expect(audio.lastSourceLabel).toBeNull();
      expect(audio.lastSeenAt).toBeNull();
      expect(ui.railCollapsed).toBe(false);
    });

    it('rejects an unknown where value', () => {
      useSpeechStore.getState().setWhere('definitely-not-a-mode');
      expect(useSpeechStore.getState().where).toBe('local');
    });
  });

  describe('persistence', () => {
    it('partializes only the persisted slice — never runtime status', () => {
      useSpeechStore.getState().setEnabled(true);

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(persisted.version).toBe(0);
      expect(persisted.state).toHaveProperty('enabled', true);
      expect(persisted.state).toHaveProperty('ui');
      expect(persisted.state).toHaveProperty('audio');
      expect(persisted.state).not.toHaveProperty('status');
      expect(persisted.state).not.toHaveProperty('health');
      expect(persisted.state).not.toHaveProperty('lastError');
    });

    it('migrates a partial blob: model choice survives, missing keys filled from defaults', async () => {
      localStorage.clear();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state: { enabled: true, modelId: 'small' }, version: -1 })
      );

      const fresh = await importFreshStore();
      const state = fresh.getState();

      // the user's choice survives the migration...
      expect(state.modelId).toBe('small');
      expect(state.enabled).toBe(true);
      // ...and every missing key is filled from defaults
      expect(state.where).toBe('local');
      expect(state.providerId).toBe('whispercpp');
      expect(state.historyEnabled).toBe(true);
      expect(state.ui).toEqual({ railCollapsed: true, railWidth: 340, cloudBadgeVisible: true });
      expect(state.audio).toEqual(speechDefaults().audio);
    });

    it('never turns the feature on from a corrupt persisted value', async () => {
      localStorage.clear();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: { enabled: 'yes', ui: null, audio: 'oops', where: 'MARS', status: 'listening' },
          version: 0,
        })
      );

      const fresh = await importFreshStore();
      const state = fresh.getState();

      // A truthy-but-not-boolean `enabled` must collapse to false.
      expect(state.enabled).toBe(false);
      // Malformed nested objects are rebuilt from defaults.
      expect(state.ui).toEqual({ railCollapsed: true, railWidth: 340, cloudBadgeVisible: true });
      expect(state.audio).toEqual(speechDefaults().audio);
      // Unknown mode resets to local; runtime status cannot be resurrected.
      expect(state.where).toBe('local');
      expect(state.status).toBe('idle');
      expect(state.health).toBeNull();
      expect(state.lastError).toBeNull();
    });

    it('keeps runtime status out of storage across a restart', async () => {
      useSpeechStore.getState().setStatus('listening');
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(persisted.state).not.toHaveProperty('status');

      const fresh = await importFreshStore();
      expect(fresh.getState().status).toBe('idle');
    });
  });
});
