import { BrowserWindow } from 'electron';
import path from 'path';
import { watch as watchFs } from 'fs';
import { readFile, stat } from 'fs/promises';
import createMainLogger from './logger.js';

const log = createMainLogger('LyricWatcher');

// Local normalizer (kept dependency-free: main/lyricFiles.js pulls extra
// modules that break the renderer-side vitest transform graph).
function normalizeLyricPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null;
  const resolved = path.resolve(filePath.trim());
  return path.isAbsolute(resolved) ? resolved : null;
}

const POLL_INTERVAL_MS = 2000;
const DEBOUNCE_MS = 300;

// normalizedPath -> { filePath, dirWatcher, debounceTimer, mtimeMs, size, lastContent }
const watched = new Map();
// dirPath -> { watcher, refCount, files:Set<normalizedPath> }
const dirWatchers = new Map();
let pollTimer = null;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    try {
      win.webContents.send(channel, payload);
    } catch { }
  }
}

function ensurePollTimer() {
  if (pollTimer || watched.size === 0) return;
  pollTimer = setInterval(() => {
    void pollAllWatched();
  }, POLL_INTERVAL_MS);
  pollTimer.unref?.();
}

function maybeClearPollTimer() {
  if (watched.size === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function snapshotFile(normalized) {
  try {
    const fileStat = await stat(normalized);
    if (!fileStat.isFile()) return { missing: true };
    return { missing: false, mtimeMs: fileStat.mtimeMs, size: fileStat.size };
  } catch (error) {
    if (error?.code === 'ENOENT') return { missing: true };
    throw error;
  }
}

async function checkFileForChanges(normalized, { force = false } = {}) {
  const entry = watched.get(normalized);
  if (!entry) return;
  const snap = await snapshotFile(normalized).catch((error) => {
    log.warn('Watcher stat failed:', normalized, error?.message || error);
    return null;
  });
  if (!snap) return;
  if (snap.missing) {
    log.info('Watched lyrics file removed:', normalized);
    broadcast('lyrics:file-removed', { filePath: normalized });
    unwatchLyricFile(normalized);
    return;
  }
  const mtimeChanged = snap.mtimeMs !== entry.mtimeMs || snap.size !== entry.size;
  if (!mtimeChanged && !force) return;
  entry.mtimeMs = snap.mtimeMs;
  entry.size = snap.size;

  let content = null;
  try {
    content = await readFile(normalized, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      broadcast('lyrics:file-removed', { filePath: normalized });
      unwatchLyricFile(normalized);
    }
    return;
  }

  // Skip echo when content is byte-identical (e.g. our own save just landed).
  if (content === entry.lastContent && !force) return;
  entry.lastContent = content;

  const fileName = path.basename(normalized);
  const ext = path.extname(normalized).toLowerCase().replace(/^\./, '') || 'txt';
  const fileType = ext === 'lrc' ? 'lrc' : 'txt';
  log.info('Watched lyrics file changed, broadcasting:', fileName);
  broadcast('lyrics:file-changed', {
    filePath: normalized,
    fileName,
    fileType,
    content,
    mtimeMs: snap.mtimeMs,
  });
}

async function pollAllWatched() {
  for (const normalized of [...watched.keys()]) {
    try {
      await checkFileForChanges(normalized);
    } catch { }
  }
}

function scheduleDebouncedCheck(normalized) {
  const entry = watched.get(normalized);
  if (!entry) return;
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  entry.debounceTimer = setTimeout(() => {
    entry.debounceTimer = null;
    void checkFileForChanges(normalized);
  }, DEBOUNCE_MS);
  entry.debounceTimer.unref?.();
}

function ensureDirWatcher(normalized) {
  const dirPath = path.dirname(normalized);
  const baseName = path.basename(normalized);
  let dirEntry = dirWatchers.get(dirPath);
  if (!dirEntry) {
    try {
      const watcher = watchFs(dirPath, { persistent: false }, (eventType, filename) => {
        try {
          const changedBase = typeof filename === 'string' ? path.basename(filename) : null;
          // Some platforms report null filename — check all files in this dir.
          if (!changedBase) {
            for (const watchedPath of dirEntry?.files || []) {
              scheduleDebouncedCheck(watchedPath);
            }
            return;
          }
          for (const watchedPath of dirEntry?.files || []) {
            if (path.basename(watchedPath) === changedBase
              || path.basename(watchedPath).toLowerCase() === String(changedBase).toLowerCase()) {
              scheduleDebouncedCheck(watchedPath);
            }
          }
        } catch { }
      });
      watcher.on('error', () => { });
      watcher.unref?.();
      dirEntry = { watcher, files: new Set() };
      dirWatchers.set(dirPath, dirEntry);
    } catch (error) {
      log.warn('Could not watch directory:', dirPath, error?.message || error);
      return null;
    }
  }
  dirEntry.files.add(normalized);
  return dirEntry;
}

function releaseDirWatcher(normalized) {
  const dirPath = path.dirname(normalized);
  const dirEntry = dirWatchers.get(dirPath);
  if (!dirEntry) return;
  dirEntry.files.delete(normalized);
  if (dirEntry.files.size === 0) {
    try { dirEntry.watcher.close(); } catch { }
    dirWatchers.delete(dirPath);
  }
}

export async function watchLyricFile(filePath) {
  const normalized = normalizeLyricPath(filePath);
  if (!normalized) throw new Error('Invalid file path');

  if (watched.has(normalized)) {
    // Refresh baseline without broadcasting.
    try {
      const snap = await snapshotFile(normalized);
      if (!snap.missing) {
        const entry = watched.get(normalized);
        entry.mtimeMs = snap.mtimeMs;
        entry.size = snap.size;
      }
    } catch { }
    return { success: true, filePath: normalized, alreadyWatching: true };
  }

  const snap = await snapshotFile(normalized);
  if (snap.missing) throw new Error('Lyrics file no longer exists');

  let initialContent = null;
  try {
    initialContent = await readFile(normalized, 'utf8');
  } catch {
    initialContent = null;
  }

  watched.set(normalized, {
    filePath: normalized,
    debounceTimer: null,
    mtimeMs: snap.mtimeMs,
    size: snap.size,
    lastContent: initialContent,
  });
  ensureDirWatcher(normalized);
  ensurePollTimer();
  log.info('Watching lyrics file for hot reload:', normalized);
  return { success: true, filePath: normalized };
}

export function unwatchLyricFile(filePath) {
  const normalized = normalizeLyricPath(filePath);
  if (!normalized) return { success: false };
  const entry = watched.get(normalized);
  if (!entry) return { success: true, filePath: normalized, wasWatching: false };
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  watched.delete(normalized);
  releaseDirWatcher(normalized);
  maybeClearPollTimer();
  log.info('Stopped watching lyrics file:', normalized);
  return { success: true, filePath: normalized, wasWatching: true };
}

export function getWatchedLyricFiles() {
  return [...watched.keys()];
}

export function cleanupLyricWatcher() {
  for (const normalized of [...watched.keys()]) {
    try {
      const entry = watched.get(normalized);
      if (entry?.debounceTimer) clearTimeout(entry.debounceTimer);
    } catch { }
  }
  watched.clear();
  for (const [, dirEntry] of dirWatchers) {
    try { dirEntry.watcher.close(); } catch { }
  }
  dirWatchers.clear();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ESM-safe registration (called from main/ipc.js where ipcMain is imported).
export function registerLyricWatcherHandlers(ipcMain) {
  ipcMain.handle('lyrics:watch-file', async (_event, filePath) => {
    try {
      const target = typeof filePath === 'string' ? filePath : filePath?.filePath;
      return await watchLyricFile(target);
    } catch (error) {
      return { success: false, error: error?.message || 'Could not watch file' };
    }
  });

  ipcMain.handle('lyrics:unwatch-file', async (_event, filePath) => {
    try {
      const target = typeof filePath === 'string' ? filePath : filePath?.filePath;
      if (!target) {
        // Unwatch all files requested by this renderer (e.g. song closed).
        for (const watchedPath of getWatchedLyricFiles()) unwatchLyricFile(watchedPath);
        return { success: true };
      }
      return unwatchLyricFile(target);
    } catch (error) {
      return { success: false, error: error?.message || 'Could not unwatch file' };
    }
  });

  ipcMain.handle('lyrics:read-file', async (_event, filePath) => {
    try {
      const normalized = normalizeLyricPath(typeof filePath === 'string' ? filePath : filePath?.filePath);
      if (!normalized) throw new Error('Invalid file path');
      const content = await readFile(normalized, 'utf8');
      const fileStat = await stat(normalized);
      return {
        success: true,
        content,
        fileName: path.basename(normalized),
        filePath: normalized,
        fileType: path.extname(normalized).toLowerCase() === '.lrc' ? 'lrc' : 'txt',
        mtimeMs: fileStat.mtimeMs,
      };
    } catch (error) {
      return { success: false, error: error?.message || 'Could not read file' };
    }
  });
}
