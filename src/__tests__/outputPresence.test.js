import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { createOutputPresenceRegistry, normalizeOutputPurpose } from '../../server/realtime/outputPresence.js';

function createFakeSocket(id, clientType, { purpose, permissions = ['lyrics:read'] } = {}) {
  const handlers = new Map();
  const socket = {
    id,
    userData: {
      clientType,
      deviceId: `device-${id}`,
      sessionId: 'test-session',
      permissions,
      connectedAt: Date.now(),
    },
    handshake: { auth: { purpose } },
    connected: true,
    emit: vi.fn(),
    broadcast: { emit: vi.fn() },
    on(event, callback) {
      const list = handlers.get(event) || [];
      list.push(callback);
      handlers.set(event, list);
    },
  };
  return { socket, handlers };
}

function fire(handlers, event, payload) {
  for (const handler of handlers.get(event) || []) handler(payload);
}

describe('outputPresence registry', () => {
  it('normalizes declared purposes and falls back to built-in client types', () => {
    expect(normalizeOutputPurpose('Custom_Lobby-1')).toBe('custom_lobby-1');
    expect(normalizeOutputPurpose('output1')).toBe('output1');
    expect(normalizeOutputPurpose('bogus!!!', 'stage')).toBe('stage');
    expect(normalizeOutputPurpose('bogus!!!', 'desktop')).toBe(null);
    expect(normalizeOutputPurpose(undefined, undefined)).toBe(null);
  });

  it('registers output sockets and lists them', () => {
    const registry = createOutputPresenceRegistry();
    const entry = registry.register({ socketId: 'a', clientType: 'output1', deviceId: 'd1' });
    expect(entry.outputKey).toBe('output1');
    expect(registry.size()).toBe(1);
    expect(registry.list()[0]).toMatchObject({ id: 'a', outputKey: 'output1', deviceId: 'd1' });
  });

  it('ignores non-output clients without a valid purpose', () => {
    const registry = createOutputPresenceRegistry();
    expect(registry.register({ socketId: 'a', clientType: 'desktop' })).toBe(null);
    expect(registry.size()).toBe(0);
  });

  it('refines the purpose to a custom output key', () => {
    const registry = createOutputPresenceRegistry();
    registry.register({ socketId: 'a', clientType: 'output1' });
    const refined = registry.refine('a', 'custom_lobby');
    expect(refined.outputKey).toBe('custom_lobby');
    expect(registry.refine('a', 'not a key!')).toBe(null);
    expect(registry.list()[0].outputKey).toBe('custom_lobby');
  });

  it('expires entries on remove and on stale heartbeats', () => {
    let now = 1000;
    const registry = createOutputPresenceRegistry({ now: () => now, ttlMs: 5000 });
    registry.register({ socketId: 'a', clientType: 'stage' });
    registry.register({ socketId: 'b', clientType: 'output2' });

    expect(registry.remove('a')).toMatchObject({ outputKey: 'stage' });
    expect(registry.remove('a')).toBe(null);
    expect(registry.size()).toBe(1);

    now += 4000;
    registry.touch('b');
    now += 4000;
    expect(registry.size()).toBe(1);

    now += 6000;
    expect(registry.size()).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it('produces a timestamped snapshot', () => {
    const registry = createOutputPresenceRegistry({ now: () => 4242 });
    registry.register({ socketId: 'a', clientType: 'output1' });
    expect(registry.snapshot()).toEqual({
      presence: [expect.objectContaining({ outputKey: 'output1' })],
      timestamp: 4242,
    });
  });
});

describe('server/events output presence wiring', () => {
  let io;
  let connectionHandler;
  let emitted;
  let getOutputPresenceSnapshot;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const module = await import('../../server/events.js');
    getOutputPresenceSnapshot = module.getOutputPresenceSnapshot;
    io = new EventEmitter();
    emitted = [];
    io.emit = vi.fn((...args) => {
      emitted.push(args);
    });
    module.default(io, { hasPermission: (socket, permission) => socket.userData.permissions.includes(permission) });
    connectionHandler = io.listeners('connection')[0];
  });

  const presenceBroadcasts = () => emitted.filter(([event]) => event === 'outputPresenceUpdate');

  it('registers an output instance on socket connect', () => {
    const { socket } = createFakeSocket('sock-1', 'output1');
    connectionHandler(socket);

    expect(presenceBroadcasts().length).toBe(1);
    const snapshot = getOutputPresenceSnapshot();
    expect(snapshot.presence).toEqual([expect.objectContaining({ id: 'sock-1', outputKey: 'output1' })]);
  });

  it('registers the declared purpose for custom outputs', () => {
    const { socket, handlers } = createFakeSocket('sock-2', 'output1');
    connectionHandler(socket);

    fire(handlers, 'outputPresenceRegister', { purpose: 'custom_lobby' });

    const snapshot = getOutputPresenceSnapshot();
    expect(snapshot.presence).toEqual([expect.objectContaining({ id: 'sock-2', outputKey: 'custom_lobby' })]);
    expect(presenceBroadcasts().length).toBe(2);
  });

  it('expires the entry when the output socket disconnects', () => {
    const a = createFakeSocket('sock-a', 'output1');
    const b = createFakeSocket('sock-b', 'stage');
    connectionHandler(a.socket);
    connectionHandler(b.socket);
    expect(getOutputPresenceSnapshot().presence).toHaveLength(2);

    a.socket.connected = false;
    fire(a.handlers, 'disconnect', 'transport close');

    const snapshot = getOutputPresenceSnapshot();
    expect(snapshot.presence).toEqual([expect.objectContaining({ id: 'sock-b', outputKey: 'stage' })]);
    expect(presenceBroadcasts().length).toBe(3);
  });

  it('answers requestOutputPresence on the requesting socket only', () => {
    const { socket, handlers } = createFakeSocket('sock-3', 'stage');
    connectionHandler(socket);
    socket.emit.mockClear();

    fire(handlers, 'requestOutputPresence');

    const direct = socket.emit.mock.calls.filter(([event]) => event === 'outputPresenceUpdate');
    expect(direct).toHaveLength(1);
    expect(direct[0][1].presence).toEqual([expect.objectContaining({ outputKey: 'stage' })]);
  });

  it('does not track control clients as outputs', () => {
    const { socket } = createFakeSocket('sock-ctl', 'desktop');
    connectionHandler(socket);

    expect(getOutputPresenceSnapshot().presence).toEqual([]);
    expect(presenceBroadcasts()).toHaveLength(0);
  });

  it('rejects presence actions without lyrics:read permission', () => {
    const { socket, handlers } = createFakeSocket('sock-4', 'output1', { permissions: [] });
    connectionHandler(socket);
    expect(getOutputPresenceSnapshot().presence).toHaveLength(1);

    socket.emit.mockClear();
    fire(handlers, 'outputPresenceRegister', { purpose: 'custom_x' });
    fire(handlers, 'requestOutputPresence');

    const errors = socket.emit.mock.calls.filter(([event]) => event === 'permissionError');
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(getOutputPresenceSnapshot().presence).toEqual([expect.objectContaining({ outputKey: 'output1' })]);
  });
});
