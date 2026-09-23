import { describe, it, expect, vi } from 'vitest';
import {
  NDI_STATES,
  NDI_EVENTS,
  transition,
  isLiveState,
  isSettledState,
  buildSnapshot,
} from '../../../main/ndi/ndiStates.js';
import { createNdiSender } from '../../../main/ndi/sender.js';
import {
  detectNdiRuntime,
  isLoopbackAllowed,
  sanitizeSourceName,
} from '../../../main/ndi/runtime.js';
import {
  LoopbackTransport,
  resolveTransport,
  RUNTIME_NOT_INSTALLED,
  NATIVE_SENDER_NOT_BUNDLED,
} from '../../../main/ndi/transport.js';

function mockTransport(overrides = {}) {
  return {
    start: vi.fn(async () => {}),
    poll: vi.fn(() => ({ alive: true, framesSent: 60, fps: 30 })),
    stop: vi.fn(() => {}),
    rename: vi.fn(() => {}),
    ...overrides,
  };
}

function senderWith(transport, extraDeps = {}) {
  return createNdiSender({
    outputKey: 'output1',
    sourceName: 'LyricDisplay Output 1',
    deps: {
      detectRuntime: () => ({ available: true, kind: 'loopback' }),
      resolve: async () => ({ kind: 'loopback', transport }),
      isLoopback: () => true,
      now: () => 1_700_000_000_000,
      ...extraDeps,
    },
  });
}

describe('NDI state machine transitions', () => {
  it('stopped + enable -> starting', () => {
    expect(transition(NDI_STATES.STOPPED, NDI_EVENTS.ENABLE)).toBe(NDI_STATES.STARTING);
  });

  it('starting + started -> live; starting + start-failed -> error', () => {
    expect(transition(NDI_STATES.STARTING, NDI_EVENTS.STARTED)).toBe(NDI_STATES.LIVE);
    expect(transition(NDI_STATES.STARTING, NDI_EVENTS.START_FAILED)).toBe(NDI_STATES.ERROR);
  });

  it('starting + disable -> stopped (cancel a slow handshake)', () => {
    expect(transition(NDI_STATES.STARTING, NDI_EVENTS.DISABLE)).toBe(NDI_STATES.STOPPED);
  });

  it('live + disable -> stopped; live + transport-dropped -> error', () => {
    expect(transition(NDI_STATES.LIVE, NDI_EVENTS.DISABLE)).toBe(NDI_STATES.STOPPED);
    expect(transition(NDI_STATES.LIVE, NDI_EVENTS.TRANSPORT_DROPPED)).toBe(NDI_STATES.ERROR);
  });

  it('error + enable retries -> starting; error + disable -> stopped', () => {
    expect(transition(NDI_STATES.ERROR, NDI_EVENTS.ENABLE)).toBe(NDI_STATES.STARTING);
    expect(transition(NDI_STATES.ERROR, NDI_EVENTS.DISABLE)).toBe(NDI_STATES.STOPPED);
  });

  it('unknown events are no-ops; unknown states fall back to stopped', () => {
    expect(transition(NDI_STATES.LIVE, NDI_EVENTS.ENABLE)).toBe(NDI_STATES.LIVE);
    expect(transition(NDI_STATES.STOPPED, 'bogus')).toBe(NDI_STATES.STOPPED);
    expect(transition('bogus', NDI_EVENTS.ENABLE)).toBe(NDI_STATES.STOPPED);
  });

  it('state predicates', () => {
    expect(isLiveState('live')).toBe(true);
    expect(isLiveState('starting')).toBe(false);
    expect(isSettledState('error')).toBe(true);
    expect(isSettledState('starting')).toBe(false);
  });
});

describe('NDI snapshot (P03 presence shape)', () => {
  it('carries the presence-ready fields with safe defaults', () => {
    const snap = buildSnapshot({ outputKey: 'output2' });
    expect(snap).toMatchObject({
      outputKey: 'output2',
      enabled: false,
      state: 'stopped',
      transportKind: 'none',
      framesSent: 0,
      fps: 0,
      error: null,
    });
    expect(snap.runtime).toEqual({ available: false, kind: 'none' });
    expect('lastHeartbeatAt' in snap).toBe(true);
    expect('sourceName' in snap).toBe(true);
  });
});

describe('NDI sender lifecycle (mock transport)', () => {
  it('enable -> starting, first heartbeat tick -> live with frame counters', async () => {
    const transport = mockTransport();
    const sender = senderWith(transport);
    const enabling = await sender.enable();
    expect(enabling.state).toBe(NDI_STATES.STARTING);
    expect(enabling.enabled).toBe(true);
    expect(transport.start).toHaveBeenCalledTimes(1);

    const live = sender.tick();
    expect(live.state).toBe(NDI_STATES.LIVE);
    expect(live.framesSent).toBeGreaterThan(0);
    expect(live.fps).toBe(30);
    expect(live.lastHeartbeatAt).not.toBeNull();
  });

  it('disable from live -> stopped and stops the transport', async () => {
    const transport = mockTransport();
    const sender = senderWith(transport);
    await sender.enable();
    sender.tick();
    const stopped = sender.disable();
    expect(stopped.state).toBe(NDI_STATES.STOPPED);
    expect(stopped.enabled).toBe(false);
    expect(transport.stop).toHaveBeenCalled();
  });

  it('transport start throwing -> error TRANSPORT_START_FAILED', async () => {
    const transport = mockTransport({
      start: vi.fn(async () => {
        throw new Error('no device');
      }),
    });
    const sender = senderWith(transport);
    const snap = await sender.enable();
    expect(snap.state).toBe(NDI_STATES.ERROR);
    expect(snap.error.code).toBe('TRANSPORT_START_FAILED');
  });

  it('mid-live transport drop -> error TRANSPORT_DROPPED', async () => {
    const transport = mockTransport();
    const sender = senderWith(transport);
    await sender.enable();
    sender.tick();
    transport.poll.mockReturnValueOnce({ alive: false, framesSent: 60, fps: 0 });
    const dropped = sender.tick();
    expect(dropped.state).toBe(NDI_STATES.ERROR);
    expect(dropped.error.code).toBe('TRANSPORT_DROPPED');
  });

  it('error -> disable -> stopped, then enable retries -> starting', async () => {
    const transport = mockTransport({
      start: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const sender = senderWith(transport);
    await sender.enable();
    expect(sender.getSnapshot().state).toBe(NDI_STATES.ERROR);
    expect(sender.disable().state).toBe(NDI_STATES.STOPPED);
    // Retry re-attempts the handshake (start called again) instead of
    // getting stuck: with an always-failing transport it honestly lands
    // back in error.
    const retry = await sender.enable();
    expect(transport.start).toHaveBeenCalledTimes(2);
    expect(retry.state).toBe(NDI_STATES.ERROR);
    expect(retry.error.code).toBe('TRANSPORT_START_FAILED');
  });

  it('no transport available -> honest RUNTIME_NOT_INSTALLED error', async () => {
    const sender = senderWith(mockTransport(), {
      detectRuntime: () => ({ available: false, kind: 'none' }),
      resolve: async () => ({ kind: 'none', ...RUNTIME_NOT_INSTALLED }),
      isLoopback: () => false,
    });
    const snap = await sender.enable();
    expect(snap.state).toBe(NDI_STATES.ERROR);
    expect(snap.error.code).toBe('RUNTIME_NOT_INSTALLED');
    expect(snap.error.message).toMatch(/works normally without it/);
  });
});

describe('NDI transport resolution', () => {
  it('loopback transport pumps real counters', () => {
    const loop = new LoopbackTransport({ sourceName: 'Test' });
    loop.start();
    const first = loop.poll();
    const second = loop.poll();
    expect(first.alive).toBe(true);
    expect(second.framesSent).toBeGreaterThan(first.framesSent);
    loop.stop();
    expect(loop.poll().alive).toBe(false);
  });

  it('loopback opt-in resolves to a loopback transport', async () => {
    const res = await resolveTransport({
      sourceName: 'X',
      runtime: { available: false, kind: 'none' },
      allowLoopback: true,
      loadNative: async () => ({ ok: false, reason: 'sender-module-not-configured' }),
    });
    expect(res.kind).toBe('loopback');
  });

  it('no runtime and no sender module -> RUNTIME_NOT_INSTALLED', async () => {
    const res = await resolveTransport({
      sourceName: 'X',
      runtime: { available: false, kind: 'none' },
      allowLoopback: false,
      loadNative: async () => ({ ok: false, reason: 'sender-module-not-configured' }),
    });
    expect(res.kind).toBe('none');
    expect(res.code).toBe(RUNTIME_NOT_INSTALLED.code);
  });

  it('runtime present but native sender not bundled -> follow-up code', async () => {
    const res = await resolveTransport({
      sourceName: 'X',
      runtime: { available: true, kind: 'native' },
      allowLoopback: false,
      loadNative: async () => ({ ok: false, reason: 'sender-module-not-configured' }),
    });
    expect(res.kind).toBe('none');
    expect(res.code).toBe(NATIVE_SENDER_NOT_BUNDLED.code);
  });
});

describe('NDI runtime detection', () => {
  it('clean machine -> unavailable with a volunteer-readable hint', () => {
    const found = detectNdiRuntime({ env: {}, existsSync: () => false, platform: 'linux' });
    expect(found.available).toBe(false);
    expect(found.kind).toBe('none');
    expect(found.hint).toMatch(/works normally without it/);
    expect(found.searched.length).toBeGreaterThan(0);
  });

  it('NDI_RUNTIME_DIR override is honored', () => {
    const found = detectNdiRuntime({
      env: { NDI_RUNTIME_DIR: '/opt/ndi' },
      existsSync: (p) => p === '/opt/ndi',
      platform: 'linux',
    });
    expect(found.available).toBe(true);
    expect(found.kind).toBe('native');
    expect(found.libPath).toBe('/opt/ndi');
  });

  it('companion binary counts as a runtime', () => {
    const found = detectNdiRuntime({
      env: { LYRICDISPLAY_NDI_COMPANION: '/opt/ld-ndi-sender' },
      existsSync: (p) => p === '/opt/ld-ndi-sender',
      platform: 'linux',
    });
    expect(found.available).toBe(true);
    expect(found.kind).toBe('companion');
  });

  it('loopback opt-in is env-gated', () => {
    expect(isLoopbackAllowed({ LYRICDISPLAY_NDI_TRANSPORT: 'loopback' })).toBe(true);
    expect(isLoopbackAllowed({})).toBe(false);
  });

  it('source names are sanitized', () => {
    expect(sanitizeSourceName('  LyricDisplay   Output 1  ')).toBe('LyricDisplay Output 1');
    expect(sanitizeSourceName('', 'Fallback')).toBe('Fallback');
  });
});
