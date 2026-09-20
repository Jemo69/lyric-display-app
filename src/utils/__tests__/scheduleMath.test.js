import { describe, it, expect } from 'vitest';
import {
  sanitizeSchedule,
  scheduleTotals,
  computePlan,
  reconcileLateStart,
  formatCountdown,
  serializeSchedule,
  parseScheduleDocument,
} from '../../../shared/scheduleMath.js';

const MIN = 60 * 1000;
const T0 = new Date('2026-09-20T09:00:00').getTime();

const threeItemSheet = () => sanitizeSchedule({
  name: 'Sunday Service',
  plannedStartEpochMs: T0,
  items: [
    { id: 'a', name: 'Prelude', minutes: 10, timed: true },
    { id: 'b', name: 'Praise', minutes: 20, timed: true },
    { id: 'c', name: 'Sermon', minutes: 30, timed: true },
  ],
});

describe('scheduleMath', () => {
  it('totals a 3-item sheet (10 + 20 + 30 = 60 min)', () => {
    const totals = scheduleTotals(threeItemSheet());
    expect(totals.itemCount).toBe(3);
    expect(totals.timedMinutes).toBe(60);
    expect(totals.totalMinutes).toBe(60);
  });

  it('lays segments end-to-end from the planned start', () => {
    const { segments, endEpochMs } = computePlan(threeItemSheet(), T0);
    expect(segments).toHaveLength(3);
    expect(segments[0].startEpochMs).toBe(T0);
    expect(segments[0].endEpochMs).toBe(T0 + 10 * MIN);
    expect(segments[1].startEpochMs).toBe(T0 + 10 * MIN);
    expect(segments[2].endEpochMs).toBe(T0 + 60 * MIN);
    expect(endEpochMs).toBe(T0 + 60 * MIN);
  });

  it('keeps untimed items as zero-length markers in position', () => {
    const sheet = sanitizeSchedule({
      name: 'S',
      items: [
        { id: 'a', name: 'Prayer', minutes: 5, timed: true },
        { id: 'b', name: 'Announcements (flex)', minutes: 0, timed: false },
        { id: 'c', name: 'Sermon', minutes: 30, timed: true },
      ],
    });
    const { segments } = computePlan(sheet, T0);
    expect(segments[1].startEpochMs).toBe(segments[1].endEpochMs);
    expect(segments[2].startEpochMs).toBe(T0 + 5 * MIN);
    expect(scheduleTotals(sheet).timedMinutes).toBe(35);
  });

  it('shift-end keeps durations and moves the whole plan later', () => {
    const late = 15 * MIN;
    const result = reconcileLateStart(threeItemSheet(), T0, T0 + late, 'shift');
    expect(result.strategy).toBe('shift');
    expect(result.lateMs).toBe(late);
    expect(result.segments[0].startEpochMs).toBe(T0 + late);
    expect(result.endEpochMs).toBe(T0 + 60 * MIN + late);
    // durations untouched: 10 / 20 / 30
    expect(result.segments.map((s) => s.adjustedMinutes)).toEqual([10, 20, 30]);
  });

  it('compress-segments pins the planned end and shrinks proportionally', () => {
    // 15 min late on a 60 min plan -> 45 min left -> scale 0.75
    const result = reconcileLateStart(threeItemSheet(), T0, T0 + 15 * MIN, 'compress');
    expect(result.strategy).toBe('compress');
    expect(result.adjusted).toBe(true);
    expect(result.endEpochMs).toBe(T0 + 60 * MIN);
    expect(result.segments[0].startEpochMs).toBe(T0 + 15 * MIN);
    expect(result.segments.map((s) => s.adjustedMinutes)).toEqual([7.5, 15, 22.5]);
    expect(result.scale).toBeCloseTo(0.75, 5);
  });

  it('on-time arrival leaves the plan untouched', () => {
    const result = reconcileLateStart(threeItemSheet(), T0, T0, 'compress');
    expect(result.adjusted).toBe(false);
    expect(result.endEpochMs).toBe(T0 + 60 * MIN);
  });

  it('flags overrun when the delay eats the whole plan', () => {
    const result = reconcileLateStart(threeItemSheet(), T0, T0 + 90 * MIN, 'compress');
    expect(result.overrun).toBe(true);
    expect(result.segments.every((s) => s.adjustedMinutes === 0)).toBe(true);
  });

  it('formats countdowns for stage monitors', () => {
    expect(formatCountdown(5 * MIN + 3000)).toBe('5:03');
    expect(formatCountdown(65 * MIN)).toBe('1:05:00');
    expect(formatCountdown(-1000)).toBe('0:00');
    expect(formatCountdown(null)).toBe('--:--');
  });

  it('round-trips a .ldsch document', () => {
    const text = serializeSchedule(threeItemSheet());
    const parsed = parseScheduleDocument(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.schedule.items).toHaveLength(3);
    expect(parsed.schedule.name).toBe('Sunday Service');
  });

  it('rejects non-schedule files with a volunteer-safe message', () => {
    expect(parseScheduleDocument('nope').ok).toBe(false);
    expect(parseScheduleDocument(JSON.stringify({ items: [] })).ok).toBe(false);
    const msg = parseScheduleDocument('nope').error;
    expect(msg).toMatch(/run-sheet/i);
  });
});
