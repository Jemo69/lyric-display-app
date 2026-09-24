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

describe('announcement ticker output routing', () => {
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

  it('keeps the selected output on the queued announcement', () => {
    const desktop = createFakeSocket('desktop', 'desktop');
    connect(desktop);

    desktop.trigger('tickerAdd', {
      text: 'Welcome to the service',
      targetOutput: 'output2',
    });

    const update = io.emit.mock.calls.find(([event]) => event === 'tickerUpdate');
    expect(update?.[1]?.queue?.[0]).toMatchObject({
      text: 'Welcome to the service',
      targetOutput: 'output2',
    });
    expect(events.buildCurrentState({ type: 'desktop' }).ticker.queue[0].targetOutput).toBe('output2');
    expect(desktop.emit).toHaveBeenCalledWith('tickerAddSuccess', {
      item: expect.objectContaining({ targetOutput: 'output2' }),
    });
  });

  it('keeps legacy announcements global when no target is supplied', () => {
    const desktop = createFakeSocket('desktop', 'desktop');
    connect(desktop);

    desktop.trigger('tickerAdd', 'Everyone sees this');

    const update = io.emit.mock.calls.find(([event]) => event === 'tickerUpdate');
    expect(update?.[1]?.queue?.[0]?.targetOutput).toBeUndefined();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
