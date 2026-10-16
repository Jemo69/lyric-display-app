/*
 * main/speechCloudKeys.js — where a cloud API key actually lives (Phase 5).
 *
 * The renderer used to have a password box whose placeholder said
 * "not stored". That was honest but useless: a key nobody can save is a key
 * that must be retyped every Sunday, and the natural next step someone
 * reaches for is pasting it into localStorage.
 *
 * ## The rule
 *
 * A cloud key goes in the OS key store via Electron's safeStorage, or it is
 * NOT STORED. There is no plaintext fallback. safeStorage is unavailable on a
 * Linux box with no keyring at all, and in that case this module says
 * "key-store-unavailable" and refuses — because a key written in the clear to
 * a shared church laptop, readable by the next person who logs in, is worse
 * than the friction of not having one.
 *
 * ## The key never comes back to the renderer
 *
 * There is no "get key" call. status() reports whether a key exists, for
 * which provider, and a masked tail — enough to confirm the right key was
 * pasted, and not enough to use. The renderer cannot read it because the
 * renderer cannot reach it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { findCloudProvider, checkCloudKeyShape, maskCloudKey } from '../shared/speech/cloudPolicy.js';
import createMainLogger from './logger.js';

const log = createMainLogger('SpeechCloudKeys');

/** Path under userData. Holds ciphertext only — never a readable key. */
export const CLOUD_KEY_FILE = 'cloud-keys.v1.json';

/**
 * Is the OS key store usable right now?
 *
 * safeStorage.isEncryptionAvailable() is false in some Linux sessions and
 * false on a machine that has just booted with no keyring unlocked. Checking
 * per call rather than once at startup matters: availability can change under
 * a long-running app, and caching a "yes" from boot would write plaintext
 * later.
 *
 * @param {object} [ring] injectable safeStorage
 * @returns {{available: boolean, reason: string}}
 */
export function keyStoreAvailability(ring = safeStorage) {
  try {
    if (typeof ring?.isEncryptionAvailable === 'function' && !ring.isEncryptionAvailable()) {
      return {
        available: false,
        reason:
          'This computer has no secure key store available right now, so LyricDisplay will not save your API key. Use “This Device” instead, or unlock your system keyring and try again.',
      };
    }
    if (typeof ring?.encryptString !== 'function') {
      return { available: false, reason: 'This build cannot store keys securely.' };
    }
    return { available: true, reason: '' };
  } catch (error) {
    // Never the exception's message: it can contain a path.
    log.warn('Key store probe failed: ' + (error?.code ?? error?.name ?? 'Error'));
    return { available: false, reason: 'This computer could not be asked about secure key storage.' };
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build the credential store over an injected keyring.
 *
 * Every dependency is a parameter — the keyring, the userData dir, and the
 * clock — so the whole module is testable against a fake keyring with no
 * electron, no real disk, and no real key anywhere near it.
 *
 * @param {object} [deps]
 * @param {object} [deps.safeStorage] electron's safeStorage, or a fake
 * @param {string} [deps.userDataDir]
 * @param {() => number} [deps.now]
 */
export function createCloudKeyStore({ safeStorage: ring = null, userDataDir = null, now = () => Date.now() } = {}) {
  const keyring = ring ?? safeStorage;
  const dir = userDataDir ?? (typeof app?.getPath === 'function' ? app.getPath('userData') : null);

  const readFile = async () => {
    if (!dir) return { ok: false, code: 'no-user-data-dir', message: 'No storage location is available.' };
    try {
      const raw = await fs.readFile(path.join(dir, CLOUD_KEY_FILE), 'utf8');
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed) || !isPlainObject(parsed.keys)) {
        return { ok: false, code: 'corrupt-key-store', message: 'The saved key file could not be read.' };
      }
      return { ok: true, code: 'ok', message: '', keys: parsed.keys };
    } catch (error) {
      if (error?.code === 'ENOENT') return { ok: true, code: 'ok', message: '', keys: {} };
      log.warn('Key store read failed: ' + (error?.code ?? error?.name ?? 'Error'));
      return { ok: false, code: 'key-store-unreadable', message: 'The saved keys could not be read.' };
    }
  };

  const writeFile = async (keys) => {
    if (!dir) return { ok: false, code: 'no-user-data-dir', message: 'No storage location is available.' };
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, CLOUD_KEY_FILE),
        JSON.stringify({ keys, updatedAt: now() }, null, 2),
        { encoding: 'utf8', mode: 0o600 }
      );
      return { ok: true, code: 'ok', message: '' };
    } catch (error) {
      log.warn('Key store write failed: ' + (error?.code ?? error?.name ?? 'Error'));
      return { ok: false, code: 'key-store-unwritable', message: 'The key could not be saved.' };
    }
  };

  /**
   * Save a key for a provider.
   *
   * Refuses when the key store is unavailable rather than falling back to
   * plaintext. That refusal is the whole point of the module.
   */
  const setKey = async (providerId, key) => {
    const provider = findCloudProvider(providerId);
    if (!provider) {
      return { ok: false, code: 'unknown-cloud-provider', message: 'Choose a cloud provider first.' };
    }
    const shape = checkCloudKeyShape(key, provider.id);
    if (!shape.ok) return { ok: false, code: shape.code, message: shape.message };

    const availability = keyStoreAvailability(keyring);
    if (!availability.available) {
      return { ok: false, code: 'key-store-unavailable', message: availability.reason };
    }

    let ciphertext;
    try {
      ciphertext = keyring.encryptString(String(key).trim()).toString('base64');
    } catch (error) {
      log.warn('Key encrypt failed: ' + (error?.code ?? error?.name ?? 'Error'));
      return { ok: false, code: 'key-encrypt-failed', message: 'The key could not be encrypted.' };
    }

    const read = await readFile();
    if (!read.ok) return read;
    const written = await writeFile({ ...read.keys, [provider.id]: ciphertext });
    if (!written.ok) return written;

    // The provider id and a masked tail only. The value itself goes nowhere.
    log.info('Saved cloud key for ' + provider.id);
    return { ok: true, code: 'ok', message: '', providerId: provider.id, masked: maskCloudKey(key) };
  };

  /**
   * What the renderer is allowed to know.
   *
   * No key material, at any length, ever. A UI that could read the key would
   * eventually put it in a place it should not be.
   */
  const status = async () => {
    const availability = keyStoreAvailability(keyring);
    const read = await readFile();
    if (!read.ok) {
      return {
        available: availability.available,
        availabilityReason: availability.reason,
        providers: {},
      };
    }

    const providers = {};
    for (const [providerId, ciphertext] of Object.entries(read.keys)) {
      const provider = findCloudProvider(providerId);
      if (!provider) continue; // a provider we no longer offer: not reported
      let masked = '';
      let shapeOk = false;
      try {
        // Decrypted ONLY to derive a mask. The plaintext is never returned,
        // never stored anywhere that escapes, and never logged.
        const plaintext = keyring.decryptString(Buffer.from(String(ciphertext), 'base64'));
        masked = maskCloudKey(plaintext);
        shapeOk = checkCloudKeyShape(plaintext, provider.id).ok;
      } catch (error) {
        log.warn('Key decrypt failed for ' + providerId + ': ' + (error?.code ?? error?.name ?? 'Error'));
        // A key that cannot be decrypted is worse than no key: report it as
        // present-but-unusable rather than pretending the machine is fine.
        providers[provider.id] = { stored: true, masked: '', usable: false, code: 'key-undecryptable' };
        continue;
      }
      providers[provider.id] = { stored: true, masked, usable: shapeOk };
    }

    return {
      available: availability.available,
      availabilityReason: availability.reason,
      providers,
    };
  };

  /** Forget a provider's key. Idempotent — removing an absent key succeeds. */
  const clearKey = async (providerId) => {
    const provider = findCloudProvider(providerId);
    if (!provider) {
      return { ok: false, code: 'unknown-cloud-provider', message: 'Choose a cloud provider first.' };
    }
    const read = await readFile();
    if (!read.ok) return read;
    if (!(provider.id in read.keys)) {
      return { ok: true, code: 'ok', message: '', providerId: provider.id, removed: false };
    }
    const rest = { ...read.keys };
    delete rest[provider.id];
    const written = await writeFile(rest);
    if (written.ok) log.info('Cleared cloud key for ' + provider.id);
    return {
      ok: written.ok,
      code: written.code,
      message: written.message,
      providerId: provider.id,
      removed: written.ok,
    };
  };

  /**
   * Remove EVERY cloud key.
   *
   * Called by the Phase 6 erase. A key that outlives "erase everything" is a
   * credential the next person with the laptop can spend the operator's money
   * with, so it is part of what "everything" means — not an extra.
   */
  const clearAll = async () => {
    const read = await readFile();
    if (!read.ok) return { ok: false, code: read.code, message: read.message };
    const count = Object.keys(read.keys).length;
    if (count === 0) return { ok: true, code: 'ok', message: '', cleared: 0 };
    const written = await writeFile({});
    if (written.ok) log.info('Cleared ' + count + ' cloud key(s) during erase');
    return { ok: written.ok, code: written.code, message: written.message, cleared: written.ok ? count : 0 };
  };

  return {
    setKey,
    status,
    clearKey,
    clearAll,
    keyStoreAvailability: () => keyStoreAvailability(keyring),
  };
}

export default createCloudKeyStore;
