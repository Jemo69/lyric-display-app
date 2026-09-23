import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildCreateBrowserSourceInput,
  buildGetSceneItemId,
  buildSetSceneItemTransform,
  buildGetVersionRequest,
  buildLyricSourceUrl,
  computeObsAuthHash,
  ensureLyricBrowserSource,
  lyricDockSetupSteps,
  OBS_WS_DEFAULT_PORT,
} from './obsWebSocketClient.js';
import {
  issueObsDockPin,
  verifyObsDockPin,
  isObsDockPinShapeValid,
  normalizeObsDockPin,
  getObsDockPairingSnapshot,
  __resetObsDockPairingForTests,
} from '../../../server/auth/obsDockPairing.js';

describe('obsWebSocketClient message building', () => {
  it('creates a browser_source CreateInput request for the lyric URL', () => {
    const request = buildCreateBrowserSourceInput({
      sceneName: 'Live',
      inputName: 'Lyrics',
      url: 'http://127.0.0.1:4000/#/output1',
      width: 1920,
      height: 200,
    });
    expect(request.op).toBe(6);
    expect(request.d.requestType).toBe('CreateInput');
    expect(request.d.requestData.inputKind).toBe('browser_source');
    expect(request.d.requestData.sceneName).toBe('Live');
    expect(request.d.requestData.inputSettings.url).toBe('http://127.0.0.1:4000/#/output1');
    expect(request.d.requestData.inputSettings.height).toBe(200);
    expect(typeof request.d.requestId).toBe('string');
  });

  it('rejects browser source creation without scene, name, or url', () => {
    expect(() => buildCreateBrowserSourceInput({ sceneName: '', inputName: 'x', url: 'u' })).toThrow();
    expect(() => buildGetSceneItemId({ sceneName: 'Live', sourceName: '' })).toThrow();
    expect(() => buildSetSceneItemTransform({ sceneName: 'Live', sceneItemId: null })).toThrow();
  });

  it('builds a position transform for an existing scene item', () => {
    const request = buildSetSceneItemTransform({ sceneName: 'Live', sceneItemId: 7, x: 0, y: 880 });
    expect(request.d.requestType).toBe('SetSceneItemTransform');
    expect(request.d.requestData.sceneItemTransform.positionX).toBe(0);
    expect(request.d.requestData.sceneItemTransform.positionY).toBe(880);
  });

  it('orders dock setup as create, resolve id, then position', () => {
    const steps = lyricDockSetupSteps({
      sceneName: 'Live',
      inputName: 'Lyrics',
      url: 'http://127.0.0.1:4000/#/output1',
      x: 0,
      y: 880,
    });
    expect(steps.create.d.requestType).toBe('CreateInput');
    expect(steps.resolveId.d.requestType).toBe('GetSceneItemId');
    expect(steps.position).toEqual({ x: 0, y: 880 });
  });

  it('drives create, resolve, and position through a mocked sender', async () => {
    const sent = [];
    const send = async (request) => {
      sent.push(request.d.requestType);
      if (request.d.requestType === 'GetSceneItemId') {
        return { requestId: request.d.requestId, requestStatus: { result: true, code: 100 }, responseData: { sceneItemId: 12 } };
      }
      return { requestId: request.d.requestId, requestStatus: { result: true, code: 100 }, responseData: {} };
    };
    const result = await ensureLyricBrowserSource(send, {
      sceneName: 'Live',
      inputName: 'Lyrics',
      url: 'http://127.0.0.1:4000/#/output1',
    });
    expect(sent).toEqual(['CreateInput', 'GetSceneItemId', 'SetSceneItemTransform']);
    expect(result.sceneItemId).toBe(12);
  });

  it('surfaces OBS request failures with the request name', async () => {
    const send = async (request) => ({
      requestId: request.d.requestId,
      requestStatus: { result: false, code: 600, comment: 'exists' },
      responseData: {},
    });
    await expect(ensureLyricBrowserSource(send, {
      sceneName: 'Live', inputName: 'Lyrics', url: 'http://x/#/output1',
    })).rejects.toThrow('CreateInput');
  });

  it('computes the OBS-WebSocket v5 auth hash matching the reference algorithm', async () => {
    const password = 'seekrit';
    const salt = 'Pwntz80T1Mha5n3y6t3s';
    const challenge = 'O5m5G9UKJxB0kR0r5b7o5';
    const expectedSecret = createHash('sha256').update(password + salt).digest('base64');
    const expected = createHash('sha256').update(expectedSecret + challenge).digest('base64');
    await expect(computeObsAuthHash({ password, salt, challenge })).resolves.toBe(expected);
  });

  it('builds version requests and sanitized lyric source urls', () => {
    expect(buildGetVersionRequest('abc').d.requestType).toBe('GetVersion');
    expect(buildLyricSourceUrl({ origin: 'http://127.0.0.1:4000/', slug: 'output1' }))
      .toBe('http://127.0.0.1:4000/#/output1');
    expect(buildLyricSourceUrl({ origin: 'http://x', slug: '../../evil' })).not.toContain('..');
    expect(OBS_WS_DEFAULT_PORT).toBe(4455);
  });
});

describe('obsDockPairing PIN issue and verify', () => {
  beforeEach(() => {
    __resetObsDockPairingForTests();
  });

  it('normalizes and validates 6-digit PIN shapes', () => {
    expect(normalizeObsDockPin(' 123-456 ')).toBe('123456');
    expect(isObsDockPinShapeValid('123456')).toBe(true);
    expect(isObsDockPinShapeValid('12345')).toBe(false);
    expect(isObsDockPinShapeValid('abcdef')).toBe(false);
  });

  it('issues a 6-digit PIN and verifies it exactly once', () => {
    const issued = issueObsDockPin({ deviceLabel: 'obs-dock-test' });
    expect(issued.pin).toMatch(/^\d{6}$/);
    expect(issued.expiresInMs).toBeGreaterThan(0);

    const first = verifyObsDockPin(issued.pin, { ip: '127.0.0.1', deviceId: 'dock-1' });
    expect(first.ok).toBe(true);

    const replay = verifyObsDockPin(issued.pin, { ip: '127.0.0.1', deviceId: 'dock-1' });
    expect(replay.ok).toBe(false);
  });

  it('rejects unknown PINs and reports remaining attempts', () => {
    const result = verifyObsDockPin('000000', { ip: '127.0.0.1', deviceId: 'dock-2' });
    expect(result.ok).toBe(false);
    expect(result.locked).toBe(false);
    expect(typeof result.remainingAttempts).toBe('number');
  });

  it('locks out after repeated bad PINs from the same source', () => {
    const context = { ip: '127.0.0.1', deviceId: 'dock-lock' };
    let last = null;
    for (let i = 0; i < 8; i += 1) {
      last = verifyObsDockPin('999999', context);
    }
    expect(last.locked).toBe(true);
    expect(last.retryAfterMs).toBeGreaterThan(0);
  });

  it('exposes a pairing snapshot for health probes', () => {
    issueObsDockPin({});
    const snapshot = getObsDockPairingSnapshot();
    expect(snapshot.activePins).toBe(1);
    expect(snapshot.pinLength).toBe(6);
  });
});
