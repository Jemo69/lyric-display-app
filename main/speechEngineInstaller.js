/**
 * main/speechEngineInstaller.js — install the REAL whisper.cpp binary.
 *
 * WHY THIS FILE EXISTS. Until now the app shipped two halves of a feature that
 * never met: a model downloader that fetched GGML weights, and a `whisper-cli`
 * driver that could only work if a human had already copied the binary into
 * `<userData>/speech-engine/bin` by hand. Nothing in the app did that copy. So
 * Production mode on a normal install had no engine to run, and the supervisor
 * quietly started the canned fake engine instead — which is exactly what the
 * "PROD" toggle showing "TEST ENGINE" was.
 *
 * This module closes the gap: it downloads the official whisper.cpp release
 * archive for the running platform, verifies its SHA-256 against the pinned
 * values below, and unpacks the whole payload (binary + shared libraries) into
 * the directory `main/speechIpc.js` already points the supervisor at.
 *
 * WHY THE WHOLE PAYLOAD AND NOT JUST THE EXE: `whisper-cli` is dynamically
 * linked against `libwhisper`/`libggml` (Windows: DLLs next to the exe, Linux:
 * RUNPATH `$ORIGIN`). Extracting only the executable produces a process that
 * starts and immediately dies with "cannot open shared object file". See
 * main/speechArchive.js `flattenPayload`.
 *
 * SECURITY POSTURE:
 *  - The download URL is built from a pinned release tag and a pinned asset
 *    name; no value from the renderer ever reaches it.
 *  - The archive is verified against a pinned SHA-256 before a single byte is
 *    written into `bin/`. A mismatch deletes the download.
 *  - Every entry name is checked with `isSafeEntryName` before writing, so a
 *    malicious archive cannot escape the install directory.
 *  - Downloads go to `downloads/`, never over a running engine's `bin/`; the
 *    final write happens after verification.
 *
 * macOS is deliberately unsupported: upstream publishes an xcframework, not a
 * CLI, for that platform. Reporting "unsupported" is honest; pretending to
 * install and then failing at spawn is not.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readArchiveEntries, flattenPayload, isSafeEntryName } from './speechArchive.js';

/** The pinned upstream release. Bump deliberately, with new hashes. */
export const ENGINE_RELEASE = Object.freeze({
  version: 'b5454',
  repository: 'ggml-org/whisper.cpp',
});

const BASE_URL = `https://github.com/${ENGINE_RELEASE.repository}/releases/download/${ENGINE_RELEASE.version}`;

/**
 * Pinned assets, keyed `${platform}-${arch}`.
 *
 * `payloadDir` is the single top-level folder upstream wraps the files in;
 * `sha256` was measured from the published bytes at pin time.
 */
export const ENGINE_ASSETS = Object.freeze({
  'win32-x64': Object.freeze({
    file: 'whisper-bin-x64.zip',
    kind: 'zip',
    payloadDir: 'Release',
    bytes: 8928640,
    sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
  }),
  'win32-ia32': Object.freeze({
    file: 'whisper-bin-Win32.zip',
    kind: 'zip',
    payloadDir: 'Release',
    bytes: 5523979,
    sha256: 'b6cb078ee5d4df0f9dcdb4f820210c59bd6534c84fdb13c35bc8a51d1233451f',
  }),
  'linux-x64': Object.freeze({
    file: 'whisper-bin-ubuntu-x64.tar.gz',
    kind: 'tar.gz',
    payloadDir: 'whisper-bin-ubuntu-x64',
    bytes: 10364195,
    sha256: 'a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c',
  }),
  'linux-arm64': Object.freeze({
    file: 'whisper-bin-ubuntu-arm64.tar.gz',
    kind: 'tar.gz',
    payloadDir: 'whisper-bin-ubuntu-arm64',
    bytes: 4608377,
    sha256: '6b95ebfc60447df48e70ef00a73bdc3f41679ed2d01ef465827206a2ff325149',
  }),
});

/** whisper.cpp's binary name, per platform. */
export function engineBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

/** The pinned asset for this platform, or null when upstream has none. */
export function engineAssetFor(platform = process.platform, arch = process.arch) {
  return ENGINE_ASSETS[`${platform}-${arch}`] ?? null;
}

/** Is a usable whisper.cpp binary already installed in `binDir`? */
export function hasEngineBinary(binDir, platform = process.platform) {
  if (typeof binDir !== 'string' || !binDir) return false;
  try {
    const full = path.join(binDir, engineBinaryName(platform));
    return fs.existsSync(full) && fs.statSync(full).size > 0;
  } catch {
    return false;
  }
}

const sha256Of = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** A plain error object the IPC layer can relay without a stack trace. */
function failure(code, message) {
  return { ok: false, code, message };
}

/**
 * Read a fetch Response body into one Buffer, reporting progress.
 *
 * A stub fetch in tests may expose only `arrayBuffer()`; the production path
 * streams so a 10 MB download reports bytes instead of appearing frozen.
 */
async function readBody(response, { totalBytes, onProgress }) {
  const startedAt = Date.now();
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      received += value.byteLength;
      const now = Date.now();
      if (onProgress && (now - lastReport >= 250 || received === totalBytes)) {
        lastReport = now;
        const seconds = Math.max((now - startedAt) / 1000, 0.001);
        onProgress({
          receivedBytes: received,
          totalBytes,
          mbps: Number((received / seconds / 1e6).toFixed(1)),
        });
      }
    }
    return Buffer.concat(chunks);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  onProgress?.({ receivedBytes: buffer.byteLength, totalBytes, mbps: null });
  return buffer;
}

/**
 * Verify an archive's bytes against its pinned digest.
 *
 * @param {Buffer} buffer
 * @param {{sha256: string}} asset
 * @returns {boolean}
 */
export function verifyEngineArchive(buffer, asset) {
  return sha256Of(buffer) === asset?.sha256;
}

/**
 * Unpack a verified engine archive into `binDir`.
 *
 * Split out of `installEngineBinary` so the filesystem half is testable with a
 * small in-memory archive instead of a 10 MB download.
 *
 * @param {object} options
 * @param {Buffer} options.buffer
 * @param {object} options.asset   a pinned asset row
 * @param {string} options.binDir
 * @param {string} [options.platform]
 * @returns {Promise<{ok: boolean, code?: string, message?: string,
 *                    files?: string[], binaryName?: string}>}
 */
export async function unpackEngineArchive({
  buffer,
  asset,
  binDir,
  platform = process.platform,
} = {}) {
  if (!Buffer.isBuffer(buffer) || !asset || typeof binDir !== 'string' || !binDir) {
    return failure('invalid-argument', 'The engine archive could not be unpacked.');
  }

  let files;
  try {
    const entries = readArchiveEntries(buffer, asset.kind);
    files = flattenPayload(entries, asset.payloadDir);
  } catch (error) {
    return failure('corrupt-archive', `The engine archive could not be read: ${error?.message ?? 'unknown error'}.`);
  }

  const binaryName = engineBinaryName(platform);
  if (!files.has(binaryName)) {
    return failure('corrupt-archive', `The engine archive did not contain ${binaryName}, so nothing was installed.`);
  }

  try {
    await fsp.mkdir(binDir, { recursive: true });
    for (const [name, bytes] of files) {
      if (!isSafeEntryName(name)) {
        return failure('corrupt-archive', `The engine archive contained an unsafe path ("${name}").`);
      }
      const target = path.join(binDir, name);
      await fsp.writeFile(`${target}.tmp`, bytes);
      // Windows refuses rename() onto an existing file; clear it first so a
      // retry after a partial install can finish.
      await fsp.rm(target, { force: true });
      await fsp.rename(`${target}.tmp`, target);
      // Linux/macOS need the executable bit; the shared libraries do not.
      if (platform !== 'win32' && !/\.(so|dylib)(\.|$)/.test(name)) {
        await fsp.chmod(target, 0o755);
      }
    }
  } catch (error) {
    return failure('install-failed', `The engine files could not be written: ${error?.message ?? 'unknown error'}.`);
  }

  if (!hasEngineBinary(binDir, platform)) {
    return failure('install-failed', `The engine was unpacked but ${binaryName} is not usable.`);
  }

  return { ok: true, files: [...files.keys()].sort(), binaryName };
}

/**
 * Download, verify, and unpack the real engine into `binDir`.
 *
 * Never throws for expected failures: every failure is `{ ok:false, code,
 * message }` so the IPC handler can relay it to the operator as one sentence.
 *
 * @param {object} options
 * @param {string} options.binDir        destination (…/speech-engine/bin)
 * @param {string} options.downloadsDir  scratch dir for the archive
 * @param {string} [options.platform]    defaults to process.platform
 * @param {string} [options.arch]        defaults to process.arch
 * @param {Function} [options.fetchImpl] injected for tests
 * @param {(progress: object) => void} [options.onProgress]
 * @returns {Promise<{ok: boolean, code?: string, message?: string,
 *                    version?: string, binDir?: string, bytes?: number,
 *                    sha256?: string, files?: string[]}>}
 */
export async function installEngineBinary({
  binDir,
  downloadsDir,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  onProgress = null,
} = {}) {
  if (typeof binDir !== 'string' || !binDir) return failure('invalid-argument', 'No engine directory was given.');
  if (typeof downloadsDir !== 'string' || !downloadsDir) {
    return failure('invalid-argument', 'No download directory was given.');
  }

  const asset = engineAssetFor(platform, arch);
  if (!asset) {
    return failure(
      'unsupported-platform',
      `No prebuilt whisper.cpp engine is published for ${platform}/${arch}. ` +
        'Install whisper-cli into the engine bin folder manually to use Production mode on this machine.'
    );
  }
  if (typeof fetchImpl !== 'function') {
    return failure('network-unavailable', 'This build cannot download the speech engine.');
  }

  const url = `${BASE_URL}/${asset.file}`;
  const archivePath = path.join(downloadsDir, `${asset.file}.part`);
  let buffer;

  try {
    await fsp.mkdir(downloadsDir, { recursive: true });
    const response = await fetchImpl(url, { redirect: 'follow' });
    if (!response || response.ok === false) {
      return failure(
        'download-failed',
        `The engine download failed (HTTP ${response?.status ?? 'no response'}). Check the connection and try again.`
      );
    }
    buffer = await readBody(response, { totalBytes: asset.bytes, onProgress });
    await fsp.writeFile(archivePath, buffer);
  } catch (error) {
    await fsp.rm(archivePath, { force: true }).catch(() => {});
    return failure('download-failed', `The engine download failed: ${error?.message ?? 'unknown error'}.`);
  }

  if (!verifyEngineArchive(buffer, asset)) {
    await fsp.rm(archivePath, { force: true }).catch(() => {});
    return failure(
      'digest-mismatch',
      'The downloaded engine archive did not match its published checksum, so nothing was installed. Try again.'
    );
  }

  let unpacked;
  try {
    unpacked = await unpackEngineArchive({ buffer, asset, binDir, platform });
  } finally {
    await fsp.rm(archivePath, { force: true }).catch(() => {});
  }
  if (!unpacked.ok) return unpacked;

  return {
    ok: true,
    version: ENGINE_RELEASE.version,
    binDir,
    bytes: buffer.byteLength,
    sha256: asset.sha256,
    files: unpacked.files,
  };
}
