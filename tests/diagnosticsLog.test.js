// @vitest-environment node
/**
 * tests/diagnosticsLog.test.js — the support journal.
 *
 * What this proves:
 *  - entries redact transcript/audio/token/verse-text keys at any depth, so a
 *    caller that forwards a whole engine message cannot leak it into the log;
 *  - the ring is capped (oldest entries age out, newest survive);
 *  - diagTime measures, reports success, and reports failure THEN rethrows;
 *  - a throwing sink never breaks the caller, and the ring keeps the entry;
 *  - the main-process side writes lines, caps the read, and redacts too.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  diag,
  diagInfo,
  diagTime,
  getDiagnosticsEntries,
  clearDiagnosticsEntries,
  setDiagnosticsSink,
  __maxEntriesForTest,
} from '../src/utils/diagnosticsLog.js';

beforeEach(() => {
  clearDiagnosticsEntries();
  setDiagnosticsSink(null);
  delete globalThis.window;
});

afterEach(() => {
  clearDiagnosticsEntries();
  setDiagnosticsSink(null);
  delete globalThis.window;
});

describe('diagnostics ring (renderer)', () => {
  it('records entries oldest-first with sequence, timestamp, and level', () => {
    diagInfo('bible', 'passage navigated', { book: 'John' });
    diag('warn', 'engine', 'slow segment', { durationMs: 1234 });
    const entries = getDiagnosticsEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ level: 'info', category: 'bible', message: 'passage navigated' });
    expect(entries[1].level).toBe('warn');
    expect(entries[1].seq).toBeGreaterThan(entries[0].seq);
    expect(new Date(entries[0].ts).toString()).not.toBe('Invalid Date');
  });

  it('caps the ring so a long service cannot grow memory without bound', () => {
    for (let i = 0; i < __maxEntriesForTest + 50; i += 1) {
      diagInfo('test', `entry ${i}`);
    }
    const entries = getDiagnosticsEntries();
    expect(entries).toHaveLength(__maxEntriesForTest);
    // Oldest aged out, newest survived.
    expect(entries[0].message).toBe('entry 50');
    expect(entries[entries.length - 1].message).toBe(`entry ${__maxEntriesForTest + 49}`);
  });

  it('redacts payload text at any depth, keeping counts and codes', () => {
    diagInfo('sermon-assist', 'final received', {
      sessionId: 's1',
      text: 'the sermon words go here',
      nested: { transcript: 'more words', code: 'ok', frames: [1, 2, 3] },
      token: 'abc123',
      durationMs: 42,
    });
    const details = getDiagnosticsEntries()[0].details;
    expect(details.sessionId).toBe('s1');
    expect(details.durationMs).toBe(42);
    expect(details.text).toMatch(/redacted 24 chars/);
    expect(details.nested.code).toBe('ok');
    expect(details.nested.transcript).toMatch(/redacted/);
    expect(details.nested.frames).toMatch(/redacted array/);
    expect(details.token).toMatch(/redacted/);
    const flat = JSON.stringify(details);
    expect(flat).not.toContain('sermon words');
  });

  it('does not forward when no sink or bridge exists, and never throws', () => {
    expect(() => diagInfo('test', 'quiet entry')).not.toThrow();
    expect(getDiagnosticsEntries()).toHaveLength(1);
  });

  it('forwards to an explicit sink, and a throwing sink keeps the ring intact', () => {
    const seen = [];
    setDiagnosticsSink((entry) => {
      seen.push(entry);
    });
    diagInfo('bible', 'translation imported', { books: 66 });
    expect(seen).toHaveLength(1);
    expect(seen[0].message).toBe('translation imported');

    setDiagnosticsSink(() => {
      throw new Error('sink is down');
    });
    expect(() => diagInfo('bible', 'still recorded')).not.toThrow();
    expect(getDiagnosticsEntries()).toHaveLength(2);
  });

  it('reads window.electronAPI.diagnostics.append as the default sink', async () => {
    const appended = [];
    globalThis.window = {
      electronAPI: { diagnostics: { append: (entry) => void appended.push(entry) } },
    };
    diagInfo('engine', 'transport start settled', { ok: true });
    expect(appended).toHaveLength(1);
    expect(appended[0].category).toBe('engine');
  });

  it('an async sink rejection never breaks the caller', async () => {
    globalThis.window = {
      electronAPI: { diagnostics: { append: async () => { throw new Error('ipc down'); } } },
    };
    expect(() => diagInfo('engine', 'still fine')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getDiagnosticsEntries()).toHaveLength(1);
  });
});

describe('diagTime', () => {
  it('measures a success and reports the described outcome', async () => {
    const result = await diagTime('bible', 'translations bulk-loaded', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { loaded: 3 };
    }, (value) => ({ loaded: value.loaded }));
    expect(result).toEqual({ loaded: 3 });
    const entry = getDiagnosticsEntries()[0];
    expect(entry.level).toBe('info');
    expect(entry.details.ok).toBe(true);
    expect(entry.details.loaded).toBe(3);
    expect(entry.details.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a failure with the error, then rethrows the original', async () => {
    const failure = Object.assign(new Error('disk is gone'), { code: 'EIO' });
    await expect(
      diagTime('bible', 'translation stored', async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    const entry = getDiagnosticsEntries()[0];
    expect(entry.level).toBe('error');
    expect(entry.details.ok).toBe(false);
    expect(entry.details.code).toBe('EIO');
    expect(entry.details.error).toMatch(/disk is gone/);
  });
});

describe('diagnostics file (main)', () => {
  const { ipcHandles } = vi.hoisted(() => ({ ipcHandles: {} }));
  let tmpDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-diag-test-'));
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { getPath: () => tmpDir },
      ipcMain: { handle: (channel, handler) => { ipcHandles[channel] = handler; } },
    }));
    const diagnostics = await import('../main/diagnosticsLog.js');
    diagnostics.configureMainDiagnosticsDir(tmpDir);
    diagnostics.registerDiagnosticsIpc();
    await diagnostics.flushDiagnostics();
  });

  afterEach(() => {
    vi.unmock('electron');
    vi.resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const key of Object.keys(ipcHandles)) delete ipcHandles[key];
  });

  it('registers append, info, and read channels', () => {
    expect(typeof ipcHandles['diagnostics:append']).toBe('function');
    expect(typeof ipcHandles['diagnostics:info']).toBe('function');
    expect(typeof ipcHandles['diagnostics:read']).toBe('function');
  });

  it('persists a renderer entry and reads it back, redacted', async () => {
    const reply = await ipcHandles['diagnostics:append']({}, {
      level: 'info',
      category: 'sermon-assist',
      message: 'final received',
      details: { sessionId: 's1', text: 'the sermon words', textChars: 16 },
    });
    expect(reply).toEqual({ ok: true });

    const read = await ipcHandles['diagnostics:read']({}, {});
    expect(read.ok).toBe(true);
    expect(read.content).toMatch(/final received/);
    expect(read.content).toMatch(/\[redacted 16 chars\]/);
    expect(read.content).not.toContain('the sermon words');
  });

  it('caps the read so a huge log cannot flood the clipboard path', async () => {
    for (let i = 0; i < 30; i += 1) {
      await ipcHandles['diagnostics:append']({}, {
        level: 'info', category: 'test', message: `line ${i} ` + 'x'.repeat(5000),
      });
    }
    const read = await ipcHandles['diagnostics:read']({}, { maxBytes: 1024 });
    expect(read.ok).toBe(true);
    expect(read.truncated).toBe(true);
    expect(read.content.length).toBeLessThan(10000);
  });

  it('info reports the path and size once anything was logged', async () => {
    // A fresh directory has no file yet: info is honestly negative.
    const before = await ipcHandles['diagnostics:info']({},);
    expect(before.ok).toBe(false);
    expect(before.reason).toBe('unreadable');

    await ipcHandles['diagnostics:append']({}, {
      level: 'info', category: 'test', message: 'first line',
    });
    const info = await ipcHandles['diagnostics:info']({},);
    expect(info.ok).toBe(true);
    expect(info.path).toMatch(/lyricdisplay-diagnostics\.log$/);
    expect(info.bytes).toBeGreaterThan(0);
  });
});
