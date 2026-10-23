// @vitest-environment node
/**
 * tests/speech/speechEngineBrokenBinary.test.js — a present binary that cannot
 * be loaded is refused BEFORE an engine is started.
 *
 * THE FAILURE THIS PINS: on Windows the official whisper.cpp build needs the
 * Visual C++ Redistributable. Without it every spawn dies at the loader, the
 * engine emits `transcribe-failed` per segment, and the operator saw nothing.
 * The start gate now probes the binary and returns the remedy instead of
 * starting an engine that cannot transcribe.
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
  app: { getPath: () => globalThis.__BROKEN_ENGINE_USER_DATA__ },
  ipcMain: { handle: (channel, handler) => { ipcHandles[channel] = handler; } },
}));

import { registerSpeechIpc } from '../../main/speechIpc.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-broken-engine-'));
const BIN_DIR = path.join(USER_DATA, 'speech-engine', 'bin');
const relayedOn = (channel) =>
  relayed.filter((entry) => entry.channel === channel).map((entry) => entry.payload);

describe.runIf(process.platform !== 'win32')('a binary that cannot run', () => {
  beforeAll(() => {
    globalThis.__BROKEN_ENGINE_USER_DATA__ = USER_DATA;
    fs.mkdirSync(BIN_DIR, { recursive: true });
    // Stand-in for whisper-cli.exe failing at the Windows loader: present,
    // non-zero size, exits non-zero and names the missing import.
    const binary = path.join(BIN_DIR, 'whisper-cli');
    fs.writeFileSync(binary, '#!/bin/sh\necho "VCRUNTIME140.dll was not found" >&2\nexit 1\n', { mode: 0o755 });
    fs.chmodSync(binary, 0o755);

    registerSpeechIpc({
      getMainWindow,
      engineRoots: [path.join(REPO_ROOT, 'speech-engine')],
      modelsDir: path.join(USER_DATA, 'models'),
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

  it('refuses a PROD start with the runtime remedy, not an empty transcript', async () => {
    const reply = await ipcHandles['speech:start'](null, {
      enabled: true,
      engineMode: 'prod',
      modelId: 'large-v3',
      providerId: 'whispercpp',
      where: 'local',
    });

    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe('engine-broken');
    expect(reply.engine).toBeNull();
    expect(reply.error).toMatchObject({ code: 'missing-vc-runtime' });
    expect(reply.error.message).toMatch(/Visual C\+\+ Redistributable/);

    const errors = relayedOn('speech:error');
    expect(errors.at(-1)).toMatchObject({ code: 'missing-vc-runtime' });
  });

  it('reports the same answer through the explicit self-test channel', async () => {
    const result = await ipcHandles['speech:engine-selftest']();
    expect(result.ok).toBe(false);
    expect(result.code).toBe('missing-vc-runtime');
    expect(result.message).toMatch(/vc_redist/);
  });
});
