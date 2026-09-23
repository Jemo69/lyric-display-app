import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useControlSocket } from '../context/ControlSocketProvider';
import { resolveBackendUrl } from '../utils/network';
import { getControlAuthToken } from '../utils/controlAuth';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OutputPresence');

const PRESENCE_PATH = '/api/v1/outputs/presence';

/** Group a presence entry list by output key. Pure helper, exported for tests. */
export function presenceListToMap(presence) {
  const map = new Map();
  for (const entry of Array.isArray(presence) ? presence : []) {
    const key = entry?.outputKey;
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(entry);
    map.set(key, list);
  }
  return map;
}

async function fetchPresenceSnapshot(signal) {
  const token = await getControlAuthToken();
  if (!token) {
    const error = new Error('No control auth token available');
    error.code = 'NO_TOKEN';
    throw error;
  }
  const response = await fetch(resolveBackendUrl(PRESENCE_PATH), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    const error = new Error(`Presence request failed (${response.status})`);
    error.code = `HTTP_${response.status}`;
    throw error;
  }
  const data = await response.json();
  return Array.isArray(data?.presence) ? data.presence : [];
}

/**
 * Live output-presence state for the control panel (feature #03).
 * Combines socket `outputPresenceUpdate` pushes with periodic HTTP polling
 * so the strip stays correct even if a push is missed.
 */
export function useOutputPresence({ pollIntervalMs = 5000 } = {}) {
  const { socket, isConnected } = useControlSocket();
  const [presence, setPresence] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const refresh = useCallback(async () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* noop */ }
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    abortRef.current = controller;
    try {
      const entries = await fetchPresenceSnapshot(controller?.signal);
      setPresence(entries);
      setLastUpdated(Date.now());
      setError(null);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      log.warn('Presence poll failed, keeping last known state');
      setError(err?.message || 'Presence request failed');
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, pollIntervalMs);
    return () => {
      clearInterval(timer);
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch { /* noop */ }
        abortRef.current = null;
      }
    };
  }, [refresh, pollIntervalMs]);

  useEffect(() => {
    if (!socket || typeof socket.on !== 'function') return undefined;
    const handleUpdate = (payload) => {
      if (!Array.isArray(payload?.presence)) return;
      setPresence(payload.presence);
      setLastUpdated(payload.timestamp || Date.now());
      setError(null);
    };
    try {
      socket.on('outputPresenceUpdate', handleUpdate);
      if (socket.connected) socket.emit('requestOutputPresence');
    } catch (err) {
      log.warn('Failed to subscribe to output presence pushes');
    }
    return () => {
      try {
        if (typeof socket.off === 'function') socket.off('outputPresenceUpdate', handleUpdate);
      } catch { /* noop */ }
    };
  }, [socket, isConnected]);

  const presenceByKey = useMemo(() => presenceListToMap(presence), [presence]);

  return { presence, presenceByKey, lastUpdated, error, refresh };
}

export default useOutputPresence;
