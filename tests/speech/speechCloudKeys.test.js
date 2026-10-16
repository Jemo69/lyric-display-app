/**
 * speechCloudKeys — where a secret is allowed to live.
 *
 * The two load-bearing claims are (1) a key never leaves main in readable
 * form, and (2) there is NO plaintext fallback when the OS key store is
 * unavailable. Both are tested directly, because a credential store is the
 * one component where a plausible-looking fallback is a security hole rather
 * than a rough edge.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const KEY = 'dg_live_0123456789abcdef0123456789';

/**
 * A fake keyring that is obviously a fake: it XORs with a constant so a
 * test can assert the file on disk is NOT the plaintext.
 */
const fakeKeyring = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (text) => Buffer.from([...Buffer.from(text)].map((b) => b ^ 0x5a)),
  decryptString: (buf) => Buffer.from([...buf].map((b) => b ^ 0x5a)).toString('utf8'),
});

describe('speechCloudKeys', () => {
  let dir;
  let createStore;
  let speechCloudKeys;
  let CLOUD_KEY_FILE;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ld-keys-'));
    // electron is not available in vitest; the module imports it for
    // `app`/`safeStorage` defaults, so it is stubbed before import.
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { getPath: () => dir },
      safeStorage: fakeKeyring(true),
    }));
    speechCloudKeys = await import('../../main/speechCloudKeys.js');
    createStore = speechCloudKeys.createCloudKeyStore;
    CLOUD_KEY_FILE = speechCloudKeys.CLOUD_KEY_FILE;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.doUnmock('electron');
  });

  it('stores a key encrypted — the file on disk is not the key', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    const saved = await store.setKey('deepgram', KEY);
    expect(saved.ok).toBe(true);

    const raw = readFileSync(join(dir, CLOUD_KEY_FILE), 'utf8');
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain('dg_live');
    // And it is still recoverable, so the key is not merely destroyed.
    const status = await store.status();
    expect(status.providers.deepgram.usable).toBe(true);
  });

  it('status never returns key material, at any length', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    await store.setKey('deepgram', KEY);
    const status = await store.status();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain('dg_live_01234567');
    // Only the masked tail.
    expect(status.providers.deepgram.masked.endsWith('6789')).toBe(true);
  });

  it('a key survives a restart — the whole point of storing one', async () => {
    const first = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    await first.setKey('assemblyai', KEY);
    // A brand-new store instance: no in-memory carry-over.
    const second = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    const status = await second.status();
    expect(status.providers.assemblyai).toMatchObject({ stored: true, usable: true });
  });

  // No plaintext fallback, ever. A shared church laptop is the reason.
  it('refuses to store anything when the key store is unavailable', async () => {
    const store = createStore({ safeStorage: fakeKeyring(false), userDataDir: dir });
    const result = await store.setKey('deepgram', KEY);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('key-store-unavailable');
    // And nothing was written.
    expect(existsSync(join(dir, CLOUD_KEY_FILE))).toBe(false);
  });

  it('says the key store is unavailable, and offers a way out', async () => {
    const store = createStore({ safeStorage: fakeKeyring(false), userDataDir: dir });
    const result = await store.setKey('deepgram', KEY);
    expect(result.message).toMatch(/will not save your API key/i);
    expect(result.message).toMatch(/This Device/i);
  });

  it('checks availability per call, not once at startup', async () => {
    // Availability can change under a running app: a keyring can unlock.
    const ring = fakeKeyring(false);
    const store = createStore({ safeStorage: ring, userDataDir: dir });
    expect((await store.setKey('deepgram', KEY)).ok).toBe(false);
    ring.isEncryptionAvailable = () => true;
    expect((await store.setKey('deepgram', KEY)).ok).toBe(true);
  });

  it('rejects a bad key BEFORE touching the keyring', async () => {
    const ring = fakeKeyring();
    const store = createStore({ safeStorage: ring, userDataDir: dir });
    let encryptCalls = 0;
    ring.encryptString = () => {
      encryptCalls += 1;
      return Buffer.from('x');
    };
    expect((await store.setKey('deepgram', 'too-short')).code).toBe('key-too-short');
    expect(encryptCalls).toBe(0);
  });

  it('will not store a key for a provider we do not offer', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    expect((await store.setKey('my-own-server', KEY)).code).toBe('unknown-cloud-provider');
  });

  it('reports a key it cannot decrypt as stored-but-unusable, not as fine', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    await store.setKey('deepgram', KEY);

    // A keyring that cannot decrypt (wrong machine profile, rotated key).
    const broken = createStore({
      safeStorage: { ...fakeKeyring(), decryptString: () => { throw new Error('nope'); } },
      userDataDir: dir,
    });
    const status = await broken.status();
    expect(status.providers.deepgram).toMatchObject({ stored: true, usable: false, code: 'key-undecryptable' });
  });

  it('a corrupt key file is reported, not silently treated as empty', async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, CLOUD_KEY_FILE), '{ not json', 'utf8');
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    const status = await store.status();
    expect(status.providers).toEqual({});
    expect((await store.setKey('deepgram', KEY)).ok).toBe(false);
  });

  it('a missing key file is an empty store, not an error', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    const status = await store.status();
    expect(status.providers).toEqual({});
    expect(status.available).toBe(true);
  });

  it('clearing one provider leaves the others alone', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    await store.setKey('deepgram', KEY);
    await store.setKey('assemblyai', 'aa_live_0123456789abcdef0123456789');
    await store.clearKey('deepgram');
    const status = await store.status();
    expect(status.providers.deepgram).toBeUndefined();
    expect(status.providers.assemblyai.usable).toBe(true);
  });

  it('clearing an absent key succeeds and says nothing was removed', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    expect(await store.clearKey('deepgram')).toMatchObject({ ok: true, removed: false });
  });

  // Phase 6's erase calls this. A key that outlives 'erase everything' is a
  // credential the next person can spend the operator's money with.
  it('clearAll removes every provider key and reports the count', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    await store.setKey('deepgram', KEY);
    await store.setKey('assemblyai', 'aa_live_0123456789abcdef0123456789');
    const cleared = await store.clearAll();
    expect(cleared).toMatchObject({ ok: true, cleared: 2 });
    expect((await store.status()).providers).toEqual({});
  });

  it('clearAll on an empty store is a no-op, not a failure', async () => {
    const store = createStore({ safeStorage: fakeKeyring(), userDataDir: dir });
    expect(await store.clearAll()).toMatchObject({ ok: true, cleared: 0 });
  });
});
