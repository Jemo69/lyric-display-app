import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  safeGet,
  safeSet,
  safeRemove,
  readStoredString,
  writeStoredString,
  safeParseStoredValue,
  zustandPersistentStorage,
  configurePersistentStorage,
  resetPersistentStorageConfig,
  __testOnly,
} from '../persistentStorage.js';

const uniqueKey = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let realLocalStorage;

beforeEach(() => {
  resetPersistentStorageConfig();
  realLocalStorage = globalThis.localStorage;
  vi.restoreAllMocks();
});

afterEach(() => {
  resetPersistentStorageConfig();
  if (realLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = realLocalStorage;
  }
  vi.restoreAllMocks();
});

describe('safeGet / safeSet round-trip', () => {
  it('persists and restores JSON values under the same key (backward compatible)', () => {
    const key = uniqueKey('ld-persist');
    expect(safeSet(key, { fontSize: 64, nested: { a: [1, 2] } })).toBe(true);
    // Same key, raw localStorage payload — proves no key mangling for existing stores.
    const raw = globalThis.localStorage.getItem(key);
    expect(typeof raw).toBe('string');
    expect(JSON.parse(raw)).toEqual({ fontSize: 64, nested: { a: [1, 2] } });
    expect(safeGet(key, null)).toEqual({ fontSize: 64, nested: { a: [1, 2] } });
    safeRemove(key);
  });

  it('returns the fallback for missing keys without throwing', () => {
    expect(safeGet(uniqueKey('ld-missing'), 'fallback')).toBe('fallback');
    expect(safeGet(uniqueKey('ld-missing'), null)).toBeNull();
  });
});

describe('corruption handling', () => {
  it('evicts corrupt payloads, warns, and returns the fallback', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = uniqueKey('ld-corrupt');
    globalThis.localStorage.setItem(key, '{not-valid-json,,,');
    const fallback = { fresh: true };
    expect(safeGet(key, fallback)).toBe(fallback);
    // Corrupt entry is evicted so the next boot starts clean.
    expect(globalThis.localStorage.getItem(key)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    // The warning must not leak the payload value.
    const logged = warnSpy.mock.calls
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg)))
      .join(' ');
    expect(logged).not.toContain('not-valid-json');
  });

  it('safeParseStoredValue returns fallback for garbage without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(safeParseStoredValue('@@@', 42, uniqueKey('ld-garbage'))).toBe(42);
    expect(safeParseStoredValue(null, 42, 'k')).toBe(42);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('quota handling', () => {
  it('never throws on quota errors and keeps the value in memory', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quotaError = new Error('Quota exceeded');
    quotaError.name = 'QuotaExceededError';
    vi.spyOn(globalThis.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw quotaError;
    });
    const key = uniqueKey('ld-quota');
    expect(safeSet(key, { big: 'payload' })).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    // Session keeps working through the in-memory copy.
    expect(safeGet(key, null)).toEqual({ big: 'payload' });
    __testOnly.memoryBackend.delete(key);
  });
});

describe('missing localStorage fallback', () => {
  it('degrades to the in-memory backend without throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.localStorage = undefined;
    const key = uniqueKey('ld-mem');
    // Durable write fails everywhere, but nothing throws.
    expect(() => safeSet(key, { v: 1 })).not.toThrow();
    expect(safeGet(key, null)).toEqual({ v: 1 });
    expect(() => safeRemove(key)).not.toThrow();
    expect(safeGet(key, 'gone')).toBe('gone');
  });
});

describe('electron-store bridge', () => {
  it('mirrors writes to an injected electron-store-shaped bridge and reads back through it', () => {
    const store = new Map();
    configurePersistentStorage({
      electronStoreBridge: {
        get: (k) => (store.has(k) ? store.get(k) : undefined),
        set: (k, v) => store.set(k, v),
        delete: (k) => store.delete(k),
      },
    });
    const key = uniqueKey('ld-bridge');
    safeSet(key, { via: 'bridge' });
    expect(store.has(key)).toBe(true);
    // localStorage copy retained as source of truth.
    expect(JSON.parse(globalThis.localStorage.getItem(key))).toEqual({ via: 'bridge' });
    store.clear();
    globalThis.localStorage.removeItem(key);
    // Bridge-only value still resolves (stored string round-trips through JSON).
    store.set(key, JSON.stringify({ via: 'bridge' }));
    expect(safeGet(key, null)).toEqual({ via: 'bridge' });
    safeRemove(key);
  });

  it('survives a throwing bridge and falls back to localStorage', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    configurePersistentStorage({
      electronStoreBridge: {
        get: () => { throw new Error('bridge down'); },
        set: () => { throw new Error('bridge down'); },
        delete: () => { throw new Error('bridge down'); },
      },
    });
    const key = uniqueKey('ld-bridge-down');
    expect(() => safeSet(key, { ok: true })).not.toThrow();
    expect(safeGet(key, null)).toEqual({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
    safeRemove(key);
  });

  it('supports WebStorage-shaped bridges (getItem/setItem/removeItem)', () => {
    const store = new Map();
    configurePersistentStorage({
      electronStoreBridge: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
    });
    const key = uniqueKey('ld-web-bridge');
    expect(writeStoredString(key, '{"a":1}')).toBe(true);
    expect(readStoredString(key)).toEqual({ hit: true, raw: '{"a":1}' });
    safeRemove(key);
    expect(store.has(key)).toBe(false);
  });
});

describe('zustand storage engine', () => {
  it('implements the string getItem/setItem/removeItem contract zustand expects', () => {
    const key = uniqueKey('ld-zustand');
    zustandPersistentStorage.setItem(key, JSON.stringify({ state: { fontSize: 72 } }));
    expect(typeof zustandPersistentStorage.getItem(key)).toBe('string');
    expect(JSON.parse(zustandPersistentStorage.getItem(key))).toEqual({ state: { fontSize: 72 } });
    zustandPersistentStorage.removeItem(key);
    expect(zustandPersistentStorage.getItem(key)).toBeNull();
  });
});

describe('value hygiene', () => {
  it('refuses non-serializable values without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const circular = {};
    circular.self = circular;
    expect(safeSet(uniqueKey('ld-circular'), circular)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('never logs stored values, only keys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = uniqueKey('ld-secret');
    globalThis.localStorage.setItem(key, '###corrupt###');
    safeGet(key, { token: 'should-never-appear-in-logs' });
    const logged = warnSpy.mock.calls
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg)))
      .join(' ');
    expect(logged).toContain(key);
    expect(logged).not.toContain('should-never-appear-in-logs');
    expect(logged).not.toContain('###corrupt###');
  });
});
