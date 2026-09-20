// src/components/ScheduleStartReconciliationWizard.jsx
// Missing feature #01 — late-start fix.
//
// Compares the actual start against the planned start and offers the two
// Sunday-safe fixes: squeeze the remaining segments so the service still
// ends on time (compress), or keep every length and end later (shift).
// The preview shows adjusted minutes + new end time before anything is
// applied; onApply only forwards the operator's choice to the server.

import React, { useMemo, useState } from 'react';
import { X, AlarmClock, Shrink, MoveRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  sanitizeSchedule,
  reconcileLateStart,
  formatClockTime,
  formatLateDuration,
} from '../../shared/scheduleMath.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ScheduleReconcile');

const toDatetimeLocal = (epochMs) => {
  const d = new Date(Number(epochMs) || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ScheduleStartReconciliationWizard({
  schedule,
  plannedStartEpochMs,
  darkMode = true,
  onApply,
  onClose,
}) {
  const clean = useMemo(() => sanitizeSchedule(schedule), [schedule]);
  const planned = Number(plannedStartEpochMs) || clean.plannedStartEpochMs || Date.now();
  const [actualStart, setActualStart] = useState(() => toDatetimeLocal(Date.now()));
  const [strategy, setStrategy] = useState('compress');

  const actualEpoch = actualStart ? new Date(actualStart).getTime() : NaN;
  const preview = useMemo(() => {
    if (!Number.isFinite(actualEpoch)) return null;
    try {
      return reconcileLateStart(clean, planned, actualEpoch, strategy);
    } catch {
      return null;
    }
  }, [clean, planned, actualEpoch, strategy]);

  const handleApply = () => {
    if (!Number.isFinite(actualEpoch)) return;
    log.info('Late-start fix applied', { strategy });
    onApply?.({ strategy, actualStartEpochMs: actualEpoch });
  };

  const card = darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-600';
  const row = darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50';
  const selected = darkMode ? 'border-blue-500 bg-blue-500/10' : 'border-blue-500 bg-blue-50';

  const optionClass = (value) =>
    `w-full text-left rounded-xl border p-3 flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${strategy === value ? selected : row}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Late start fix" className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-black/60">
      <div className={`w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl border shadow-2xl p-5 sm:p-6 ${card}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <AlarmClock className="w-5 h-5" aria-hidden /> Late start fix
            </h2>
            <p className={`text-xs mt-1 ${muted}`}>
              Planned start <span className="font-semibold">{formatClockTime(planned)}</span>
              {preview ? (
                <> · actual <span className="font-semibold">{formatClockTime(actualEpoch)}</span> · <span className="font-semibold">{formatLateDuration(preview.lateMs)}</span></>
              ) : null}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close late start fix">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <label className="block mt-4">
          <span className={`text-xs font-semibold ${muted}`}>Actual start time</span>
          <Input type="datetime-local" value={actualStart} onChange={(e) => setActualStart(e.target.value)} aria-label="Actual start time" className="mt-1" />
        </label>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Late start fix strategy">
          <button type="button" role="radio" aria-checked={strategy === 'compress'} onClick={() => setStrategy('compress')} className={optionClass('compress')}>
            <Shrink className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
            <span>
              <span className="block text-sm font-bold">Squeeze segments · end on time {strategy === 'compress' ? '● SELECTED' : '○'}</span>
              <span className={`block text-xs mt-0.5 ${muted}`}>Shorten each timed segment proportionally. Kids church and the second service stay on schedule.</span>
            </span>
          </button>
          <button type="button" role="radio" aria-checked={strategy === 'shift'} onClick={() => setStrategy('shift')} className={optionClass('shift')}>
            <MoveRight className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
            <span>
              <span className="block text-sm font-bold">Keep lengths · end later {strategy === 'shift' ? '● SELECTED' : '○'}</span>
              <span className={`block text-xs mt-0.5 ${muted}`}>Nothing gets shorter. The whole plan moves, so the service ends later.</span>
            </span>
          </button>
        </div>

        {preview ? (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${row}`} aria-live="polite">
            {preview.adjusted === false ? (
              <p>Service started on time — nothing to fix. The plan is unchanged.</p>
            ) : (
              <>
                <p className="font-semibold">
                  {preview.strategy === 'compress' ? 'Squeezed plan' : 'Shifted plan'} · new end {formatClockTime(preview.endEpochMs)}
                  {preview.overrun ? ' · ⚠ delay used up the whole plan' : ''}
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {preview.segments.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span className="truncate">{s.name || 'Untitled'}{s.timed === false ? ' (flex)' : ''}</span>
                      <span className={`font-mono shrink-0 ${muted}`}>
                        {s.timed === false ? '—' : `${s.adjustedMinutes} min · ${formatClockTime(s.startEpochMs)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <p role="alert" className={`mt-3 text-sm font-medium ${darkMode ? 'text-red-300' : 'text-red-700'}`}>Enter a valid actual start time to preview the fix.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={!preview}>
            Apply {strategy === 'compress' ? 'squeeze' : 'shift'}
          </Button>
        </div>
      </div>
    </div>
  );
}
