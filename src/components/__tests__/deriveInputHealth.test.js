/**
 * deriveInputHealth tests — the pure decision behind the rail's health line.
 *
 * The function is deliberately exported from SermonAssistPanel so the operator
 * copy can be pinned without rendering anything: what we promise a church
 * operator during a live service is wording, and wording is a testable
 * contract. The rules under test:
 *
 *   - a dead input is an ERROR (ten seconds of flat signal loses the sermon),
 *     a clipping input is a WARNING, loopback is a neutral NOTE, and a healthy
 *     input says so positively;
 *   - clipping beats silence beats the loopback note (precedence), so two
 *     simultaneous conditions never produce a coin-flip message;
 *   - `silentMs` only counts when the meter is still flat — a loud meter with
 *     a stale accumulator can never claim silence.
 *
 * No rendering, no timers: the caller (the rail) applies persistence
 * (CLIP_PERSIST_MS / SILENT_MS_LIMIT) and passes the durations in.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveInputHealth,
  SILENCE_LEVEL,
  SILENT_MS_LIMIT,
  CLIP_PERSIST_MS,
} from '../Speech/SermonAssistPanel';

const OK_TONES = ['ok', 'warn', 'error'];

describe('deriveInputHealth', () => {
  it('exports honest thresholds: 10 s of silence, 1 s of clip, a near-zero floor', () => {
    expect(SILENT_MS_LIMIT).toBeGreaterThanOrEqual(10000);
    expect(CLIP_PERSIST_MS).toBeGreaterThanOrEqual(250);
    expect(SILENCE_LEVEL).toBeGreaterThan(0);
    expect(SILENCE_LEVEL).toBeLessThanOrEqual(0.05);
  });

  it('a healthy input gets a positive, quiet confirmation', () => {
    expect(deriveInputHealth({ level: 0.4, silentMs: 0 })).toEqual({
      tone: 'ok',
      message: 'Input level is good.',
    });
    // Nothing supplied at all is the same as "quiet but no complaint yet".
    expect(deriveInputHealth()).toEqual({ tone: 'ok', message: 'Input level is good.' });
  });

  it('flat signal below ten seconds is NOT reported — a quiet first second is not an outage', () => {
    const justUnder = deriveInputHealth({ level: 0, silentMs: SILENT_MS_LIMIT - 1 });
    expect(justUnder.tone).toBe('ok');
    const justStarted = deriveInputHealth({ level: 0, silentMs: 0 });
    expect(justStarted.tone).toBe('ok');
  });

  it('flat signal for ten seconds or more is an error naming the fix', () => {
    const result = deriveInputHealth({ level: 0, silentMs: SILENT_MS_LIMIT });
    expect(result.tone).toBe('error');
    expect(result.message).toBe(
      'No signal — check the input is not muted and the right device is selected.'
    );
    // The threshold itself counts (>=, not >).
    expect(deriveInputHealth({ level: 0, silentMs: SILENT_MS_LIMIT - 1 }).tone).toBe('ok');
    expect(deriveInputHealth({ level: SILENCE_LEVEL, silentMs: SILENT_MS_LIMIT }).tone).toBe('error');
    expect(deriveInputHealth({ level: 0, silentMs: 60000 }).tone).toBe('error');
  });

  it('an audible meter cancels a stale silence accumulator', () => {
    // A 60 s accumulator must never overrule a meter that is clearly live.
    const result = deriveInputHealth({ level: SILENCE_LEVEL + 0.5, silentMs: 60000 });
    expect(result).toEqual({ tone: 'ok', message: 'Input level is good.' });
  });

  it('persistent clipping is a warning naming the fix', () => {
    const result = deriveInputHealth({ level: 0.7, clipped: true, silentMs: 0 });
    expect(result.tone).toBe('warn');
    expect(result.message).toBe(
      'Input is clipping — lower the source gain or move the mic back.'
    );
    // A single un-persisted frame (clipped:false) earns no complaint.
    expect(deriveInputHealth({ level: 0.9, clipped: false }).tone).toBe('ok');
  });

  it('loopback is a neutral note, not a problem', () => {
    const result = deriveInputHealth({ level: 0.3, sourceKind: 'loopback' });
    expect(result.tone).toBe('ok');
    expect(result.message).toContain('system audio');
    expect(result.message).toContain('not the room');
    expect(result.message).not.toMatch(/no signal|clipping|check the/i);
  });

  it('precedence: clipping beats silence, silence beats the loopback note', () => {
    expect(deriveInputHealth({ level: 0, silentMs: 60000, clipped: true }).tone).toBe('warn');
    expect(deriveInputHealth({ level: 0, silentMs: 60000, sourceKind: 'loopback' }).tone).toBe(
      'error'
    );
    expect(deriveInputHealth({ level: 0.2, clipped: true, sourceKind: 'loopback' }).tone).toBe(
      'warn'
    );
    // Live meter + loopback: the neutral note still stands.
    expect(deriveInputHealth({ level: 0.2, silentMs: 0, sourceKind: 'loopback' }).tone).toBe('ok');
  });

  it('every branch returns a known tone and a non-empty operator-facing sentence', () => {
    const inputs = [
      {},
      { level: 0.5 },
      { level: 0, silentMs: SILENT_MS_LIMIT },
      { level: 0.9, clipped: true },
      { sourceKind: 'loopback' },
      { sourceKind: 'microphone' },
      { sourceKind: 'usb', level: 0, silentMs: 999999 },
      { sourceKind: 'network', clipped: true, silentMs: 999999 },
    ];
    for (const input of inputs) {
      const result = deriveInputHealth(input);
      expect(OK_TONES, `tone for ${JSON.stringify(input)}`).toContain(result.tone);
      expect(typeof result.message).toBe('string');
      expect(result.message.trim().length).toBeGreaterThan(0);
    }
  });
});
