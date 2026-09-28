/**
 * useAudioCapture.js — arm / mute / stop / teardown for Live Sermon Assist.
 *
 * INVARIANT: nothing in this file opens a microphone until arm() (or the
 * explicit runSelfTest()) is called by a user action. Auto-arm on mount is
 * FORBIDDEN: no effect here ever touches getUserMedia, AudioContext, or the
 * AudioWorklet. And arm() refuses to run while the store's master switch is
 * off — capture must never arm while the feature is disabled.
 *
 * Teardown is the load-bearing part: a stuck mic after the window closes is
 * the kind of bug that loses a church's trust permanently. pagehide,
 * beforeunload and visibilitychange all tear down, unmount tears down, and
 * turning the feature off tears down — every listener registered here is
 * removed in cleanup.
 *
 * Nothing captured here leaves the renderer: frames go to the optional
 * onFrame callback and nowhere else. Phase 2 wires the WebSocket.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import useSpeechStore from '../context/SpeechStore';
import { useAudioDevices } from './useAudioDevices';
import { loadPcmWorklet, createCaptureGraph } from '../workers/pcmCapture';

/** Smoothing for the VU meter: fast attack, slow release. */
const LEVEL_ATTACK = 0.4;
const LEVEL_RELEASE = 0.15;

/** How long stop() waits for the flushed tail frame to round-trip back. */
const FLUSH_SETTLE_MS = 25;

const describeError = (err, fallback) => {
  if (!err) return fallback;
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    return 'Microphone access was denied. Enable it in your system settings, then retry.';
  }
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    return 'No microphone was found on this computer. Connect an input, then retry.';
  }
  return err.message || fallback;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{onFrame?: Function, onMeter?: Function,
 *          devices?: ReturnType<typeof useAudioDevices>}} [options]
 *   onFrame — receives { pcm, samples, rms, peak, clipped } per 100 ms frame.
 *             Never forwarded anywhere else (Phase 2 wires the transport).
 *   devices — optional shared useAudioDevices instance (the picker passes
 *             its own so arming does not re-run the permission probe).
 */
export function useAudioCapture(options = {}) {
  const { onFrame, onMeter, devices: externalDevices } = options;

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onMeterRef = useRef(onMeter);
  onMeterRef.current = onMeter;

  // Always call the hook (rules of hooks); when an external instance is
  // provided this internal one simply stays cold at 'idle' forever.
  const internalDevices = useAudioDevices();
  const devicesApi = externalDevices || internalDevices;
  const devicesRef = useRef(devicesApi);
  devicesRef.current = devicesApi;

  const [level, setLevel] = useState(0);
  const [clipped, setClipped] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [muted, setMuted] = useState(false);

  // Exactly one capture session at a time: arming stops any self-test, and
  // a self-test is refused while armed. One stream/context/graph triple
  // means one teardown path to get right.
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const graphRef = useRef(null);
  const busyRef = useRef(false);
  const capturingRef = useRef(false);
  const testingRef = useRef(false);
  const testTimerRef = useRef(null);
  const teardownRef = useRef(() => {});

  const clearTestTimer = useCallback(() => {
    if (testTimerRef.current !== null) {
      clearTimeout(testTimerRef.current);
      testTimerRef.current = null;
    }
  }, []);

  /** Idempotent release of every audio resource. Synchronous on purpose so
   *  pagehide teardown does not depend on a promise resolving. Setters are
   *  unconditional (React bails out on identical values) so every historical
   *  closure of this function behaves identically. */
  const releaseAll = useCallback(() => {
    clearTestTimer();

    if (graphRef.current) {
      try {
        graphRef.current.destroy();
      } catch {
        /* already gone */
      }
      graphRef.current = null;
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream && typeof stream.getTracks === 'function') {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* track already ended */
        }
      }
    }

    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed' && typeof context.close === 'function') {
      try {
        const closing = context.close();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch {
        /* context already closed */
      }
    }

    capturingRef.current = false;
    testingRef.current = false;
    setCapturing(false);
    setTesting(false);
    setMuted(false);
    setLevel(0);
    setClipped(false);
  }, [clearTestTimer]);

  /** Meters arrive from the worklet (~32 ms cadence); smooth for the VU. */
  const handleMeter = useCallback((meter) => {
    const rms = Math.min(1, Math.max(0, Number(meter?.rms) || 0));
    setLevel((prev) => (rms > prev ? prev + (rms - prev) * LEVEL_ATTACK : prev + (rms - prev) * LEVEL_RELEASE));
    setClipped(meter?.clipped === true);
  }, []);

  /** Stop the capture session (or self-test) without touching `enabled`. */
  const teardown = useCallback(() => {
    releaseAll();
    const store = useSpeechStore.getState();
    store.setStatus('idle');
  }, [releaseAll]);
  teardownRef.current = teardown;

  /**
   * Open the mic and start producing frames.
   * Returns {ok:true} or {ok:false, reason} — never throws.
   */
  const arm = useCallback(async () => {
    const store = useSpeechStore.getState();
    // THE GUARANTEE: no microphone access while the feature is off. Checked
    // before anything else — not even a permission prompt may fire.
    if (store.enabled !== true) return { ok: false, reason: 'disabled' };
    if (busyRef.current) return { ok: false, reason: 'busy' };
    if (capturingRef.current) return { ok: true, reason: 'already-armed' };

    busyRef.current = true;
    store.setStatus('starting');
    try {
      // Self-test holds the single session slot; give it up first.
      releaseAll();

      const permission = await devicesRef.current.requestPermission();
      if (!permission.ok) {
        const current = useSpeechStore.getState();
        current.setLastError(
          permission.reason === 'denied'
            ? 'Microphone access was denied. Enable it in your system settings, then retry.'
            : 'Microphone permission could not be granted, so Sermon Assist cannot listen.'
        );
        current.setStatus('error');
        return { ok: false, reason: permission.reason || 'permission' };
      }

      // Open the remembered source by stable id; when it is missing we
      // intentionally omit deviceId so Chromium opens the system default —
      // the picker's fallbackNote tells the operator we did that.
      const rememberedId = useSpeechStore.getState().audio.sourceId;
      const remembered = rememberedId
        ? devicesRef.current.devices.find((d) => d.deviceId === rememberedId)
        : null;

      const constraints = {
        audio: {
          // This is a speech feed going to an ASR model: browser-side echo
          // cancellation, noise suppression and auto gain all reshape the
          // signal and make transcription worse. The sanctuary's real mic
          // chain already did the mixing; the model gets the raw feed.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };
      if (remembered) constraints.audio.deviceId = { exact: rememberedId };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const AudioContextCtor =
        typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
      if (!AudioContextCtor) {
        throw new Error('Web Audio is not available in this window, so the sermon microphone cannot be opened.');
      }
      // Ask for 16 kHz so no conversion is needed; if the browser refuses,
      // the worklet decimates down from whatever rate we get.
      const context = new AudioContextCtor({ sampleRate: 16000 });
      contextRef.current = context;

      await loadPcmWorklet(context);
      const sourceNode = context.createMediaStreamSource(stream);
      const graph = createCaptureGraph({
        audioContext: context,
        sourceNode,
        onFrame: (frame) => {
          if (typeof onFrameRef.current === 'function') onFrameRef.current(frame);
        },
        onMeter: (meter) => {
          handleMeter(meter);
          if (typeof onMeterRef.current === 'function') onMeterRef.current(meter);
        },
      });
      graphRef.current = graph;

      capturingRef.current = true;
      setCapturing(true);
      useSpeechStore.getState().setStatus('listening');
      return { ok: true, sampleRate: context.sampleRate };
    } catch (err) {
      releaseAll();
      const message = describeError(err, 'Could not open the microphone.');
      const current = useSpeechStore.getState();
      current.setLastError(message);
      current.setStatus('error');
      return { ok: false, reason: 'error', error: message };
    } finally {
      busyRef.current = false;
    }
  }, [handleMeter, releaseAll]);

  /** Suspend the context: no process() calls, so no frames — mic stays open. */
  const mute = useCallback(async () => {
    const context = contextRef.current;
    if (!context || context.state === 'closed') return { ok: false, reason: 'not-capturing' };
    try {
      if (context.state === 'running') await context.suspend();
      setMuted(true);
      setLevel(0);
      setClipped(false);
      return { ok: true };
    } catch (err) {
      const message = describeError(err, 'Could not mute the microphone.');
      useSpeechStore.getState().setLastError(message);
      useSpeechStore.getState().setStatus('error');
      return { ok: false, reason: 'error', error: message };
    }
  }, []);

  const unmute = useCallback(async () => {
    const context = contextRef.current;
    if (!context || context.state === 'closed') return { ok: false, reason: 'not-capturing' };
    try {
      if (context.state === 'suspended') await context.resume();
      setMuted(false);
      return { ok: true };
    } catch (err) {
      const message = describeError(err, 'Could not resume the microphone.');
      useSpeechStore.getState().setLastError(message);
      useSpeechStore.getState().setStatus('error');
      return { ok: false, reason: 'error', error: message };
    }
  }, []);

  /**
   * Stop capturing: flush the pending partial frame first (so stopping
   * mid-sentence does not truncate the last word), then release everything.
   */
  const stop = useCallback(async () => {
    const wasActive = !!(graphRef.current || streamRef.current);
    if (graphRef.current) {
      try {
        graphRef.current.flush();
        await delay(FLUSH_SETTLE_MS);
      } catch {
        /* worklet already gone */
      }
    }
    teardownRef.current();
    return { ok: true, wasActive };
  }, []);

  /**
   * Three seconds of level metering WITHOUT arming transcription: opens the
   * device, reports meters to the VU state, and auto-releases at 3000 ms —
   * so the operator can find a working input before the service rather than
   * during it. Store status is untouched (nothing is listening); only the
   * device is briefly open.
   */
  const runSelfTest = useCallback(
    async (deviceId, opts = {}) => {
      const durationMs = Number.isFinite(opts.durationMs) ? opts.durationMs : 3000;
      const store = useSpeechStore.getState();
      if (store.enabled !== true) return { ok: false, reason: 'disabled' };
      if (busyRef.current) return { ok: false, reason: 'busy' };
      if (capturingRef.current) return { ok: false, reason: 'capturing' };
      if (testingRef.current) return { ok: true, reason: 'already-testing' };

      busyRef.current = true;
      try {
        releaseAll();
        const constraints = {
          audio: {
            // Same rationale as arm(): raw feed, no browser processing.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        };
        if (deviceId) constraints.audio.deviceId = { exact: deviceId };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const AudioContextCtor =
          typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
        if (!AudioContextCtor) {
          throw new Error('Web Audio is not available in this window, so the input cannot be tested.');
        }
        const context = new AudioContextCtor({ sampleRate: 16000 });
        contextRef.current = context;
        await loadPcmWorklet(context);
        const sourceNode = context.createMediaStreamSource(stream);
        const graph = createCaptureGraph({
          audioContext: context,
          sourceNode,
          onMeter: handleMeter,
        });
        graphRef.current = graph;

        testingRef.current = true;
        setTesting(true);
        testTimerRef.current = setTimeout(() => {
          testTimerRef.current = null;
          // Auto-stop: release synchronously so fake-timer tests (and the
          // real 3-second deadline) never leave the device open.
          releaseAll();
        }, durationMs);
        return { ok: true, durationMs };
      } catch (err) {
        releaseAll();
        const message = describeError(err, 'Could not test this input.');
        const current = useSpeechStore.getState();
        current.setLastError(message);
        current.setStatus('error');
        return { ok: false, reason: 'error', error: message };
      } finally {
        busyRef.current = false;
      }
    },
    [handleMeter, releaseAll]
  );

  const stopSelfTest = useCallback(() => {
    if (!testingRef.current && !graphRef.current) return { ok: false, reason: 'not-testing' };
    releaseAll();
    return { ok: true };
  }, [releaseAll]);

  /** Live MediaStreamTracks under our control right now (0 = mic is free). */
  const getLiveTrackCount = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || typeof stream.getTracks !== 'function') return 0;
    return stream.getTracks().filter((track) => track.readyState === 'live').length;
  }, []);

  // Window-lifecycle teardown. Registered once per mount, removed in
  // cleanup, and unmount itself tears down — a hidden or closing window
  // must never keep a hot mic.
  useEffect(() => {
    const onPageHide = () => teardownRef.current();
    const onBeforeUnload = () => teardownRef.current();
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) teardownRef.current();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Unmount must never leave a hot mic behind.
      teardownRef.current();
    };
  }, []);

  // Master switch turned off while a session was open → release it. We only
  // ever read `enabled`; capture code must never flip it.
  const enabled = useSpeechStore((state) => state.enabled);
  useEffect(() => {
    if (enabled === false && (capturingRef.current || testingRef.current || streamRef.current)) {
      teardownRef.current();
    }
  }, [enabled]);

  return {
    arm,
    mute,
    unmute,
    stop,
    teardown,
    runSelfTest,
    stopSelfTest,
    getLiveTrackCount,
    level,
    clipped,
    capturing,
    testing,
    muted,
    devices: devicesApi,
  };
}

export default useAudioCapture;
