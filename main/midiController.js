/**
 * MIDI hardware controller (main process).
 *
 * Crash-proofing is the top requirement:
 * - The native MIDI driver (@julusian/midi) is an OPTIONAL lazy require.
 *   Missing module, failed load, busy ports, or absent hardware must NEVER
 *   prevent boot — the controller reports a clean disabled state instead.
 * - All public methods are sync-safe and never throw to callers.
 *
 * Mappings persist via electron-store (`preferences`):
 *   midi.enabled, midi.deviceName, midi.mappings
 */
import { createRequire } from 'module';
import Store from 'electron-store';
import createMainLogger from './logger.js';
import {
  DEFAULT_MIDI_MAPPINGS,
  HARDWARE_COMMANDS,
  describeMidiKey,
  describeMidiMessage,
  isValidMidiKey,
  normalizeHardwareCommand,
  midiMessageKey,
  parseMidiStatusByte,
  resolveMidiCommand,
  sanitizeMidiMappings,
} from '../shared/hardwareCommands.js';

const log = createMainLogger('MIDI');

const preferences = new Store({
  name: 'preferences',
  defaults: {
    midi: {
      enabled: false,
      deviceName: null,
      mappings: { ...DEFAULT_MIDI_MAPPINGS },
    },
  },
});

const DRIVER_PACKAGE = '@julusian/midi';

function loadDriver() {
  try {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line import/no-dynamic-require
    const driver = require(DRIVER_PACKAGE);
    if (!driver || typeof driver.Input !== 'function') {
      return { ok: false, reason: 'driver-invalid' };
    }
    return { ok: true, driver };
  } catch (error) {
    const code = error?.code === 'MODULE_NOT_FOUND' ? 'driver-missing' : 'driver-error';
    return { ok: false, reason: code, error };
  }
}

function readPersisted() {
  let raw = null;
  try {
    raw = preferences.get('midi');
  } catch (error) {
    log.warn('Failed to read MIDI preferences:', error?.message || error);
  }
  const obj = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: obj.enabled === true,
    deviceName: typeof obj.deviceName === 'string' && obj.deviceName ? obj.deviceName : null,
    mappings: sanitizeMidiMappings(obj.mappings),
  };
}

function persist(patch) {
  try {
    const current = readPersisted();
    preferences.set('midi', { ...current, ...patch });
  } catch (error) {
    log.warn('Failed to persist MIDI preferences:', error?.message || error);
  }
}

export function createMidiController({ onCommand } = {}) {
  const emit = typeof onCommand === 'function' ? onCommand : () => {};
  const persisted = readPersisted();

  const state = {
    enabled: persisted.enabled,
    deviceName: persisted.deviceName,
    mappings: persisted.mappings,
    connected: false,
    availablePorts: [],
    driverReason: null, // 'driver-missing' | 'driver-error' | 'no-devices' | null
    learnTarget: null,
    lastMessage: null,
    lastCommand: null,
    lastError: null,
  };

  let input = null;
  let driverRef = null;
  let started = false;

  function closeInput() {
    if (input) {
      try {
        if (typeof input.closePort === 'function') input.closePort();
      } catch (error) {
        log.warn('MIDI closePort failed (non-fatal):', error?.message || error);
      }
      try {
        if (typeof input.close === 'function') input.close();
      } catch { /* ignore */ }
      input = null;
    }
    state.connected = false;
  }

  function probePorts() {
    state.availablePorts = [];
    state.driverReason = null;
    const loaded = loadDriver();
    if (!loaded.ok) {
      driverRef = null;
      state.driverReason = loaded.reason;
      if (loaded.reason === 'driver-error') {
        log.warn('MIDI driver failed to load; MIDI disabled:', loaded.error?.message || loaded.error);
      } else {
        log.info('Optional MIDI driver not installed; MIDI controls disabled. Install @julusian/midi to enable.');
      }
      return false;
    }
    driverRef = loaded.driver;
    try {
      const probe = new driverRef.Input();
      const count = typeof probe.getPortCount === 'function' ? probe.getPortCount() : 0;
      const names = [];
      for (let i = 0; i < count; i++) {
        try {
          names.push(probe.getPortName(i));
        } catch { /* skip unreadable port */ }
      }
      try {
        if (typeof probe.close === 'function') probe.close();
      } catch { /* ignore */ }
      state.availablePorts = names;
      if (names.length === 0) state.driverReason = 'no-devices';
      return true;
    } catch (error) {
      state.driverReason = 'driver-error';
      state.lastError = error?.message || String(error);
      log.warn('MIDI port probe failed (non-fatal):', state.lastError);
      return false;
    }
  }

  function decodeMessage(bytes) {
    if (!Array.isArray(bytes) && !(bytes && typeof bytes.length === 'number')) return null;
    const arr = Array.from(bytes);
    if (arr.length < 1) return null;
    const { type, channel } = parseMidiStatusByte(arr[0]);
    if (!type || !channel) return null;
    if (type === 'cc') {
      return { type, channel, controller: arr[1], value: arr.length > 2 ? arr[2] : 1 };
    }
    return { type, channel, note: arr[1], velocity: arr.length > 2 ? arr[2] : 1 };
  }

  function handleRawMessage(_deltaTime, message) {
    let decoded = null;
    try {
      decoded = decodeMessage(message);
    } catch (error) {
      log.warn('MIDI decode failed (non-fatal):', error?.message || error);
      return;
    }
    if (!decoded) return;
    state.lastMessage = {
      ...decoded,
      label: describeMidiMessage(decoded),
      at: Date.now(),
    };

    // Learn mode: bind the next playable message to the armed command.
    if (state.learnTarget) {
      const key = midiMessageKey(decoded);
      if (!key) return; // ignore releases / unsupported while learning
      const target = state.learnTarget;
      state.learnTarget = null;
      try {
        setMapping(key, target);
        log.info(`MIDI learned: ${describeMidiKey(key)} -> ${target}`);
      } catch (error) {
        log.warn('MIDI learn persist failed:', error?.message || error);
      }
      return;
    }

    let command = null;
    try {
      command = resolveMidiCommand(decoded, state.mappings);
    } catch (error) {
      log.warn('MIDI resolve failed (non-fatal):', error?.message || error);
      return;
    }
    if (!command) return;
    state.lastCommand = { command, at: Date.now(), source: 'midi' };
    try {
      emit(command, 'midi');
    } catch (error) {
      log.warn('MIDI command dispatch failed (non-fatal):', error?.message || error);
    }
  }

  function openDevice() {
    closeInput();
    if (!driverRef) return false;
    const wanted = state.deviceName;
    let index = -1;
    let name = null;
    if (wanted) {
      index = state.availablePorts.indexOf(wanted);
      if (index === -1) {
        state.lastError = `Saved MIDI device not found: ${wanted}`;
        log.warn(`MIDI device "${wanted}" not present; staying disconnected.`);
        return false;
      }
      name = wanted;
    } else {
      if (state.availablePorts.length === 0) {
        state.driverReason = 'no-devices';
        return false;
      }
      index = 0;
      name = state.availablePorts[0];
    }
    try {
      input = new driverRef.Input();
      if (typeof input.ignoreTypes === 'function') {
        // Keep timing/clock out; we only care about voice messages.
        input.ignoreTypes(true, true, true);
      }
      input.on('message', handleRawMessage);
      input.openPort(index);
      state.connected = true;
      state.deviceName = name;
      state.lastError = null;
      log.info(`MIDI listening on "${name}" (${Object.keys(state.mappings).length} mappings).`);
      return true;
    } catch (error) {
      state.connected = false;
      state.lastError = error?.message || String(error);
      log.warn(`MIDI openPort failed for "${name}" (non-fatal):`, state.lastError);
      closeInput();
      return false;
    }
  }

  function refresh() {
    if (!state.enabled) {
      closeInput();
      state.learnTarget = null;
      return;
    }
    if (!probePorts()) {
      closeInput();
      return;
    }
    openDevice();
  }

  // --- public API (never throws) -------------------------------------------

  function getStatus() {
    return {
      feature: 'midi',
      supported: state.driverReason !== 'driver-missing' && state.driverReason !== 'driver-error',
      enabled: state.enabled,
      connected: state.connected,
      deviceName: state.deviceName,
      availablePorts: [...state.availablePorts],
      mappings: { ...state.mappings },
      learnTarget: state.learnTarget,
      lastMessage: state.lastMessage,
      lastCommand: state.lastCommand,
      lastError: state.lastError,
      reason: state.driverReason,
      note: statusNote(),
    };
  }

  function statusNote() {
    if (!state.enabled) return 'MIDI control is off. Turn it on to use a foot pedal or MIDI keys.';
    if (state.driverReason === 'driver-missing' || state.driverReason === 'driver-error') {
      return 'MIDI driver not installed. The app works normally without it — see Manual hardware steps.';
    }
    if (state.driverReason === 'no-devices' || state.availablePorts.length === 0) {
      return 'No MIDI devices found. Connect a pedal or keyboard, then Refresh.';
    }
    if (!state.connected) {
      return state.lastError
        ? `MIDI disconnected: ${state.lastError}`
        : 'MIDI device not connected. Pick a device below.';
    }
    return `Listening on ${state.deviceName}.`;
  }

  function setEnabled(enabled) {
    try {
      state.enabled = enabled === true;
      persist({ enabled: state.enabled });
      refresh();
      return getStatus();
    } catch (error) {
      log.warn('MIDI setEnabled failed:', error?.message || error);
      return getStatus();
    }
  }

  function setDevice(deviceName) {
    try {
      state.deviceName = typeof deviceName === 'string' && deviceName ? deviceName : null;
      persist({ deviceName: state.deviceName });
      if (state.enabled) refresh();
      return getStatus();
    } catch (error) {
      log.warn('MIDI setDevice failed:', error?.message || error);
      return getStatus();
    }
  }

  function setMapping(key, command) {
    const cmd = command == null ? null : normalizeHardwareCommand(command);
    if (command != null && !cmd) throw new Error(`Unknown command: ${command}`);
    if (!isValidMidiKey(key)) throw new Error(`Invalid MIDI key: ${key}`);
    const next = { ...state.mappings };
    if (cmd == null) {
      delete next[key];
    } else {
      next[key] = cmd;
    }
    state.mappings = sanitizeMidiMappings(next, {});
    // Never persist an empty map silently — keep at least what the user set.
    persist({ mappings: state.mappings });
    return getStatus();
  }

  function clearMapping(command) {
    const cmd = normalizeHardwareCommand(command);
    if (!cmd) throw new Error(`Unknown command: ${command}`);
    const next = { ...state.mappings };
    for (const key of Object.keys(next)) {
      if (next[key] === cmd) delete next[key];
    }
    state.mappings = next;
    persist({ mappings: state.mappings });
    if (state.learnTarget === cmd) state.learnTarget = null;
    return getStatus();
  }

  function resetMappings() {
    state.mappings = { ...DEFAULT_MIDI_MAPPINGS };
    state.learnTarget = null;
    persist({ mappings: state.mappings });
    return getStatus();
  }

  function startLearn(command) {
    const cmd = normalizeHardwareCommand(command);
    if (!cmd) throw new Error(`Unknown command: ${command}`);
    if (!HARDWARE_COMMANDS.includes(cmd)) throw new Error(`Unknown command: ${command}`);
    state.learnTarget = cmd;
    return getStatus();
  }

  function cancelLearn() {
    state.learnTarget = null;
    return getStatus();
  }

  function listDevices() {
    try {
      probePorts();
      return {
        ports: [...state.availablePorts],
        reason: state.driverReason,
      };
    } catch (error) {
      log.warn('MIDI listDevices failed:', error?.message || error);
      return { ports: [], reason: 'driver-error' };
    }
  }

  function start() {
    if (started) {
      refresh();
      return getStatus();
    }
    started = true;
    try {
      refresh();
    } catch (error) {
      log.warn('MIDI start failed (non-fatal):', error?.message || error);
    }
    return getStatus();
  }

  function stop() {
    started = false;
    try {
      closeInput();
    } catch { /* ignore */ }
    state.learnTarget = null;
    return getStatus();
  }

  function getLearnTarget() {
    return state.learnTarget;
  }

  return {
    feature: 'midi',
    start,
    stop,
    getStatus,
    listDevices,
    setEnabled,
    setDevice,
    setMapping,
    clearMapping,
    resetMappings,
    startLearn,
    cancelLearn,
    getLearnTarget,
    // Test seam: inject raw bytes without hardware.
    __handleTestMessage: (bytes) => handleRawMessage(0, bytes),
  };
}

export default createMidiController;
