/**
 * NDI video-over-IP output — main-process module barrel.
 *
 * Feature #11 (missing-features report): alpha-channel lyrics over LAN into
 * vMix / TriCaster / ATEM. The lyricdisplay-ndi/ folder at repo root is a
 * stub with no app code, so this module lives with the real main process
 * and integrates with the existing output-settings + IPC patterns.
 *
 * Current scope: sender lifecycle per output, runtime detection, loopback
 * stub transport (default-OFF pref), 2s IPC heartbeat. Native SDK sender is
 * an explicit follow-up (see runtime.js NATIVE_SENDER_FOLLOW_UP).
 */
export { NDI_STATES, NDI_EVENTS, transition, isKnownNdiState, isLiveState, isSettledState, buildSnapshot } from './ndiStates.js';
export {
  detectNdiRuntime,
  isLoopbackAllowed,
  sanitizeSourceName,
  runtimeSummary,
  ALPHA_HANDLING_NOTE,
  NATIVE_SENDER_FOLLOW_UP,
  COMPANION_BINARY_ENV,
  NATIVE_SENDER_MODULE_ENV,
  LOOPBACK_TRANSPORT_ENV,
} from './runtime.js';
export { LoopbackTransport, tryLoadNativeSender, resolveTransport, RUNTIME_NOT_INSTALLED, NATIVE_SENDER_NOT_BUNDLED } from './transport.js';
export { createNdiSender, HANDSHAKE_POLLS } from './sender.js';
export { initNdiOutput, isValidNdiOutputKey, NDI_STATUS_CHANNEL, HEARTBEAT_MS } from './manager.js';
