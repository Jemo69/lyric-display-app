/**
 * Pure session-permission decision logic for Live Sermon Assist.
 *
 * This module must import NOTHING from `electron` — it is the unit-testable
 * core of the permission handlers wired up in main.js. Keep it pure.
 *
 * Security rule (plan): microphone-capable permissions are granted on the
 * control window ONLY. Output, stage, dynamic-output, loading and dock
 * windows are denied, so a stray output route can never open a microphone.
 */

/** Permissions that expose a capture device (mic / camera) to the renderer. */
export const MEDIA_PERMISSIONS = ['media', 'audioCapture', 'videoCapture'];

/**
 * Permissions the app already relies on today, or that must keep their
 * default behaviour so this change cannot regress existing features:
 *  - fullscreen / pointerLock: preserve pre-existing pass-through behaviour.
 *  - clipboard-read: src/hooks/NewSongCanvas/useEditorClipboard.js calls
 *    navigator.clipboard.readText().
 *  - clipboard-sanitized-write: navigator.clipboard.writeText() is used in
 *    QRCodeDialog, AuthStatusIndicator, MidiOscSettings, LyricsList, etc.
 */
export const PASSTHROUGH_PERMISSIONS = [
  'fullscreen',
  'pointerLock',
  'clipboard-read',
  'clipboard-sanitized-write',
];

/**
 * Decide whether a requesting webContents is the control window.
 *
 * Pure on purpose: main.js gathers Electron state (window identity and
 * destroyed-ness) and passes it in as plain data.
 *
 * @param {Object} state
 * @param {number|null} state.requestWebContentsId id of the requesting contents
 * @param {number|null} state.controlWebContentsId id of the control window's contents
 * @param {boolean} state.controlWindowAvailable control window exists and is not destroyed
 * @returns {boolean}
 */
export function resolveControlWindowMatch({
  requestWebContentsId = null,
  controlWebContentsId = null,
  controlWindowAvailable = false,
} = {}) {
  // Control window not created yet, or destroyed mid-session → nobody matches.
  if (!controlWindowAvailable) return false;
  if (requestWebContentsId == null || controlWebContentsId == null) return false;
  return requestWebContentsId === controlWebContentsId;
}

/**
 * The scoping rule for microphone-capable permissions.
 *
 * @param {Object} state
 * @param {string} state.permissionName Electron permission name
 * @param {boolean} state.isControlWindow requester is the control window
 * @param {boolean} state.isQuitting app is shutting down
 * @returns {boolean}
 */
export function shouldGrantMedia({
  permissionName,
  isControlWindow = false,
  isQuitting = false,
} = {}) {
  if (!MEDIA_PERMISSIONS.includes(permissionName)) return false;
  if (isQuitting) return false;
  return isControlWindow === true;
}

/**
 * Full decision for any Electron permission name.
 *
 * @param {Object} state
 * @param {string} state.permissionName Electron permission name
 * @param {boolean} state.isControlWindow requester is the control window
 * @param {boolean} state.isQuitting app is shutting down
 * @returns {{ allowed: boolean, reason: string }}
 *   reason is one of: 'media-granted', 'media-denied-not-control-window',
 *   'media-denied-quitting', 'passthrough', 'denied-unmapped'.
 */
export function decidePermission({
  permissionName,
  isControlWindow = false,
  isQuitting = false,
} = {}) {
  if (MEDIA_PERMISSIONS.includes(permissionName)) {
    if (isQuitting) return { allowed: false, reason: 'media-denied-quitting' };
    if (isControlWindow !== true) {
      return { allowed: false, reason: 'media-denied-not-control-window' };
    }
    return { allowed: true, reason: 'media-granted' };
  }

  if (PASSTHROUGH_PERMISSIONS.includes(permissionName)) {
    return { allowed: true, reason: 'passthrough' };
  }

  // Nothing in the app maps to this permission: deny, but let the caller
  // log it at info level rather than fail silently.
  return { allowed: false, reason: 'denied-unmapped' };
}
