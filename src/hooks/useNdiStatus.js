import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../utils/logger';
import { defaultNdiSourceName } from '../utils/ndi';

const log = createLogger('NdiStatus');

const getApi = () => {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.ndi || null;
};

/**
 * Subscribes to the main-process NDI heartbeat (`ndi:status`, every 2s) and
 * exposes this output's sender snapshot for the output-settings UI.
 *
 * Outside the desktop app (browser / Lite) there is no NDI sender, so the
 * hook reports supported:false and the settings section degrades to an
 * informational note. Never throws; a dead main process just leaves the
 * last known snapshot in place.
 *
 * `initialEnabled` / `initialSourceName` come from the persisted per-output
 * settings. On mount (desktop only) the hook reconciles main with the
 * persisted toggle so a restart restores the booth's NDI routing.
 */
export const useNdiStatus = (outputKey, { initialEnabled = false, initialSourceName = '' } = {}) => {
  const [supported] = useState(() => Boolean(getApi()));
  const [snapshot, setSnapshot] = useState(null);
  const [lastError, setLastError] = useState(null);
  const reconciledRef = useRef(false);

  useEffect(() => {
    const api = getApi();
    if (!api || !outputKey) return undefined;
    let alive = true;

    api
      .getStatus()
      .then((status) => {
        if (!alive) return;
        if (status?.success && status.outputs && Object.prototype.hasOwnProperty.call(status.outputs, outputKey)) {
          setSnapshot(status.outputs[outputKey]);
        }
      })
      .catch((error) => {
        if (!alive) return;
        log.warn('NDI status read failed (non-fatal):', error?.message || error);
        setLastError(error?.message || String(error));
      });

    let off = null;
    try {
      off = api.onStatus?.((payload) => {
        if (!alive) return;
        const next = payload?.outputs?.[outputKey];
        if (next) setSnapshot(next);
      });
    } catch (error) {
      log.warn('NDI status subscription failed (non-fatal):', error?.message || error);
    }

    return () => {
      alive = false;
      try {
        if (typeof off === 'function') off();
      } catch {
        // ignore
      }
    };
  }, [outputKey, supported]);

  // Reconcile main with the persisted per-output toggle (once per output).
  useEffect(() => {
    const api = getApi();
    if (!api || !outputKey || reconciledRef.current) return;
    reconciledRef.current = true;
    if (!initialEnabled) return;
    const sourceName = initialSourceName || defaultNdiSourceName(outputKey);
    api.setEnabled?.(outputKey, true, sourceName).catch((error) => {
      log.warn('NDI reconcile failed (non-fatal):', error?.message || error);
    });
    // Intentionally once per mount: main is the source of truth afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputKey, supported]);

  const refresh = useCallback(async () => {
    const api = getApi();
    if (!api) return null;
    try {
      const status = await api.getStatus();
      if (status?.success && status.outputs && Object.prototype.hasOwnProperty.call(status.outputs, outputKey)) {
        setSnapshot(status.outputs[outputKey]);
        return status.outputs[outputKey];
      }
      return null;
    } catch (error) {
      setLastError(error?.message || String(error));
      return null;
    }
  }, [outputKey]);

  const setEnabled = useCallback(
    async (enabled, sourceName) => {
      const api = getApi();
      if (!api) return null;
      try {
        const result = await api.setEnabled(outputKey, enabled, sourceName);
        if (result?.success && result.snapshot) {
          setSnapshot(result.snapshot);
          return result.snapshot;
        }
        if (!result?.success && result?.error) setLastError(result.error);
        return null;
      } catch (error) {
        setLastError(error?.message || String(error));
        return null;
      }
    },
    [outputKey]
  );

  return {
    supported,
    snapshot,
    state: snapshot?.state || 'stopped',
    error: snapshot?.error || (lastError ? { code: 'IPC_FAILED', message: lastError } : null),
    refresh,
    setEnabled,
  };
};

export default useNdiStatus;
