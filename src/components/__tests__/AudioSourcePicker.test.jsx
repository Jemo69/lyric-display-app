/**
 * AudioSourcePicker tests — cold-by-default UI: no enumeration, no
 * permission prompt, and no AudioContext until the operator acts.
 *
 * jsdom provides none of the audio APIs; everything is mocked explicitly.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, act, waitFor } from '@testing-library/react';
import AudioSourcePicker from '../Speech/AudioSourcePicker';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';

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

  return { state, getUserMedia, enumerateDevices };
}

function installWebAudioMocks() {
  const contexts = [];
  const nodes = [];

  class MockAudioContext {
    constructor(options = {}) {
      this.sampleRate = options.sampleRate || 48000;
      this.state = 'running';
      this.audioWorklet = { addModule: vi.fn(async () => {}) };
      this.close = vi.fn(async () => {
        this.state = 'closed';
      });
      this.suspend = vi.fn(async () => {
        this.state = 'suspended';
      });
      this.resume = vi.fn(async () => {
        this.state = 'running';
      });
      this.createMediaStreamSource = vi.fn((stream) => ({
        stream,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      contexts.push(this);
    }
  }

  class MockAudioWorkletNode {
    constructor(context, name, options) {
      this.context = context;
      this.name = name;
      this.options = options;
      this.port = {
        onmessage: null,
        postMessage: vi.fn(),
        close: vi.fn(),
      };
      this.connect = vi.fn();
      this.disconnect = vi.fn();
      nodes.push(this);
    }
  }

  window.AudioContext = MockAudioContext;
  globalThis.AudioWorkletNode = MockAudioWorkletNode;

  return { contexts, nodes };
}

function deliver(node, message) {
  if (!node || !node.port.onmessage) return false;
  if (node.context.state !== 'running') return false;
  node.port.onmessage({ data: message });
  return true;
}

const STANDARD_INPUTS = [
  { deviceId: 'mic-1', label: 'Built-in Microphone' },
  { deviceId: 'usb-1', label: 'Focusrite USB Audio Interface' },
  { deviceId: 'loop-1', label: 'Stereo Mix (Realtek)' },
  { deviceId: 'dante-1', label: 'Dante RX 1-2' },
];

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

const flushMicrotasks = async (ticks = 12) => {
  await act(async () => {
    for (let i = 0; i < ticks; i += 1) await Promise.resolve();
  });
};

describe('AudioSourcePicker', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disabled: renders only the muted line — no prompt, no microphone access', () => {
    const media = installMediaMocks({ inputs: STANDARD_INPUTS });
    const web = installWebAudioMocks();
    resetStore({ enabled: false });

    render(<AudioSourcePicker />);

    expect(screen.getByTestId('audio-source-picker-disabled')).toHaveTextContent(
      'Turn on Sermon Assist to choose an audio source.'
    );
    expect(screen.queryByTestId('audio-source-picker')).toBeNull();
    expect(screen.queryByTestId('audio-source-choose')).toBeNull();
    expect(screen.queryByTestId('audio-source-test')).toBeNull();
    expect(screen.queryAllByTestId(/audio-group/)).toHaveLength(0);
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(media.enumerateDevices).not.toHaveBeenCalled();
    expect(web.contexts).toHaveLength(0);
  });

  it('enabled but cold: only the "Choose audio source" button', () => {
    const media = installMediaMocks({ inputs: STANDARD_INPUTS });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<AudioSourcePicker />);

    expect(screen.getByTestId('audio-source-picker')).toBeInTheDocument();
    expect(screen.getByTestId('audio-source-choose')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/audio-group/)).toHaveLength(0);
    expect(screen.queryByTestId('audio-source-test')).toBeNull();
    // Nothing touched a device just by rendering.
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(media.enumerateDevices).not.toHaveBeenCalled();
    expect(web.contexts).toHaveLength(0);
  });

  it('denied: one explanatory row with Retry — never rows of blanks', async () => {
    const media = installMediaMocks({
      inputs: STANDARD_INPUTS,
      permission: 'denied',
    });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<AudioSourcePicker />);
    fireEvent.click(screen.getByTestId('audio-source-choose'));

    await waitFor(() => {
      expect(screen.getByTestId('audio-source-denied')).toBeInTheDocument();
    });

    const row = screen.getByTestId('audio-source-denied');
    expect(row).toHaveTextContent(/denied/i);
    expect(row).toHaveTextContent(/Microphone/i);
    expect(screen.getByTestId('audio-source-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-source-choose')).toBeNull();
    expect(screen.queryAllByTestId(/audio-source-option/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/audio-group/)).toHaveLength(0);
    expect(media.enumerateDevices).not.toHaveBeenCalled();
    // A denial never even constructs an AudioContext.
    expect(web.contexts).toHaveLength(0);
  });

  it('ready: grouped sections with real labels, network group included, selection persists', async () => {
    const media = installMediaMocks({ inputs: STANDARD_INPUTS });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<AudioSourcePicker />);
    fireEvent.click(screen.getByTestId('audio-source-choose'));

    await waitFor(() => {
      expect(screen.getByTestId('audio-group-microphones')).toBeInTheDocument();
    });

    // The label trap is over: every row shows a real label.
    expect(screen.getByTestId('audio-group-microphones')).toHaveTextContent('Built-in Microphone');
    expect(screen.getByTestId('audio-group-usb-and-line')).toHaveTextContent(
      'Focusrite USB Audio Interface'
    );
    expect(screen.getByTestId('audio-group-loopback-monitor')).toHaveTextContent('Stereo Mix (Realtek)');
    expect(screen.getByTestId('audio-group-network')).toHaveTextContent('Dante RX 1-2');
    // Helper lines under the groups users do not know to look for.
    expect(screen.getByTestId('audio-group-loopback-monitor')).toHaveTextContent(/BlackHole/);
    expect(screen.getByTestId('audio-group-network')).toHaveTextContent(/digital console/);
    expect(screen.getByTestId('audio-source-system-default')).toBeInTheDocument();
    expect(screen.getByTestId('audio-source-test')).toBeInTheDocument();

    // Not capturing yet → no VU meter row.
    expect(screen.queryByTestId('audio-source-vu')).toBeNull();

    fireEvent.click(screen.getByTestId('audio-source-option-dante-1'));
    expect(screen.getByTestId('audio-source-option-dante-1')).toHaveAttribute('aria-pressed', 'true');
    expect(useSpeechStore.getState().audio).toMatchObject({
      sourceId: 'dante-1',
      sourceKind: 'network',
      lastSourceLabel: 'Dante RX 1-2',
    });

    fireEvent.click(screen.getByTestId('audio-source-system-default'));
    expect(useSpeechStore.getState().audio.sourceId).toBeNull();

    // Status "listening" (someone armed) brings up the live VU row.
    await act(async () => {
      useSpeechStore.setState({ status: 'listening' });
    });
    expect(screen.getByTestId('audio-source-vu')).toBeInTheDocument();
    expect(screen.getByTestId('audio-source-clipped')).toHaveTextContent('OK');

    // Only the permission probe has ever opened the mic here.
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(media.state.tracks.every((t) => t.readyState === 'ended')).toBe(true);
    // No AudioContext until someone actually tests or arms.
    expect(web.contexts).toHaveLength(0);
  });

  it('the 3-second test meter auto-stops and fully tears down', async () => {
    const media = installMediaMocks({ inputs: STANDARD_INPUTS });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<AudioSourcePicker />);
    fireEvent.click(screen.getByTestId('audio-source-choose'));
    await waitFor(() => {
      expect(screen.getByTestId('audio-source-test')).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('audio-source-test'));
    await flushMicrotasks();

    // Device open, metering, no transcription armed (store untouched).
    expect(screen.getByTestId('audio-source-test-meter')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-source-test')).toBeNull();
    expect(useSpeechStore.getState().status).toBe('idle');
    expect(web.contexts).toHaveLength(1);
    expect(web.contexts[0].state).toBe('running');
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(1);

    // A live meter responds to worklet messages.
    const node = web.nodes[web.nodes.length - 1];
    act(() => {
      deliver(node, { rms: 0.5, peak: 0.9, clipped: true });
    });
    expect(screen.getByTestId('audio-source-test-bar').style.width).not.toBe('0%');
    expect(screen.getByTestId('audio-source-test-clip')).toHaveTextContent('Clipping');

    // 3000 ms later: auto-stop, device released, context closed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.queryByTestId('audio-source-test-meter')).toBeNull();
    expect(screen.getByTestId('audio-source-test')).toBeInTheDocument();
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
    expect(web.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(web.contexts[0].state).toBe('closed');
    expect(useSpeechStore.getState().status).toBe('idle');
  });

  it('the explicit Stop button tears the test meter down immediately', async () => {
    const media = installMediaMocks({ inputs: STANDARD_INPUTS });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<AudioSourcePicker />);
    fireEvent.click(screen.getByTestId('audio-source-choose'));
    await waitFor(() => {
      expect(screen.getByTestId('audio-source-test')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('audio-source-test'));
    await flushMicrotasks();
    expect(screen.getByTestId('audio-source-test-meter')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('audio-source-test-stop'));
    await flushMicrotasks();

    expect(screen.queryByTestId('audio-source-test-meter')).toBeNull();
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
    expect(web.contexts[0].state).toBe('closed');
  });
});
