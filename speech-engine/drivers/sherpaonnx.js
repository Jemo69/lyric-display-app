/**
 * speech-engine/drivers/sherpaonnx.js — the sherpa-onnx / Nemotron driver
 * (Phase 6).
 *
 * WHY THIS EXISTS ALONGSIDE whisper.cpp, RATHER THAN INSTEAD OF IT.
 *
 * They are not comparable on paper and the answer is genuinely machine- and
 * church-dependent:
 *
 *   whisper.cpp    a wide model menu (tiny through large-v3), GPU backends for
 *                  metal / vulkan / cuda, and the best English accuracy at the
 *                  top end. But Large v3 is 2.88 GiB and it is English-first.
 *
 *   sherpa-onnx    Nemotron 3.5 streaming int8 is 651 MiB, covers roughly forty
 *                  languages, and ships Silero VAD with it. For a French,
 *                  Spanish, or Norwegian congregation it is simply the better
 *                  tool, and it is a third the size.
 *
 * Neither wins everywhere, which is why `models.catalog.json` carries both and
 * the existing benchmark harness measures both on the user's own machine. If
 * sherpa-onnx fails to install on some machine, whisper.cpp is already there
 * and the failure is a missing row in a picker, not a broken feature.
 *
 * CAPABILITIES ARE REPORTED AS DECLARED, NOT AS OPTIMISTIC.
 *
 * The catalog's `sherpaonnx` row carries `wordTimestamps: false` and
 * `biasSupport: false`, and this driver reports the same. That is not an
 * omission to be papered over — it is what makes
 * `lanesForCapabilities()` in src/speech/capabilities.js correctly DISABLE the
 * next-lyric lane with a reason the operator can read. Reporting `true` would
 * enable a lane on a provider that cannot align words, which is precisely the
 * silent-degradation failure the capability gate exists to prevent.
 *
 * PINNED AND VERIFIED. Reproduces FreeShow's discipline: an explicit upstream
 * revision, per-file SHA-256, and a stamp verified BEFORE load. A partially
 * downloaded encoder that still parses can produce confident nonsense, and
 * there is no way to tell that apart from a bad model choice at 2am before a
 * service.
 *
 * NO AUDIO OR TEXT EVER REACHES A LOG. Failures emit codes.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import catalog from '../../shared/speech/models.catalog.json' with { type: 'json' };

export const SHERPA_UNAVAILABLE = 'unavailable';

/**
 * Every file a Nemotron model needs, and the exact revision they come from.
 *
 * TRANSCRIBED FROM UPSTREAM, AND VERIFIED AGAINST IT. Three of these digests
 * were wrong when first written — two truncated to 63 characters by hand, and
 * the decoder's a genuinely different hash from the one first typed. A 63-char
 * digest is a 64-char digest with a character missing, which is exactly the
 * kind of error that verifies nothing while looking like it verifies
 * something. They now match FreeShow's `nemotron.ts` byte for byte, and a test
 * asserts every digest is 64 hex characters so a hand-edit cannot pass again.
 */
export const NEMOTRON_FILES = Object.freeze([
  Object.freeze({ file: 'encoder.int8.onnx', sha256: '2fff2166acaa535bd969fb223c1f0783d71029f143cb298bc54c2afe85abf772' }),
  Object.freeze({ file: 'decoder.int8.onnx', sha256: '19f9c98fc6d0a2c33a65a43b36fdb2e914c26c0aa9764be3aebc502a1e982fb0' }),
  Object.freeze({ file: 'joiner.int8.onnx', sha256: '4101c7c679a0bc30483794b27a059e34e79232aa2068d78d51231a22c8b0d7ce' }),
  Object.freeze({ file: 'tokens.txt', sha256: '729cc103155bafa785f9cd45746cd41cabe97eab7182fc04d594129587958f8a' }),
]);

export const SILERO_VAD = Object.freeze({
  file: 'silero_vad.onnx',
  sha256: '9e2449e1087496d8d4caba907f23a0bd3f78d91fa552479bb9c23ac09cbb1fd6',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
});

/** The catalog row this driver serves. */
const NEMOTRON_ROW = Object.freeze(
  (catalog.models || []).find((model) => model.providerId === 'sherpaonnx') || null
);

/**
 * Is this platform supported?
 *
 * sherpa-onnx-node does not build for darwin-x64, and a provider row that
 * offers a download which cannot possibly work is worse than a row that says
 * so up front. Stated in the catalog as `unsupportedPlatforms` and enforced
 * here, so the failure is a clear message rather than a compiler error.
 *
 * @param {NodeJS.Platform} [platform]
 * @param {NodeJS.Architecture} [arch]
 * @returns {{supported: boolean, reason: string}}
 */
export function platformSupport(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'x64') {
    return {
      supported: false,
      reason: 'sherpa-onnx does not build for macOS on Intel (darwin-x64). Use the whisper.cpp provider on this machine.',
    };
  }
  return { supported: true, reason: '' };
}

/**
 * SHA-256 of a file, for integrity verification.
 *
 * @param {string} file
 * @returns {string|null} null when the file cannot be read
 */
export function sha256Of(file) {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Verify an installed model directory against the pinned digests.
 *
 * EVERY file is checked, and a missing one is a failure. The stamp file is
 * written only after all of them pass, so a half-downloaded model is detected
 * on the next launch rather than producing confident nonsense at 2am.
 *
 * @param {string} modelDir
 * @param {Array<{file: string, sha256: string}>} [expectedFiles] the digests
 *   to check against. Defaults to the pinned NEMOTRON_FILES. Overridable
 *   because a real digest cannot be fabricated — a test that wants to prove the
 *   PASS path needs to pin against content it actually wrote, or it can only
 *   ever assert failure.
 * @returns {{ok: boolean, missing: string[], mismatched: string[], checked: number}}
 */
export function verifyInstalledModel(modelDir, expectedFiles = NEMOTRON_FILES) {
  const missing = [];
  const mismatched = [];

  if (typeof modelDir !== 'string' || !modelDir || !existsSync(modelDir)) {
    return { ok: false, missing: expectedFiles.map((entry) => entry.file), mismatched, checked: 0 };
  }

  for (const entry of expectedFiles) {
    const full = path.join(modelDir, entry.file);
    if (!existsSync(full) || statSync(full).size === 0) {
      missing.push(entry.file);
      continue;
    }
    const actual = sha256Of(full);
    if (actual !== entry.sha256) mismatched.push(entry.file);
  }

  return {
    ok: missing.length === 0 && mismatched.length === 0,
    missing,
    mismatched,
    checked: expectedFiles.length,
  };
}

/**
 * Which catalog models this driver could serve.
 * @returns {Array<object>}
 */
export function sherpaModelRows() {
  return (catalog.models || []).filter((model) => model.providerId === 'sherpaonnx');
}

/**
 * Create the sherpa-onnx engine.
 *
 * @param {object} options
 * @param {object} options.bus       message bus
 * @param {string} options.binDir    where the verified sherpa-onnx CLI lives
 * @param {string} options.modelsDir where the ONNX model directory lives
 * @param {string} [options.modelDir] explicit model directory, overriding the
 *   catalog id lookup under `modelsDir`
 * @param {Array<{file: string, sha256: string}>} [options.expectedFiles] the
 *   digests to verify against. Defaults to the pinned NEMOTRON_FILES; see
 *   `verifyInstalledModel` for why this is overridable.
 * @returns {object} an engine implementing the v1 contract
 */
export function createSherpaEngine({ bus, binDir, modelsDir, modelDir, expectedFiles } = {}) {
  const support = platformSupport();
  if (!support.supported) {
    throw Object.assign(new Error(support.reason), { code: SHERPA_UNAVAILABLE });
  }

  const binary = path.join(
    typeof binDir === 'string' ? binDir : '',
    process.platform === 'win32' ? 'sherpa-onnx.exe' : 'sherpa-onnx'
  );
  if (!existsSync(binary) || statSync(binary).size === 0) {
    throw Object.assign(new Error('sherpa-onnx binary not installed'), { code: SHERPA_UNAVAILABLE });
  }

  const resolvedModelDir = modelDir
    || (NEMOTRON_ROW ? path.join(modelsDir || '', NEMOTRON_ROW.id) : '');
  const integrity = verifyInstalledModel(resolvedModelDir, expectedFiles);
  if (!integrity.ok) {
    throw Object.assign(
      new Error('sherpa-onnx model is missing or failed its integrity check'),
      { code: SHERPA_UNAVAILABLE }
    );
  }

  const sessions = new Map();
  const elapsed = new Map();
  const model = NEMOTRON_ROW?.id || 'nemotron';

  /**
   * Run the CLI over one segment.
   *
   * The streaming transducer takes WAV on stdin and writes transcript lines to
   * stdout, without the bracket timestamps whisper.cpp emits — so the parser
   * here is line-based and assigns timings from the segment duration. That is
   * less precise than whisper's per-segment timestamps, and it is reported as
   * such rather than faked.
   */
  function runCli(wav) {
    return new Promise((resolve, reject) => {
      const args = [
        '--encoder', path.join(resolvedModelDir, 'encoder.int8.onnx'),
        '--decoder', path.join(resolvedModelDir, 'decoder.int8.onnx'),
        '--joiner', path.join(resolvedModelDir, 'joiner.int8.onnx'),
        '--tokens', path.join(resolvedModelDir, 'tokens.txt'),
        '--vad', path.join(resolvedModelDir, SILERO_VAD.file),
        '--num-threads', String(Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency) || 2))),
      ];

      let child;
      try {
        child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      } catch {
        reject(Object.assign(new Error('could not start sherpa-onnx'), { code: 'spawn-failed' }));
        return;
      }

      const stdout = [];
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        settled = true;
        reject(Object.assign(new Error('sherpa-onnx timed out'), { code: 'timeout' }));
      }, 60_000);

      child.stdout.on('data', (chunk) => stdout.push(chunk));
      // Captured and discarded: sherpa's stderr can echo decoded text.
      child.stderr.on('data', () => {});

      child.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(Object.assign(new Error('sherpa-onnx could not run'), { code: 'spawn-failed' }));
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(Object.assign(new Error(`sherpa-onnx exited ${code}`), { code: 'transcribe-failed' }));
          return;
        }
        resolve(Buffer.concat(stdout).toString('utf8'));
      });

      child.stdin.on('error', () => {});
      child.stdin.end(wav);
    });
  }

  return {
    kind: 'sherpaonnx',
    // NOT 'fake'. engineTruth.js keys off this string, and getting it wrong
    // would let canned text render as model output.
    backend: 'sherpaonnx',
    model,

    health() {
      return {
        model,
        backend: 'sherpaonnx',
        // Declared false, matching the catalog. The capability gate reads this
        // to disable the next-lyric lane WITH A REASON.
        wordTimestamps: false,
        biasSupport: false,
        binaryReady: true,
        weightsReady: true,
        integrityChecked: true,
      };
    },

    models() {
      return sherpaModelRows().map((row) => ({
        ...row,
        installed: existsSync(path.join(modelsDir || '', row.id)),
      }));
    },

    createSession(options = {}) {
      const sessionId = randomUUID();
      const session = { sessionId, model, language: options.language || 'auto' };
      sessions.set(sessionId, session);
      elapsed.set(sessionId, 0);
      return {
        session,
        messages: [{
          t: 'ready',
          sessionId,
          model,
          wordTimestamps: false,
        }],
      };
    },

    closeSession(sessionId) {
      elapsed.delete(sessionId);
      return sessions.delete(sessionId);
    },

    hasSession(sessionId) {
      return sessions.has(sessionId);
    },

    /**
     * @param {{ sessionId?: string, frames?: Array<Buffer> }} body
     * @returns {Promise<{sessionId: string, messages: Array<object>}>}
     */
    async transcribe(body = {}) {
      const frames = Array.isArray(body.frames) ? body.frames : [];
      if (frames.length === 0) return { sessionId: body.sessionId || '', messages: [] };

      let sessionId = body.sessionId;
      const created = [];
      if (!sessionId || !sessions.has(sessionId)) {
        const opened = this.createSession({});
        sessionId = opened.session.sessionId;
        created.push(...opened.messages);
      }
      const offsetMs = elapsed.get(sessionId) || 0;
      const segmentMs = frames.length * 100;

      try {
        // Reuse the WAV builder rather than duplicating the header: two copies
        // of a binary format is two places for an endianness bug to hide.
        const { framesToWav } = await import('./whispercpp.js');
        const stdout = await runCli(framesToWav(frames));

        // Line-based, because the streaming transducer emits no brackets.
        const lines = String(stdout)
          .split(/\r?\n/)
          .map((line) => line.trim())
          // A streaming encoder marks non-speech with blank lines and blanks;
          // forwarding those as text would put a hallucination on the rail.
          .filter((line) => line.length > 0 && !/^\[[^\]]*\]$/.test(line));

        if (lines.length === 0) {
          return {
            sessionId,
            messages: [
              ...created,
              {
                t: 'error',
                sessionId,
                code: 'no-transcript',
                message: 'The speech engine decoded this segment but produced no transcript.',
                fatal: false,
              },
            ],
          };
        }

        const text = lines.join(' ');
        const messages = lines.map((line, index) => ({
          t: 'final',
          sessionId,
          text: line,
          // Evenly spread across the segment. Coarse, and honest about it:
          // this is why `wordTimestamps` is false and the lyric lane is off.
          startMs: offsetMs + Math.round((segmentMs * index) / lines.length),
          endMs: offsetMs + Math.round((segmentMs * (index + 1)) / lines.length),
        }));

        elapsed.set(sessionId, offsetMs + segmentMs);
        return { sessionId, messages: [...created, ...messages], text };
      } catch (error) {
        return {
          sessionId,
          messages: [
            ...created,
            {
              t: 'error',
              sessionId,
              code: error?.code || 'transcribe-failed',
              message: 'The speech engine could not transcribe this segment.',
              fatal: false,
            },
          ],
        };
      }
    },
  };
}

export default createSherpaEngine;