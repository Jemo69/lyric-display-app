/**
 * src/utils/diagnosticsLog.js — the renderer's detailed diagnostics journal.
 *
 * One capped in-memory ring (newest wins) plus an optional sink. When the
 * Electron bridge is present, entries are ALSO forwarded to the main process
 * (`diagnostics:append`), which persists them to `lyricdisplay-diagnostics.log`
 * — the file the Diagnostics preferences section copies from.
 *
 * WHAT GOES IN HERE. Timings (how long), outcomes (ok/reason/code), counts
 * (segments, verses, bytes), and error messages. Everything a support
 * screenshot cannot show.
 *
 * WHAT NEVER GOES IN HERE. Transcript text, sermon-note text, audio bytes,
 * PCM frames, tokens, and full verse text. `sanitizeDetail` redacts those
 * keys structurally, so a caller that accidentally passes a segment still
 * cannot leak it. This is the same hygiene the engine supervisor and the
 * history store enforce; the log must not become the hole in it.
 */

const MAX_ENTRIES = 2000;

/** Keys whose values must never reach any log, at any depth. */
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

const summarizeValue = (value) => {
  if (typeof value === 'string') return `[redacted ${value.length} chars]`;
  if (Array.isArray(value)) return `[redacted array len=${value.length}]`;
  if (value && typeof value === 'object') return '[redacted object]';
  return '[redacted]';
};

const sanitizeDetail = (value, depth = 0) => {
  if (depth > 6) return '[truncated: depth]';
  if (Array.isArray(value)) {
    return value.length > 50
      ? value.slice(0, 50).map((entry) => sanitizeDetail(entry, depth + 1)).concat([`… +${value.length - 50} more`])
      : value.map((entry) => sanitizeDetail(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (REDACTED_KEYS.has(key)) {
        out[key] = summarizeValue(entry);
      } else {
        try {
          out[key] = sanitizeDetail(entry, depth + 1);
        } catch {
          out[key] = '[unserializable]';
        }
      }
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}… [truncated ${value.length - 2000} chars]`;
  }
  return value;
};

let sequence = 0;
const entries = [];
let sink = null;

/** Override the forwarding sink (tests, or a non-Electron host). Null clears. */
export const setDiagnosticsSink = (next) => {
  sink = typeof next === 'function' ? next : null;
};

const defaultSink = () => {
  try {
    const append = window?.electronAPI?.diagnostics?.append;
    if (typeof append === 'function') return append;
  } catch {
    // No bridge (browser build, tests) — ring only.
  }
  return null;
};

/**
 * Record one diagnostics entry. Never throws; logging must not break the app.
 *
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} category e.g. 'sermon-assist', 'bible', 'engine'
 * @param {string} message one line, no payload text
 * @param {object} [details] structured data (durations, counts, codes) — sanitized
 */
export const diag = (level, category, message, details) => {
  try {
    const entry = {
      seq: (sequence += 1),
      ts: new Date().toISOString(),
      level,
      category: String(category || 'app'),
      message: String(message || ''),
      ...(details && typeof details === 'object' ? { details: sanitizeDetail(details) } : null),
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    const forward = sink ?? defaultSink();
    if (forward) {
      try {
        const result = forward(entry);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // Forwarding is best-effort; the ring keeps the entry regardless.
      }
    }
    return entry;
  } catch {
    return null;
  }
};

export const diagDebug = (category, message, details) => diag('debug', category, message, details);
export const diagInfo = (category, message, details) => diag('info', category, message, details);
export const diagWarn = (category, message, details) => diag('warn', category, message, details);
export const diagError = (category, message, details) => diag('error', category, message, details);

/**
 * Time a synchronous or async function and log the outcome. Returns fn's
 * result (or rethrows), so wrapping never changes behaviour.
 *
 * @param {string} category
 * @param {string} message
 * @param {() => any} fn
 * @param {(extra?: object) => object} [describe] builds details from the result
 */
export const diagTime = async (category, message, fn, describe) => {
  const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  try {
    const result = await fn();
    let details = { durationMs: Math.round((now() - startedAt) * 10) / 10, ok: true };
    try {
      if (typeof describe === 'function') details = { ...details, ...describe(result) };
    } catch {
      // describe is observability only — never break the call.
    }
    diag('info', category, message, details);
    return result;
  } catch (error) {
    diag('error', category, message, {
      durationMs: Math.round((now() - startedAt) * 10) / 10,
      ok: false,
      code: error?.code,
      error: error?.message || String(error),
    });
    throw error;
  }
};

/** Read-only snapshot of the ring (oldest first). */
export const getDiagnosticsEntries = () => entries.slice();

/** Empty the ring (tests, and the UI's "start fresh" affordance). */
export const clearDiagnosticsEntries = () => {
  entries.length = 0;
};

let globalsInstalled = false;

/**
 * App-wide safety net: uncaught errors and unhandled rejections are recorded
 * with their stack (never payload data — sanitizeDetail still applies).
 * Idempotent; safe to call from the entry point. Never throws.
 *
 * @param {string} category journal category for the captured faults
 */
export const installGlobalDiagnostics = (category = 'app') => {
  try {
    if (globalsInstalled || typeof window === 'undefined') return;
    globalsInstalled = true;
    const describe = (value) => {
      if (value instanceof Error) {
        return { error: value.message, stack: value.stack ? String(value.stack).split('\n').slice(0, 8).join('\n') : null };
      }
      return { error: typeof value === 'string' ? value : '[unhandled rejection]' };
    };
    window.addEventListener('error', (event) => {
      try {
        diag('error', category, 'uncaught error', sanitizeDetail(describe(event?.error || event?.message)));
      } catch {
        // The safety net must never become the crash.
      }
    });
    window.addEventListener('unhandledrejection', (event) => {
      try {
        diag('error', category, 'unhandled rejection', sanitizeDetail(describe(event?.reason)));
      } catch {
        // The safety net must never become the crash.
      }
    });
  } catch {
    // Never break startup.
  }
};

/** Exposed for tests: prove the redaction list caught a shape. */
export const __sanitizeForTest = sanitizeDetail;
export const __maxEntriesForTest = MAX_ENTRIES;
