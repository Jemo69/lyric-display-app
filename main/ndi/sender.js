/**
 * Per-output NDI sender lifecycle (main process).
 *
 * One sender per output (output1 / output2 / stage / custom_*). The sender
 * owns a real state machine (see ndiStates.js): every heartbeat snapshot it
 * produces reflects actual transport state, never a canned value.
 *
 * Handshake is tick-driven, not timer-driven: enable() moves stopped/error
 * -> starting and starts the transport; the manager's 2s heartbeat calls
 * tick(), and the first successful poll promotes starting -> live. That
 * makes `starting` genuinely observable on the wire and keeps the whole
 * lifecycle deterministic under test (no sleeps, no fake timers).
 */

import createMainLogger from '../logger.js';
import {
  NDI_STATES,
  NDI_EVENTS,
  transition,
  buildSnapshot,
} from './ndiStates.js';
import { sanitizeSourceName, runtimeSummary } from './runtime.js';
import { resolveTransport } from './transport.js';

const log = createMainLogger('NDI-Sender');

export const HANDSHAKE_POLLS = 1;

export function createNdiSender({ outputKey, sourceName, deps = {} } = {}) {
  if (!outputKey) throw new Error('createNdiSender requires outputKey');

  const {
    detectRuntime = () => ({ available: false, kind: 'none' }),
    resolve = resolveTransport,
    isLoopback = () => false,
    now = () => Date.now(),
  } = deps;

  let name = sanitizeSourceName(sourceName || outputKey, `LyricDisplay ${outputKey}`);
  let state = NDI_STATES.STOPPED;
  let enabled = false;
  let transport = null;
  let transportKind = 'none';
  let runtime = runtimeSummary(detectRuntime());
  let error = null;
  let framesSent = 0;
  let fps = 0;
  let handshakePolls = 0;
  let lastChangeAt = now();
  let lastHeartbeatAt = null;

  function apply(event, detail = {}) {
    const next = transition(state, event);
    if (next !== state) {
      log.info(`NDI ${outputKey}: ${state} -> ${next} (${event})`);
      state = next;
      lastChangeAt = now();
    }
    if ('error' in detail) error = detail.error;
  }

  function snapshot() {
    return buildSnapshot({
      outputKey,
      sourceName: name,
      enabled,
      state,
      transportKind,
      runtime,
      framesSent,
      fps,
      error,
      lastChangeAt,
      lastHeartbeatAt,
    });
  }

  function stopTransportQuietly() {
    if (!transport) return;
    try {
      transport.stop();
    } catch (err) {
      log.warn(`NDI ${outputKey}: transport stop threw (non-fatal):`, err?.message || err);
    }
    transport = null;
    transportKind = 'none';
  }

  async function enable({ sourceName: nextName } = {}) {
    if (nextName) {
      name = sanitizeSourceName(nextName, name);
      try {
        transport?.rename?.(name);
      } catch {
        // rename is best-effort.
      }
    }
    if (state === NDI_STATES.LIVE) {
      enabled = true;
      return snapshot();
    }
    enabled = true;
    error = null;
    apply(NDI_EVENTS.ENABLE, { error: null });

    let detected = { available: false, kind: 'none' };
    try {
      detected = detectRuntime();
    } catch (err) {
      log.warn(`NDI ${outputKey}: runtime probe threw (non-fatal):`, err?.message || err);
    }
    runtime = runtimeSummary(detected);

    let resolution;
    try {
      resolution = await resolve({
        sourceName: name,
        runtime: detected,
        allowLoopback: isLoopback(),
      });
    } catch (err) {
      resolution = {
        kind: 'none',
        code: 'TRANSPORT_RESOLVE_FAILED',
        message: `NDI transport could not start (${err?.message || err}). Keeping NDI output off is safe.`,
      };
    }

    if (!resolution || resolution.kind === 'none' || !resolution.transport) {
      stopTransportQuietly();
      apply(NDI_EVENTS.START_FAILED, {
        error: { code: resolution?.code || 'UNKNOWN', message: resolution?.message || 'NDI transport unavailable.' },
      });
      return snapshot();
    }

    transport = resolution.transport;
    transportKind = resolution.kind;
    handshakePolls = 0;
    try {
      await transport.start();
    } catch (err) {
      stopTransportQuietly();
      apply(NDI_EVENTS.START_FAILED, {
        error: {
          code: 'TRANSPORT_START_FAILED',
          message: `NDI sender failed to start (${err?.message || err}). Keeping NDI output off is safe.`,
        },
      });
    }
    return snapshot();
  }

  function disable() {
    enabled = false;
    error = null;
    fps = 0;
    stopTransportQuietly();
    apply(NDI_EVENTS.DISABLE, { error: null });
    return snapshot();
  }

  /**
   * Called by the manager heartbeat (every 2s). Advances the handshake and
   * refreshes counters. Returns the fresh snapshot.
   */
  function tick() {
    if ((state === NDI_STATES.STARTING || state === NDI_STATES.LIVE) && transport) {
      let stats = null;
      try {
        stats = transport.poll();
      } catch (err) {
        log.warn(`NDI ${outputKey}: transport poll threw:`, err?.message || err);
        stats = { alive: false, framesSent, fps: 0 };
      }
      if (!stats || stats.alive !== true) {
        stopTransportQuietly();
        fps = 0;
        apply(NDI_EVENTS.TRANSPORT_DROPPED, {
          error: {
            code: 'TRANSPORT_DROPPED',
            message: 'NDI connection dropped. Turn NDI output off and on again, or keep it off — the app is unaffected.',
          },
        });
      } else {
        framesSent = Number.isFinite(stats.framesSent) ? stats.framesSent : framesSent;
        fps = Number.isFinite(stats.fps) ? stats.fps : fps;
        lastHeartbeatAt = now();
        if (state === NDI_STATES.STARTING) {
          handshakePolls += 1;
          if (handshakePolls >= HANDSHAKE_POLLS) {
            apply(NDI_EVENTS.STARTED);
          }
        }
      }
    }
    return snapshot();
  }

  function setSourceName(nextName) {
    name = sanitizeSourceName(nextName, name);
    try {
      transport?.rename?.(name);
    } catch {
      // best-effort.
    }
    return snapshot();
  }

  function dispose() {
    disable();
  }

  return {
    outputKey,
    enable,
    disable,
    tick,
    setSourceName,
    getSnapshot: snapshot,
    dispose,
  };
}
