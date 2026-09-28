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
 *   live  speech:start, speech:stop, speech:get-state, speech:install (the
 *         resumable model downloader in main/speechDownloader.js — progress
 *         streams on speech:progress and install state republishes on
 *         speech:install-state), speech:select-model (digest-verifies the
 *         installed file before it becomes the active model), and every
 *         event broadcast below whose source exists today (status, health,
 *         transcript relay, error, install-state).
 *   stub  speech:uninstall (Phase 6), speech:benchmark (Phase 3). The stubs
 *         return a real, documented shape — { ok:false, code:'not-
 *         implemented', ... } — with validated argument shapes so the
 *         follow-up phases fill in behaviour instead of inventing channels.
 *   queued speech:progress is emitted by the downloader now (and by the
 *         benchmark when Phase 3 lands).
 *
 * Hygiene (plan): never log or broadcast tokens, audio, sample values, or
 * transcript text. Engine messages are relayed whole (the renderer needs
 * the text) but logged by TYPE only. Download results are logged by CODE
 * with the catalog file name only — never absolute paths.
 */
import path from 'node:path';
import { app, ipcMain } from 'electron';
import {
  startSpeechEngine,
  stopSpeechEngine,
  getSpeechEngineSnapshot,
  describeStartDecision,
  resolveEngineDiscovery,
} from './speechEngine.js';
import { createModelInstallManager, resolveModelsDir } from './speechDownloader.js';
import { getModel } from '../shared/speech/index.js';
import createMainLogger from './logger.js';

const log = createMainLogger('SpeechIpc');

/** main -> renderer events. Six channels, each with exactly one purpose. */
export const SPEECH_EVENT_CHANNELS = Object.freeze([
  'speech:health', // engine health snapshot: apiVersion, model, backend, rtf, memoryMb, pid, uptime
  'speech:transcript', // relayed engine partial/final segments (the only channel carrying text)
  'speech:status', // supervisor lifecycle: { status: starting|idle|error, reason, at }
  'speech:error', // one clear engine error (crash loop, incompatible API, spawn failure, failed install)
  'speech:progress', // model download progress: { taskId, receivedBytes, totalBytes, mbps, modelId }
  'speech:install-state', // engine discovery + installed models + resumable partials
]);

/** renderer -> main invoke handles. Seven channels, two of them stubs. */
export const SPEECH_INVOKE_CHANNELS = Object.freeze([
  'speech:start', // LIVE: { enabled, modelId?, where? } -> { ok, started, reason, health, installState }
  'speech:stop', // LIVE: -> { ok, stopped }
  'speech:get-state', // LIVE: -> { status, health, lastError, running, mode, endpoint, pid, installState }
  'speech:install', // LIVE: { modelId } -> download result; { modelId, cancel:true } -> cancel
  'speech:uninstall', // STUB: -> { ok:false, code:'not-implemented' } (Phase 6 fills it in)
  'speech:select-model', // LIVE: { modelId } -> digest-verified selection
  'speech:benchmark', // STUB: { modelId? } -> not-implemented (Phase 3)
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
 * @param {string|null} [options.modelsDir] model directory; defaults to
 *   `<userData>/speech-engine/models` — the documented offline drop-in
 *   directory. The repo's `speech-engine/` is NEVER written to.
 * @returns {{ start: Function, stop: Function, getState: Function,
 *             getInstallState: Function, publishInstallState: Function,
 *             publishProgress: Function }}
 */
export function registerSpeechIpc({
  getMainWindow,
  engineRoots = [],
  endpoint = null,
  engineToken = null,
  modelsDir = null,
} = {}) {
  if (registered) return registered;

  // Discovery is a filesystem look-up only: no fork, no socket, no poll.
  // It runs once so speech:get-state can answer "is an engine installed?"
  // before the user has ever toggled anything.
  const discovery = resolveEngineDiscovery({ configuredEndpoint: endpoint, engineRoots });
  const engineInstallState = Object.freeze({
    available: discovery.mode !== 'none',
    mode: discovery.mode,
    endpoint: discovery.endpoint,
    entry: discovery.entry,
    reason: discovery.reason,
  });

  const activeModelsDir =
    typeof modelsDir === 'string' && modelsDir ? modelsDir : resolveModelsDir(app.getPath('userData'));

  const broadcast = (channel, payload) => {
    try {
      const win = getMainWindow?.();
      if (!win || win.isDestroyed()) return;
      win.webContents.send(channel, payload);
    } catch {
      // Renderer may be mid-navigation; dropping an event is always safe.
    }
  };

  /**
   * The full install-state payload: engine discovery (frozen above) plus a
   * fresh filesystem snapshot of installed models and resumable `.part`
   * files. Built on every publish so a completed or failed download shows
   * up without a restart.
   */
  const buildInstallState = () => {
    let snapshot = { modelsDir: activeModelsDir, installed: [], partials: [], activeDownloads: [] };
    try {
      snapshot = installer.snapshot();
    } catch {
      // Unreadable models directory reads as "nothing installed".
    }
    return { ...engineInstallState, ...snapshot };
  };

  const publishInstallState = () => broadcast('speech:install-state', buildInstallState());
  const publishProgress = (payload) => broadcast('speech:progress', payload);

  // The downloader: one task per model, progress on speech:progress,
  // install state republished whenever a task settles, failures surfaced
  // as one clear speech:error sentence. Nothing runs until speech:install.
  const installer = createModelInstallManager({
    modelsDir: activeModelsDir,
    onProgress: (payload) => publishProgress(payload),
    onStateChange: () => publishInstallState(),
    onError: (error) => broadcast('speech:error', error),
  });

  const snapshot = () => ({
    ...getSpeechEngineSnapshot(),
    installState: buildInstallState(),
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
      engineAvailable: engineInstallState.available,
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
        mode: engineInstallState.mode,
        installState: buildInstallState(),
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
      mode: result.mode ?? engineInstallState.mode,
      health: result.health ?? null,
      installState: buildInstallState(),
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

  // LIVE — the resumable, verified model downloader.
  // in:  { modelId: string }            -> start (or JOIN) the download
  //      { modelId: string, cancel:true } -> cancel it, partial removed
  // out: { ok:true, modelId, bytes, sha256, digestSource, alreadyPresent?, ... }
  //      { ok:false, code, message, bytesReclaimed? } — codes are documented
  //      in main/speechDownloader.js; every failure message names the
  //      offline drop-in directory.
  ipcMain.handle('speech:install', async (_event, payload) => {
    if (payload && typeof payload === 'object' && payload.cancel === true) {
      if (typeof payload.modelId !== 'string' || !payload.modelId) {
        return invalidArgument('modelId');
      }
      const cancelled = await installer.cancel(payload.modelId);
      publishInstallState();
      if (cancelled.ok) {
        log.info(`Model download cancelled (reclaimed ${cancelled.bytesReclaimed} bytes)`);
      }
      return cancelled;
    }

    if (typeof payload?.modelId !== 'string' || !payload.modelId) {
      return invalidArgument('modelId');
    }
    const model = getModel(payload.modelId);
    if (!model) {
      return {
        ok: false,
        code: 'unknown-model',
        field: 'modelId',
        message: `${payload.modelId} is not in the model catalog.`,
      };
    }

    // Kick off (or join) the task, then publish immediately so the renderer
    // sees `activeDownloads` flip without waiting for the first byte, and
    // again when it settles.
    const pending = installer.install(model);
    publishInstallState();
    const result = await pending;
    publishInstallState();
    // Log the code and the catalog file name only — never absolute paths.
    log.info(`Model install ${result.ok ? 'ok' : `failed: ${result.code}`} (${model.fileName})`);
    return result;
  });

  // STUB — Phase 6 (invariant 6's it.todo) fills in the erase + reclaim.
  // out (later):  { ok:true, bytesReclaimed, removed: [...] }
  ipcMain.handle('speech:uninstall', () => notImplemented('uninstall', 'Phase 6 one-click erase'));

  // LIVE — verifies the installed file (catalog digest, or the sha256 pinned
  // on first fetch) before a model may become the active one. A drop-in
  // file gets pinned here, on first use, with no network call.
  // in:  { modelId: string }
  // out: { ok:true, modelId, bytes, sha256, digestSource, verified:true }
  //      { ok:false, code:'model-not-installed'|'digest-mismatch'|..., message }
  ipcMain.handle('speech:select-model', async (_event, payload) => {
    if (typeof payload?.modelId !== 'string' || !payload.modelId) {
      return invalidArgument('modelId');
    }
    const model = getModel(payload.modelId);
    if (!model) {
      return {
        ok: false,
        code: 'unknown-model',
        field: 'modelId',
        message: `${payload.modelId} is not in the model catalog.`,
      };
    }
    const verdict = await installer.verify(model);
    publishInstallState(); // a first-use pin may have been recorded just now
    if (!verdict.ok) {
      log.info(`Model verify failed: ${verdict.code} (${model.fileName})`);
    }
    return verdict;
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
    getInstallState: () => buildInstallState(),
    publishInstallState,
    publishProgress,
  });

  log.info(
    `Speech IPC registered (engine discovery: ${engineInstallState.mode}${engineInstallState.available ? '' : ', nothing installed'})`
  );
  return registered;
}
