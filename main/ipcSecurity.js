/**
 * ipcSecurity.js — sender validation for sensitive IPC handlers (#12).
 *
 * Threat: any renderer with the preload bridge can `invoke()` any channel.
 * The in-app browser hosts remote web content, and a compromised/navigated
 * window must not be able to mint JWTs, read the admin key, touch the token
 * store, write files, fire network requests, or rotate secrets.
 *
 * Policy: a sensitive handler only serves senders whose owning BrowserWindow
 * currently shows app content — `file://` (production), `app://`, or a
 * loopback dev server (`localhost` / `127.0.0.1` / `::1` over http/https).
 *
 * Fail-open ONLY when there is no sender to validate (unit-test invocation
 * of a handler with no Electron event). A determinable but untrusted sender
 * is fail-closed. Every rejection is logged without payload details and
 * never includes tokens/secrets.
 */
import { BrowserWindow } from 'electron';
import createMainLogger from './logger.js';

const log = createMainLogger('IPCSecurity');

function isLoopbackHost(host) {
  const normalized = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  );
}

export function isAllowedAppUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('file://')) return true;
  if (trimmed.startsWith('app://')) return true;
  const match = trimmed.match(/^(https?):\/\/([^/:?#]+)(?::(\d+))?/i);
  if (!match) return false;
  return isLoopbackHost(match[2]);
}

/**
 * True when `event` comes from a trusted app window (or when there is no
 * sender to validate, e.g. unit tests invoking handlers directly).
 */
export function isTrustedIpcSender(event) {
  try {
    const sender = event?.sender;
    if (!sender) return true;

    const fromWebContents =
      typeof BrowserWindow?.fromWebContents === 'function'
        ? BrowserWindow.fromWebContents
        : null;
    if (!fromWebContents) return true;

    let win = null;
    try {
      win = fromWebContents(sender);
    } catch {
      return false;
    }
    if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return false;

    let url = '';
    try {
      url = win.webContents?.getURL?.() || '';
    } catch {
      return false;
    }
    // A window mid-navigation has no committed URL yet; nothing to judge.
    if (!url) return true;

    if (!isAllowedAppUrl(url)) {
      log.warn('Blocked IPC from untrusted window URL');
      return false;
    }
    return true;
  } catch (error) {
    log.warn('IPC sender validation failed closed:', error?.message || error);
    return false;
  }
}

export function untrustedIpcResponse(channel) {
  return { success: false, error: `Untrusted IPC sender blocked (${channel})` };
}
