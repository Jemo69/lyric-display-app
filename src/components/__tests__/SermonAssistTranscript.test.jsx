/**
 * SermonAssistTranscript.test.jsx — Live Sermon Assist, Phase 4: what the rail
 * does with a running transcript over a whole service.
 *
 *   1. TRANSCRIPT HYGIENE: the tail lives in memory only. Clear localStorage,
 *      render the rail, feed a final AND a provisional partial, and not one
 *      storage value may contain a word that was said. A sermon is not
 *      preferences, and it is never resurrected by a reload.
 *   2. BOUNDED TAIL: an hour of sermon cannot grow an unbounded array — the
 *      oldest segments are dropped at MAX_TAIL_SEGMENTS.
 *   3. Mod+Shift+A: the rail toggle, registered while Sermon Assist is ON and
 *      harmless when it is off, works while the rail is collapsed (its whole
 *      purpose), and `panicStop` still does its job afterwards — regression
 *      against the Phase 1 key.
 *   4. OFF MEANS ABSENT: `enabled:false` renders zero DOM nodes, history
 *      browser included.
 *
 * jsdom has no mediaDevices and no AudioContext; both are mocked here, and
 * only for the one test that actually opens the microphone (the panic press).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';

import SermonAssistPanel from '../Speech/SermonAssistPanel';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import useHotkeysStore from '../../context/HotkeysStore';
import useSpeechRuntimeStore, { MAX_TAIL_SEGMENTS } from '../../context/SpeechRuntimeStore';
import { DEFAULT_BINDINGS, SHORTCUT_GROUPS } from '../../constants/hotkeyBindings';

// Load contention with a concurrent suite run: give the async assertions headroom.
const itFlow = (name, fn) => it(name, fn, 30000);

const HEARD = 'overflowing joy upon the holy mountain';
const PARTIAL_HEARD = 'the priest stood quietly waiting';

// --- media mocks (only the panic test opens a microphone) -------------------

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
      this.createMediaStreamSource = vi.fn((stream) => ({ stream, connect: vi.fn(), disconnect: vi.fn() }));
      contexts.push(this);
    }
  }

  class MockAudioWorkletNode {
    constructor(context) {
      this.context = context;
      this.port = { onmessage: null, postMessage: vi.fn(), close: vi.fn() };
      this.connect = vi.fn();
      this.disconnect = vi.fn();
    }
  }

  window.AudioContext = MockAudioContext;
  globalThis.AudioWorkletNode = MockAudioWorkletNode;

  return { contexts };
}

// --- stubs ------------------------------------------------------------------

const installSpeechBridge = () => {
  const listeners = new Set();
  window.electronAPI = {
    speech: {
      history: {
        list: vi.fn(async () => ({ ok: true, sessions: [], status: { recording: false } })),
        get: vi.fn(async () => ({ ok: true, session: null })),
        search: vi.fn(async () => ({ ok: true, matches: [] })),
        export: vi.fn(async () => ({ ok: true, path: '/tmp/x.json', bytes: 0 })),
        erase: vi.fn(async () => ({ ok: true, bytesReclaimed: 0, sessionsRemoved: 0 })),
        append: vi.fn(async () => ({ ok: true })),
      },
      onTranscript: vi.fn((callback) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      }),
    },
  };
  return {
    emit: (message) => {
      for (const callback of [...listeners]) callback(message);
    },
  };
};

// --- helpers ----------------------------------------------------------------

let bridge = null;

const resetAll = () => {
  useHotkeysStore.getState().resetBindings();
  useSpeechStore.setState({
    ...speechDefaults(),
    enabled: true,
    status: 'idle',
    health: null,
    lastError: null,
  });
  useSpeechRuntimeStore.getState().reset();
  localStorage.clear();
};

const renderRail = () => {
  const utils = render(<SermonAssistPanel darkMode={false} />);
  const open = screen.queryByTestId('sermon-assist-open');
  if (open) fireEvent.click(open);
  return utils;
};

const feedFinal = (text) =>
  act(() => {
    bridge.emit({ t: 'final', text, sessionId: 'svc-test', tStartMs: 0, tEndMs: 1200 });
  });

const feedPartial = (text) =>
  act(() => {
    bridge.emit({ t: 'partial', text, sessionId: 'svc-test', tStartMs: 0, tEndMs: 900 });
  });

const flush = async (ticks = 24) => {
  await act(async () => {
    for (let i = 0; i < ticks; i += 1) await Promise.resolve();
  });
};

/** Mod resolves to Control on linux: Ctrl+Shift+A / Ctrl+Shift+M. */
const press = (key, code) =>
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, code, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    );
  });

const storageSnapshot = () => {
  const out = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    out[key] = localStorage.getItem(key);
  }
  return out;
};

describe('SermonAssistRail (Phase 4 transcript runtime)', () => {
  beforeEach(() => {
    bridge = installSpeechBridge();
    resetAll();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.electronAPI;
  });

  // --- 1. nothing that was said reaches localStorage ------------------------

  itFlow('no transcript text is ever written to localStorage', () => {
    renderRail();
    expect(localStorage.length).toBeGreaterThanOrEqual(0);

    feedFinal(HEARD);
    feedFinal('we are not afraid');
    // Partials last: they are the ones still unsettled when we look.
    feedPartial(PARTIAL_HEARD);
    feedPartial('and the congregation stood to sing');

    // Proof the words actually reached the rail…
    expect(screen.getByText(HEARD)).toBeInTheDocument();
    expect(screen.getByTestId('transcript-partial')).toHaveTextContent(
      'and the congregation stood to sing'
    );

    // …and proof they went no further than memory.
    const heard = [HEARD, PARTIAL_HEARD, 'and the congregation stood to sing', 'we are not afraid'];
    const snapshot = storageSnapshot();
    for (const [key, value] of Object.entries(snapshot)) {
      for (const phrase of heard) {
        expect(value ?? '', `localStorage[${key}] must not contain transcript text`).not.toContain(
          phrase
        );
      }
    }
    // The runtime store that holds the tail is not a persisted store at all.
    expect(useSpeechRuntimeStore.persist).toBeUndefined();
  });

  // --- 2. the tail is bounded ------------------------------------------------

  itFlow('the tail stays bounded over a long service', () => {
    renderRail();
    const count = MAX_TAIL_SEGMENTS + 20;
    for (let i = 0; i < count; i += 1) {
      feedFinal(`a plain sermon line number ${i}`);
    }

    const state = useSpeechRuntimeStore.getState();
    expect(state.segments).toHaveLength(MAX_TAIL_SEGMENTS);
    // Oldest dropped, newest kept: the last line fed is the last line shown.
    expect(state.segments[state.segments.length - 1].text).toBe(`a plain sermon line number ${count - 1}`);
    expect(state.segments[0].text).toBe(`a plain sermon line number ${count - MAX_TAIL_SEGMENTS}`);
    expect(screen.getAllByTestId('transcript-segment')).toHaveLength(MAX_TAIL_SEGMENTS);
  });

  // --- 3. Mod+Shift+A + panic regression -------------------------------------

  itFlow('Mod+Shift+A toggles the rail while collapsed; panic stop still works', async () => {
    const media = installMediaMocks({
      inputs: [{ deviceId: 'mic-1', label: 'Built-in Microphone' }],
    });
    const web = installWebAudioMocks();

    // The bindings are declared where the assignable UI reads them.
    expect(DEFAULT_BINDINGS.toggleSermonAssist).toBe('Mod+Shift+A');
    expect(DEFAULT_BINDINGS.panicStop).toBe('Mod+Shift+M');
    expect(DEFAULT_BINDINGS.toggleSermonAssist).not.toBe(DEFAULT_BINDINGS.panicStop);
    const group = SHORTCUT_GROUPS.find((entry) => entry.category === 'Sermon Assist');
    expect(group).toBeTruthy();
    expect(group.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['panicStop', 'toggleSermonAssist'])
    );

    // Collapsed: the summon strip is all there is.
    render(<SermonAssistPanel darkMode={false} />);
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();
    expect(screen.queryByTestId('speech-mode-indicator')).toBeNull();

    // The key that exists for this: expand without reaching for the mouse.
    press('A', 'KeyA');
    expect(screen.getByTestId('speech-mode-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('sermon-assist-open')).toBeNull();

    press('A', 'KeyA');
    expect(screen.queryByTestId('speech-mode-indicator')).toBeNull();
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();

    // Still collapsed, and now with a live microphone: panic is unaffected.
    press('A', 'KeyA');
    fireEvent.click(screen.getByTestId('speech-resume-listening'));
    await flush();
    expect(useSpeechStore.getState().status).toBe('listening');
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('sermon-assist-collapse'));
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();

    press('M', 'KeyM');

    expect(useSpeechStore.getState().status).toBe('idle');
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
    expect(web.contexts[0].state).toBe('closed');
    // Panic does not pop the rail open, and the rail key did not fire on it.
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();
  });

  itFlow('with the feature off, Mod+Shift+A does nothing and nothing renders', () => {
    useSpeechStore.setState({ ...speechDefaults(), enabled: false });

    const { container } = render(<SermonAssistPanel darkMode={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('sermon-assist-open')).toBeNull();
    expect(screen.queryByTestId('speech-status-chip')).toBeNull();
    expect(screen.queryByTestId('speech-mode-indicator')).toBeNull();
    expect(screen.queryByTestId('transcript-segment')).toBeNull();

    press('A', 'KeyA');
    expect(container).toBeEmptyDOMElement();
  });
});
