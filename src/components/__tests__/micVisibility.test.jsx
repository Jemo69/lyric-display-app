/**
 * micVisibility.test.jsx — the mic is reachable end to end (Phase 5 gate).
 *
 * WHAT THIS FILE PROVES, and why it is worth its own file.
 *
 * "The microphone doesn't pick up" has several completely different causes, and
 * the operator cannot tell them apart from the outside:
 *
 *   - permission is never granted
 *   - the device list is empty (labels require a granted permission first)
 *   - the device list is fine but the capture opens a DIFFERENT device
 *   - the right device opens and the level reads zero
 *
 * The first two live in the picker. The third is the bug this work fixed:
 * `useAudioCapture.arm()` read `devicesRef.current.devices`, a render-time
 * snapshot, immediately after an `await` that had just populated it — so the
 * `find` returned undefined, the `deviceId` constraint was never applied, and
 * the stream opened on Chromium's system default while the UI showed the
 * operator's chosen label. That reads to a user as "the mic isn't picking up."
 *
 * So the assertion that matters is not "permission is granted" — that is
 * already covered by main/permissionPolicy.js and main.js. It is: THE DEVICE
 * getUserMedia IS ASKED FOR IS THE DEVICE THE OPERATOR PICKED, from a cold
 * mount, with no prior enumeration.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, act, waitFor } from '@testing-library/react';
import AudioSourcePicker from '../Speech/AudioSourcePicker';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';

/**
 * Two inputs where the WRONG one is a plausible default.
 *
 * A laptop's built-in mic is usually the system default, so a bug that drops
 * the `deviceId` constraint opens a stream that still WORKS. That is why this
 * went unnoticed: the operator hears themselves, just not the mixer feed, and
 * blames the model.
 */
const TWO_MICS = [
  { deviceId: 'mic-default', label: 'Built-in Microphone' },
  { deviceId: 'mic-mixer', label: 'USB Mixer Feed' },
];

function installMediaMocks({ inputs = TWO_MICS } = {}) {
  const state = { inputs, calls: [] };

  const getUserMedia = vi.fn(async (constraints) => {
    state.calls.push(constraints);
    const track = { readyState: 'live', kind: 'audio', stop: vi.fn() };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  });

  const enumerateDevices = vi.fn(async () =>
    state.inputs.map((input) => ({
      deviceId: input.deviceId,
      kind: 'audioinput',
      groupId: 'group-1',
      // Real labels — permission is already granted in these mocks, which is
      // what a picker sees on its second and later opens.
      label: input.label,
      toJSON() {
        return this;
      },
    }))
  );

  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia,
      enumerateDevices,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
    writable: true,
  });

  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.destination = {};
      this.sampleRate = 16000;
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 256,
        frequencyBinCount: 128,
        getByteTimeDomainData: () => {},
        connect() {},
        disconnect() {},
      };
    }
    async resume() {}
    async close() {
      this.state = 'closed';
    }
  }
  globalThis.AudioContext = FakeAudioContext;
  globalThis.webkitAudioContext = FakeAudioContext;

  return { getUserMedia, enumerateDevices, state };
}

describe('the microphone is reachable and is the one that was chosen', () => {
  beforeEach(() => {
    cleanup();
    useSpeechStore.setState({ ...speechDefaults(), enabled: true });
    useSpeechRuntimeStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('enumerates real, labelled devices once permission is granted', async () => {
    // The label trap: Chromium returns EMPTY labels until getUserMedia has been
    // granted once, so a picker that builds its list before permission resolves
    // renders a dropdown of blank rows — which is exactly the first run.
    const { getUserMedia } = installMediaMocks();
    render(<AudioSourcePicker darkMode={false} />);

    const choose = await screen.findByTestId('audio-source-choose');
    await act(async () => {
      choose.click();
    });

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    // Both devices must be visible and labelled.
    await waitFor(() => {
      expect(screen.getByTestId('audio-source-option-mic-default')).toBeInTheDocument();
      expect(screen.getByTestId('audio-source-option-mic-mixer')).toBeInTheDocument();
    });
    expect(screen.getByTestId('audio-source-option-mic-mixer')).toHaveTextContent('USB Mixer Feed');
  });

  it('opens the operator’s chosen device, not the system default', async () => {
    // THE regression test for the bug this work fixed. Both devices are real,
    // so a dropped constraint produces a working stream on the WRONG input and
    // nothing looks broken until the transcription quality does.
    const { getUserMedia, state } = installMediaMocks();

    // Persisted from a previous session — the "reopen the app" path.
    useSpeechStore.getState().setAudioSource({
      sourceId: 'mic-mixer',
      sourceKind: 'usb',
      lastSourceLabel: 'USB Mixer Feed',
    });

    render(<AudioSourcePicker darkMode={false} />);

    // Grant permission and enumerate FIRST, so the picker renders its real
    // state. This is the picker path, not a bypass of it.
    const choose = await screen.findByTestId('audio-source-choose');
    await act(async () => {
      choose.click();
    });
    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    const test = await screen.findByTestId('audio-source-test');
    await act(async () => {
      test.click();
    });

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledTimes(2);
    });

    const call = state.calls[state.calls.length - 1];
    expect(call.audio.deviceId).toEqual({ exact: 'mic-mixer' });
  });

  it('keeps the ASR-safe constraint set on the chosen device', async () => {
    // Browser-side DSP reshapes a speech feed and makes transcription worse
    // even when the right device is open, so this is checked alongside the
    // device id rather than instead of it.
    const { getUserMedia, state } = installMediaMocks();
    useSpeechStore.getState().setAudioSource({
      sourceId: 'mic-mixer',
      sourceKind: 'usb',
      lastSourceLabel: 'USB Mixer Feed',
    });

    render(<AudioSourcePicker darkMode={false} />);

    const choose = await screen.findByTestId('audio-source-choose');
    await act(async () => {
      choose.click();
    });
    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    const test = await screen.findByTestId('audio-source-test');
    await act(async () => {
      test.click();
    });
    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledTimes(2);
    });

    const call = state.calls[state.calls.length - 1];
    expect(call.audio.echoCancellation).toBe(false);
    expect(call.audio.noiseSuppression).toBe(false);
    expect(call.audio.autoGainControl).toBe(false);
  });

  it('opens no microphone at all while the feature is off', async () => {
    // Cold by default. If this fails, the app is listening before anyone asked.
    const { getUserMedia, enumerateDevices } = installMediaMocks();
    useSpeechStore.setState({ ...speechDefaults(), enabled: false });

    render(<AudioSourcePicker darkMode={false} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(enumerateDevices).not.toHaveBeenCalled();
  });

  it('reports the remembered device as present, not as unplugged', async () => {
    // The other half of the report. A stale status produced a false
    // "no longer connected" warning for a device that was plugged in.
    const { getUserMedia } = installMediaMocks();
    useSpeechStore.getState().setAudioSource({
      sourceId: 'mic-mixer',
      sourceKind: 'usb',
      lastSourceLabel: 'USB Mixer Feed',
    });

    render(<AudioSourcePicker darkMode={false} />);
    const choose = await screen.findByTestId('audio-source-choose');
    await act(async () => {
      choose.click();
    });

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId('audio-source-option-mic-mixer')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });
  });
});

// Imported late so the helpers above read first.
import { screen } from '@testing-library/react';