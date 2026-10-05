import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatForDisplay } from '@tanstack/hotkeys';
import { GripVertical, PanelRightClose, PanelRightOpen } from 'lucide-react';
import useSpeechStore from '../../context/SpeechStore';
import { useAudioDevices } from '../../hooks/useAudioDevices';
import { useAudioCapture } from '../../hooks/useAudioCapture';
import { usePanicStop } from '../../hooks/usePanicStop';
import { useSpeechRuntime, useSermonAssistToggle } from '../../hooks/useSpeechRuntime';
import AudioSourcePicker from './AudioSourcePicker';
import TranscriptTail from './TranscriptTail';
import SuggestionLanes from './SuggestionLanes';

// Phase 0 placeholder status copy — no engine is attached yet.
const STATUS_LABELS = {
  idle: 'Idle',
  starting: 'Starting',
  listening: 'Listening',
  transcribing: 'Transcribing',
  error: 'Error',
};

// Section 10 privacy requirement: an accurate, always-visible mode indicator.
// Local leads; cloud is one option, not the default.
const modeLabelFor = (state) => {
  if (state.where === 'local') return `Local · ${state.modelId}`;
  if (state.where === 'network') return 'Remote engine';
  return `Cloud · ${state.cloudProviderId ?? 'not configured'}`;
};

// ---------------------------------------------------------------------------
// Input health — pure, exported, and deliberately NOT buried in JSX.
//
// The rail samples `level`/`clipped` from the live meter and passes in how
// long the input has been flat or clipping; this function alone decides what
// the operator is told. It never invents a problem (a quiet first second is
// not silence) and never sugar-coats one (dead input is an error, not a
// warning, because a silent mic loses the entire sermon's text).
// ---------------------------------------------------------------------------

/** Below this smoothed RMS the input counts as flat silence. */
export const SILENCE_LEVEL = 0.01;
/** Flat silence longer than this (while capturing) is reported as an error. */
export const SILENT_MS_LIMIT = 10000;
/** Clipping must persist this long before the health line warns about it. */
export const CLIP_PERSIST_MS = 1000;
/** Cadence at which the health line re-evaluates while capturing. */
const HEALTH_SAMPLE_MS = 500;

/**
 * @param {{level?: number, clipped?: boolean, silentMs?: number,
 *          sourceKind?: 'microphone'|'usb'|'line'|'loopback'|'network'|null}} input
 *   level      — smoothed 0..1 RMS from the meter.
 *   clipped    — TRUE only when clipping has persisted (the caller applies
 *                CLIP_PERSIST_MS); a single clipped frame is shown on the VU
 *                badge but does not earn a health warning.
 *   silentMs   — how long the level has been at/below SILENCE_LEVEL.
 *   sourceKind — the store's audio.sourceKind, for the neutral loopback note.
 * @returns {{tone: 'ok'|'warn'|'error', message: string}}
 */
export function deriveInputHealth({ level = 0, clipped = false, silentMs = 0, sourceKind = null } = {}) {
  if (clipped === true) {
    return {
      tone: 'warn',
      message: 'Input is clipping — lower the source gain or move the mic back.',
    };
  }
  // `level` guards `silentMs`: if the meter is currently audible, whatever
  // the accumulator says, there is no silence to report right now.
  if (silentMs >= SILENT_MS_LIMIT && level <= SILENCE_LEVEL) {
    return {
      tone: 'error',
      message: 'No signal — check the input is not muted and the right device is selected.',
    };
  }
  if (sourceKind === 'loopback') {
    return {
      tone: 'ok',
      message: 'Loopback input — captures what this computer is playing (system audio), not the room.',
    };
  }
  return { tone: 'ok', message: 'Input level is good.' };
}

const healthToneClass = (tone, darkMode) => {
  if (tone === 'error') return darkMode ? 'text-red-400' : 'text-red-600';
  if (tone === 'warn') return darkMode ? 'text-amber-400' : 'text-amber-600';
  return darkMode ? 'text-emerald-400' : 'text-emerald-600';
};

const SermonAssistRail = ({ darkMode, capture, devices, panicCombo, toggleCombo }) => {
  const status = useSpeechStore((state) => state.status);
  const where = useSpeechStore((state) => state.where);
  const modelId = useSpeechStore((state) => state.modelId);
  const cloudProviderId = useSpeechStore((state) => state.cloudProviderId);
  const sourceKind = useSpeechStore((state) => state.audio.sourceKind);
  const lastError = useSpeechStore((state) => state.lastError);
  const ui = useSpeechStore((state) => state.ui);
  const setUI = useSpeechStore((state) => state.setUI);

  const [isResizing, setIsResizing] = useState(false);
  // The device-lost banner stays a banner until the operator asks for the
  // picker — the rail never opens a permission prompt on its own.
  const [showRepick, setShowRepick] = useState(false);
  const containerRef = useRef(null);

  const capturing = capture.capturing === true;

  // --- health sampling ----------------------------------------------------
  // Refs mirror the meter so the interval below reads fresh values without
  // re-registering on every animation-frame-level level change.
  const levelRef = useRef(capture.level);
  const clippedRef = useRef(capture.clipped);
  levelRef.current = capture.level;
  clippedRef.current = capture.clipped;
  const silentSinceRef = useRef(null);
  const clipSinceRef = useRef(null);
  const [health, setHealth] = useState(() =>
    deriveInputHealth({ level: 0, clipped: false, silentMs: 0, sourceKind })
  );
  // Content-equal updates bail out of React instead of re-rendering the rail
  // every 500 ms with an identical sentence.
  const applyHealth = (next) =>
    setHealth((prev) =>
      prev && prev.tone === next.tone && prev.message === next.message ? prev : next
    );

  useEffect(() => {
    if (!capturing) {
      // Nothing is open, so nothing can be wrong — never warn from a closed mic.
      silentSinceRef.current = null;
      clipSinceRef.current = null;
      applyHealth(deriveInputHealth({ level: 0, clipped: false, silentMs: 0, sourceKind }));
      return undefined;
    }
    const sample = () => {
      const now = Date.now();
      if (levelRef.current <= SILENCE_LEVEL) {
        if (silentSinceRef.current === null) silentSinceRef.current = now;
      } else {
        silentSinceRef.current = null;
      }
      if (clippedRef.current) {
        if (clipSinceRef.current === null) clipSinceRef.current = now;
      } else {
        clipSinceRef.current = null;
      }
      setHealth(
        deriveInputHealth({
          level: levelRef.current,
          clipped:
            clipSinceRef.current !== null && now - clipSinceRef.current >= CLIP_PERSIST_MS,
          silentMs: silentSinceRef.current === null ? 0 : now - silentSinceRef.current,
          sourceKind,
        })
      );
    };
    sample();
    const timer = setInterval(sample, HEALTH_SAMPLE_MS);
    return () => clearInterval(timer);
  }, [capturing, sourceKind]);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizing && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      const min = 280;
      const max = Math.max(min + 40, rect.width - 280);
      const clamped = Math.min(Math.max(newWidth, min), max);
      // only update if within bounds — avoids jitter at edges
      if (newWidth >= min && newWidth <= max) {
        setUI({ railWidth: clamped });
      } else if (newWidth < min) {
        setUI({ railWidth: min });
      } else if (newWidth > max) {
        setUI({ railWidth: max });
      }
    }
  }, [isResizing, setUI]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // devicechange: the remembered source vanished (or came back). Detection
  // itself lives in useAudioDevices; this is where the operator acts on it.
  const deviceLost = devices.activeSourceMissing === true;

  // Collapsed: a narrow summon affordance on the right edge — nothing else.
  // The panic-stop listener still lives on `document` (mounted above this
  // branch), so the key works here too.
  if (ui.railCollapsed) {
    return (
      <aside
        className={`flex-shrink-0 self-stretch flex flex-col items-center border-l w-8 py-2 ${
          darkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'
        }`}
      >
        <button
          type="button"
          data-testid="sermon-assist-open"
          aria-label="Open Sermon Assist rail"
          title="Open Sermon Assist"
          onClick={() => setUI({ railCollapsed: false })}
          className={`p-1.5 rounded-md transition-colors ${
            darkMode
              ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  const sectionTitleClass = `text-[11px] font-bold uppercase tracking-wider ${
    darkMode ? 'text-gray-400' : 'text-gray-500'
  }`;
  const cardClass = `rounded-xl border p-5 space-y-4 transition-all ${
    darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
  }`;
  const vuWidth = `${Math.min(100, Math.max(0, Math.round(capture.level * 100)))}%`;

  return (
    <aside
      ref={containerRef}
      style={{ width: ui.railWidth }}
      className={`relative flex-shrink-0 flex flex-col h-full min-h-0 border-l transition-[width] duration-300 ease-in-out ${
        darkMode
          ? 'border-gray-800 bg-gray-950 text-gray-100'
          : 'border-gray-200 bg-white text-gray-900'
      }`}
    >
      {/* Resize Handle — right-side rail: handle sits on the panel's LEFT edge */}
      <div
        onMouseDown={startResizing}
        className={`absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize z-30 group flex items-center justify-center hover:bg-blue-500/20 transition-colors`}
      >
        <div className={`w-1 h-full bg-transparent group-hover:bg-blue-500/30 transition-colors`}></div>
        <GripVertical className="absolute w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Header */}
      <div
        className={`flex-shrink-0 flex items-center justify-between gap-2 border-b px-4 py-3 ${
          darkMode ? 'border-gray-800' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider truncate">
            Sermon Assist
          </span>
          <span
            data-testid="speech-status-chip"
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              status === 'error'
                ? 'border-red-500/40 text-red-500'
                : darkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-400'
                  : 'border-gray-200 bg-gray-100 text-gray-500'
            }`}
          >
            {STATUS_LABELS[status] ?? 'Idle'}
          </span>
        </div>
        <button
          type="button"
          data-testid="sermon-assist-collapse"
          aria-label="Collapse Sermon Assist rail"
          title="Collapse Sermon Assist"
          onClick={() => setUI({ railCollapsed: true })}
          className={`p-1.5 rounded-md transition-colors ${
            darkMode
              ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {/* devicechange: the active input vanished mid-service. A banner with
            an action — never a dead dropdown and a flat meter. */}
        {deviceLost && (
          <div
            data-testid="speech-device-lost-banner"
            role="alert"
            className={`rounded-xl border p-4 space-y-2 ${
              darkMode
                ? 'border-amber-500/40 bg-amber-950/40 text-amber-200'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider">Audio input lost</p>
            <p className="text-xs leading-relaxed">
              {devices.fallbackNote ||
                'The selected audio input is no longer connected. Choose another input to keep transcription running.'}
            </p>
            <button
              type="button"
              data-testid="speech-device-repick"
              onClick={() => setShowRepick(true)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                darkMode
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                  : 'border-amber-400 bg-white text-amber-900 hover:bg-amber-100'
              }`}
            >
              Choose another input
            </button>
            {/* The picker is self-contained and cold until one of its own
                buttons is pressed — safe to host inline here. */}
            {showRepick && (
              <div className="pt-2">
                <AudioSourcePicker darkMode={darkMode} />
              </div>
            )}
          </div>
        )}

        {/* Input monitor — the meter lives in the rail so the operator sees
            levels without opening settings, and the health line says the
            honest thing about the chosen input. */}
        <section aria-label="Input monitor" className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <h3 className={sectionTitleClass}>Input</h3>
            {capturing ? (
              <button
                type="button"
                data-testid="speech-stop-listening"
                onClick={() => {
                  capture.stop();
                }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  darkMode
                    ? 'border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Stop microphone
              </button>
            ) : (
              <button
                type="button"
                data-testid="speech-resume-listening"
                onClick={() => {
                  // The ONLY thing that opens the microphone: an explicit
                  // press. Never on mount, never on rehydrate, never on
                  // enabled-flip — launch always starts closed.
                  capture.arm();
                }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  darkMode
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
                    : 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Resume sermon transcription
              </button>
            )}
          </div>

          {capturing ? (
            <div className="space-y-2" data-testid="speech-rail-vu">
              <div className={`h-2 rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div
                  data-testid="speech-rail-vu-bar"
                  className={`h-2 rounded ${capture.clipped ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: vuWidth }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Input level
                </span>
                <span
                  data-testid="speech-rail-clip"
                  className={`text-[11px] font-semibold ${
                    capture.clipped ? 'text-red-500' : darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  {capture.clipped ? 'CLIP' : 'OK'}
                </span>
              </div>
              <p
                data-testid="speech-input-health"
                data-tone={health.tone}
                className={`text-xs leading-snug ${healthToneClass(health.tone, darkMode)}`}
              >
                {health.message}
              </p>
            </div>
          ) : (
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Microphone is closed. Nothing is captured until you press resume.
            </p>
          )}

          {status === 'error' && lastError ? (
            <p data-testid="speech-last-error" className="text-xs text-red-500">
              {lastError}
            </p>
          ) : null}
        </section>

        {/* Live transcript tail: settled finals plus the one unsettled partial,
            and the history browser behind an explicit press (never on mount). */}
        <TranscriptTail darkMode={darkMode} cardClass={cardClass} titleClass={sectionTitleClass} />

        {/* Three proposal lanes. A card is a proposal — it reaches an output
            only when the operator presses its own Send button (D5). */}
        <SuggestionLanes darkMode={darkMode} cardClass={cardClass} titleClass={sectionTitleClass} />

        {/* Section 10: always-visible, accurate mode indicator */}
        <div
          data-testid="speech-mode-indicator"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            darkMode ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          {modeLabelFor({ where, modelId, cloudProviderId })}
        </div>
      </div>

      {/* Footer — the cold-start reality, stated plainly, plus the one key
          the operator needs to know before anything goes wrong. */}
      <div
        className={`flex-shrink-0 border-t px-4 py-3 text-[11px] leading-relaxed space-y-1.5 ${
          darkMode ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'
        }`}
      >
        <p>
          Microphone access is off. No audio is captured or sent until you enable Sermon Assist.
        </p>
        <p
          data-testid="speech-toggle-hint"
          className={darkMode ? 'text-gray-500' : 'text-gray-400'}
        >
          Show or hide this rail: {formatForDisplay(toggleCombo)}.
        </p>
        <p
          data-testid="speech-panic-hint"
          className={darkMode ? 'text-gray-500' : 'text-gray-400'}
        >
          Panic stop: {formatForDisplay(panicCombo)} — mutes and closes the microphone instantly,
          even when this rail is collapsed.
        </p>
      </div>
    </aside>
  );
};

export default function SermonAssistPanel({ darkMode = false }) {
  const enabled = useSpeechStore((state) => state.enabled);

  // ONE capture session for the whole feature, created up here — above the
  // collapsed branch and above the `enabled` exit — so the panic-stop
  // listener holds the same instance that arms the microphone and stays
  // registered no matter how the rail is rendered. All three hooks are cold:
  // no permission, no device, no AudioContext until a user action below.
  const devices = useAudioDevices();
  const capture = useAudioCapture({ devices });
  const panicCombo = usePanicStop(capture);

  // Phase 4 runtime: subscribes to the transcript stream only while the
  // feature is enabled (and unsubscribes on disable), and registers the
  // Mod+Shift+A rail toggle. Neither hook arms the microphone, enables the
  // feature, or persists anything — they are cold listeners.
  useSpeechRuntime(enabled);
  const toggleCombo = useSermonAssistToggle();

  // Phase 0 exit criterion: disabled means hidden entirely — zero DOM nodes.
  if (!enabled) return null;
  return (
    <SermonAssistRail
      darkMode={darkMode}
      capture={capture}
      devices={devices}
      panicCombo={panicCombo}
      toggleCombo={toggleCombo}
    />
  );
}
