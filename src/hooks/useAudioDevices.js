/**
 * useAudioDevices.js — permission-then-enumerate for Live Sermon Assist.
 *
 * THE LABEL TRAP IS THE WHOLE JOB OF THIS FILE. Chromium returns every
 * device with an EMPTY `label` until getUserMedia permission has been
 * granted at least once, so a naive picker renders a dropdown of blank rows
 * on first run — which is exactly the first run. The order here is therefore
 * fixed: request permission, then enumerate, and never build the list before
 * permission resolves. If permission is denied, the caller shows a single
 * explanatory row naming the fix rather than a set of empty ones.
 *
 * COLD BY DEFAULT: status starts at 'idle' and nothing — not enumeration,
 * not a permission prompt, not a devicechange subscription — happens until
 * requestPermission() is called from an explicit user action.
 *
 * The selected source persists in the SpeechStore `audio` slice, keyed by
 * deviceId (stable identity), never by list index: device ordering is not
 * stable across reboots.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSpeechStore from '../context/SpeechStore';

/** Display order of the groups — the plan's order, not alphabetical. */
export const AUDIO_GROUP_ORDER = [
  'microphones',
  'usb-and-line',
  'loopback-monitor',
  'network',
  'unknown',
];

/** Human headings for each group key (same order as AUDIO_GROUP_ORDER). */
export const AUDIO_GROUP_LABELS = {
  microphones: 'Microphones',
  'usb-and-line': 'USB & Line Inputs',
  'loopback-monitor': 'Loopback & Monitor Sources',
  network: 'Network Sources',
  unknown: 'Other',
};

/** One-line helpers rendered under the group heading, per the plan. */
export const AUDIO_GROUP_HELPERS = {
  'loopback-monitor':
    'Captures what this computer is playing — Windows Stereo Mix / What U Hear, macOS BlackHole or an aggregate device, Linux monitor sources.',
  network:
    'Inputs arriving over the network (Dante, AES67, NDI, AVB…) from a digital console — no local hardware input required.',
};

const DENIED_ERROR =
  'Microphone access was denied. Enable it in System Settings → Privacy & Security → Microphone ' +
  '(Windows: Settings → Privacy → Microphone), then retry.';

const UNSUPPORTED_ERROR =
  'This environment has no audio input API (navigator.mediaDevices.getUserMedia is unavailable).';

const NOT_FOUND_ERROR = 'No microphone was found. Connect an input, then retry.';

// Label heuristics, straight from the plan: users do not know to look for
// loopback sources under the names the OS gives them, and a network source
// must group and select with NO local hardware input present.
const LOOPBACK_RE = /stereo mix|what u hear|loopback|monitor|blackhole|pulse.*monitor|wave.*loopback|cable.*audio/i;
const NETWORK_RE = /dante|aes67|ravenna|ndi|multicast|discovery|avb|aes\b/i;
const USB_LINE_RE = /usb|interface|line\s*in|input\s*\d/i;

/**
 * Classify one input device into a display group.
 * Precedence: network → loopback → usb/line → microphone, so a device that
 * matches several patterns lands in the most specific group (otherwise the
 * usb-and-line group could never populate: "Yeti USB Microphone" also
 * matches the plain-microphone rule).
 *
 * @param {{kind: string, label?: string}} device
 * @returns {'microphones'|'usb-and-line'|'loopback-monitor'|'network'|'unknown'}
 */
export const groupForDevice = (device) => {
  if (!device || device.kind !== 'audioinput') return 'unknown';
  const label = typeof device.label === 'string' ? device.label : '';
  if (NETWORK_RE.test(label)) return 'network';
  if (LOOPBACK_RE.test(label)) return 'loopback-monitor';
  if (USB_LINE_RE.test(label)) return 'usb-and-line';
  if (label.trim() !== '') return 'microphones';
  // No label means we cannot classify — and per the label trap we should
  // never be showing it at all; keep it out of every named group.
  return 'unknown';
};

/** Store `sourceKind` for a device (see speechDefaults().audio.sourceKind). */
export const kindForDevice = (device) => {
  switch (groupForDevice(device)) {
    case 'network':
      return 'network';
    case 'loopback-monitor':
      return 'loopback';
    case 'usb-and-line':
      return /line\s*in/i.test(device?.label ?? '') ? 'line' : 'usb';
    default:
      return 'microphone';
  }
};

const stopStreamImmediately = (stream) => {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* track already ended */
    }
  }
};

/**
 * @returns {{
 *   status: 'idle'|'requesting'|'denied'|'ready'|'unsupported'|'error',
 *   devices: MediaDeviceInfo[],
 *   groups: Record<'microphones'|'usb-and-line'|'loopback-monitor'|'network'|'unknown', MediaDeviceInfo[]>,
 *   error: string|null,
 *   hasLabels: boolean,
 *   fallbackNote: string|null,
 *   selectedSourceId: string|null,
 *   selectSource: (deviceId: string) => boolean,
 *   selectSystemDefault: () => void,
 *   requestPermission: () => Promise<{ok: boolean, reason?: string}>,
 *   refresh: () => Promise<{ok: boolean, reason?: string}>,
 *   activeSourceMissing: boolean,
 * }}
 */
export function useAudioDevices() {
  const [status, setStatus] = useState('idle');
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const [fallbackNote, setFallbackNote] = useState(null);

  // Mirrors state for callbacks that must not re-create on every render.
  const statusRef = useRef('idle');
  const mountedRef = useRef(true);

  const selectedSourceId = useSpeechStore((state) => state.audio.sourceId);

  const updateStatus = useCallback((next) => {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Turn a raw enumerateDevices() result into hook state. The ONLY place
   * devices are ever set. Blank labels are dropped — "never render a list
   * of blank labels" is enforced here, not left to the UI.
   */
  const applyDeviceList = useCallback((list) => {
    const raw = Array.isArray(list) ? list : [];
    const inputs = raw.filter((d) => d && d.kind === 'audioinput');
    const labeled = inputs.filter((d) => typeof d.label === 'string' && d.label.trim() !== '');
    if (mountedRef.current) setDevices(labeled);
    return labeled;
  }, []);

  /**
   * Remember-the-choice + honest fallback. Runs after every enumeration:
   *  - remembered source present  → keep it selected (refresh its label)
   *  - remembered source gone     → say so in one line and state the
   *    fallback — never a silent switch. The stored id stays put so the
   *    device is picked up again when it is replugged.
   */
  const resolveRememberedSource = useCallback((labeled) => {
    const store = useSpeechStore.getState();
    const rememberedId = store.audio.sourceId;
    if (!rememberedId) {
      if (mountedRef.current) setFallbackNote(null);
      return;
    }
    const match = labeled.find((d) => d.deviceId === rememberedId);
    if (match) {
      if (match.label !== store.audio.lastSourceLabel) {
        store.setAudioSource({
          sourceId: match.deviceId,
          sourceKind: kindForDevice(match),
          lastSourceLabel: match.label,
        });
      }
      if (mountedRef.current) setFallbackNote(null);
      return;
    }
    const rememberedLabel = store.audio.lastSourceLabel || rememberedId;
    if (mountedRef.current) {
      setFallbackNote(
        `Remembered input “${rememberedLabel}” is no longer connected — using the system default.`
      );
    }
  }, []);

  /** enumerateDevices, but ONLY legal once permission has resolved. */
  const enumerateGranted = useCallback(async () => {
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
      updateStatus('unsupported');
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return { ok: false, reason: 'unsupported' };
    }
    try {
      const list = await mediaDevices.enumerateDevices();
      const labeled = applyDeviceList(list);
      resolveRememberedSource(labeled);
      updateStatus('ready');
      if (mountedRef.current) setError(null);
      return { ok: true };
    } catch (err) {
      updateStatus('error');
      if (mountedRef.current) {
        setError(err?.message || 'Could not list audio input devices.');
      }
      return { ok: false, reason: 'error' };
    }
  }, [applyDeviceList, resolveRememberedSource, updateStatus]);

  /**
   * Request microphone permission, THEN enumerate — in that order, always.
   * Resolves with {ok:false, reason} on denial/unsupported/error; on
   * success the device list is populated with real labels.
   */
  const requestPermission = useCallback(async () => {
    if (statusRef.current === 'requesting') return { ok: false, reason: 'requesting' };
    if (statusRef.current === 'ready') return enumerateGranted();

    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      updateStatus('unsupported');
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return { ok: false, reason: 'unsupported' };
    }

    updateStatus('requesting');
    if (mountedRef.current) setError(null);

    // The probe is what unlocks labels. It is NOT a capture session: the
    // stream is stopped before this function returns, every time.
    let probe = null;
    try {
      probe = await mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        updateStatus('denied');
        if (mountedRef.current) {
          setDevices([]);
          setError(DENIED_ERROR);
        }
        return { ok: false, reason: 'denied' };
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        updateStatus('error');
        if (mountedRef.current) {
          setDevices([]);
          setError(NOT_FOUND_ERROR);
        }
        return { ok: false, reason: 'not-found' };
      }
      updateStatus('error');
      if (mountedRef.current) {
        setError(err?.message || 'Could not request microphone access.');
      }
      return { ok: false, reason: 'error' };
    } finally {
      stopStreamImmediately(probe);
    }

    return enumerateGranted();
  }, [enumerateGranted, updateStatus]);

  /**
   * Re-enumerate — only meaningful after permission resolved. A refresh
   * call while still cold is a no-op: it must never enumerate blind.
   */
  const refresh = useCallback(async () => {
    if (statusRef.current !== 'ready') return { ok: false, reason: 'not-granted' };
    return enumerateGranted();
  }, [enumerateGranted]);

  const selectSource = useCallback(
    (deviceId) => {
      const device = devices.find((d) => d.deviceId === deviceId);
      if (!device) return false;
      useSpeechStore.getState().setAudioSource({
        sourceId: device.deviceId,
        sourceKind: kindForDevice(device),
        lastSourceLabel: device.label,
      });
      setFallbackNote(null);
      return true;
    },
    [devices]
  );

  /** Explicit "use the system default" choice — a real, remembered choice. */
  const selectSystemDefault = useCallback(() => {
    useSpeechStore.getState().clearAudioSource();
    setFallbackNote(null);
  }, []);

  // Hotplug: subscribe only once we are entitled to see labels. Re-runs the
  // same enumerate path, so an unplugged active source flips
  // activeSourceMissing and raises fallbackNote without any special case.
  useEffect(() => {
    if (status !== 'ready') return undefined;
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices || typeof mediaDevices.addEventListener !== 'function') return undefined;

    const onDeviceChange = () => refresh();
    mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => {
      if (typeof mediaDevices.removeEventListener === 'function') {
        mediaDevices.removeEventListener('devicechange', onDeviceChange);
      }
    };
  }, [status, refresh]);

  const groups = useMemo(() => {
    const acc = {};
    for (const key of AUDIO_GROUP_ORDER) acc[key] = [];
    for (const device of devices) acc[groupForDevice(device)].push(device);
    return acc;
  }, [devices]);

  const hasLabels =
    status !== 'idle' && devices.length > 0 && devices.every((d) => (d.label ?? '').trim() !== '');

  const activeSourceMissing =
    status === 'ready' && !!selectedSourceId && !devices.some((d) => d.deviceId === selectedSourceId);

  return {
    status,
    devices,
    groups,
    error,
    hasLabels,
    fallbackNote,
    selectedSourceId,
    selectSource,
    selectSystemDefault,
    requestPermission,
    refresh,
    activeSourceMissing,
  };
}

export default useAudioDevices;
