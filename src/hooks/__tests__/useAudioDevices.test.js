/**
 * useAudioDevices tests — the device label trap is the whole job.
 *
 * jsdom ships no navigator.mediaDevices, so every capability is mocked
 * here explicitly: nothing is polyfilled for us.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAudioDevices, AUDIO_GROUP_ORDER } from '../useAudioDevices';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';

/**
 * Mock navigator.mediaDevices with Chromium's real behavior: every device
 * comes back with an EMPTY label until getUserMedia permission has been
 * granted at least once.
 */
function installMediaMocks({ inputs = [], permission = 'prompt' } = {}) {
  const state = {
    permission, // 'prompt' | 'granted' | 'denied'
    inputs,
    deviceChangeHandlers: new Set(),
    tracks: [],
  };

  const makeTrack = () => {
    const track = {
      readyState: 'live',
      stop: vi.fn(function stop() {
        track.readyState = 'ended';
      }),
    };
    state.tracks.push(track);
    return track;
  };

  const makeStream = () => {
    const tracks = [makeTrack()];
    return { getTracks: () => tracks, getAudioTracks: () => tracks };
  };

  const getUserMedia = vi.fn(async () => {
    if (state.permission === 'denied') {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    }
    // Pressing "Allow" in the prompt.
    state.permission = 'granted';
    return makeStream();
  });

  const enumerateDevices = vi.fn(async () =>
    state.inputs.map((input) => ({
      deviceId: input.deviceId,
      kind: input.kind || 'audioinput',
      groupId: input.groupId || 'group-1',
      // THE TRAP: blank until permission has resolved at least once.
      label: state.permission === 'granted' ? input.label : '',
      toJSON() {
        return this;
      },
    }))
  );

  const addEventListener = vi.fn((type, handler) => {
    if (type === 'devicechange') state.deviceChangeHandlers.add(handler);
  });
  const removeEventListener = vi.fn((type, handler) => {
    state.deviceChangeHandlers.delete(handler);
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia, enumerateDevices, addEventListener, removeEventListener },
    configurable: true,
    writable: true,
  });

  const fireDeviceChange = async () => {
    for (const handler of [...state.deviceChangeHandlers]) {
      await handler();
    }
  };

  return { state, getUserMedia, enumerateDevices, addEventListener, removeEventListener, fireDeviceChange, makeStream };
}

const resetStore = (overrides = {}) => {
  localStorage.clear();
  useSpeechStore.setState({
    ...speechDefaults(),
    status: 'idle',
    health: null,
    lastError: null,
    ...overrides,
  });
};

describe('useAudioDevices', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never presents a list before permission resolves (the device label trap)', async () => {
    const mock = installMediaMocks({
      inputs: [{ deviceId: 'mic-1', label: 'Built-in Microphone' }],
    });
    const { result } = renderHook(() => useAudioDevices());

    // Cold: no enumeration, no prompt, no list.
    expect(result.current.status).toBe('idle');
    expect(result.current.hasLabels).toBe(false);
    expect(result.current.devices).toEqual([]);
    expect(mock.enumerateDevices).not.toHaveBeenCalled();

    // A naive picker enumerating right now sees only blank labels…
    const blind = await mock.enumerateDevices();
    expect(blind).toHaveLength(1);
    expect(blind[0].label).toBe('');
    // …and this hook still shows nothing rather than rows of blanks.
    expect(result.current.devices).toEqual([]);
    expect(result.current.hasLabels).toBe(false);

    // Permission first, THEN enumerate — in that order, always.
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.hasLabels).toBe(true);
    expect(result.current.devices).toHaveLength(1);
    expect(result.current.devices[0].label).toBe('Built-in Microphone');
    expect(result.current.devices.every((d) => d.label.trim() !== '')).toBe(true);

    // The permission probe is not a capture session: its track is stopped
    // before requestPermission() returns.
    expect(mock.state.tracks).toHaveLength(1);
    expect(mock.state.tracks[0].readyState).toBe('ended');
  });

  it('denied permission yields one explanatory story and zero blank entries', async () => {
    const mock = installMediaMocks({
      inputs: [
        { deviceId: 'mic-1', label: 'Built-in Microphone' },
        { deviceId: 'mic-2', label: 'USB Audio Interface' },
      ],
      permission: 'denied',
    });
    const { result } = renderHook(() => useAudioDevices());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.devices).toEqual([]);
    expect(result.current.hasLabels).toBe(false);
    expect(result.current.groups.microphones).toEqual([]);
    // One human sentence that names the fix — not a list of empty rows.
    expect(result.current.error).toMatch(/denied/i);
    expect(result.current.error).toMatch(/Microphone/);
    expect(result.current.error).toMatch(/System Settings|Settings/);
    // Never enumerate blind after a denial either.
    expect(mock.enumerateDevices).not.toHaveBeenCalled();
  });

  it('restores the remembered source when it is still connected', async () => {
    installMediaMocks({
      inputs: [
        { deviceId: 'mic-a', label: 'Built-in Microphone' },
        { deviceId: 'mic-b', label: 'USB Audio Interface' },
      ],
    });
    useSpeechStore.setState({
      audio: {
        sourceId: 'mic-b',
        sourceKind: 'usb',
        lastSourceLabel: 'USB Audio Interface',
        lastSeenAt: null,
      },
    });

    const { result } = renderHook(() => useAudioDevices());
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.selectedSourceId).toBe('mic-b');
    expect(result.current.fallbackNote).toBeNull();
    expect(result.current.activeSourceMissing).toBe(false);
  });

  it('falls back honestly when the remembered source is gone — never a silent switch', async () => {
    installMediaMocks({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    useSpeechStore.setState({
      audio: {
        sourceId: 'ghost-id',
        sourceKind: 'usb',
        lastSourceLabel: 'USB Audio Interface',
        lastSeenAt: null,
      },
    });

    const { result } = renderHook(() => useAudioDevices());
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe('ready');
    // One clear line plus a stated fallback…
    expect(result.current.fallbackNote).toMatch(/USB Audio Interface/);
    expect(result.current.fallbackNote).toMatch(/no longer connected/);
    expect(result.current.fallbackNote).toMatch(/system default/);
    // …and the remembered identity is NOT silently rewritten, so the
    // device is picked up again when it is replugged.
    expect(result.current.selectedSourceId).toBe('ghost-id');
    expect(result.current.activeSourceMissing).toBe(true);
    // The working default is still reachable as an explicit choice.
    expect(result.current.devices.some((d) => d.deviceId === 'mic-a')).toBe(true);
  });

  it('identity is the stable device id, not the list index', async () => {
    const mock = installMediaMocks({
      inputs: [
        { deviceId: 'mic-a', label: 'Built-in Microphone' },
        { deviceId: 'mic-b', label: 'USB Audio Interface' },
      ],
    });
    useSpeechStore.setState({
      audio: {
        sourceId: 'mic-b',
        sourceKind: 'usb',
        lastSourceLabel: 'USB Audio Interface',
        lastSeenAt: null,
      },
    });

    const { result } = renderHook(() => useAudioDevices());
    await act(async () => {
      await result.current.requestPermission();
    });
    expect(result.current.selectedSourceId).toBe('mic-b');

    // A reboot reshuffles enumeration order — mic-b is now first.
    mock.state.inputs = [
      { deviceId: 'mic-b', label: 'USB Audio Interface' },
      { deviceId: 'mic-a', label: 'Built-in Microphone' },
    ];
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.devices[0].deviceId).toBe('mic-b');
    expect(result.current.devices[1].deviceId).toBe('mic-a');
    // Still the same remembered device — selected by id, never by index.
    expect(result.current.selectedSourceId).toBe('mic-b');
    expect(result.current.fallbackNote).toBeNull();
  });

  it('hotplug: devicechange with the active source removed flags activeSourceMissing', async () => {
    const mock = installMediaMocks({
      inputs: [
        { deviceId: 'mic-a', label: 'Built-in Microphone' },
        { deviceId: 'mic-b', label: 'USB Audio Interface' },
      ],
    });
    useSpeechStore.setState({
      audio: {
        sourceId: 'mic-b',
        sourceKind: 'usb',
        lastSourceLabel: 'USB Audio Interface',
        lastSeenAt: null,
      },
    });

    const { result, unmount } = renderHook(() => useAudioDevices());
    await act(async () => {
      await result.current.requestPermission();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.activeSourceMissing).toBe(false);
    expect(mock.addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));

    // The USB interface is unplugged mid-service.
    mock.state.inputs = [{ deviceId: 'mic-a', label: 'Built-in Microphone' }];
    await act(async () => {
      await mock.fireDeviceChange();
    });

    await waitFor(() => {
      expect(result.current.activeSourceMissing).toBe(true);
    });
    expect(result.current.fallbackNote).toMatch(/no longer connected/);

    // The devicechange listener is torn down with the hook.
    unmount();
    expect(mock.removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
  });

  it('enumerates and selects a network source with no local hardware input at all', async () => {
    const mock = installMediaMocks({
      inputs: [{ deviceId: 'dante-1', label: 'Dante RX 1-2' }],
    });
    const { result } = renderHook(() => useAudioDevices());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe('ready');
    // A church feeding a digital console over the network is a normal
    // deployment: enumerate, group, and select without any local input.
    expect(result.current.groups.network).toHaveLength(1);
    expect(result.current.groups.network[0].label).toBe('Dante RX 1-2');
    expect(result.current.groups.microphones).toHaveLength(0);
    // The groups object always carries every key — the UI never has an
    // undefined group to render.
    expect(Object.keys(result.current.groups)).toEqual(AUDIO_GROUP_ORDER);

    await act(async () => {
      expect(result.current.selectSource('dante-1')).toBe(true);
    });
    expect(useSpeechStore.getState().audio).toMatchObject({
      sourceId: 'dante-1',
      sourceKind: 'network',
      lastSourceLabel: 'Dante RX 1-2',
    });
    expect(useSpeechStore.getState().audio.lastSeenAt).toBeGreaterThan(0);

    // devicechange subscription exists so hotplug keeps working remotely.
    expect(mock.addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
  });

  it('classifies loopback and USB/Line inputs into their own groups', async () => {
    installMediaMocks({
      inputs: [
        { deviceId: 'built-in', label: 'MacBook Pro Microphone' },
        { deviceId: 'usb', label: 'Focusrite USB Audio Interface' },
        { deviceId: 'stereo-mix', label: 'Stereo Mix (Realtek)' },
        { deviceId: 'blackhole', label: 'BlackHole 2ch' },
        { deviceId: 'line', label: 'Line in 1' },
      ],
    });

    const { result } = renderHook(() => useAudioDevices());
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.groups.microphones.map((d) => d.deviceId)).toEqual(['built-in']);
    expect(result.current.groups['usb-and-line'].map((d) => d.deviceId)).toEqual(['usb', 'line']);
    expect(result.current.groups['loopback-monitor'].map((d) => d.deviceId)).toEqual([
      'stereo-mix',
      'blackhole',
    ]);
    await act(async () => {
      expect(result.current.selectSource('blackhole')).toBe(true);
    });
    expect(useSpeechStore.getState().audio.sourceKind).toBe('loopback');
    await act(async () => {
      expect(result.current.selectSource('line')).toBe(true);
    });
    expect(useSpeechStore.getState().audio.sourceKind).toBe('line');
  });

  it('refresh while still cold is a no-op — it must never enumerate blind', async () => {
    const mock = installMediaMocks({
      inputs: [{ deviceId: 'mic-1', label: 'Built-in Microphone' }],
    });
    const { result } = renderHook(() => useAudioDevices());

    let outcome;
    await act(async () => {
      outcome = await result.current.refresh();
    });

    expect(outcome).toEqual({ ok: false, reason: 'not-granted' });
    expect(mock.enumerateDevices).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.devices).toEqual([]);
  });

  it('reports unsupported environments instead of failing silently', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useAudioDevices());

    let outcome;
    await act(async () => {
      outcome = await result.current.requestPermission();
    });

    expect(outcome).toEqual({ ok: false, reason: 'unsupported' });
    expect(result.current.status).toBe('unsupported');
    expect(result.current.error).toMatch(/no audio input API/i);
  });
});
