/**
 * pcmWorklet.js — AudioWorklet processor for Live Sermon Assist (Phase 1).
 *
 * Loaded with `audioWorklet.addModule()` from src/workers/pcmCapture.js.
 *
 * ⚠ INVARIANT: this file executes in AudioWorkletGlobalScope. There are NO
 * imports here on purpose — a worklet cannot resolve the `shared` alias or
 * any npm module. The constants below are duplicated from
 * shared/speech/protocol.js, which is the source of truth; they are pinned
 * by tests/speech/protocol.test.js. If you change one, change both.
 *
 * Contract (shared/speech/protocol.js): 16 kHz mono, Int16 little-endian,
 * 100 ms frames = 1600 samples = 3200 bytes, posted back to back with no
 * header. Nothing is transmitted from here — the main thread forwards frames
 * (Phase 2 wires the WebSocket).
 *
 * Messages posted to the main thread:
 *   frame:  { pcm: Int16Array, samples: number, rms, peak, clipped }
 *   meter:  { rms, peak, clipped }            (no `pcm` — mid-frame VU updates)
 *
 * Messages accepted on this.port:
 *   { type: 'flush' }  → emit the pending partial frame, zero-padded, so a
 *                        stop mid-frame does not truncate the last word.
 */

/* global AudioWorkletProcessor, registerProcessor, sampleRate */

// Duplicated from shared/speech/protocol.js — see the header comment.
const TARGET_SAMPLE_RATE = 16000;
const SAMPLES_PER_FRAME = 1600;

// VU cadence: post a meter message roughly every 32 ms of audio (~31 msgs/s),
// so the rail's meter animates several times inside one 100 ms frame without
// flooding the port with one message per 128-sample render quantum.
const METER_INTERVAL_SAMPLES = 512;

// |sample| at or above this counts as clipped for the indicator. The int16
// encode clamps at ±1.0; 0.999 is "close enough to full scale to be audible
// distortion" for a level meter.
const CLIP_THRESHOLD = 0.999;

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // The AudioContext normally requests 16 kHz (see useAudioCapture), but a
    // browser may refuse and hand us the device rate instead. Decimate when
    // that happens — see decimate() below.
    this.contextRate =
      typeof sampleRate === 'number' && sampleRate > 0 ? sampleRate : TARGET_SAMPLE_RATE;
    this.needsResample = this.contextRate !== TARGET_SAMPLE_RATE;
    // Source samples consumed per output sample (e.g. 48000/16000 = 3).
    this.step = this.contextRate / TARGET_SAMPLE_RATE;

    // Streaming linear-interpolation state. Mirrors the pure resampleLinear()
    // in src/workers/pcmCapture.js (which is unit-tested; this file cannot be
    // imported from tests because it needs AudioWorkletGlobalScope).
    //   prevSample — last raw sample of the previous quantum (null on the
    //                very first quantum; it becomes virtual index 0 next time)
    //   resamplePos — fractional read position in those virtual coordinates
    this.prevSample = null;
    this.resamplePos = 0;

    // 16 kHz frame accumulator: fixed-size buffer, emitted exactly full.
    this.frameBuf = new Float32Array(SAMPLES_PER_FRAME);
    this.frameLen = 0;
    this.frameSumSq = 0;
    this.framePeak = 0;
    this.frameClipped = false;

    this.meterCountdown = METER_INTERVAL_SAMPLES;

    this.port.onmessage = (event) => {
      const data = event && event.data;
      if (data && data.type === 'flush') this.flush();
    };
  }

  /**
   * Called once per render quantum (~128 frames). Never mutates the input;
   * `outputs` is deliberately left silent — this node captures, it does not
   * render to the speakers (playing the mic back would howl).
   */
  process(inputs) {
    const input = inputs[0];
    const channel = input && input.length > 0 ? input[0] : null;
    // Device went quiet or the node is disconnected: keep the processor
    // alive so a reconnect resumes without rebuilding the graph.
    if (!channel || channel.length === 0) return true;

    const chunk = this.needsResample ? this.decimate(channel) : channel;
    if (chunk.length > 0) this.appendToFrame(chunk);
    return true;
  }

  /**
   * Manual decimation: linear-interpolation resample of one quantum from
   * contextRate → 16 kHz, carrying fractional position and the previous
   * sample across quantum boundaries so no sample is duplicated or dropped
   * at the seams. Same algorithm as resampleLinear() in pcmCapture.js.
   */
  decimate(input) {
    const n = input.length;
    const hasPrev = this.prevSample !== null;
    const length = hasPrev ? n + 1 : n; // virtual array: [prev, ...input]
    const valueAt = (i) => (hasPrev ? (i === 0 ? this.prevSample : input[i - 1]) : input[i]);

    const out = new Float32Array(Math.floor((length - 1) / this.step) + 2);
    let written = 0;
    let pos = this.resamplePos;

    // A sample is emit-able while its interpolation pair fits in the virtual
    // array; the boundary pair is deferred to the next quantum, where the
    // carried prevSample makes it available again.
    while (pos < length - 1) {
      const index = Math.floor(pos);
      const frac = pos - index;
      const a = valueAt(index);
      const b = valueAt(index + 1);
      out[written] = a + (b - a) * frac;
      written += 1;
      pos += this.step;
    }

    this.resamplePos = pos - (length - 1);
    this.prevSample = input[n - 1];
    return out.subarray(0, written);
  }

  /** Copy 16 kHz samples into the current frame, emitting whenever it fills. */
  appendToFrame(chunk) {
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = chunk[i];
      const abs = sample < 0 ? -sample : sample;
      // Stats are computed on the clamped value so rms/peak stay in 0..1.
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      this.frameSumSq += clamped * clamped;
      if (clamped > this.framePeak) this.framePeak = clamped;
      if (abs >= CLIP_THRESHOLD) this.frameClipped = true;

      this.frameBuf[this.frameLen] = sample;
      this.frameLen += 1;
      if (this.frameLen === SAMPLES_PER_FRAME) {
        this.encodeAndPost(SAMPLES_PER_FRAME);
      }
    }

    this.meterCountdown -= chunk.length;
    if (this.meterCountdown <= 0) {
      this.postMeter(chunk);
      this.meterCountdown = METER_INTERVAL_SAMPLES;
    }
  }

  /** Mid-frame VU update: same stats, no `pcm` payload. */
  postMeter(chunk) {
    let sumSq = 0;
    let peak = 0;
    let clipped = false;
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = chunk[i];
      const abs = sample < 0 ? -sample : sample;
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      sumSq += clamped * clamped;
      if (clamped > peak) peak = clamped;
      if (abs >= CLIP_THRESHOLD) clipped = true;
    }
    this.port.postMessage({
      rms: Math.sqrt(sumSq / chunk.length),
      peak,
      clipped,
    });
  }

  /**
   * Encode the buffered samples (zero-padded to a full frame by the Int16Array
   * allocation) and post them. `realSamples` is how many of the 1600 slots
   * carry actual audio — SAMPLES_PER_FRAME normally, fewer on flush.
   */
  encodeAndPost(realSamples) {
    const pcm = new Int16Array(SAMPLES_PER_FRAME);
    for (let i = 0; i < this.frameLen; i += 1) {
      const sample = this.frameBuf[i];
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      const scaled = clamped * 32767;
      // Round half away from zero so the mapping stays symmetric around 0
      // (Math.round rounds .5 toward +Infinity). Mirrors encodePcmFrame() in
      // shared/speech/protocol.js — keep in sync.
      pcm[i] = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
    }
    this.port.postMessage({
      pcm,
      samples: realSamples,
      rms: realSamples > 0 ? Math.sqrt(this.frameSumSq / realSamples) : 0,
      peak: this.framePeak,
      clipped: this.frameClipped,
    });
    this.frameLen = 0;
    this.frameSumSq = 0;
    this.framePeak = 0;
    this.frameClipped = false;
  }

  /** { type: 'flush' } — emit the partial tail so the last word survives. */
  flush() {
    if (this.frameLen === 0) return;
    this.encodeAndPost(this.frameLen);
  }
}

registerProcessor('pcm-processor', PCMProcessor);
