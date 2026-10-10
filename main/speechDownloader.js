/**
 * main/speechDownloader.js — Live Sermon Assist, Phase 2: the model
 * downloader. Resumable (`Range` continuation), verified (catalog digest or
 * pinned-on-first-fetch sha256), self-cleaning (a failed or cancelled
 * download never leaves bytes behind), and offline-first (a pre-placed file
 * in the models directory is discovered with zero network I/O).
 *
 * PURE-CORE RULE (same as main/permissionPolicy.js and main/speechEngine.js):
 * this module imports NOTHING from `electron`. Paths, the catalog, and the
 * fetch implementation are all injected, so every decision function below is
 * unit-testable under vitest against a local `node:http` server on
 * 127.0.0.1 — the only host this feature ever talks to in tests, and the
 * downloader itself is a plain HTTP CLIENT (it never binds a socket at all).
 *
 * ---------------------------------------------------------------------------
 * DIGEST POLICY (implements shared/speech/models.catalog.json `digestNote`)
 * ---------------------------------------------------------------------------
 * The catalog's own note is the spec: "sha1/sha256 of null means digest not
 * yet pinned — record sha256 on first fetch and verify against it
 * thereafter. sha256 values that are present ... are real, not synthesised;
 * sha1 is null everywhere."
 *
 *   1. catalog `sha256` present    -> verify against it (mismatch fails the
 *                                    download, the partial is deleted)
 *   2. else catalog `sha1`        -> verify against it (same failure rule).
 *                                    Weakest link, hence LAST: a row that ever
 *                                    gains a `sha1` must not downgrade a
 *                                    sha256 the catalog already pinned.
 *   3. else BOTH null ("pin on first fetch") -> compute sha256 of the
 *      completed file, RECORD it in the local manifest, and verify against
 *      that recorded value on every subsequent use (install, select-model,
 *      drop-in discovery).
 *
 * A null digest NEVER means "skip verification" and NEVER means "invent a
 * digest": the first verified fetch becomes the pin. Nothing here ever
 * writes to the catalog itself (`digestsPinned` stays false until a later
 * phase backfills rows deliberately).
 *
 * ---------------------------------------------------------------------------
 * .part LIFECYCLE (the failure taxonomy — who keeps bytes, who reclaims them)
 * ---------------------------------------------------------------------------
 *   interrupted  the transport died MID-BODY (server closed early, cable
 *                pulled, app killed mid-write). The `.part` file is KEPT —
 *                this is the resume path: the next install sends
 *                `Range: bytes=<n>-` and continues.
 *   cancelled    the user cancelled -> `.part` DELETED, bytesReclaimed
 *                reported.
 *   digest-      a verified failure -> `.part` DELETED, bytesReclaimed
 *   mismatch     reported. An already-installed file that fails verification
 *                is reported but NOT auto-deleted (it may be a drop-in the
 *                user placed; deleting user files is theirs to do).
 *   http-error / the server or network refused the transfer -> terminal
 *   network-     failure: `.part` DELETED, bytesReclaimed reported, and the
 *   unreachable  error message names the offline drop-in directory.
 *
 * Atomicity: bytes stream into `<file>.part` and are renamed onto the final
 * name only after digest verification, so a crash can never leave a
 * truncated file that looks installed.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { saveTextFileAtomically } from './atomicFileSave.js';
import { SPEECH_MODELS } from '../shared/speech/index.js';

// ---------------------------------------------------------------------------
// Named constants (unit-tested — see tests/speech/speechDownloader.test.js)
// ---------------------------------------------------------------------------

/** Runtime models directory, relative to `app.getPath('userData')`. */
export const MODELS_DIR_SEGMENTS = Object.freeze(['speech-engine', 'models']);

/** Local manifest recording pinned digests (never the catalog itself). */
export const MANIFEST_FILE_NAME = 'models-manifest.json';

/** Downloads stream into `<name>.part` and are renamed on success. */
export const PART_SUFFIX = '.part';

export const MANIFEST_SCHEMA = 1;

/** Minimum wall-clock gap between progress events (tests may pass 0). */
export const PROGRESS_MIN_INTERVAL_MS = 150;

/** `speech:progress` task id prefix — `download:<modelId>`. */
export const TASK_ID_PREFIX = 'download:';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** `<userData>/speech-engine/models` — the documented drop-in directory. */
export function resolveModelsDir(userDataDir) {
  if (typeof userDataDir !== 'string' || !userDataDir.trim()) {
    throw new Error('resolveModelsDir: a userData directory is required');
  }
  return path.join(userDataDir, ...MODELS_DIR_SEGMENTS);
}

/** The progress task id for one model's download. */
export function taskIdFor(modelId) {
  return `${TASK_ID_PREFIX}${modelId}`;
}

/**
 * Final / partial paths for one catalog file. `fileName` must be a plain
 * file name — a catalog row can never climb out of the models directory.
 */
export function modelPaths(modelsDir, fileName) {
  const base = typeof fileName === 'string' ? path.basename(fileName) : '';
  if (!base || base === '.' || base === '..' || base !== fileName) {
    throw new Error('modelPaths: fileName must be a plain file name');
  }
  const finalPath = path.join(modelsDir, base);
  return { fileName: base, finalPath, partPath: `${finalPath}${PART_SUFFIX}` };
}

// ---------------------------------------------------------------------------
// Pure decision helpers (the unit-testable core)
// ---------------------------------------------------------------------------

/**
 * Which digest (if any) a model must verify against — the policy in the
 * module header, as one function.
 *
 * @param {object} model catalog row ({ sha1, sha256 })
 * @param {object|null} recorded manifest entry for this model (may hold a
 *   sha256 pinned on a previous fetch)
 * @returns {{ algorithm: 'sha1'|'sha256', expected: string|null,
 *             source: 'catalog-sha1'|'catalog-sha256'|'recorded-sha256'|
 *                     'pin-on-first-fetch' }}
 */
export function resolveDigestPolicy(model = {}, recorded = null) {
  // Strongest algorithm first. SHA-1 is a fallback for a catalog row that has
  // no sha256 at all — it is never allowed to outrank a sha256 that is already
  // available, because adding a `sha1` field to a catalog row would otherwise
  // silently downgrade the integrity check on every platform.
  const sha256 = typeof model.sha256 === 'string' && model.sha256 ? model.sha256 : null;
  if (sha256) return { algorithm: 'sha256', expected: sha256, source: 'catalog-sha256' };

  const sha1 = typeof model.sha1 === 'string' && model.sha1 ? model.sha1 : null;
  if (sha1) return { algorithm: 'sha1', expected: sha1, source: 'catalog-sha1' };

  const recordedSha256 =
    recorded && typeof recorded.sha256 === 'string' && recorded.sha256 ? recorded.sha256 : null;
  if (recordedSha256) return { algorithm: 'sha256', expected: recordedSha256, source: 'recorded-sha256' };

  // Catalog digests are null ("digest not yet pinned"): pin on first fetch.
  return { algorithm: 'sha256', expected: null, source: 'pin-on-first-fetch' };
}

/** Request headers: `Range: bytes=<n>-` only when there is something to resume. */
export function rangeRequestHeaders(offset = 0) {
  const start = Number(offset);
  if (!Number.isFinite(start) || start <= 0) return {};
  return { Range: `bytes=${Math.floor(start)}-` };
}

const CONTENT_RANGE_RE = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i;
const UNSATISFIABLE_RE = /^bytes\s+\*\/(\d+)$/i;

/**
 * Interpret one download response against the offset we asked for.
 *
 *   append    206 starting exactly where the partial ends -> continue it
 *   restart   200 (server IGNORED our Range header — never append to a
 *             response that contains the whole file: truncate and start
 *             over), or 206 starting at 0
 *   complete  416 whose total equals the partial's size (it was already
 *             fully received — go straight to verification)
 *   reissue   416 otherwise (partial is stale — re-request from zero)
 *   fail      anything else (unexpected status, unparseable Content-Range,
 *             a 206 starting anywhere other than 0 or our offset)
 *
 * @param {{ offset?: number, status: number, contentRange?: string|null }} input
 * @returns {{ mode: string, startOffset?: number, totalBytes?: number|null,
 *             reason?: string, reissue?: boolean }}
 */
export function interpretResponse({ offset = 0, status, contentRange = null } = {}) {
  const raw = typeof contentRange === 'string' ? contentRange.trim() : '';

  if (status === 206) {
    const match = raw ? CONTENT_RANGE_RE.exec(raw) : null;
    if (!match) {
      // 206 without a usable Content-Range: only honest when we asked for
      // nothing (offset 0) — treat the body as a full file from byte 0.
      return offset > 0
        ? { mode: 'fail', reason: 'range-mismatch' }
        : { mode: 'restart', startOffset: 0, totalBytes: null };
    }
    const start = Number(match[1]);
    const total = match[3] === '*' ? null : Number(match[3]);
    if (start === offset) return { mode: 'append', startOffset: start, totalBytes: total };
    if (start === 0) return { mode: 'restart', startOffset: 0, totalBytes: total };
    return { mode: 'fail', reason: 'range-mismatch' };
  }

  if (status === 200) {
    // The server ignored `Range`. Restart cleanly (truncate) rather than
    // appending a whole file to a partial — never corrupt on resume.
    return { mode: 'restart', startOffset: 0, totalBytes: null };
  }

  if (status === 416) {
    const match = raw ? UNSATISFIABLE_RE.exec(raw) : null;
    const total = match ? Number(match[1]) : null;
    if (total !== null && offset > 0 && offset === total) {
      return { mode: 'complete', startOffset: offset, totalBytes: total };
    }
    return { mode: 'reissue', startOffset: 0, totalBytes: total, reissue: true };
  }

  return { mode: 'fail', reason: `http-status-${status}` };
}

/**
 * Shape one progress event for the `speech:progress` channel / the protocol's
 * `progress` schema: `{ taskId, receivedBytes, totalBytes, mbps }` (+ modelId).
 *
 * `totalBytes` is clamped to `max(declared, received)` so the protocol
 * relation `receivedBytes <= totalBytes` can NEVER be violated — even when
 * the catalog's rounded `downloadBytes` estimate is smaller than the real
 * file. `mbps` here is megabytes per second (the field name is the
 * protocol's).
 */
export function buildProgressPayload({ taskId, modelId = null, receivedBytes = 0, declaredTotalBytes = null, mbps = 0 }) {
  const received = Math.max(0, Math.floor(Number(receivedBytes) || 0));
  const declaredNumber = Number(declaredTotalBytes);
  const declared =
    Number.isFinite(declaredNumber) && declaredNumber > 0 ? Math.floor(declaredNumber) : received;
  const totalBytes = Math.max(declared, received);
  const speedNumber = Number(mbps);
  const speed = Number.isFinite(speedNumber) && speedNumber > 0 ? Math.round(speedNumber * 100) / 100 : 0;

  const payload = {
    taskId,
    receivedBytes: Math.min(received, totalBytes),
    totalBytes,
    mbps: speed,
  };
  if (modelId) payload.modelId = modelId;
  return payload;
}

/** Strip anything URL-shaped out of an error string (signed CDN URLs, etc.). */
export function sanitizeNetworkMessage(message) {
  return String(message ?? '').replace(/https?:\/\/\S+/g, 'the model host').slice(0, 300);
}

function offlineHint(model, modelsDir) {
  return `Offline install: place ${model.fileName} into ${modelsDir} — the app detects it on the next launch.`;
}

function downloadDigestFailureMessage(model, modelsDir) {
  return (
    `The downloaded ${model.fileName} failed integrity verification and was removed. ` +
    `Try again, or ${offlineHint(model, modelsDir)}`
  );
}

function installedDigestFailureMessage(model, modelsDir) {
  return (
    `The installed ${model.fileName} does not match its recorded digest. ` +
    `Delete it from ${modelsDir} and install it again.`
  );
}

// ---------------------------------------------------------------------------
// Manifest (records pinned digests; the catalog itself is never written)
// ---------------------------------------------------------------------------

const emptyManifest = () => ({ schema: MANIFEST_SCHEMA, models: {} });

/** Read the local digest manifest. Missing or corrupt files read as empty. */
export function readManifestSync(manifestPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.models || typeof parsed.models !== 'object') {
      return emptyManifest();
    }
    return { schema: MANIFEST_SCHEMA, models: parsed.models };
  } catch {
    return emptyManifest();
  }
}

/** Atomically persist the manifest (temp file + rename — see atomicFileSave). */
export async function writeManifest(manifestPath, manifest) {
  const payload = { schema: MANIFEST_SCHEMA, models: manifest?.models ?? {} };
  await saveTextFileAtomically(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 'replace',
  });
}

/** Pure: a new manifest with `entry` recorded for `modelId`. */
export function recordDigest(manifest, modelId, entry) {
  const models = { ...(manifest?.models ?? {}) };
  models[modelId] = { ...(models[modelId] ?? {}), ...entry };
  return { schema: MANIFEST_SCHEMA, models };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** Stream a file through the requested hash algorithms. Never loads it whole. */
export async function hashFile(filePath, algorithms = ['sha1', 'sha256']) {
  const wanted = [...new Set(algorithms)].filter((a) => a === 'sha1' || a === 'sha256');
  const hashers = {};
  for (const algorithm of wanted) hashers[algorithm] = createHash(algorithm);

  let bytes = 0;
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    bytes += chunk.length;
    for (const algorithm of Object.keys(hashers)) hashers[algorithm].update(chunk);
  }

  return {
    bytes,
    sha1: hashers.sha1 ? hashers.sha1.digest('hex') : null,
    sha256: hashers.sha256 ? hashers.sha256.digest('hex') : null,
  };
}

async function statOrNull(targetPath) {
  try {
    return await fsp.stat(targetPath);
  } catch {
    return null;
  }
}

/** Delete a `.part` file and report how many bytes were reclaimed. */
async function cleanupPart(partPath) {
  try {
    const stats = await fsp.stat(partPath);
    await fsp.unlink(partPath);
    return stats.size;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Verification (shared by install, resume completion, and select-model)
// ---------------------------------------------------------------------------

/**
 * Hash `filePath` against the digest policy, and — on success — record the
 * computed digests in the local manifest (this is where a null catalog
 * digest gets pinned).
 *
 * Never throws; returns the download-shaped result.
 */
export async function verifyFileAt({
  model,
  filePath,
  manifest,
  manifestPath,
  sourceLabel = 'download',
  scope = 'download',
  now = Date.now,
}) {
  const recorded = manifest?.models?.[model.id] ?? null;
  const policy = resolveDigestPolicy(model, recorded);
  const digest = await hashFile(filePath, [policy.algorithm, 'sha256']);

  const matches = policy.expected ? digest[policy.algorithm] === policy.expected : true;
  if (!matches) {
    return {
      ok: false,
      code: 'digest-mismatch',
      scope,
      modelId: model.id,
      algorithm: policy.algorithm,
      digestSource: policy.source,
      message:
        scope === 'installed'
          ? installedDigestFailureMessage(model, path.dirname(filePath))
          : downloadDigestFailureMessage(model, path.dirname(filePath)),
    };
  }

  const entry = {
    fileName: path.basename(filePath),
    bytes: digest.bytes,
    sha1: digest.sha1,
    sha256: digest.sha256,
    digestSource: policy.source,
    source: sourceLabel,
    installedAt: now(),
  };
  await writeManifest(manifestPath, recordDigest(manifest, model.id, entry));

  return {
    ok: true,
    modelId: model.id,
    fileName: entry.fileName,
    bytes: digest.bytes,
    sha1: digest.sha1,
    sha256: digest.sha256,
    digestSource: policy.source,
    verified: true,
  };
}

/**
 * Verify an INSTALLED model file (the `speech:select-model` path). A
 * pre-placed drop-in with no recorded digest is pinned here — first use,
 * zero network.
 *
 * @param {{ model: object, modelsDir: string, now?: () => number }} options
 */
export async function verifyInstalledModel({ model, modelsDir, now = Date.now }) {
  if (!model || typeof model.fileName !== 'string') {
    return { ok: false, code: 'invalid-model', message: 'That model is not in the catalog.' };
  }
  let paths;
  try {
    paths = modelPaths(modelsDir, model.fileName);
  } catch (error) {
    return { ok: false, code: 'invalid-models-dir', message: error.message };
  }

  const stats = await statOrNull(paths.finalPath);
  if (!stats?.isFile()) {
    return {
      ok: false,
      code: 'model-not-installed',
      modelId: model.id,
      message:
        `${model.fileName} is not installed. Install it here, or drop it into ${modelsDir} ` +
        '— the app detects it on the next launch.',
    };
  }

  const manifestPath = path.join(modelsDir, MANIFEST_FILE_NAME);
  const manifest = readManifestSync(manifestPath);
  const recorded = manifest.models?.[model.id] ?? null;

  const verdict = await verifyFileAt({
    model,
    filePath: paths.finalPath,
    manifest,
    manifestPath,
    sourceLabel: recorded?.source ?? 'drop-in',
    scope: 'installed',
    now,
  });
  if (!verdict.ok) {
    return { ...verdict, message: installedDigestFailureMessage(model, modelsDir) };
  }
  return verdict;
}

// ---------------------------------------------------------------------------
// Discovery (filesystem only — this is the offline drop-in path)
// ---------------------------------------------------------------------------

/**
 * Which catalog models are present in `modelsDir`. Pure filesystem: no
 * network, no spawn, no hashing (verification happens on select). A file
 * with no manifest entry is a user-placed DROP-IN and is reported as such.
 *
 * @returns {Array<{ id, fileName, bytes, sha256, digestRecorded,
 *                   sizeMatchesRecord, source }>}
 */
export function listInstalledModels({ modelsDir, catalog = SPEECH_MODELS, manifest = null } = {}) {
  if (typeof modelsDir !== 'string' || !modelsDir) return [];
  const active = manifest ?? readManifestSync(path.join(modelsDir, MANIFEST_FILE_NAME));
  const installed = [];

  for (const model of catalog) {
    let paths;
    try {
      paths = modelPaths(modelsDir, model.fileName);
    } catch {
      continue;
    }
    let stats;
    try {
      stats = fs.statSync(paths.finalPath);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;

    const entry = active.models?.[model.id] ?? null;
    installed.push({
      id: model.id,
      fileName: paths.fileName,
      bytes: stats.size,
      sha256: entry?.sha256 ?? null,
      digestRecorded: Boolean(entry),
      sizeMatchesRecord: Boolean(entry) && entry.bytes === stats.size,
      source: entry?.source ?? 'drop-in',
    });
  }
  return installed;
}

/**
 * In-flight / interrupted downloads: `.part` files on disk. Their presence
 * is exactly what makes `Range` resume possible after a crash or a
 * transport interruption.
 *
 * @returns {Array<{ id, fileName, receivedBytes, totalBytes }>}
 */
export function listPartialDownloads({ modelsDir, catalog = SPEECH_MODELS } = {}) {
  if (typeof modelsDir !== 'string' || !modelsDir) return [];
  let entries;
  try {
    entries = fs.readdirSync(modelsDir);
  } catch {
    return [];
  }
  const present = new Set(entries);
  const partials = [];

  for (const model of catalog) {
    let paths;
    try {
      paths = modelPaths(modelsDir, model.fileName);
    } catch {
      continue;
    }
    if (!present.has(paths.fileName)) continue;
    const partName = `${paths.fileName}${PART_SUFFIX}`;
    if (!present.has(partName)) continue;
    let stats;
    try {
      stats = fs.statSync(path.join(modelsDir, partName));
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    partials.push({
      id: model.id,
      fileName: paths.fileName,
      receivedBytes: stats.size,
      totalBytes: Number(model.downloadBytes) > 0 ? Number(model.downloadBytes) : stats.size,
    });
  }
  return partials;
}

// ---------------------------------------------------------------------------
// The download itself
// ---------------------------------------------------------------------------

/**
 * Download one catalog model into `modelsDir`, resumable and verified.
 * NEVER throws — every outcome is a `{ ok }` result.
 *
 * @param {Object} options
 * @param {object} options.model catalog row (url, fileName, sha1, sha256, ...)
 * @param {string} options.modelsDir target directory (the drop-in directory)
 * @param {Function} [options.fetchImpl] fetch-compatible function (injected
 *   in tests; defaults to globalThis.fetch)
 * @param {Function} [options.onProgress] receives buildProgressPayload output
 * @param {AbortSignal} [options.signal] abort == user cancel (cleans up)
 * @param {number} [options.progressIntervalMs]
 * @param {() => number} [options.now]
 * @returns {Promise<object>} { ok, ... } — see module header for the codes
 */
export async function downloadModel(options = {}) {
  const {
    model,
    modelsDir,
    fetchImpl = null,
    onProgress = null,
    signal = null,
    progressIntervalMs = PROGRESS_MIN_INTERVAL_MS,
    now = Date.now,
  } = options;

  if (!model || typeof model.id !== 'string' || typeof model.url !== 'string' || !model.url) {
    return { ok: false, code: 'invalid-model', message: 'That model is not in the catalog.' };
  }
  if (typeof modelsDir !== 'string' || !modelsDir) {
    return { ok: false, code: 'invalid-models-dir', message: 'No models directory is configured.' };
  }

  let paths;
  try {
    paths = modelPaths(modelsDir, model.fileName);
  } catch (error) {
    return { ok: false, code: 'invalid-model', message: error.message };
  }

  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    return { ok: false, code: 'no-fetch', message: 'No fetch implementation is available.' };
  }

  const taskId = taskIdFor(model.id);
  const manifestPath = path.join(modelsDir, MANIFEST_FILE_NAME);
  const manifest = readManifestSync(manifestPath);

  await fsp.mkdir(modelsDir, { recursive: true });

  // --- already on disk: verify before claiming success ----------------------
  const existing = await statOrNull(paths.finalPath);
  if (existing?.isFile()) {
    const recorded = manifest.models?.[model.id] ?? null;
    const verdict = await verifyFileAt({
      model,
      filePath: paths.finalPath,
      manifest,
      manifestPath,
      sourceLabel: recorded?.source ?? 'drop-in',
      scope: 'installed',
      now,
    });
    if (!verdict.ok) {
      return { ...verdict, message: installedDigestFailureMessage(model, modelsDir) };
    }
    return { ...verdict, alreadyPresent: true, taskId };
  }

  const failTerminal = async (code, message, extra = {}) => {
    const bytesReclaimed = await cleanupPart(paths.partPath);
    return { ok: false, code, message, bytesReclaimed, ...extra };
  };

  // --- request loop: Range continuation + one clean reissue on stale 416 ----
  let response = null;
  let decision = null;
  let offset = (await statOrNull(paths.partPath))?.size ?? 0;
  const resumed = offset > 0;

  for (let attempt = 0; attempt < 3 && !response; attempt += 1) {
    let res;
    try {
      res = await doFetch(model.url, {
        method: 'GET',
        headers: rangeRequestHeaders(offset),
        signal,
        redirect: 'follow',
      });
    } catch (error) {
      if (signal?.aborted) {
        const bytesReclaimed = await cleanupPart(paths.partPath);
        return {
          ok: false,
          code: 'cancelled',
          message: 'Download cancelled.',
          bytesReclaimed,
          taskId,
        };
      }
      const cause =
        sanitizeNetworkMessage(error?.cause?.code ?? error?.code ?? error?.message ?? 'network error');
      return failTerminal(
        'network-unreachable',
        `Could not reach the model host (${cause}). ${offlineHint(model, modelsDir)}`,
        { taskId }
      );
    }

    const contentRange = typeof res.headers?.get === 'function' ? res.headers.get('content-range') : null;
    const interpreted = interpretResponse({ offset, status: res.status, contentRange });

    if (interpreted.mode === 'fail') {
      try {
        await res.body?.cancel?.();
      } catch { /* body is already gone */ }
      const reason = interpreted.reason ?? 'unexpected-response';
      if (String(reason).startsWith('http-status-')) {
        const status = String(reason).slice('http-status-'.length);
        return failTerminal(
          'http-error',
          `The model host returned HTTP ${status}. ${offlineHint(model, modelsDir)}`,
          { taskId, status: Number(status) }
        );
      }
      return failTerminal(
        'range-mismatch',
        `The model host sent a response this download cannot resume safely. ` +
          `Try again, or ${offlineHint(model, modelsDir)}`,
        { taskId }
      );
    }

    if (interpreted.mode === 'reissue') {
      // Stale partial: re-request from byte zero (no Range header).
      try {
        await res.body?.cancel?.();
      } catch { /* ignore */ }
      offset = 0;
      continue;
    }

    if (interpreted.mode === 'complete') {
      try {
        await res.body?.cancel?.();
      } catch { /* ignore */ }
      // The server says our partial IS the whole file — but only if it is
      // still there. Vanished => re-issue from zero like any stale partial.
      const partialStillThere = (await statOrNull(paths.partPath))?.isFile() === true;
      if (!partialStillThere) {
        offset = 0;
        continue;
      }
      response = null;
      decision = { mode: 'complete', totalBytes: interpreted.totalBytes };
      break;
    }

    response = res;
    decision = interpreted;
  }

  // --- .part was already complete (416 == our size): straight to verify -----
  if (!response && decision?.mode === 'complete') {
    const verdict = await verifyFileAt({
      model,
      filePath: paths.partPath,
      manifest,
      manifestPath,
      sourceLabel: 'download',
      scope: 'download',
      now,
    });
    if (!verdict.ok) {
      const bytesReclaimed = await cleanupPart(paths.partPath);
      return { ...verdict, message: downloadDigestFailureMessage(model, modelsDir), bytesReclaimed, taskId };
    }
    await fsp.rename(paths.partPath, paths.finalPath);
    return { ...verdict, alreadyPresent: false, resumed: true, taskId };
  }

  if (!response) {
    return failTerminal(
      'range-mismatch',
      `The model host would not serve ${model.fileName} in a resumable way. ` +
        `Try again, or ${offlineHint(model, modelsDir)}`,
      { taskId }
    );
  }

  // --- totals ---------------------------------------------------------------
  const contentLengthHeader =
    typeof response.headers?.get === 'function' ? response.headers.get('content-length') : null;
  const contentLength =
    typeof contentLengthHeader === 'string' && /^\d+$/.test(contentLengthHeader)
      ? Number(contentLengthHeader)
      : null;
  const declaredTotalBytes =
    decision.totalBytes ??
    contentLength ??
    (Number(model.downloadBytes) > 0 ? Number(model.downloadBytes) : null);

  const append = decision.mode === 'append';
  let received = append ? decision.startOffset : 0;

  // --- open the partial (append only when it really ends where we asked) ----
  let handle;
  try {
    handle = await fsp.open(paths.partPath, append ? 'a' : 'w');
    const opened = await handle.stat();
    if (append && opened.size !== decision.startOffset) {
      await handle.close();
      return failTerminal(
        'range-mismatch',
        `The partial download for ${model.fileName} changed while resuming. Try again.`,
        { taskId }
      );
    }
  } catch (error) {
    return failTerminal(
      'storage-error',
      `Could not write into ${modelsDir} (${error?.code ?? 'write failed'}).`,
      { taskId }
    );
  }

  // --- progress -------------------------------------------------------------
  let lastEmitAt = 0;
  let windowStartedAt = now();
  let windowStartedBytes = received;
  const emit = (force) => {
    if (typeof onProgress !== 'function') return;
    const at = now();
    if (!force && at - lastEmitAt < progressIntervalMs) return;
    const elapsedSec = Math.max(0, at - windowStartedAt) / 1000;
    const deltaBytes = Math.max(0, received - windowStartedBytes);
    const mbps = elapsedSec > 0 ? deltaBytes / 1e6 / elapsedSec : 0;
    lastEmitAt = at;
    windowStartedAt = at;
    windowStartedBytes = received;
    try {
      onProgress(
        buildProgressPayload({
          taskId,
          modelId: model.id,
          receivedBytes: received,
          declaredTotalBytes,
          mbps,
        })
      );
    } catch {
      // A renderer-side listener must never break the download.
    }
  };

  // --- stream the body ------------------------------------------------------
  let transportFailed = false;
  let writeFailed = null;
  let overranDeclaredLength = false;
  try {
    if (response.body) {
      for await (const chunk of response.body) {
        if (signal?.aborted) break;
        // Refuse to write past the length the server declared. `received`
        // already includes the resume offset (it starts at
        // `decision.startOffset`), so it is the absolute file position.
        // The shortfall check below (`onDiskBytes < declaredTotalBytes`)
        // only runs AFTER the body ends, so without this a hostile or
        // hijacked model host could stream unbounded bytes into the .part
        // file and fill the drive on a machine with no free space to spare.
        // Stopping mid-stream bounds the damage to at most one chunk past
        // the declared size.
        if (
          declaredTotalBytes !== null &&
          received + chunk.length > declaredTotalBytes
        ) {
          overranDeclaredLength = true;
          break;
        }
        try {
          await handle.write(chunk);
        } catch (error) {
          writeFailed = error;
          break;
        }
        received += chunk.length;
        emit(false);
      }
    }
  } catch {
    // Transport died mid-body. Not a cancel -> KEEP the .part (resume path).
    transportFailed = true;
  } finally {
    try {
      await handle.close();
    } catch { /* already closed */ }
  }

  if (overranDeclaredLength) {
    // The body declared N bytes and offered more. Treat it as a transport
    // interruption rather than a clean finish: the .part is kept so the next
    // attempt resumes, and the file will never be promoted or verified.
    const bytesReclaimed = await cleanupPart(paths.partPath);
    return failTerminal(
      'size-mismatch',
      `The server sent more than the ${declaredTotalBytes} bytes it declared. ` +
        `${bytesReclaimed} bytes reclaimed.`,
      { taskId }
    );
  }

  if (signal?.aborted) {
    const bytesReclaimed = await cleanupPart(paths.partPath);
    return { ok: false, code: 'cancelled', message: 'Download cancelled.', bytesReclaimed, taskId };
  }

  if (writeFailed) {
    return failTerminal(
      'storage-error',
      `Could not write into ${modelsDir} (${writeFailed?.code ?? 'write failed'}).`,
      { taskId }
    );
  }

  const onDiskBytes = (await statOrNull(paths.partPath))?.size ?? received;

  if (transportFailed) {
    // Interrupted: bytes stay on disk so the next attempt resumes with Range.
    return {
      ok: false,
      code: 'interrupted',
      resumable: true,
      receivedBytes: onDiskBytes,
      totalBytes: declaredTotalBytes,
      message:
        `Download interrupted at ${onDiskBytes} of ${declaredTotalBytes ?? '?'} bytes — ` +
        `resume to continue from where it stopped.`,
      taskId,
    };
  }

  if (declaredTotalBytes !== null && onDiskBytes < declaredTotalBytes) {
    return {
      ok: false,
      code: 'interrupted',
      resumable: true,
      receivedBytes: onDiskBytes,
      totalBytes: declaredTotalBytes,
      message:
        `Download interrupted at ${onDiskBytes} of ${declaredTotalBytes} bytes — ` +
        `resume to continue from where it stopped.`,
      taskId,
    };
  }

  emit(true);

  // A cancel that landed while we were finishing up still wins: never
  // promote a file the user asked to stop downloading.
  if (signal?.aborted) {
    const bytesReclaimed = await cleanupPart(paths.partPath);
    return { ok: false, code: 'cancelled', message: 'Download cancelled.', bytesReclaimed, taskId };
  }

  // --- verify, then promote the .part atomically ----------------------------
  const verdict = await verifyFileAt({
    model,
    filePath: paths.partPath,
    manifest,
    manifestPath,
    sourceLabel: 'download',
    scope: 'download',
    now,
  });

  if (!verdict.ok) {
    const bytesReclaimed = await cleanupPart(paths.partPath);
    return {
      ...verdict,
      message: downloadDigestFailureMessage(model, modelsDir),
      bytesReclaimed,
      taskId,
    };
  }

  try {
    await fsp.rename(paths.partPath, paths.finalPath);
  } catch (error) {
    return failTerminal(
      'storage-error',
      `Could not finish writing ${model.fileName} (${error?.code ?? 'write failed'}).`,
      { taskId }
    );
  }

  return {
    ...verdict,
    alreadyPresent: false,
    resumed,
    taskId,
  };
}

// ---------------------------------------------------------------------------
// Manager: task de-duplication + cancel + snapshot (the IPC-facing surface)
// ---------------------------------------------------------------------------

/**
 * One manager per models directory. Owns the in-flight task map so a second
 * Install click for the same model JOINS the running download instead of
 * starting a parallel one.
 *
 * @param {Object} options
 * @param {string} options.modelsDir
 * @param {object[]} [options.catalog]
 * @param {Function} [options.fetchImpl]
 * @param {Function} [options.onProgress] -> speech:progress
 * @param {Function} [options.onStateChange] -> speech:install-state republish
 * @param {Function} [options.onError] -> speech:error
 */
export function createModelInstallManager({
  modelsDir,
  catalog = SPEECH_MODELS,
  fetchImpl = null,
  onProgress = null,
  onStateChange = null,
  onError = null,
} = {}) {
  if (typeof modelsDir !== 'string' || !modelsDir) {
    throw new Error('createModelInstallManager: modelsDir is required');
  }
  const tasks = new Map(); // taskId -> { taskId, modelId, controller, promise }

  const notifyState = () => {
    try {
      onStateChange?.();
    } catch { /* renderer may be mid-navigation */ }
  };

  const findModel = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value) return null;
    return catalog.find((model) => model.id === value) ?? null;
  };

  /** Start (or join) a download. Resolves with the download result. */
  function install(modelOrId) {
    const model = findModel(modelOrId);
    if (!model) {
      return Promise.resolve({
        ok: false,
        code: 'unknown-model',
        field: 'modelId',
        message: 'That model is not in the catalog.',
      });
    }

    const taskId = taskIdFor(model.id);
    const running = tasks.get(taskId);
    if (running) {
      // Second caller: join the in-flight task (progress still streams to it).
      return Promise.resolve({
        ok: true,
        taskId,
        modelId: model.id,
        state: 'downloading',
        alreadyRunning: true,
      });
    }

    const controller = new AbortController();
    const task = { taskId, modelId: model.id, controller, promise: null };
    tasks.set(taskId, task);

    task.promise = (async () => {
      let result;
      try {
        result = await downloadModel({
          model,
          modelsDir,
          fetchImpl,
          onProgress,
          signal: controller.signal,
        });
      } catch (error) {
        // downloadModel is not supposed to throw — belt and braces.
        result = {
          ok: false,
          code: 'internal-error',
          message: `The download failed unexpectedly (${error?.message ?? 'unknown error'}). Try again.`,
        };
      }
      tasks.delete(taskId);
      notifyState();
      if (!result.ok && result.code !== 'cancelled') {
        try {
          onError?.({
            code: `model-${result.code}`,
            message: result.message,
            fatal: false,
          });
        } catch { /* listener errors are not ours to fix */ }
      }
      return result;
    })();

    return task.promise;
  }

  /** Cancel a running download (by modelId or taskId): cleans the .part. */
  async function cancel(key) {
    let task = null;
    if (typeof key === 'string' && key) {
      task = tasks.get(key) ?? tasks.get(taskIdFor(key)) ?? null;
    }
    if (!task) {
      return {
        ok: false,
        code: 'no-active-download',
        message: 'No download is running for that model.',
      };
    }
    task.controller.abort();
    const settlement = await task.promise;
    return {
      ok: true,
      cancelled: true,
      modelId: task.modelId,
      taskId: task.taskId,
      bytesReclaimed: settlement?.bytesReclaimed ?? 0,
      code: settlement?.code ?? 'cancelled',
    };
  }

  /** Verify an installed model (the select-model path). */
  async function verify(modelOrId) {
    const model = findModel(modelOrId);
    if (!model) {
      return {
        ok: false,
        code: 'unknown-model',
        field: 'modelId',
        message: 'That model is not in the catalog.',
      };
    }
    return verifyInstalledModel({ model, modelsDir });
  }

  /** Filesystem-only snapshot for speech:install-state / speech:get-state. */
  function snapshot() {
    return {
      modelsDir,
      installed: listInstalledModels({ modelsDir, catalog }),
      partials: listPartialDownloads({ modelsDir, catalog }),
      activeDownloads: [...tasks.values()].map((task) => ({
        taskId: task.taskId,
        modelId: task.modelId,
      })),
    };
  }

  return { modelsDir, install, cancel, verify, snapshot };
}
