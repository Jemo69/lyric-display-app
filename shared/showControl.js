/**
 * Show-control state machine (feature #18: Clear / Blackout / Logo + ticker).
 *
 * Four explicit output states shared by server, control panel, outputs, stage
 * and mobile controllers. The legacy boolean master toggle (`isOutputOn`)
 * maps onto this machine so every existing caller keeps working:
 *   ON  -> LIVE
 *   OFF -> BLACKOUT
 *
 * States:
 *   LIVE     — normal lyric projection.
 *   CLEAR    — lyrics hidden, background (media/color) stays visible.
 *   BLACKOUT — full black on every surface.
 *   LOGO     — house slide (logo lockup over background).
 *
 * The announcement ticker is independent of show-state: queued announcements
 * render as a lower-third overlay without disturbing the current lyric line.
 */

export const SHOW_STATE_LIVE = 'LIVE';
export const SHOW_STATE_CLEAR = 'CLEAR';
export const SHOW_STATE_BLACKOUT = 'BLACKOUT';
export const SHOW_STATE_LOGO = 'LOGO';

export const SHOW_STATE_LIST = [
  SHOW_STATE_LIVE,
  SHOW_STATE_CLEAR,
  SHOW_STATE_BLACKOUT,
  SHOW_STATE_LOGO,
];

export const DEFAULT_SHOW_STATE = SHOW_STATE_LIVE;

const STATE_META = {
  [SHOW_STATE_LIVE]: {
    label: 'Live',
    hint: 'Projecting lyrics normally.',
  },
  [SHOW_STATE_CLEAR]: {
    label: 'Clear',
    hint: 'Lyrics hidden — background stays visible.',
  },
  [SHOW_STATE_BLACKOUT]: {
    label: 'Blackout',
    hint: 'All outputs full black.',
  },
  [SHOW_STATE_LOGO]: {
    label: 'Logo',
    hint: 'House slide on all outputs.',
  },
};

/**
 * Normalize any input to a valid show-state. Unknown values fall back.
 */
export function normalizeShowState(value, fallback = DEFAULT_SHOW_STATE) {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if (SHOW_STATE_LIST.includes(upper)) return upper;
  }
  if (SHOW_STATE_LIST.includes(fallback)) return fallback;
  return DEFAULT_SHOW_STATE;
}

export function isValidShowState(value) {
  return typeof value === 'string' && SHOW_STATE_LIST.includes(value.trim().toUpperCase());
}

/**
 * Legacy master-toggle mapping: only LIVE counts as master ON.
 * CLEAR / BLACKOUT / LOGO all read as master OFF for legacy consumers
 * (mobile app, HTTP action buttons, old output builds).
 */
export function showStateToMasterOn(state) {
  return normalizeShowState(state) === SHOW_STATE_LIVE;
}

/**
 * Legacy master-toggle mapping in reverse: ON restores LIVE, OFF blacks out.
 */
export function masterOnToShowState(on) {
  if (typeof on === 'string') {
    const lowered = on.toLowerCase().trim();
    if (lowered === 'true' || lowered === '1') return SHOW_STATE_LIVE;
    if (lowered === 'false' || lowered === '0') return SHOW_STATE_BLACKOUT;
  }
  return on ? SHOW_STATE_LIVE : SHOW_STATE_BLACKOUT;
}

/**
 * Apply a legacy boolean toggle onto a current show-state without breaking
 * callers: turning ON always restores LIVE; turning OFF blacks out from LIVE
 * but preserves an already-explicit CLEAR / LOGO / BLACKOUT choice.
 */
export function applyMasterToggleToShowState(currentState, on) {
  const current = normalizeShowState(currentState);
  if (on) return SHOW_STATE_LIVE;
  return current === SHOW_STATE_LIVE ? SHOW_STATE_BLACKOUT : current;
}

export function describeShowState(state) {
  const normalized = normalizeShowState(state);
  return { state: normalized, ...STATE_META[normalized] };
}

// ---------------------------------------------------------------------------
// Announcement ticker (independent overlay queue)
// ---------------------------------------------------------------------------

export const TICKER_MAX_TEXT_LENGTH = 280;
export const TICKER_MAX_QUEUE = 20;

export function sanitizeTickerText(text) {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, TICKER_MAX_TEXT_LENGTH);
}

export function createTickerItem(text, extra = {}) {
  const clean = sanitizeTickerText(text);
  if (!clean) throw new Error('Announcement text required');
  return {
    id: extra.id || `ticker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: clean,
    createdAt: extra.createdAt || Date.now(),
  };
}

/**
 * Add an announcement to the queue (immutable). Throws on empty text or when
 * the queue is full. The first item becomes active when nothing is active.
 */
export function addTickerItem(queue, text) {
  const items = Array.isArray(queue) ? [...queue] : [];
  if (items.length >= TICKER_MAX_QUEUE) {
    throw new Error(`Announcement queue full (max ${TICKER_MAX_QUEUE})`);
  }
  const item = createTickerItem(text);
  items.push(item);
  const activeId = items.length === 1 ? item.id : undefined;
  return { queue: items, added: item, ...(activeId ? { activateId: activeId } : {}) };
}

export function removeTickerItem(queue, id) {
  const items = (Array.isArray(queue) ? queue : []).filter((item) => item?.id !== id);
  return { queue: items, removedActive: false };
}

export function clearTickerQueue() {
  return { queue: [], activeId: null };
}

/**
 * Resolve the active overlay item: explicit activeId wins when still queued,
 * otherwise fall back to the head of the queue, otherwise null.
 */
export function resolveTickerActive(queue, activeId) {
  const items = Array.isArray(queue) ? queue : [];
  if (items.length === 0) return null;
  if (activeId) {
    const explicit = items.find((item) => item?.id === activeId);
    if (explicit) return explicit;
  }
  return items[0] || null;
}
