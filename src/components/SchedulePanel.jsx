// src/components/SchedulePanel.jsx
// Missing feature #01 — control-surface home for the service run-sheet.
//
// Rendered inside the control panel only when the (default-OFF)
// "Service Scheduler" preference is enabled. Owns no clock: it forwards
// operator intent over the control socket and mirrors the authoritative
// server snapshot delivered as `schedule-state` / `schedule-tick`
// window events (see useSocketEvents).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarClock, Play, Pause, Square, SkipForward, SkipBack,
  Pencil, AlarmClock, X, Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSchedulerEnabled } from '../hooks/useStoreSelectors';
import { useControlSocket } from '../context/ControlSocketProvider';
import useToast from '@/hooks/useToast';
import ScheduleCreatorWizard from './ScheduleCreatorWizard';
import ScheduleStartReconciliationWizard from './ScheduleStartReconciliationWizard';
import { makeScheduleItem, sanitizeSchedule, formatCountdown } from '../../shared/scheduleMath.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SchedulePanel');

const defaultDraft = () =>
  sanitizeSchedule({
    name: 'Sunday Service',
    plannedStartEpochMs: null,
    items: [
      { ...makeScheduleItem('Prelude', 10, true) },
      { ...makeScheduleItem('Praise', 20, true) },
      { ...makeScheduleItem('Sermon', 30, true) },
    ],
  });

const STATUS_META = {
  running: { label: 'RUNNING', glyph: '●' },
  paused: { label: 'PAUSED', glyph: '❚❚' },
  idle: { label: 'IDLE', glyph: '○' },
  finished: { label: 'FINISHED', glyph: '■' },
};

function liveRemaining(snapshot) {
  if (!snapshot?.loaded) return null;
  if (snapshot.status === 'paused') return Math.max(0, snapshot.remainingMs ?? 0);
  if (snapshot.status !== 'running') return null;
  const base = snapshot.remainingMs ?? 0;
  const age = Date.now() - (snapshot.updatedAt ?? Date.now());
  return Math.max(0, base - age);
}

export default function SchedulePanel({ darkMode = true }) {
  const { enabled } = useSchedulerEnabled();
  const control = useControlSocket();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null); // null | 'creator' | 'reconcile'
  const [draft, setDraft] = useState(defaultDraft);
  const [snapshot, setSnapshot] = useState(null);
  const [, setNowTick] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const onState = (e) => setSnapshot(e.detail || null);
    const onError = (e) => {
      showToast({ title: 'Schedule action failed', message: String(e.detail?.message || 'The clock did not accept that action.'), variant: 'error' });
    };
    const onFile = (e) => {
      const parsed = e.detail?.parsed;
      if (parsed?.schedule) {
        setDraft(parsed.schedule);
        setView('creator');
        if (!openRef.current) setOpen(true);
      }
    };
    window.addEventListener('schedule-state', onState);
    window.addEventListener('schedule-tick', onState);
    window.addEventListener('schedule-error', onError);
    window.addEventListener('schedule-file-load', onFile);
    try {
      control.emitRequestSchedule?.();
    } catch { }
    return () => {
      window.removeEventListener('schedule-state', onState);
      window.removeEventListener('schedule-tick', onState);
      window.removeEventListener('schedule-error', onError);
      window.removeEventListener('schedule-file-load', onFile);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local countdown refresh (server stays authoritative; this only repaints).
  useEffect(() => {
    if (!open || snapshot?.status !== 'running') return;
    const id = setInterval(() => setNowTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [open, snapshot?.status]);

  const send = useCallback((action, payload) => {
    try {
      control.emitScheduleControl?.(action, payload);
    } catch (e) {
      log.warn('Schedule control emit failed', { action });
    }
  }, [control]);

  if (!enabled) return null;

  const handleSendToClock = (schedule) => {
    setDraft(schedule);
    try {
      control.emitScheduleLoad?.(schedule);
      showToast({ title: 'Run-sheet sent', message: `"${schedule.name}" is on the stage clock.`, variant: 'success' });
    } catch {
      showToast({ title: 'Send failed', message: 'Not connected to the stage clock.', variant: 'error' });
    }
    setView(null);
  };

  const handleReconcile = ({ strategy, actualStartEpochMs }) => {
    send('reconcile', { strategy, actualStartEpochMs });
    showToast({
      title: strategy === 'compress' ? 'Squeezing segments' : 'Shifting plan later',
      message: 'The stage clock now follows the corrected plan.',
      variant: 'success',
    });
    setView(null);
  };

  const status = snapshot?.loaded ? snapshot.status : 'idle';
  const meta = STATUS_META[status] || STATUS_META.idle;
  const current = snapshot?.loaded ? snapshot.segments[Math.min(snapshot.itemIndex, snapshot.segments.length - 1)] : null;
  const remaining = liveRemaining(snapshot);
  const card = darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close service schedule panel' : 'Open service schedule panel'}
        title="Service schedule (beta)"
        className={`fixed bottom-5 right-5 z-[1400] inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          darkMode ? 'bg-gray-950 border-gray-700 text-white hover:bg-gray-800' : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
        }`}
      >
        <CalendarClock className="w-4 h-4" aria-hidden />
        Schedule
        {snapshot?.loaded ? (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>
            {meta.glyph} {meta.label}
          </span>
        ) : (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>○ Beta</span>
        )}
      </button>

      {open ? (
        <section aria-label="Service schedule panel" className={`fixed bottom-20 right-5 z-[1400] w-[330px] max-w-[calc(100vw-2.5rem)] rounded-2xl border shadow-2xl p-4 ${card}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">Service run-sheet</h2>
              <p className={`text-[11px] mt-0.5 ${muted}`}>
                {snapshot?.loaded ? `"${snapshot.schedule?.name}"` : 'No run-sheet on the clock yet.'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close service schedule panel" className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2" aria-live="polite">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest ${muted}`}>
              <Radio className="w-3.5 h-3.5" aria-hidden />
              {snapshot?.loaded ? `${meta.glyph} ${meta.label}` : '○ NO RUN-SHEET'}
            </span>
            {remaining != null && current ? (
              <span className="font-mono text-xl font-bold tabular-nums" aria-label={`Time left in ${current.name}: ${formatCountdown(remaining)}`}>
                {formatCountdown(remaining)}
              </span>
            ) : null}
          </div>
          {current && snapshot?.loaded ? (
            <p className={`mt-1 text-xs truncate ${muted}`}>
              Now: <span className="font-semibold text-inherit">{current.name || 'Untitled'}</span>
              {current.timed === false ? ' (flex — clock holds)' : ''}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Clock transport">
            {status === 'running' ? (
              <Button variant="outline" size="sm" onClick={() => send('pause')} aria-label="Pause clock"><Pause className="w-4 h-4" /></Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => send(snapshot?.status === 'paused' ? 'resume' : 'start')}
                disabled={!snapshot?.loaded}
                aria-label={snapshot?.status === 'paused' ? 'Resume clock' : 'Start clock'}
                title={!snapshot?.loaded ? 'Send a run-sheet to the clock first' : undefined}
              >
                <Play className="w-4 h-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => send('stop')} disabled={!snapshot?.loaded} aria-label="Stop clock"><Square className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => send('prev')} disabled={!snapshot?.loaded} aria-label="Previous segment"><SkipBack className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => send('next')} disabled={!snapshot?.loaded} aria-label="Next segment"><SkipForward className="w-4 h-4" /></Button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setView('creator')}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Run-sheet
            </Button>
            <Button variant="outline" size="sm" onClick={() => setView('reconcile')} disabled={!snapshot?.loaded} title={!snapshot?.loaded ? 'Send a run-sheet to the clock first' : undefined}>
              <AlarmClock className="w-3.5 h-3.5 mr-1.5" /> Late start
            </Button>
          </div>
          <p className={`mt-2.5 text-[11px] leading-relaxed ${muted}`}>
            Stage monitors: open <span className="font-mono font-semibold">/time</span> on the projector PC for the countdown.
          </p>
        </section>
      ) : null}

      {view === 'creator' ? (
        <ScheduleCreatorWizard
          initialSchedule={snapshot?.loaded ? snapshot.schedule : draft}
          darkMode={darkMode}
          onSendToClock={handleSendToClock}
          onClose={() => setView(null)}
        />
      ) : null}
      {view === 'reconcile' && snapshot?.loaded ? (
        <ScheduleStartReconciliationWizard
          schedule={snapshot.schedule}
          plannedStartEpochMs={snapshot.startEpochMs}
          darkMode={darkMode}
          onApply={handleReconcile}
          onClose={() => setView(null)}
        />
      ) : null}
    </>
  );
}
