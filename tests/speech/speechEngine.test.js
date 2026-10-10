/**
 * tests/speech/speechEngine.test.js — Live Sermon Assist Phase 2.
 *
 * Unit tests for the ELECTRON-FREE supervisor core in main/speechEngine.js:
 *
 *   - invariant 4: the off-by-default start gate (nothing starts unless the
 *     decision says so, and the default decision is "nothing installed"),
 *   - invariant 5: the loopback-only bind chokepoint (refuse, don't bind),
 *   - the crash-loop guard (3 crashes / 60 s, then stop respawning),
 *   - the SIGTERM -> SIGKILL escalation pinned at 2000 ms,
 *   - API-version policy (refuse a mismatched major, warn on a minor),
 *   - engine discovery (endpoint > package > none),
 *   - the health payload the renderer store keeps.
 *
 * Deliberately NO fork, NO socket, NO download: every lifecycle test drives
 * a path that returns BEFORE any process could be spawned (disabled,
 * nothing installed, refused bind), which is exactly the property invariant
 * 4 is about.
 */
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { SPEECH_PROTOCOL_VERSION, TOKEN_HEADER } from '../../shared/speech/protocol.js';
import {
  SPEECH_ENGINE_KILL_ESCALATION_MS,
  CRASH_LOOP_MAX_CRASHES,
  CRASH_LOOP_WINDOW_MS,
  DEFAULT_ENGINE_HOST,
  DEFAULT_ENGINE_PORT,
  HEALTH_POLL_INTERVAL_MS,
  HEALTH_FAILURE_LIMIT,
  RESPAWN_DELAY_MS,
  describeStartDecision,
  shouldStartEngine,
  resolveBindHost,
  isLoopbackEndpoint,
  resolveEngineDiscovery,
  createCrashGuard,
  isProcessAlive,
  scheduleKillEscalation,
  evaluateEngineApiVersion,
  buildHealthPayload,
  startSpeechEngine,
  stopSpeechEngine,
  getSpeechEngineSnapshot,
} from '../../main/speechEngine.js';

const REPO_ROOT = fileURLToPath(new NodeURL('../../', import.meta.url)).replace(/\/+$/, '');

/** The repo's own engine package — the `package` discovery outcome. */
const ENGINE_PACKAGE_ROOT = path.join(REPO_ROOT, 'speech-engine');

afterEach(() => {
  // Every test must leave the supervisor cold, whatever it exercised.
  stopSpeechEngine({ reason: 'test-teardown' });
});

// ===========================================================================
// Named constants — the plan's numbers, pinned.
// ===========================================================================

describe('supervisor constants (plan wording, pinned)', () => {
  it('escalates SIGTERM to SIGKILL after 2000 ms', () => {
    expect(SPEECH_ENGINE_KILL_ESCALATION_MS).toBe(2000);
  });

  it('trips the crash loop at 3 crashes inside 60000 ms', () => {
    expect(CRASH_LOOP_MAX_CRASHES).toBe(3);
    expect(CRASH_LOOP_WINDOW_MS).toBe(60000);
  });

  it('binds loopback by default on the dedicated port, with sane poll timings', () => {
    expect(DEFAULT_ENGINE_HOST).toBe('127.0.0.1');
    expect(DEFAULT_ENGINE_PORT).toBe(4731);
    expect(HEALTH_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(HEALTH_FAILURE_LIMIT).toBeGreaterThan(0);
    expect(RESPAWN_DELAY_MS).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Invariant 4 — off by default, cold by default.
// ===========================================================================

describe('invariant 4: the start gate', () => {
  it('the default state is disabled, and disabling wins over everything else', () => {
    expect(describeStartDecision()).toEqual({ start: false, reason: 'disabled' });
    expect(describeStartDecision({})).toEqual({ start: false, reason: 'disabled' });
    expect(describeStartDecision({ enabled: false })).toEqual({ start: false, reason: 'disabled' });
    expect(describeStartDecision({ enabled: 'yes' })).toEqual({ start: false, reason: 'disabled' });

    // Even a fully available engine never starts while the switch is off.
    expect(
      describeStartDecision({ enabled: false, engineAvailable: true, endpoint: 'http://127.0.0.1:4731' })
    ).toEqual({ start: false, reason: 'disabled' });
    expect(shouldStartEngine({ engineAvailable: true })).toBe(false);
    expect(shouldStartEngine({ enabled: true })).toBe(false);
  });

  it('enabled with nothing installed — THE DEFAULT — is "no-engine-installed"', () => {
    expect(describeStartDecision({ enabled: true })).toEqual({
      start: false,
      reason: 'no-engine-installed',
    });
    expect(shouldStartEngine({ enabled: true })).toBe(false);
  });

  it('enabled + a co-located engine package starts', () => {
    expect(describeStartDecision({ enabled: true, engineAvailable: true })).toEqual({
      start: true,
      reason: 'engine-available',
    });
    expect(shouldStartEngine({ enabled: true, engineAvailable: true })).toBe(true);
  });

  it('an explicit LOOPBACK endpoint starts; a non-loopback endpoint is refused', () => {
    expect(describeStartDecision({ enabled: true, endpoint: 'http://127.0.0.1:4731' })).toEqual({
      start: true,
      reason: 'explicit-endpoint',
    });
    expect(describeStartDecision({ enabled: true, endpoint: 'localhost:4731' })).toEqual({
      start: true,
      reason: 'explicit-endpoint',
    });
    expect(describeStartDecision({ enabled: true, endpoint: 'http://192.168.1.9:4731' })).toEqual({
      start: false,
      reason: 'non-loopback-endpoint',
    });
    expect(describeStartDecision({ enabled: true, endpoint: 'http://engine.example.com:4731' })).toEqual({
      start: false,
      reason: 'non-loopback-endpoint',
    });
  });

  it('startSpeechEngine() with the default options refuses and starts nothing', async () => {
    const result = await startSpeechEngine({ enabled: false });
    expect(result).toMatchObject({ ok: false, reason: 'disabled' });
    expect(getSpeechEngineSnapshot().running).toBe(false);

    const noEngine = await startSpeechEngine({
      enabled: true,
      engineRoots: [path.join(REPO_ROOT, 'definitely-not-installed')],
    });
    expect(noEngine).toMatchObject({ ok: false, reason: 'no-engine-installed', mode: 'none' });
    expect(getSpeechEngineSnapshot().running).toBe(false);
    expect(getSpeechEngineSnapshot().pid).toBeNull();
  });

  it('a non-loopback endpoint is refused by the lifecycle too, not just the helper', async () => {
    const errors = [];
    const result = await startSpeechEngine({
      enabled: true,
      endpoint: 'http://192.168.1.9:4731',
      onError: (error) => errors.push(error),
    });
    expect(result).toMatchObject({ ok: false, reason: 'non-loopback-endpoint' });
    expect(getSpeechEngineSnapshot().running).toBe(false);
  });
});

// ===========================================================================
// Invariant 5 — loopback only, never a wildcard or LAN bind.
// ===========================================================================

describe('invariant 5: loopback-only binds', () => {
  it('resolveBindHost accepts loopback forms only', () => {
    expect(resolveBindHost()).toBe('127.0.0.1');
    expect(resolveBindHost('127.0.0.1')).toBe('127.0.0.1');
    expect(resolveBindHost('localhost')).toBe('localhost');
    expect(resolveBindHost('http://127.0.0.1:4731')).toBe('127.0.0.1');
    expect(resolveBindHost('127.0.0.53')).toBe('127.0.0.53');
    expect(resolveBindHost('[::1]:4731')).toBe('::1');
  });

  it('resolveBindHost THROWS for a wildcard, a LAN address, or nothing at all', () => {
    for (const host of ['0.0.0.0', '192.168.1.5', '10.0.0.1', '', '   ', null, 42]) {
      expect(() => resolveBindHost(host), `${JSON.stringify(host)} must be refused`).toThrow(/loopback/);
    }
    // `undefined` is the one special case: it selects the DEFAULT parameter,
    // which is loopback — that is how the supervisor's own default binds.
    expect(resolveBindHost(undefined)).toBe(DEFAULT_ENGINE_HOST);
  });

  it('isLoopbackEndpoint recognizes URL, host:port, and bracketed v6 forms', () => {
    for (const endpoint of ['127.0.0.1:4731', 'http://127.0.0.1:4731', 'localhost:4731', 'http://localhost:5174', '[::1]:4731']) {
      expect(isLoopbackEndpoint(endpoint), `${endpoint} is loopback`).toBe(true);
    }
    for (const endpoint of ['0.0.0.0:4731', 'http://192.168.1.9:4731', 'example.com:4731', '', null, 42]) {
      expect(isLoopbackEndpoint(endpoint), `${JSON.stringify(endpoint)} is not loopback`).toBe(false);
    }
  });

  it('the lifecycle refuses a non-loopback HOST before anything is started', async () => {
    const errors = [];
    const result = await startSpeechEngine({
      enabled: true,
      endpoint: 'http://127.0.0.1:4731',
      host: '0.0.0.0',
      onError: (error) => errors.push(error),
    });
    expect(result).toMatchObject({ ok: false, reason: 'non-loopback-host' });
    expect(errors.map((e) => e.code)).toContain('engine-non-loopback-host');
    expect(getSpeechEngineSnapshot().running).toBe(false);
  });
});

// ===========================================================================
// Crash-loop guard.
// ===========================================================================

describe('crash-loop guard', () => {
  it('trips on the 3rd crash inside the window, not before', () => {
    let now = 1_000_000;
    const guard = createCrashGuard({ now: () => now });

    expect(guard.recordCrash()).toEqual({ crashes: 1, tripped: false });
    now += 1000;
    expect(guard.recordCrash()).toEqual({ crashes: 2, tripped: false });
    now += 1000;
    expect(guard.recordCrash()).toEqual({ crashes: 3, tripped: true });
  });

  it('crashes outside the window age out instead of accumulating forever', () => {
    let now = 5_000_000;
    const guard = createCrashGuard({ now: () => now });

    guard.recordCrash();
    guard.recordCrash();
    now += CRASH_LOOP_WINDOW_MS + 1; // both stamps age out
    expect(guard.crashes).toBe(0);
    expect(guard.recordCrash()).toEqual({ crashes: 1, tripped: false });
  });

  it('the default guard uses the pinned 3 / 60000 policy', () => {
    let now = 0;
    const guard = createCrashGuard({ now: () => now });
    for (let i = 1; i < CRASH_LOOP_MAX_CRASHES; i += 1) {
      now += 1000;
      expect(guard.recordCrash().tripped, `${i} crashes must not trip yet`).toBe(false);
    }
    now += 1000;
    expect(guard.recordCrash()).toEqual({ crashes: CRASH_LOOP_MAX_CRASHES, tripped: true });

    guard.reset();
    expect(guard.crashes).toBe(0);
  });
});

// ===========================================================================
// SIGTERM -> SIGKILL escalation.
// ===========================================================================

describe('kill escalation', () => {
  const aliveProcess = () => ({
    exitCode: null,
    signalCode: null,
    kills: [],
    kill(signal) {
      this.kills.push(signal);
      return true;
    },
  });

  it('schedules the SIGKILL at the pinned 2000 ms delay', () => {
    const delays = [];
    const handles = [];
    const proc = aliveProcess();

    const cancel = scheduleKillEscalation(proc, {
      schedule: (fn, ms) => {
        delays.push(ms);
        handles.push(fn);
        return 'timer-handle';
      },
      cancel: () => {},
    });

    expect(delays).toEqual([SPEECH_ENGINE_KILL_ESCALATION_MS]);
    expect(SPEECH_ENGINE_KILL_ESCALATION_MS).toBe(2000);
    expect(typeof cancel).toBe('function');

    // Firing the scheduled callback SIGKILLs the still-alive process.
    handles[0]();
    expect(proc.kills).toEqual(['SIGKILL']);
  });

  it('does nothing when the process already exited, and cancels cleanly', () => {
    let scheduled = null;
    let cancelled = null;
    const proc = { exitCode: 0, signalCode: null, kills: [], kill(s) { this.kills.push(s); } };

    const cancel = scheduleKillEscalation(proc, {
      schedule: (fn, ms) => {
        scheduled = { fn, ms };
        return 'timer-handle';
      },
      cancel: (handle) => {
        cancelled = handle;
      },
    });

    scheduled.fn(); // already dead -> no kill attempt
    expect(proc.kills).toEqual([]);

    cancel();
    expect(cancelled).toBe('timer-handle');
  });

  it('isProcessAlive reflects exit/signal state', () => {
    expect(isProcessAlive(null)).toBe(false);
    expect(isProcessAlive(undefined)).toBe(false);
    expect(isProcessAlive({ exitCode: null, signalCode: null })).toBe(true);
    expect(isProcessAlive({ exitCode: 1, signalCode: null })).toBe(false);
    expect(isProcessAlive({ exitCode: null, signalCode: 'SIGTERM' })).toBe(false);
  });
});

// ===========================================================================
// Engine discovery — endpoint > package > none.
// ===========================================================================

describe('engine discovery', () => {
  it('an explicit endpoint wins outright, even with engine roots present', () => {
    const outcome = resolveEngineDiscovery({
      configuredEndpoint: 'http://127.0.0.1:4731',
      engineRoots: [ENGINE_PACKAGE_ROOT],
    });
    expect(outcome).toEqual({
      mode: 'endpoint',
      endpoint: 'http://127.0.0.1:4731',
      entry: null,
      reason: 'explicit-endpoint',
    });
  });

  it('a co-located package resolves to its index.js entry', () => {
    const outcome = resolveEngineDiscovery({ engineRoots: [ENGINE_PACKAGE_ROOT] });
    expect(outcome.mode).toBe('package');
    expect(outcome.reason).toBe('co-located-package');
    expect(outcome.root).toBe(ENGINE_PACKAGE_ROOT);
    expect(outcome.entry).toBe(path.join(ENGINE_PACKAGE_ROOT, 'index.js'));
    expect(outcome.endpoint).toBeNull();
  });

  it('nothing installed is the default outcome, and it is not an error', () => {
    expect(resolveEngineDiscovery()).toEqual({
      mode: 'none',
      endpoint: null,
      entry: null,
      reason: 'no-engine-installed',
    });
    expect(resolveEngineDiscovery({ engineRoots: [] })).toMatchObject({ mode: 'none' });
    expect(
      resolveEngineDiscovery({ engineRoots: [path.join(REPO_ROOT, 'nope'), ''] })
    ).toMatchObject({ mode: 'none', reason: 'no-engine-installed' });
  });

  it('a blank endpoint config falls through to package discovery', () => {
    expect(resolveEngineDiscovery({ configuredEndpoint: '   ', engineRoots: [ENGINE_PACKAGE_ROOT] })).toMatchObject({
      mode: 'package',
    });
  });
});

// ===========================================================================
// API version policy — refuse majors, warn on minors.
// ===========================================================================

describe('API version policy', () => {
  it('the engine speaking this build\'s version is compatible and silent', () => {
    const verdict = evaluateEngineApiVersion(SPEECH_PROTOCOL_VERSION);
    expect(verdict.ok).toBe(true);
    expect(verdict.level).toBe('compatible');
    expect(verdict.shouldWarn).toBe(false);
  });

  it('a minor mismatch still talks, but warns', () => {
    const verdict = evaluateEngineApiVersion({
      api: SPEECH_PROTOCOL_VERSION.api,
      minor: SPEECH_PROTOCOL_VERSION.minor + 1,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.level).toBe('minor-mismatch');
    expect(verdict.shouldWarn).toBe(true);
    expect(verdict.reason).toBeTruthy();
  });

  it('a mismatched MAJOR is refused outright', () => {
    const verdict = evaluateEngineApiVersion({ api: SPEECH_PROTOCOL_VERSION.api + 1, minor: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.level).toBe('incompatible');
    expect(verdict.shouldWarn).toBe(false);
  });

  it('a malformed version is refused, never guessed at', () => {
    for (const value of ['nope', null, undefined, {}, { api: 'x' }, [1, 0]]) {
      const verdict = evaluateEngineApiVersion(value);
      expect(verdict.ok, `${JSON.stringify(value)} must be refused`).toBe(false);
      expect(verdict.level).toBe('malformed');
      expect(verdict.shouldWarn).toBe(false);
    }
  });
});

// ===========================================================================
// Health payload — the shape the renderer store keeps.
// ===========================================================================

describe('health payload', () => {
  it('maps the engine health body onto the store shape', () => {
    const payload = buildHealthPayload({
      status: 'ok',
      apiVersion: { api: 1, minor: 0 },
      model: 'fake-canned',
      backend: 'fake',
      rtf: 0.08,
      memoryMb: 64,
      pid: 4242,
      uptimeMs: 1500,
    });
    expect(payload).toEqual({
      apiVersion: { api: 1, minor: 0 },
      model: 'fake-canned',
      backend: 'fake',
      rtf: 0.08,
      memoryMb: 64,
      pid: 4242,
      uptime: 1.5,
    });
  });

  it('falls back to the supervisor pid and to a startedAt-derived uptime', () => {
    const payload = buildHealthPayload(
      {},
      { pid: 99, startedAt: 100_000, now: 102_000 }
    );
    expect(payload.pid).toBe(99);
    expect(payload.uptime).toBe(2);
    expect(payload.model).toBeNull();
    expect(payload.backend).toBe('unknown');
    expect(payload.rtf).toBeNull();
    expect(payload.memoryMb).toBeNull();
  });

  it('NEVER carries a token, no matter what the raw body contained', () => {
    const payload = buildHealthPayload({
      apiVersion: { api: 1, minor: 0 },
      token: 'super-secret-launch-token',
      [TOKEN_HEADER]: 'super-secret-launch-token',
    });
    expect(Object.keys(payload)).not.toContain('token');
    expect(Object.keys(payload)).not.toContain(TOKEN_HEADER);
    expect(JSON.stringify(payload)).not.toContain('super-secret-launch-token');
  });
});
