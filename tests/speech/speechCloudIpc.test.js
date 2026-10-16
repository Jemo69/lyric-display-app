/**
 * tests/speech/speechCloudIpc.test.js — the cloud gate, driven through IPC.
 *
 * The point of this file is that the gate is proven against the REAL handlers
 * a renderer can reach, with electron mocked. Calling decideCloudStart()
 * directly would prove the function works; it would not prove a renderer
 * cannot route around it. That is the failure that matters: audio leaving a
 * church laptop without anyone having said yes.
 *
 * No network, no spawn, no real keyring. The credential store is a stub whose
 * `status` a test can reshape, because what is being tested is the DECISION
 * made from that status, not the encryption (see speechCloudKeys.test.js).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  registerSpeechIpc,
  SPEECH_INVOKE_CHANNELS,
  SPEECH_EVENT_CHANNELS,
} from '../../main/speechIpc.js';
import { CLOUD_ACK_VERSION, CLOUD_ACK_TEXT } from '../../shared/speech/cloudPolicy.js';

const electron = vi.hoisted(() => ({ handlers: new Map() }));
vi.mock('electron', () => ({
  app: { getPath: (name) => path.join(electron.appDir, name) },
  safeStorage: { isEncryptionAvailable: () => true },
  ipcMain: {
    handle: (channel, handler) => electron.handlers.set(channel, handler),
    removeHandler: (channel) => electron.handlers.delete(channel),
  },
}));

const SECRET = 'dg_live_0123456789abcdef0123456789';
const STORED = { deepgram: { stored: true, masked: '\u2022\u2022\u2022\u2022' + '6789', usable: true } };

describe('cloud: a stored key and an explicit yes, or no audio leaves', () => {
  let base;
  let registered;
  let cloud;
  let ackFile;

  // The panel tells main which provider is selected, and the gate reads the
  // same state. Declaring it here is how a real renderer behaves.
  const invoke = (channel, payload) => {
    const handler = electron.handlers.get(channel);
    if (!handler) throw new Error('no handler registered for ' + channel);
    return handler(null, payload);
  };

  const select = (cloudProviderId) =>
    invoke('speech:cloud-status', { where: 'cloud', cloudProviderId });

  // One registration for the whole file: registerSpeechIpc is a module-level
  // singleton, so re-registering per test would return the stale handle
  // without re-registering handlers once the map is cleared.
  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-ipc-'));
    electron.appDir = base;
    ackFile = path.join(base, 'cloud-ack.json');

    cloud = {
      // A FUNCTION, matching the real store's API. An earlier draft used a
      // plain object, so `await keyStore.status()` threw, the catch in
      // cloudState() swallowed it, and every test silently saw an empty
      // store — the failure mode this suite exists to catch.
      status: vi.fn(async () => ({ available: true, availabilityReason: '', providers: {} })),
      setKey: vi.fn(async () => ({ ok: true, code: 'ok', message: '' })),
      clearKey: vi.fn(async () => ({ ok: true, code: 'ok', removed: true })),
      clearAll: vi.fn(async () => ({ ok: true, cleared: 0 })),
    };

    registered = registerSpeechIpc({
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: () => {} },
      }),
      engineRoots: [],
      endpoint: null,
      engineToken: null,
      modelsDir: path.join(base, 'models'),
      historyDir: path.join(base, 'history'),
      cloudKeys: cloud,
      cloudAckFile: ackFile,
    });
  });

  // Reset only what a test may have changed. The acknowledgement is a file on
  // disk, so it has to go between tests or a withdrawn yes leaks into the
  // next one.
  beforeEach(() => {
    fs.rmSync(ackFile, { force: true });
    cloud.status.mockResolvedValue({
      available: true,
      availabilityReason: '',
      providers: {},
    });
    cloud.setKey.mockClear();
    cloud.clearKey.mockClear();
    cloud.clearAll.mockReset();
    cloud.clearAll.mockImplementation(async () => ({ ok: true, cleared: 0 }));
  });

  afterAll(async () => {
    registered?.dispose?.();
    registered = null;
    if (base) await fsp.rm(base, { recursive: true, force: true });
  });

  it('adds three invokes and keeps the pinned set at 16', () => {
    expect([...electron.handlers.keys()].sort()).toEqual([...SPEECH_INVOKE_CHANNELS].sort());
    // DELIBERATE CHANGE (Phase 5): 13 -> 16. The set stays pinned and is
    // mirrored by tests/speech/invariants.test.js; only the count moved, in
    // the same change that added the channels.
    expect(SPEECH_INVOKE_CHANNELS).toHaveLength(16);
    expect(SPEECH_EVENT_CHANNELS).toHaveLength(6);
  });

  it('refuses a cloud start with nothing set up, and names what is missing', async () => {
    const bare = await select(null);
    expect(bare.canStart).toBe(false);
    expect(bare.blockedBy).toBe('no-cloud-provider');
  });

  // The refusal must quote the wording, so the warning shown and the warning
  // enforced cannot be two different sentences.
  it('a provider without consent is refused, quoting the wording', async () => {
    cloud.status.mockResolvedValue({ available: true, availabilityReason: '', providers: { ...STORED } });
    const reply = await invoke('speech:start', {
      enabled: true,
      where: 'cloud',
      cloudProviderId: 'deepgram',
    });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('cloud-not-acknowledged');
    expect(reply.message).toBe(CLOUD_ACK_TEXT);
  });

  it('consent without a stored key is still refused', async () => {
    await invoke('speech:cloud-acknowledge', { acknowledged: true });
    cloud.status.mockResolvedValue({ available: true, availabilityReason: '', providers: {} });
    const reply = await invoke('speech:start', {
      enabled: true,
      where: 'cloud',
      cloudProviderId: 'deepgram',
    });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('no-stored-key');
  });

  it('a key the machine reports as unusable does not open the gate', async () => {
    await invoke('speech:cloud-acknowledge', { acknowledged: true });
    cloud.status.mockResolvedValue({
      available: true,
      availabilityReason: '',
      providers: { deepgram: { stored: true, masked: '', usable: false, code: 'key-undecryptable' } },
    });
    const status = await select('deepgram');
    expect(status.canStart).toBe(false);
    expect(status.blockedBy).toBe('no-stored-key');
  });

  it('both present: the gate opens and says so without hedging', async () => {
    await invoke('speech:cloud-acknowledge', { acknowledged: true });
    cloud.status.mockResolvedValue({ available: true, availabilityReason: '', providers: { ...STORED } });
    const status = await select('deepgram');
    expect(status.acknowledged).toBe(true);
    expect(status.canStart).toBe(true);
    expect(status.blockedBy).toBeNull();
    expect(status.blockedMessage).toBe('');
  });

  // Consent is revocable, and revoking it closes the gate again.
  it('withdrawing the yes closes the path again', async () => {
    cloud.status.mockResolvedValue({ available: true, availabilityReason: '', providers: { ...STORED } });
    await invoke('speech:cloud-acknowledge', { acknowledged: true });
    expect((await select('deepgram')).canStart).toBe(true);

    await invoke('speech:cloud-acknowledge', { acknowledged: false });
    const closed = await select('deepgram');
    expect(closed.acknowledged).toBe(false);
    expect(closed.canStart).toBe(false);
    expect(closed.blockedBy).toBe('cloud-not-acknowledged');
  });

  // The renderer cannot agree to wording it names itself.
  it('the recorded yes is pinned to the current wording, not the caller', async () => {
    const reply = await invoke('speech:cloud-acknowledge', { acknowledged: true, ackVersion: 999 });
    expect(reply.ackVersion).toBe(CLOUD_ACK_VERSION);
    expect(JSON.parse(fs.readFileSync(ackFile, 'utf8')).ackVersion).toBe(CLOUD_ACK_VERSION);

    // A hand-edited file claiming an unrecognised version is not consent.
    fs.writeFileSync(ackFile, JSON.stringify({ acknowledged: true, ackVersion: 999 }));
    const status = await select('deepgram');
    expect(status.acknowledged).toBe(false);
    expect(status.canStart).toBe(false);
  });

  // Local and network never send audio to a third party, so they are never
  // gated — making a machine with no key unusable would be a different bug.
  it('never gets in the way of local or network', async () => {
    for (const where of ['local', 'network']) {
      const reply = await invoke('speech:start', { enabled: false, where });
      expect(reply.code, where).not.toBe('cloud-not-acknowledged');
      expect(reply.code, where).not.toBe('no-stored-key');
    }
  });

  // Nothing may hand a key back toward the renderer, on any channel.
  it('no cloud channel returns key material', async () => {
    cloud.status.mockResolvedValue({ available: true, availabilityReason: '', providers: { ...STORED } });
    const replies = await Promise.all([
      invoke('speech:cloud-status', { where: 'cloud', cloudProviderId: 'deepgram' }),
      invoke('speech:cloud-key', { providerId: 'deepgram', key: SECRET }),
      invoke('speech:cloud-key', { providerId: 'deepgram', clear: true }),
      invoke('speech:cloud-acknowledge', { acknowledged: true }),
    ]);
    for (const reply of replies) {
      expect(JSON.stringify(reply)).not.toContain(SECRET);
    }
  });

  it('validates its arguments before touching the key store', async () => {
    for (const payload of ['not-an-object', null, 42]) {
      expect(await invoke('speech:cloud-key', payload)).toMatchObject({
        ok: false,
        code: 'invalid-argument',
      });
    }
    expect(await invoke('speech:cloud-key', {})).toMatchObject({ code: 'invalid-argument', field: 'providerId' });
    expect(await invoke('speech:cloud-key', { providerId: 'deepgram' })).toMatchObject({
      code: 'invalid-argument',
      field: 'key',
    });
    expect(await invoke('speech:cloud-key', { providerId: 'my-own-server', key: SECRET })).toMatchObject({
      code: 'unknown-cloud-provider',
    });
    expect(cloud.setKey).not.toHaveBeenCalled();
  });

  // A credential that outlives "erase everything" is a bill the next person
  // with the laptop can run up.
  it('the Phase 6 erase takes the cloud key with it, and reports the count', async () => {
    cloud.clearAll = vi.fn(async () => ({ ok: true, cleared: 2 }));
    const erased = await invoke('speech:uninstall', { confirm: true });
    expect(cloud.clearAll).toHaveBeenCalled();
    expect(erased.cloudKeysCleared).toBe(2);
  });

  it('a key store that could not be cleared is reported, not folded into a clean erase', async () => {
    cloud.clearAll = vi.fn(async () => ({ ok: false, code: 'key-store-unwritable', message: 'nope' }));
    const erased = await invoke('speech:uninstall', { confirm: true });
    expect(erased.cloudKeysClearedOk).toBe(false);
    expect(erased.cloudKeysCleared).toBe(0);
  });
});
