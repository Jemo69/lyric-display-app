// @vitest-environment node
/**
 * tests/speech/speechIpc.test.js — the speech:start path,
 * end to end, against the REAL forked engine.
 *
 * What this proves (the chain the plan pins):
 *
 *   1. GAP CLOSED — history forwarding: a speech:start
 *      carrying modelId/providerId/where forwards the
 *      shared history store into the supervisor, and a
 *      session actually OPENS in the given historyDir
 *      with that boundary metadata (main/speechIpc.js
 *      used to drop all five options on the floor).
 *
 *   2. THE DIAL-IN: the ok reply carries the renderer's
 *      WebSocket dial block — the live loopback endpoint,
 *      the engine's stream path, and the launch token.
 *
 *   3. THE FULL CHAIN: that dial block opens a live
 *      WebSocket; raw PCM frames sent over it are
 *      transcribed by the forked engine; the resulting
 *      `final` is relayed to the renderer window over
 *      speech:transcript AND appended to the history
 *      session in the given directory.
 *
 *   4. speech:stop closes the history session (endedAt)
 *      and the engine.
 *
 * Runs in the NODE environment on purpose: the dial-in
 * test needs a real, interoperating WebSocket client
 * (Node's built-in one), which jsdom does not reliably
 * provide. Electron is mocked (app.getPath -> a throwaway
 * userData tree, ipcMain.handle captured).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { ipcHandles, relayed, getMainWindow } = vi.hoisted(() => {
  const handles = {};
  // Every webContents.send the main process would make.
  const relayed = [];
  const getMainWindow = () => ({
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => relayed.push({ channel, payload }),
    },
  });
  return { ipcHandles: handles, relayed, getMainWindow };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => globalThis.__SPEECH_IPC_USER_DATA__,
  },
  ipcMain: {
    handle: (channel, handler) => {
      ipcHandles[channel] = handler;
    },
  },
}));

import { registerSpeechIpc } from '../../main/speechIpc.js';
import { settleHistoryRecording } from '../../main/speechEngine.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-speech-ipc-'));
const HISTORY_DIR = path.join(USER_DATA, 'history');
const MODELS_DIR = path.join(USER_DATA, 'models');

const TOKEN_PARAM = 'token';
const WS_PATH = '/v1/stream';
/** Enough zero frames to trip the engine's silence endpointing. */
const SILENCE_FRAMES = 8;

/** Resolve once `predicate()` holds, or throw after `timeoutMs`. */
async function waitFor(predicate, timeoutMs = 15000, stepMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for a condition`);
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

/** Connect a native WebSocket client to the engine's dial-in block. */
function connectEngine(engine) {
  const url =
    `${engine.endpoint.replace(/^http:/i, 'ws:')}${engine.path}` +
    `?${TOKEN_PARAM}=${encodeURIComponent(engine.token)}`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.onopen = socket.onerror = socket.onmessage = socket.onclose = null;
      reject(new Error('the engine WebSocket did not open in time'));
    }, 10000);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve(socket);
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('the engine WebSocket failed to connect'));
    };
  });
}

/** Every relayed message of one channel, as payloads. */
const relayedOn = (channel) =>
  relayed.filter((entry) => entry.channel === channel).map((entry) => entry.payload);

/** The one stored history session file, parsed. */
function readHistorySession() {
  const files = fs
    .readdirSync(HISTORY_DIR)
    .filter((name) => name.endsWith('.json') && name !== 'exports');
  expect(files).toHaveLength(1);
  return JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, files[0]), 'utf8'));
}

describe('speechIpc — the speech:start chain, end to end', () => {
  beforeAll(() => {
    globalThis.__SPEECH_IPC_USER_DATA__ = USER_DATA;
    registerSpeechIpc({
      getMainWindow,
      engineRoots: [path.join(REPO_ROOT, 'speech-engine')],
      modelsDir: MODELS_DIR,
      historyDir: HISTORY_DIR,
    });
  });

  afterAll(async () => {
    try {
      await ipcHandles['speech:stop']();
    } catch {
      // best effort — the engine also exits with the worker
    }
    await settleHistoryRecording();
    fs.rmSync(USER_DATA, { recursive: true, force: true });
  });

  it('forwards the history store and model context, and opens a session in the given directory', async () => {
    const reply = await ipcHandles['speech:start'](null, {
      enabled: true,
      modelId: 'large-v3',
      providerId: 'whispercpp',
      where: 'local',
    });

    // The engine started (the co-located package was forked).
    expect(reply.ok).toBe(true);
    expect(reply.mode).toBe('package');

    // The renderer's dial-in: a loopback endpoint, the
    // engine's stream path, a real launch token.
    expect(reply.engine.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(reply.engine.path).toBe(WS_PATH);
    expect(reply.engine.token).toHaveLength(64);

    // GAP CLOSED: the history session opened in the GIVEN
    // directory, carrying the boundary metadata the start
    // payload carried (this used to be inert in production).
    await settleHistoryRecording();
    const session = readHistorySession();
    expect(session.modelId).toBe('large-v3');
    expect(session.providerId).toBe('whispercpp');
    expect(session.where).toBe('local');
    expect(session.startedAt).toBeTypeOf('number');

    // Keep the dial-in for the chain test below.
    globalThis.__SPEECH_IPC_DIAL__ = reply.engine;
  }, 60000);

  it('the dial-in opens a live stream: PCM frames in, transcript relayed and recorded', async () => {
    const engine = globalThis.__SPEECH_IPC_DIAL__;
    expect(engine).toBeTruthy();

    const socket = await connectEngine(engine);
    const messages = [];
    socket.onmessage = (event) => {
      const text = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
      messages.push(JSON.parse(text));
    };

    // The engine's session opens with the connection (`ready`).
    await waitFor(() => messages.some((message) => message.t === 'ready'));

    // Raw PCM: 100 ms Int16 frames, 16 kHz mono, back to back,
    // no envelope. Zeros are silence, which trips the engine's
    // endpointing and produces its canned partial/final/stats.
    const frame = new Int16Array(1600);
    for (let i = 0; i < SILENCE_FRAMES; i += 1) socket.send(frame);

    await waitFor(() => messages.some((message) => message.t === 'final'));

    // Every downstream message is contract-valid.
    const { validateMessage } = await import('../../shared/speech/protocol.js');
    for (const message of messages) {
      const verdict = validateMessage(message);
      expect(verdict.errors, `invalid ${message.t}: ${verdict.errors.join('; ')}`).toEqual([]);
    }

    // The transcript reached the renderer window over the
    // IPC relay — the rail's data path.
    const transcripts = relayedOn('speech:transcript');
    expect(transcripts.some((message) => message.t === 'final')).toBe(true);

    // AND the settled words were written to the history
    // session in the given directory.
    await settleHistoryRecording();
    const session = readHistorySession();
    expect(session.segments.length).toBeGreaterThan(0);
    expect(typeof session.segments[0].text).toBe('string');
    expect(session.segments[0].text.length).toBeGreaterThan(0);

    socket.close();
  }, 60000);

  it('speech:stop closes the history session and the engine', async () => {
    const result = await ipcHandles['speech:stop']();
    expect(result.ok).toBe(true);
    expect(result.stopped).toBe(true);

    await settleHistoryRecording();
    const session = readHistorySession();
    expect(session.endedAt).toBeTypeOf('number');
    expect(session.durationMs).toBeTypeOf('number');

    // The supervisor reports the engine as not running.
    const state = await ipcHandles['speech:get-state']();
    expect(state.running).toBe(false);
  }, 60000);
});
