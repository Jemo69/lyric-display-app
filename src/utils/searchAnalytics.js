/**
 * src/utils/searchAnalytics.js — local-only, non-blocking search telemetry.
 *
 * WHAT THIS IS. A fire-and-forget collector for "user typed X, got Y back"
 * across every search surface (local lyrics, Bible, online libraries, fuzzy
 * verse). Product uses it to answer: what are people searching for, what
 * returns nothing, which surface is slow. It is NOT diagnostics (no errors)
 * and NOT history (no full payloads).
 *
 * WHY IT NEVER SLOWS SEARCH. The search hot path must never await storage:
 *
 *   1. `logSearchEvent()` only pushes a small sanitized object onto an
 *      in-memory queue and schedules a flush. It returns synchronously in
 *      <1ms and never throws — call it inline, do NOT await it.
 *   2. Flushes are batched (every 2s or 20 events, whichever first) and run
 *      on idle time (`requestIdleCallback` when available, else `setTimeout`).
 *      One IndexedDB transaction writes the whole batch.
 *   3. IndexedDB lives off the main thread's critical path; localStorage is
 *      only a fallback and is written with a single capped key.
 *
 * PRIVACY. Local-only by design — nothing here uploads anything. Stored
 * events keep the query (truncated to 200 chars) plus counts and top-result
 * *labels* (title / reference / bible / provider). Full lyric text, verse
 * text, and transcript tails are never stored; `sanitizeTopResults` drops
 * them structurally so a caller can't leak them by accident.
 *
 * CAPS. 2000 events max (oldest pruned), queries <2 chars ignored (typing
 * noise), identical surface+query within 1s deduped. Enough for "top missed
 * queries" without growing storage on church PCs.
 */

const DB_NAME = 'SelahAnalytics';
const STORE_NAME = 'search-events';
const DB_VERSION = 1;

const LS_KEY = 'selah-search-analytics-v1';

export const MAX_EVENTS = 2000;
const MAX_QUERY_LEN = 200;
const MAX_TOP_RESULTS = 5;
const MAX_LABEL_LEN = 120;
const MIN_QUERY_LEN = 2;
const DEDUPE_WINDOW_MS = 1000;
const FLUSH_INTERVAL_MS = 2000;
const FLUSH_BATCH_SIZE = 20;

let sessionId = null;
const getSessionId = () => {
  if (sessionId) return sessionId;
  try {
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    sessionId = `s-${Date.now()}`;
  }
  return sessionId;
};

// In-memory queue (pending flush) — the only thing the hot path touches.
let pending = [];
let persistedCache = null; // last-known persisted list, lazy-loaded
let flushTimer = null;
let flushing = false;
let lastLoggedKey = '';
let lastLoggedAt = 0;

const truncate = (value, max) => {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  return s.length > max ? s.slice(0, max) : s;
};

const sanitizeMeta = (meta, depth = 0) => {
  if (depth > 3) return {};
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  const keys = Object.keys(meta).slice(0, 20);
  for (const key of keys) {
    const v = meta[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') out[key] = truncate(v, MAX_LABEL_LEN);
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'object') out[key] = sanitizeMeta(v, depth + 1);
  }
  return out;
};

/**
 * Keep only display labels from results. Accepts the shapes our surfaces
 * produce ({title, artist, reference, bibleName, provider, ...}) and drops
 * everything else — especially `text` / `lyric` / `snippet` payloads.
 */
const sanitizeTopResults = (results) => {
  if (!Array.isArray(results)) return [];
  return results.slice(0, MAX_TOP_RESULTS).map((r) => {
    if (r === null || r === undefined) return {};
    if (typeof r !== 'object') return { value: truncate(String(r), MAX_LABEL_LEN) };
    const out = {};
    if (r.title !== undefined) out.title = truncate(String(r.title), MAX_LABEL_LEN);
    if (r.artist !== undefined) out.artist = truncate(String(r.artist), MAX_LABEL_LEN);
    if (r.reference !== undefined) out.reference = truncate(String(r.reference), MAX_LABEL_LEN);
    if (r.bibleName !== undefined) out.bibleName = truncate(String(r.bibleName), MAX_LABEL_LEN);
    if (r.bibleId !== undefined) out.bibleId = truncate(String(r.bibleId), MAX_LABEL_LEN);
    if (r.provider !== undefined) out.provider = truncate(String(r.provider), MAX_LABEL_LEN);
    if (r.book !== undefined) out.book = typeof r.book === 'number' ? r.book : truncate(String(r.book), MAX_LABEL_LEN);
    if (r.chapter !== undefined) out.chapter = truncate(String(r.chapter), MAX_LABEL_LEN);
    if (Number.isInteger(r.lineIndex)) out.lineIndex = r.lineIndex;
    // File-navigator lyric results: keep display labels only (file name/type
    // + which field matched). Full paths and content snippets are dropped
    // structurally so a caller can't leak them by accident.
    if (r.fileName !== undefined) out.fileName = truncate(String(r.fileName), MAX_LABEL_LEN);
    if (r.fileType !== undefined) out.fileType = truncate(String(r.fileType), MAX_LABEL_LEN);
    if (r.matchedField !== undefined) out.matchedField = truncate(String(r.matchedField), MAX_LABEL_LEN);
    return out;
  });
};

// --- persistence (off the hot path only) ---

let dbPromise = null;
const getDB = async () => {
  const { openDB } = await import('idb');
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

const readPersisted = async () => {
  if (persistedCache) return persistedCache;
  // Try IndexedDB first.
  try {
    const db = await getDB();
    const all = await db.getAll(STORE_NAME);
    if (Array.isArray(all)) {
      persistedCache = all.sort((a, b) => (a.ts < b.ts ? -1 : 1));
      return persistedCache;
    }
  } catch {
    // Fall through to localStorage.
  }
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        persistedCache = parsed;
        return persistedCache;
      }
    }
  } catch {
    // Corrupt or unavailable — start fresh.
  }
  persistedCache = [];
  return persistedCache;
};

const writePersisted = async (events) => {
  persistedCache = events;
  // Best-effort mirror to both backends; either may fail on church PCs.
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.clear();
    for (const e of events) await tx.store.put(e);
    await tx.done;
  } catch {
    // IDB unavailable (private mode, quota) — localStorage fallback below.
  }
  try {
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Quota / private mode — memory cache still serves reads this session.
  }
};

const scheduleFlush = () => {
  if (flushTimer || flushing) return;
  const run = () => {
    flushTimer = null;
    void flushSearchAnalytics();
  };
  try {
    if (typeof requestIdleCallback === 'function') {
      // Idle callback keeps the write off frame-critical work; the timeout
      // guarantees it still runs on browsers that starve idle callbacks.
      requestIdleCallback(run, { timeout: FLUSH_INTERVAL_MS });
      return;
    }
  } catch {
    // Fall through to setTimeout.
  }
  flushTimer = setTimeout(run, pending.length >= FLUSH_BATCH_SIZE ? 0 : FLUSH_INTERVAL_MS);
};

/**
 * Log one settled search. FIRE-AND-FORGET: returns void synchronously, never
 * throws, never awaits storage. Call it AFTER results arrive (not on every
 * keystroke — the caller already debounced), e.g.:
 *
 *   logSearchEvent({ surface: 'bible', query, resultCount: results.length,
 *     topResults: results, latencyMs: Date.now() - startedAt });
 *
 * @param {object} event
 * @param {string} event.surface one of 'lyrics-local' | 'bible' |
 *   'online-lyrics' | 'verse-fuzzy' | 'file-navigator' | 'song-canvas'
 * @param {string} event.query the settled query string
 * @param {number} [event.resultCount]
 * @param {Array} [event.topResults] raw results — labels extracted, payloads dropped
 * @param {number} [event.latencyMs] time from query to rendered results
 * @param {object} [event.meta] small structured extras (counts, flags, ids)
 */
export const logSearchEvent = (event) => {
  try {
    if (!event || typeof event !== 'object') return;
    const surface = typeof event.surface === 'string' ? event.surface : 'unknown';
    const query = truncate(event.query ?? '', MAX_QUERY_LEN);
    if (query.length < MIN_QUERY_LEN) return; // typing noise

    const now = Date.now();
    const dedupeKey = `${surface}::${query.toLowerCase()}`;
    if (dedupeKey === lastLoggedKey && now - lastLoggedAt < DEDUPE_WINDOW_MS) return;
    lastLoggedKey = dedupeKey;
    lastLoggedAt = now;

    const resultCount = Number.isFinite(Number(event.resultCount)) ? Math.max(0, Math.floor(Number(event.resultCount))) : 0;
    const latencyMs =
      Number.isFinite(Number(event.latencyMs)) && Number(event.latencyMs) >= 0
        ? Math.round(Number(event.latencyMs) * 10) / 10
        : null;

    pending.push({
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date(now).toISOString(),
      sessionId: getSessionId(),
      surface,
      query,
      queryLength: query.length,
      resultCount,
      topResults: sanitizeTopResults(event.topResults),
      ...(latencyMs !== null ? { latencyMs } : null),
      ...((event.meta && typeof event.meta === 'object') ? { meta: sanitizeMeta(event.meta) } : null),
    });
    // Bound memory even if flushes are starved.
    if (pending.length > MAX_EVENTS) pending.splice(0, pending.length - MAX_EVENTS);

    if (pending.length >= FLUSH_BATCH_SIZE) {
      void flushSearchAnalytics();
    } else {
      scheduleFlush();
    }
  } catch {
    // Telemetry must never break search.
  }
};

/**
 * Start a latency timer for a search. Returns a `done(results)` closure so
 * call sites stay two lines and can't forget the duration:
 *
 *   const timed = startSearchTimer('bible', query);
 *   // ... run search ...
 *   timed({ resultCount: results.length, topResults: results });
 */
export const startSearchTimer = (surface, query) => {
  const startedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  const now = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  return (outcome = {}) => {
    logSearchEvent({
      surface,
      query,
      resultCount: outcome.resultCount,
      topResults: outcome.topResults,
      latencyMs: now() - startedAt,
      meta: outcome.meta,
    });
  };
};

/** Write the pending queue to storage. Safe to call anytime; never throws. */
export const flushSearchAnalytics = async () => {
  if (flushing || pending.length === 0) return;
  flushing = true;
  const batch = pending;
  pending = [];
  try {
    const existing = await readPersisted();
    const merged = existing.concat(batch).slice(-MAX_EVENTS);
    await writePersisted(merged);
  } catch {
    // Best-effort: re-queue so a transient IDB failure doesn't lose data.
    try {
      pending = batch.concat(pending).slice(-MAX_EVENTS);
    } catch {
      // Never throw from telemetry.
    }
  } finally {
    flushing = false;
    if (pending.length > 0) scheduleFlush();
  }
};

/**
 * Read stored events (persisted + not-yet-flushed), newest last.
 * @param {object} [options]
 * @param {number} [options.limit] max events (default 200)
 * @param {string} [options.surface] filter to one surface
 */
export const getSearchEvents = async ({ limit = 200, surface = null } = {}) => {
  try {
    const existing = await readPersisted();
    const all = existing.concat(pending);
    const filtered = surface ? all.filter((e) => e.surface === surface) : all;
    return filtered.slice(-Math.max(1, Math.min(limit, MAX_EVENTS)));
  } catch {
    return [];
  }
};

/** Empty all stored search telemetry (settings UI, tests). Never throws. */
export const clearSearchEvents = async () => {
  pending = [];
  persistedCache = [];
  lastLoggedKey = '';
  lastLoggedAt = 0;
  if (flushTimer) {
    try {
      clearTimeout(flushTimer);
    } catch {
      // ignore
    }
    flushTimer = null;
  }
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch {
    // ignore — localStorage removal below still runs
  }
  try {
    globalThis.localStorage?.removeItem(LS_KEY);
  } catch {
    // ignore
  }
};

/**
 * Aggregate stats for product review: searches per surface, zero-result
 * rate, top queries, slowest surfaces. Queries are counted, never joined
 * with payloads.
 */
export const getSearchStats = async ({ limit = 100 } = {}) => {
  const events = await getSearchEvents({ limit: MAX_EVENTS });
  const bySurface = {};
  const queryCounts = new Map();
  const latencySums = {};
  const latencyCounts = {};
  let zeroResult = 0;
  for (const e of events.slice(-Math.max(1, Math.min(limit, MAX_EVENTS)))) {
    bySurface[e.surface] = (bySurface[e.surface] || 0) + 1;
    if (e.resultCount === 0) zeroResult += 1;
    const key = `${e.surface}::${String(e.query || '').toLowerCase()}`;
    queryCounts.set(key, (queryCounts.get(key) || 0) + 1);
    if (typeof e.latencyMs === 'number') {
      latencySums[e.surface] = (latencySums[e.surface] || 0) + e.latencyMs;
      latencyCounts[e.surface] = (latencyCounts[e.surface] || 0) + 1;
    }
  }
  const avgLatencyMs = {};
  for (const s of Object.keys(latencySums)) {
    avgLatencyMs[s] = Math.round((latencySums[s] / latencyCounts[s]) * 10) / 10;
  }
  const topQueries = [...queryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, count]) => {
      const sep = key.indexOf('::');
      return { surface: key.slice(0, sep), query: key.slice(sep + 2), count };
    });
  return {
    total: Math.min(events.length, limit),
    bySurface,
    zeroResultRate: events.length ? Math.round((zeroResult / Math.min(events.length, limit)) * 1000) / 1000 : 0,
    avgLatencyMs,
    topQueries,
  };
};

export const __testOnly = {
  resetForTest: () => {
    pending = [];
    persistedCache = null;
    flushing = false;
    lastLoggedKey = '';
    lastLoggedAt = 0;
    sessionId = null;
    if (flushTimer) {
      try {
        clearTimeout(flushTimer);
      } catch {
        // ignore
      }
      flushTimer = null;
    }
    dbPromise = null;
  },
  getPending: () => pending.slice(),
};
