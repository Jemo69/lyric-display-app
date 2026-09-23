/**
 * Hardware control command map — shared by the Electron main-process
 * MIDI/OSC controllers, the renderer preferences UI, and tests.
 *
 * Pure ESM with no Node or browser dependencies so it can be imported
 * from `main/`, `src/`, and vitest alike (LOCAL WINS: additive only).
 *
 * Command semantics (all bridge onto existing socket/event flows):
 * - next ......... advance one lyric line   (socket: lineUpdate)
 * - prev ......... previous lyric line      (socket: lineUpdate)
 * - clear ........ clear the projected line (socket: lineUpdate null)
 * - blank ........ toggle master output     (socket: outputToggle)
 * - setlist-next . load next setlist song   (socket: setlistLoad)
 * - setlist-prev . load previous song       (socket: setlistLoad)
 *
 * Every command requires the `output:control` permission. The server
 * re-checks permissions on each socket event, so hardware input can
 * never bypass the existing trust boundary.
 */

export const HARDWARE_COMMANDS = Object.freeze([
  'next',
  'prev',
  'clear',
  'blank',
  'setlist-next',
  'setlist-prev',
]);

/** Volunteer-safe labels shown in the mappings UI. */
export const HARDWARE_COMMAND_LABELS = Object.freeze({
  next: 'Next line',
  prev: 'Previous line',
  clear: 'Clear screen line',
  blank: 'Blank / unblank output',
  'setlist-next': 'Next song in setlist',
  'setlist-prev': 'Previous song in setlist',
});

/** Socket permission every hardware command maps onto. */
export const HARDWARE_COMMAND_PERMISSION = 'output:control';

export function normalizeHardwareCommand(input) {
  if (typeof input !== 'string') return null;
  const cmd = input.trim().toLowerCase();
  return HARDWARE_COMMANDS.includes(cmd) ? cmd : null;
}

export function isSupportedHardwareCommand(input) {
  return normalizeHardwareCommand(input) !== null;
}

export function hardwareCommandLabel(command) {
  return HARDWARE_COMMAND_LABELS[command] || String(command || 'Unknown');
}

// ---------------------------------------------------------------- MIDI ---

/**
 * Mapping key format: `note:<channel>:<note>` or `cc:<channel>:<controller>`
 * with channel 1-16. Only velocity-gated note-on and CC messages fire;
 * note-off / velocity-0 / clock / sysex never trigger commands.
 */
export const DEFAULT_MIDI_MAPPINGS = Object.freeze({
  'note:1:60': 'next', // C4 — advance (typical footswitch / pad)
  'note:1:59': 'prev', // B3 — previous
  'note:1:58': 'clear', // Bb3 — clear projected line
  'cc:1:64': 'blank', // sustain pedal — blank / unblank
});

const NOTE_NAMES = Object.freeze([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
]);

export function midiNoteName(note) {
  const n = Number(note);
  if (!Number.isInteger(n) || n < 0 || n > 127) return `Note ${note}`;
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

/**
 * Decode a raw MIDI status byte into { type, channel }.
 * type is one of 'noteon' | 'noteoff' | 'cc' | null (unsupported).
 */
export function parseMidiStatusByte(statusByte) {
  const status = Number(statusByte);
  if (!Number.isInteger(status) || status < 0x80 || status > 0xff) return { type: null, channel: null };
  const channel = (status & 0x0f) + 1;
  const kind = status & 0xf0;
  if (kind === 0x90) return { type: 'noteon', channel };
  if (kind === 0x80) return { type: 'noteoff', channel };
  if (kind === 0xb0) return { type: 'cc', channel };
  return { type: null, channel };
}

/**
 * Normalize a decoded MIDI message into the mapping-key space.
 * msg: { type: 'noteon'|'noteoff'|'cc', channel, note?, controller?, velocity? }
 * Returns null for messages that must never fire (note-off, velocity 0).
 */
export function midiMessageKey(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const channel = Number(msg.channel);
  if (!Number.isInteger(channel) || channel < 1 || channel > 16) return null;
  if (msg.type === 'noteon') {
    const note = Number(msg.note);
    const velocity = msg.velocity == null ? 1 : Number(msg.velocity);
    if (!Number.isInteger(note) || note < 0 || note > 127) return null;
    if (!(velocity > 0)) return null; // velocity-0 note-on == note-off
    return `note:${channel}:${note}`;
  }
  if (msg.type === 'cc') {
    const controller = Number(msg.controller);
    const value = msg.value == null ? 1 : Number(msg.value);
    if (!Number.isInteger(controller) || controller < 0 || controller > 127) return null;
    if (!(value > 0)) return null; // pedal released — never fire
    return `cc:${channel}:${controller}`;
  }
  return null;
}

/** Resolve a decoded MIDI message to a hardware command via mappings. */
export function resolveMidiCommand(msg, mappings) {
  const key = midiMessageKey(msg);
  if (!key || !mappings || typeof mappings !== 'object') return null;
  return normalizeHardwareCommand(mappings[key]);
}

/** Human-readable label for a mapping key, e.g. "Note C4 · Ch 1". */
export function describeMidiKey(key) {
  if (typeof key !== 'string') return 'Unknown';
  const [kind, channel, number] = key.split(':');
  const ch = `Ch ${channel || '?'}`;
  if (kind === 'note') return `Note ${midiNoteName(Number(number))} · ${ch}`;
  if (kind === 'cc') return `CC ${number} · ${ch}`;
  return key;
}

/** Human-readable label for a decoded live MIDI message. */
export function describeMidiMessage(msg) {
  const key = midiMessageKey(msg);
  if (msg && (msg.type === 'noteoff' || (msg.type === 'noteon' && !(msg.velocity > 0)))) {
    const channel = Number(msg.channel);
    const ch = Number.isInteger(channel) ? `Ch ${channel}` : 'Ch ?';
    return `Release · ${ch}`;
  }
  return key ? describeMidiKey(key) : 'Unsupported message';
}

const MIDI_KEY_PATTERN = /^(note|cc):(1[0-6]|[1-9]):(\d{1,3})$/;

export function isValidMidiKey(key) {
  if (typeof key !== 'string' || !MIDI_KEY_PATTERN.test(key)) return false;
  const [kind, , number] = key.split(':');
  if (kind !== 'note' && kind !== 'cc') return false;
  const n = Number(number);
  return Number.isInteger(n) && n >= 0 && n <= 127;
}

/** Sanitize a persisted mappings object: drop bad keys / bad commands. */
export function sanitizeMidiMappings(mappings, fallback = DEFAULT_MIDI_MAPPINGS) {
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    return { ...fallback };
  }
  const clean = {};
  for (const [key, command] of Object.entries(mappings)) {
    const cmd = normalizeHardwareCommand(command);
    if (cmd && isValidMidiKey(key)) clean[key] = cmd;
  }
  return clean;
}

// ----------------------------------------------------------------- OSC ---

/** Conflict-safe default: dynamic-range port, unlikely to clash. */
export const DEFAULT_OSC_PORT = 57121;
export const MIN_OSC_PORT = 1024;
export const MAX_OSC_PORT = 65535;
/** How many ascending alternates to probe when the port is busy. */
export const OSC_PORT_PROBE_ATTEMPTS = 10;

/** Canonical OSC address → command map (Stream Deck via Companion, X32). */
export const OSC_COMMAND_ROUTES = Object.freeze({
  '/lyricdisplay/next': 'next',
  '/lyricdisplay/prev': 'prev',
  '/lyricdisplay/clear': 'clear',
  '/lyricdisplay/blank': 'blank',
  '/lyricdisplay/setlist/next': 'setlist-next',
  '/lyricdisplay/setlist/prev': 'setlist-prev',
});

/** Resolve an incoming OSC address to a hardware command (case-insensitive). */
export function parseOscCommand(address) {
  if (typeof address !== 'string') return null;
  const normalized = address.trim().toLowerCase();
  return normalizeHardwareCommand(OSC_COMMAND_ROUTES[normalized]);
}

export function isValidOscPort(port) {
  const p = Number(port);
  return Number.isInteger(p) && p >= MIN_OSC_PORT && p <= MAX_OSC_PORT;
}

/**
 * Timing-safe token comparison. Returns false for any non-string,
 * missing, or empty-expected input — OSC auth is always required.
 */
export function isOscTokenValid(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (expected.length === 0 || provided.length === 0) return false;
  if (provided.length !== expected.length) return false;
  // Constant-time-ish char comparison; no Buffer so this stays browser-safe.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Extract the token from decoded OSC args (first string arg). */
export function extractOscToken(args) {
  if (!Array.isArray(args) || args.length === 0) return null;
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first.value === 'string') return first.value;
  return null;
}

/**
 * Validate an incoming OSC packet: { address, args } + expected token.
 * Returns { ok: true, command } or { ok: false, reason }.
 */
export function validateOscPacket(packet, expectedToken) {
  if (!packet || typeof packet.address !== 'string') {
    return { ok: false, reason: 'malformed-address' };
  }
  const command = parseOscCommand(packet.address);
  if (!command) return { ok: false, reason: 'unknown-address' };
  const token = extractOscToken(packet.args);
  if (!isOscTokenValid(token, expectedToken)) return { ok: false, reason: 'bad-token' };
  return { ok: true, command };
}

/** Generate a random hex token (works in Node and browsers). */
export function generateOscToken(bytes = 24) {
  const length = Number.isInteger(bytes) && bytes >= 16 && bytes <= 64 ? bytes : 24;
  try {
    const g = globalThis.crypto;
    if (g && typeof g.getRandomValues === 'function') {
      const buf = new Uint8Array(length);
      g.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through to Math.random
  }
  let out = '';
  const hex = '0123456789abcdef';
  for (let i = 0; i < length * 2; i++) {
    out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

/** Masked token for logs/settings notes — never log the full token. */
export function maskToken(token) {
  if (typeof token !== 'string' || token.length < 8) return '····';
  return `${token.slice(0, 4)}····${token.slice(-4)}`;
}

// ------------------------------------------------------- OSC wire decode ---
//
// Minimal OSC 1.0 packet decoder (messages + bundles; int / float / double /
// string / blob args). Pure Uint8Array/DataView — browser-safe, zero deps,
// never throws. Used by the main-process UDP listener; unit-tested.

function oscReadString(bytes, offset) {
  if (offset >= bytes.length) return null;
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end++;
  if (end >= bytes.length) return null;
  let value = '';
  try {
    value = new TextDecoder().decode(bytes.subarray(offset, end));
  } catch {
    return null;
  }
  const next = offset + Math.ceil((end - offset + 1) / 4) * 4;
  return { value, next };
}

function oscReadArgs(view, bytes, tags, offset) {
  const args = [];
  let cursor = offset;
  for (const tag of tags) {
    switch (tag) {
      case 'i':
        if (cursor + 4 > bytes.length) return null;
        args.push(view.getInt32(cursor));
        cursor += 4;
        break;
      case 'f':
        if (cursor + 4 > bytes.length) return null;
        args.push(view.getFloat32(cursor));
        cursor += 4;
        break;
      case 'd':
        if (cursor + 8 > bytes.length) return null;
        args.push(view.getFloat64(cursor));
        cursor += 8;
        break;
      case 'h':
        if (cursor + 8 > bytes.length) return null;
        try {
          args.push(view.getBigInt64(cursor).toString());
        } catch {
          return null;
        }
        cursor += 8;
        break;
      case 's': {
        const str = oscReadString(bytes, cursor);
        if (!str) return null;
        args.push(str.value);
        cursor = str.next;
        break;
      }
      case 'b': {
        if (cursor + 4 > bytes.length) return null;
        const length = view.getInt32(cursor);
        cursor += 4;
        if (length < 0 || cursor + length > bytes.length) return null;
        args.push(bytes.slice(cursor, cursor + length));
        cursor += Math.ceil(length / 4) * 4;
        break;
      }
      case 't':
        if (cursor + 8 > bytes.length) return null;
        cursor += 8; // timetag — skip
        break;
      case 'T':
        args.push(true);
        break;
      case 'F':
        args.push(false);
        break;
      case 'N':
      case 'I':
        args.push(null);
        break;
      default:
        return null; // unknown type tag — reject, never crash
    }
  }
  return { args };
}

function oscDecodeMessage(bytes, view, offset) {
  const addr = oscReadString(bytes, offset);
  if (!addr || !addr.value.startsWith('/')) return null;
  const tags = oscReadString(bytes, addr.next);
  if (!tags || !tags.value.startsWith(',')) return null;
  const body = oscReadArgs(view, bytes, tags.value.slice(1), tags.next);
  if (!body) return null;
  return { address: addr.value, args: body.args };
}

function toByteView(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return null;
}

/**
 * Decode a UDP payload into [{ address, args }]. Handles `#bundle`
 * (recurse into elements, timetag skipped) and plain messages.
 * Returns [] for anything malformed — never throws.
 */
export function decodeOscPackets(input) {
  try {
    const bytes = toByteView(input);
    if (!bytes || bytes.length < 8) return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const head = oscReadString(bytes, 0);
    if (!head) return [];
    if (head.value === '#bundle') {
      const packets = [];
      let cursor = head.next + 8; // skip 64-bit timetag
      while (cursor + 4 <= bytes.length) {
        const size = view.getInt32(cursor);
        cursor += 4;
        if (size <= 0 || cursor + size > bytes.length) break;
        const element = oscDecodeMessage(bytes, view, cursor);
        if (element) packets.push(element);
        cursor += size;
      }
      return packets;
    }
    const single = oscDecodeMessage(bytes, view, 0);
    return single ? [single] : [];
  } catch {
    return [];
  }
}
