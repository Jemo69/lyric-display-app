/**
 * tests/speech/engineContract.test.js — Live Sermon Assist Phase 2.
 *
 * The APP side of the v1 contract: spin up the real speech-engine HTTP
 * surface in-process (loopback, ephemeral port, canned fake engine) and
 * assert that everything main/speechEngine.js depends on actually holds —
 *
 *   - GET /v1/health answers with a version this build accepts, and its body
 *     maps cleanly through buildHealthPayload(),
 *   - the token gate is 401-missing / 403-wrong,
 *   - the origin gate refuses a foreign Origin BEFORE the token matters,
 *   - a non-loopback bind is refused at construction AND at listen(),
 *   - every message the engine emits passes validateMessage(),
 *   - a mismatched major apiVersion fails evaluateEngineApiVersion() — the
 *     refusal that keeps an incompatible engine from being talked to.
 *
 * No model, no binary, no download: the fake engine serves canned data on
 * 127.0.0.1 only, and every server is closed in afterEach (a leaked server
 * hangs the run).
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import {
  SPEECH_PROTOCOL_VERSION,
  checkApiCompatibility,
  validateMessage,
  generateEngineToken,
  TOKEN_HEADER,
  ENGINE_ROUTES,
  ALLOWED_ORIGINS,
} from '../../shared/speech/protocol.js';
import { createSpeechEngineServer, assertLoopbackBindHost } from '../../speech-engine/server.js';
import { buildHealthPayload, evaluateEngineApiVersion } from '../../main/speechEngine.js';

const TOKEN = generateEngineToken();

/** Open handles tracked so afterEach can always close them. */
const openServers = [];

async function startServer(options = {}) {
  const handle = createSpeechEngineServer({ token: TOKEN, ...options });
  const address = await handle.listen(0);
  openServers.push(handle);
  return { handle, port: address.port, origin: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  while (openServers.length > 0) {
    const handle = openServers.pop();
    try {
      await handle.close();
    } catch {
      // best effort — never fail a test on teardown
    }
  }
});

/** One request via node:http. Resolves { status, headers, json, text }. */
function request(port, { method = 'GET', path: reqPath = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: reqPath, headers, agent: false },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            // callers assert on status/text when the body is not JSON
          }
          resolve({ status: res.statusCode, headers: res.headers, json, text });
        });
      }
    );
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

const withToken = (extra = {}) => ({ [TOKEN_HEADER]: TOKEN, ...extra });

const jsonBody = (payload) => JSON.stringify(payload);

describe('engine contract: health', () => {
  it('GET /v1/health reports a compatible version and feeds buildHealthPayload', async () => {
    const { port } = await startServer();
    const res = await request(port, { path: ENGINE_ROUTES.health.path, headers: withToken() });

    expect(res.status).toBe(200);

    // The app's own gate — this is what startSpeechEngine() runs on startup.
    const verdict = evaluateEngineApiVersion(res.json.apiVersion);
    expect(verdict.ok, verdict.reason).toBe(true);
    expect(verdict.shouldWarn).toBe(false);
    expect(checkApiCompatibility(res.json.apiVersion).level).toBe('compatible');

    // The shape the renderer store keeps.
    const health = buildHealthPayload(res.json);
    expect(health.model).toBe('fake-canned');
    expect(health.backend).toBe('fake');
    expect(health.rtf).toBeTypeOf('number');
    expect(health.memoryMb).toBeTypeOf('number');
    expect(health.pid).toBeTypeOf('number');
    expect(health.uptime).toBeGreaterThanOrEqual(0);

    // The launch token must never travel back to the renderer.
    expect(JSON.stringify(res.json)).not.toContain(TOKEN);
  });

  it('the token gate is 401 when missing and 403 when wrong', async () => {
    const { port } = await startServer();

    const missing = await request(port, { path: ENGINE_ROUTES.health.path });
    expect(missing.status).toBe(401);
    expect(missing.json).toMatchObject({ error: 'missing-token' });

    const wrong = await request(port, {
      path: ENGINE_ROUTES.health.path,
      headers: { [TOKEN_HEADER]: 'not-the-launch-token' },
    });
    expect(wrong.status).toBe(403);
    expect(wrong.json).toMatchObject({ error: 'invalid-token' });
  });
});

describe('engine contract: the origin gate', () => {
  it('a foreign Origin is refused with 403, before the token is even considered', async () => {
    const { port } = await startServer();

    // Valid token, foreign origin -> origin still wins (gate order matters).
    const foreign = await request(port, {
      path: ENGINE_ROUTES.health.path,
      headers: withToken({ origin: 'https://evil.example.com' }),
    });
    expect(foreign.status).toBe(403);
    expect(foreign.json).toMatchObject({ error: 'origin-not-allowed' });

    // Foreign origin AND no token -> still the origin error, proving the
    // origin check runs first.
    const foreignNoToken = await request(port, {
      path: ENGINE_ROUTES.health.path,
      headers: { origin: 'https://evil.example.com' },
    });
    expect(foreignNoToken.status).toBe(403);
    expect(foreignNoToken.json).toMatchObject({ error: 'origin-not-allowed' });
  });

  it('an ALLOWED_ORIGINS dev origin passes the origin gate (token still required)', async () => {
    const { port } = await startServer();
    const { ALLOWED_ORIGINS } = await import('../../shared/speech/protocol.js');

    const allowedNoToken = await request(port, {
      path: ENGINE_ROUTES.health.path,
      headers: { origin: ALLOWED_ORIGINS[0] },
    });
    expect(allowedNoToken.status).toBe(401); // origin OK, token missing
  });
});

describe('engine contract: loopback-only binds (invariant 5)', () => {
  it('assertLoopbackBindHost accepts loopback and refuses everything else', () => {
    expect(assertLoopbackBindHost('127.0.0.1')).toBe('127.0.0.1');
    expect(assertLoopbackBindHost('localhost')).toBe('localhost');
    expect(() => assertLoopbackBindHost('0.0.0.0')).toThrow(/loopback/);
    expect(() => assertLoopbackBindHost('192.168.1.5')).toThrow(/loopback/);
    expect(() => assertLoopbackBindHost('')).toThrow(/loopback/);
    expect(() => assertLoopbackBindHost(undefined)).toThrow(/loopback/);
  });

  it('construction refuses a non-loopback host outright', () => {
    expect(() => createSpeechEngineServer({ token: TOKEN, host: '0.0.0.0' })).toThrow(/loopback/);
    expect(() => createSpeechEngineServer({ token: TOKEN, host: '10.0.0.1' })).toThrow(/loopback/);
  });

  it('listen() re-validates the host, so an override cannot widen the bind', async () => {
    const handle = createSpeechEngineServer({ token: TOKEN });
    openServers.push(handle);
    await expect(handle.listen(0, '10.0.0.1')).rejects.toThrow(/loopback/);
    await expect(handle.listen(0, '0.0.0.0')).rejects.toThrow(/loopback/);
  });
});

describe('engine contract: messages', () => {
  it('every message the engine emits passes validateMessage', async () => {
    const { port } = await startServer();

    const session = await request(port, {
      method: 'POST',
      path: ENGINE_ROUTES.session.path,
      headers: withToken({ 'content-type': 'application/json' }),
      body: jsonBody({ model: 'fake-canned' }),
    });
    expect(session.status).toBe(200);
    expect(session.json.messages.map((m) => m.t)).toEqual(['ready']);

    const transcribe = await request(port, {
      method: 'POST',
      path: ENGINE_ROUTES.transcribe.path,
      headers: withToken({ 'content-type': 'application/json' }),
      body: jsonBody({ sessionId: session.json.sessionId }),
    });
    expect(transcribe.status).toBe(200);

    const types = transcribe.json.messages.map((m) => m.t);
    expect(types).toEqual(['partial', 'partial', 'final', 'stats']);
    for (const message of transcribe.json.messages) {
      const verdict = validateMessage(message);
      expect(verdict.ok, `${message.t}: ${verdict.errors.join('; ')}`).toBe(true);
    }
  });

  it('a transcribe call without a session opens one and stays schema-clean', async () => {
    const { port } = await startServer();
    const res = await request(port, {
      method: 'POST',
      path: ENGINE_ROUTES.transcribe.path,
      headers: withToken({ 'content-type': 'application/json' }),
      body: jsonBody({}),
    });
    expect(res.status).toBe(200);
    expect(res.json.messages[0].t).toBe('ready');
    for (const message of res.json.messages) {
      expect(validateMessage(message).ok).toBe(true);
    }
  });
});

describe('engine contract: API version compatibility', () => {
  it('a mismatched MAJOR fails the gate the supervisor uses', async () => {
    const { port } = await startServer({
      apiVersion: { api: SPEECH_PROTOCOL_VERSION.api + 1, minor: 0 },
    });
    const res = await request(port, { path: ENGINE_ROUTES.health.path, headers: withToken() });

    expect(res.status).toBe(200);
    const verdict = evaluateEngineApiVersion(res.json.apiVersion);
    expect(verdict.ok).toBe(false);
    expect(verdict.level).toBe('incompatible');
    expect(verdict.shouldWarn).toBe(false);
    expect(verdict.reason).toMatch(/requires api/);
  });

  it('a mismatched MINOR still talks, with a warning', async () => {
    const { port } = await startServer({
      apiVersion: { api: SPEECH_PROTOCOL_VERSION.api, minor: SPEECH_PROTOCOL_VERSION.minor + 7 },
    });
    const res = await request(port, { path: ENGINE_ROUTES.health.path, headers: withToken() });

    const verdict = evaluateEngineApiVersion(res.json.apiVersion);
    expect(verdict.ok).toBe(true);
    expect(verdict.level).toBe('minor-mismatch');
    expect(verdict.shouldWarn).toBe(true);
  });
});
