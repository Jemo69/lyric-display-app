/**
 * SermonAssistRail tests — Phase 1 surfaces of Live Sermon Assist:
 *
 *   1. unmute-on-launch: a persisted `status:"listening"` blob rehydrates to
 *      idle, `enabled:true` renders without a single getUserMedia call, and
 *      the rail offers an explicit "Resume sermon transcription" press;
 *   2. the device-lost banner: shown only when `enabled && activeSourceMissing`,
 *      carrying the fallback note, and revealing the existing AudioSourcePicker
 *      inline on demand — then clearing itself when the device returns;
 *   3. panic stop while the rail is collapsed (the listener lives above the
 *      collapsed branch) plus the footer hint that makes the key discoverable;
 *   4. the rail VU meter and the device-health line driven by deriveInputHealth.
 *
 * jsdom provides no mediaDevices and no AudioContext; both are mocked here.
 * Timers are faked only where time itself is the behaviour under test.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { formatForDisplay } from '@tanstack/hotkeys';
import SermonAssistPanel from '../Speech/SermonAssistPanel';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import useHotkeysStore from '../../context/HotkeysStore';
import { DEFAULT_BINDINGS } from '../../constants/hotkeyBindings';

// --- mocks -----------------------------------------------------------------

function installMediaMocks({ inputs = [], permission = 'prompt' } = {}) {
  const state = { permission, inputs, tracks: [], deviceChangeHandlers: new Set() };

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

  const addEventListener = vi.fn((type, handler) => {
    if (type === 'devicechange') state.deviceChangeHandlers.add(handler);
  });
  const removeEventListener = vi.fn((type, handler) => {
    if (type === 'devicechange') state.deviceChangeHandlers.delete(handler);
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia, enumerateDevices, addEventListener, removeEventListener },
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
      this.port = { onmessage: null, postMessage: vi.fn(), close: vi.fn() };
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

// --- helpers ---------------------------------------------------------------

const MIC = { deviceId: 'mic-1', label: 'Built-in Microphone' };

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

/** Await every pending microtask (arm() is a pure promise chain). */
const flush = async (ticks = 24) => {
  await act(async () => {
    for (let i = 0; i < ticks; i += 1) await Promise.resolve();
  });
};

/** Mod+Shift+M — Mod resolves to Control on this (linux) platform. */
const pressPanic = () =>
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'M',
        code: 'KeyM',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
  });

const freshStoreHydration = async (store) => {
  if (store.persist?.hasHydrated?.()) return;
  if (store.persist?.onFinishHydration) {
    await new Promise((resolve) => store.persist.onFinishHydration(resolve));
  }
};

const STORAGE_KEY = 'speech-store';

const expandRail = () => fireEvent.click(screen.getByTestId('sermon-assist-open'));

describe('SermonAssistRail (Phase 1 surfaces)', () => {
  beforeEach(() => {
    resetStore();
    useHotkeysStore.getState().resetBindings();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --- off by default ------------------------------------------------------

  it('disabled: zero DOM nodes — no rail, no banner, no media access', () => {
    const media = installMediaMocks({ inputs: [MIC] });
    installWebAudioMocks();

    const { container } = render(<SermonAssistPanel />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('speech-device-lost-banner')).toBeNull();
    expect(screen.queryByTestId('speech-panic-hint')).toBeNull();
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(media.enumerateDevices).not.toHaveBeenCalled();
  });

  // --- unmute-on-launch ----------------------------------------------------

  it('enabled but cold: zero device calls, explicit resume affordance, discoverable panic hint', () => {
    const media = installMediaMocks({ inputs: [MIC] });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<SermonAssistPanel darkMode={false} />);
    expandRail();

    // THE GUARD: enabled:true alone never opens a microphone — not one call.
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(media.enumerateDevices).not.toHaveBeenCalled();
    expect(web.contexts).toHaveLength(0);

    // The only way forward is a press.
    expect(screen.getByTestId('speech-resume-listening')).toHaveTextContent(
      'Resume sermon transcription'
    );
    expect(screen.getByText(/Microphone is closed/)).toBeInTheDocument();
    expect(screen.queryByTestId('speech-rail-vu')).toBeNull();

    // The panic key is discoverable in the rail footer.
    expect(screen.getByTestId('speech-panic-hint')).toHaveTextContent(
      `Panic stop: ${formatForDisplay(DEFAULT_BINDINGS.panicStop)}`
    );

    // Nothing is lost, so nothing is flagged.
    expect(screen.queryByTestId('speech-device-lost-banner')).toBeNull();
  });

  it('runtime status never lands in localStorage — a crash cannot resurrect "listening"', () => {
    resetStore();
    useSpeechStore.setState({ status: 'listening', health: { ok: true }, lastError: 'boom' });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('"status"');
    expect(raw).not.toContain('"health"');
    expect(raw).not.toContain('"lastError"');
  });

  // --- device lost ---------------------------------------------------------

  it('device lost mid-service: banner with the fallback note, inline picker on demand, self-clears on replug', async () => {
    const media = installMediaMocks({ inputs: [MIC] });
    const web = installWebAudioMocks();
    resetStore({
      enabled: true,
      audio: {
        ...speechDefaults().audio,
        sourceId: 'ghost-1',
        sourceKind: 'microphone',
        lastSourceLabel: 'Ghost Mic',
      },
    });

    render(<SermonAssistPanel darkMode={false} />);
    expandRail();
    fireEvent.click(screen.getByTestId('speech-resume-listening'));
    await flush();

    expect(useSpeechStore.getState().status).toBe('listening');
    expect(web.contexts).toHaveLength(1);

    // `enabled && activeSourceMissing` — the remembered input is not in the
    // enumerated list, so the banner states the fallback out loud.
    const banner = screen.getByTestId('speech-device-lost-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent(/no longer connected/i);
    expect(banner).toHaveTextContent('Ghost Mic');
    expect(screen.getByTestId('speech-stop-listening')).toBeInTheDocument();

    // The action reveals the existing picker — cold until one of its own
    // buttons is pressed (no permission prompt from merely opening it).
    fireEvent.click(screen.getByTestId('speech-device-repick'));
    expect(screen.getByTestId('audio-source-picker')).toBeInTheDocument();
    expect(screen.getByTestId('audio-source-choose')).toBeInTheDocument();
    expect(media.getUserMedia).toHaveBeenCalledTimes(2); // probe + arm only

    // Replug: the captured devicechange handler re-enumerates and the
    // banner clears itself without a reload.
    media.state.inputs.push({ deviceId: 'ghost-1', label: 'Ghost Mic' });
    await act(async () => {
      for (const handler of [...media.state.deviceChangeHandlers]) handler();
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });

    expect(screen.queryByTestId('speech-device-lost-banner')).toBeNull();
    // The picker is part of the banner block: with the device back, the whole
    // warning (and its inline picker) retires — nothing left to act on.
    expect(screen.queryByTestId('audio-source-picker')).toBeNull();
    expect(screen.queryByTestId('audio-source-fallback')).toBeNull();
  });

  it('no banner while merely enabled — the missing device requires an actual missing device', () => {
    const media = installMediaMocks({ inputs: [MIC] });
    installWebAudioMocks();
    resetStore({
      enabled: true,
      audio: { ...speechDefaults().audio, sourceId: 'ghost-1', lastSourceLabel: 'Ghost Mic' },
    });

    render(<SermonAssistPanel />);
    expandRail();

    // Never enumerated → activeSourceMissing cannot be true yet.
    expect(media.enumerateDevices).not.toHaveBeenCalled();
    expect(screen.queryByTestId('speech-device-lost-banner')).toBeNull();
  });

  // --- panic stop ----------------------------------------------------------

  it('panic stop works while the rail is collapsed: session dead, UI stays collapsed', async () => {
    const media = installMediaMocks({ inputs: [MIC] });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<SermonAssistPanel />);
    expandRail();
    fireEvent.click(screen.getByTestId('speech-resume-listening'));
    await flush();
    expect(useSpeechStore.getState().status).toBe('listening');
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('sermon-assist-collapse'));
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();
    expect(screen.queryByTestId('speech-mode-indicator')).toBeNull();

    pressPanic();

    expect(useSpeechStore.getState().status).toBe('idle');
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
    expect(web.contexts[0].state).toBe('closed');
    // Panic does not pop the UI open, and the summon strip is still there.
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();
  });

  // --- VU + health ---------------------------------------------------------

  it('rail VU + input health: responds to level, warns on persistent clip, errors on 10 s silence', async () => {
    const media = installMediaMocks({ inputs: [MIC] });
    const web = installWebAudioMocks();
    resetStore({ enabled: true });

    render(<SermonAssistPanel />);
    expandRail();
    // Fake time BEFORE arming so the health sampler's interval and Date.now()
    // are both under test control. arm() itself is a pure promise chain.
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('speech-resume-listening'));
    await flush();
    expect(useSpeechStore.getState().status).toBe('listening');
    const node = web.nodes[web.nodes.length - 1];

    // Healthy signal: the bar moves and the line confirms it positively.
    act(() => {
      deliver(node, { rms: 0.5, peak: 0.8, clipped: false });
    });
    expect(screen.getByTestId('speech-rail-vu-bar').style.width).not.toBe('0%');
    expect(screen.getByTestId('speech-rail-clip')).toHaveTextContent('OK');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    let health = screen.getByTestId('speech-input-health');
    expect(health).toHaveAttribute('data-tone', 'ok');
    expect(health).toHaveTextContent('Input level is good.');

    // Flat signal past ten seconds: an error that names the fix, and an
    // honestly empty meter.
    act(() => {
      for (let i = 0; i < 30; i += 1) deliver(node, { rms: 0, peak: 0, clipped: false });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11000);
    });
    health = screen.getByTestId('speech-input-health');
    expect(health).toHaveAttribute('data-tone', 'error');
    expect(health).toHaveTextContent(/No signal/);
    expect(screen.getByTestId('speech-rail-vu-bar').style.width).toBe('0%');

    // Persistent clipping: badge flips immediately, health warns after 1 s.
    act(() => {
      deliver(node, { rms: 0.5, peak: 1, clipped: true });
    });
    expect(screen.getByTestId('speech-rail-clip')).toHaveTextContent('CLIP');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    health = screen.getByTestId('speech-input-health');
    expect(health).toHaveAttribute('data-tone', 'warn');
    expect(health).toHaveTextContent(/clipping/i);
  });

  // --- unmute-on-launch, storage half (module registry reset: keep last) ---

  it('a persisted enabled:true + status:"listening" blob rehydrates to idle — launch never unmutes', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { enabled: true, status: 'listening' }, version: 0 })
    );

    vi.resetModules();
    const { default: fresh } = await import('../../context/SpeechStore.js');
    await freshStoreHydration(fresh);

    expect(fresh.getState().enabled).toBe(true);
    expect(fresh.getState().status).toBe('idle');
  });
});
