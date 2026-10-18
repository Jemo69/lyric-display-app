/**
 * captureDeviceSelection.test.jsx — the device actually opened must be the
 * device the operator chose.
 *
 * THE BUG THIS FILE EXISTS FOR.
 *
 * Reported: "the audio devices are not picking up somehow."
 *
 * `useAudioCapture.start()` does, in order:
 *
 *   1.  const permission = await devices.requestPermission();   // enumerates
 *   2.  const remembered  = devices.devices.find(...)          // <-- STALE
 *   3.  getUserMedia({ audio: { deviceId: { exact: rememberedId } } })
 *
 * Step 2 reads `devicesRef.current.devices`, and `devicesRef.current` is only
 * reassigned during RENDER. Step 1 is an await. React has not re-rendered when
 * step 2 executes, so `devicesRef.current.devices` is still the array the hook
 * had before enumeration — which is `[]` on a fresh mount.
 *
 * The `find` therefore returns `undefined`, `remembered` is falsy, and the
 * `deviceId` constraint is never applied. The stream opens on whatever
 * Chromium's system default happens to be.
 *
 * WHY THAT IS DANGEROUS RATHER THAN ANNOYING. The operator picked a USB
 * interface because the built-in laptop mic is the wrong one — the mixer feed
 * lives on the interface. The app reports the correct remembered label in the
 * picker, because the STORE is correct. So the UI says one thing while the
 * microphone captures another, and the only symptom a user notices is bad
 * transcription quality that looks like a bad ASR model.
 *
 * The fix belongs in the hook: enumerate, and use the list that enumeration
 * actually returned, rather than a render-time snapshot of it.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, act, waitFor } from '@testing-library/react';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import { useAudioCapture } from '../../hooks/useAudioCapture';
import { useAudioDevices } from '../../hooks/useAudioDevices';

function installMediaMocks({ inputs = [], permission = 'granted' } = {}) {
  const state = { permission, inputs, tracks: [], calls: [] };

  const makeTrack = () => {
    const track = {
      readyState: 'live',
      kind: 'audio',
      stop: vi.fn(function stop() {
        track.readyState = 'ended';
      }),
    };
    state.tracks.push(track);
    return track;
  };

  const getUserMedia = vi.fn(async (constraints) => {
    state.calls.push(constraints);
    const tracks = [makeTrack()];
    return { getTracks: () => tracks, getAudioTracks: () => tracks };
  });

  const enumerateDevices = vi.fn(async () =>
    state.inputs.map((input) => ({
      deviceId: input.deviceId,
      kind: 'audioinput',
      groupId: 'group-1',
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

  // A minimal AudioContext. The real capture graph is exercised elsewhere;
  // here the point is WHICH device getUserMedia was asked for.
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

const TWO_MICS = [
  { deviceId: 'mic-a', label: 'Laptop Built-in Mic' },
  { deviceId: 'usb-iface', label: 'USB Audio Interface' },
];

function Probe({ onReady }) {
  const devices = useAudioDevices();
  const capture = useAudioCapture({ devices });
  onReady({ devices, capture });
  return <div />;
}

describe('capture opens the device the operator chose', () => {
  let captured = null;

  beforeEach(() => {
    cleanup();
    captured = null;
    useSpeechStore.setState({ ...speechDefaults(), enabled: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mount = () => render(<Probe onReady={(api) => { captured = api; }} />);

  it('applies the remembered deviceId constraint when arming from a fresh mount', async () => {
    const { getUserMedia, state } = installMediaMocks({
      inputs: TWO_MICS,
      permission: 'granted',
    });

    // The operator's earlier choice is already persisted — this is the
    // "reopen the app" path, which is exactly when the stale snapshot bites.
    useSpeechStore.getState().setAudioSource({
      sourceId: 'usb-iface',
      sourceKind: 'usb',
      lastSourceLabel: 'USB Audio Interface',
    });

    mount();

    // No prior requestPermission() in this mount's lifetime. The list is empty
    // until start() enumerates it.
    expect(captured.devices.devices).toHaveLength(0);

    await act(async () => {
      await captured.capture.arm();
    });

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    // The capture call (the LAST one) is the real stream. The permission probe
    // is the first and carries no deviceId by design.
    const captureCall = state.calls[state.calls.length - 1];
    expect(captureCall.audio.deviceId).toEqual({ exact: 'usb-iface' });
  });

  it('omits deviceId when the operator explicitly chose the system default', async () => {
    const { getUserMedia, state } = installMediaMocks({
      inputs: TWO_MICS,
      permission: 'granted',
    });

    // No remembered source. Chromium must choose.
    useSpeechStore.getState().clearAudioSource();
    mount();

    await act(async () => {
      await captured.capture.arm();
    });

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    const captureCall = state.calls[state.calls.length - 1];
    expect(captureCall.audio.deviceId).toBeUndefined();
  });

  it('omits deviceId when the remembered device is genuinely absent', async () => {
    const { getUserMedia, state } = installMediaMocks({
      inputs: [TWO_MICS[0]], // usb-iface unplugged
      permission: 'granted',
    });

    useSpeechStore.getState().setAudioSource({
      sourceId: 'usb-iface',
      sourceKind: 'usb',
      lastSourceLabel: 'USB Audio Interface',
    });

    mount();

    await act(async () => {
      await captured.capture.arm();
    });

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    // Constraining to an unplugged id throws OverconstrainedError and the
    // whole capture fails. Falling back to the default is the documented
    // behaviour, and the picker tells the operator in one line.
    const captureCall = state.calls[state.calls.length - 1];
    expect(captureCall.audio.deviceId).toBeUndefined();
  });

  it('keeps the ASR-safe constraint set regardless of device selection', async () => {
    const { getUserMedia, state } = installMediaMocks({
      inputs: TWO_MICS,
      permission: 'granted',
    });

    useSpeechStore.getState().setAudioSource({
      sourceId: 'usb-iface',
      sourceKind: 'usb',
      lastSourceLabel: 'USB Audio Interface',
    });

    mount();

    await act(async () => {
      await captured.capture.arm();
    });

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    const captureCall = state.calls[state.calls.length - 1];
    // Browser DSP reshapes a speech feed and makes transcription worse.
    expect(captureCall.audio.echoCancellation).toBe(false);
    expect(captureCall.audio.noiseSuppression).toBe(false);
    expect(captureCall.audio.autoGainControl).toBe(false);
  });
});