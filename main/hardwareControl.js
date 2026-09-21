/**
 * Hardware control bridge (main process).
 *
 * Owns the MIDI + OSC controllers, broadcasts validated hardware commands
 * to renderer windows, and exposes settings IPC for the mappings UI.
 *
 * Command flow: hardware event → controller → onHardwareCommand →
 * normalize + allow-list check → `hardware:command` webContents broadcast.
 * The renderer's control panel (desktop socket session, `output:control`)
 * executes the command through the SAME socket emits as manual clicks, so
 * server-side permission checks apply unchanged.
 */
import { BrowserWindow, ipcMain } from 'electron';
import createMainLogger from './logger.js';
import { createMidiController } from './midiController.js';
import { createOscController } from './oscController.js';
import { normalizeHardwareCommand } from '../shared/hardwareCommands.js';

const log = createMainLogger('Hardware');

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    try {
      win.webContents.send(channel, payload);
    } catch (error) {
      log.warn(`Broadcast ${channel} failed (non-fatal):`, error?.message || error);
    }
  }
}

function safeReply(promiseOrValue) {
  // ipcMain.handle awaits returned promises; normalize sync throws.
  if (promiseOrValue && typeof promiseOrValue.then === 'function') {
    return promiseOrValue.catch((error) => ({ success: false, error: error?.message || String(error) }));
  }
  return promiseOrValue;
}

export function initHardwareControl({ getMainWindow } = {}) {
  void getMainWindow;
  let midi = null;
  let osc = null;

  try {
    midi = createMidiController({
      onCommand: (command, source) => onHardwareCommand(command, source),
    });
  } catch (error) {
    log.warn('MIDI controller unavailable (non-fatal):', error?.message || error);
  }

  try {
    osc = createOscController({
      onCommand: (command, source) => onHardwareCommand(command, source),
    });
  } catch (error) {
    log.warn('OSC controller unavailable (non-fatal):', error?.message || error);
  }

  function onHardwareCommand(command, source) {
    const cmd = normalizeHardwareCommand(command);
    if (!cmd) {
      log.warn(`Ignoring unknown hardware command from ${source}:`, command);
      return;
    }
    log.info(`Hardware command: ${cmd} (via ${source})`);
    broadcast('hardware:command', { command: cmd, source, at: Date.now() });
  }

  function safeStatus(controller, fallbackFeature) {
    try {
      return controller ? controller.getStatus() : { feature: fallbackFeature, enabled: false, reason: 'unavailable', note: 'Hardware control unavailable.' };
    } catch (error) {
      log.warn(`Hardware status read failed (non-fatal):`, error?.message || error);
      return { feature: fallbackFeature, enabled: false, reason: 'error', note: 'Hardware status unavailable.' };
    }
  }

  // Boot both controllers. Each degrades to a clean disabled state when the
  // optional driver/lib, ports, or hardware are missing — boot never blocks.
  try {
    midi?.start();
  } catch (error) {
    log.warn('MIDI start failed (non-fatal):', error?.message || error);
  }
  try {
    // start() is async (port probe); failures resolve to disabled state.
    osc?.start()?.catch?.((error) => {
      log.warn('OSC start failed (non-fatal):', error?.message || error);
    });
  } catch (error) {
    log.warn('OSC start failed (non-fatal):', error?.message || error);
  }

  const notifyMidi = () => broadcast('hardware:midi-status', safeStatus(midi, 'midi'));
  const notifyOsc = () => broadcast('hardware:osc-status', safeStatus(osc, 'osc'));

  try {
    ipcMain.handle('hardware:get-status', () => ({
      success: true,
      midi: safeStatus(midi, 'midi'),
      osc: safeStatus(osc, 'osc'),
    }));

    ipcMain.handle('midi:get-status', () => ({ success: true, status: safeStatus(midi, 'midi') }));
    ipcMain.handle('midi:list-devices', () => {
      try {
        const result = midi ? midi.listDevices() : { ports: [], reason: 'unavailable' };
        return { success: true, ...result };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
    ipcMain.handle('midi:set-enabled', (_event, enabled) => safeReply(
      Promise.resolve().then(() => {
        const status = midi ? midi.setEnabled(enabled === true) : safeStatus(midi, 'midi');
        notifyMidi();
        return { success: true, status };
      }),
    ));
    ipcMain.handle('midi:set-device', (_event, deviceName) => {
      try {
        const status = midi ? midi.setDevice(deviceName) : safeStatus(midi, 'midi');
        notifyMidi();
        return { success: true, status };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
    ipcMain.handle('midi:set-mapping', (_event, { key, command } = {}) => {
      try {
        if (!midi) throw new Error('MIDI controller unavailable');
        const status = midi.setMapping(key, command);
        notifyMidi();
        return { success: true, status };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
    ipcMain.handle('midi:clear-mapping', (_event, command) => {
      try {
        if (!midi) throw new Error('MIDI controller unavailable');
        const status = midi.clearMapping(command);
        notifyMidi();
        return { success: true, status };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
    ipcMain.handle('midi:reset-mappings', () => {
      try {
        const status = midi ? midi.resetMappings() : safeStatus(midi, 'midi');
        notifyMidi();
        return { success: true, status };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
    ipcMain.handle('midi:start-learn', (_event, command) => {
      try {
        if (!midi) throw new Error('MIDI controller unavailable');
        const status = midi.startLearn(command);
        notifyMidi();
        return { success: true, status };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
    ipcMain.handle('midi:cancel-learn', () => {
      try {
        const status = midi ? midi.cancelLearn() : safeStatus(midi, 'midi');
        notifyMidi();
        return { success: true, status };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });

    ipcMain.handle('osc:get-status', () => ({ success: true, status: safeStatus(osc, 'osc') }));
    ipcMain.handle('osc:set-enabled', (_event, enabled) => safeReply(
      Promise.resolve()
        .then(() => (osc ? osc.setEnabled(enabled === true) : safeStatus(osc, 'osc')))
        .then((status) => {
          notifyOsc();
          return { success: true, status };
        }),
    ));
    ipcMain.handle('osc:set-port', (_event, port) => safeReply(
      Promise.resolve()
        .then(() => {
          if (!osc) throw new Error('OSC controller unavailable');
          return osc.setPort(port);
        })
        .then((status) => {
          notifyOsc();
          return { success: true, status };
        }),
    ));
    ipcMain.handle('osc:regenerate-token', () => {
      try {
        if (!osc) throw new Error('OSC controller unavailable');
        const status = osc.regenerateToken();
        notifyOsc();
        return { success: true, status };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
    // Desktop-only reveal: the operator needs the current token to configure
    // Companion / X32 buttons. Never broadcast; only returned on demand.
    ipcMain.handle('osc:get-token', () => {
      try {
        if (!osc) throw new Error('OSC controller unavailable');
        const status = osc.getStatus({ includeToken: true });
        return { success: true, token: status.token || null };
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    });
  } catch (error) {
    log.warn('Hardware IPC registration failed (non-fatal):', error?.message || error);
  }

  log.info('Hardware control bridge ready (MIDI + OSC).');

  return {
    dispatchTestCommand: (command, source = 'test') => onHardwareCommand(command, source),
    getControllers: () => ({ midi, osc }),
  };
}

export default initHardwareControl;
