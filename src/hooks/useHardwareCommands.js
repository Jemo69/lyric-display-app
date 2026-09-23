import { useEffect, useRef } from 'react';
import { createLogger } from '../utils/logger';

const log = createLogger('HardwareCommands');

/**
 * Bridge hardware MIDI / OSC commands (broadcast from the Electron main
 * process as `hardware:command`) onto the SAME handlers as manual control:
 * line selection, clear, master toggle, and setlist navigation. Socket
 * permission checks therefore apply unchanged.
 *
 * `latestRef` shape:
 * {
 *   hasLyrics, lyrics, selectedLine,
 *   handleLineSelect(index),
 *   handleClearOutput(),
 *   handleToggle(),
 *   handleNavigateSetlistNext(),
 *   handleNavigateSetlistPrevious(),
 * }
 *
 * No-ops outside the desktop app (no window.electronAPI.hardware).
 */
export const useHardwareCommands = (latestRef) => {
  const ref = useRef(null);
  ref.current = latestRef?.current ?? latestRef;

  useEffect(() => {
    const api = window.electronAPI?.hardware;
    if (!api || typeof api.onCommand !== 'function') return undefined;

    const navigateLine = (direction) => {
      const l = ref.current;
      if (!l || !l.hasLyrics || !l.lyrics || l.lyrics.length === 0) return;
      if (typeof l.handleLineSelect !== 'function') return;
      const currentIndex = l.selectedLine ?? -1;
      let newIndex;
      if (direction === 'up') {
        newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      } else {
        newIndex = currentIndex < l.lyrics.length - 1 ? currentIndex + 1 : l.lyrics.length - 1;
      }
      if (newIndex !== currentIndex) {
        l.handleLineSelect(newIndex);
        window.dispatchEvent(new CustomEvent('scroll-to-lyric-line', { detail: { lineIndex: newIndex } }));
      }
    };

    const handlePayload = (payload) => {
      const command = payload?.command;
      const source = payload?.source || 'hardware';
      const l = ref.current;
      if (!command || !l) return;
      try {
        switch (command) {
          case 'next':
            navigateLine('down');
            break;
          case 'prev':
            navigateLine('up');
            break;
          case 'clear':
            l.handleClearOutput?.();
            break;
          case 'blank':
            l.handleToggle?.();
            break;
          case 'setlist-next':
            l.handleNavigateSetlistNext?.();
            break;
          case 'setlist-prev':
            l.handleNavigateSetlistPrevious?.();
            break;
          default:
            log.debug(`Ignoring unknown hardware command: ${command}`);
        }
      } catch (error) {
        log.warn(`Hardware command ${command} (${source}) failed:`, error);
      }
    };

    const unsubscribe = api.onCommand(handlePayload);
    log.debug('Hardware command listener registered');
    return () => {
      try {
        if (typeof unsubscribe === 'function') unsubscribe();
      } catch { /* ignore */ }
    };
  }, []);
};

export default useHardwareCommands;
