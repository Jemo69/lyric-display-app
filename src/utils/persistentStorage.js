import { createLogger } from './logger.js';

const log = createLogger('PersistentStorage');

/**
 * Safe persistent storage bridge (missing-feature #05, piece 1 of 3).
 *
 * Why this exists: today every zustand store persists straight to raw
 * `localStorage`. On church PCs that means a single corrupt value (crashed
 * write, full disk, private-mode quota) throws during boot/rehydrate and can
 * wedge the whole control panel. This module is the single chokepoint for
 * persistence with three guarantees:
 *
 *   1. Never throws to the UI — every failure degrades to a fallback value
 *      plus a logger warning (keys and byte sizes only, never values).
 *   2. Backward compatible — same keys as today, no prefixes, no renames.
 *      Existing `lyrics-store` / `bible-store` / `hotkeys-store` payloads
 *      rehydrate untouched.
 *   3. electron-store bridge when available, localStorage otherwise, in-memory
 *      Map as the last resort (SSR, tests, private mode).
 *
 * The electron-store bridge is injectable because the renderer cannot
 * `require('electron-store')` directly — it must go through IPC/preload.
 * Pass a bridge shaped like electron-store (`get`/`set`/`delete`) or like
 * WebStorage (`getItem`/`setItem`/`removeItem`); see `configurePersistentStorage`.
 * Until the preload/IPC side exposes `window.electronAPI.persistentStore`
 * (tracked as a follow-up), the bridge auto-detects that namespace when
 * present and otherwise uses localStorage — behaviour is unchanged.
 */

const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

const isQuotaError = (error) => {
  if (!error || typeof error !== 'object') return false;
  if (QUOTA_ERROR_NAMES.has(error.name)) return true;
  // Legacy IE/Edge signal quota via code 22 on a generic Error/DOMException.
  return error.code === 22;
};

// Last-resort memory backend. Module-level so it survives for the session.
const memoryBackend = new Map();

let injectedBridge = null;

export const configurePersistentStorage = ({ electronStoreBridge } = {}) => {
  injectedBridge = electronStoreBridge ?? null;
};

export const resetPersistentStorageConfig = () => {
  injectedBridge = null;
};

const detectPreloadBridge = () => {
  try {
    const candidate = globalThis.window?.electronAPI?.persistentStore;
    if (candidate && typeof candidate === 'object') return candidate;
  } catch {
    // Accessing window globals must never break storage.
  }
  return null;
};

const getBridge = () => injectedBridge ?? detectPreloadBridge();

const pickFn = (obj, names) => {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return null;
  for (const name of names) {
    if (typeof obj[name] === 'function') return obj[name].bind(obj);
  }
  return null;
};

const readBridgeString = (bridge, key) => {
  const read = pickFn(bridge, ['get', 'getItem']);
  if (!read) return { hit: false };
  const value = read(key);
  if (value === undefined || value === null) return { hit: false };
  return { hit: true, raw: typeof value === 'string' ? value : JSON.stringify(value) };
};

const writeBridgeString = (bridge, key, raw) => {
  const write = pickFn(bridge, ['set', 'setItem']);
  if (!write) return false;
  write(key, raw);
  return true;
};

const removeBridgeKey = (bridge, key) => {
  const remove = pickFn(bridge, ['delete', 'remove', 'removeItem', 'clear']);
  if (!remove) return;
  // electron-store exposes .delete(key) and .clear() (whole store); never clear.
  if (remove.name === 'bound clear') return;
  remove(key);
};

const readLocalString = (key) => {
  try {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
      return { hit: false };
    }
    const raw = globalThis.localStorage.getItem(key);
    return raw === null ? { hit: false } : { hit: true, raw };
  } catch (error) {
    log.warn('persistent storage read failed, using fallback', { key, error: error?.name || 'Error' });
    return { hit: false };
  }
};

const writeLocalString = (key, raw) => {
  try {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
      return false;
    }
    globalThis.localStorage.setItem(key, raw);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      log.warn('persistent storage quota exceeded, value kept in memory only', { key, bytes: raw?.length ?? 0 });
    } else {
      log.warn('persistent storage write failed, value kept in memory only', { key, error: error?.name || 'Error' });
    }
    return false;
  }
};

const removeLocalKey = (key) => {
  try {
    globalThis.localStorage?.removeItem?.(key);
  } catch (error) {
    log.warn('persistent storage remove failed', { key, error: error?.name || 'Error' });
  }
};

/**
 * Read the raw stored string for a key. Resolution order: preload/injected
 * electron-store bridge → localStorage → in-memory fallback. Returns
 * `{ hit, raw }` and never throws.
 */
export const readStoredString = (key) => {
  try {
    const bridge = getBridge();
    if (bridge) {
      try {
        const fromBridge = readBridgeString(bridge, key);
        if (fromBridge.hit) return fromBridge;
      } catch (error) {
        log.warn('electron-store bridge read failed, falling back to localStorage', {
          key,
          error: error?.name || 'Error',
        });
      }
    }
    const fromLocal = readLocalString(key);
    if (fromLocal.hit) return fromLocal;
    if (memoryBackend.has(key)) return { hit: true, raw: memoryBackend.get(key) };
    return { hit: false, raw: null };
  } catch (error) {
    log.warn('persistent storage read failed, using fallback', { key, error: error?.name || 'Error' });
    return { hit: false, raw: null };
  }
};

/**
 * Write a raw string for a key. localStorage stays the source of truth (same
 * keys as today); the electron-store bridge is mirrored best-effort; the
 * in-memory copy is always updated so the session keeps working under quota
 * pressure. Returns true when at least one durable backend accepted the
 * write. Never throws.
 */
export const writeStoredString = (key, raw) => {
  const value = typeof raw === 'string' ? raw : String(raw ?? '');
  try {
    memoryBackend.set(key, value);
  } catch {
    // Memory set cannot realistically fail; ignore regardless.
  }
  let durable = false;
  if (writeLocalString(key, value)) durable = true;
  const bridge = getBridge();
  if (bridge) {
    try {
      if (writeBridgeString(bridge, key, value)) durable = true;
    } catch (error) {
      log.warn('electron-store bridge write failed, localStorage copy retained', {
        key,
        error: error?.name || 'Error',
      });
    }
  }
  return durable;
};

/** Remove a key from every backend. Never throws. */
export const removeStoredKey = (key) => {
  try {
    memoryBackend.delete(key);
  } catch {
    // Ignore.
  }
  removeLocalKey(key);
  const bridge = getBridge();
  if (bridge) {
    try {
      removeBridgeKey(bridge, key);
    } catch (error) {
      log.warn('electron-store bridge remove failed', { key, error: error?.name || 'Error' });
    }
  }
};

/**
 * Parse a stored JSON string. On corruption: warn (key + error name only),
 * evict the corrupt entry so the next boot starts clean, return fallback.
 * Never throws.
 */
export const safeParseStoredValue = (raw, fallback, key) => {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    log.warn('persistent storage payload corrupt, evicting key and using fallback', {
      key,
      error: error?.name || 'Error',
    });
    if (key) removeStoredKey(key);
    return fallback;
  }
};

/** JSON get with fallback. Never throws, never logs values. */
export const safeGet = (key, fallback = null) => {
  const { hit, raw } = readStoredString(key);
  if (!hit) return fallback;
  return safeParseStoredValue(raw, fallback, key);
};

/** JSON set. Returns true when a durable backend accepted it. Never throws. */
export const safeSet = (key, value) => {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (error) {
    log.warn('persistent storage value not serializable, write skipped', {
      key,
      error: error?.name || 'Error',
    });
    return false;
  }
  if (typeof raw !== 'string') return false;
  return writeStoredString(key, raw);
};

/** Remove a key from every backend. Never throws. */
export const safeRemove = (key) => {
  removeStoredKey(key);
};

/**
 * Zustand `persist` storage engine over the safe bridge. String-based, so it
 * is a drop-in for the default localStorage engine with identical keys and
 * payload shape — existing persisted settings rehydrate untouched.
 */
export const zustandPersistentStorage = {
  getItem: (key) => {
    const { hit, raw } = readStoredString(key);
    return hit ? raw : null;
  },
  setItem: (key, value) => {
    writeStoredString(key, typeof value === 'string' ? value : String(value ?? ''));
  },
  removeItem: (key) => {
    removeStoredKey(key);
  },
};

export const __testOnly = { memoryBackend, isQuotaError };
