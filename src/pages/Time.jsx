// src/pages/Time.jsx
// Missing feature #01 — countdown clock for stage monitors.
//
// Open /time on the projector/stage PC: it mirrors the authoritative
// server run-sheet clock (countdown + auto-advance happen in
// server/realtime/timerScheduler.js). This page never controls the
// clock — it only renders `schedule-state` / `schedule-tick` snapshots.
// Status is always glyph + words (never color alone); the warning pulse
// is disabled under prefers-reduced-motion.

import React, { useEffect, useState } from 'react';
import useSocket from '../hooks/useSocket';
import { formatCountdown, formatClockTime } from '../../shared/scheduleMath.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Time');

const STATUS_META = {
  running: { label: 'RUNNING', glyph: '●', tone: 'text-emerald-300' },
  paused: { label: 'PAUSED', glyph: '❚❚', tone: 'text-amber-300' },
  idle: { label: 'IDLE', glyph: '○', tone: 'text-neutral-400' },
  finished: { label: 'FINISHED', glyph: '■', tone: 'text-sky-300' },
};

function liveRemaining(snapshot) {
  if (!snapshot?.loaded) return null;
  if (snapshot.status === 'paused') return Math.max(0, snapshot.remainingMs ?? 0);
  if (snapshot.status !== 'running') return null;
  const base = snapshot.remainingMs ?? 0;
  const age = Date.now() - (snapshot.updatedAt ?? Date.now());
  return Math.max(0, base - age);
}

export default function Time() {
  logger.info('Time mounted');
  const { socket, isConnected, connectionStatus } = useSocket('time', 'stage');
  const [snapshot, setSnapshot] = useState(null);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const onSnapshot = (e) => {
      if (e?.detail && typeof e.detail === 'object') setSnapshot(e.detail);
    };
    window.addEventListener('schedule-state', onSnapshot);
    window.addEventListener('schedule-tick', onSnapshot);
    return () => {
      window.removeEventListener('schedule-state', onSnapshot);
      window.removeEventListener('schedule-tick', onSnapshot);
    };
  }, []);

  useEffect(() => {
    if (!socket?.connected) return;
    try {
      socket.emit('requestSchedule');
    } catch { }
  }, [socket, isConnected]);

  useEffect(() => {
    if (snapshot?.status !== 'running') return;
    const id = setInterval(() => setNowTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [snapshot?.status]);

  const loaded = Boolean(snapshot?.loaded);
  const status = loaded ? snapshot.status : 'idle';
  const meta = STATUS_META[status] || STATUS_META.idle;
  const segments = loaded ? snapshot.segments : [];
  const current = loaded ? segments[Math.min(snapshot.itemIndex, segments.length - 1)] : null;
  const upcoming = loaded
    ? segments.slice(snapshot.itemIndex + 1).filter((s) => (s.endEpochMs - s.startEpochMs) > 0).slice(0, 3)
    : [];
  const remaining = liveRemaining(snapshot);
  const totalMs = current ? Math.max(1, current.endEpochMs - current.startEpochMs) : 1;
  const progress = remaining == null ? 0 : Math.min(1, Math.max(0, 1 - remaining / totalMs));
  const warning = status === 'running' && remaining != null && remaining < 60000;

  return (
    <div className="min-h-screen w-screen bg-black text-white flex flex-col items-center justify-center px-6 py-10 select-none">
      <style>{`@media (prefers-reduced-motion: reduce) { .time-pulse { animation: none !important; } }`}</style>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-neutral-500">
        LyricDisplay · Stage clock
      </p>

      <p className={`mt-4 text-sm font-bold uppercase tracking-[0.2em] ${meta.tone}`} aria-live="polite">
        {meta.glyph} {meta.label}
        {connectionStatus !== 'connected' ? ' · ○ RECONNECTING' : ''}
      </p>

      {!loaded ? (
        <div className="mt-8 text-center">
          <p className="text-3xl font-bold">○ No run-sheet</p>
          <p className="mt-2 text-sm text-neutral-400">The operator has not sent a service run-sheet to the clock yet.</p>
        </div>
      ) : status === 'finished' ? (
        <div className="mt-8 text-center">
          <p className="text-3xl font-bold">■ Service complete</p>
          <p className="mt-2 text-sm text-neutral-400">{snapshot.schedule?.name || 'Run-sheet'} · ended {formatClockTime(snapshot.endEpochMs)}</p>
        </div>
      ) : (
        <>
          <h1 className="mt-6 text-center text-2xl sm:text-4xl font-bold leading-tight max-w-4xl">
            {current?.name || 'Untitled segment'}
            {current?.timed === false ? <span className="block mt-1 text-base font-semibold text-neutral-400">Flex — clock holds</span> : null}
          </h1>
          <p
            className={`mt-4 font-mono font-bold tabular-nums leading-none text-[26vw] sm:text-[10rem] ${warning ? 'text-red-400 time-pulse' : ''}`}
            style={warning ? { animation: 'pulse 1s infinite' } : undefined}
            aria-label={remaining == null ? 'Clock not running' : `Time left: ${formatCountdown(remaining)}`}
            aria-live="off"
          >
            {remaining == null ? '--:--' : formatCountdown(remaining)}
          </p>
          <div
            className="mt-6 h-2.5 w-full max-w-xl overflow-hidden rounded-full bg-neutral-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={`Segment progress: ${Math.round(progress * 100)} percent elapsed`}
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-3 text-sm text-neutral-400">
            Ends {formatClockTime(current?.endEpochMs)} · plan ends {formatClockTime(snapshot.endEpochMs)}
          </p>
          {upcoming.length > 0 ? (
            <ol className="mt-8 w-full max-w-xl space-y-1.5" aria-label="Up next">
              {upcoming.map((seg, i) => (
                <li key={seg.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-neutral-400">
                    {i === 0 ? 'Next: ' : `Then: `}
                    <span className="font-semibold text-neutral-100">{seg.name || 'Untitled'}</span>
                  </span>
                  <span className="font-mono text-neutral-500">{formatClockTime(seg.startEpochMs)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </div>
  );
}
