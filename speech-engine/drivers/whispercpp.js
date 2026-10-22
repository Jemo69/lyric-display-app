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
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
 * transport produces is wrapped in a 44-byte canonical WAV header here, which
 * is a fixed-cost operation and removes an entire class of "why is it silent"
 * bugs.
 *
 * @param {Array<Buffer>} frames little-endian Int16, 16 kHz, mono
 * @returns {Buffer} a complete WAV file
 */
export function framesToWav(frames) {
  const buffers = (frames || []).filter((frame) => Buffer.isBuffer(frame) && frame.length > 0);

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
      });
    }
    match = pattern.exec(String(stdout ?? ''));
  }

  return segments;
}

/**
 * The on-disk file name for a catalog model id.
 *
 * THE NAME THAT MATTERS IS THE CATALOG'S `fileName`, NOT `${id}.bin`. The
 * downloader writes `modelPaths(modelsDir, model.fileName)` — i.e.
 * `ggml-tiny.en-q5_1.bin` — and `listInstalledModels` looks for that same name,
 * which is what lights the "installed" badge in the UI. This module used to
 * build `${modelId}.bin`, so the wizard could finish a download, the catalog
 * could mark the model installed, the user could select it, and the engine
 * would still report "weights not installed" and fall back to canned output:
 * `tiny.en-q5_1.bin` is a path nothing in this repo has ever created.
 *
 * Exported so a test can assert this agrees with the downloader for EVERY row
 * in the catalog. That per-row agreement is the invariant; asserting it once
 * would not have caught the class, and a catalog entry whose `fileName` does
 * not follow the `ggml-` pattern would slip through a prefix check.
 *
 * @param {string} modelId catalog id, or a file name ending in `.bin`
 * @returns {string|null} a plain file name, never a path
 */
export function weightsFileName(modelId) {
  if (typeof modelId !== 'string' || !modelId) return null;

  // A caller that already names a file gets it verbatim. The supervisor's
  // LD_SPEECH_MODEL is documented as a catalog id, but refusing an obvious
  // file name would be a trap rather than a safeguard.
  if (modelId.endsWith('.bin')) return path.basename(modelId);

  const row = WHISPER_ROWS.find((model) => model.id === modelId);
  return row && typeof row.fileName === 'string' && row.fileName
    ? path.basename(row.fileName)
    : `${path.basename(modelId)}.bin`;
}

/**
 * Resolve the weights file for a catalog model id.
 *
 * The catalog name is tried first because that is what an install produces.
 * `${id}.bin` is kept as a fallback: hand-placed drop-ins and this driver's
 * own fixtures use that shape, and renaming a user's file to match us would be
 * a worse answer than accepting both.
 *
 * @param {string} modelsDir
 * @param {string} modelId catalog id, or a file name ending in `.bin`
 * @returns {string|null} null when the file is absent or empty
 */
export function resolveWeights(modelsDir, modelId) {
  if (typeof modelsDir !== 'string' || !modelsDir || !modelId) return null;

  const fileName = weightsFileName(modelId);
  if (!fileName) return null;

  const candidates = [path.join(modelsDir, fileName)];
  if (!modelId.endsWith('.bin')) {
    candidates.push(path.join(modelsDir, `${path.basename(modelId)}.bin`));
  }

  for (const full of candidates) {
    if (!existsSync(full)) continue;
    try {
      // A zero-byte file is not a model: it is a failed or truncated install,
      // and whisper-cli would fail on it in a way that reads as a decoder bug.
      if (statSync(full).size > 0) return full;
    } catch {
      // Unreadable for any reason: try the next candidate.
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
      // WHY THERE IS A SCRATCH DIRECTORY AT ALL.
      //
      // whisper-cli prints its transcript to stdout ONLY when at least one
      // `--output-*` format is enabled. With `-f -` and no output format the
      // process reads the WAV, decodes it, prints nothing, and exits 0 — which
      // this driver would report as a successful, segment-less transcript. That
      // is the failure the re-verify above exists to prevent, one layer lower:
      // not a silent missing binary, a silent missing transcript.
      //
      // So `-otxt` is required, and `-otxt` needs a base name to write beside
      // it. Audio still travels on stdin and never lands on disk; only the
      // transcript text does, briefly, inside a private temp directory that is
      // removed before this promise settles. That trade is deliberate: the app
      // already persists transcripts by design (Decision D9, speechHistory),
      // while audio is never written anywhere.
      //
      // Enabling `-otxt` also removes the need for `-of -` and for the bogus
      // `-otxt 0` this used to pass. `-otxt` takes no value, so the `0` was
      // parsed as a second input file, the run failed with `error: input file
      // not found '0'`, and it exited 11. And `-nt` stripped the
      // `[hh:mm:ss.mmm --> hh:mm:ss.mmm]` prefix that parseSegments matches on,
      // so even a run that exited 0 yielded zero segments.
      let scratch;
      try {
        scratch = mkdtempSync(path.join(tmpdir(), 'ld-whisper-'));
      } catch (error) {
        reject(Object.assign(new Error('could not create a scratch directory for whisper.cpp'), {
          code: 'transcribe-failed',
        }));
        return;
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try {
          rmSync(scratch, { recursive: true, force: true });
        } catch {
          // Best effort: a temp directory left behind is not worth failing a
          // transcription over, and the OS reclaims it.
        }
      };

      const args = [
        '-m', weights,
        '-f', '-',            // read the WAV from stdin (audio never hits disk)
        '-np',                // no progress printing (it goes to stderr)
        '-l', language || 'auto',
        '-otxt',              // required for stdin mode to emit results at all
        '-of', path.join(scratch, 'transcript'),
      ];

      let child;
      try {
        child = spawn(path.join(binDir, binaryName()), args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          // No shell: the binary path and arguments are data, never a command
          // line. A model id from the catalog must never be able to become
          // shell syntax.
          shell: false,
        });
      } catch (error) {
        cleanup();
        reject(Object.assign(new Error('could not start whisper.cpp'), {
          code: 'spawn-failed',
        }));
        return;
      }

      const stdout = [];
      const stderr = [];
      let settled = false;

      // A runaway decoder must not hang a service. 60s is far beyond any
      // plausible segment; past that the child is killed and the segment is
      // reported as a failure rather than stalling every later segment too.
      const timer = setTimeout(() => {
        if (settled) return;
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        settled = true;
        cleanup();
        reject(Object.assign(new Error('whisper.cpp timed out'), { code: 'timeout' }));
      }, 60_000);

      child.stdout.on('data', (chunk) => stdout.push(chunk));
      // Captured, never printed: whisper's stderr can carry decoded text.
      child.stderr.on('data', (chunk) => stderr.push(chunk));

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(Object.assign(new Error('whisper.cpp could not run'), { code: 'spawn-failed' }));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Read stdout before cleanup, then remove the scratch directory on
        // EVERY path — success, non-zero exit, timeout, or spawn failure.
        const out = Buffer.concat(stdout).toString('utf8');
        cleanup();
        if (code !== 0) {
          reject(Object.assign(new Error(`whisper.cpp exited ${code}`), { code: 'transcribe-failed' }));
          return;
        }
        resolve(out);
      });

      child.stdin.on('error', () => { /* the close handler settles the promise */ });
      child.stdin.end(wav);
    });
  }

  return {
    kind: 'whispercpp',
    // NOT 'fake'. `engineTruth.js` keys off this exact string to decide whether
    // output is real transcription, so getting it wrong would let canned text
    // render as if it came from a model.
    backend: 'whispercpp',
    model,

    health() {
      return {
        model,
        backend: 'whispercpp',
        // Reported honestly rather than optimistically: the CLI gives segment
        // timestamps, not word ones.
        wordTimestamps: false,
        biasSupport: true,
        binaryReady: true,
        weightsReady: true,
      };
    },

    models() {
      return WHISPER_ROWS.map((row) => ({
        ...row,
        installed: Boolean(resolveWeights(modelsDir, row.id)),
      }));
    },

    createSession(options = {}) {
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
          // The capability the app's lane gate reads. False here means the
          // next-lyric lane is disabled WITH A STATED REASON rather than
          // silently producing worse suggestions.
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
     * Transcribe one buffered segment.
     *
     * Asynchronous by nature — the CLI is a child process. The contract's
     * caller (`wsTransport.finalize`) already handles a promise here, because
     * the fake engine returns synchronously and both shapes must work.
     *
     * @param {{ sessionId?: string, frames?: Array<Buffer> }} body
     * @returns {Promise<{ sessionId: string, messages: Array<object> }>|{...}}
     */
    async transcribe(body = {}) {
      const frames = Array.isArray(body.frames) ? body.frames : [];
      if (frames.length === 0) {
        return { sessionId: body.sessionId || '', messages: [] };
      }

      let sessionId = body.sessionId;
      const created = [];
      if (!sessionId || !sessions.has(sessionId)) {
        const opened = this.createSession({});
        sessionId = opened.session.sessionId;
        created.push(...opened.messages);
      }
      const session = sessions.get(sessionId);
      const offsetMs = elapsed.get(sessionId) || 0;

      try {
        const stdout = await runCli(framesToWav(frames), { language: session.language });
        const segments = parseSegments(stdout, sessionId, offsetMs);

        // A non-zero exit with zero parseable segments means the decoder ran and
        // produced nothing usable. Reporting that as silence would leave the
        // operator watching a "listening" badge and an empty transcript with no
        // idea whether the model is broken or the room is quiet.
        //
        // This is NOT an error when the segment genuinely contained no speech —
        // but that case is already decided upstream by the endpointing in
        // wsTransport, which never hands us a silent segment. So from here,
        // "decoded nothing" is a failure worth surfacing.
        if (segments.length === 0) {
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

        // Advance the session clock by the real duration of what was decoded,
        // so the second utterance's timestamps are not relative to nothing.
        const last = segments[segments.length - 1];
        if (last) elapsed.set(sessionId, offsetMs + (last.endMs - offsetMs));

        return { sessionId, messages: [...created, ...segments] };
      } catch (error) {
        // A code, never the error's text: whisper's own message can quote the
        // decoded audio.
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

export default createWhisperEngine;