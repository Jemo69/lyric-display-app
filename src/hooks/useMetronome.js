import { useCallback, useRef, useSyncExternalStore } from 'react';
import useLyricsStore from '../context/LyricsStore';
import {
  getAudioOutputs,
  getMetronomeState,
  startMetronome,
  stopMetronome,
  subscribeMetronome,
  toggleMetronome,
  updateClickSound,
  updateMetronome,
} from '../utils/metronome';

/**
 * React binding for the FreeShow metronome engine.
 *
 * Persisted configuration lives in `LyricsStore` (so a reload keeps the tempo
 * and the click sound), while the live beat clock lives in the engine module.
 * The engine is a singleton, so this hook keeps a ref of the latest store
 * values and merges them into every control call.
 */
const useMetronome = () => {
  const metronomeSettings = useLyricsStore((s) => s.metronomeSettings);
  const setMetronomeSettings = useLyricsStore((s) => s.setMetronomeSettings);
  const songMetadata = useLyricsStore((s) => s.songMetadata);

  const state = useSyncExternalStore(subscribeMetronome, getMetronomeState);

  const settingsRef = useRef(metronomeSettings);
  settingsRef.current = metronomeSettings;

  const syncClickSound = useCallback((next) => {
    updateClickSound({
      clickSound: next.clickSound,
      clickSound_hi: next.clickSoundHi,
      clickSound_lo: next.clickSoundLo,
    });
  }, []);

  const commit = useCallback(
    (patch) => {
      const next = { ...settingsRef.current, ...patch };
      setMetronomeSettings(next);
      return next;
    },
    [setMetronomeSettings]
  );

  const start = useCallback(
    (overrides = {}) => startMetronome({ ...settingsRef.current, ...overrides }),
    []
  );

  /**
   * Tempo / beats / volume. FreeShow routes these through `updateMetronome`,
   * which restarts the clock when the tempo changes mid-play, and leaves a
   * running click sound alone.
   */
  const setValue = useCallback(
    (key, value) => {
      const next = commit({ [key]: value });
      updateMetronome({ ...settingsRef.current, [key]: value });
      if (key === 'clickSound') syncClickSound(next);
    },
    [commit, syncClickSound]
  );

  const setClickSoundFile = useCallback(
    (slot, value) => {
      const next = commit(slot === 'hi' ? { clickSoundHi: value } : { clickSoundLo: value });
      syncClickSound(next);
    },
    [commit, syncClickSound]
  );

  return {
    playing: state.playing,
    timer: state.timer,
    settings: metronomeSettings,
    songMetadata,
    start,
    stop: useCallback(() => stopMetronome(), []),
    toggle: useCallback(() => toggleMetronome(), []),
    setValue,
    setClickSound: useCallback((clickSound) => setValue('clickSound', clickSound), [setValue]),
    setClickSoundFile,
    getAudioOutputs,
  };
};

export default useMetronome;
