/**
 * NDI transport layer (main process).
 *
 * Transport interface (everything the sender needs, nothing more):
 *   start()            -> may throw; marks the source as publishable.
 *   poll()             -> { alive: boolean, framesSent: number, fps: number }
 *   stop()             -> must never throw; releases the source.
 *   rename(name)?      -> optional; updates the published source name.
 *
 * Two implementations exist in this PR:
 *   - LoopbackTransport: a REAL in-memory frame pump (counters advance on
 *     every poll, drops are reported). It drives the sender state machine
 *     through starting -> live -> stopped with genuine transitions, which is
 *     what the 2s heartbeat reports. Opt-in only via
 *     LYRICDISPLAY_NDI_TRANSPORT=loopback (dev/CI preview path).
 *   - Native sender hook (tryLoadNativeSender): loads an externally
 *     provided sender module implementing the interface above. Nothing is
 *     bundled in this PR — zero new native deps, CI/build stay green — so
 *     without the env-provided module this resolves to "not configured" and
 *     the sender reports RUNTIME_NOT_INSTALLED / NATIVE_SENDER_NOT_BUNDLED.
 */

import createMainLogger from '../logger.js';
import { NATIVE_SENDER_MODULE_ENV } from './runtime.js';

const log = createMainLogger('NDI-Transport');

// Simulated broadcast cadence for the loopback pump. The heartbeat ticks
// senders every 2s; 60 frames per tick ~= 30fps of loopback "video".
export const LOOPBACK_FRAMES_PER_POLL = 60;
export const LOOPBACK_FPS = 30;

export class LoopbackTransport {
  constructor({ sourceName = 'LyricDisplay' } = {}) {
    this.sourceName = sourceName;
    this.active = false;
    this.framesSent = 0;
    this.dropped = 0;
  }

  start() {
    if (this.active) return;
    this.active = true;
    log.info(`Loopback NDI source up: "${this.sourceName}"`);
  }

  poll() {
    if (!this.active) {
      return { alive: false, framesSent: this.framesSent, fps: 0 };
    }
    this.framesSent += LOOPBACK_FRAMES_PER_POLL;
    return { alive: true, framesSent: this.framesSent, fps: LOOPBACK_FPS };
  }

  stop() {
    try {
      this.active = false;
    } catch {
      // stop() must never throw.
    }
  }

  rename(sourceName) {
    if (sourceName) this.sourceName = sourceName;
  }
}

/**
 * Hook point for the native sender follow-up. Resolves an external sender
 * module path from LYRICDISPLAY_NDI_SENDER_MODULE and validates that it
 * exports a createTransport({ sourceName }) factory returning the transport
 * interface. Returns { ok, ... } — never throws.
 */
export async function tryLoadNativeSender({ env = process.env } = {}) {
  const spec = String(env?.[NATIVE_SENDER_MODULE_ENV] || '').trim();
  if (!spec) {
    return { ok: false, reason: 'sender-module-not-configured' };
  }
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line import/no-dynamic-require
    const mod = require(spec);
    const createTransport = mod?.createTransport || mod?.default?.createTransport;
    if (typeof createTransport !== 'function') {
      return { ok: false, reason: 'sender-module-invalid' };
    }
    return { ok: true, createTransport };
  } catch (error) {
    log.warn('Native NDI sender module failed to load (non-fatal):', error?.message || error);
    return {
      ok: false,
      reason: error?.code === 'MODULE_NOT_FOUND' ? 'sender-module-missing' : 'sender-module-error',
    };
  }
}

export const RUNTIME_NOT_INSTALLED = {
  code: 'RUNTIME_NOT_INSTALLED',
  message:
    'NDI runtime not installed. Install the free NDI Runtime on this PC, ' +
    'or keep NDI output off — the app works normally without it.',
};

export const NATIVE_SENDER_NOT_BUNDLED = {
  code: 'NATIVE_SENDER_NOT_BUNDLED',
  message:
    'NDI runtime found, but the native sender ships as a follow-up. ' +
    'Set LYRICDISPLAY_NDI_TRANSPORT=loopback to preview the pipeline, ' +
    'or keep NDI output off for now.',
};

/**
 * Picks the transport for an enable request. Never throws: failure is
 * reported as { kind: 'none', code, message } so the sender can land in
 * `error` with a volunteer-readable reason.
 */
export async function resolveTransport({ sourceName, runtime, allowLoopback = false, loadNative = tryLoadNativeSender } = {}) {
  if (allowLoopback) {
    return { kind: 'loopback', transport: new LoopbackTransport({ sourceName }) };
  }
  const native = await loadNative();
  if (native?.ok) {
    try {
      const transport = await native.createTransport({ sourceName });
      if (transport && typeof transport.start === 'function' && typeof transport.stop === 'function' && typeof transport.poll === 'function') {
        return { kind: 'native', transport };
      }
      return { kind: 'none', ...{ code: 'NATIVE_TRANSPORT_INVALID', message: 'Native NDI sender returned an unusable transport. Keeping NDI output off is safe.' } };
    } catch (error) {
      return { kind: 'none', code: 'NATIVE_TRANSPORT_FAILED', message: `Native NDI sender failed to start (${error?.message || error}). Keeping NDI output off is safe.` };
    }
  }
  if (runtime?.available) {
    return { kind: 'none', ...NATIVE_SENDER_NOT_BUNDLED };
  }
  return { kind: 'none', ...RUNTIME_NOT_INSTALLED };
}
