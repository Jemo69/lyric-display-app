/**
 * OSC hardware controller (main process, UDP listener).
 *
 * Drives Stream Deck via Companion and mixer surfaces (X32) over OSC with
 * token auth. Zero new dependencies: OSC 1.0 packets are decoded with a
 * minimal built-in parser over node:dgram (messages + bundles, int / float
 * / string / blob args). Crash-proofing is the top requirement:
 * - Missing/busy ports or malformed packets must NEVER prevent boot — the
 *   controller reports a clean disabled state with a settings note instead.
 * - The port is configurable; when the configured port is busy the
 *   controller probes ascending alternates before giving up.
 *
 * Settings persist via electron-store (`preferences`):
 *   osc.enabled, osc.port, osc.token
 */
import Store from 'electron-store';
import createMainLogger from './logger.js';
import {
  DEFAULT_OSC_PORT,
  OSC_COMMAND_ROUTES,
  OSC_PORT_PROBE_ATTEMPTS,
  decodeOscPackets,
  generateOscToken,
  isOscTokenValid,
  isValidOscPort,
  maskToken,
  parseOscCommand,
  validateOscPacket,
} from '../shared/hardwareCommands.js';

const log = createMainLogger('OSC');

const preferences = new Store({
  name: 'preferences',
  defaults: {
    osc: {
      enabled: false,
      port: DEFAULT_OSC_PORT,
      token: '',
    },
  },
});

function readPersisted() {
  let raw = null;
  try {
    raw = preferences.get('osc');
  } catch (error) {
    log.warn('Failed to read OSC preferences:', error?.message || error);
  }
  const obj = raw && typeof raw === 'object' ? raw : {};
  let token = typeof obj.token === 'string' ? obj.token : '';
  if (!token) {
    token = generateOscToken();
    try {
      preferences.set('osc', { ...obj, token });
    } catch { /* non-fatal; token stays in memory */ }
  }
  return {
    enabled: obj.enabled === true,
    port: isValidOscPort(obj.port) ? Number(obj.port) : DEFAULT_OSC_PORT,
    token,
  };
}

function persist(patch) {
  try {
    const current = readPersisted();
    preferences.set('osc', { ...current, ...patch });
  } catch (error) {
    log.warn('Failed to persist OSC preferences:', error?.message || error);
  }
}

// ------------------------------------------------------------ OSC decode ---
// Minimal OSC 1.0 decoding lives in shared/hardwareCommands.js
// (decodeOscPackets: messages + bundles, browser-safe, never throws).

/**
 * Create a UDP listener bound to `port`. `portFactory` is a test seam:
 * (port) => ({ open(), close(), onMessage(packet), onError(error),
 *               __emitPacket?(packet), __emitError?(error) }).
 */
async function createUdpListener(port, { portFactory }) {
  if (typeof portFactory === 'function') {
    return portFactory(port);
  }
  const { default: dgram } = await import('node:dgram');
  const socket = dgram.createSocket('udp4');
  let messageHandler = null;
  let errorHandler = null;
  let listeningHandler = null;
  socket.on('message', (msg) => {
    try {
      for (const packet of decodeOscPackets(msg)) {
        messageHandler?.(packet);
      }
    } catch (error) {
      log.warn('OSC datagram handling failed (non-fatal):', error?.message || error);
    }
  });
  socket.on('error', (error) => {
    try {
      errorHandler?.(error);
    } catch { /* ignore */ }
  });
  socket.on('listening', () => {
    try {
      listeningHandler?.();
    } catch { /* ignore */ }
  });
  return {
    open: () => socket.bind(port, '0.0.0.0'),
    close: () => {
      try {
        socket.close();
      } catch { /* ignore */ }
    },
    onMessage: (cb) => { messageHandler = cb; },
    onError: (cb) => { errorHandler = cb; },
    onListening: (cb) => { listeningHandler = cb; },
  };
}

export function createOscController({ onCommand, portFactory } = {}) {
  const emit = typeof onCommand === 'function' ? onCommand : () => {};
  const persisted = readPersisted();

  const state = {
    enabled: persisted.enabled,
    port: persisted.port,
    boundPort: null,
    token: persisted.token,
    listening: false,
    reason: null, // 'port-busy' | null
    lastCommand: null,
    lastError: null,
    rejectedCount: 0,
  };

  let listener = null;
  let started = false;
  let startGeneration = 0;

  function closeListener() {
    if (listener) {
      try {
        listener.close();
      } catch { /* ignore */ }
      listener = null;
    }
    state.listening = false;
    state.boundPort = null;
  }

  function handlePacket(packet) {
    let verdict = null;
    try {
      verdict = validateOscPacket(packet, state.token);
    } catch (error) {
      log.warn('OSC packet validation failed (non-fatal):', error?.message || error);
      return;
    }
    if (!verdict.ok) {
      state.rejectedCount += 1;
      if (verdict.reason === 'bad-token') {
        log.warn('OSC rejected: bad token. Check the token in Companion / X32.');
      } else {
        log.debug(`OSC ignored (${verdict.reason}): ${packet?.address}`);
      }
      return;
    }
    state.lastCommand = { command: verdict.command, at: Date.now(), source: 'osc' };
    try {
      emit(verdict.command, 'osc');
    } catch (error) {
      log.warn('OSC command dispatch failed (non-fatal):', error?.message || error);
    }
  }

  function tryBind(port, generation) {
    return new Promise((resolve) => {
      let candidate = null;
      let settled = false;
      const done = (ok) => {
        if (settled || generation !== startGeneration) return;
        settled = true;
        resolve(ok);
      };
      Promise.resolve()
        .then(() => createUdpListener(port, { portFactory }))
        .then((created) => {
          candidate = created;
          candidate.onError((error) => {
            const code = error?.code;
            state.lastError = error?.message || String(error);
            if (code === 'EADDRINUSE') {
              log.warn(`OSC port ${port} busy, probing next.`);
            } else {
              log.warn(`OSC listener error on :${port} (non-fatal):`, state.lastError);
            }
            try {
              candidate.close();
            } catch { /* ignore */ }
            done(false);
          });
          candidate.onMessage((packet) => handlePacket(packet));
          if (typeof candidate.onListening === 'function') {
            candidate.onListening(() => {
              if (generation !== startGeneration) {
                try { candidate.close(); } catch { /* ignore */ }
                done(false);
                return;
              }
              listener = candidate;
              state.listening = true;
              state.boundPort = port;
              state.reason = null;
              state.lastError = null;
              log.info(`OSC listening on UDP :${port} (${Object.keys(OSC_COMMAND_ROUTES).length} routes, token ${maskToken(state.token)}).`);
              done(true);
            });
          }
          try {
            candidate.open();
          } catch (error) {
            state.lastError = error?.message || String(error);
            log.warn(`OSC open failed on :${port} (non-fatal):`, state.lastError);
            done(false);
            return;
          }
          // Test-seam listeners never emit 'listening'; confirm next tick.
          if (typeof candidate.onListening !== 'function') {
            setImmediate(() => {
              if (generation !== startGeneration) return;
              listener = candidate;
              state.listening = true;
              state.boundPort = port;
              state.reason = null;
              state.lastError = null;
              done(true);
            });
          }
        })
        .catch((error) => {
          state.lastError = error?.message || String(error);
          log.warn(`OSC listener create failed on :${port} (non-fatal):`, state.lastError);
          done(false);
        });
    });
  }

  async function bindWithFallback() {
    const generation = ++startGeneration;
    closeListener();
    state.reason = null;
    const base = state.port;
    for (let attempt = 0; attempt <= OSC_PORT_PROBE_ATTEMPTS; attempt++) {
      const port = base + attempt;
      // eslint-disable-next-line no-await-in-loop
      const ok = await tryBind(port, generation);
      if (generation !== startGeneration) return false; // superseded
      if (ok) {
        if (attempt > 0) {
          state.lastError = `Port ${base} was busy; using ${port} instead.`;
        }
        return true;
      }
    }
    if (generation !== startGeneration) return false;
    state.reason = 'port-busy';
    state.lastError = `Ports ${base}–${base + OSC_PORT_PROBE_ATTEMPTS} are busy. Free one or pick another port.`;
    log.warn(`OSC disabled: ${state.lastError}`);
    return false;
  }

  // --- public API (never throws) -------------------------------------------

  function statusNote() {
    if (!state.enabled) return 'OSC remote control is off. Turn it on for Stream Deck (Companion) or X32.';
    if (state.reason === 'port-busy') {
      return state.lastError || 'OSC port is busy. Pick another port.';
    }
    if (!state.listening) {
      return state.lastError
        ? `OSC not listening: ${state.lastError}`
        : 'OSC starting…';
    }
    return `Listening on UDP :${state.boundPort}. Send OSC with your token as the first argument.`;
  }

  function getStatus({ includeToken = false } = {}) {
    return {
      feature: 'osc',
      supported: true, // node:dgram only — no native modules, always available
      enabled: state.enabled,
      listening: state.listening,
      port: state.port,
      boundPort: state.boundPort,
      token: includeToken ? state.token : undefined,
      tokenMasked: maskToken(state.token),
      routes: { ...OSC_COMMAND_ROUTES },
      lastCommand: state.lastCommand,
      lastError: state.lastError,
      rejectedCount: state.rejectedCount,
      reason: state.reason,
      note: statusNote(),
    };
  }

  async function setEnabled(enabled) {
    try {
      state.enabled = enabled === true;
      persist({ enabled: state.enabled });
      if (state.enabled) await bindWithFallback();
      else {
        startGeneration += 1; // cancel in-flight probes
        closeListener();
      }
    } catch (error) {
      log.warn('OSC setEnabled failed:', error?.message || error);
    }
    return getStatus();
  }

  async function setPort(port) {
    try {
      if (!isValidOscPort(port)) throw new Error('Port must be 1024–65535');
      state.port = Number(port);
      persist({ port: state.port });
      if (state.enabled) await bindWithFallback();
    } catch (error) {
      state.lastError = error?.message || String(error);
      log.warn('OSC setPort failed:', state.lastError);
    }
    return getStatus();
  }

  function regenerateToken() {
    try {
      state.token = generateOscToken();
      persist({ token: state.token });
      log.info(`OSC token regenerated (${maskToken(state.token)}). Update Companion / X32 buttons.`);
    } catch (error) {
      log.warn('OSC regenerateToken failed:', error?.message || error);
    }
    return getStatus({ includeToken: true });
  }

  async function start() {
    if (started) {
      if (state.enabled && !state.listening) await bindWithFallback();
      return getStatus();
    }
    started = true;
    try {
      if (state.enabled) await bindWithFallback();
    } catch (error) {
      log.warn('OSC start failed (non-fatal):', error?.message || error);
    }
    return getStatus();
  }

  async function stop() {
    started = false;
    startGeneration += 1;
    try {
      closeListener();
    } catch { /* ignore */ }
    return getStatus();
  }

  return {
    feature: 'osc',
    start,
    stop,
    getStatus,
    setEnabled,
    setPort,
    regenerateToken,
    // Test seams (no hardware required).
    __handleTestPacket: (packet) => handlePacket(packet),
    __getToken: () => state.token,
    __isTokenValid: (provided) => isOscTokenValid(provided, state.token),
  };
}

export function parseOscAddressForDocs(address) {
  return parseOscCommand(address);
}

export default createOscController;
