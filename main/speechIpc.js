/**
 * main/speechIpc.js — Live Sermon Assist Phase 2: the renderer-facing IPC
 * surface for Sermon Assist.
 *
 * Mirrors the structure and idioms of preload.js (namespaced object, plain
 * channel strings) and keeps every Electron touchpoint in one file so
 * main/speechEngine.js stays electron-free and unit-testable.
 *
 * The channel inventory below IS the contract with the renderer; it is
 * pinned deliberately by tests/speech/invariants.test.js (invariant 4), so
 * adding or renaming a channel is a visible, reviewed diff in BOTH files.
 *
 * LIVE vs STUB (Phase 2):
 *   live  speech:start, speech:stop, speech:get-state, and every event
 *         broadcast below whose source exists today (status, health,
 *         transcript relay, error, install-state).
 *   stub  speech:install (downloader follow-up), speech:uninstall
 *         (Phase 6), speech:select-model (session wiring follow-up),
 *         speech:benchmark (Phase 3). The stubs return a real,
 *         documented shape — { ok:false, code:'not-implemented', ... } —
 *         with validated argument shapes so the follow-up phases fill in
 *         behaviour instead of inventing channels.
 *   queued speech:progress exists and is broadcastable, but nothing emits
 *         it until the downloader/benchmark land.
 *
 * Hygiene (plan): never log or broadcast tokens, audio, sample values, or
 * transcript text. Engine messages are relayed whole (the renderer needs
 * the text) but logged by TYPE only.
 */
import { ipcMain } from 'electron';
import {
  startSpeechEngine,
  stopSpeechEngine,
  getSpeechEngineSnapshot,
  describeStartDecision,
  resolveEngineDiscovery,
} from './speechEngine.js';
import createMainLogger from './logger.js';

const log = createMainLogger('SpeechIpc');

/** main -> renderer events. Six channels, each with exactly one purpose. */
export const SPEECH_EVENT_CHANNELS = Object.freeze([
  'speech:health', // engine health snapshot: apiVersion, model, backend, rtf, memoryMb, pid, uptime
  'speech:transcript', // relayed engine partial/final segments (the only channel carrying text)
  'speech:status', // supervisor lifecycle: { status: starting|idle|error, reason, at }
  'speech:error', // one clear engine error (crash loop, incompatible API, spawn failure)
  'speech:progress', // model download / benchmark progress (emitted from the downloader follow-up)
  'speech:install-state', // engine discovery/install state: { available, mode, endpoint, reason }
]);

/** renderer -> main invoke handles. Seven channels, four of them stubs. */
export const SPEECH_INVOKE_CHANNELS = Object.freeze([
  'speech:start', // LIVE: { enabled, modelId?, where? } -> { ok, started, reason, health, installState }
  'speech:stop', // LIVE: -> { ok, stopped }
  'speech:get-state', // LIVE: -> { status, health, lastError, running, mode, endpoint, pid, installState }
  'speech:install', // STUB: { modelId } -> { ok:false, code:'not-implemented', feature, phase, message }
  'speech:uninstall', // STUB: -> same shape (Phase 6 fills it in)
  'speech:select-model', // STUB: { modelId } -> same shape (session follow-up)
  'speech:benchmark', // STUB: { modelId? } -> same shape (Phase 3)
]);

/**
 * Engine message type -> IPC channel. `ready`, `vad`, and `stats` are not
 * relayed in Phase 2: readiness reaches the renderer through
 * speech:status/speech:health (and later the direct WS transport carries
 * every type). Everything that IS relayed was validated by the supervisor.
 */
const ENGINE_MESSAGE_CHANNELS = Object.freeze({
  partial: 'speech:transcript',
  final: 'speech:transcript',
  progress: 'speech:progress',
  error: 'speech:error',
});

const notImplemented = (feature, phase) => ({
  ok: false,
  code: 'not-implemented',
  feature,
  phase,
  message: `${feature} is not implemented yet — ${phase}.`,
});

const invalidArgument = (field) => ({
  ok: false,
  code: 'invalid-argument',
  field,
  message: `${field} must be a non-empty string`,
});

let registered = null;

/**
 * Register every speech: IPC channel. Call once, before any window loads.
 *
 * @param {Object} options
 * @param {() => import('electron').BrowserWindow|null} options.getMainWindow
 * @param {string[]} [options.engineRoots] candidate engine directories
 *   (dev checkout and the Phase 3 install directory).
 * @param {string|null} [options.endpoint] explicit loopback engine endpoint.
 * @param {string|null} [options.engineToken] pre-shared token for endpoint mode.
 * @returns {{ start: Function, stop: Function, getState: Function,
 *             getInstallState: Function, publishInstallState: Function,
 *             publishProgress: Function }}
 */
export function registerSpeechIpc({
  getMainWindow,
  engineRoots = [],
  endpoint = null,
  engineToken = null,
} = {}) {
  if (registered) return registered;

  // Discovery is a filesystem look-up only: no fork, no socket, no poll.
  // It runs once so speech:get-state can answer "is an engine installed?"
  // before the user has ever toggled anything.
  const discovery = resolveEngineDiscovery({ configuredEndpoint: endpoint, engineRoots });
  const installState = Object.freeze({
    available: discovery.mode !== 'none',
    mode: discovery.mode,
    endpoint: discovery.endpoint,
    entry: discovery.entry,
    reason: discovery.reason,
  });

  const broadcast = (channel, payload) => {
    try {
      const win = getMainWindow?.();
      if (!win || win.isDestroyed()) return;
      win.webContents.send(channel, payload);
    } catch {
      // Renderer may be mid-navigation; dropping an event is always safe.
    }
  };

  const publishInstallState = () => broadcast('speech:install-state', installState);
  const publishProgress = (payload) => broadcast('speech:progress', payload);

  const snapshot = () => ({
    ...getSpeechEngineSnapshot(),
    installState,
  });

  const callbacks = {
    onStatus: (status, reason) => broadcast('speech:status', { status, reason, at: Date.now() }),
    onHealth: (health) => broadcast('speech:health', health),
    onError: (error) => broadcast('speech:error', error),
    onEngineMessage: (message) => {
      const channel = ENGINE_MESSAGE_CHANNELS[message.t];
      if (!channel) {
        log.debug(`Speech engine message not relayed in Phase 2: ${message.t}`);
        return;
      }
      // Log the type only — never the transcript text.
      broadcast(channel, message);
    },
  };

  /** The one start path: renderer invoke AND app boot both land here. */
  const start = async (payload) => {
    const enabled = payload?.enabled === true;
    const decision = describeStartDecision({
      enabled,
      endpoint,
      engineAvailable: installState.available,
    });

    // The renderer needs the current install state either way — this is the
    // event that tells a settings panel WHY nothing started.
    publishInstallState();

    if (!decision.start) {
      log.info(`Speech engine not started: ${decision.reason}`);
      return {
        ok: false,
        started: false,
        reason: decision.reason,
        mode: installState.mode,
        installState,
      };
    }

    const result = await startSpeechEngine({
      enabled,
      endpoint,
      engineRoots,
      engineToken,
      ...callbacks,
    });

    return {
      ok: result.ok === true,
      started: result.ok === true,
      reason: result.reason,
      mode: result.mode ?? installState.mode,
      health: result.health ?? null,
      installState,
    };
  };

  const stop = (reason = 'renderer-request') => {
    const { stopped } = stopSpeechEngine({ reason });
    return { ok: true, stopped, ...snapshot() };
  };

  const getState = () => ({ ok: true, ...snapshot() });

  // --- invoke handles ------------------------------------------------------

  ipcMain.handle('speech:start', (_event, payload) => start(payload));

  ipcMain.handle('speech:stop', () => stop());

  ipcMain.handle('speech:get-state', () => getState());

  // STUB — argument shape is already real; the downloader fills in the rest.
  // in:  { modelId: string }
  // out (now):    { ok:false, code:'not-implemented', feature, phase, message }
  // out (later):  { ok:true, modelId, downloadBytes, ... }
  ipcMain.handle('speech:install', (_event, payload) => {
    if (typeof payload?.modelId !== 'string' || !payload.modelId) {
      return invalidArgument('modelId');
    }
    return notImplemented('install', 'the model downloader follow-up');
  });

  // STUB — Phase 6 (invariant 6's it.todo) fills in the erase + reclaim.
  // out (later):  { ok:true, bytesReclaimed, removed: [...] }
  ipcMain.handle('speech:uninstall', () => notImplemented('uninstall', 'Phase 6 one-click erase'));

  // STUB — session wiring follow-up.
  // in:  { modelId: string }
  // out (later):  { ok:true, modelId, sessionId }
  ipcMain.handle('speech:select-model', (_event, payload) => {
    if (typeof payload?.modelId !== 'string' || !payload.modelId) {
      return invalidArgument('modelId');
    }
    return notImplemented('select-model', 'the engine session follow-up');
  });

  // STUB — Phase 3 benchmark.
  // in:  { modelId?: string }
  // out (later):  { ok:true, results: { rtf, loadMs, ... } }
  ipcMain.handle('speech:benchmark', (_event, payload) => {
    if (payload !== undefined && payload !== null && typeof payload !== 'object') {
      return invalidArgument('payload');
    }
    return notImplemented('benchmark', 'Phase 3 benchmark');
  });

  registered = Object.freeze({
    start,
    stop,
    getState,
    getInstallState: () => installState,
    publishInstallState,
    publishProgress,
  });

  log.info(
    `Speech IPC registered (engine discovery: ${installState.mode}${installState.available ? '' : ', nothing installed'})`
  );
  return registered;
}
