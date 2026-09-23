import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChordPro } from 'shared/chords.js';

function createFakeSocket(id, clientType) {
  const handlers = new Map();
  return {
    id,
    userData: {
      clientType,
      deviceId: `device-${id}`,
      sessionId: 'test-session',
      permissions: [],
      connectedAt: Date.now(),
    },
    connected: true,
    emit: vi.fn(),
    broadcast: { emit: vi.fn() },
    on(event, callback) {
      const list = handlers.get(event) || [];
      list.push(callback);
      handlers.set(event, list);
    },
    trigger(event, payload) {
      (handlers.get(event) || []).forEach((handler) => handler(payload));
    },
  };
}

describe('ChordPro socket routing', () => {
  let connect;
  let io;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const events = await import('../../server/events.js');
    io = new EventEmitter();
    io.emit = vi.fn();
    events.default(io, { hasPermission: () => true });
    connect = io.listeners('connection')[0];
  });

  it('broadcasts clean lyrics everywhere and sends chart data only to Stage', () => {
    const desktop = createFakeSocket('desktop', 'desktop');
    const output = createFakeSocket('output-1', 'output1');
    const stage = createFakeSocket('stage', 'stage');
    connect(desktop);
    connect(output);
    connect(stage);

    const chart = parseChordPro('{key: G}\n[G]Amazing [C]grace');
    desktop.trigger('lyricsLoad', { lyrics: ['Amazing grace'], chords: chart });

    const lyricsBroadcast = io.emit.mock.calls.find(([event]) => event === 'lyricsLoad');
    expect(lyricsBroadcast?.[1]).toEqual(['Amazing grace']);

    expect(stage.emit).toHaveBeenCalledWith('chordChartLoaded', chart);
    expect(output.emit).not.toHaveBeenCalledWith('chordChartLoaded', expect.anything());
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
