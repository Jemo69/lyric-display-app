/**
 * speech-engine/test/wsTransport.test.js — the WebSocket
 * ingest surface (plan section 3), exercised with Node
 * built-ins only.
 *
 * Run from the repo root:  node --test speech-engine/
 *
 * WHAT IS PINNED HERE:
 *   - the 101 handshake with the RFC 6455 example key/accept
 *     pair (Sec-WebSocket-Accept = base64(sha1(key + GUID)))
 *   - the token gate: required as a QUERY PARAMETER on the
 *     upgrade (plan 7.1), checked BEFORE the 101 and before
 *     any frame is read — missing is 401, wrong is 403
 *   - the Origin gate: a disallowed Origin is 403 even with
 *     the right token
 *   - loopback only: a non-loopback BIND host is refused
 *     (the engine may never listen on a LAN or wildcard address)
 *   - a Node built-in WebSocket CLIENT connects, sends binary
 *     PCM frames, and receives downstream JSON in which every
 *     message passes validateMessage
 *   - masked client frames are unmasked on known bytes before
 *     ingest (a frame that is loud on the wire and silence
 *     unmasked must report silence)
 *   - a close frame tears the connection down (connectionCount
 *     back to zero) — and the suite exits, which is itself the
 *     no-hung-handles proof
 *   - forked mode: process.send() receives the same message
 *     types the WebSocket client sees (one bus, two sinks)
 *
 * Hygiene: no token value is ever printed; tests compare
 * against the token they were given, never against a log.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  validateMessage,
  ALLOWED_ORIGINS,
  SILENCE_FINALIZE_MS,
  FRAME_MS,
  SAMPLES_PER_FRAME,
  BYTES_PER_FRAME,
} from '../../shared/speech/protocol.js';
import {
  createSpeechEngineServer,
  DEFAULT_BIND_HOST,
} from '../server.js';
import { createFakeEngine } from '../fakeEngine.js';
import { createMessageBus } from '../bus.js';
import {
  attachWebSocketTransport,
  WS_PATH,
  WS_TOKEN_PARAM,
  unmaskPayload,
  encodeServerFrame,
} from '../wsTransport.js';

const INDEX_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');
const TOKEN = 'a'.repeat(32) + 'b'.repeat(32);

/** The RFC 6455 section 1.3 example key, and its known accept. */
const KNOWN_KEY = 'dGhlIHNhbXBsZSBub25jZQ==';
const KNOWN_ACCEPT = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';

/** Open servers/clients tracked for guaranteed teardown. */
const openHandles = [];

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
      if (record.stream) record.stream.close();
    } catch {
      // best effort
    }
    try {
      if (record.handle) await record.handle.close();
    } catch {
      // best effort
    }
  }
});

/**
 * One engine server WITH the WebSocket transport attached —
 * the shape index.js runs in production.
 */
async function startWsServer() {
  const bus = createMessageBus();
  const engine = createFakeEngine({ bus });
  const handle = createSpeechEngineServer({
    token: TOKEN,
    host: DEFAULT_BIND_HOST,
    bus,
    engine,
  });
  const address = await handle.listen(0, DEFAULT_BIND_HOST);
  const stream = attachWebSocketTransport(handle.server, {
    token: TOKEN,
    bus,
    engine,
    host: DEFAULT_BIND_HOST,
  });
  const record = { handle, stream };
  openHandles.push(record);
  return { ...record, port: address.port, bus, engine };
}

/**
 * A raw HTTP upgrade request — the only way to assert on the
 * handshake bytes and on rejection statuses (the WebSocket
 * client API hides both). Resolves either the 101
 * ({ status, headers, socket, head }) or the rejection
 * ({ status, headers, json }).
 */
function rawUpgrade(port, { key = KNOWN_KEY, origin, token = TOKEN, path: reqPath = WS_PATH } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-websocket-version': '13',
      'sec-websocket-key': key,
    };
    if (origin !== undefined) headers.origin = origin;
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `${reqPath}?${WS_TOKEN_PARAM}=${encodeURIComponent(token)}`,
      headers,
      agent: false,
    });
    req.on('upgrade', (res, socket, head) => {
      resolve({ status: res.statusCode, headers: res.headers, socket, head });
    });
    req.on('response', (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          // not JSON — callers assert on the status
        }
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** Resolve once `predicate()` holds, or throw after `timeoutMs`. */
async function waitFor(predicate, timeoutMs = 5000, stepMs = 20) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for a condition`);
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

/** The Node built-in WebSocket client, connected and resolved on open. */
function connectClient(port, { token = TOKEN } = {}) {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${port}${WS_PATH}?${WS_TOKEN_PARAM}=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.onopen = socket.onerror = socket.onmessage = socket.onclose = null;
      reject(new Error('ws client did not open in time'));
    }, 8000);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve(socket);
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('ws client failed to connect'));
    };
  });
}

/** Collect downstream text frames as parsed JSON. */
function collectMessages(socket) {
  const messages = [];
  socket.onmessage = (event) => {
    const text =
      typeof event.data === 'string'
        ? event.data
        : Buffer.from(event.data).toString('utf8');
    messages.push(JSON.parse(text));
  };
  return messages;
}

// ---------------------------------------------------------------------------
// The handshake
// ---------------------------------------------------------------------------

test('encodeServerFrame emits the 7-bit, 16-bit and 64-bit length forms, unmasked', () => {
  // Three separate encodings in one hand-rolled function, and the 64-bit form
  // is the one a downstream `final` with word timings eventually needs. If the
  // extended-length branches were wrong, every downstream message past the
  // threshold would be silently corrupt rather than obviously broken.
  const short = encodeServerFrame(0x1, Buffer.alloc(5));
  assert.equal(short[0] & 0x0f, 0x1, 'the opcode is the low nibble');
  assert.equal(short[1] & 0x80, 0, 'servers never mask (RFC 6455 5.1)');
  assert.equal(short[1], 5, 'a 5-byte payload fits the 7-bit length form');

  const medium = encodeServerFrame(0x1, Buffer.alloc(300));
  assert.equal(medium[1] & 0x80, 0);
  assert.equal(medium[1], 126, '126 signals the 16-bit extended length');
  assert.equal(medium.readUInt16BE(2), 300);

  const long = encodeServerFrame(0x1, Buffer.alloc(70000));
  assert.equal(long[1] & 0x80, 0);
  assert.equal(long[1], 127, '127 signals the 64-bit extended length');
  assert.equal(Number(long.readBigUInt64BE(2)), 70000);
});

test('a known key produces the correct 101 and Sec-WebSocket-Accept', async () => {
  const { port } = await startWsServer();

  const { status, headers, socket } = await rawUpgrade(port, { key: KNOWN_KEY });

  assert.equal(status, 101);
  assert.equal(headers.upgrade, 'websocket');
  assert.equal(headers['sec-websocket-accept'], KNOWN_ACCEPT);
  // The connection stays open for frames — destroy it cleanly.
  socket.destroy();
});

// ---------------------------------------------------------------------------
// The gates: token (query parameter), Origin, loopback bind
// ---------------------------------------------------------------------------

test('the token is required as a query parameter: missing is 401, wrong is 403', async () => {
  const { port } = await startWsServer();

  const missing = await rawUpgrade(port, { token: '' });
  assert.equal(missing.status, 401);
  assert.equal(missing.json.error, 'missing-token');

  const wrong = await rawUpgrade(port, { token: 'nope-not-the-token-nope-not-the-token' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.json.error, 'invalid-token');

  // The rejection never echoes the URL (the token lives there).
  assert.ok(!JSON.stringify(wrong.json).includes('nope-not-the-token'));
});

test('a disallowed Origin is rejected with 403 even with the right token', async () => {
  const { port } = await startWsServer();

  const evil = await rawUpgrade(port, { origin: 'http://evil.example.com' });
  assert.equal(evil.status, 403);
  assert.equal(evil.json.error, 'origin-not-allowed');

  // An allowed Origin still upgrades.
  const good = await rawUpgrade(port, { origin: ALLOWED_ORIGINS[0] });
  assert.equal(good.status, 101);
  good.socket.destroy();
});

test('a non-loopback bind host is refused — the transport never binds a LAN address', () => {
  const bus = createMessageBus();
  const engine = createFakeEngine({ bus });
  const httpServer = http.createServer();
  openHandles.push({ handle: { close: () => new Promise((resolve) => httpServer.close(() => resolve())) } });

  for (const host of ['192.168.1.5', '10.0.0.7', 'example.com']) {
    assert.throws(
      () => attachWebSocketTransport(httpServer, { token: TOKEN, bus, engine, host }),
      /loopback/i,
      `host ${host} must be refused`
    );
  }
});

// ---------------------------------------------------------------------------
// Frames: client end-to-end, unmasking, close
// ---------------------------------------------------------------------------

test('a Node WebSocket client connects, sends PCM frames, and receives contract-valid JSON', async () => {
  const { port, bus } = await startWsServer();
  const busTypes = [];
  const unsubscribe = bus.subscribe((message) => busTypes.push(message.t));

  const socket = await connectClient(port);
  const messages = collectMessages(socket);

  // `ready` rides out on the bus as soon as the connection
  // opens — one engine session per connection.
  await waitFor(() => messages.some((message) => message.t === 'ready'));

  // Enough silence frames to trip the transport's endpointing
  // (SILENCE_FINALIZE_MS of continuous silence finalizes the
  // segment), so the canned engine emits its partial/final/stats.
  const framesNeeded = Math.ceil(SILENCE_FINALIZE_MS / FRAME_MS);
  const frame = new Int16Array(SAMPLES_PER_FRAME); // zeros are silence
  assert.equal(frame.byteLength, BYTES_PER_FRAME);
  for (let i = 0; i < framesNeeded; i += 1) socket.send(frame);

  await waitFor(() => messages.some((message) => message.t === 'final'));

  // Every downstream message passes the contract.
  for (const message of messages) {
    const verdict = validateMessage(message);
    assert.deepEqual(
      verdict.errors,
      [],
      `invalid ${message.t}: ${verdict.errors.join('; ')}`
    );
  }
  const types = messages.map((message) => message.t);
  for (const required of ['ready', 'final', 'stats']) {
    assert.ok(types.includes(required), `expected a "${required}" message, got: ${types.join(', ')}`);
    assert.ok(busTypes.includes(required), `the bus missed "${required}"`);
  }

  socket.close();
  unsubscribe();
});

test('unmaskPayload unmasks known bytes in place (RFC 6455 5.3)', () => {
  const payload = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  const mask = Buffer.from([0xff, 0x00, 0xff, 0x00]);

  const result = unmaskPayload(payload, mask);

  assert.equal(result, payload, 'unmasking happens in place');
  assert.deepEqual([...payload], [0xfe, 0x02, 0xfc, 0x04, 0xfa, 0x06, 0xf8, 0x08]);
});

test('masked frames are unmasked before ingest: loud-on-the-wire silence reports silence', async () => {
  const { port, bus } = await startWsServer();
  const vadStates = [];
  const unsubscribe = bus.subscribe((message) => {
    if (message.t === 'vad') vadStates.push(message.state);
  });

  const { socket } = await rawUpgrade(port, {});

  // One masked binary frame: 3200 zero bytes (silence) masked
  // with 0xA5 — on the wire every payload byte is 0xA5 (a loud
  // signal), unmasked it is silence. A server that skipped
  // unmasking would compute speech from the masked bytes.
  const length = BYTES_PER_FRAME;
  const mask = Buffer.from([0xa5, 0xa5, 0xa5, 0xa5]);
  const payload = Buffer.alloc(length, 0x00);
  const masked = Buffer.alloc(length);
  for (let i = 0; i < length; i += 1) masked[i] = payload[i] ^ mask[i & 3];
  const header = Buffer.alloc(4);
  header[0] = 0x82; // FIN + binary opcode
  header[1] = 0x80 | 126; // MASK bit set (clients MUST mask) + 16-bit length form
  header.writeUInt16BE(length, 2);
  socket.write(Buffer.concat([header, mask, masked]));

  await waitFor(() => vadStates.length > 0);
  assert.deepEqual(vadStates, ['silence']);

  socket.destroy();
  unsubscribe();
});

test('a close frame tears the connection down with no hung handles', async () => {
  const { port, stream } = await startWsServer();

  const socket = await connectClient(port);
  assert.equal(stream.connectionCount(), 1);

  const closed = new Promise((resolve) => {
    socket.onclose = resolve;
  });
  socket.close(1000, 'test-done');
  await closed;

  // The server processes the close frame and drops the
  // connection — and this suite exiting at all is the
  // no-hung-handles proof.
  await waitFor(() => stream.connectionCount() === 0);
  assert.equal(stream.connectionCount(), 0);
  assert.equal(socket.readyState, 3, 'the client socket is CLOSED');
});

// ---------------------------------------------------------------------------
// Forked mode — the process.send() mirror
// ---------------------------------------------------------------------------

test('forked mode: process.send() receives the same messages the WebSocket client sees', async () => {
  const child = fork(INDEX_JS, ['--port=0'], {
    env: {
      ...process.env,
      LD_SPEECH_TOKEN: TOKEN,
      LD_SPEECH_HOST: '127.0.0.1',
      LD_SPEECH_ENGINE: 'fake',
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  openHandles.push({ handle: { close: async () => {} }, child });

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
  assert.equal(ready.wsPath, WS_PATH, 'the fork reports the renderer dial-in path');

  // The bus mirror: every message the bus emits is process.send()-ed.
  const relayed = [];
  child.on('message', (message) => {
    if (message && typeof message.t === 'string') relayed.push(message);
  });

  const socket = await connectClient(ready.port);
  const clientMessages = collectMessages(socket);

  await waitFor(() => clientMessages.some((message) => message.t === 'ready'));

  const framesNeeded = Math.ceil(SILENCE_FINALIZE_MS / FRAME_MS);
  const frame = new Int16Array(SAMPLES_PER_FRAME);
  for (let i = 0; i < framesNeeded; i += 1) socket.send(frame);

  await waitFor(() => relayed.some((message) => message.t === 'final'));

  // Same message types on both sinks — one bus, two sinks, so
  // a renderer WebSocket drop never loses the transcript log.
  const relayedTypes = relayed.map((message) => message.t);
  for (const required of ['ready', 'final']) {
    assert.ok(relayedTypes.includes(required), `the fork IPC mirror missed "${required}"`);
    assert.ok(
      clientMessages.some((message) => message.t === required),
      `the WebSocket client missed "${required}"`
    );
  }
  for (const message of relayed) {
    const verdict = validateMessage(message);
    assert.deepEqual(verdict.errors, [], `invalid ${message.t}: ${verdict.errors.join('; ')}`);
  }

  socket.close();
});
