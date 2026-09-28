/**
 * main/speechEngine.js — Live Sermon Assist, Phase 2: the engine sidecar
 * supervisor. Modelled directly on main/backend.js (same logger, same
 * fork/health-poll/SIGTERM shape) with the speech plan's extra rules.
 *
 * INVARIANT 4 — OFF BY DEFAULT, COLD BY DEFAULT: importing this module has
 * NO side effects (no fork, no timer, no network). The only way anything
 * starts is an explicit startSpeechEngine() call whose options pass
 * shouldStartEngine() — `enabled !== true` means nothing happens, ever.
 *
 * INVARIANT 5 — AUDIO STAYS LOCAL: the only bind host ever accepted is a
 * loopback address (resolveBindHost throws otherwise), and the engine token
 * is generated per launch and passed by environment, never logged.
 *
 * PURE-CORE RULE (same as main/permissionPolicy.js): this module imports
 * NOTHING from `electron`, so its logic is unit-testable under vitest
 * without booting or mocking Electron. main.js / speechIpc.js supply
 * Electron-owned data (window, paths) as plain options.
 *
 * Security/hygiene: never log tokens, audio, sample values, or transcript
 * text. Engine messages are logged by TYPE only.
 */
import { fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import createMainLogger from './logger.js';
import {
  TOKEN_HEADER,
  ENGINE_ROUTES,
  checkApiCompatibility,
  generateEngineToken,
  isLoopbackHost,
  validateMessage,
} from '../shared/speech/protocol.js';

const log = createMainLogger('SpeechEngine');

// ---------------------------------------------------------------------------
// Named constants (unit-tested — see tests/speech/speechEngine.test.js)
// ---------------------------------------------------------------------------

/** Plan number: SIGTERM first, escalate to SIGKILL after this long. */
export const SPEECH_ENGINE_KILL_ESCALATION_MS = 2000;

/** Crash-loop guard: this many crashes... */
export const CRASH_LOOP_MAX_CRASHES = 3;
/** ...inside this window disables the feature (no endless respawning). */
export const CRASH_LOOP_WINDOW_MS = 60000;

/** The only bind host this supervisor will ever pass to the engine. */
export const DEFAULT_ENGINE_HOST = '127.0.0.1';
/** Default loopback port for a forked engine (override with LD_SPEECH_PORT). */
export const DEFAULT_ENGINE_PORT = 4731;

/** Health poll cadence once the engine is healthy (mirrors backend.js). */
export const HEALTH_POLL_INTERVAL_MS = 1000;
/** Give up if the engine does not answer within this window at startup. */
export const HEALTH_STARTUP_TIMEOUT_MS = 30000;
/** Consecutive failed health polls before the engine is declared lost. */
export const HEALTH_FAILURE_LIMIT = 5;
/** Delay between a crash and its single respawn (crash-loop bounded). */
export const RESPAWN_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Pure decision helpers (the unit-testable core)
// ---------------------------------------------------------------------------

/** Strip scheme/port/brackets from a host-ish value; null when impossible. */
function normalizeHost(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      return new URL(raw).hostname;
    } catch {
      return null;
    }
  }
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end === -1 ? null : raw.slice(1, end);
  }
  const match = /^([^:]+)(?::\d+)?$/.exec(raw);
  return match ? match[1] : raw;
}

/**
 * Is `endpoint` (URL or host:port) a loopback destination?
 *
 * @param {unknown} endpoint
 * @returns {boolean}
 */
export function isLoopbackEndpoint(endpoint) {
  const host = normalizeHost(endpoint);
  return host ? isLoopbackHost(host) : false;
}

/**
 * The start/stop decision, with its reason — the single gate through which
 * the engine may ever come to life.
 *
 *   enabled !== true ............... { start: false, reason: 'disabled' }
 *   non-loopback endpoint .......... { start: false, reason: 'non-loopback-endpoint' }
 *   loopback endpoint configured ... { start: true,  reason: 'explicit-endpoint' }
 *   co-located engine package ...... { start: true,  reason: 'engine-available' }
 *   nothing installed (THE DEFAULT)  { start: false, reason: 'no-engine-installed' }
 *
 * @param {Object} state
 * @param {boolean} [state.enabled] the user's speech.enabled switch
 * @param {string|null} [state.endpoint] explicitly configured engine endpoint
 * @param {boolean} [state.engineAvailable] a co-located engine package exists
 * @returns {{ start: boolean, reason: string }}
 */
export function describeStartDecision({ enabled, endpoint, engineAvailable } = {}) {
  if (enabled !== true) return { start: false, reason: 'disabled' };

  if (typeof endpoint === 'string' && endpoint.trim()) {
    if (!isLoopbackEndpoint(endpoint)) return { start: false, reason: 'non-loopback-endpoint' };
    return { start: true, reason: 'explicit-endpoint' };
  }

  if (engineAvailable === true) return { start: true, reason: 'engine-available' };
  return { start: false, reason: 'no-engine-installed' };
}

/** Boolean form of describeStartDecision — the invariant-4 predicate. */
export function shouldStartEngine(state) {
  return describeStartDecision(state).start === true;
}

/**
 * Resolve the bind host: MUST be loopback, or it throws. This is the
 * invariant-5 chokepoint — no code path binds anything else.
 *
 * @param {string} [host=DEFAULT_ENGINE_HOST]
 * @returns {string} normalized hostname
 * @throws {Error} when the host is missing or non-loopback.
 */
export function resolveBindHost(host = DEFAULT_ENGINE_HOST) {
  const normalized = normalizeHost(host);
  if (!normalized || !isLoopbackHost(normalized)) {
    throw new Error(
      `refusing to bind non-loopback speech-engine host ${JSON.stringify(String(host ?? ''))} — ` +
        'the engine may only listen on loopback'
    );
  }
  return normalized;
}

/**
 * Discover which of the plan's three outcomes we are in:
 *   (a) endpoint — an explicitly configured engine URL wins outright,
 *   (b) package  — a co-located speech-engine package (repo checkout or a
 *                  Phase 3 install directory) with an index.js entry,
 *   (c) none     — nothing installed. THE DEFAULT, and the app works fine.
 *
 * @param {Object} [options]
 * @param {string|null} [options.configuredEndpoint]
 * @param {string[]} [options.engineRoots] candidate engine directories
 * @returns {{ mode: 'endpoint'|'package'|'none', endpoint: string|null,
 *             entry: string|null, root?: string, reason: string }}
 */
export function resolveEngineDiscovery({ configuredEndpoint = null, engineRoots = [] } = {}) {
  const endpoint =
    typeof configuredEndpoint === 'string' && configuredEndpoint.trim()
      ? configuredEndpoint.trim()
      : null;
  if (endpoint) {
    return { mode: 'endpoint', endpoint, entry: null, reason: 'explicit-endpoint' };
  }

  for (const root of engineRoots) {
    if (typeof root !== 'string' || !root) continue;
    const entry = path.join(root, 'index.js');
    try {
      if (fs.existsSync(entry) && fs.statSync(entry).isFile()) {
        return { mode: 'package', endpoint: null, entry, root, reason: 'co-located-package' };
      }
    } catch {
      // Unreadable candidate — treat like "not installed" and keep looking.
    }
  }

  return { mode: 'none', endpoint: null, entry: null, reason: 'no-engine-installed' };
}

/**
 * Crash-loop guard: N crashes inside a window trip it; outside the window
 * old crashes age out. `now` is injectable so tests run in microseconds.
 *
 * @param {Object} [options]
 * @param {number} [options.maxCrashes=CRASH_LOOP_MAX_CRASHES]
 * @param {number} [options.windowMs=CRASH_LOOP_WINDOW_MS]
 * @param {() => number} [options.now]
 * @returns {{ recordCrash: () => { crashes: number, tripped: boolean },
 *             reset: () => void, readonly crashes: number }}
 */
export function createCrashGuard({
  maxCrashes = CRASH_LOOP_MAX_CRASHES,
  windowMs = CRASH_LOOP_WINDOW_MS,
  now = Date.now,
} = {}) {
  const stamps = [];
  const prune = (at) => {
    while (stamps.length > 0 && at - stamps[0] > windowMs) stamps.shift();
  };

  return {
    recordCrash() {
      const at = now();
      stamps.push(at);
      prune(at);
      return { crashes: stamps.length, tripped: stamps.length >= maxCrashes };
    },
    reset() {
      stamps.length = 0;
    },
    get crashes() {
      const at = now();
      prune(at);
      return stamps.length;
    },
  };
}

/** Is this child process still alive (not exited, not signalled out)? */
export function isProcessAlive(procRef) {
  return Boolean(procRef) && procRef.exitCode === null && procRef.signalCode === null;
}

/**
 * SIGTERM has been sent; schedule the SIGKILL escalation the plan pins at
 * SPEECH_ENGINE_KILL_ESCALATION_MS (2000 ms). Returns a cancel function.
 *
 * The scheduler is injectable so the test can assert the delay and the
 * escalation without waiting two real seconds.
 *
 * @param {object} procRef ChildProcess-like ({ exitCode, signalCode, kill })
 * @param {Object} [options]
 * @param {number} [options.escalationMs=SPEECH_ENGINE_KILL_ESCALATION_MS]
 * @param {(fn: Function, ms: number) => any} [options.schedule]
 * @param {(handle: any) => void} [options.cancel]
 * @returns {() => void} cancel the escalation
 */
export function scheduleKillEscalation(
  procRef,
  {
    escalationMs = SPEECH_ENGINE_KILL_ESCALATION_MS,
    schedule = setTimeout,
    cancel = clearTimeout,
  } = {}
) {
  const timer = schedule(() => {
    try {
      if (isProcessAlive(procRef)) procRef.kill('SIGKILL');
    } catch {
      // Process already gone — escalation is best-effort by design.
    }
  }, escalationMs);

  return () => cancel(timer);
}

/**
 * The health gate on the plan's terms: refuse a mismatched MAJOR apiVersion,
 * warn on a mismatched minor.
 *
 * @param {unknown} apiVersion engine-reported version
 * @returns {{ ok: boolean, level: string, reason?: string, shouldWarn: boolean }}
 */
export function evaluateEngineApiVersion(apiVersion) {
  const verdict = checkApiCompatibility(apiVersion);
  return { ...verdict, shouldWarn: verdict.ok && verdict.level === 'minor-mismatch' };
}

/**
 * Shape an engine health response into the payload the renderer store keeps
 * (`useSpeechStore` health): apiVersion, model, backend, rtf, memoryMb,
 * pid, uptime (seconds).
 *
 * @param {unknown} raw GET /v1/health body
 * @param {Object} [context]
 * @param {number|null} [context.pid] supervisor-known pid fallback
 * @param {number|null} [context.startedAt] epoch ms of launch, for uptime
 * @param {number} [context.now]
 * @returns {object} health payload (never contains the token)
 */
export function buildHealthPayload(raw, { pid = null, startedAt = null, now = Date.now() } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

  const uptimeSec =
    numberOrNull(source.uptime) ??
    (numberOrNull(source.uptimeMs) !== null ? source.uptimeMs / 1000 : null) ??
    (startedAt ? (now - startedAt) / 1000 : null) ??
    0;

  return {
    apiVersion: source.apiVersion ?? null,
    model: typeof source.model === 'string' ? source.model : null,
    backend: typeof source.backend === 'string' ? source.backend : 'unknown',
    rtf: numberOrNull(source.rtf),
    memoryMb: numberOrNull(source.memoryMb),
    pid: numberOrNull(source.pid) ?? numberOrNull(pid),
    uptime: Math.max(0, Math.round(uptimeSec * 1000) / 1000),
  };
}

// ---------------------------------------------------------------------------
// Supervisor state (mutated only by start/stop below — cold at import time)
// ---------------------------------------------------------------------------

let engineProcess = null;
let healthTimer = null;
let respawnTimer = null;
let cancelEscalation = null;
let phase = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping'
let stopRequested = false;
let stopIntent = null; // 'user' | 'internal'
let startupAborted = null;
let healthFailures = 0;
let healthPollInFlight = false;
let crashGuard = createCrashGuard();

let activeCallbacks = {
  onStatus: null,
  onHealth: null,
  onError: null,
  onEngineMessage: null,
};

const runtime = {
  mode: null,
  endpoint: null,
  host: null,
  port: null,
  startedAt: null,
};

const state = {
  status: 'idle',
  health: null,
  lastError: null,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const notifyStatus = (status, reason) => {
  state.status = status;
  try {
    activeCallbacks.onStatus?.(status, reason);
  } catch {
    // A renderer-side listener must never break the supervisor.
  }
};

const notifyError = (error) => {
  state.lastError = error;
  try {
    activeCallbacks.onError?.(error);
  } catch {
    // Same rule.
  }
};

const notifyHealth = (health) => {
  state.health = health;
  try {
    activeCallbacks.onHealth?.(health);
  } catch {
    // Same rule.
  }
};

function stopHealthLoop() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  healthPollInFlight = false;
}

function startHealthLoop({ fetchHealth, token, startedAt }) {
  stopHealthLoop();
  healthFailures = 0;

  healthTimer = setInterval(async () => {
    if (stopRequested || healthPollInFlight) return;
    healthPollInFlight = true;
    try {
      const raw = await fetchHealth(token);
      const verdict = evaluateEngineApiVersion(raw?.apiVersion);
      if (!verdict.ok) {
        // The engine changed majors under us mid-run — stop talking to it.
        log.error(`Speech engine API changed incompatibly: ${verdict.reason}`);
        notifyError({ code: 'engine-api-incompatible', message: verdict.reason, fatal: true });
        teardown('internal');
        notifyStatus('error', 'incompatible-api');
        return;
      }
      healthFailures = 0;
      notifyHealth(
        buildHealthPayload(raw, { pid: engineProcess?.pid ?? null, startedAt, now: Date.now() })
      );
    } catch (error) {
      healthFailures += 1;
      if (healthFailures >= HEALTH_FAILURE_LIMIT) {
        log.error(`Speech engine failed ${healthFailures} health checks in a row; stopping it`);
        notifyError({
          code: 'engine-health-lost',
          message: `speech engine stopped answering health checks (${error.message})`,
          fatal: true,
        });
        teardown('internal');
        notifyStatus('error', 'health-lost');
      }
    } finally {
      healthPollInFlight = false;
    }
  }, HEALTH_POLL_INTERVAL_MS);
}

/**
 * Stop whatever is running. `intent`:
 *   'user'     — renderer asked (speech:stop / quit): status goes idle.
 *   'internal' — supervisor gave up (incompatible, unhealthy, timeout):
 *                the error status already reported stays put.
 */
function teardown(intent) {
  stopRequested = true;
  stopIntent = intent;
  stopHealthLoop();

  if (respawnTimer) {
    clearTimeout(respawnTimer);
    respawnTimer = null;
  }
  if (cancelEscalation) {
    cancelEscalation();
    cancelEscalation = null;
  }

  const child = engineProcess;
  engineProcess = null;
  if (!child) return false;

  try {
    if (process.platform === 'win32') {
      child.kill('SIGKILL');
    } else {
      child.kill('SIGTERM');
      cancelEscalation = scheduleKillEscalation(child);
    }
  } catch (error) {
    log.warn('Error signalling speech engine:', error?.message || error);
    try {
      if (child.exitCode === null) child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the speech engine, if — and ONLY if — the plan's gate allows it.
 *
 * Resolves with `{ ok: true, reason, health }` when healthy, or
 * `{ ok: false, reason, mode? }` when nothing may start (disabled, nothing
 * installed, non-loopback, incompatible API, crash-loop, timeout...).
 * It never throws for those cases: "not started" is a normal outcome.
 *
 * @param {Object} [options]
 * @param {boolean} [options.enabled] the user's speech.enabled switch
 * @param {string|null} [options.endpoint] explicit loopback engine endpoint
 * @param {string} [options.host] bind host (loopback enforced)
 * @param {number} [options.port]
 * @param {string[]} [options.engineRoots] candidate engine directories
 * @param {string|null} [options.engineToken] pre-shared token (endpoint mode)
 * @param {(status: string, reason?: string) => void} [options.onStatus]
 * @param {(health: object) => void} [options.onHealth]
 * @param {(error: object) => void} [options.onError]
 * @param {(message: object) => void} [options.onEngineMessage]
 * @returns {Promise<object>} start result
 */
export async function startSpeechEngine(options = {}) {
  const {
    enabled = false,
    endpoint: configuredEndpoint = null,
    host = DEFAULT_ENGINE_HOST,
    port = DEFAULT_ENGINE_PORT,
    engineRoots = [],
    engineToken = null,
    engineKind = 'fake',
    onStatus = null,
    onHealth = null,
    onError = null,
    onEngineMessage = null,
  } = options;

  activeCallbacks = { onStatus, onHealth, onError, onEngineMessage };

  if (engineProcess) {
    return { ok: true, reason: 'already-running', mode: runtime.mode, health: state.health };
  }

  const discovery = resolveEngineDiscovery({ configuredEndpoint, engineRoots });
  const decision = describeStartDecision({
    enabled,
    endpoint: discovery.endpoint,
    engineAvailable: discovery.mode === 'package',
  });

  if (!decision.start) {
    // Invariant 4: the default world. No fork, no socket, no poll.
    log.info(`Speech engine not started: ${decision.reason}`);
    return { ok: false, reason: decision.reason, mode: discovery.mode };
  }

  let bindHost;
  try {
    bindHost = resolveBindHost(host);
  } catch (error) {
    log.error(error.message);
    notifyError({ code: 'engine-non-loopback-host', message: error.message, fatal: true });
    return { ok: false, reason: 'non-loopback-host', mode: discovery.mode };
  }

  let token;
  try {
    token = typeof engineToken === 'string' && engineToken.length >= 16
      ? engineToken
      : generateEngineToken();
  } catch (error) {
    notifyError({ code: 'engine-token-failed', message: error.message, fatal: true });
    return { ok: false, reason: 'token-generation-failed', mode: discovery.mode };
  }

  crashGuard.reset();
  stopRequested = false;
  stopIntent = null;
  startupAborted = null;
  healthFailures = 0;
  state.lastError = null;
  phase = 'starting';

  const startedAt = Date.now();
  runtime.mode = discovery.mode;
  runtime.host = bindHost;
  runtime.port = port;
  runtime.startedAt = startedAt;
  runtime.endpoint =
    discovery.mode === 'endpoint'
      ? (/^[a-z][a-z0-9+.-]*:\/\//i.test(discovery.endpoint) ? discovery.endpoint : `http://${discovery.endpoint}`)
      : `http://${bindHost}:${port}`;

  notifyStatus('starting', decision.reason);

  const fetchHealth = async (activeToken) => {
    const response = await fetch(`${runtime.endpoint}${ENGINE_ROUTES.health.path}`, {
      method: 'GET',
      headers: { [TOKEN_HEADER]: activeToken },
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`engine rejected the launch token (HTTP ${response.status})`);
    }
    if (!response.ok) throw new Error(`health HTTP ${response.status}`);
    return response.json();
  };

  // --- (b) package mode: fork the co-located engine ------------------------
  if (discovery.mode === 'package') {
    const spawnEngine = () => {
      const child = fork(discovery.entry, [], {
        cwd: path.dirname(discovery.entry),
        env: {
          ...process.env,
          LD_SPEECH_TOKEN: token,
          LD_SPEECH_HOST: bindHost,
          LD_SPEECH_PORT: String(port),
          LD_SPEECH_ENGINE: engineKind,
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      engineProcess = child;

      child.on('message', (message) => {
        if (!message || typeof message !== 'object') return;
        if (message.status === 'ready' && Number.isFinite(message.port)) {
          runtime.endpoint = `http://${bindHost}:${message.port}`;
          return;
        }
        if (message.status === 'error') {
          if (message.error === 'EADDRINUSE') {
            log.error(`Speech engine port ${message.port} is already in use`);
            startupAborted = 'port-in-use';
          }
          return;
        }
        // Message-bus mirror from the engine: relay after schema validation.
        if (typeof message.t === 'string') {
          const verdict = validateMessage(message);
          if (!verdict.ok) {
            log.warn(`Dropping invalid engine message of type ${message.t}`);
            return;
          }
          try {
            activeCallbacks.onEngineMessage?.(message);
          } catch {
            // Listener errors never take down the engine channel.
          }
        }
      });

      child.on('error', (error) => {
        log.error('Speech engine process error:', error?.message || error);
        if (phase === 'starting') {
          startupAborted = 'spawn-error';
        } else {
          notifyError({ code: 'engine-process-error', message: error?.message || 'process error', fatal: false });
        }
      });

      child.on('exit', (code, signal) => {
        if (engineProcess === child) engineProcess = null;
        stopHealthLoop();

        if (stopRequested) return;

        const crash = crashGuard.recordCrash();

        if (phase === 'starting') {
          // A specific abort reason (e.g. port-in-use from the fork IPC
          // handshake) outranks the generic exit code.
          if (!startupAborted) {
            startupAborted = code === 0 ? 'engine-exited' : `engine-exited-code-${code}`;
          }
          return;
        }

        if (crash.tripped) {
          // ONE clear error instead of respawning forever (plan wording).
          const message =
            `speech engine crashed ${crash.crashes} times within ${CRASH_LOOP_WINDOW_MS}ms — ` +
            'automatic restarts are disabled until speech is started again';
          log.error(message);
          notifyError({ code: 'engine-crash-loop', message, fatal: true, crashes: crash.crashes });
          notifyStatus('error', 'crash-loop');
          return;
        }

        log.warn(`Speech engine exited (code ${code ?? 'n/a'}, signal ${signal ?? 'n/a'}); respawning`);
        notifyStatus('starting', 'respawning');
        respawnTimer = setTimeout(() => {
          respawnTimer = null;
          if (stopRequested || phase === 'stopping') return;
          spawnEngine();
          startHealthLoop({ fetchHealth, token, startedAt });
        }, RESPAWN_DELAY_MS);
      });

      return child;
    };

    spawnEngine();
  }

  // --- startup wait: poll until healthy (or abort/timeout) ------------------
  const deadline = Date.now() + HEALTH_STARTUP_TIMEOUT_MS;
  let lastFailure = 'no attempt yet';

  while (Date.now() < deadline) {
    if (stopRequested) return { ok: false, reason: 'stopped', mode: runtime.mode };
    if (startupAborted) {
      notifyError({
        code: 'engine-startup-failed',
        message: `speech engine exited during startup (${startupAborted})`,
        fatal: true,
      });
      notifyStatus('error', 'startup-failed');
      return { ok: false, reason: startupAborted, mode: runtime.mode };
    }

    try {
      const raw = await fetchHealth(token);
      const verdict = evaluateEngineApiVersion(raw?.apiVersion);

      if (!verdict.ok) {
        // Plan 7.5: refuse a mismatched MAJOR outright.
        log.error(`Speech engine API incompatible: ${verdict.reason}`);
        teardown('internal');
        notifyError({ code: 'engine-api-incompatible', message: verdict.reason, fatal: true });
        notifyStatus('error', 'incompatible-api');
        return { ok: false, reason: 'incompatible-api', mode: runtime.mode };
      }
      if (verdict.shouldWarn) log.warn(verdict.reason);

      phase = 'running';
      const health = buildHealthPayload(raw, { pid: engineProcess?.pid ?? null, startedAt });
      notifyHealth(health);
      startHealthLoop({ fetchHealth, token, startedAt });
      log.info(`Speech engine ready (${runtime.mode}) — api ${verdict.level}`);
      return {
        ok: true,
        reason: verdict.level === 'minor-mismatch' ? 'healthy-minor-mismatch' : 'healthy',
        mode: runtime.mode,
        health,
      };
    } catch (error) {
      lastFailure = error.message;
    }

    await sleep(400);
  }

  log.error(`Speech engine failed to become healthy within ${HEALTH_STARTUP_TIMEOUT_MS}ms (${lastFailure})`);
  teardown('internal');
  notifyError({
    code: 'engine-startup-timeout',
    message: `speech engine did not become healthy within ${HEALTH_STARTUP_TIMEOUT_MS}ms (${lastFailure})`,
    fatal: true,
  });
  notifyStatus('error', 'startup-timeout');
  return { ok: false, reason: 'startup-timeout', mode: runtime.mode };
}

/**
 * Stop the engine: SIGTERM first, SIGKILL escalated at
 * SPEECH_ENGINE_KILL_ESCALATION_MS (2000 ms). Safe to call when nothing is
 * running (a no-op) — quitting the app always calls this.
 *
 * @param {Object} [options]
 * @param {string} [options.reason] reported to onStatus
 * @returns {{ stopped: boolean }}
 */
export function stopSpeechEngine({ reason = 'stopped' } = {}) {
  phase = 'stopping';
  const hadProcess = teardown('user');
  if (!hadProcess) {
    if (state.status !== 'idle') notifyStatus('idle', reason);
    return { stopped: false };
  }
  notifyStatus('idle', reason);
  log.info('Speech engine stopped');
  return { stopped: true };
}

/**
 * Current supervisor state for speech:get-state. NEVER includes the token.
 *
 * @returns {{ status: string, health: object|null, lastError: object|null,
 *             mode: string|null, endpoint: string|null, pid: number|null,
 *             running: boolean }}
 */
export function getSpeechEngineSnapshot() {
  return {
    status: state.status,
    health: state.health,
    lastError: state.lastError,
    mode: runtime.mode,
    endpoint: runtime.endpoint,
    pid: engineProcess?.pid ?? null,
    running: Boolean(engineProcess),
  };
}
