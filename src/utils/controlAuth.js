import { createLogger } from './logger.js';

const log = createLogger('ControlAuth');

/**
 * Resolve a bearer token for control-panel API calls (feature #03).
 * Mirrors the lookup order used by ConnectionDiagnosticsModal: Electron
 * secure token store, then the desktop JWT bridge, then the persisted
 * web/mobile token in localStorage. Never logs the token itself.
 */
export async function getControlAuthToken() {
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        const stored = await window.electronAPI.tokenStore.get({
          clientType: 'desktop',
          deviceId: localStorage.getItem('lyric_display_device_id'),
        });
        if (stored?.token) return stored.token;
      } catch (err) {
        log.warn('Secure token store lookup failed, trying desktop JWT bridge');
      }

      try {
        const deviceId = localStorage.getItem('lyric_display_device_id')
          || `device_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const token = await window.electronAPI.getDesktopJWT({ deviceId, sessionId });
        if (token) return token;
      } catch (err) {
        log.warn('Desktop JWT bridge lookup failed, trying localStorage token');
      }
    }

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const deviceId = localStorage.getItem('lyric_display_device_id');
      const clientType = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'web';
      const stored = deviceId ? localStorage.getItem(`lyric_display_token_${clientType}_${deviceId}`) : null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.token) return parsed.token;
        } catch {
          log.warn('Stored control token is not valid JSON');
        }
      }
    }
  } catch (err) {
    log.warn('Control auth token lookup failed');
  }
  return null;
}
