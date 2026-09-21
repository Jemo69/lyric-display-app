import { describe, it, expect } from 'vitest';
import {
  HARDWARE_COMMANDS,
  HARDWARE_COMMAND_PERMISSION,
  DEFAULT_MIDI_MAPPINGS,
  DEFAULT_OSC_PORT,
  OSC_COMMAND_ROUTES,
  normalizeHardwareCommand,
  isSupportedHardwareCommand,
  parseMidiStatusByte,
  midiMessageKey,
  resolveMidiCommand,
  sanitizeMidiMappings,
  isValidMidiKey,
  describeMidiKey,
  parseOscCommand,
  isValidOscPort,
  isOscTokenValid,
  extractOscToken,
  validateOscPacket,
  decodeOscPackets,
  generateOscToken,
  maskToken,
} from '../../shared/hardwareCommands.js';

/** Minimal OSC encoder for wire-decode tests (mirrors the OSC 1.0 spec). */
function oscPadString(str) {
  const bytes = new TextEncoder().encode(str);
  const total = Math.ceil((bytes.length + 1) / 4) * 4;
  const out = new Uint8Array(total);
  out.set(bytes, 0);
  return out;
}

function oscEncodeMessage(address, tags, args) {
  const parts = [oscPadString(address), oscPadString(`,${tags}`)];
  const argBytes = [];
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const value = args[i];
    if (tag === 's') {
      argBytes.push(oscPadString(String(value)));
    } else if (tag === 'i') {
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setInt32(0, value);
      argBytes.push(buf);
    } else if (tag === 'f') {
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setFloat32(0, value);
      argBytes.push(buf);
    }
  }
  const total = parts.reduce((n, p) => n + p.length, 0) + argBytes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const p of [...parts, ...argBytes]) {
    out.set(p, cursor);
    cursor += p.length;
  }
  return out;
}

describe('hardware command map', () => {
  it('exposes the six documented commands', () => {
    expect([...HARDWARE_COMMANDS].sort()).toEqual(
      ['blank', 'clear', 'next', 'prev', 'setlist-next', 'setlist-prev'].sort(),
    );
  });

  it('maps every command onto the output:control permission', () => {
    expect(HARDWARE_COMMAND_PERMISSION).toBe('output:control');
  });

  it('normalizes commands case-insensitively and rejects unknowns', () => {
    expect(normalizeHardwareCommand('NEXT')).toBe('next');
    expect(normalizeHardwareCommand('  Setlist-Prev ')).toBe('setlist-prev');
    expect(normalizeHardwareCommand('launch-missiles')).toBeNull();
    expect(normalizeHardwareCommand(null)).toBeNull();
    expect(normalizeHardwareCommand(42)).toBeNull();
    expect(isSupportedHardwareCommand('blank')).toBe(true);
    expect(isSupportedHardwareCommand('nope')).toBe(false);
  });
});

describe('MIDI mapping', () => {
  it('ships default mappings for hands-free basics', () => {
    expect(DEFAULT_MIDI_MAPPINGS['note:1:60']).toBe('next');
    expect(DEFAULT_MIDI_MAPPINGS['note:1:59']).toBe('prev');
    expect(DEFAULT_MIDI_MAPPINGS['note:1:58']).toBe('clear');
    expect(DEFAULT_MIDI_MAPPINGS['cc:1:64']).toBe('blank');
  });

  it('decodes status bytes into type + 1-indexed channel', () => {
    expect(parseMidiStatusByte(0x90)).toEqual({ type: 'noteon', channel: 1 });
    expect(parseMidiStatusByte(0x9f)).toEqual({ type: 'noteon', channel: 16 });
    expect(parseMidiStatusByte(0x80)).toEqual({ type: 'noteoff', channel: 1 });
    expect(parseMidiStatusByte(0xb3)).toEqual({ type: 'cc', channel: 4 });
    expect(parseMidiStatusByte(0xc0).type).toBeNull(); // program change never fires
    expect(parseMidiStatusByte(0x00).type).toBeNull();
  });

  it('builds mapping keys only for playable messages', () => {
    expect(midiMessageKey({ type: 'noteon', channel: 1, note: 60, velocity: 100 })).toBe('note:1:60');
    expect(midiMessageKey({ type: 'cc', channel: 2, controller: 64, value: 127 })).toBe('cc:2:64');
    // Releases and zero-velocity/value messages must NEVER fire.
    expect(midiMessageKey({ type: 'noteoff', channel: 1, note: 60 })).toBeNull();
    expect(midiMessageKey({ type: 'noteon', channel: 1, note: 60, velocity: 0 })).toBeNull();
    expect(midiMessageKey({ type: 'cc', channel: 1, controller: 64, value: 0 })).toBeNull();
    expect(midiMessageKey({ type: 'noteon', channel: 17, note: 60 })).toBeNull();
    expect(midiMessageKey(null)).toBeNull();
  });

  it('resolves messages to commands through user mappings', () => {
    const mappings = { 'note:1:60': 'next', 'cc:1:64': 'blank' };
    expect(resolveMidiCommand({ type: 'noteon', channel: 1, note: 60, velocity: 90 }, mappings)).toBe('next');
    expect(resolveMidiCommand({ type: 'cc', channel: 1, controller: 64, value: 127 }, mappings)).toBe('blank');
    expect(resolveMidiCommand({ type: 'noteon', channel: 1, note: 61, velocity: 90 }, mappings)).toBeNull();
    expect(resolveMidiCommand({ type: 'noteon', channel: 1, note: 60, velocity: 0 }, mappings)).toBeNull();
  });

  it('sanitizes persisted mappings without dropping the good ones', () => {
    const clean = sanitizeMidiMappings({
      'note:1:60': 'next',
      'bogus': 'next',
      'note:1:61': 'self-destruct',
      'cc:1:200': 'prev',
    });
    expect(clean).toEqual({ 'note:1:60': 'next' });
    expect(sanitizeMidiMappings(null)).toEqual({ ...DEFAULT_MIDI_MAPPINGS });
    expect(sanitizeMidiMappings([])).toEqual({ ...DEFAULT_MIDI_MAPPINGS });
  });

  it('validates mapping keys and labels them for volunteers', () => {
    expect(isValidMidiKey('note:1:60')).toBe(true);
    expect(isValidMidiKey('cc:16:127')).toBe(true);
    expect(isValidMidiKey('note:0:60')).toBe(false);
    expect(isValidMidiKey('note:1:128')).toBe(false);
    expect(isValidMidiKey('pad:1:60')).toBe(false);
    expect(describeMidiKey('note:1:60')).toContain('C4');
    expect(describeMidiKey('cc:1:64')).toContain('CC 64');
  });
});

describe('OSC routes + token auth', () => {
  it('uses a conflict-safe default port', () => {
    expect(DEFAULT_OSC_PORT).toBe(57121);
    expect(isValidOscPort(DEFAULT_OSC_PORT)).toBe(true);
    expect(isValidOscPort(80)).toBe(false);
    expect(isValidOscPort(99999)).toBe(false);
  });

  it('parses canonical addresses case-insensitively', () => {
    expect(parseOscCommand('/lyricdisplay/next')).toBe('next');
    expect(parseOscCommand('/LyricDisplay/Prev')).toBe('prev');
    expect(parseOscCommand('/lyricdisplay/clear')).toBe('clear');
    expect(parseOscCommand('/lyricdisplay/blank')).toBe('blank');
    expect(parseOscCommand('/lyricdisplay/setlist/next')).toBe('setlist-next');
    expect(parseOscCommand('/lyricdisplay/setlist/prev')).toBe('setlist-prev');
    expect(parseOscCommand('/lyricdisplay/launch')).toBeNull();
    expect(parseOscCommand(null)).toBeNull();
    expect(Object.keys(OSC_COMMAND_ROUTES)).toHaveLength(6);
  });

  it('requires a matching token (timing-safe, never empty)', () => {
    const token = generateOscToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(isOscTokenValid(token, token)).toBe(true);
    expect(isOscTokenValid('wrong', token)).toBe(false);
    expect(isOscTokenValid('', token)).toBe(false);
    expect(isOscTokenValid(token, '')).toBe(false);
    expect(isOscTokenValid(null, token)).toBe(false);
    expect(isOscTokenValid(token, null)).toBe(false);
    expect(maskToken(token)).not.toContain(token.slice(4, -4));
  });

  it('extracts the token from the first OSC arg', () => {
    expect(extractOscToken(['abc', 1])).toBe('abc');
    expect(extractOscToken([{ value: 'abc' }])).toBe('abc');
    expect(extractOscToken([])).toBeNull();
    expect(extractOscToken([42])).toBeNull();
  });

  it('validates full packets: address + command + token', () => {
    const token = 's3cr3t-token';
    expect(validateOscPacket({ address: '/lyricdisplay/next', args: [token] }, token))
      .toEqual({ ok: true, command: 'next' });
    expect(validateOscPacket({ address: '/lyricdisplay/next', args: ['wrong'] }, token).ok).toBe(false);
    expect(validateOscPacket({ address: '/lyricdisplay/next', args: ['wrong'] }, token).reason).toBe('bad-token');
    expect(validateOscPacket({ address: '/lyricdisplay/next', args: [] }, token).reason).toBe('bad-token');
    expect(validateOscPacket({ address: '/nope', args: [token] }, token).reason).toBe('unknown-address');
    expect(validateOscPacket({ args: [token] }, token).reason).toBe('malformed-address');
    expect(validateOscPacket(null, token).ok).toBe(false);
  });

  it('decodes real OSC wire packets (messages, ints, bundles, garbage)', () => {
    const token = 'tok-123';
    // Companion-style: address + string token first arg.
    const msg = oscEncodeMessage('/lyricdisplay/next', 's', [token]);
    const decoded = decodeOscPackets(msg);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].address).toBe('/lyricdisplay/next');
    expect(decoded[0].args).toEqual([token]);
    expect(validateOscPacket(decoded[0], token)).toEqual({ ok: true, command: 'next' });

    // Mixed arg types still decode; token extraction uses the first string.
    const mixed = oscEncodeMessage('/lyricdisplay/prev', 'sif', [token, 7, 0.5]);
    const mixedDecoded = decodeOscPackets(mixed);
    expect(mixedDecoded).toHaveLength(1);
    expect(mixedDecoded[0].args[0]).toBe(token);
    expect(mixedDecoded[0].args[1]).toBe(7);
    expect(mixedDecoded[0].args[2]).toBeCloseTo(0.5);

    // X32-style bundle with two commands.
    const el1 = oscEncodeMessage('/lyricdisplay/blank', 's', [token]);
    const el2 = oscEncodeMessage('/lyricdisplay/clear', 's', [token]);
    const bundle = (() => {
      const head = oscPadString('#bundle');
      const timetag = new Uint8Array(8);
      const sizes = [el1, el2].map((el) => {
        const s = new Uint8Array(4);
        new DataView(s.buffer).setInt32(0, el.length);
        return s;
      });
      const total = head.length + 8 + sizes.reduce((n, s) => n + s.length, 0) + el1.length + el2.length;
      const out = new Uint8Array(total);
      let c = 0;
      const push = (p) => { out.set(p, c); c += p.length; };
      push(head);
      push(timetag);
      push(sizes[0]); push(el1);
      push(sizes[1]); push(el2);
      return out;
    })();
    const bundled = decodeOscPackets(bundle);
    expect(bundled.map((p) => p.address)).toEqual(['/lyricdisplay/blank', '/lyricdisplay/clear']);

    // Garbage never throws, never yields packets.
    expect(decodeOscPackets(new Uint8Array([1, 2, 3]))).toEqual([]);
    expect(decodeOscPackets(new Uint8Array(0))).toEqual([]);
    expect(decodeOscPackets(null)).toEqual([]);
    expect(decodeOscPackets(new TextEncoder().encode('not osc at all ........'))).toEqual([]);
  });
});
