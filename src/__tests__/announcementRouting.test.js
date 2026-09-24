import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('Free Note output routing', () => {
  let connect;
  let events;
  let io;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    events = await import('../../server/events.js');
    io = new EventEmitter();
    io.emit = vi.fn();
    events.default(io, { hasPermission: () => true });
    connect = io.listeners('connection')[0];
  });

  it('emits a targeted note without generic all-output events', () => {
    const desktop = createFakeSocket('desktop', 'desktop');
    const output1 = createFakeSocket('output-1', 'output1');
    const output2 = createFakeSocket('output-2', 'output2');
    const stage = createFakeSocket('stage', 'stage');
    connect(desktop);
    connect(output1);
    connect(output2);
    connect(stage);

    desktop.trigger('freeNoteLoaded', {
      title: 'Welcome',
      slides: ['Welcome'],
      slideIndex: 0,
      targetOutput: 'output2',
      targetOutputs: ['output2'],
    });

    const freeNoteBroadcast = io.emit.mock.calls.find(([event]) => event === 'freeNoteLoaded');
    expect(freeNoteBroadcast?.[1]).toMatchObject({
      title: 'Welcome',
      targetOutput: 'output2',
      targetOutputs: ['output2'],
    });
    expect(io.emit.mock.calls.some(([event]) => event === 'lyricsLoad')).toBe(false);
    expect(io.emit.mock.calls.some(([event]) => event === 'fileNameUpdate')).toBe(false);
    expect(io.emit.mock.calls.some(([event]) => event === 'contentModeUpdate')).toBe(false);
    expect(events.buildCurrentState({ type: 'desktop' })).toMatchObject({
      targetOutput: 'output2',
      targetOutputs: ['output2'],
    });
  });

  it('keeps subsequent line updates on the announcement target', () => {
    const desktop = createFakeSocket('desktop', 'desktop');
    connect(desktop);
    desktop.trigger('freeNoteLoaded', {
      title: 'Welcome',
      slides: ['Welcome'],
      targetOutput: 'output2',
    });
    io.emit.mockClear();

    desktop.trigger('lineUpdate', { index: 0, targetOutput: 'output2' });

    expect(io.emit).toHaveBeenCalledWith('lineUpdate', {
      index: 0,
      targetOutput: 'output2',
      targetOutputs: ['output2'],
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
