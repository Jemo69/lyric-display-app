// server/realtime/timerScheduler.js
// Timed service run-sheet engine (missing feature #01).
//
// Owns the authoritative schedule clock: countdown, auto-advance and
// late-start reconciliation. The socket layer (server/events.js) keeps
// all permission checks; this module never touches auth. State is
// persisted through the realtime session snapshot (getSnapshot /
// restoreSnapshot) so a reboot mid-service resumes paused, never
// silently running.
//
// The 1s tick is edge-triggered: tick() returns null unless a second
// boundary or a status transition needs to reach clients.

import createServerLogger from '../logger.js';
import {
  sanitizeSchedule,
  computePlan,
  reconcileLateStart,
  MAX_SCHEDULE_ITEMS,
} from '../../shared/scheduleMath.js';

const log = createServerLogger('TimerScheduler');

export const SCHEDULE_STATUSES = ['idle', 'running', 'paused', 'finished'];

const defaultNow = () => Date.now();
const noopEmit = () => {};

const segmentDurationMs = (seg) => Math.max(0, (seg?.endEpochMs ?? 0) - (seg?.startEpochMs ?? 0));

export class TimerScheduler {
  constructor({ emit = noopEmit, now = defaultNow } = {}) {
    this.emit = typeof emit === 'function' ? emit : noopEmit;
    this.now = typeof now === 'function' ? now : defaultNow;
    this.schedule = null;
    this.plan = { segments: [], startEpochMs: null, endEpochMs: null };
    this.status = 'idle';
    this.itemIndex = 0;
    this.segmentEndsAtEpochMs = null;
    this.pausedRemainingMs = null;
    this.lastEmittedSecond = null;
    this.updatedAt = this.now();
  }

  setEmitter(emit) {
    if (typeof emit === 'function') this.emit = emit;
  }

  hasSchedule() {
    return Boolean(this.schedule && this.schedule.items.length > 0);
  }

  load(rawSchedule) {
    const clean = sanitizeSchedule(rawSchedule);
    if (clean.items.length === 0) throw new Error('Schedule needs at least one item');
    if (clean.items.length > MAX_SCHEDULE_ITEMS) throw new Error('Schedule has too many items');
    this.schedule = clean;
    this.plan = computePlan(clean, clean.plannedStartEpochMs ?? this.now());
    this.status = 'idle';
    this.itemIndex = 0;
    this.segmentEndsAtEpochMs = null;
    this.pausedRemainingMs = null;
    this.lastEmittedSecond = null;
    this.updatedAt = this.now();
    log.info(`Schedule loaded: "${clean.name}" (${clean.items.length} items)`);
    return this.getSnapshot();
  }

  replan(startEpochMs) {
    if (!this.hasSchedule()) return null;
    this.plan = computePlan(this.schedule, startEpochMs ?? this.now());
    this.updatedAt = this.now();
    return this.getSnapshot();
  }

  // Index of the first segment with a real duration at/after `from`.
  firstPlayableIndex(from = 0) {
    const idx = this.plan.segments.findIndex((s, i) => i >= from && segmentDurationMs(s) > 0);
    return idx === -1 ? this.plan.segments.length : idx;
  }

  start(atEpochMs) {
    if (!this.hasSchedule()) throw new Error('No schedule loaded');
    const now = Number(atEpochMs) || this.now();
    const idx = this.firstPlayableIndex(0);
    if (idx >= this.plan.segments.length) throw new Error('Schedule has no timed segments to run');
    this.status = 'running';
    this.itemIndex = idx;
    this.segmentEndsAtEpochMs = now + segmentDurationMs(this.plan.segments[idx]);
    this.pausedRemainingMs = null;
    this.lastEmittedSecond = null;
    this.updatedAt = now;
    log.info(`Schedule started: "${this.schedule.name}" at segment ${idx}`);
    return this.getSnapshot(now);
  }

  pause(atEpochMs) {
    if (this.status !== 'running') throw new Error('Schedule is not running');
    const now = Number(atEpochMs) || this.now();
    this.pausedRemainingMs = Math.max(0, (this.segmentEndsAtEpochMs ?? now) - now);
    this.status = 'paused';
    this.segmentEndsAtEpochMs = null;
    this.updatedAt = now;
    return this.getSnapshot(now);
  }

  resume(atEpochMs) {
    if (this.status !== 'paused') throw new Error('Schedule is not paused');
    const now = Number(atEpochMs) || this.now();
    this.status = 'running';
    this.segmentEndsAtEpochMs = now + Math.max(0, this.pausedRemainingMs ?? 0);
    this.pausedRemainingMs = null;
    this.lastEmittedSecond = null;
    this.updatedAt = now;
    return this.getSnapshot(now);
  }

  stop() {
    this.status = 'idle';
    this.itemIndex = 0;
    this.segmentEndsAtEpochMs = null;
    this.pausedRemainingMs = null;
    this.lastEmittedSecond = null;
    this.updatedAt = this.now();
    return this.getSnapshot();
  }

  next(atEpochMs) {
    if (!this.hasSchedule()) throw new Error('No schedule loaded');
    const now = Number(atEpochMs) || this.now();
    const idx = this.firstPlayableIndex(this.itemIndex + 1);
    if (idx >= this.plan.segments.length) {
      this.status = 'finished';
      this.itemIndex = this.plan.segments.length - 1;
      this.segmentEndsAtEpochMs = null;
      this.pausedRemainingMs = null;
    } else {
      this.itemIndex = idx;
      if (this.status === 'paused') {
        this.pausedRemainingMs = segmentDurationMs(this.plan.segments[idx]);
      } else {
        this.status = 'running';
        this.segmentEndsAtEpochMs = now + segmentDurationMs(this.plan.segments[idx]);
      }
    }
    this.updatedAt = now;
    return this.getSnapshot(now);
  }

  prev(atEpochMs) {
    if (!this.hasSchedule()) throw new Error('No schedule loaded');
    const now = Number(atEpochMs) || this.now();
    let idx = Math.max(0, this.itemIndex - 1);
    while (idx > 0 && segmentDurationMs(this.plan.segments[idx]) <= 0) idx -= 1;
    this.itemIndex = idx;
    if (this.status === 'paused') {
      this.pausedRemainingMs = segmentDurationMs(this.plan.segments[idx]);
    } else if (this.status === 'running') {
      this.segmentEndsAtEpochMs = now + segmentDurationMs(this.plan.segments[idx]);
    }
    this.updatedAt = now;
    return this.getSnapshot(now);
  }

  // Late-start fix: recompute the plan from the actual start. When the
  // clock is already running, rebase the live segment so the room sees
  // the corrected countdown immediately.
  reconcile({ actualStartEpochMs, strategy = 'compress' } = {}) {
    if (!this.hasSchedule()) throw new Error('No schedule loaded');
    const now = this.now();
    const planned = this.schedule.plannedStartEpochMs ?? this.plan.startEpochMs ?? now;
    const result = reconcileLateStart(this.schedule, planned, Number(actualStartEpochMs), strategy);
    const scaledMinutes = new Map(result.segments.map((s) => [s.id, s.adjustedMinutes]));
    this.schedule = sanitizeSchedule({
      ...this.schedule,
      plannedStartEpochMs: result.startEpochMs,
      items: this.schedule.items.map((item) => ({
        ...item,
        minutes: scaledMinutes.has(item.id) ? scaledMinutes.get(item.id) : item.minutes,
      })),
    });
    this.plan = { segments: result.segments, startEpochMs: result.startEpochMs, endEpochMs: result.endEpochMs };
    if (this.status === 'running') {
      const current = this.plan.segments[Math.min(this.itemIndex, this.plan.segments.length - 1)];
      this.segmentEndsAtEpochMs = now + segmentDurationMs(current);
    } else if (this.status === 'paused') {
      const current = this.plan.segments[Math.min(this.itemIndex, this.plan.segments.length - 1)];
      this.pausedRemainingMs = segmentDurationMs(current);
    }
    this.updatedAt = now;
    log.info(`Schedule reconciled (${result.strategy}, late ${Math.round(result.lateMs / 60000)}m)`);
    return { ...this.getSnapshot(now), reconciliation: { strategy: result.strategy, lateMs: result.lateMs, scale: result.scale, overrun: result.overrun } };
  }

  remainingMs(atEpochMs) {
    const now = Number(atEpochMs) || this.now();
    if (!this.hasSchedule()) return null;
    if (this.status === 'paused') return Math.max(0, this.pausedRemainingMs ?? 0);
    if (this.status !== 'running') return null;
    return Math.max(0, (this.segmentEndsAtEpochMs ?? now) - now);
  }

  // Returns { type: 'tick'|'transition', snapshot } when clients need an
  // update, otherwise null. Auto-advances through finished segments.
  tick(atEpochMs) {
    if (!this.hasSchedule() || this.status !== 'running') return null;
    const now = Number(atEpochMs) || this.now();
    let remaining = (this.segmentEndsAtEpochMs ?? now) - now;
    let advanced = false;
    let guard = this.plan.segments.length + 1;
    while (remaining <= 0 && guard-- > 0) {
      const nextIdx = this.firstPlayableIndex(this.itemIndex + 1);
      if (nextIdx >= this.plan.segments.length) {
        this.status = 'finished';
        this.itemIndex = this.plan.segments.length - 1;
        this.segmentEndsAtEpochMs = null;
        this.updatedAt = now;
        const snapshot = this.getSnapshot(now);
        this.emit('scheduleState', snapshot);
        return { type: 'transition', snapshot };
      }
      this.itemIndex = nextIdx;
      this.segmentEndsAtEpochMs = now + segmentDurationMs(this.plan.segments[nextIdx]);
      remaining = this.segmentEndsAtEpochMs - now;
      advanced = true;
    }
    const second = Math.ceil(Math.max(0, remaining) / 1000);
    if (!advanced && second === this.lastEmittedSecond) return null;
    this.lastEmittedSecond = second;
    this.updatedAt = now;
    const snapshot = this.getSnapshot(now);
    if (advanced) {
      this.emit('scheduleState', snapshot);
      return { type: 'transition', snapshot };
    }
    return { type: 'tick', snapshot };
  }

  getSnapshot(atEpochMs) {
    const now = Number(atEpochMs) || this.now();
    if (!this.hasSchedule()) {
      return { loaded: false, status: 'idle', itemIndex: 0, remainingMs: null, segments: [], schedule: null, startEpochMs: null, endEpochMs: null, updatedAt: now };
    }
    const current = this.plan.segments[Math.min(this.itemIndex, this.plan.segments.length - 1)] || null;
    const nextSeg = this.plan.segments.slice(this.itemIndex + 1).find((s) => segmentDurationMs(s) > 0) || null;
    return {
      loaded: true,
      status: this.status,
      itemIndex: this.itemIndex,
      remainingMs: this.remainingMs(now),
      currentSegmentId: current?.id || null,
      nextSegmentId: nextSeg?.id || null,
      segments: this.plan.segments,
      schedule: this.schedule,
      startEpochMs: this.plan.startEpochMs,
      endEpochMs: this.plan.endEpochMs,
      updatedAt: this.updatedAt,
    };
  }

  restoreSnapshot(snap) {
    if (!snap || typeof snap !== 'object' || snap.loaded !== true) return false;
    const schedule = sanitizeSchedule(snap.schedule || {});
    if (schedule.items.length === 0) return false;
    this.schedule = schedule;
    const start = Number(snap.startEpochMs) || schedule.plannedStartEpochMs || this.now();
    this.plan = computePlan(schedule, start);
    if (this.plan.endEpochMs !== Number(snap.endEpochMs) && Number.isFinite(Number(snap.endEpochMs))) {
      this.plan.endEpochMs = Number(snap.endEpochMs);
    }
    const idx = Number(snap.itemIndex);
    this.itemIndex = Number.isInteger(idx) ? Math.min(Math.max(0, idx), this.plan.segments.length - 1) : 0;
    // Never resume running silently after a restart: a live clock becomes
    // paused with its remaining time intact so the operator re-confirms.
    if (snap.status === 'running' || snap.status === 'paused') {
      this.status = 'paused';
      const remaining = Number(snap.remainingMs);
      this.pausedRemainingMs = Number.isFinite(remaining) ? Math.max(0, remaining) : segmentDurationMs(this.plan.segments[this.itemIndex]);
    } else if (snap.status === 'finished') {
      this.status = 'finished';
    } else {
      this.status = 'idle';
    }
    this.segmentEndsAtEpochMs = null;
    this.lastEmittedSecond = null;
    this.updatedAt = this.now();
    log.info(`Schedule restored from snapshot ("${schedule.name}", status=${this.status})`);
    return true;
  }
}

// Process-wide singleton: one authoritative clock per server.
export const scheduler = new TimerScheduler();

export function startScheduleTickLoop({ intervalMs = 1000 } = {}) {
  if (startScheduleTickLoop.active) return () => {};
  const timer = setInterval(() => {
    try {
      const result = scheduler.tick();
      if (result?.type === 'tick') scheduler.emit('scheduleTick', result.snapshot);
      // transitions already emitted as scheduleState inside tick()
    } catch (error) {
      log.warn('Schedule tick failed (non-critical):', error?.message || error);
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  startScheduleTickLoop.active = true;
  return () => {
    clearInterval(timer);
    startScheduleTickLoop.active = false;
  };
}
startScheduleTickLoop.active = false;
