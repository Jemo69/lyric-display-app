/**
 * speech-engine/drivers/whispercpp.js — the real whisper.cpp driver (Phase 5).
 *
 * WHAT THIS IS. The executable adapter between the engine's existing v1
 * contract and a whisper.cpp binary. It implements exactly the surface
 * `fakeEngine.js` implements — `kind`, `backend`, `health()`, `models()`,
 * `createSession()`, `closeSession()`, `hasSession()`, `transcribe()` — so
 * everything above it (the supervisor, the HTTP server, the WebSocket
 * transport, the renderer's bridge) is unchanged when a real engine replaces
 * the canned one.
 *
 * WHY A SUBPROCESS AND NOT A NATIVE NODE ADDON. A prebuilt whisper.cpp CLI is
 * downloaded per platform, checksum-verified, and spawned as a child process.
 * That is deliberately the boring choice:
 *
 *   - No compiler on the user's machine. A native addon means Visual Studio C++
 *     on Windows, Python 3.12 + setuptools everywhere, and libfontconfig-dev on
 *     Linux. A church volunteer should never install a toolchain.
 *   - No ABI to break. An addon compiled against one Node major version is a
 *     crash on the next update; a CLI is a separate process with a pipe.
 *   - The crash surface is bounded. A segfaulting decoder kills a child, not the
 *     app. During a service that difference is the whole ballgame.
 *
 * THE TRADE, STATED PLAINLY. Subprocess IPC costs latency per segment — a few
 * milliseconds of pipe traffic against the seconds of inference — and it means
 * one model in memory at a time. For a sermon feed, where a segment is a
 * sentence and inference dominates, that is the right trade. It would not be
 * for streaming sub-100ms latency, which is not what this feature does.
 *
 * NO AUDIO EVER REACHES A LOG. Every failure path emits a CODE. Whisper's own
 * stderr is captured for diagnostics and never printed verbatim, because it can
 * carry the decoded prompt text.
 *
 * Capabilities are reported HONESTLY, and `wordTimestamps: false` here is not
 * a bug to paper over: the shipped CLI emits segment timestamps, not per-word
 * ones, so `lanesForCapabilities()` in src/speech/capabilities.js correctly
 * disables the next-lyric lane with a stated reason. That gate exists to tell
 * the truth about a provider; this driver is telling it.
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import catalog from '../../shared/speech/models.catalog.json' with { type: 'json' };

/** Sentinel returned when the binary or the weights are missing. */
export const ENGINE_UNAVAILABLE = 'unavailable';

/**
 * Sample rate the engine contract carries. Fixed by the protocol (16 kHz mono
 * Int16), and whisper.cpp will resample if handed anything else — so this is
 * the rate we hand it.
 */
const SAMPLE_RATE = 16000;

/** Rows this driver can serve, from the catalog's whispercpp provider. */
const WHISPER_ROWS = Object.freeze(
  (catalog.models || []).filter((model) => model.providerId === 'whispercpp')
);

/**
 * Resolve the platform's binary name.
 *
 * whisper.cpp publishes `whisper-cli` (or `whisper-cli.exe`) in every recent
 * release. Kept as one function so a release that renames it is a one-line
 * change rather than a search.
 *
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
export function binaryName(platform = process.platform) {
  return platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

/**
 * Is a usable binary present at `dir`?
 *
 * @param {string} dir
 * @returns {boolean}
 */
export function hasBinary(dir) {
  if (typeof dir !== 'string' || !dir) return false;
  const full = path.join(dir, binaryName());
  if (!existsSync(full)) return false;
  try {
    // A zero-byte file is a failed download, not an install. Treating it as
    // present is how a truncated transfer becomes a mysterious runtime crash.
    return statSync(full).size > 0;
  } catch {
    return false;
  }
}

/**
 * Concatenate the engine's Int16 PCM frames into one WAV file.
 *
 * WHY A WAV AND NOT RAW PCM. whisper.cpp's CLI reads WAV (and MP3/FLAC/etc.);
 * it does not read headerless PCM, because it needs the sample rate and channel
 * count to interpret the bytes at all. So the 16 kHz mono Int16 stream the
 * renderer sends over WebSocket gets a minimal 44-byte canonical WAV header
 * prepended before hitting stdin. No ffmpeg required, no temp files on disk.
 *
 * @param {Array<Buffer|Uint8Array>} frames
 * @returns {Buffer} complete WAV file
 */
export function framesToWav(frames) {
  const buffers = (Array.isArray(frames) ? frames : [])
    .filter(Boolean)
    .map((f) => {
      try {
        const buf = Buffer.isBuffer(f) ? f : Buffer.from(f);
        return buf.length % 2 === 0 ? buf : buf.subarray(0, buf.length - 1);
      } catch {
        return Buffer.alloc(0);
      }
    });

  // 44-byte canonical WAV: RIFF/WAVE/fmt/data, PCM 16-bit mono.
  const header = Buffer.alloc(44);
  const dataBytes = buffers.reduce((sum, frame) => sum + frame.length, 0);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4); // file size - 8
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate = rate * channels * 2
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);

  return Buffer.concat([header, ...buffers]);
}

/**
 * Parse whisper.cpp's stdout into segment messages.
 *
 * `whisper-cli` prints one `[00:00:00.000 --> 00:00:03.000]   text` line per
 * segment when `--output-json` is used, or the same bracketed lines on stdout
 * without it. This reads the bracket form, which both modes share, so the
 * driver does not depend on the JSON schema — which has changed between
 * whisper.cpp releases more than once.
 *
 * @param {string} stdout
 * @param {string} sessionId
 * @param {number} offsetMs when this segment starts within the service
 * @returns {Array<object>} contract messages
 */
export function parseSegments(stdout, sessionId, offsetMs = 0) {
  const segments = [];
  const pattern = /\[(\d+):(\d+):(\d+)\.(\d+)\s*-->\s*(\d+):(\d+):(\d+)\.(\d+)\]\s*(.+)/g;

  let match = pattern.exec(String(stdout ?? ''));
  while (match !== null) {
    const startMs = Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000
      + Number(match[4]);
    const endMs = Number(match[5]) * 3600000 + Number(match[6]) * 60000 + Number(match[7]) * 1000
      + Number(match[8]);
    const text = match[9].trim();

    // Whisper emits bracketed tokens for non-speech it has classified as
    // music or noise. Forwarding those as transcript text would put a
    // hallucination on the rail, so they are dropped here rather than
    // downstream where nothing would know why.
    if (text && !/^\[[^\]]+\]$/.test(text)) {
      segments.push({
        t: 'final',
        sessionId,
        text,
        startMs: offsetMs + startMs,
        endMs: offsetMs + endMs,
        confidence: 0.9,
      });
    }
    match = pattern.exec(String(stdout ?? ''));
  }

  return segments;
}

/**
 * Resolve the weights file for a catalog model id.
 *
 * @param {string} modelsDir
 * @param {string} modelId
 * @returns {string|null} null when the file is absent or empty
 */
export function resolveWeights(modelsDir, modelId) {
  if (typeof modelsDir !== 'string' || !modelsDir || !modelId) return null;
  const catalogModel = WHISPER_ROWS.find((m) => m.id === modelId);
  if (!catalogModel) return null;

  const candidates = [
    path.join(modelsDir, `${modelId}.bin`),
    path.join(modelsDir, `ggml-${modelId}.bin`),
    catalogModel.fileName ? path.join(modelsDir, catalogModel.fileName) : null,
  ].filter(Boolean);

  for (const full of candidates) {
    if (existsSync(full)) {
      try {
        if (statSync(full).size > 0) return full;
      } catch {
        // Unreadable / broken file -> try next candidate
      }
    }
  }
  return null;
}

/**
 * Create the whisper.cpp engine.
 *
 * @param {object} options
 * @param {import('../bus.js').MessageBus} options.bus
 * @param {string} options.binDir   where the verified binary lives
 * @param {string} options.modelsDir where the GGML weights live
 * @param {string} [options.modelId] catalog id; defaults to the catalog default
 * @returns {object} an engine implementing the v1 contract
 */
export function createWhisperEngine({ bus, binDir, modelsDir, modelId } = {}) {
  if (!hasBinary(binDir)) {
    throw Object.assign(new Error('whisper.cpp binary not installed'), { code: ENGINE_UNAVAILABLE });
  }

  const model = modelId || catalog.defaultModelId;
  const weights = resolveWeights(modelsDir, model);
  if (!weights) {
    throw Object.assign(new Error(`whisper.cpp weights not installed: ${model}`), {
      code: ENGINE_UNAVAILABLE,
    });
  }

  const sessions = new Map();
  /** Per-session clock, so segment timestamps advance across utterances. */
  const elapsed = new Map();
  /** Track running child processes to avoid zombie leaks on shutdown. */
  const activeChildren = new Set();
  /** FIFO queue for sequential transcription to enforce single-model concurrency. */
  let queue = Promise.resolve();

  function runCli(wav, { language }) {
    // RE-VERIFY BEFORE EVERY SPAWN.
    //
    // The constructor checks the binary exists, but it can stop existing
    // between construction and a segment arriving: an updater replacing the
    // directory mid-service, an antivirus quarantine, a failed repair. And the
    // failure is silent in a specific, bad way — on POSIX a zero-byte file with
    // the exec bit set is a valid executable that does nothing and exits 0, so
    // the driver would read "success" with no transcript and no error.
    //
    // Checked here rather than trusted from construction, because a mid-service
    // disappearance must be reported as a failure, not as silence.
    if (!hasBinary(binDir)) {
      return Promise.reject(
        Object.assign(new Error('whisper.cpp binary disappeared'), {
          code: ENGINE_UNAVAILABLE,
        })
      );
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-m', weights,
        '-f', '-',            // read the WAV from stdin
        '-np',                // no progress printing (it goes to stderr)
        '-l', language || 'auto',
        '-of', process.platform === 'win32' ? 'NUL' : '/dev/null',
      ];

      let child;
      try {
        child = spawn(path.join(binDir, binaryName()), args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });
        activeChildren.add(child);
      } catch (error) {
        reject(Object.assign(new Error('could not start whisper.cpp'), {
          code: 'spawn-failed',
        }));
        return;
      }

      const stdout = [];
      const stderr = [];
      let stderrBytes = 0;
      let settled = false;

      const cleanupChild = () => {
        activeChildren.delete(child);
      };

      // A runaway decoder must not hang a service. 60s is far beyond any
      // plausible segment; past that the child is killed and the segment is
      // reported as a failure rather than stalling every later segment too.
      const timer = setTimeout(() => {
        if (settled) return;
        cleanupChild();
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        settled = true;
        reject(Object.assign(new Error('whisper.cpp timed out'), { code: 'timeout' }));
      }, 60_000);

      child.stdout.on('data', (chunk) => stdout.push(chunk));
      // Captured, never printed: whisper's stderr can carry decoded text.
      // Capped to 64 KB to avoid unbounded memory growth.
      child.stderr.on('data', (chunk) => {
        if (stderrBytes < 65536) {
          stderr.push(chunk);
          stderrBytes += chunk.length;
        }
      });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        cleanupChild();
        clearTimeout(timer);
        reject(Object.assign(new Error('whisper.cpp could not run'), { code: 'spawn-failed' }));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanupChild();
        clearTimeout(timer);
        if (code !== 0) {
          reject(Object.assign(new Error(`whisper.cpp exited ${code}`), { code: 'transcribe-failed' }));
          return;
        }
        resolve(Buffer.concat(stdout).toString('utf8'));
      });

      child.stdin.on('error', () => { /* the close handler settles the promise */ });
      child.stdin.end(wav);
    });
  }

  function createSessionInternal(options = {}) {
    const sessionId = randomUUID();
    const session = {
      sessionId,
      model,
      language: options.language || 'auto',
    };
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
  }

  return {
    kind: 'whispercpp',
    backend: 'whispercpp',
    model,

    health() {
      return {
        model,
        backend: 'whispercpp',
        wordTimestamps: false,
        biasSupport: true,
        binaryReady: hasBinary(binDir),
        weightsReady: Boolean(resolveWeights(modelsDir, model)),
      };
    },

    models() {
      return WHISPER_ROWS.map((row) => ({
        ...row,
        installed: Boolean(resolveWeights(modelsDir, row.id)),
      }));
    },

    createSession: createSessionInternal,

    closeSession(sessionId) {
      elapsed.delete(sessionId);
      return sessions.delete(sessionId);
    },

    hasSession(sessionId) {
      return sessions.has(sessionId);
    },

    close() {
      for (const child of activeChildren) {
        try { child.kill('SIGKILL'); } catch {}
      }
      activeChildren.clear();
      sessions.clear();
      elapsed.clear();
    },

    /**
     * Transcribe one buffered segment sequentially.
     *
     * Asynchronous by nature — the CLI is a child process. Calls are queued
     * FIFO so only one whisper-cli process executes inference at any moment.
     *
     * @param {{ sessionId?: string, frames?: Array<Buffer> }} body
     * @returns {Promise<{ sessionId: string, messages: Array<object> }>}
     */
    transcribe(body = {}) {
      const task = async () => {
        const frames = Array.isArray(body.frames) ? body.frames : [];
        if (frames.length === 0) {
          return { sessionId: body.sessionId || '', messages: [] };
        }

        let sessionId = body.sessionId;
        const created = [];
        if (!sessionId || !sessions.has(sessionId)) {
          const opened = createSessionInternal({});
          sessionId = opened.session.sessionId;
          created.push(...opened.messages);
        }
        const session = sessions.get(sessionId);
        const offsetMs = elapsed.get(sessionId) || 0;

        const wav = framesToWav(frames);
        const audioDurationMs = Math.round(((wav.length - 44) / (SAMPLE_RATE * 2)) * 1000);

        try {
          const stdout = await runCli(wav, { language: session?.language });
          const segments = parseSegments(stdout, sessionId, offsetMs);

          if (segments.length === 0) {
            if (sessions.has(sessionId)) {
              elapsed.set(sessionId, offsetMs + audioDurationMs);
            }
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

          if (sessions.has(sessionId)) {
            const last = segments[segments.length - 1];
            const maxSegmentEnd = last ? last.endMs : offsetMs;
            elapsed.set(sessionId, Math.max(offsetMs + audioDurationMs, maxSegmentEnd));
          }

          return { sessionId, messages: [...created, ...segments] };
        } catch (error) {
          if (sessions.has(sessionId)) {
            elapsed.set(sessionId, offsetMs + audioDurationMs);
          }
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
      };

      const chained = queue.then(task, task);
      queue = chained.catch(() => {});
      return chained;
    },
  };
}

export default createWhisperEngine;
