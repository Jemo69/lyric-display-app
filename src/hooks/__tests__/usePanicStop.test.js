/**
 * usePanicStop tests — the one keystroke that kills the microphone.
 *
 * The contract under test, in the order a reviewer would ask for it:
 *
 *   1. The binding exists, is unique across DEFAULT_BINDINGS, appears in
 *      SHORTCUT_GROUPS / ALL_SHORTCUT_IDS (so it is remappable in
 *      User Preferences > Keyboard Shortcuts), and no other module registers
 *      the same combo (a double registration would fire two handlers).
 *   2. While armed, the keystroke kills the session for real: live tracks → 0,
 *      AudioContext → closed, store status → 'idle'.
 *   3. When nothing is armed (or the store is stuck on a stale 'listening'),
 *      the keystroke is harmless — it never touches navigator.mediaDevices,
 *      and it forces the status back to idle.
 *   4. It fires while a text input has focus (a panic key ignored mid-typing
 *      is not a panic key) — TanStack resolves Mod to Control, and Control
 *      combos default to ignoreInputs:false.
 *   5. It unregisters on unmount, and a live rebind through the hotkeys store
 *      re-registers: the old combo goes dead, the new one fires.
 *
 * jsdom has no mediaDevices and no AudioContext; both are mocked explicitly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, renderHook, act } from '@testing-library/react';
import { usePanicStop, resolvePanicStopCombo } from '../usePanicStop';
import { useAudioCapture } from '../useAudioCapture';
import { useAudioDevices } from '../useAudioDevices';
import useHotkeysStore from '../../context/HotkeysStore';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import { DEFAULT_BINDINGS, SHORTCUT_GROUPS, ALL_SHORTCUT_IDS } from '../../constants/hotkeyBindings';

// --- mocks (same shape as useAudioCapture.test.js) -------------------------

function installMediaMocks({ inputs = [], permission = 'prompt' } = {}) {
  const state = { permission, inputs, tracks: [], streams: [] };

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

  return { contexts, nodes };
}

const installAll = (opts = {}) => ({
  media: installMediaMocks(opts),
  web: installWebAudioMocks(),
});

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

const flush = async (ticks = 24) => {
  await act(async () => {
    for (let i = 0; i < ticks; i += 1) await Promise.resolve();
  });
};

/** Mod+Shift+M on jsdom: Mod resolves to Control (linux platform). */
const pressPanic = (target) =>
  act(() => {
    (target || document).dispatchEvent(
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

/** The rebinding target used in the live-rebind test. */
const pressRebind = () =>
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
  });

const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('usePanicStop', () => {
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

  // --- 1. the binding itself ---------------------------------------------

  it('the binding is declared, unique, listed, and registered by this hook only', () => {
    expect(DEFAULT_BINDINGS.panicStop).toBe('Mod+Shift+M');
    // Unique: no other shortcut resolves to the same keystroke.
    const collisions = Object.entries(DEFAULT_BINDINGS).filter(
      ([, combo]) => combo === DEFAULT_BINDINGS.panicStop
    );
    expect(collisions.map(([id]) => id)).toEqual(['panicStop']);
    // Listed: shows up (and is remappable) in User Preferences > shortcuts.
    expect(ALL_SHORTCUT_IDS).toContain('panicStop');
    const group = SHORTCUT_GROUPS.find((g) => g.category === 'Sermon Assist');
    expect(group, 'Sermon Assist shortcut group must exist').toBeTruthy();
    expect(group.items.map((i) => i.id)).toContain('panicStop');
    // Mod+Shift+A stays reserved for the Phase 4 rail toggle.
    expect(DEFAULT_BINDINGS.panicStop).not.toBe('Mod+Shift+A');

    // No other module may register this combo or hardcode the keystroke:
    // a second handler on the same key is how a "panic" key becomes a
    // double-toggle. useKeyboardShortcuts registers combos from the store
    // (which does not contain panicStop's key today) plus the fixed vim
    // keys; the menu layers match raw events by hand.
    const scanned = [
      '../LyricDisplayApp/useKeyboardShortcuts.js',
      '../LyricDisplayApp/useMenuShortcuts.js',
      '../NewSongCanvas/useKeyboardShortcuts.js',
    ];
    for (const rel of scanned) {
      const src = readSrc(rel);
      expect(src, `${rel} must not register the panic combo`).not.toMatch(/Shift\+M/);
      expect(src, `${rel} must not hardcode Ctrl+Shift+M`).not.toMatch(/key === ['"]M['"]/);
      expect(src, `${rel} must not reference panicStop`).not.toMatch(/panicStop/);
    }
  });

  it('resolvePanicStopCombo falls back to the shipped default when the store is empty', () => {
    expect(resolvePanicStopCombo(undefined)).toBe(DEFAULT_BINDINGS.panicStop);
    expect(resolvePanicStopCombo({})).toBe(DEFAULT_BINDINGS.panicStop);
    expect(resolvePanicStopCombo({ panicStop: '' })).toBe(DEFAULT_BINDINGS.panicStop);
    expect(resolvePanicStopCombo({ panicStop: 42 })).toBe(DEFAULT_BINDINGS.panicStop);
    expect(resolvePanicStopCombo({ panicStop: 'Mod+Alt+Q' })).toBe('Mod+Alt+Q');
  });

  // --- 2/3. the keystroke --------------------------------------------------

  it('armed session: the keystroke kills it — 0 live tracks, closed context, status idle', async () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    resetStore({ enabled: true });

    const { result } = renderHook(() => {
      const devices = useAudioDevices();
      const capture = useAudioCapture({ devices });
      const combo = usePanicStop(capture);
      return { capture, combo };
    });
    expect(result.current.combo).toBe(DEFAULT_BINDINGS.panicStop);

    await act(async () => {
      const outcome = await result.current.capture.arm();
      expect(outcome.ok).toBe(true);
    });
    expect(result.current.capture.capturing).toBe(true);
    expect(result.current.capture.getLiveTrackCount()).toBe(1);
    expect(useSpeechStore.getState().status).toBe('listening');
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(1);

    pressPanic();

    expect(result.current.capture.capturing).toBe(false);
    expect(result.current.capture.getLiveTrackCount()).toBe(0);
    expect(media.state.tracks.filter((t) => t.readyState === 'live')).toHaveLength(0);
    expect(web.contexts).toHaveLength(1);
    expect(web.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(web.contexts[0].state).toBe('closed');
    expect(useSpeechStore.getState().status).toBe('idle');
    // The mic is closed at the OS level too: every track ever opened is dead.
    expect(media.state.tracks.every((t) => t.readyState === 'ended')).toBe(true);
  });

  it('cold: harmless when nothing is armed, and it still forces a stale "listening" back to idle', async () => {
    const { media, web } = installAll({
      inputs: [{ deviceId: 'mic-a', label: 'Built-in Microphone' }],
    });
    // Launch state a crash could leave behind: the flag says listening, but
    // nothing is actually open. The panic key must clean the flag up without
    // ever opening a device to do it.
    resetStore({ enabled: true, status: 'listening' });

    const capture = { teardown: vi.fn() };
    renderHook(() => usePanicStop(capture));

    pressPanic();

    expect(capture.teardown).toHaveBeenCalledTimes(1);
    expect(useSpeechStore.getState().status).toBe('idle');
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(media.enumerateDevices).not.toHaveBeenCalled();
    expect(web.contexts).toHaveLength(0);
  });

  it('fires while a text input has focus — a panic key that is ignored mid-typing is no panic key', () => {
    resetStore({ enabled: true, status: 'listening' });
    const capture = { teardown: vi.fn() };
    renderHook(() => usePanicStop(capture));

    // A plain DOM input (this file stays .js — no JSX anywhere in it).
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    // Dispatched on the input itself; it bubbles up to the document listener.
    pressPanic(input);

    expect(capture.teardown).toHaveBeenCalledTimes(1);
    expect(useSpeechStore.getState().status).toBe('idle');
    input.remove();
  });

  it('unregisters on unmount — a dead hook must not catch the keystroke', () => {
    resetStore({ enabled: true });
    const capture = { teardown: vi.fn() };
    const { unmount } = renderHook(() => usePanicStop(capture));
    unmount();

    useSpeechStore.setState({ status: 'listening' });
    pressPanic();

    expect(capture.teardown).not.toHaveBeenCalled();
    expect(useSpeechStore.getState().status).toBe('listening');
  });

  it('a live rebind through the hotkeys store re-registers: old combo dies, new combo fires', () => {
    resetStore({ enabled: true, status: 'listening' });
    const capture = { teardown: vi.fn() };
    const { result } = renderHook(() => usePanicStop(capture));
    expect(result.current).toBe('Mod+Shift+M');

    pressPanic();
    expect(capture.teardown).toHaveBeenCalledTimes(1);

    act(() => {
      useHotkeysStore.getState().setBinding('panicStop', 'Mod+Alt+Z');
    });
    expect(result.current).toBe('Mod+Alt+Z');
    expect(useHotkeysStore.getState().bindings.panicStop).toBe('Mod+Alt+Z');
    expect(localStorage.getItem('hotkeys-store')).toContain('Mod+Alt+Z');

    // Old combo is dead now — no zombie handler on the default key.
    useSpeechStore.setState({ status: 'listening' });
    pressPanic();
    expect(capture.teardown).toHaveBeenCalledTimes(1);
    expect(useSpeechStore.getState().status).toBe('listening');

    // New combo fires.
    pressRebind();
    expect(capture.teardown).toHaveBeenCalledTimes(2);
    expect(useSpeechStore.getState().status).toBe('idle');

    act(() => {
      useHotkeysStore.getState().resetBindings();
    });
    expect(result.current).toBe(DEFAULT_BINDINGS.panicStop);
  });

  it('the combo survives a partially rehydrated hotkeys store (fallback display)', async () => {
    // The store prunes unknown ids; panicStop is a known id, but a corrupt
    // binding must still resolve to something the footer can display.
    const { result } = renderHook(() => usePanicStop({ teardown: vi.fn() }));
    act(() => {
      useHotkeysStore.setState({ bindings: { onlyThis: 'Mod+Q' } });
    });
    expect(result.current).toBe(DEFAULT_BINDINGS.panicStop);
    await flush();
  });
});
