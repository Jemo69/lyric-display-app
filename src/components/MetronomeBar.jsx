import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, Play, Square, Settings2 } from 'lucide-react';
import useMetronome from '../hooks/useMetronome';
import {
  AUDIO_CHANNEL_OPTIONS,
  CLICK_SOUND_OPTIONS,
} from '../utils/metronome';
import MetronomeVisualizer from './MetronomeVisualizer';

/**
 * Metronome, ported from FreeShow's `Metronome.svelte` +
 * `MetronomeInputs.svelte` + `MetronomeOptions`.
 *
 * FreeShow gives the metronome a block of its own in the audio drawer. The
 * operator sidebar here has to stay short — the outputs carry the Bible verses
 * and the sidebar is the only place they are *not* visible, so it cannot grow a
 * third stacked panel. Instead the whole thing is one horizontal row: transport,
 * tempo, beats, beat indicator, options. The sweep line runs across the full
 * width of the row, so the visualizer costs horizontal space it was going to
 * waste anyway rather than any vertical space at all.
 *
 * Nothing in this component renders lyric or Bible text.
 */

const TEMPO_MIN = 1;
const TEMPO_MAX = 320;
const BEATS_MIN = 1;
const BEATS_MAX = 16;

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Compact [- value +] stepper. FreeShow uses a full number input; the
 *  stepper keeps the same min/max bounds in far less width. */
const Stepper = ({ label, value, min, max, step = 1, suffix, onChange, darkMode, disabled, testId }) => {
  const [draft, setDraft] = useState(String(value));
  const lastProp = useRef(value);

  // Keep the text in step with external changes (a reset, a restored preset)
  // without stomping on what the operator is currently typing.
  useEffect(() => {
    if (value !== lastProp.current) {
      lastProp.current = value;
      setDraft(String(value));
    }
  }, [value]);

  const commit = (raw) => {
    const parsed = Math.round(parseFloat(raw));
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    lastProp.current = next;
    setDraft(String(next));
    onChange(next);
  };

  const nudge = (delta) => {
    const next = Math.min(max, Math.max(min, (parseFloat(draft) || value) + delta));
    setDraft(String(next));
    lastProp.current = next;
    onChange(next);
  };

  return (
    <div
      className={cx(
        'flex items-center gap-1 rounded-lg border px-1 py-0.5',
        darkMode ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-white'
      )}
    >
      <span
        className={cx(
          'select-none pl-1 pr-0.5 text-[10px] font-bold uppercase tracking-wide',
          darkMode ? 'text-gray-400' : 'text-gray-500'
        )}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => nudge(-step)}
        disabled={disabled}
        aria-label={`Decrease ${label}`}
        className={cx(
          'rounded p-0.5 transition-colors disabled:opacity-40',
          darkMode ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        data-testid={testId}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.target.value);
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            nudge(step);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(-step);
          }
        }}
        className={cx(
          'w-9 bg-transparent text-center text-xs font-bold tabular-nums focus:outline-none',
          darkMode ? 'text-gray-100' : 'text-gray-900'
        )}
      />
      {suffix && (
        <span className={cx('select-none text-[10px]', darkMode ? 'text-gray-500' : 'text-gray-400')}>{suffix}</span>
      )}
      <button
        type="button"
        onClick={() => nudge(step)}
        disabled={disabled}
        aria-label={`Increase ${label}`}
        className={cx(
          'rounded p-0.5 transition-colors disabled:opacity-40',
          darkMode ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
};

const selectClass = (darkMode) =>
  cx(
    'rounded border px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1',
    darkMode
      ? 'border-gray-700 bg-gray-900 text-gray-200 focus:ring-sky-400'
      : 'border-gray-300 bg-white text-gray-700 focus:ring-sky-500'
  );

const MetronomeBar = ({ darkMode = false, disabled = false }) => {
  const {
    playing,
    timer,
    settings,
    start,
    stop,
    setValue,
    setClickSound,
    setClickSoundFile,
    getAudioOutputs,
    songBPM,
    startFromSongBPM,
  } = useMetronome();

  const [showOptions, setShowOptions] = useState(false);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const fileInputs = { hi: useRef(null), lo: useRef(null) };

  // FreeShow lists audio outputs on mount (AudioPlayer.getOutputs()).
  useEffect(() => {
    let cancelled = false;
    getAudioOutputs().then((devices) => {
      if (!cancelled) setAudioOutputs(devices);
    });
    return () => {
      cancelled = true;
    };
  }, [getAudioOutputs]);

  // Deliberately no unmount cleanup: the operator sidebar unmounts when the
  // operator switches to Bible mode, and a click that dies mid-song because
  // somebody changed the content tab would be a live-service hazard. The
  // transport is explicit — only the stop button stops the click, as in
  // FreeShow.

  const toggle = useCallback(() => {
    if (playing) stop();
    else start();
  }, [playing, start, stop]);

  const { tempo, beats, volume, clickSound, audioOutput, audioChannel, clickSoundHi, clickSoundLo } = settings;

  return (
    <section
      data-testid="metronome-bar"
      aria-label="Metronome"
      className={cx(
        'mb-4 overflow-hidden rounded-xl border',
        darkMode ? 'border-gray-700 bg-gray-950/30' : 'border-gray-200 bg-white'
      )}
    >
      {/* One horizontal row: transport, tempo, beats, indicator, options. */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          data-testid="metronome-toggle"
          aria-pressed={playing}
          title={playing ? 'Stop metronome' : 'Start metronome'}
          className={cx(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40',
            darkMode ? 'focus-visible:ring-sky-300 focus-visible:ring-offset-gray-950' : 'focus-visible:ring-sky-500 focus-visible:ring-offset-white',
            playing
              ? darkMode
                ? 'bg-amber-500 text-gray-950'
                : 'bg-amber-500 text-white'
              : darkMode
                ? 'bg-sky-600 text-white hover:bg-sky-500'
                : 'bg-sky-600 text-white hover:bg-sky-700'
          )}
        >
          {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
        </button>

        <Stepper
          label="BPM"
          value={tempo}
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          step={1}
          onChange={(v) => setValue('tempo', v)}
          darkMode={darkMode}
          disabled={disabled}
          testId="metronome-tempo"
        />

        <Stepper
          label="Beats"
          value={beats}
          min={BEATS_MIN}
          max={BEATS_MAX}
          onChange={(v) => setValue('beats', v)}
          darkMode={darkMode}
          disabled={disabled}
          testId="metronome-beats"
        />

        {/* FreeShow's `metadataBPM` start path. It only surfaces when the loaded
            song actually carries a BPM, so it costs nothing when it cannot help. */}
        {songBPM && (
          <button
            type="button"
            onClick={startFromSongBPM}
            disabled={disabled}
            data-testid="metronome-song-bpm"
            title={`Start at the song's tempo (${songBPM} BPM)`}
            className={cx(
              'flex h-7 flex-shrink-0 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-40',
              'focus-visible:outline-none focus-visible:ring-2',
              tempo === songBPM && playing
                ? darkMode
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                  : 'border-amber-400 bg-amber-100 text-amber-800'
                : darkMode
                  ? 'border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-100 focus-visible:ring-sky-300'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:ring-sky-500'
            )}
          >
            <span>song</span>
            <span className="tabular-nums">{songBPM}</span>
          </button>
        )}

        <MetronomeVisualizer
          beat={timer.beat}
          timeToNext={timer.timeToNext}
          tempo={tempo}
          beats={beats}
          darkMode={darkMode}
        />

        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          aria-expanded={showOptions}
          aria-controls="metronome-options"
          data-testid="metronome-options-toggle"
          title="Metronome options"
          className={cx(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors',
            'focus-visible:outline-none focus-visible:ring-2',
            darkMode
              ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-100 focus-visible:ring-sky-300'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:ring-sky-500',
            showOptions && (darkMode ? 'bg-gray-800 text-sky-300' : 'bg-gray-100 text-sky-700')
          )}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* The chips and the sweep are decorative; a screen reader still needs to
          know the click is running and where it is in the bar. */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="metronome-status">
        {playing ? `Metronome playing, ${tempo} beats per minute, beat ${timer.beat} of ${beats}` : 'Metronome stopped'}
      </p>

      {showOptions && (
        <div
          id="metronome-options"
          data-testid="metronome-options"
          className={cx(
            'flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-[11px]',
            darkMode ? 'border-gray-800 text-gray-300' : 'border-gray-100 text-gray-600'
          )}
        >
          <label className="flex items-center gap-2">
            <span className="font-semibold">Volume</span>
            <input
              type="range"
              min={1}
              max={300}
              defaultValue={Math.round(volume * 100)}
              disabled={disabled}
              data-testid="metronome-volume"
              onMouseUp={(e) => setValue('volume', Number(e.target.value) / 100)}
              onTouchEnd={(e) => setValue('volume', Number(e.target.value) / 100)}
              onKeyUp={(e) => setValue('volume', Number(e.target.value) / 100)}
              className="h-1 w-24 cursor-pointer accent-sky-500"
            />
            <span className="w-9 text-right tabular-nums">{Math.round(volume * 100)}%</span>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-semibold">Click</span>
            <select
              value={clickSound || 'metal'}
              disabled={disabled || playing}
              data-testid="metronome-click-sound"
              onChange={(e) => setClickSound(e.target.value)}
              className={selectClass(darkMode)}
            >
              {CLICK_SOUND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-semibold">Channel</span>
            <select
              value={audioChannel || ''}
              disabled={disabled}
              data-testid="metronome-channel"
              onChange={(e) => setValue('audioChannel', e.target.value)}
              className={selectClass(darkMode)}
            >
              {AUDIO_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value || 'stereo'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-semibold">Output</span>
            <select
              value={audioOutput || ''}
              disabled={disabled}
              data-testid="metronome-output"
              onChange={(e) => setValue('audioOutput', e.target.value)}
              className={selectClass(darkMode)}
            >
              <option value="">System default</option>
              {audioOutputs.map((device) => (
                <option key={device.value} value={device.value}>
                  {device.label || 'Unnamed output'}
                </option>
              ))}
            </select>
          </label>

          {clickSound === 'custom' && (
            <div className="flex items-center gap-2" data-testid="metronome-custom-sound">
              {['hi', 'lo'].map((slot) => (
                <React.Fragment key={slot}>
                  <input
                    ref={fileInputs[slot]}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => setClickSoundFile(slot, e.target.files?.[0]?.path || e.target.files?.[0]?.name || '')}
                  />
                  <button
                    type="button"
                    disabled={disabled || playing}
                    onClick={() => fileInputs[slot].current?.click()}
                    className={cx(
                      'flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-40',
                      darkMode
                        ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    <span className="font-semibold">{slot === 'hi' ? 'Accent' : 'Beat'}</span>
                    <span className="max-w-[9rem] truncate opacity-70">
                      {slot === 'hi' ? clickSoundHi || 'pick file…' : clickSoundLo || 'pick file…'}
                    </span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default MetronomeBar;
