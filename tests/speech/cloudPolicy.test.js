/**
 * cloudPolicy — the gate that decides whether audio may leave the machine.
 *
 * Every test here is about a refusal the code must NOT make easy. The failure
 * modes being guarded are: sending audio without a stored key, sending it
 * without the user having said yes, treating an old yes as a new one, and
 * leaking a key back toward the renderer.
 */
import { describe, it, expect } from 'vitest';
import {
  decideCloudStart,
  checkCloudKeyShape,
  maskCloudKey,
  findCloudProvider,
  cloudSetupSteps,
  CLOUD_ACK_TEXT,
  CLOUD_ACK_VERSION,
  CLOUD_COST_TEXT,
  CLOUD_PROVIDERS,
} from '../../shared/speech/cloudPolicy.js';

/** A fully-satisfied cloud state, for perturbing one field at a time. */
const READY = Object.freeze({
  where: 'cloud',
  cloudProviderId: 'deepgram',
  hasStoredKey: true,
  keyShapeOk: true,
  acknowledged: true,
  ackVersion: CLOUD_ACK_VERSION,
});

describe('the cloud gate', () => {
  it('starts only when a key is stored AND the user has acknowledged', () => {
    expect(decideCloudStart(READY)).toMatchObject({ start: true, code: 'ok' });
  });

  // THE two gates. Each on its own is a refusal.
  it('refuses without a stored key, even when everything else is ready', () => {
    for (const hasStoredKey of [false, undefined, null, 'yes', 1]) {
      const verdict = decideCloudStart({ ...READY, hasStoredKey });
      expect(verdict.start, String(hasStoredKey)).toBe(false);
      expect(verdict.code).toBe('no-stored-key');
    }
  });

  it('refuses without the acknowledgement, even when a key is stored', () => {
    for (const acknowledged of [false, undefined, null, 'true']) {
      const verdict = decideCloudStart({ ...READY, acknowledged });
      expect(verdict.start, String(acknowledged)).toBe(false);
      expect(verdict.code).toBe('cloud-not-acknowledged');
    }
  });

  it('a stored key that fails its shape check is not a stored key', () => {
    expect(decideCloudStart({ ...READY, keyShapeOk: false }).code).toBe('no-stored-key');
  });

  // Agreeing to yesterday's wording is not agreeing to today's.
  it('an acknowledgement of an OLD version of the wording is refused', () => {
    const verdict = decideCloudStart({ ...READY, ackVersion: CLOUD_ACK_VERSION - 1 });
    expect(verdict.start).toBe(false);
    expect(verdict.code).toBe('cloud-not-acknowledged');

    // And a version from the future is refused too — an unrecognised number
    // is not consent, it is a blob nobody wrote.
    expect(decideCloudStart({ ...READY, ackVersion: CLOUD_ACK_VERSION + 99 }).start).toBe(false);
  });

  it('refuses with no provider chosen, and says which step is missing', () => {
    const verdict = decideCloudStart({ ...READY, cloudProviderId: null });
    expect(verdict.start).toBe(false);
    expect(verdict.code).toBe('no-cloud-provider');
  });

  it('an unknown provider id does not open the gate', () => {
    const verdict = decideCloudStart({ ...READY, cloudProviderId: 'my-own-server' });
    expect(verdict.start).toBe(false);
    expect(verdict.code).toBe('no-cloud-provider');
  });

  // The gate must not fire on paths that never send audio anywhere.
  it('does not get in the way of local or network', () => {
    for (const where of ['local', 'network']) {
      expect(decideCloudStart({ where, hasStoredKey: false, acknowledged: false }).start, where).toBe(true);
    }
  });

  it('the refusal quotes the wording the user would have to agree to', () => {
    expect(decideCloudStart(READY).message).toBe('');
    expect(decideCloudStart({ ...READY, acknowledged: false }).message).toBe(CLOUD_ACK_TEXT);
  });

  it('is not fooled by extra or oddly-typed fields', () => {
    expect(decideCloudStart({ ...READY, hasStoredKey: { valueOf: () => true } }).start).toBe(false);
    expect(decideCloudStart({ ...READY, acknowledged: 1 }).start).toBe(false);
    expect(decideCloudStart(undefined).start).toBe(false);
    expect(decideCloudStart({}).start).toBe(false);
  });
});

describe('key shape', () => {
  const GOOD = 'dg_live_0123456789abcdef0123456789';

  it('accepts a plausible key', () => {
    expect(checkCloudKeyShape(GOOD, 'deepgram').ok).toBe(true);
  });

  it('rejects an empty key with copy the operator can act on', () => {
    const verdict = checkCloudKeyShape('   ', 'deepgram');
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toMatch(/paste it in/i);
  });

  it('rejects a too-short key and says the LENGTH, never the value', () => {
    // The VALUE must never appear in the message. It is a word that appears
    // in no copy anywhere, so 'does not contain it' actually means something —
    // an earlier draft asserted the message omits 'short', which is a word the
    // message legitimately contains, so the assertion passed for free.
    const verdict = checkCloudKeyShape('hunter2hunter2', 'deepgram');
    expect(verdict.code).toBe('key-too-short');
    expect(verdict.message).toContain('14 characters');
    // A rejected key is still a secret.
    expect(verdict.message).not.toContain('hunter2');
  });

  it('rejects a key with a pasted space or newline in it', () => {
    expect(checkCloudKeyShape('dg_live 0123456789abcdef', 'deepgram').code).toBe('key-contains-whitespace');
    expect(checkCloudKeyShape('dg_live\n0123456789abcdef', 'deepgram').code).toBe('key-contains-whitespace');
  });

  it('surrounding whitespace is trimmed, not rejected — people paste sloppily', () => {
    expect(checkCloudKeyShape('  ' + GOOD + '  ', 'deepgram').ok).toBe(true);
  });

  it('needs a known provider before it will judge a key', () => {
    expect(checkCloudKeyShape(GOOD, 'nope').code).toBe('unknown-cloud-provider');
    expect(checkCloudKeyShape(GOOD, null).code).toBe('unknown-cloud-provider');
  });
});

describe('masking', () => {
  // A mask that is nearly the whole key is a mask that leaks.
  it('keeps only the last four characters', () => {
    const masked = maskCloudKey('dg_live_0123456789abcdef0123456789');
    expect(masked.endsWith('6789')).toBe(true);
    expect(masked).not.toContain('0123456789abcdef01234');
    // Count the VISIBLE characters, i.e. the ones that are NOT dots.
    // An earlier draft stripped the dots and asserted 4 — which measured
    // the dots themselves (12) and so failed on a correct mask, while the
    // real leak it was meant to catch was never actually checked.
  expect(masked.replace(/•/g, '')).toBe('6789');
  expect(masked.length).toBe(16); // 12 dots + 4 visible
  // The first 30 characters of the key must not survive in any form.
  expect(masked).not.toContain('dg_live');
  expect(masked).not.toContain('0123456789abcdef');
  });

  it('masks a short key entirely', () => {
    expect(maskCloudKey('abcd')).toBe('••••');
  });

  it('returns empty for nothing', () => {
    expect(maskCloudKey('')).toBe('');
    expect(maskCloudKey(null)).toBe('');
    expect(maskCloudKey(undefined)).toBe('');
  });
});

describe('providers', () => {
  it('are all distinct, frozen, and documented', () => {
    const ids = CLOUD_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of CLOUD_PROVIDERS) {
      expect(Object.isFrozen(provider)).toBe(true);
      expect(provider.name).toBeTruthy();
      expect(provider.copy).toBeTruthy();
      expect(provider.docUrl).toMatch(/^https:\/\//);
    }
  });

  it('look up case-insensitively and never throw on junk', () => {
    expect(findCloudProvider('DEEPGRAM')?.id).toBe('deepgram');
    expect(findCloudProvider('  google ')?.id).toBe('google');
    // The id the settings surface used before this list was centralised.
    expect(findCloudProvider('groq')?.id).toBe('groq');
    expect(findCloudProvider('nope')).toBeNull();
    expect(findCloudProvider(42)).toBeNull();
  });
});

describe('what the user is told', () => {
  it('the acknowledgement names where audio goes and that it may be billed', () => {
    expect(CLOUD_ACK_TEXT).toMatch(/sent over the internet/i);
    expect(CLOUD_ACK_TEXT).toMatch(/stored and processed under their terms/i);
    expect(CLOUD_ACK_TEXT).toMatch(/billed/i);
  });

  it('the acknowledgement says how to stop, and admits the live feed is broader', () => {
    expect(CLOUD_ACK_TEXT).toMatch(/Switch back to/i);
    expect(CLOUD_ACK_TEXT).toMatch(/not in the published recording/i);
  });

  // "Cents" would read as cheap on a per-minute provider over a long service.
  it('the cost text refuses to promise a number and says we cannot see the bill', () => {
    expect(CLOUD_COST_TEXT).toMatch(/cannot see or predict that bill/i);
    expect(CLOUD_COST_TEXT).toMatch(/billed by the provider/i);
  });
});

describe('setup steps', () => {
  it('ask for the cheapest thing first and the commitment last', () => {
    const steps = cloudSetupSteps({});
    expect(steps.map((s) => s.id)).toEqual(['provider', 'key', 'acknowledge']);
    expect(steps.every((s) => s.done === false)).toBe(true);
  });

  it('mark each step done exactly when its gate would pass', () => {
    const steps = cloudSetupSteps(READY);
    expect(steps.every((s) => s.done)).toBe(true);
    expect(cloudSetupSteps({ ...READY, hasStoredKey: false })[1].done).toBe(false);
    expect(cloudSetupSteps({ ...READY, ackVersion: 0 })[2].done).toBe(false);
  });
});
