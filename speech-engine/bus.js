/**
 * speech-engine/bus.js — the engine's message-emission seam.
 *
 * Every message the engine produces (ready / partial / final / vad /
 * progress / stats / error — see shared/speech/protocol.js MESSAGE_TYPES)
 * goes through ONE bus before it reaches any transport.
 *
 * WHY THIS FILE EXISTS (Phase 2 decision, recorded here and in README.md):
 * the v1 transport is WebSocket, but this scaffold ships with ZERO runtime
 * dependencies, so Phase 2 serves the REST surface over plain HTTP only.
 * A WebSocket transport must NOT require touching engine logic: it
 * subscribes to this bus (`bus.subscribe(wsSink)`) and forwards. Until then
 * index.js subscribes a parent-process mirror sink that forwards messages to
 * LyricDisplay's main process over the fork IPC channel, which relays them
 * to the renderer.
 *
 * Validation is on by default: an engine that emits a message failing
 * validateMessage() is a BUG, and it must fail loudly in tests rather than
 * ship an invalid message to the renderer.
 */
import { validateMessage } from '../shared/speech/protocol.js';

/**
 * Create a message bus.
 *
 * @param {Object} [options]
 * @param {boolean} [options.validate=true] validate every emitted message
 *   against the v1 schema and throw when it fails.
 * @returns {{ subscribe: (fn: (msg: object) => void) => () => void,
 *             emit: (msg: object) => object,
 *             subscriberCount: () => number }}
 */
export function createMessageBus({ validate = true } = {}) {
  const subscribers = new Set();

  return {
    subscribe(fn) {
      if (typeof fn !== 'function') throw new TypeError('bus.subscribe: expected a function');
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    emit(message) {
      if (validate) {
        const result = validateMessage(message);
        if (!result.ok) {
          const type = message && typeof message === 'object' ? message.t : typeof message;
          throw new Error(
            `speech-engine: refused to emit an invalid ${String(type)} message: ${result.errors.join('; ')}`
          );
        }
      }
      // Copy first: a subscriber may unsubscribe (or subscribe) during emit.
      for (const fn of [...subscribers]) {
        try {
          fn(message);
        } catch {
          // A broken transport sink must never take the engine down.
        }
      }
      return message;
    },

    subscriberCount: () => subscribers.size,
  };
}
