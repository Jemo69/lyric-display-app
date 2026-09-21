import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Copy, Check, Eye, EyeOff, RotateCcw, Radio } from 'lucide-react';
import { createLogger } from '../utils/logger.js';
import useToast from '../hooks/useToast';
import {
  HARDWARE_COMMANDS,
  HARDWARE_COMMAND_LABELS,
  OSC_COMMAND_ROUTES,
  DEFAULT_OSC_PORT,
  describeMidiKey,
} from '../../shared/hardwareCommands.js';

const logger = createLogger('MidiOscSettings');

const isDesktopHardwareAvailable = () =>
  typeof window !== 'undefined' && !!window.electronAPI?.hardware;

const cardClass = (darkMode) =>
  `rounded-xl border p-4 space-y-3 ${darkMode ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`;

const labelClass = (darkMode) =>
  `text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`;

const hintClass = (darkMode) =>
  `text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-500'}`;

const noteClass = (darkMode, tone = 'info') => {
  const tones = {
    info: darkMode ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-blue-300 bg-blue-50 text-blue-800',
    warn: darkMode ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-800',
    ok: darkMode ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-emerald-300 bg-emerald-50 text-emerald-800',
  };
  return `rounded-lg border px-3 py-2 text-xs leading-relaxed ${tones[tone] || tones.info}`;
};

function StatusDot({ darkMode, active, label }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 rounded-full border ${active
          ? 'bg-emerald-500 border-emerald-300'
          : darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-300 border-gray-400'}`}
      />
      {label}
    </span>
  );
}

const MidiPanel = ({ darkMode }) => {
  const { showToast } = useToast();
  const [status, setStatus] = React.useState(null);
  const [ports, setPorts] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [waiting, setWaiting] = React.useState(null); // command being learned
  const waitTimer = React.useRef(null);

  const refresh = React.useCallback(async () => {
    if (!isDesktopHardwareAvailable()) return;
    try {
      const res = await window.electronAPI.hardware.midi.getStatus();
      if (res?.success && res.status) setStatus(res.status);
      const devs = await window.electronAPI.hardware.midi.listDevices();
      if (devs?.success && Array.isArray(devs.ports)) setPorts(devs.ports);
    } catch (error) {
      logger.warn('MIDI status refresh failed:', error);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    if (!isDesktopHardwareAvailable()) return undefined;
    const off = window.electronAPI.hardware.onMidiStatus?.((next) => {
      if (next) {
        setStatus(next);
        // Learn completed (main clears the armed target once bound).
        if (next.learnTarget == null) {
          setWaiting((w) => {
            if (w && waitTimer.current) {
              clearTimeout(waitTimer.current);
              waitTimer.current = null;
            }
            return null;
          });
        }
      }
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, [refresh]);

  React.useEffect(() => () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
  }, []);

  if (!isDesktopHardwareAvailable()) {
    return (
      <div className={cardClass(darkMode)}>
        <h3 className={labelClass(darkMode)}>Foot pedal / MIDI keys</h3>
        <p className={noteClass(darkMode)}>MIDI setup lives in the desktop app. Open Preferences there to map a pedal.</p>
      </div>
    );
  }

  const enabled = !!status?.enabled;
  const connected = !!status?.connected;
  const mappings = status?.mappings || {};

  const run = async (fn, label) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (error) {
      showToast({ title: label || 'MIDI update failed', message: error?.message || String(error), variant: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = (next) => run(
    () => window.electronAPI.hardware.midi.setEnabled(next),
    'Could not switch MIDI',
  );

  const handleDevice = (name) => run(
    () => window.electronAPI.hardware.midi.setDevice(name || null),
    'Could not select MIDI device',
  );

  const handleLearn = async (command) => {
    if (waiting === command) {
      await run(() => window.electronAPI.hardware.midi.cancelLearn(), 'Could not cancel');
      setWaiting(null);
      if (waitTimer.current) clearTimeout(waitTimer.current);
      return;
    }
    const res = await window.electronAPI.hardware.midi.startLearn(command);
    if (res?.success) {
      setWaiting(command);
      if (waitTimer.current) clearTimeout(waitTimer.current);
      waitTimer.current = setTimeout(() => {
        setWaiting(null);
        window.electronAPI.hardware.midi.cancelLearn().catch(() => {});
      }, 30000);
    } else {
      showToast({ title: 'Learn failed', message: res?.error || 'Could not arm learn mode.', variant: 'warning' });
    }
  };

  const handleClear = (command) => run(
    () => window.electronAPI.hardware.midi.clearMapping(command),
    'Could not clear mapping',
  );

  const handleReset = () => run(
    () => window.electronAPI.hardware.midi.resetMappings(),
    'Could not reset mappings',
  );

  const bindingFor = (command) =>
    Object.entries(mappings).find(([, cmd]) => cmd === command)?.[0] || null;

  return (
    <div className={cardClass(darkMode)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className={labelClass(darkMode)}>Foot pedal / MIDI keys</h3>
          <p className={hintClass(darkMode)}>Advance slides hands-free while leading. Mappings save automatically.</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={busy}
          aria-label="Enable MIDI control"
        />
      </div>

      <div className="flex items-center gap-4">
        <StatusDot darkMode={darkMode} active={connected} label={connected ? `Connected · ${status.deviceName}` : 'Not connected'} />
        <Button variant="ghost" size="sm" onClick={refresh} disabled={busy} className="h-7 px-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {status?.note && (
        <p className={noteClass(darkMode, connected ? 'ok' : enabled ? 'warn' : 'info')} role="status">{status.note}</p>
      )}
      {status?.lastMessage && (
        <p className={hintClass(darkMode)}>Last heard: {status.lastMessage.label}</p>
      )}

      <div className="space-y-2">
        <label htmlFor="midi-device" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          MIDI device
        </label>
        <select
          id="midi-device"
          value={status?.deviceName || ''}
          onChange={(e) => handleDevice(e.target.value)}
          disabled={busy || ports.length === 0}
          className={`w-full h-9 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${darkMode ? 'border-gray-700 bg-gray-950 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}
        >
          <option value="">{ports.length === 0 ? 'No devices found' : 'First available device'}</option>
          {ports.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Button mappings
        </div>
        {HARDWARE_COMMANDS.map((command) => {
          const binding = bindingFor(command);
          const isWaiting = waiting === command;
          return (
            <div
              key={command}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-white'}`}
            >
              <div className="min-w-0">
                <div className={`text-sm font-medium ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                  {HARDWARE_COMMAND_LABELS[command]}
                </div>
                <div className={`text-xs font-mono ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  {isWaiting ? 'Press a pedal key now…' : binding ? describeMidiKey(binding) : 'Not mapped'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant={isWaiting ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleLearn(command)}
                  disabled={busy}
                  className={`h-7 px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-blue-500 ${isWaiting ? 'animate-pulse' : ''}`}
                >
                  {isWaiting ? 'Waiting…' : 'Learn'}
                </Button>
                {binding && (
                  <Button variant="ghost" size="sm" onClick={() => handleClear(command)} disabled={busy} className="h-7 px-2 text-xs">
                    Clear
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={busy} className="h-7 px-2 text-xs">
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset to defaults
          </Button>
        </div>
      </div>
    </div>
  );
};

const OscPanel = ({ darkMode }) => {
  const { showToast } = useToast();
  const [status, setStatus] = React.useState(null);
  const [portInput, setPortInput] = React.useState(String(DEFAULT_OSC_PORT));
  const [showToken, setShowToken] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!isDesktopHardwareAvailable()) return;
    try {
      const res = await window.electronAPI.hardware.osc.getStatus();
      if (res?.success && res.status) {
        setStatus(res.status);
        setPortInput(String(res.status.port ?? DEFAULT_OSC_PORT));
      }
    } catch (error) {
      logger.warn('OSC status refresh failed:', error);
    }
  }, []);

  const refreshToken = React.useCallback(async () => {
    // Token value is only returned on demand (reveal / regenerate); status
    // broadcasts stay masked. Desktop-only IPC, same trust as the app shell.
    if (!isDesktopHardwareAvailable()) return null;
    try {
      const res = await window.electronAPI.hardware.osc.getToken();
      return res?.success && typeof res.token === 'string' && res.token ? res.token : null;
    } catch {
      return null;
    }
  }, []);

  const [token, setToken] = React.useState(null);

  React.useEffect(() => {
    refresh();
    if (!isDesktopHardwareAvailable()) return undefined;
    const off = window.electronAPI.hardware.onOscStatus?.((next) => {
      if (next) {
        setStatus(next);
        if (typeof next.token === 'string' && next.token) setToken(next.token);
      }
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, [refresh]);

  if (!isDesktopHardwareAvailable()) {
    return (
      <div className={cardClass(darkMode)}>
        <h3 className={labelClass(darkMode)}>Stream Deck / mixer (OSC)</h3>
        <p className={noteClass(darkMode)}>OSC setup lives in the desktop app.</p>
      </div>
    );
  }

  const enabled = !!status?.enabled;
  const listening = !!status?.listening;

  const handleToggle = async (next) => {
    setBusy(true);
    try {
      await window.electronAPI.hardware.osc.setEnabled(next);
      await refresh();
    } catch (error) {
      showToast({ title: 'Could not switch OSC', message: error?.message || String(error), variant: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const handleApplyPort = async () => {
    const port = Number(portInput);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      showToast({ title: 'Invalid port', message: 'Use a port between 1024 and 65535.', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const res = await window.electronAPI.hardware.osc.setPort(port);
      if (res?.success) setStatus(res.status);
      else showToast({ title: 'Port not applied', message: res?.error || 'Unknown error', variant: 'warning' });
    } catch (error) {
      showToast({ title: 'Port not applied', message: error?.message || String(error), variant: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      const res = await window.electronAPI.hardware.osc.regenerateToken();
      if (res?.success) {
        setStatus(res.status);
        if (typeof res.status?.token === 'string' && res.status.token) setToken(res.status.token);
        else {
          const full = await refreshToken();
          if (full) setToken(full);
        }
        setShowToken(true);
        showToast({ title: 'Token regenerated', message: 'Update your Companion / X32 buttons with the new token.', variant: 'info' });
      } else {
        showToast({ title: 'Regenerate failed', message: res?.error || 'Unknown error', variant: 'warning' });
      }
    } catch (error) {
      showToast({ title: 'Regenerate failed', message: error?.message || String(error), variant: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const handleCopyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast({ title: 'Copy failed', message: 'Select the token text and copy it manually.', variant: 'warning' });
    }
  };

  const handleToggleToken = async () => {
    if (showToken) {
      setShowToken(false);
      return;
    }
    if (!token) {
      const current = await refreshToken();
      if (current) setToken(current);
      else {
        showToast({ title: 'Token unavailable', message: 'OSC controller did not return a token.', variant: 'warning' });
        return;
      }
    }
    setShowToken(true);
  };

  return (
    <div className={cardClass(darkMode)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className={labelClass(darkMode)}>Stream Deck / mixer (OSC)</h3>
          <p className={hintClass(darkMode)}>Tactile booth buttons via Companion or X32. Token required on every message.</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={busy}
          aria-label="Enable OSC control"
        />
      </div>

      <div className="flex items-center gap-4">
        <StatusDot
          darkMode={darkMode}
          active={listening}
          label={listening ? `Listening · UDP :${status.boundPort}` : 'Not listening'}
        />
      </div>

      {status?.note && (
        <p className={noteClass(darkMode, listening ? 'ok' : enabled ? 'warn' : 'info')} role="status">{status.note}</p>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <label htmlFor="osc-port" className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            UDP port
          </label>
          <Input
            id="osc-port"
            inputMode="numeric"
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            placeholder={String(DEFAULT_OSC_PORT)}
            className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100 font-mono' : 'font-mono'}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleApplyPort} disabled={busy} className="h-9">
          Apply
        </Button>
      </div>
      {status?.boundPort && status.boundPort !== status.port && (
        <p className={noteClass(darkMode, 'warn')} role="status">
          Port {status.port} was busy — listening on {status.boundPort} instead.
        </p>
      )}

      <div className="space-y-2">
        <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Remote token
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-white'}`}>
          <code className={`flex-1 truncate font-mono text-xs ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
            {showToken && token ? token : (status?.tokenMasked || '····')}
          </code>
          <Button variant="ghost" size="sm" onClick={handleToggleToken} className="h-7 px-2 text-xs" aria-label={showToken ? 'Hide token' : 'Show token'}>
            {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyToken} disabled={!token} className="h-7 px-2 text-xs" aria-label="Copy token">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={busy} className="h-7 px-2.5 text-xs">
            New token
          </Button>
        </div>
        <p className={hintClass(darkMode)}>Paste this token as the first argument of every OSC message. Press the eye icon to reveal it.</p>
      </div>

      <div className="space-y-2">
        <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          OSC addresses
        </div>
        <div className={`overflow-hidden rounded-lg border ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          {Object.entries(OSC_COMMAND_ROUTES).map(([address, command]) => (
            <div
              key={address}
              className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${darkMode ? 'odd:bg-gray-950/60 even:bg-gray-900/30' : 'odd:bg-white even:bg-gray-50'}`}
            >
              <code className={`font-mono ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{address}</code>
              <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{HARDWARE_COMMAND_LABELS[command]}</span>
            </div>
          ))}
        </div>
        {!!status?.rejectedCount && (
          <p className={hintClass(darkMode)}>{status.rejectedCount} message(s) rejected (wrong token or address). Check Companion button config.</p>
        )}
      </div>
    </div>
  );
};

export const MidiOscSection = ({ darkMode }) => (
  <div className="space-y-4">
    <div>
      <h3 className={`text-base font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        <Radio className="w-4 h-4" /> Hardware Control
      </h3>
      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        Foot pedals, MIDI keys, Stream Deck (via Companion), and X32 drive the same Next / Previous / Clear / Blank
        actions as clicking — nothing here can bypass operator permissions. Disabled hardware never blocks the app.
      </p>
    </div>
    <MidiPanel darkMode={darkMode} />
    <OscPanel darkMode={darkMode} />
  </div>
);

export default MidiOscSection;
