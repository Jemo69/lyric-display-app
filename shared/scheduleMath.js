// shared/scheduleMath.js
// Pure service-scheduler math shared by the Express backend
// (server/realtime/timerScheduler.js) and the React control UI.
// DOM-free on purpose: safe to import from Node and from Vite.

export const SCHEDULE_FORMAT = 'lyricdisplay-schedule';
export const SCHEDULE_VERSION = 1;
export const SCHEDULE_FILE_EXT = '.ldsch';
export const MAX_SCHEDULE_ITEMS = 100;
export const MAX_ITEM_MINUTES = 24 * 60;

const uid = () =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);

const clampMinutes = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_ITEM_MINUTES, Math.max(0, Math.round(n * 100) / 100));
};

export function makeScheduleItem(name = '', minutes = 5, timed = true) {
  return {
    id: uid(),
    name: String(name ?? '').slice(0, 120),
    minutes: clampMinutes(minutes),
    timed: timed !== false,
  };
}

export function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return makeScheduleItem('', 0, true);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : uid(),
    name: String(raw.name ?? '').slice(0, 120),
    minutes: clampMinutes(raw.minutes),
    timed: raw.timed !== false,
  };
}

export function sanitizeSchedule(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const items = Array.isArray(raw.items) ? raw.items.slice(0, MAX_SCHEDULE_ITEMS).map(sanitizeItem) : [];
  const plannedStartEpochMs =
    Number.isFinite(Number(raw.plannedStartEpochMs)) && Number(raw.plannedStartEpochMs) > 0
      ? Number(raw.plannedStartEpochMs)
      : null;
  return {
    name: String(raw.name ?? 'Sunday Service').slice(0, 160) || 'Sunday Service',
    plannedStartEpochMs,
    items,
  };
}

export function scheduleTotals(schedule) {
  const items = Array.isArray(schedule?.items) ? schedule.items : [];
  let timedMinutes = 0;
  let timedCount = 0;
  for (const item of items) {
    if (item?.timed !== false) {
      timedCount += 1;
      timedMinutes += clampMinutes(item?.minutes);
    }
  }
  return {
    itemCount: items.length,
    timedCount,
    untimedCount: items.length - timedCount,
    timedMinutes: Math.round(timedMinutes * 100) / 100,
    totalMinutes: Math.round(timedMinutes * 100) / 100,
  };
}

// Lay items end-to-end from a start epoch. Untimed items are kept in
// position as zero-length markers (start == end) so the plan order is
// preserved for the stage display.
export function computePlan(schedule, startEpochMs) {
  const clean = sanitizeSchedule(schedule);
  const start = Number(startEpochMs);
  const segments = [];
  let cursor = Number.isFinite(start) ? start : Date.now();
  for (const item of clean.items) {
    const durationMs = item.timed === false ? 0 : clampMinutes(item.minutes) * 60 * 1000;
    const seg = {
      id: item.id,
      name: item.name,
      minutes: item.minutes,
      timed: item.timed,
      adjustedMinutes: item.timed === false ? 0 : clampMinutes(item.minutes),
      startEpochMs: cursor,
      endEpochMs: cursor + durationMs,
    };
    segments.push(seg);
    cursor += durationMs;
  }
  return { segments, startEpochMs: segments[0]?.startEpochMs ?? cursor, endEpochMs: cursor };
}

// Late-start reconciliation.
// - 'shift-end': keep every segment length, move the whole plan so it
//   starts at the actual start (the service ends later).
// - 'compress-segments': keep the planned end time, shrink timed
//   segments proportionally to absorb the late start.
export function reconcileLateStart(schedule, plannedStartEpochMs, actualStartEpochMs, strategy = 'compress') {
  const clean = sanitizeSchedule(schedule);
  const planned = Number(plannedStartEpochMs);
  const actual = Number(actualStartEpochMs);
  const mode = strategy === 'shift' ? 'shift' : 'compress';
  const base = computePlan(clean, planned);
  const lateMs = Math.max(0, actual - planned);

  if (!Number.isFinite(planned) || !Number.isFinite(actual) || lateMs <= 0) {
    return { strategy: mode, lateMs: 0, adjusted: false, overrun: false, scale: 1, ...base };
  }

  if (mode === 'shift') {
    const shifted = computePlan(clean, actual);
    return { strategy: mode, lateMs, adjusted: true, overrun: false, scale: 1, ...shifted };
  }

  // compress-segments
  const plannedEnd = base.endEpochMs;
  const availableMs = plannedEnd - actual;
  const totalTimedMs = base.segments.reduce(
    (sum, s) => sum + (s.timed === false ? 0 : s.endEpochMs - s.startEpochMs),
    0
  );
  if (availableMs <= 0 || totalTimedMs <= 0) {
    const zeroed = computePlan(
      { ...clean, items: clean.items.map((i) => ({ ...i, minutes: i.timed === false ? i.minutes : 0 })) },
      actual
    );
    return {
      strategy: mode,
      lateMs,
      adjusted: true,
      overrun: true,
      scale: 0,
      segments: zeroed.segments,
      startEpochMs: actual,
      endEpochMs: actual,
    };
  }
  const scale = availableMs / totalTimedMs;
  const adjustedItems = clean.items.map((item) => {
    if (item.timed === false) return { ...item };
    return { ...item, minutes: Math.floor(item.minutes * scale * 100) / 100 };
  });
  const plan = computePlan({ ...clean, items: adjustedItems }, actual);
  return {
    strategy: mode,
    lateMs,
    adjusted: true,
    overrun: false,
    scale: Math.round(scale * 1000) / 1000,
    segments: plan.segments,
    startEpochMs: actual,
    // Compress mode pins the end: recompute from scaled durations, then
    // clamp any float-dust drift back to the original planned end.
    endEpochMs: plannedEnd,
  };
}

export function formatCountdown(remainingMs) {
  if (remainingMs == null || !Number.isFinite(Number(remainingMs))) return '--:--';
  const ms = Math.max(0, Math.ceil(Number(remainingMs) / 1000) * 1000);
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

export function formatClockTime(epochMs) {
  const n = Number(epochMs);
  if (!Number.isFinite(n) || n <= 0) return '--:--';
  try {
    return new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

export function formatLateDuration(lateMs) {
  const n = Math.max(0, Number(lateMs) || 0);
  const mins = Math.round(n / 60000);
  if (mins < 1) return 'on time';
  if (mins === 1) return '1 minute late';
  return `${mins} minutes late`;
}

export function serializeSchedule(schedule) {
  const clean = sanitizeSchedule(schedule);
  return JSON.stringify(
    {
      app: SCHEDULE_FORMAT,
      version: SCHEDULE_VERSION,
      savedAt: new Date().toISOString(),
      name: clean.name,
      plannedStartEpochMs: clean.plannedStartEpochMs,
      items: clean.items,
    },
    null,
    2
  );
}

export function parseScheduleDocument(text) {
  let doc;
  try {
    doc = JSON.parse(String(text));
  } catch {
    return { ok: false, error: 'That file is not a valid run-sheet (.ldsch) file.' };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'That file is not a valid run-sheet (.ldsch) file.' };
  }
  if (doc.app && doc.app !== SCHEDULE_FORMAT) {
    return { ok: false, error: `That file is a “${doc.app}” file, not a LyricDisplay run-sheet.` };
  }
  if (doc.version != null && Number(doc.version) > SCHEDULE_VERSION) {
    return { ok: false, error: 'That run-sheet was saved by a newer LyricDisplay. Please update first.' };
  }
  if (!Array.isArray(doc.items) || doc.items.length === 0) {
    return { ok: false, error: 'That run-sheet has no items. Add at least one segment first.' };
  }
  if (doc.items.length > MAX_SCHEDULE_ITEMS) {
    return { ok: false, error: `That run-sheet has too many items (max ${MAX_SCHEDULE_ITEMS}).` };
  }
  return { ok: true, schedule: sanitizeSchedule(doc) };
}
