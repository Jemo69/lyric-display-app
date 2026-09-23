import { assertJoinCodeAllowed, recordJoinCodeAttempt } from '../joinCodeGuard.js';
import createServerLogger from '../logger.js';

const log = createServerLogger('ObsDockPairing');

export const OBS_DOCK_PIN_LENGTH = 6;
export const OBS_DOCK_PIN_TTL_MS = 10 * 60 * 1000;
export const OBS_DOCK_MAX_ACTIVE_PINS = 10;

const pinsById = new Map();
let pinSequence = 0;

const randomDigits = (length) => {
  const digits = [];
  const g = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (g && typeof g.getRandomValues === 'function') {
    const buf = new Uint32Array(length);
    g.getRandomValues(buf);
    for (let i = 0; i < length; i += 1) digits.push(String(buf[i] % 10));
    return digits.join('');
  }
  for (let i = 0; i < length; i += 1) digits.push(String(Math.floor(Math.random() * 10)));
  return digits.join('');
};

export const normalizeObsDockPin = (value) => String(value ?? '').trim().replace(/[\s-]+/g, '');

export const isObsDockPinShapeValid = (value) => {
  const pin = normalizeObsDockPin(value);
  return pin.length === OBS_DOCK_PIN_LENGTH && /^\d+$/.test(pin);
};

export function pruneExpiredObsDockPins(now = Date.now()) {
  let pruned = 0;
  for (const [pinId, entry] of pinsById.entries()) {
    if (!entry || entry.expiresAt <= now || entry.consumed) {
      if (entry && entry.consumed && entry.consumedAt && now - entry.consumedAt < 60 * 1000) {
        continue;
      }
      pinsById.delete(pinId);
      pruned += 1;
    }
  }
  return pruned;
}

export function issueObsDockPin({ deviceLabel = '' } = {}) {
  const now = Date.now();
  pruneExpiredObsDockPins(now);

  if (pinsById.size >= OBS_DOCK_MAX_ACTIVE_PINS) {
    const oldest = [...pinsById.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) pinsById.delete(oldest[0]);
  }

  pinSequence += 1;
  const pinId = `obsdock_${now}_${pinSequence}`;
  const entry = {
    pinId,
    pin: randomDigits(OBS_DOCK_PIN_LENGTH),
    createdAt: now,
    expiresAt: now + OBS_DOCK_PIN_TTL_MS,
    consumed: false,
    consumedAt: null,
  };
  pinsById.set(pinId, entry);

  log.info(`OBS dock PIN issued (id: ${pinId}, label: ${String(deviceLabel).slice(0, 40) || 'n/a'})`);
  return {
    pinId,
    pin: entry.pin,
    expiresAt: entry.expiresAt,
    expiresInMs: OBS_DOCK_PIN_TTL_MS,
  };
}

export function verifyObsDockPin(pin, context = {}) {
  const { ip = '', deviceId = '', sessionId = '' } = context;
  const guardContext = { ip, deviceId, sessionId };
  const normalized = normalizeObsDockPin(pin);

  const preCheck = assertJoinCodeAllowed(guardContext);
  if (!preCheck.allowed) {
    return { ok: false, locked: true, retryAfterMs: preCheck.retryAfterMs };
  }

  if (!isObsDockPinShapeValid(normalized)) {
    recordJoinCodeAttempt({ ...guardContext, success: false });
    const status = assertJoinCodeAllowed(guardContext);
    if (!status.allowed) return { ok: false, locked: true, retryAfterMs: status.retryAfterMs };
    return { ok: false, locked: false, error: 'Invalid or expired PIN', remainingAttempts: status.remainingAttempts };
  }

  const now = Date.now();
  pruneExpiredObsDockPins(now);

  let matchedId = null;
  for (const [pinId, entry] of pinsById.entries()) {
    if (!entry.consumed && entry.expiresAt > now && entry.pin === normalized) {
      matchedId = pinId;
      break;
    }
  }

  if (!matchedId) {
    recordJoinCodeAttempt({ ...guardContext, success: false });
    const status = assertJoinCodeAllowed(guardContext);
    if (!status.allowed) return { ok: false, locked: true, retryAfterMs: status.retryAfterMs };
    return { ok: false, locked: false, error: 'Invalid or expired PIN', remainingAttempts: status.remainingAttempts };
  }

  const entry = pinsById.get(matchedId);
  entry.consumed = true;
  entry.consumedAt = now;
  recordJoinCodeAttempt({ ...guardContext, success: true });
  log.info(`OBS dock PIN verified (id: ${matchedId})`);
  return { ok: true, locked: false, pinId: matchedId };
}

export function getObsDockPairingSnapshot() {
  const now = Date.now();
  pruneExpiredObsDockPins(now);
  return {
    activePins: pinsById.size,
    pinTtlMs: OBS_DOCK_PIN_TTL_MS,
    pinLength: OBS_DOCK_PIN_LENGTH,
  };
}

export function __resetObsDockPairingForTests() {
  pinsById.clear();
  pinSequence = 0;
}
