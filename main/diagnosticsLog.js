/**
 * main/diagnosticsLog.js — the detailed diagnostics file and its IPC surface.
 *
 * One dedicated file, `lyricdisplay-diagnostics.log`, separate from the
 * main warn/error log: this one carries the verbose timing/count/outcome
 * entries the Diagnostics preferences section copies for support. Rotation
 * and per-line caps come from BatchedLogWriter, so a long service cannot
 * grow the file without bound.
 *
 * Two producers write here:
 *  1. the main process, via `diagMain(level, category, message, details)`
 *     (probe durations, start decisions, download outcomes, relay drops);
 *  2. the renderer, via the `diagnostics:append` channel (engine lifecycle,
 *     Bible navigation/search/import timings, UI errors).
 *
 * The renderer NEVER sends payload text: its diagnostics module redacts
 * transcript/audio/token keys before forwarding, and this module re-checks
 * the same denylist on the way in. Defence in both places, because a log
 * file full of sermon text would be the privacy hole the rest of the
 * feature was built to close.
 */
import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BatchedLogWriter } from './batchedLogWriter.js';

/** Keys that must never reach the diagnostics file, at any depth. */
const REDACTED_KEYS = new Set([
  'text',
  'transcript',
  'segment',
  'segments',
  'partial',
  'note',
  'audio',
  'frames',
  'frame',
  'pcm',
  'wav',
  'token',
  'engineToken',
  'secret',
  'password',
  'authorization',
  'verseText',
  'content',
  'body',
  'payload',
]);

const MAX_READ_BYTES = 512 * 1024;

const sanitize = (value, depth = 0) => {
  if (depth > 6) return '[truncated: depth]';
  if (Array.isArray(value)) {
    return value.length > 50
      ? value.slice(0, 50).map((entry) => sanitize(entry, depth + 1)).concat([`… +${value.length - 50} more`])
      : value.map((entry) => sanitize(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = REDACTED_KEYS.has(key)
        ? (typeof entry === 'string' ? `[redacted ${entry.length} chars]` : '[redacted]')
        : sanitize(entry, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}… [truncated ${value.length - 2000} chars]`;
  }
  return value;
};

const formatLine = (entry) => {
  const ts = typeof entry?.ts === 'string' ? entry.ts : new Date().toISOString();
  const level = String(entry?.level || 'info').toUpperCase();
  const category = String(entry?.category || 'app');
  const message = String(entry?.message || '');
  let suffix = '';
  if (entry?.details && typeof entry.details === 'object') {
    try {
      suffix = ` ${JSON.stringify(sanitize(entry.details))}`;
    } catch {
      suffix = ' [details unserializable]';
    }
  }
  return `[${ts}] [${level}] [${category}] ${message}${suffix}`;
};

let configuredDir = null;
let writer = null;

let cachedElectronApp = null;
let electronAppResolved = false;

/** Electron's app only — null under plain node (control server) or tests. */
const electronApp = () => {
  if (electronAppResolved) return cachedElectronApp;
  electronAppResolved = true;
  try {
    if (!globalThis.process?.versions?.electron) return null;
    const req = createRequire(import.meta.url);
    cachedElectronApp = req('electron')?.app ?? null;
  } catch {
    cachedElectronApp = null;
  }
  return cachedElectronApp;
};

const resolveLogDir = () => {
  if (configuredDir) return configuredDir;
  try {
    const app = electronApp();
    if (app && typeof app.getPath === 'function') return app.getPath('logs');
  } catch {
    // Plain node (control server) or tests — caller must configure.
  }
  return null;
};

/** Override the log directory (tests, portable setups). */
export const configureMainDiagnosticsDir = (dir) => {
  configuredDir = dir || null;
  if (writer) {
    void writer.close().catch(() => {});
    writer = null;
  }
};

export const diagnosticsFilePath = () => {
  const dir = resolveLogDir();
  return dir ? path.join(dir, 'lyricdisplay-diagnostics.log') : null;
};

const ensureWriter = () => {
  if (writer) return writer;
  const filePath = diagnosticsFilePath();
  if (!filePath) return null;
  try {
    writer = new BatchedLogWriter(filePath);
  } catch {
    writer = null;
  }
  return writer;
};

/**
 * Record one main-process diagnostics entry. Best-effort and synchronous
 * from the caller's point of view (the writer batches). Never throws.
 */
export const diagMain = (level, category, message, details) => {
  try {
    const target = ensureWriter();
    if (!target) return null;
    const line = formatLine({ ts: new Date().toISOString(), level, category, message, details });
    target.write(line);
    return line;
  } catch {
    return null;
  }
};

/** Flush queued lines (tests, and before `diagnostics:read`).
 *
 * Waits for the queue to drain instead of firing a single flush: the
 * writer auto-flushes mid-batch without awaiting, and a lone `flush()`
 * issued while that auto-flush is in flight is a documented no-op. A copy
 * taken in that window would read a stale (or missing) file.
 */
export const flushDiagnostics = async () => {
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (!writer) return;
      if ((writer.pendingLines ?? 0) === 0 && !writer.flushing) return;
      await writer.flush();
      if ((writer.pendingLines ?? 0) === 0 && !writer.flushing) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } catch {
    // Ignore.
  }
};

/**
 * Register the renderer's diagnostics IPC surface (Electron main only).
 * Registration only — no filesystem touch until the first append or read.
 * Pass { ipcMain } explicitly in tests; otherwise resolved lazily from
 * Electron, and a no-op without the bridge (control server, plain node).
 */
export const registerDiagnosticsIpc = ({ ipcMain = null } = {}) => {
  try {
    if (!ipcMain) {
      if (!globalThis.process?.versions?.electron) return { diagMain, flushDiagnostics, diagnosticsFilePath };
      const req = createRequire(import.meta.url);
      ipcMain = req('electron')?.ipcMain ?? null;
    }
  } catch {
    ipcMain = null;
  }
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    return { diagMain, flushDiagnostics, diagnosticsFilePath };
  }

  ipcMain.handle('diagnostics:append', (_event, entry) => {
    if (!entry || typeof entry !== 'object') return { ok: false, reason: 'bad-entry' };
    diagMain(entry.level, entry.category, entry.message, entry.details);
    return { ok: true };
  });

  ipcMain.handle('diagnostics:info', async () => {
    const filePath = diagnosticsFilePath();
    if (!filePath) return { ok: false, reason: 'no-log-dir' };
    try {
      await flushDiagnostics();
      const info = await stat(filePath);
      return { ok: true, path: filePath, bytes: info.size, mtimeMs: info.mtimeMs };
    } catch (error) {
      return { ok: false, reason: 'unreadable', error: error?.message || String(error), path: filePath };
    }
  });

  ipcMain.handle('diagnostics:read', async (_event, options = {}) => {
    const filePath = diagnosticsFilePath();
    if (!filePath) return { ok: false, reason: 'no-log-dir' };
    try {
      await flushDiagnostics();
      const info = await stat(filePath);
      const maxBytes = Math.min(
        Number(options?.maxBytes) > 0 ? Number(options.maxBytes) : MAX_READ_BYTES,
        MAX_READ_BYTES
      );
      const start = Math.max(0, info.size - maxBytes);
      const handle = await readFileChunk(filePath, start, info.size - start);
      return {
        ok: true,
        path: filePath,
        bytes: info.size,
        truncated: start > 0,
        content: handle,
      };
    } catch (error) {
      return { ok: false, reason: 'unreadable', error: error?.message || String(error), path: filePath };
    }
  });

  return { diagMain, flushDiagnostics, diagnosticsFilePath };
};

const readFileChunk = async (filePath, start, length) => {
  const full = await readFile(filePath, 'utf8');
  // Drop a partial first line when tailing: it may be half a JSON detail.
  if (start > 0) {
    const sliced = full.slice(full.length - length);
    const newline = sliced.indexOf('\n');
    return newline >= 0 ? sliced.slice(newline + 1) : sliced;
  }
  return full;
};
