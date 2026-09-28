/**
 * pcmCapture.js — AudioWorklet loading, framing, and the capture graph for
 * Live Sermon Assist (Phase 1).
 *
 * This module is deliberately pure-ish: no getUserMedia here (device opening
 * lives in src/hooks/useAudioCapture.js), no sockets, no fetch — bytes are
 * produced and handed to a callback, nothing else. That keeps the whole
 * capture path unit-testable without an AudioContext.
 *
 * Wire contract (shared/speech/protocol.js): 16 kHz mono Int16 LE, 100 ms
 * frames = 1600 samples = 3200 bytes, back to back, no header.
 */

import { SAMPLE_RATE, SAMPLES_PER_FRAME, encodePcmFrame } from 'shared/speech';

// Vite rewrites this `?url` import into an emitted asset URL at build time
// (dist/assets/pcmWorklet-<hash>.js) and resolves it to the source URL in
// dev — which is exactly what audioWorklet.addModule() needs.
//
// Verified with a production build of this exact module under the repo's own
// Vite 7.2.6 binary + config subset: the worklet is emitted as a standalone
// asset (byte-identical to source, so no transform can break the
// AudioWorkletGlobalScope) and the entry chunk references it via
// `new URL("pcmWorklet-<hash>.js", import.meta.url)`. The app's own
// `npm run build` does not yet reach this module because AudioSourcePicker
// is not imported anywhere until a later wave wires it into the settings UI.
import pcmWorkletUrl from './pcmWorklet.js?url';

/** Processor name registered by src/workers/pcmWorklet.js. */
export const PCM_PROCESSOR_NAME = 'pcm-processor';

const AUDIO_WORKLET_UNAVAILABLE =
  'AudioWorklet is not available in this window, so the sermon microphone cannot be opened. ' +
  'Run LyricDisplay in its Electron window (a Chromium-based build with audioWorklet support) and retry.';

const AUDIO_WORKLET_NODE_UNAVAILABLE =
  'AudioWorkletNode is not available in this window, so the sermon microphone cannot be opened. ' +
  'Run LyricDisplay in its Electron window (a Chromium-based build with audioWorklet support) and retry.';

/**
 * Load the PCM worklet module into an AudioContext's worklet scope.
 *
 * @param {BaseAudioContext} audioContext
 * @returns {Promise<void>}
 * @throws {Error} with an actionable message when audioWorklet is missing
 */
export async function loadPcmWorklet(audioContext) {
  if (!audioContext || !audioContext.audioWorklet || typeof audioContext.audioWorklet.addModule !== 'function') {
    throw new Error(AUDIO_WORKLET_UNAVAILABLE);
  }
  await audioContext.audioWorklet.addModule(pcmWorkletUrl);
}

/**
 * Pure linear-interpolation resampler, input rate → output rate.
 *
 * This is the documented fallback for when the browser refuses
 * `new AudioContext({ sampleRate: 16000 })` and hands back the device rate
 * instead: the worklet decimates on the realtime thread using this same
 * algorithm (it cannot import this module — AudioWorkletGlobalScope has no
 * module resolution), so the two must stay equivalent.
 *
 * Linear interpolation, no low-pass filter: acceptable here because 48 kHz →
 * 16 kHz is a clean 3:1 decimation of an already band-limited mic signal and
 * the ASR model cares about speech intelligibility, not ultrasonic content.
 *
 * Pure: the input is never mutated and a fresh Float32Array is returned.
 * The output stops at the last input sample — no extrapolation past the end,
 * so upsampling yields (n-1) * toRate/fromRate + 1 samples.
 *
 * @param {Float32Array|ArrayLike<number>} inputFloat32
 * @param {number} fromRate source sample rate in Hz
 * @param {number} toRate target sample rate in Hz
 * @returns {Float32Array} resampled audio
 * @throws {Error} on non-positive rates
 */
export function resampleLinear(inputFloat32, fromRate, toRate) {
  const from = Number(fromRate);
  const to = Number(toRate);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
    throw new Error(`resampleLinear: rates must be positive numbers (got ${fromRate} → ${toRate})`);
  }
  if (!inputFloat32 || typeof inputFloat32.length !== 'number' || inputFloat32.length === 0) {
    return new Float32Array(0);
  }
  if (from === to) return Float32Array.from(inputFloat32);

  const n = inputFloat32.length;
  const step = from / to;
  const count = Math.floor((n - 1) / step) + 1;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const pos = i * step;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = inputFloat32[index];
    const b = index + 1 < n ? inputFloat32[index + 1] : inputFloat32[n - 1];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Encode a Float32 chunk into wire frames: an array of Int16Array views of
 * exactly SAMPLES_PER_FRAME samples each (3200 bytes), via encodePcmFrame
 * from shared/speech. This is the main-thread twin of the worklet's encoder;
 * the worklet emits production frames itself, and these tests pin the shared
 * semantics (clamp, half-away-from-zero rounding, zero-padded tail) because
 * AudioWorkletGlobalScope code cannot run under jsdom.
 *
 * A short final frame IS included, zero-padded by encodePcmFrame — same rule
 * as the worklet's flush(): stopping mid-frame never truncates the tail.
 * Empty input returns [].
 *
 * Pure: the input is never mutated.
 *
 * @param {Float32Array|ArrayLike<number>} float32Chunk
 * @returns {Int16Array[]} frames of exactly SAMPLES_PER_FRAME samples
 */
export function encodeFrames(float32Chunk) {
  if (!float32Chunk || typeof float32Chunk.length !== 'number' || float32Chunk.length === 0) {
    return [];
  }
  const frames = [];
  for (let offset = 0; offset < float32Chunk.length; offset += SAMPLES_PER_FRAME) {
    const end = Math.min(offset + SAMPLES_PER_FRAME, float32Chunk.length);
    const slice =
      typeof float32Chunk.subarray === 'function'
        ? float32Chunk.subarray(offset, end)
        : Array.prototype.slice.call(float32Chunk, offset, end);
    frames.push(encodePcmFrame(slice));
  }
  return frames;
}

/**
 * Build the capture graph: source → AudioWorkletNode(PCM_PROCESSOR_NAME),
 * with port messages fanned out to the supplied callbacks.
 *
 * The node is intentionally NOT connected to `audioContext.destination` —
 * this is a capture path; routing the mic to the speakers would howl in the
 * sanctuary.
 *
 * @param {{audioContext: BaseAudioContext, sourceNode: AudioNode,
 *          onFrame?: (frame: {pcm: Int16Array, samples: number, rms: number, peak: number, clipped: boolean}) => void,
 *          onMeter?: (meter: {rms: number, peak: number, clipped: boolean}) => void}} options
 * @returns {{node: AudioWorkletNode, flush: () => void, destroy: () => void}}
 * @throws {Error} when AudioWorkletNode is unavailable (jsdom / old browser)
 */
export function createCaptureGraph({ audioContext, sourceNode, onFrame, onMeter }) {
  if (typeof AudioWorkletNode === 'undefined') {
    throw new Error(AUDIO_WORKLET_NODE_UNAVAILABLE);
  }
  if (!audioContext) {
    throw new Error('createCaptureGraph: audioContext is required');
  }
  if (!sourceNode || typeof sourceNode.connect !== 'function') {
    throw new Error('createCaptureGraph: sourceNode is required');
  }

  const node = new AudioWorkletNode(audioContext, PCM_PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  let destroyed = false;

  // Frame messages carry `pcm`; meter messages do not. Correctness first:
  // the structured clone in postMessage already copies the Int16Array, so no
  // transfer list is needed (and none is used — a detached buffer would be a
  // nasty bug for the next reader).
  node.port.onmessage = (event) => {
    if (destroyed) return;
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;
    if (data.pcm !== undefined) {
      if (typeof onFrame === 'function') onFrame(data);
    } else if (typeof data.rms === 'number') {
      if (typeof onMeter === 'function') onMeter(data);
    }
  };

  sourceNode.connect(node);

  return {
    node,
    /** Ask the worklet to emit its pending partial frame (see flush()). */
    flush() {
      if (destroyed) return;
      node.port.postMessage({ type: 'flush' });
    },
    /** Idempotent: clears the port handler and disconnects everything. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      node.port.onmessage = null;
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
      try {
        sourceNode.disconnect(node);
      } catch {
        /* already disconnected */
      }
      try {
        if (typeof node.port.close === 'function') node.port.close();
      } catch {
        /* port already closed */
      }
    },
  };
}

/** The worklet module URL addModule() loads (exported for diagnostics/tests). */
export const PCM_WORKLET_URL = pcmWorkletUrl;

/** Nominal capture rate from the wire contract (re-exported for callers). */
export const TARGET_SAMPLE_RATE = SAMPLE_RATE;
