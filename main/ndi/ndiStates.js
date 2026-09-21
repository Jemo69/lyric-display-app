/**
 * NDI sender state machine (main process, dependency-free).
 *
 * States mirror what the booth actually needs to know:
 *   stopped  — NDI output is off for this output. Safe default.
 *   starting — enable requested, transport handshake in flight.
 *   live     — transport confirmed frames are flowing.
 *   error    — start failed or the transport dropped. Carries { code, message }.
 *
 * No fake behavior: the heartbeat broadcast by main/ndi/manager.js reports
 * this machine's real state. In this PR the only shippable transports are a
 * local loopback (opt-in via LYRICDISPLAY_NDI_TRANSPORT=loopback, for dev/CI)
 * and the native-sender hook point (follow-up). With neither present, enable
 * honestly lands in `error` with code RUNTIME_NOT_INSTALLED — the app keeps
 * running and the toggle stays safe to flip back off.
 */

export const NDI_STATES = Object.freeze({
  STOPPED: 'stopped',
  STARTING: 'starting',
  LIVE: 'live',
  ERROR: 'error',
});

export const NDI_EVENTS = Object.freeze({
  ENABLE: 'enable',
  STARTED: 'started',
  START_FAILED: 'start-failed',
  DISABLE: 'disable',
  TRANSPORT_DROPPED: 'transport-dropped',
});

const TRANSITIONS = Object.freeze({
  [NDI_STATES.STOPPED]: Object.freeze({
    [NDI_EVENTS.ENABLE]: NDI_STATES.STARTING,
  }),
  [NDI_STATES.STARTING]: Object.freeze({
    [NDI_EVENTS.STARTED]: NDI_STATES.LIVE,
    [NDI_EVENTS.START_FAILED]: NDI_STATES.ERROR,
    [NDI_EVENTS.TRANSPORT_DROPPED]: NDI_STATES.ERROR,
    [NDI_EVENTS.DISABLE]: NDI_STATES.STOPPED,
  }),
  [NDI_STATES.LIVE]: Object.freeze({
    [NDI_EVENTS.DISABLE]: NDI_STATES.STOPPED,
    [NDI_EVENTS.TRANSPORT_DROPPED]: NDI_STATES.ERROR,
  }),
  [NDI_STATES.ERROR]: Object.freeze({
    [NDI_EVENTS.ENABLE]: NDI_STATES.STARTING,
    [NDI_EVENTS.DISABLE]: NDI_STATES.STOPPED,
  }),
});

export function isKnownNdiState(state) {
  return Object.values(NDI_STATES).includes(state);
}

/**
 * Pure transition: unknown (state, event) pairs are no-ops and return the
 * current state, so stray or duplicate events can never corrupt the machine.
 */
export function transition(state, event) {
  const from = TRANSITIONS[state];
  if (!from) return NDI_STATES.STOPPED;
  return from[event] || state;
}

export function isLiveState(state) {
  return state === NDI_STATES.LIVE;
}

export function isSettledState(state) {
  return state === NDI_STATES.STOPPED || state === NDI_STATES.LIVE || state === NDI_STATES.ERROR;
}

/**
 * Presence-ready snapshot. Field names are chosen so the P03 presence
 * system (feature #03 follow-up) can consume `ndi:status` payloads without
 * reshaping: outputKey, state, sourceName, fps, lastHeartbeatAt.
 */
export function buildSnapshot({
  outputKey,
  sourceName = '',
  enabled = false,
  state = NDI_STATES.STOPPED,
  transportKind = 'none',
  runtime = { available: false, kind: 'none' },
  framesSent = 0,
  fps = 0,
  error = null,
  lastChangeAt = null,
  lastHeartbeatAt = null,
} = {}) {
  return {
    outputKey,
    sourceName,
    enabled: Boolean(enabled),
    state: isKnownNdiState(state) ? state : NDI_STATES.STOPPED,
    transportKind,
    runtime: {
      available: Boolean(runtime?.available),
      kind: runtime?.kind || 'none',
    },
    framesSent: Number.isFinite(framesSent) ? framesSent : 0,
    fps: Number.isFinite(fps) ? fps : 0,
    error: error ? { code: error.code || 'UNKNOWN', message: error.message || String(error) } : null,
    lastChangeAt,
    lastHeartbeatAt,
  };
}
