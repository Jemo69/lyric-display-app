/**
 * useAudioCapture tests — the cold-start guarantees and the teardown
 * guarantee, plus the frame contract the worklet emits into.
 *
 * jsdom has no AudioContext, no AudioWorkletNode and no mediaDevices;
 * every one of them is mocked explicitly below.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAudioCapture } from '../useAudioCapture';
import { encodeFrames, resampleLinear, PCM_PROCESSOR_NAME } from '../../workers/pcmCapture';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';

function installMediaMocks({ inputs = [], permission = 'prompt' } = {}) {
  const state = { permission, inputs, deviceChangeHandlers: new Set(), tracks: [], streams: [] };

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
    const stream = { getTracks: () => tracks, getAudioTracks: () => tracks };
    state.streams.push(stream);
    return stream;
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
      this.options = options;
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
      this.sent = [];
      this.port = {
        onmessage: null,
        postMessage: vi.fn((message) => {
          this.sent.push(message);
        }),
        close: vi.fn(),
      };
      this.connect = vi.fn();
      this.disconnect = vi.fn();
      nodes.push(this);
    }
  }

  window.AudioContext = MockAudioContext;
  globalThis.AudioWorkletNode = MockAudioWorkletNode;

  return { contexts, nodes, MockAudioContext, MockAudioWorkletNode };
}

/**
 * Deliver a worklet → main message the way the browser would. The worklet
 * does not run while its AudioContext is suspended, so messages are dropped
 * for a suspended context — that is what "mute stops frame production"
 * means in a real browser.
 */
function deliver(node, message) {
  if (!node || !node.port.onmessage) return false;
  if (node.context.state !== 'running') return false;
  node.port.onmessage({ data: message });
  return true;
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

const installAll = (opts = {}) => ({
  media: installMediaMocks(opts),
  web: installWebAudioMocks(),
});

describe('useAudioCapture', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('arm is a no-op while the feature is disabled — no microphone access', async () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: false });

    const { result } = renderHook(() => useAudioCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.arm();
    });

    // The "no microphone access until they say yes" guarantee.
    expect(outcome).toEqual({ ok: false, reason: 'disabled' });
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(web.contexts).toHaveLength(0);
    expect(web.nodes).toHaveLength(0);
    expect(useSpeechStore.getState().status).toBe('idle');
  });

  it('opens nothing on mount — not even with the feature already enabled', () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    renderHook(() => useAudioCapture());

    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(web.contexts).toHaveLength(0);
    expect(web.nodes).toHaveLength(0);
  });

  it('arm produces frames, and encodeFrames pins the 1600-sample / 3200-byte contract', async () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    const onFrame = vi.fn();
    const onMeter = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onFrame, onMeter }));

    let outcome;
    await act(async () => {
      outcome = await result.current.arm();
    });

    expect(outcome.ok).toBe(true);
    expect(useSpeechStore.getState().status).toBe('listening');
    expect(result.current.capturing).toBe(true);
    expect(result.current.getLiveTrackCount()).toBe(1);
    expect(web.contexts).toHaveLength(1);
    expect(web.contexts[0].options).toEqual({ sampleRate: 16000 });
    expect(web.contexts[0].audioWorklet.addModule).toHaveBeenCalledTimes(1);
    const workletUrl = web.contexts[0].audioWorklet.addModule.mock.calls[0][0];
    expect(typeof workletUrl).toBe('string');
    expect(workletUrl).toMatch(/pcmWorklet/);

    const node = web.nodes[0];
    expect(node.name).toBe(PCM_PROCESSOR_NAME);

    // A frame message arrives from the worklet → forwarded to onFrame and
    // nowhere else (no store writes, no sockets — Phase 2 wires transport).
    const pcm = new Int16Array(1600);
    act(() => {
      deliver(node, { pcm, samples: 1600, rms: 0.25, peak: 0.5, clipped: false });
    });
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame.mock.calls[0][0]).toMatchObject({ samples: 1600, rms: 0.25, peak: 0.5 });

    // Mid-frame meter message → VU state.
    act(() => {
      deliver(node, { rms: 0.4, peak: 0.6, clipped: true });
    });
    expect(onMeter).toHaveBeenCalledTimes(1);
    expect(result.current.level).toBeGreaterThan(0);
    expect(result.current.clipped).toBe(true);

    // --- the frame contract itself (main-thread twin of the encoder) ----
    const frames = encodeFrames(new Float32Array(1600 * 2 + 7));
    expect(frames).toHaveLength(3);
    for (const frame of frames) {
      expect(frame).toBeInstanceOf(Int16Array);
      expect(frame.length).toBe(1600);
      expect(frame.byteLength).toBe(3200);
    }
    // clamp + half-away-from-zero rounding, mirroring shared/speech
    const edge = encodeFrames([1, -1, 0.5, -0.5, 0]);
    expect(edge[0][0]).toBe(32767);
    expect(edge[0][1]).toBe(-32767);
    expect(edge[0][2]).toBe(16384);
    expect(edge[0][3]).toBe(-16384);
    expect(encodeFrames(new Float32Array(0))).toEqual([]);

    // the documented manual-decimation fallback: 48 kHz → 16 kHz exactly
    const resampled = resampleLinear(new Float32Array(48000).fill(0.5), 48000, 16000);
    expect(resampled).toHaveLength(16000);
    expect(resampled[0]).toBeCloseTo(0.5, 5);
    expect(resampleLinear(new Float32Array(1600), 16000, 16000)).toHaveLength(1600);
  });

  it('teardown five times over: zero live tracks and a closed context every time', async () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    const { result, unmount } = renderHook(() => useAudioCapture());

    for (let round = 0; round < 5; round += 1) {
      let outcome;
      await act(async () => {
        outcome = await result.current.arm();
      });
      expect(outcome.ok).toBe(true);
      expect(result.current.getLiveTrackCount()).toBe(1);
      expect(media.state.tracks[media.state.tracks.length - 1].readyState).toBe('live');

      await act(async () => {
        result.current.teardown();
      });

      // The leak this catches is invisible in development and maddening in
      // production: every track ever opened must be dead by now.
      expect(result.current.getLiveTrackCount()).toBe(0);
      expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);

      const context = web.contexts[round];
      expect(context.close).toHaveBeenCalledTimes(1);
      expect(context.state).toBe('closed');
      expect(useSpeechStore.getState().status).toBe('idle');
      expect(result.current.capturing).toBe(false);
    }

    // Tracks from the permission probe too: nothing anywhere is still live.
    expect(media.state.tracks.length).toBeGreaterThanOrEqual(5);
    expect(media.state.tracks.every((t) => t.readyState === 'ended')).toBe(true);

    // Unmount with a session open must also release the mic.
    await act(async () => {
      await result.current.arm();
    });
    expect(result.current.getLiveTrackCount()).toBe(1);
    unmount();
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
  });

  it('removes every window/document listener it registered, on cleanup', () => {
    installAll();
    resetStore({ enabled: true });

    const windowAdd = vi.spyOn(window, 'addEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useAudioCapture());
    unmount();

    for (const type of ['pagehide', 'beforeunload']) {
      const added = windowAdd.mock.calls.filter((call) => call[0] === type).map((call) => call[1]);
      const removed = windowRemove.mock.calls.filter((call) => call[0] === type).map((call) => call[1]);
      expect(added.length).toBeGreaterThan(0);
      expect(removed).toEqual(added);
    }
    const addedVis = docAdd.mock.calls.filter((call) => call[0] === 'visibilitychange').map((call) => call[1]);
    const removedVis = docRemove.mock.calls.filter((call) => call[0] === 'visibilitychange').map((call) => call[1]);
    expect(addedVis.length).toBeGreaterThan(0);
    expect(removedVis).toEqual(addedVis);
  });

  it('pagehide while armed tears the session down', async () => {
    const { media } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    const { result } = renderHook(() => useAudioCapture());
    await act(async () => {
      const outcome = await result.current.arm();
      expect(outcome.ok).toBe(true);
    });
    expect(result.current.getLiveTrackCount()).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(result.current.getLiveTrackCount()).toBe(0);
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
    expect(useSpeechStore.getState().status).toBe('idle');
  });

  it('mute suspends the context so no frames are produced; unmute resumes', async () => {
    const { web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    const onFrame = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onFrame }));
    await act(async () => {
      const outcome = await result.current.arm();
      expect(outcome.ok).toBe(true);
    });

    const node = web.nodes[0];
    const frame = () => ({ pcm: new Int16Array(1600), samples: 1600, rms: 0.2, peak: 0.3, clipped: false });

    act(() => {
      deliver(node, frame());
    });
    expect(onFrame).toHaveBeenCalledTimes(1);

    await act(async () => {
      const outcome = await result.current.mute();
      expect(outcome.ok).toBe(true);
    });
    expect(web.contexts[0].suspend).toHaveBeenCalledTimes(1);
    expect(result.current.muted).toBe(true);
    expect(result.current.level).toBe(0);

    // Suspended context ⇒ the worklet does not run ⇒ no frame production.
    const delivered = (() => {
      let produced = false;
      act(() => {
        produced = deliver(node, frame());
      });
      return produced;
    })();
    expect(delivered).toBe(false);
    expect(onFrame).toHaveBeenCalledTimes(1);

    await act(async () => {
      const outcome = await result.current.unmute();
      expect(outcome.ok).toBe(true);
    });
    expect(web.contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(result.current.muted).toBe(false);

    act(() => {
      deliver(node, frame());
    });
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it('stop flushes the pending partial frame before releasing everything', async () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    const { result } = renderHook(() => useAudioCapture());
    await act(async () => {
      const outcome = await result.current.arm();
      expect(outcome.ok).toBe(true);
    });

    const node = web.nodes[0];
    await act(async () => {
      await result.current.stop();
    });

    expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'flush' });
    expect(result.current.getLiveTrackCount()).toBe(0);
    expect(media.state.tracks.every((t) => t.readyState === 'ended')).toBe(true);
    expect(web.contexts[0].state).toBe('closed');
    expect(useSpeechStore.getState().status).toBe('idle');
  });

  it('turning the feature off while armed releases the microphone', async () => {
    const { media } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    const { result } = renderHook(() => useAudioCapture());
    await act(async () => {
      const outcome = await result.current.arm();
      expect(outcome.ok).toBe(true);
    });
    expect(result.current.getLiveTrackCount()).toBe(1);

    // The operator flips the master switch; capture code only ever reads it.
    await act(async () => {
      useSpeechStore.setState({ enabled: false });
    });

    await waitFor(() => {
      expect(result.current.getLiveTrackCount()).toBe(0);
    });
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
    expect(useSpeechStore.getState().enabled).toBe(false);
    expect(useSpeechStore.getState().status).toBe('idle');
  });

  it('a denied arm fails through to the store status, with nothing left open', async () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
      permission: 'denied',
    });
    resetStore({ enabled: true });

    const { result } = renderHook(() => useAudioCapture());
    let outcome;
    await act(async () => {
      outcome = await result.current.arm();
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('denied');
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(web.contexts).toHaveLength(0);
    expect(useSpeechStore.getState().status).toBe('error');
    expect(useSpeechStore.getState().lastError).toMatch(/denied/i);
    expect(result.current.getLiveTrackCount()).toBe(0);
  });
});
