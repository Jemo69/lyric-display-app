import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import registerSocketEvents, { getConnectedClients } from '../../server/events.js';

function createFakeSocket(id, clientType) {
  const handlers = new Map();
  const socket = {
    id,
    userData: {
      clientType,
      deviceId: `device-${id}`,
      sessionId: 'test-session',
      permissions: [],
      connectedAt: Date.now()
    },
    connected: true,
    emit: vi.fn(),
    broadcast: { emit: vi.fn() },
    on(event, callback) {
      const list = handlers.get(event) || [];
      list.push(callback);
      handlers.set(event, list);
    }
  };
  return { socket, handlers };
}

function triggerOutputMetrics(socket, output = 'output1') {
  socket.handlers.get('outputMetrics').forEach((handler) => handler({
    output,
    metrics: {
      adjustedFontSize: 20,
      autosizerActive: true,
      viewportWidth: 1280,
      viewportHeight: 720,
      timestamp: Date.now()
    }
  }));
}

function triggerDisconnect(socket, reason = 'transport close') {
  socket.handlers.get('disconnect').forEach((handler) => handler(reason));
}

describe('server/events disconnect cleanup', () => {
  let io;
  let connectionHandler;
  let emitted;
  let getConnectedClientsFn;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const module = await import('../../server/events.js');
    getConnectedClientsFn = module.getConnectedClients;
    io = new EventEmitter();
    emitted = [];
    io.emit = vi.fn((...args) => {
      emitted.push(args);
    });
    module.default(io, { hasPermission: () => true });
    connectionHandler = io.listeners('connection')[0];
  });

  const outputMetricsEmits = () => emitted.filter(([event]) => event === 'outputMetrics');

  it('sweeps disconnected output instances and re-broadcasts remaining metrics', () => {
    const a = createFakeSocket('sock-a', 'output1');
    const b = createFakeSocket('sock-b', 'output1');
    connectionHandler(a.socket);
    connectionHandler(b.socket);

    triggerOutputMetrics(a);
    triggerOutputMetrics(b);
    expect(outputMetricsEmits().length).toBe(2);

    a.socket.connected = false;
    triggerDisconnect(a);

    const afterDisconnect = outputMetricsEmits().slice(-1)[0];
    expect(afterDisconnect).toBeDefined();
    expect(afterDisconnect[1].instanceCount).toBe(1);
    expect(afterDisconnect[1].allInstances.map((instance) => instance.socketId)).toEqual(['sock-b']);

    const clients = getConnectedClientsFn();
    expect(clients.some((client) => client.id === 'sock-a')).toBe(false);
    expect(clients.some((client) => client.id === 'sock-b')).toBe(true);
  });

  it('cleans up output instances for a custom output registered by the client', () => {
    const a = createFakeSocket('sock-c', 'output1');
    connectionHandler(a.socket);
    triggerOutputMetrics(a, 'custom_screen');

    a.socket.connected = false;
    expect(() => triggerDisconnect(a)).not.toThrow();

    expect(outputMetricsEmits().length).toBe(1);
  });

  it('does not throw when no instance remains after disconnect', () => {
    const a = createFakeSocket('sock-d', 'output1');
    connectionHandler(a.socket);
    triggerOutputMetrics(a);

    a.socket.connected = false;
    expect(() => triggerDisconnect(a)).not.toThrow();
  });
});
