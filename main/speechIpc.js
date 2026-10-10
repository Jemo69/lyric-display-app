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
 *   stub  speech:uninstall (Phase 6). speech:benchmark went live in Phase 3. The stub
 *         return a real, documented shape — { ok:false, code:'not-
 *         implemented', ... } — with validated argument shapes so the
 *         follow-up phases fill in behaviour instead of inventing channels.
 *   queued speech:progress is emitted by the downloader now (and by the
 *         benchmark when Phase 3 lands).
 *
 * HISTORY (Decision D9, Phase 4): the six speech:history:* invokes below
 * are the transcript-history surface — list/get/search/export/erase for the
 * renderer. The WRITE path is the supervisor itself: every speech:start
 * forwards the shared history store (see `start` below), so the
 * supervisor's session recorder (main/speechEngine.js) writes the same
 * directory these handlers read; `append` keeps the path reachable and
 * testable directly.
 * Every history reply is built by main/speechHistory.js, whose summaries
 * carry NO segment text except where the renderer asked for it (get,
 * search excerpts).
 *
 * Hygiene (plan): never log or broadcast tokens, audio, sample values, or
 * transcript text. Engine messages are relayed whole (the renderer needs
 * the text) but logged by TYPE only. Download results are logged by CODE
 * with the catalog file name only — never absolute paths. History
 * operations are logged by COUNT, session id, and BYTE total only.
 */
import path from 'node:path';
import { app, ipcMain } from 'electron';
import {
  startSpeechEngine,
  stopSpeechEngine,
  getSpeechEngineSnapshot,
  describeStartDecision,
  resolveEngineDiscovery,
  runEngineBenchmark,
  cancelEngineBenchmark,
} from './speechEngine.js';
import { createModelInstallManager, resolveModelsDir } from './speechDownloader.js';
import { createSpeechHistoryStore, resolveHistoryDir } from './speechHistory.js';
import { getModel, generateEngineToken } from '../shared/speech/index.js';
import createMainLogger from './logger.js';

const log = createMainLogger('SpeechIpc');

/**
 * The renderer's WebSocket stream path (plan section 3).
 * The engine declares the same constant (speech-engine/
 * wsTransport.js, WS_PATH) and reports it on its fork-IPC
 * ready message; main relays it here so the renderer and
 * the engine agree on ONE path without the renderer importing
 * the engine package (which is Node-only).
 */
export const SPEECH_ENGINE_WS_PATH = '/v1/stream';

/** main -> renderer events. Six channels, each with exactly one purpose. */
export const SPEECH_EVENT_CHANNELS = Object.freeze([
  'speech:health', // engine health snapshot: apiVersion, model, backend, rtf, memoryMb, pid, uptime
  'speech:transcript', // relayed engine partial/final segments (the only channel carrying text)
  'speech:status', // supervisor lifecycle: { status: starting|idle|error, reason, at }
  'speech:error', // one clear engine error (crash loop, incompatible API, spawn failure, failed install)
  'speech:progress', // model download progress: { taskId, receivedBytes, totalBytes, mbps, modelId }
  'speech:install-state', // engine discovery + installed models + resumable partials
]);

/** renderer -> main invoke handles. Thirteen channels, two of them stubs. */
export const SPEECH_INVOKE_CHANNELS = Object.freeze([
  'speech:start', // LIVE: { enabled, modelId?, providerId?, where? } -> { ok, started, reason, health, installState, engine }
  'speech:stop', // LIVE: -> { ok, stopped }
  'speech:get-state', // LIVE: -> { status, health, lastError, running, mode, endpoint, pid, installState }
  'speech:install', // LIVE: { modelId } -> download result; { modelId, cancel:true } -> cancel
  'speech:uninstall', // STUB: -> { ok:false, code:'not-implemented' } (Phase 6 fills it in)
  'speech:select-model', // LIVE: { modelId } -> digest-verified selection
  'speech:benchmark', // LIVE: { modelId, clip? } -> engine result row; { modelId, cancel:true } -> stop
  // Decision D9 / Phase 4 — transcript history (summaries only except
  // get/search, which the renderer explicitly asked to see text from).
  'speech:history:list', // LIVE: -> { ok, sessions: summaries (no text), status }
  'speech:history:get', // LIVE: { sessionId } -> { ok, session: one record WITH segments }
  'speech:history:search', // LIVE: { query } -> { ok, matches: summaries + segment excerpts }
  'speech:history:export', // LIVE: { format:'json'|'text', sessionId? } -> { ok, path, bytes }
  'speech:history:erase', // LIVE: -> { ok, bytesReclaimed, sessionsRemoved, exportsRemoved }
  'speech:history:append', // LIVE: { op:'begin'|'segment'|'end', ... } -> the history write path
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
 * @param {string|null} [options.historyDir] transcript-history directory;
 *   defaults to `<userData>/speech-engine/history` (Decision D9 — history
 *   on by default, stored under userData). The repo's `speech-engine/` is
 *   NEVER written to here either.
 * @returns {{ start: Function, stop: Function, getState: Function,
 *             getInstallState: Function, publishInstallState: Function,
 *             publishProgress: Function, history: Object }}
 */
export function registerSpeechIpc({
  getMainWindow,
  engineRoots = [],
  endpoint = null,
  engineToken = null,
  modelsDir = null,
  historyDir = null,
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

  // Transcript history (Decision D9): stored under userData, capped, and
  // cold — createSpeechHistoryStore performs no I/O until the first call.
  const activeHistoryDir =
    typeof historyDir === 'string' && historyDir ? historyDir : resolveHistoryDir(app.getPath('userData'));
  const history = createSpeechHistoryStore({ historyDir: activeHistoryDir });

  // The launch token (plan 7.1): ONE per-launch secret that
  // gates REST (x-ld-speech-token), the WebSocket upgrade
  // (?token=), and the renderer's dial-in URL. In endpoint
  // mode the pre-shared token from the environment wins;
  // otherwise main mints one and hands it to the forked
  // engine through startSpeechEngine's engineToken option, so
  // the SAME secret is in play everywhere. It is never
  // logged, and it leaves the app only over the loopback
  // engine socket.
  let launchToken =
    typeof engineToken === 'string' && engineToken.length >= 16 ? engineToken : null;
  const resolveLaunchToken = () => {
    if (launchToken === null) {
      launchToken = generateEngineToken();
    }
    return launchToken;
  };

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

  /** A non-empty string payload field, or null (history attribution). */
  const stringField = (value) =>
    typeof value === 'string' && value.trim() ? value : null;

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
        engine: null,
      };
    }

    // Transcript history (Decision D9) and the session boundary
    // metadata ride the SAME start call: the shared `history`
    // store instance (so the supervisor and the speech:history:*
    // handlers use ONE directory) plus the model context the
    // renderer sends with the start.
    const result = await startSpeechEngine({
      enabled,
      endpoint,
      engineRoots,
      engineToken: resolveLaunchToken(),
      historyDir: activeHistoryDir,
      historyStore: history,
      modelId: stringField(payload?.modelId),
      providerId: stringField(payload?.providerId),
      where: stringField(payload?.where),
      ...callbacks,
    });

    return {
      ok: result.ok === true,
      started: result.ok === true,
      reason: result.reason,
      mode: result.mode ?? engineInstallState.mode,
      health: result.health ?? null,
      installState: buildInstallState(),
      // The renderer's dial-in (plan section 3): everything
      // the raw WebSocket transport needs to open the PCM
      // stream itself — present only when the engine actually
      // started. The token never leaves the app except over
      // the loopback engine socket and is never logged.
      engine:
        result.ok === true
          ? {
              endpoint: getSpeechEngineSnapshot().endpoint,
              token: resolveLaunchToken(),
              path: SPEECH_ENGINE_WS_PATH,
            }
          : null,
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

  // LIVE — Phase 3 benchmark. Forwards to the engine's POST /v1/benchmark.
  //
  // in:  { modelId, clip?, cancel? }
  //      clip  — { pcm: Buffer, transcript: string, sampleRate? }. Electron's
  //               structured clone carries a Buffer/ArrayBuffer across IPC, so
  //               the reference clip does not have to be re-encoded here.
  //      cancel — true means "stop the run that is already going", not "start
  //               a run that immediately stops".
  // out: { ok:true, measured, modelId, engineKind, reason, wer, werDetail, rtf,
  //        firstPartialMs, backend, loadTimeMs, gpuUtilMean, gpuUtilPeak,
  //        peakRssBytes, firstThirdRtf, lastThirdRtf }
  //      { ok:false, code, message }
  //
  // `measured:false` is a SUCCESS here, not a failure: it means the harness
  // ran and correctly declined to invent numbers. It is forwarded verbatim so
  // the panel can say why.
  ipcMain.handle('speech:benchmark', async (_event, payload) => {
    if (payload !== undefined && payload !== null && typeof payload !== 'object') {
      return invalidArgument('payload');
    }

    if (payload?.cancel === true) {
      const modelId = typeof payload.modelId === 'string' ? payload.modelId : null;
      if (!modelId) return invalidArgument('modelId');
      const stopped = await cancelEngineBenchmark(modelId);
      log.info(`Benchmark cancel requested (${modelId}): ${stopped ? 'stopped' : 'nothing running'}`);
      // Report honestly rather than claiming a stop that did not happen.
      return { ok: true, cancelled: true, stopped, modelId };
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

    try {
      const outcome = await runEngineBenchmark({
        modelId: payload.modelId,
        clip: payload.clip ?? null,
      });
      return { ok: true, ...outcome };
    } catch (error) {
      // A code only: a message could carry a filesystem path or clip content.
      log.warn(`Benchmark failed: ${error?.code ?? error?.name ?? 'Error'}`);
      return {
        ok: false,
        code: 'benchmark-failed',
        modelId: payload.modelId,
        message: 'The benchmark could not be run. See the engine log for the error code.',
      };
    }
  });

  // --- transcript history (Decision D9 / Phase 4) ---------------------------
  // Argument shapes are documented on SPEECH_INVOKE_CHANNELS above. Every
  // handler validates BEFORE touching disk. Replies carry ids, counts, and
  // bytes — except get/search, whose whole purpose is the text the renderer
  // explicitly asked to read. Hygiene: nothing logged here includes payload
  // text; failures log an error CODE only.

  const historyFailure = (error) => {
    log.warn(`Transcript history operation failed: ${error?.code ?? error?.name ?? 'Error'}`);
    return {
      ok: false,
      code: 'history-error',
      message: error?.message ?? 'Transcript history is unavailable right now.',
    };
  };

  // Summaries only — no segment text crosses the list boundary.
  ipcMain.handle('speech:history:list', async () => {
    try {
      const [sessions, status] = await Promise.all([history.listSessions(), history.getStatus()]);
      return { ok: true, sessions, status };
    } catch (error) {
      return historyFailure(error);
    }
  });

  // in: { sessionId } -> one record WITH its segments (the only full read).
  ipcMain.handle('speech:history:get', async (_event, payload) => {
    if (typeof payload?.sessionId !== 'string' || !payload.sessionId) {
      return invalidArgument('sessionId');
    }
    try {
      return await history.getSession(payload.sessionId);
    } catch (error) {
      return historyFailure(error);
    }
  });

  // in: { query } -> matching summaries + segment excerpts (bounded).
  ipcMain.handle('speech:history:search', async (_event, payload) => {
    if (typeof payload?.query !== 'string') return invalidArgument('query');
    try {
      return await history.searchHistory(payload.query);
    } catch (error) {
      return historyFailure(error);
    }
  });

  // in: { format?: 'json'|'text', sessionId?: string }
  // out: { ok, path, bytes, format, sessionCount } | { ok:false, code }
  ipcMain.handle('speech:history:export', async (_event, payload) => {
    if (payload !== undefined && payload !== null && typeof payload !== 'object') {
      return invalidArgument('payload');
    }
    if (payload?.format !== undefined && payload.format !== 'json' && payload.format !== 'text') {
      return {
        ok: false,
        code: 'invalid-argument',
        field: 'format',
        message: "format must be 'json' or 'text'",
      };
    }
    try {
      return await history.exportHistory({
        format: payload?.format ?? 'json',
        sessionId: payload?.sessionId ?? null,
      });
    } catch (error) {
      return historyFailure(error);
    }
  });

  // Phase 0 invariant 6's transcript slice: erase everything, report bytes.
  ipcMain.handle('speech:history:erase', async () => {
    try {
      return await history.eraseAll();
    } catch (error) {
      return historyFailure(error);
    }
  });

  // The write path: { op:'begin'|'segment'|'end', ... }. The
  // supervisor is the real writer (every speech:start forwards
  // the shared store — see `start` above); this channel keeps
  // the path reachable and testable so history is never left
  // unwritable.
  ipcMain.handle('speech:history:append', async (_event, payload) => {
    if (payload === null || typeof payload !== 'object') return invalidArgument('op');
    const { op } = payload;
    if (op === 'begin') {
      if (payload.session !== undefined && (payload.session === null || typeof payload.session !== 'object')) {
        return invalidArgument('session');
      }
      try {
        return await history.beginSession(payload.session ?? {});
      } catch (error) {
        return historyFailure(error);
      }
    }
    if (op === 'segment') {
      if (typeof payload.sessionId !== 'string' || !payload.sessionId) {
        return invalidArgument('sessionId');
      }
      if (payload.segment === null || typeof payload.segment !== 'object') {
        return invalidArgument('segment');
      }
      try {
        return await history.appendSegment(payload.sessionId, payload.segment);
      } catch (error) {
        return historyFailure(error);
      }
    }
    if (op === 'end') {
      if (typeof payload.sessionId !== 'string' || !payload.sessionId) {
        return invalidArgument('sessionId');
      }
      try {
        return await history.endSession(payload.sessionId, payload.patch ?? {});
      } catch (error) {
        return historyFailure(error);
      }
    }
    return {
      ok: false,
      code: 'invalid-argument',
      field: 'op',
      message: 'op must be one of begin, segment, or end',
    };
  });

  registered = Object.freeze({
    start,
    stop,
    getState,
    getInstallState: () => buildInstallState(),
    publishInstallState,
    publishProgress,
    history,
  });

  log.info(
    `Speech IPC registered (engine discovery: ${engineInstallState.mode}${engineInstallState.available ? '' : ', nothing installed'})`
  );
  return registered;
}
