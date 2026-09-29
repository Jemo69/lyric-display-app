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
  setShowMetadata,
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
const createdSources = [];

class FakeBufferSource {
  constructor() {
    this.buffer = null;
    this.connectedTo = [];
    this.stopCalls = 0;
    this.onended = null;
  }
  connect(node) {
    this.connectedTo.push(node);
    return node;
  }
  start(when) {
    started.push(when);
  }
  stop() {
    this.stopCalls++;
  }
}

class FakeGain {
  constructor() {
    // `gain` is a read-only attribute in the real Web Audio API, so it must be a
    // getter with no setter here too. A plain writable field let the engine's
    // `gainNode.gain = x` bug pass the whole suite while shipping a silent
    // metronome, because assigning to a getter-less property in strict mode
    // throws exactly as the browser does.
    Object.defineProperty(this, 'gain', {
      get: () => this._gain,
      configurable: true,
    });
    this._gain = new FakeAudioParam();
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
    const s = new FakeBufferSource();
    createdSources.push(s);
    return s;
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
    this.sinkIdCalls = (this.sinkIdCalls || 0) + 1;
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
  createdSources.length = 0;
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
  it('finds a metadata key that mentions bpm, however it is named', () => {
    setShowMetadata({ title: 'Test', tempo_bpm: '92.8' });
    expect(getShowBPM()).toBe(92);

    setShowMetadata({ BPM: 140 });
    expect(getShowBPM()).toBe(140);
  });

  it('falls back to 120 when metadata has no usable bpm', () => {
    setShowMetadata(null);
    expect(getShowBPM()).toBe(120);

    setShowMetadata({ title: 'Test' });
    expect(getShowBPM()).toBe(120);

    setShowMetadata({ bpm: 'not-a-number' });
    expect(getShowBPM()).toBe(120);
  });

  it('feeds the metadataBPM start path', () => {
    setShowMetadata({ bpm: 76 });
    startMetronome({ metadataBPM: true });
    expect(getMetronomeState().values.tempo).toBe(76);
  });
});

describe('tempo changes while playing', () => {
  it('restarts the clock on a new tempo, as FreeShow does', () => {
    startMetronome({ tempo: 120 });
    updateMetronome({ tempo: 90 });
    expect(getMetronomeState().values.tempo).toBe(90);
  });

  it('does not restart when an identical tempo is set again', () => {
    startMetronome({ tempo: 120 });
    const firstStart = getMetronomeState().playing;
    updateMetronome({ tempo: 120 });
    expect(getMetronomeState().playing).toBe(firstStart);
  });

  it('leaves a stopped metronome stopped when the tempo changes', () => {
    updateMetronome({ tempo: 70 });
    expect(getMetronomeState().values.tempo).toBe(70);
    expect(getMetronomeState().playing).toBe(false);
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

  // A first play awaits the sample fetch + decode before the clock starts, so a
  // stop can land inside that window. It used to be swallowed: there was no
  // pending timeout yet, and the continuation started the click anyway — an
  // operator who hit stop during load had a metronome they could not silence.
  it('honours a stop that lands while the start-up chain is still awaiting', async () => {
    startMetronome({ tempo: 120, beats: 4 });
    stopMetronome();

    await flush();

    expect(getMetronomeState().playing).toBe(false);
    expect(getMetronomeState().timer.beat).toBe(0);
    expect(started).toHaveLength(0);
  });

  it('survives repeated start / stop / start flapping', async () => {
    startMetronome({ tempo: 120, beats: 4 });
    await flush();
    expect(getMetronomeState().playing).toBe(true);

    stopMetronome();
    startMetronome({ tempo: 120, beats: 4 });
    await flush();

    // Exactly one clock is running, and it is the second start.
    expect(getMetronomeState().playing).toBe(true);
    expect(contexts).toHaveLength(1);
  });

  // `GainNode.gain` is a read-only AudioParam attribute. Assigning to it throws
  // a TypeError in strict mode, and because `playNote` runs unawaited from
  // `scheduleNote` that became an unhandled rejection per beat: `source.start()`
  // never ran and the shipped metronome was completely silent. `FakeGain` now
  // models the getter-only shape, so this fails if the bug returns.
  it('applies the accent gain as an AudioParam value, not by assignment', async () => {
    startMetronome({ tempo: 120, beats: 4, volume: 1 });
    await flush();

    expect(createdGains.length).toBeGreaterThan(0);
    // accentVolume (2) x volume (1)
    expect(createdGains[0].gain.value).toBe(2);
  });

  it('scales the accent and secondary gains by the operator volume', async () => {
    startMetronome({ tempo: 120, beats: 4, volume: 0.5 });
    await flush();

    // accentVolume 2 x 0.5
    expect(createdGains[0].gain.value).toBe(1);
  });

  it('actually starts the buffer source, so a beat is audible', async () => {
    startMetronome({ tempo: 120, beats: 4 });
    await flush();

    expect(createdSources.length).toBeGreaterThan(0);
    expect(started.length).toBeGreaterThan(0);
  });

  it('silences the already-queued note when stopped', async () => {
    startMetronome({ tempo: 60, beats: 4 });
    await flush();

    // The look-ahead has already queued a source; stop must cut it.
    expect(createdSources.length).toBeGreaterThan(0);
    stopMetronome();

    expect(createdSources.some((s) => s.stopCalls > 0)).toBe(true);
  });

  it('a second start supersedes the first rather than adding a clock', async () => {
    startMetronome({ tempo: 120, beats: 4 });
    startMetronome({ tempo: 120, beats: 4 });
    await flush();

    expect(getMetronomeState().playing).toBe(true);
    // One accent click, not two overlapping schedulers.
    expect(started).toHaveLength(1);
  });
});

describe('audio output routing', () => {
  it('selects the output once per start, not once per beat', async () => {
    startMetronome({ tempo: 120, beats: 4, audioOutput: 'sink-1' });
    await flush();

    expect(contexts[0].sinkId).toBe('sink-1');
    const callsAfterStart = contexts[0].sinkIdCalls;

    // Let several beats go by at a fast tempo.
    startMetronome({ tempo: 320, beats: 4, audioOutput: 'sink-1' });
    await flush();

    // The second start re-selects once; the per-beat path is gone entirely.
    expect(contexts[0].sinkIdCalls).toBe(callsAfterStart + 1);
  });

  it('does not call setSinkId when no output is chosen', async () => {
    startMetronome({ tempo: 120, beats: 4, audioOutput: '' });
    await flush();

    expect(contexts[0].sinkIdCalls || 0).toBe(0);
  });

  // The store->engine effect re-pushes the click sound on every settings write.
  // Restarting the clock on each one dropped a full beat of click for changes
  // that had nothing to do with the sample — 1s at 60bpm, 60s at the 1bpm floor.
  it('does not restart the clock for an unrelated settings change', async () => {
    startMetronome({ tempo: 120, beats: 4, clickSound: 'metal' });
    await flush();

    const afterStart = started.length;
    updateMetronome({ volume: 0.4 });
    await flush();

    // Same sample, so the running clock is untouched.
    expect(started.length).toBe(afterStart);
    expect(getMetronomeState().playing).toBe(true);
  });

  it('ignores a click-sound push that changes nothing', async () => {
    startMetronome({ tempo: 120, beats: 4, clickSound: 'metal' });
    await flush();
    const afterStart = started.length;

    updateClickSound({ clickSound: 'metal' });
    await flush();

    expect(started.length).toBe(afterStart);
  });

  it('does restart the clock when the sample genuinely changes', async () => {
    startMetronome({ tempo: 120, beats: 4, clickSound: 'metal' });
    await flush();
    const afterStart = started.length;

    updateClickSound({ clickSound: 'wood' });
    await flush();

    // A new beat is scheduled against the new sample.
    expect(started.length).toBeGreaterThan(afterStart);
  });

  it('re-routes immediately when the output changes mid-play', async () => {
    startMetronome({ tempo: 120, beats: 4, audioOutput: 'sink-1' });
    await flush();

    updateMetronome({ audioOutput: 'sink-2' });
    await flush();

    expect(contexts[0].sinkId).toBe('sink-2');
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
