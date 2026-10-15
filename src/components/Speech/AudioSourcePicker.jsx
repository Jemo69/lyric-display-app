/**
 * AudioSourcePicker.jsx — choose (and test) the sermon audio source.
 *
 * Cold by default, twice over:
 *   1. Sermon Assist off → this renders a single muted line. No
 *      enumeration, no permission prompt, no device touch at all.
 *   2. Feature on but permission not yet requested → a "Choose audio source"
 *      button. Never a blank dropdown: Chromium hands out empty labels
 *      before permission, so an eager <select> renders rows of nothing.
 *
 * The "Test this source" button meters the input for three seconds without
 * arming transcription, so the operator can find a working input before the
 * service rather than during it — and the hook guarantees the device is
 * released when the timer expires.
 */

import React, { useRef } from 'react';
import useSpeechStore from '../../context/SpeechStore';
import {
  useAudioDevices,
  AUDIO_GROUP_ORDER,
  AUDIO_GROUP_LABELS,
  AUDIO_GROUP_HELPERS,
} from '../../hooks/useAudioDevices';
import { useAudioCapture } from '../../hooks/useAudioCapture';

const levelWidth = (level) => `${Math.min(100, Math.max(0, Math.round(level * 100)))}%`;

export default function AudioSourcePicker({ darkMode = false }) {
  const enabled = useSpeechStore((state) => state.enabled);
  const storeStatus = useSpeechStore((state) => state.status);

  // Both hooks are cold: no permission, no enumeration, no AudioContext
  // happens here — only on the button handlers below.
  const devices = useAudioDevices();
  const capture = useAudioCapture({ devices });
  const groupsRef = useRef(null);

  // Master switch off: the ONLY thing rendered, and nothing above may touch
  // a device. (The hooks above are inert until their handlers are called.)
  if (!enabled) {
    return (
      <p
        data-testid="audio-source-picker-disabled"
        className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}
      >
        Turn on Sermon Assist to choose an audio source.
      </p>
    );
  }

  const handleTest = () => {
    capture.runSelfTest(devices.selectedSourceId ?? undefined);
  };

  const showVu =
    capture.capturing || storeStatus === 'listening' || storeStatus === 'transcribing';
  const readyWithDevices = devices.status === 'ready' && devices.hasLabels && devices.devices.length > 0;

  const renderRow = (device) => {
    const selected = devices.selectedSourceId === device.deviceId;
    return (
      <button
        key={device.deviceId}
        type="button"
        data-testid={`audio-source-option-${device.deviceId}`}
        aria-pressed={selected}
        onClick={() => devices.selectSource(device.deviceId)}
        className={`w-full flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
          selected
            ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
            : darkMode
              ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <span className="truncate">{device.label}</span>
        {selected ? <span aria-hidden="true">✓</span> : null}
      </button>
    );
  };

  return (
    <div
      data-testid="audio-source-picker"
      className={`space-y-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}
    >
      {/* ---- permission states ------------------------------------------ */}
      {devices.status === 'idle' && (
        <button
          type="button"
          data-testid="audio-source-choose"
          onClick={() => devices.requestPermission()}
          className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
            darkMode
              ? 'border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Choose audio source
        </button>
      )}

      {devices.status === 'requesting' && (
        <p
          data-testid="audio-source-requesting"
          className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
          role="status"
        >
          Requesting microphone access…
        </p>
      )}

      {devices.status === 'denied' && (
        <div
          data-testid="audio-source-denied"
          className={`rounded-md border px-3 py-2 text-xs space-y-2 ${
            darkMode ? 'border-red-500/40 bg-red-950/40 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <p>{devices.error}</p>
          <button
            type="button"
            data-testid="audio-source-retry"
            onClick={() => devices.requestPermission()}
            className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {devices.status === 'unsupported' && (
        <p
          data-testid="audio-source-unsupported"
          className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
        >
          This environment has no audio input API.
        </p>
      )}

      {devices.status === 'error' && (
        <div
          data-testid="audio-source-error"
          className={`rounded-md border px-3 py-2 text-xs space-y-2 ${
            darkMode ? 'border-amber-500/40 bg-amber-950/40 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <p>{devices.error}</p>
          <button
            type="button"
            data-testid="audio-source-retry"
            onClick={() => devices.requestPermission()}
            className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* ---- remembered-but-gone: one line, stated fallback, never silent */}
      {devices.status === 'ready' && devices.activeSourceMissing && (
        <div
          data-testid="audio-source-fallback"
          className={`rounded-md border px-3 py-2 text-xs space-y-2 ${
            darkMode ? 'border-amber-500/40 bg-amber-950/40 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <p>
            {devices.fallbackNote ||
              'Remembered input is no longer connected — using the system default.'}
          </p>
          <button
            type="button"
            data-testid="audio-source-repick"
            onClick={() => groupsRef.current?.focus()}
            className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold"
          >
            Re-pick
          </button>
        </div>
      )}

      {/* ---- ready: grouped rows in the plan's order --------------------- */}
      {devices.status === 'ready' && !readyWithDevices && (
        <p
          data-testid="audio-source-empty"
          className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
        >
          No audio inputs found. Connect an input, then retry.
        </p>
      )}

      {readyWithDevices && (
        <div
          ref={groupsRef}
          tabIndex={-1}
          className="space-y-3 outline-none"
          aria-label="Audio source groups"
        >
          <button
            type="button"
            data-testid="audio-source-system-default"
            aria-pressed={devices.selectedSourceId === null}
            onClick={() => devices.selectSystemDefault()}
            className={`w-full flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
              devices.selectedSourceId === null
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                : darkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="truncate">System default</span>
            {devices.selectedSourceId === null ? <span aria-hidden="true">✓</span> : null}
          </button>

          {AUDIO_GROUP_ORDER.filter((key) => devices.groups[key].length > 0).map((key) => (
            <section key={key} data-testid={`audio-group-${key}`} className="space-y-1">
              <h4
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                {AUDIO_GROUP_LABELS[key]}
              </h4>
              {AUDIO_GROUP_HELPERS[key] && (
                <p className={`text-[11px] leading-snug ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {AUDIO_GROUP_HELPERS[key]}
                </p>
              )}
              <div className="space-y-1">{devices.groups[key].map(renderRow)}</div>
            </section>
          ))}
        </div>
      )}

      {/* ---- test the input for 3 s (metering only, never transcription) -- */}
      {readyWithDevices && !capture.testing && (
        <button
          type="button"
          data-testid="audio-source-test"
          onClick={handleTest}
          className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
            darkMode
              ? 'border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Test this source
        </button>
      )}

      {capture.testing && (
        <div
          data-testid="audio-source-test-meter"
          className={`rounded-md border px-3 py-2 space-y-2 ${
            darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Testing input — stops after 3 seconds.
            </span>
            <button
              type="button"
              data-testid="audio-source-test-stop"
              onClick={() => capture.stopSelfTest()}
              className="rounded-md border border-gray-300 px-2 py-0.5 text-[11px] font-semibold"
            >
              Stop
            </button>
          </div>
          <div className={`h-2 rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <div
              data-testid="audio-source-test-bar"
              className={`h-2 rounded ${capture.clipped ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: levelWidth(capture.level) }}
            />
          </div>
          <span
            data-testid="audio-source-test-clip"
            className={`text-[11px] font-semibold ${capture.clipped ? 'text-red-500' : 'text-gray-400'}`}
          >
            {capture.clipped ? 'Clipping' : 'No clipping'}
          </span>
        </div>
      )}

      {/* ---- live VU while the service is actually capturing ------------- */}
      {showVu && (
        <div
          data-testid="audio-source-vu"
          className={`rounded-md border px-3 py-2 space-y-2 ${
            darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
          }`}
        >
          <span className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Input level
          </span>
          <div className={`h-2 rounded ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <div
              data-testid="audio-source-vu-bar"
              className={`h-2 rounded ${capture.clipped ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: levelWidth(capture.level) }}
            />
          </div>
          <span
            data-testid="audio-source-clipped"
            className={`text-[11px] font-semibold ${capture.clipped ? 'text-red-500' : 'text-gray-400'}`}
          >
            {capture.clipped ? 'CLIP' : 'OK'}
          </span>
        </div>
      )}
    </div>
  );
}
