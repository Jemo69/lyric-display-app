/**
 * usePanicStop.js — one keystroke that kills the microphone.
 *
 * THE CONTRACT: while this hook is mounted, pressing the `panicStop` binding
 * (default `Mod+Shift+M`, remappable in User Preferences > Keyboard Shortcuts)
 * immediately stops capture and closes the microphone — regardless of app
 * state: while capturing, while the store says "listening"/"transcribing",
 * while a text field has focus, and while the rail is collapsed (the rail's
 * collapsed branch is render-only; this hook is mounted above it and its
 * listener lives on `document`).
 *
 * WHY teardown() AND NOT mute() → teardown(): mute() only suspends the
 * AudioContext (mic stays OPEN) and is async — awaiting a suspend() that is
 * racing a close() can reject into useAudioCapture's error path and leave
 * `status === 'error'` after the panic, which is exactly the state a panic
 * key must never leave behind. teardown() is strictly stronger than a mute
 * (it closes the AudioContext, so zero frames are produced — that IS the
 * mute — and it stops every MediaStreamTrack, so the mic is closed at the
 * OS), it is synchronous, and it forces `status` back to `idle`.
 *
 * INTEGRATION SHAPE (deliberate): the binding itself lives in
 * `hotkeyBindings.js` — `DEFAULT_BINDINGS.panicStop` plus a "Sermon Assist"
 * entry in `SHORTCUT_GROUPS` — so it shows up in the preferences shortcut
 * menu, is remappable there, and survives HotkeysStore's unknown-id pruning.
 * The HANDLER is registered here, through the same singleton
 * `getHotkeyManager()` every other app shortcut uses, because wiring it into
 * `useKeyboardShortcuts` would mean editing files outside this phase's file
 * list. Live rebinds are honoured: the effect re-registers when the binding
 * changes.
 *
 * Cold by default: mounting this hook requests no permission, opens no
 * device, and touches no `navigator.mediaDevices` — it only registers a
 * keydown listener. Its callback only ever STOPS things; it can never arm,
 * never enable, never start.
 */

import { useEffect, useRef } from 'react';
import { getHotkeyManager } from '@tanstack/hotkeys';
import useHotkeysStore from '../context/HotkeysStore';
import useSpeechStore from '../context/SpeechStore';
import { DEFAULT_BINDINGS } from '../constants/hotkeyBindings';

/**
 * Live binding with the shipped default as fallback (a partially rehydrated
 * hotkeys store must never leave the panic key unbound).
 *
 * @param {Record<string, string>|undefined} bindings
 * @returns {string} a TanStack hotkey combo string
 */
export const resolvePanicStopCombo = (bindings) =>
  bindings && typeof bindings.panicStop === 'string' && bindings.panicStop.length > 0
    ? bindings.panicStop
    : DEFAULT_BINDINGS.panicStop;

/**
 * Register the panic-stop binding for the lifetime of the calling component.
 *
 * @param {{teardown?: Function}} capture return value of useAudioCapture —
 *   the capture instance the panic key operates on. Kept in a ref so a
 *   re-render never re-registers the listener or captures a stale instance.
 * @returns {string} the combo currently bound to panic stop (for display).
 */
export function usePanicStop(capture) {
  const combo = useHotkeysStore((state) => resolvePanicStopCombo(state.bindings));

  const captureRef = useRef(capture);
  captureRef.current = capture;

  useEffect(() => {
    const manager = getHotkeyManager();
    const panic = () => {
      const active = captureRef.current;
      if (active && typeof active.teardown === 'function') {
        active.teardown();
      }
      // Belt and suspenders: even an instance we do not own (or a status
      // some other surface set) cannot stay "listening" after the panic key.
      useSpeechStore.getState().setStatus('idle');
    };
    // 'allow': a second mount (or a test) registering the same combo must
    // warn no one — every panic handler does the same idempotent thing.
    const handle = manager.register(combo, panic, { conflictBehavior: 'allow' });
    return () => handle.unregister();
  }, [combo]);

  return combo;
}

export default usePanicStop;
