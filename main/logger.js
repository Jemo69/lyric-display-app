import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { BatchedLogWriter } from './batchedLogWriter.js';

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = process.env.LOG_LEVEL ? (LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? 1) : 1;

const formatTimestamp = () => new Date().toISOString();

// Batched file sink (missing-feature #05, piece 2 of 3). Console behaviour
// below is unchanged; warn/error lines are additionally appended to a
// size/retention-capped log file so long services cannot grow logs without
// bound. Everything here is best-effort: file logging never throws and
// stays disabled outside the Electron main process unless LD_LOG_DIR is set
// (tests, plain node) or LD_FILE_LOGS=1 forces it on.
const MAIN_LOG_FILE_NAME = 'lyricdisplay-main.log';
let fileWriter = null;
let fileWriterDisabled = false;
let configuredLogDir = process.env.LD_LOG_DIR || null;

const resolveElectronLogDir = () => {
  try {
    if (!globalThis.process?.versions?.electron) return null;
    const req = createRequire(import.meta.url);
    const electron = req('electron');
    const app = electron?.app;
    if (app && typeof app.getPath === 'function') {
      return app.getPath('logs');
    }
  } catch {
    // Electron unavailable (tests / plain node) — file sink stays off.
  }
  return null;
};

const ensureFileWriter = () => {
  if (fileWriter || fileWriterDisabled) return fileWriter;
  try {
    if (process.env.LD_FILE_LOGS === '0') {
      fileWriterDisabled = true;
      return null;
    }
    const dir = configuredLogDir
      || resolveElectronLogDir()
      || (process.env.LD_FILE_LOGS === '1' ? path.join(os.tmpdir(), 'lyricdisplay-logs') : null);
    if (!dir) {
      // Not under Electron and no explicit opt-in: console-only.
      // Cache nothing — a later configureMainLogFile() call can enable.
      return null;
    }
    fileWriter = new BatchedLogWriter(path.join(dir, MAIN_LOG_FILE_NAME));
  } catch {
    fileWriter = null;
    fileWriterDisabled = true;
  }
  return fileWriter;
};

/** Override the log directory (tests, portable setups). Pass null to clear. */
export const configureMainLogFile = (dir) => {
  configuredLogDir = dir || null;
  if (fileWriter) {
    void fileWriter.close().catch(() => {});
    fileWriter = null;
  }
  fileWriterDisabled = false;
};

/** Flush queued log lines to disk. Safe to call at any time. */
export const flushMainLogs = async () => {
  try {
    await fileWriter?.flush();
  } catch {
    // Ignore.
  }
};

/** Flush and stop the file sink (e.g. app before-quit wiring — follow-up). */
export const closeMainLogs = async () => {
  try {
    await fileWriter?.close();
  } catch {
    // Ignore.
  } finally {
    fileWriter = null;
  }
};

const safeFormatArgs = (args) => args.map((arg) => {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return '[unserializable]';
  }
});

const persistToFile = (level, category, args) => {
  try {
    const writer = ensureFileWriter();
    if (!writer) return;
    writer.write(`[${formatTimestamp()}] [${level}] [${category}] ${safeFormatArgs(args).join(' ')}`);
  } catch {
    // File logging must never break the caller.
  }
};

const createMainLogger = (category) => ({
  debug: (...args) => {
    if (currentLevel <= 0) {
      console.debug(`[${formatTimestamp()}] [DEBUG] [${category}]`, ...args);
    }
  },
  info: (...args) => {
    if (currentLevel <= 1) {
      console.log(`[${formatTimestamp()}] [INFO] [${category}]`, ...args);
    }
  },
  warn: (...args) => {
    if (currentLevel <= 2) {
      console.warn(`[${formatTimestamp()}] [WARN] [${category}]`, ...args);
      persistToFile('WARN', category, args);
    }
  },
  error: (...args) => {
    console.error(`[${formatTimestamp()}] [ERROR] [${category}]`, ...args);
    persistToFile('ERROR', category, args);
  },
});

export default createMainLogger;
