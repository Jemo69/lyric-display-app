import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  defaultMetronomeValues,
  getMetronomeState,
  startMetronome,
  stopMetronome,
  toggleMetronome,
  updateMetronome,
  updateClickSound,
  getShowBPM,
  getAudioOutputs,
  subscribeMetronome,
  __resetMetronomeForTests,
} from '../metronome';

/**
 * jsdom implements neither AudioContext decoding nor setSinkId, so the engine is
 * exercised against a hand-rolled stub. The assertions here are about the ported
 * behaviour (defaults, bounds, tempo-change restart, stop semantics) rather
 * than about Web Audio itself.
 */

class FakeAudioParam {
  constructor() {
    this.value = 1;
  }
  setValueAtTime(v) {
    this.value = v;
  }
  linearRampToValueAtTime(v) {
    this.value = v;
  }
}

const started = [];
const createdGains = [];

class FakeBufferSource {
  constructor() {
    this.buffer = null;
    this.connectedTo = [];
  }
  connect(node) {
    this.connectedTo.push(node);
    return node;
  }
  start(when) {
    started.push(when);
  }
}

class FakeGain {
  constructor() {
    this.gain = new FakeAudioParam();
    this.connectedTo = [];
  }
  connect(node, out, input) {
    this.connectedTo.push({ node, out, input });
    return node;
  }
}

class FakeMerger {
  constructor() {
    this.connectedTo = [];
  }
  connect(node) {
    this.connectedTo.push(node);
    return node;
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = { name: 'destination' };
    this.state = 'running';
    this.madeGain = false;
    this.madeMerger = false;
    this.madeSource = false;
    this.sinkId = undefined;
  }
  createBufferSource() {
    this.madeSource = true;
    return new FakeBufferSource();
  }
  createGain() {
    this.madeGain = true;
    const g = new FakeGain();
    createdGains.push(g);
    return g;
  }
  createChannelMerger() {
    this.madeMerger = true;
    return new FakeMerger();
  }
  decodeAudioData() {
    return Promise.resolve({ decoded: true });
  }
  setSinkId(id) {
    this.sinkId = id;
    return Promise.resolve();
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

let contexts = [];
let originalAudioContext;

/** Drain the whole async start-up chain (context resume, fetches, decode). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  contexts = [];
  started.length = 0;
  createdGains.length = 0;
  originalAudioContext = window.AudioContext;
  window.AudioContext = function AudioContextStub() {
    const ctx = new FakeAudioContext();
    contexts.push(ctx);
    return ctx;
  };
  global.fetch = vi.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
  );
  __resetMetronomeForTests();
});

afterEach(() => {
  stopMetronome();
  __resetMetronomeForTests();
  window.AudioContext = originalAudioContext;
  delete global.fetch;
  vi.useRealTimers();
});

describe('metronome defaults (FreeShow parity)', () => {
  it('keeps FreeShow’s default tempo, beats and volume', () => {
    expect(defaultMetronomeValues).toEqual({ tempo: 120, beats: 4, volume: 1 });
  });

  it('reports a stopped, zeroed timer before the first start', () => {
    const state = getMetronomeState();
    expect(state.playing).toBe(false);
    expect(state.timer).toEqual({ beat: 0, timeToNext: 0 });
  });
});

describe('tempo and beats bounds', () => {
  it('clamps tempo to FreeShow’s 1..320 range', () => {
    updateMetronome({ tempo: 9999 });
    expect(getMetronomeState().values.tempo).toBe(320);

    updateMetronome({ tempo: -50 });
    expect(getMetronomeState().values.tempo).toBe(1);
  });

  it('treats a falsy tempo as "keep the current one", as FreeShow does', () => {
    updateMetronome({ tempo: 90 });
    updateMetronome({ tempo: 0 });
    expect(getMetronomeState().values.tempo).toBe(90);
  });

  it('clamps beats to FreeShow’s 1..16 range', () => {
    updateMetronome({ beats: 99 });
    expect(getMetronomeState().values.beats).toBe(16);

    updateMetronome({ beats: -3 });
    expect(getMetronomeState().values.beats).toBe(1);
  });

  it('treats a falsy beats value as "keep the current one"', () => {
    updateMetronome({ beats: 6 });
    updateMetronome({ beats: 0 });
    expect(getMetronomeState().values.beats).toBe(6);
  });

  it('keeps volume within 1%..300%', () => {
    updateMetronome({ volume: 99 });
    expect(getMetronomeState().values.volume).toBe(3);

    updateMetronome({ volume: 0.0001 });
    expect(getMetronomeState().values.volume).toBeCloseTo(0.01, 5);
  });

  it('falls back to the default tempo when a patch omits it', () => {
    updateMetronome({ beats: 7 });
    expect(getMetronomeState().values.tempo).toBe(120);
    expect(getMetronomeState().values.beats).toBe(7);
  });

  it('stores audioOutput and audioChannel even when empty', () => {
    updateMetronome({ audioOutput: 'device-1', audioChannel: 'mono_left' });
    expect(getMetronomeState().values.audioOutput).toBe('device-1');
    expect(getMetronomeState().values.audioChannel).toBe('mono_left');

    updateMetronome({ audioOutput: '', audioChannel: '' });
    expect(getMetronomeState().values.audioOutput).toBe('');
    expect(getMetronomeState().values.audioChannel).toBe('');
  });
});

describe('getShowBPM', () => {
  it('reads bpm off song metadata and floors it', () => {
    expect(getShowBPM({ bpm: '92.8' })).toBe(92);
    expect(getShowBPM({ BPM: 140 })).toBe(140);
  });

  it('falls back to 120 when metadata has no usable bpm', () => {
    expect(getShowBPM(null)).toBe(120);
    expect(getShowBPM({})).toBe(120);
    expect(getShowBPM({ bpm: 'not-a-number' })).toBe(120);
  });
});

describe('start / stop / toggle', () => {
  it('starts playing and schedules the first beat', async () => {
    startMetronome({ tempo: 120, beats: 4 });
    await flush();

    expect(getMetronomeState().playing).toBe(true);
    // Beat 1 is the accent.
    expect(getMetronomeState().timer.beat).toBe(1);
  });

  it('toggles between running and stopped', async () => {
    startMetronome({});
    await flush();
    expect(getMetronomeState().playing).toBe(true);

    toggleMetronome();
    expect(getMetronomeState().playing).toBe(false);
    expect(getMetronomeState().timer).toEqual({ beat: 0, timeToNext: 0 });
  });

  it('resets the beat counter on stop', async () => {
    startMetronome({});
    await flush();
    stopMetronome();

    const state = getMetronomeState();
    expect(state.playing).toBe(false);
    expect(state.timer.beat).toBe(0);
  });

  it('does nothing when there is no AudioContext (non-browser env)', async () => {
    window.AudioContext = undefined;
    expect(() => startMetronome({})).not.toThrow();
    await flush();
    expect(getMetronomeState().playing).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('click sounds', () => {
  it('loads the shipped metal samples by default', async () => {
    startMetronome({});
    await flush();

    const calledWith = global.fetch.mock.calls.map((c) => c[0]);
    expect(calledWith.some((u) => String(u).includes('beat-metal-hi.webm'))).toBe(true);
    expect(calledWith.some((u) => String(u).includes('beat-metal-lo.webm'))).toBe(true);
  });

  it('switches to the wood samples when the click sound changes', async () => {
    updateClickSound({ clickSound: 'wood' });
    startMetronome({});
    await flush();

    const calledWith = global.fetch.mock.calls.map((c) => c[0]);
    expect(calledWith.some((u) => String(u).includes('beat-wood-hi.webm'))).toBe(true);
  });

  it('ignores a custom click sound with no files chosen', async () => {
    updateClickSound({ clickSound: 'custom', clickSound_hi: '', clickSound_lo: '' });
    startMetronome({});
    await flush();

    expect(getMetronomeState().playing).toBe(true);
    // No custom files means nothing to fetch.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('getAudioOutputs', () => {
  afterEach(() => {
    delete navigator.mediaDevices;
  });

  it('returns audio output devices and drops the synthetic default', async () => {
    navigator.mediaDevices = {
      enumerateDevices: vi.fn(() =>
        Promise.resolve([
          { kind: 'audiooutput', deviceId: 'default', label: 'Default' },
          { kind: 'audiooutput', deviceId: 'spk-1', label: 'Main Speakers' },
          { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
        ])
      ),
    };

    await expect(getAudioOutputs()).resolves.toEqual([{ value: 'spk-1', label: 'Main Speakers' }]);
  });

  it('returns an empty list when enumeration is unavailable', async () => {
    delete navigator.mediaDevices;
    await expect(getAudioOutputs()).resolves.toEqual([]);
  });

  it('returns an empty list when enumeration rejects', async () => {
    navigator.mediaDevices = {
      enumerateDevices: vi.fn(() => Promise.reject(new Error('nope'))),
    };
    await expect(getAudioOutputs()).resolves.toEqual([]);
  });
});

describe('subscription', () => {
  it('notifies subscribers on every emit and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMetronome(listener);

    updateMetronome({ tempo: 100 });
    expect(listener).toHaveBeenCalledTimes(1);

    stopMetronome();
    const callsBefore = listener.mock.calls.length;
    expect(callsBefore).toBeGreaterThan(1);

    unsubscribe();
    updateMetronome({ tempo: 101 });
    expect(listener).toHaveBeenCalledTimes(callsBefore);
  });

  it('hands out a stable snapshot reference between emits', () => {
    const first = getMetronomeState();
    expect(getMetronomeState()).toBe(first);
    updateMetronome({ tempo: 111 });
    expect(getMetronomeState()).not.toBe(first);
  });
});
