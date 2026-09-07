import { useEffect, useRef } from 'react';
import useLyricsStore from '../context/LyricsStore';
import { createLogger } from '../utils/logger';

const log = createLogger('LyricsHotReload');

const normalizePath = (p) => {
  if (typeof p !== 'string') return '';
  return p.replace(/\\/g, '/').toLowerCase();
};

/**
 * Hot reload the currently loaded lyrics file when it changes on disk.
 * - Electron only (needs a real filePath + main-process watcher).
 * - Toggleable via `hotReloadEnabled` in LyricsStore (default ON).
 * - Preserves the selected line across reloads and re-emits it so
 *   outputs/projector stay on the same slide.
 */
export const useLyricsHotReload = ({
  processLoadedLyrics,
  emitLineUpdate,
  showToast,
} = {}) => {
  const filePath = useLyricsStore((s) => s.songMetadata?.filePath || '');
  const contentMode = useLyricsStore((s) => s.contentMode);
  const hotReloadEnabled = useLyricsStore((s) => s.hotReloadEnabled ?? true);

  const stateRef = useRef({ filePath: '', rawContent: '', selectedLine: null });
  const reloadInFlight = useRef(false);
  const lastReloadAt = useRef(0);

  // Keep a live snapshot for the async file-changed handler.
  useEffect(() => {
    const s = useLyricsStore.getState();
    stateRef.current = {
      filePath: s.songMetadata?.filePath || '',
      rawContent: s.rawLyricsContent || '',
      selectedLine: s.selectedLine,
    };
  });

  const canWatch = Boolean(hotReloadEnabled)
    && Boolean(filePath)
    && contentMode === 'song'
    && Boolean(window?.electronAPI?.lyrics?.watchFile);

  // (Un)subscribe the main-process watcher when target/toggle changes.
  // Cleanup of the previous effect already unwatches the old file, so the
  // toggle-off case needs no extra work beyond skipping the new watch.
  useEffect(() => {
    if (!canWatch) return undefined;
    let cancelled = false;
    window.electronAPI.lyrics.watchFile(filePath)
      .then((res) => {
        if (!cancelled && res?.success === false) {
          log.warn('Watch failed:', res?.error);
        }
      })
      .catch((err) => {
        if (!cancelled) log.warn('Watch failed:', err?.message || err);
      });
    return () => {
      cancelled = true;
      try {
        window?.electronAPI?.lyrics?.unwatchFile?.(filePath)?.catch?.(() => {});
      } catch { }
    };
  }, [canWatch, filePath]);

  // Listen for disk-change pushes from main.
  useEffect(() => {
    if (!window?.electronAPI?.lyrics?.onFileChanged) return undefined;
    if (typeof processLoadedLyrics !== 'function') return undefined;

    const offChanged = window.electronAPI.lyrics.onFileChanged(async (payload) => {
      try {
        const store = useLyricsStore.getState();
        const enabled = store.hotReloadEnabled ?? true;
        if (!enabled) return;
        if (store.contentMode !== 'song') return;
        if (!payload || typeof payload.content !== 'string') return;
        const watchedFor = store.songMetadata?.filePath || stateRef.current.filePath;
        if (normalizePath(payload.filePath) !== normalizePath(watchedFor)) return;
        // Skip our own saves / duplicate events with identical content.
        if (payload.content === store.rawLyricsContent) return;
        if (reloadInFlight.current) return;
        // Coalesce bursts from atomic saves (tmp + rename fires twice).
        const now = Date.now();
        if (now - lastReloadAt.current < 800) return;
        reloadInFlight.current = true;
        lastReloadAt.current = now;

        const prevSelected = store.selectedLine;
        const ok = await processLoadedLyrics(
          {
            content: payload.content,
            fileName: payload.fileName,
            filePath: payload.filePath,
            fileType: payload.fileType || 'txt',
          },
          {
            fallbackFileName: payload.fileName,
            toastTitle: 'File updated',
            toastMessage: `Auto-reloaded ${payload.fileName || 'lyrics'} from disk`,
            toastVariant: 'info',
          },
        );

        if (ok && Number.isInteger(prevSelected) && prevSelected !== null) {
          const next = useLyricsStore.getState();
          const maxIdx = (next.lyrics?.length || 1) - 1;
          const clamped = Math.min(Math.max(prevSelected, 0), Math.max(maxIdx, 0));
          next.selectLine?.(clamped);
          try {
            if (typeof emitLineUpdate === 'function') emitLineUpdate(clamped);
            else if (window.__controlSocketContext?.socket?.connected) {
              window.__controlSocketContext.socket.emit('lineUpdate', { index: clamped });
            }
          } catch { }
        }
      } catch (err) {
        log.warn('Hot reload failed:', err?.message || err);
      } finally {
        reloadInFlight.current = false;
      }
    });

    const offRemoved = window?.electronAPI?.lyrics?.onFileRemoved
      ? window.electronAPI.lyrics.onFileRemoved((payload) => {
        const watchedFor = useLyricsStore.getState().songMetadata?.filePath || stateRef.current.filePath;
        if (normalizePath(payload?.filePath) !== normalizePath(watchedFor)) return;
        showToast?.({
          title: 'File deleted',
          message: 'The loaded lyrics file was deleted. Auto-reload paused.',
          variant: 'warn',
        });
      })
      : undefined;

    return () => {
      try { offChanged?.(); } catch { }
      try { offRemoved?.(); } catch { }
    };
  }, [processLoadedLyrics, emitLineUpdate, showToast]);

  return { hotReloadEnabled, canWatch };
};

export default useLyricsHotReload;
