/**
 * speech-engine/test/server.test.js — the engine package's own contract tests.
 *
 * Run from the repo root:  node --test speech-engine/
 * (These files are deliberately NOT picked up by the app's vitest run:
 * vitest.config.js includes only src/** and tests/**.)
 *
 * Everything here uses node built-ins only: node:test, node:assert/strict,
 * node:http, node:child_process. No network, no model, no download.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SPEECH_PROTOCOL_VERSION,
  checkApiCompatibility,
  validateMessage,
  TOKEN_HEADER,
  ALLOWED_ORIGINS,
  SAMPLE_RATE,
} from '../../shared/speech/protocol.js';
import {
  createSpeechEngineServer,
  assertLoopbackBindHost,
  DEFAULT_BIND_HOST,
} from '../server.js';

const INDEX_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');
const TOKEN = 'a'.repeat(32) + 'b'.repeat(32);

/** Open servers tracked for guaranteed teardown (a leaked server hangs node --test). */
const openHandles = [];

async function startServer(options = {}) {
  const handle = createSpeechEngineServer({ token: TOKEN, host: DEFAULT_BIND_HOST, ...options });
  const address = await handle.listen(0, options.host ?? DEFAULT_BIND_HOST);
  const record = { handle, child: null };
  openHandles.push(record);
  return {
    handle,
    port: address.port,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

afterEach(async () => {
  while (openHandles.length > 0) {
    const record = openHandles.pop();
    try {
      if (record.child && record.child.exitCode === null && record.child.signalCode === null) {
        record.child.kill('SIGKILL');
      }
    } catch {
      // best effort
    }
    try {
      await record.handle.close();
    } catch {
      // best effort
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
            // leave null — callers assert on status/text when body is not JSON
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

describe('speech-engine HTTP contract', () => {
  test('GET /v1/health returns a compatible apiVersion and the documented fields', async () => {
    const { port } = await startServer();
    const res = await request(port, { path: '/v1/health', headers: withToken() });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json.apiVersion, SPEECH_PROTOCOL_VERSION);
    assert.equal(checkApiCompatibility(res.json.apiVersion).ok, true);
    assert.equal(typeof res.json.model, 'string');
    assert.equal(res.json.backend, 'fake');
    assert.equal(typeof res.json.rtf, 'number');
    assert.equal(typeof res.json.memoryMb, 'number');
    assert.equal(typeof res.json.pid, 'number');
    assert.equal(typeof res.json.uptimeMs, 'number');
  });

  test('a request with NO token is 401 and with a WRONG token is 403', async () => {
    const { port } = await startServer();

    const missing = await request(port, { path: '/v1/health' });
    assert.equal(missing.status, 401);
    assert.equal(missing.json.error, 'missing-token');

    const wrong = await request(port, {
      path: '/v1/health',
      headers: { [TOKEN_HEADER]: 'nope-not-the-token-nope-not-the-token' },
    });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.json.error, 'invalid-token');
  });

  test('a non-ALLOWED_ORIGINS Origin is rejected even with a valid token', async () => {
    const { port } = await startServer();

    const evil = await request(port, {
      path: '/v1/health',
      headers: withToken({ origin: 'http://evil.example.com' }),
    });
    assert.equal(evil.status, 403);
    assert.equal(evil.json.error, 'origin-not-allowed');

    const allowed = await request(port, {
      path: '/v1/health',
      headers: withToken({ origin: ALLOWED_ORIGINS[1] }),
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers['access-control-allow-origin'], ALLOWED_ORIGINS[1]);
  });

  test('CORS preflight: allowed origin answers 204 without a token, foreign origin is still refused', async () => {
    const { port } = await startServer();

    const preflight = await request(port, {
      method: 'OPTIONS',
      path: '/v1/transcribe',
      headers: { origin: ALLOWED_ORIGINS[0] },
    });
    assert.equal(preflight.status, 204);

    const foreign = await request(port, { method: 'OPTIONS', path: '/v1/transcribe', headers: { origin: 'http://lan.host:1' } });
    assert.equal(foreign.status, 403);
  });

  test('a non-loopback bind is refused at construction AND at listen()', async () => {
    assert.throws(
      () => createSpeechEngineServer({ token: TOKEN, host: '192.168.1.5' }),
      /loopback/i
    );
    assert.throws(() => assertLoopbackBindHost('10.0.0.7'), /loopback/i);
    assert.equal(assertLoopbackBindHost('127.0.0.1'), '127.0.0.1');

    const handle = createSpeechEngineServer({ token: TOKEN });
    openHandles.push({ handle, child: null });
    await assert.rejects(() => handle.listen(0, '192.168.1.5'), /loopback/i);
  });

  test('POST /v1/transcribe with no session yields ready/partial/final/stats that all pass validateMessage', async () => {
    const { port } = await startServer();
    const res = await request(port, {
      method: 'POST',
      path: '/v1/transcribe',
      headers: withToken({ 'content-type': 'application/json' }),
      body: JSON.stringify({ clip: 'canned' }),
    });

    assert.equal(res.status, 200);
    const messages = res.json.messages;
    assert.ok(Array.isArray(messages));
    const types = messages.map((m) => m.t);
    for (const required of ['ready', 'partial', 'final', 'stats']) {
      assert.ok(types.includes(required), `expected a "${required}" message, got: ${types.join(', ')}`);
    }
    for (const message of messages) {
      const result = validateMessage(message);
      assert.deepEqual(result.errors, [], `invalid ${message.t}: ${result.errors.join('; ')}`);
      assert.equal(result.ok, true);
    }
    const ready = messages.find((m) => m.t === 'ready');
    assert.equal(ready.sampleRate, SAMPLE_RATE);
    assert.equal(ready.sessionId, res.json.sessionId);
  });

  test('session lifecycle: create -> ready emitted, transcribe reuses it, close, then unknown session is 404', async () => {
    const { port, handle } = await startServer();

    const created = await request(port, {
      method: 'POST',
      path: '/v1/session',
      headers: withToken({ 'content-type': 'application/json' }),
      body: JSON.stringify({ model: 'large-v3' }),
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.messages.length, 1);
    assert.equal(created.json.messages[0].t, 'ready');
    const sessionId = created.json.sessionId;

    const seenByBus = [];
    const unsubscribe = handle.bus.subscribe((message) => seenByBus.push(message.t));
    const transcribed = await request(port, {
      method: 'POST',
      path: '/v1/transcribe',
      headers: withToken({ 'content-type': 'application/json' }),
      body: JSON.stringify({ sessionId }),
    });
    unsubscribe();
    assert.equal(transcribed.status, 200);
    assert.ok(!transcribed.json.messages.some((m) => m.t === 'ready'), 'existing session must not re-emit ready');
    assert.ok(seenByBus.includes('partial'), 'messages must flow through the bus for future transports');

    const closed = await request(port, {
      method: 'POST',
      path: `/v1/session/${encodeURIComponent(sessionId)}/close`,
      headers: withToken(),
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.json.ok, true);

    const again = await request(port, {
      method: 'POST',
      path: `/v1/session/${encodeURIComponent(sessionId)}/close`,
      headers: withToken(),
    });
    assert.equal(again.status, 404);

    const stale = await request(port, {
      method: 'POST',
      path: '/v1/transcribe',
      headers: withToken({ 'content-type': 'application/json' }),
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(stale.status, 404);
  });

  test('GET /v1/models lists catalog rows, all honestly marked not installed', async () => {
    const { port } = await startServer();
    const res = await request(port, { path: '/v1/models', headers: withToken() });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.models));
    assert.ok(res.json.models.some((model) => model.id === 'large-v3'));
    assert.ok(res.json.models.every((model) => model.installed === false));
  });

  test('download/delete/benchmark are honest 501 stubs; unknown routes 404; wrong method 405', async () => {
    const { port } = await startServer();

    for (const [method, pathName] of [
      ['POST', '/v1/models/tiny-q5/download'],
      ['DELETE', '/v1/models/tiny-q5'],
      ['POST', '/v1/benchmark'],
    ]) {
      const res = await request(port, { method, path: pathName, headers: withToken({ 'content-type': 'application/json' }), body: '{}' });
      assert.equal(res.status, 501, `${method} ${pathName} should be 501`);
      assert.equal(res.json.error, 'not-implemented');
    }

    const missing = await request(port, { path: '/v1/nope', headers: withToken() });
    assert.equal(missing.status, 404);

    const wrongMethod = await request(port, { method: 'POST', path: '/v1/health', headers: withToken() });
    assert.equal(wrongMethod.status, 405);
  });

  test('a server reporting a mismatched major apiVersion fails checkApiCompatibility', async () => {
    const { port } = await startServer({ apiVersion: { api: 2, minor: 0 } });
    const res = await request(port, { path: '/v1/health', headers: withToken() });
    assert.equal(res.status, 200);

    const verdict = checkApiCompatibility(res.json.apiVersion);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.level, 'incompatible');
  });
});

describe('speech-engine CLI entry (index.js)', () => {
  test('--engine=whisper is refused loudly until the native binding lands', async () => {
    const child = spawn(process.execPath, [INDEX_JS, '--engine=whisper'], { stdio: 'pipe' });
    const exitCode = await new Promise((resolve, reject) => {
      // Generous, not tight: this asserts a process.exit(2) refusal, but it
      // pays for a full cold `node` start first. On a loaded or CI machine
      // that start alone can take seconds, and a tight timeout here reports a
      // failure that looks like a protocol bug and is really just a slow fork.
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('whisper-mode child did not exit'));
      }, 20000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.on('error', reject);
    });
    assert.equal(exitCode, 2);
  });

  test('forked fake engine: ready handshake, token-gated health, clean SIGTERM shutdown', async () => {
    const child = fork(INDEX_JS, ['--port=0'], {
      env: { ...process.env, LD_SPEECH_TOKEN: TOKEN, LD_SPEECH_HOST: '127.0.0.1', LD_SPEECH_ENGINE: 'fake' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const record = { handle: { close: async () => {} }, child };
    openHandles.push(record);

    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no ready message from forked engine')), 8000);
      child.on('message', (message) => {
        if (message && message.status === 'ready') {
          clearTimeout(timer);
          resolve(message);
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`engine exited early with code ${code}`));
      });
      child.on('error', reject);
    });

    assert.equal(ready.host, '127.0.0.1');
    assert.ok(ready.port > 0);

    const res = await request(ready.port, { path: '/v1/health', headers: withToken() });
    assert.equal(res.status, 200);
    assert.equal(checkApiCompatibility(res.json.apiVersion).ok, true);

    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM');
    const result = await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve({ code: 'timeout' }), 5000)),
    ]);
    assert.notEqual(result.code, 'timeout', 'engine must exit on SIGTERM');
  });
});
