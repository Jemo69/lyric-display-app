import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import useLyricsStore from '../context/LyricsStore';
import {
  findTempoKey,
  getAudioOutputs,
  getMetronomeState,
  setShowMetadata,
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
 * `LyricsStore` owns the configuration so it persists across reloads; the engine
 * module owns the live beat clock, because that is per-session state that has no
 * business in storage. The store is authoritative — an effect pushes it into the
 * engine — so a persisted tempo from a previous session is what the engine
 * actually plays rather than the engine's compile-time default.
 */
const useMetronome = () => {
  const metronomeSettings = useLyricsStore((s) => s.metronomeSettings);
  const setMetronomeSettings = useLyricsStore((s) => s.setMetronomeSettings);
  const songMetadata = useLyricsStore((s) => s.songMetadata);

  const state = useSyncExternalStore(subscribeMetronome, getMetronomeState);

  const settingsRef = useRef(metronomeSettings);
  settingsRef.current = metronomeSettings;

  // FreeShow's `getShowBPM()` reads the loaded show's metadata. Keep the engine
  // fed so the `metadataBPM` start path is live rather than pinned to 120.
  useEffect(() => {
    setShowMetadata(songMetadata);
  }, [songMetadata]);

  const syncClickSound = useCallback((next) => {
    updateClickSound({
      clickSound: next.clickSound,
      clickSound_hi: next.clickSoundHi,
      clickSound_lo: next.clickSoundLo,
    });
  }, []);

  /**
   * Store -> engine. Runs for any settings change, including ones that came
   * from outside this hook (a restored preset, a rehydrated blob). This is the
   * only direction that syncs on its own; `startFromSongBPM` writes through
   * explicitly because the engine resolves a value the store does not know yet.
   */
  useEffect(() => {
    const { tempo, beats, volume, audioOutput, audioChannel } = metronomeSettings;
    updateMetronome({ tempo, beats, volume, audioOutput, audioChannel });
    syncClickSound(metronomeSettings);
    // `syncClickSound` is intentionally absent from the deps: this effect keys on
    // the settings object, and it already closes over the current one. Listing
    // the (stable) callback too made the linter-visible dep list imply it needed
    // to change with the settings, which it does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronomeSettings, syncClickSound]);

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
      commit({ [key]: value });
      updateMetronome({ ...settingsRef.current, [key]: value });
    },
    [commit]
  );

  const setClickSoundFile = useCallback(
    (slot, value) => commit(slot === 'hi' ? { clickSoundHi: value } : { clickSoundLo: value }),
    [commit]
  );

  /** The tempo the loaded song declares, or `null` when it declares none. */
  const songBPM = useMemo(() => {
    // Match the engine's own scan in `getShowBPM` — including `tempo`, which is
    // the key the chord-chart parser actually writes (`shared/chords.js`). A scan
    // that only accepted `bpm` could never fire in this app: every producer of
    // `songMetadata` emits `{title, artists, album, year, lyricLines, origin,
    // filePath}`.
    const key = findTempoKey(songMetadata);
    if (!key) return null;
    const bpm = Math.floor(parseFloat(songMetadata[key]));
    return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
  }, [songMetadata]);

  /**
   * FreeShow's `metadataBPM` start path. The engine resolves the tempo from the
   * song metadata, so write it back into the store too — otherwise the click
   * plays at the song tempo while the readout still shows the old one.
   */
  const startFromSongBPM = useCallback(() => {
    start({ metadataBPM: true });
    if (songBPM) commit({ tempo: songBPM });
  }, [commit, songBPM, start]);

  return {
    playing: state.playing,
    timer: state.timer,
    settings: metronomeSettings,
    songBPM,
    start,
    startFromSongBPM,
    stop: useCallback(() => stopMetronome(), []),
    toggle: useCallback(() => toggleMetronome(), []),
    setValue,
    setClickSound: useCallback((clickSound) => setValue('clickSound', clickSound), [setValue]),
    setClickSoundFile,
    getAudioOutputs,
  };
};

export default useMetronome;
