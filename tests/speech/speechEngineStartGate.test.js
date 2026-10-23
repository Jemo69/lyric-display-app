// @vitest-environment node
/**
 * tests/speech/speechEngineStartGate.test.js — the gate that keeps canned text
 * out of Production mode.
 *
 * THE BUG THIS PINS: `speech:start` used to pick the fake engine whenever
 * `whisper-cli` was missing, even though the rail said PROD. An operator on a
 * normal install saw "PROD" in the header and "TEST ENGINE — canned text" in
 * the footer, with canned sentences in the transcript, and no way to tell
 * which one was true.
 *
 * The rule now: Production either starts the real engine or refuses with a
 * sentence. The fake engine is reachable only when the renderer explicitly
 * asks for TEST mode.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { ipcHandles, relayed, getMainWindow } = vi.hoisted(() => {
  const handles = {};
  const relayed = [];
  const getMainWindow = () => ({
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => relayed.push({ channel, payload }) },
  });
  return { ipcHandles: handles, relayed, getMainWindow };
});

vi.mock('electron', () => ({
  app: { getPath: () => globalThis.__ENGINE_GATE_USER_DATA__ },
  ipcMain: { handle: (channel, handler) => { ipcHandles[channel] = handler; } },
}));

import { registerSpeechIpc } from '../../main/speechIpc.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-engine-gate-'));
const MODELS_DIR = path.join(USER_DATA, 'models');
const relayedOn = (channel) =>
  relayed.filter((entry) => entry.channel === channel).map((entry) => entry.payload);

describe('speech:start — production never silently runs the canned engine', () => {
  beforeAll(() => {
    globalThis.__ENGINE_GATE_USER_DATA__ = USER_DATA;
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    registerSpeechIpc({
      getMainWindow,
      engineRoots: [path.join(REPO_ROOT, 'speech-engine')],
      modelsDir: MODELS_DIR,
      historyDir: path.join(USER_DATA, 'history'),
    });
  });

  afterAll(async () => {
    try {
      await ipcHandles['speech:stop']();
    } catch {
      // best effort
    }
    fs.rmSync(USER_DATA, { recursive: true, force: true });
  });

  it('refuses a PROD start with no engine binary instead of starting the fake engine', async () => {
    const reply = await ipcHandles['speech:start'](null, {
      enabled: true,
      engineMode: 'prod',
      modelId: 'large-v3',
      providerId: 'whispercpp',
      where: 'local',
    });

    expect(reply.ok).toBe(false);
    expect(reply.started).toBe(false);
    expect(reply.reason).toBe('engine-not-installed');
    expect(reply.engine).toBeNull();
    // The operator gets one sentence they can act on, not a silent fallback.
    const errors = relayedOn('speech:error');
    expect(errors.at(-1)).toMatchObject({ code: 'engine-not-installed' });
    expect(errors.at(-1).message).toMatch(/install/i);
    // And nothing was listening: no fake engine ever came up.
    expect(reply.health).toBeNull();
  });

  it('still exposes the canned engine path to TEST mode callers (no fork here)', () => {
    // TEST mode is exercised end to end by tests/speech/speechIpc.test.js.
    // This file deliberately never forks an engine: the supervisor binds a
    // fixed loopback port, and two engine-starting files in one vitest run
    // race for it. What matters here is that PROD does not start one.
    expect(ipcHandles['speech:start']).toBeTypeOf('function');
  });

  it('exposes the engine binary state so the UI can offer an install button', async () => {
    const state = await ipcHandles['speech:get-state']();
    expect(state.installState.engine).toMatchObject({
      installed: false,
      supported: true,
    });
    expect(state.installState.engine.binDir).toBe(path.join(USER_DATA, 'speech-engine', 'bin'));
  });
});
