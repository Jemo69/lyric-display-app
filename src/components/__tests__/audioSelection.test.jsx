/**
 * audioSelection.test.jsx — the mount/unmount cycle for the audio source.
 *
 * THE BUG THIS FILE EXISTS FOR.
 *
 * Reported: "the audio devices are not picking up somehow. When you set an
 * audio device, if you leave the settings pane, it does not reset."
 *
 * `useAudioDevices` holds `status` in a plain `useState`. When the settings
 * pane closes, the component unmounts and that state is gone. On the NEXT
 * open, `status` is back to 'idle' and `devices` is back to `[]` — but the
 * operator's chosen device is still persisted in SpeechStore.
 *
 * That produces two visible failures, and both are wrong in opposite ways:
 *
 *   1. The picker renders as cold. The operator has to grant permission and
 *      re-enumerate every single time they open the pane, even though the app
 *      already has permission and already knows the answer.
 *
 *   2. WORSE: the "ready" list comes back with the chosen device present, so
 *      `activeSourceMissing` is false and nothing warns — but if enumeration
 *      ever returns a set that does NOT contain the stored id, the pane
 *      claims the remembered input "is no longer connected" for a device that
 *      is plugged in right now. A stale status produced a false unplug warning.
 *
 * The fix is not in this test. The fix is that permission is a FACT about the
 * machine, not a fact about whether a React component happens to be mounted,
 * so it must not be stored in component state.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import { useAudioDevices } from '../../hooks/useAudioDevices';

/** A device list that never changes between calls. */
function installMediaMocks({ inputs = [], permission = 'prompt' } = {}) {
  const state = { permission, inputs, tracks: [] };

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

  const getUserMedia = vi.fn(async () => {
    if (state.permission === 'denied') {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    }
    state.permission = 'granted';
    const tracks = [makeTrack()];
    return { getTracks: () => tracks, getAudioTracks: () => tracks };
  });

  const enumerateDevices = vi.fn(async () =>
    state.inputs.map((input) => ({
      deviceId: input.deviceId,
      kind: 'audioinput',
      groupId: 'group-1',
      label: state.permission === 'granted' ? input.label : '',
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

  return { getUserMedia, enumerateDevices, state };
}

const TWO_MICS = [
  { deviceId: 'mic-a', label: 'Shure SM7B' },
  { deviceId: 'mic-b', label: 'USB Interface' },
];

/** Minimal host so the hook can be exercised directly. */
function Probe({ onReady }) {
  const devices = useAudioDevices();
  onReady(devices);
  return (
    <div>
      <span data-testid="status">{devices.status}</span>
      <span data-testid="count">{devices.devices.length}</span>
      <span data-testid="missing">{String(devices.activeSourceMissing)}</span>
      <span data-testid="selected">{devices.selectedSourceId ?? 'none'}</span>
    </div>
  );
}

describe('audio source selection survives the settings pane closing', () => {
  let captured = null;

  beforeEach(() => {
    cleanup();
    captured = null;
    useSpeechStore.setState({ ...speechDefaults(), enabled: true });
    installMediaMocks({ inputs: TWO_MICS, permission: 'prompt' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mount = () => render(<Probe onReady={(d) => { captured = d; }} />);

  it('keeps the chosen device in the store after the pane unmounts', async () => {
    const first = mount();

    await act(async () => {
      await captured.requestPermission();
    });
    expect(captured.status).toBe('ready');
    expect(captured.devices).toHaveLength(2);

    // The operator picks the second mic.
    await act(async () => {
      captured.selectSource('mic-b');
    });
    expect(useSpeechStore.getState().audio.sourceId).toBe('mic-b');
    expect(useSpeechStore.getState().audio.lastSourceLabel).toBe('USB Interface');

    // Leave the settings pane.
    first.unmount();

    // The choice is still in the store — this is the part that always worked.
    expect(useSpeechStore.getState().audio.sourceId).toBe('mic-b');
  });

  it('does not report the chosen device as unplugged after reopening', async () => {
    const first = mount();

    await act(async () => {
      await captured.requestPermission();
    });
    await act(async () => {
      captured.selectSource('mic-b');
    });
    first.unmount();

    // Reopen the settings pane, permission already granted by the first open.
    installMediaMocks({ inputs: TWO_MICS, permission: 'granted' });
    mount();

    await act(async () => {
      await captured.requestPermission();
    });

    // The device is plugged in. Claiming otherwise is the reported bug.
    expect(captured.activeSourceMissing).toBe(false);
    expect(captured.selectedSourceId).toBe('mic-b');
    expect(captured.devices.map((d) => d.deviceId)).toContain('mic-b');
  });

  it('reopens as COLD and demands permission again on every visit', async () => {
    // This is the other half of the report: "the audio devices are not
    // picking up somehow". After one successful grant, reopening the pane
    // starts over from 'idle' as though permission had never been granted.
    const first = mount();
    await act(async () => {
      await captured.requestPermission();
    });
    expect(captured.status).toBe('ready');
    first.unmount();

    installMediaMocks({ inputs: TWO_MICS, permission: 'granted' });
    mount();

    // THE BUG: status is 'idle' again, even though permission is granted and
    // the device list is knowable without a new prompt.
    expect(captured.status).toBe('idle');
    expect(captured.devices).toHaveLength(0);
  });

  it('still warns when the remembered device really is gone', async () => {
    // The honest half of the feature must keep working: a device that is
    // genuinely unplugged should say so, and should not silently switch.
    useSpeechStore.getState().setAudioSource({
      sourceId: 'mic-gone',
      sourceKind: 'microphone',
      lastSourceLabel: 'Wireless Receiver',
    });

    installMediaMocks({ inputs: TWO_MICS, permission: 'granted' });
    mount();

    await act(async () => {
      await captured.requestPermission();
    });

    expect(captured.activeSourceMissing).toBe(true);
    // The stored id stays put so the device is picked up again when replugged.
    expect(useSpeechStore.getState().audio.sourceId).toBe('mic-gone');
    expect(captured.fallbackNote).toMatch(/no longer connected/i);
  });

  it('does not enumerate or prompt on mount while the feature is off', async () => {
    // Cold-by-default (invariant 4) must survive the fix. This test is the
    // one that would catch a "rehydrate on mount" change that went too far.
    const { getUserMedia, enumerateDevices } = installMediaMocks({
      inputs: TWO_MICS,
      permission: 'prompt',
    });
    useSpeechStore.setState({ ...speechDefaults(), enabled: false });

    mount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(enumerateDevices).not.toHaveBeenCalled();
    expect(captured.status).toBe('idle');
  });
});