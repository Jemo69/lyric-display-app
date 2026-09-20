// src/components/ScheduleCreatorWizard.jsx
// Missing feature #01 — timed service run-sheet builder.
//
// Volunteer-safe: every item has a plain name + minutes, an explicit
// "Timed / Flex" label (never color-alone), totals in words, and
// save/load of .ldsch run-sheet files. Rendered as a dialog overlay by
// SchedulePanel; all clock control stays server-side via onSendToClock.

import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Download, Upload, Send, X, Timer, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  makeScheduleItem,
  sanitizeSchedule,
  scheduleTotals,
  computePlan,
  formatClockTime,
  serializeSchedule,
  parseScheduleDocument,
  SCHEDULE_FILE_EXT,
} from '../../shared/scheduleMath.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ScheduleCreator');

const toDatetimeLocal = (epochMs) => {
  if (!Number.isFinite(Number(epochMs)) || Number(epochMs) <= 0) return '';
  const d = new Date(Number(epochMs));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ScheduleCreatorWizard({
  initialSchedule,
  darkMode = true,
  onSendToClock,
  onClose,
}) {
  const base = useMemo(() => sanitizeSchedule(initialSchedule), [initialSchedule]);
  const [name, setName] = useState(base.name);
  const [items, setItems] = useState(base.items.length > 0 ? base.items : [makeScheduleItem('Prelude', 10, true)]);
  const [plannedStart, setPlannedStart] = useState(() => toDatetimeLocal(base.plannedStartEpochMs ?? Date.now()));
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const totals = scheduleTotals({ items });
  const plannedEpoch = plannedStart ? new Date(plannedStart).getTime() : null;
  const preview = useMemo(() => {
    try {
      return computePlan({ name, items }, Number.isFinite(plannedEpoch) ? plannedEpoch : Date.now());
    } catch {
      return { segments: [], endEpochMs: null };
    }
  }, [name, items, plannedEpoch]);

  const updateItem = (id, patch) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setError('');
  };

  const removeItem = (id) => {
    setItems((list) => (list.length <= 1 ? list : list.filter((item) => item.id !== id)));
  };

  const addItem = () => {
    setItems((list) => [...list, makeScheduleItem(`Segment ${list.length + 1}`, 5, true)]);
  };

  const buildSchedule = () =>
    sanitizeSchedule({
      name: name.trim() || 'Sunday Service',
      plannedStartEpochMs: Number.isFinite(plannedEpoch) ? plannedEpoch : null,
      items,
    });

  const handleSaveFile = () => {
    try {
      const blob = new Blob([serializeSchedule(buildSchedule())], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (name.trim() || 'service').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
      a.href = url;
      a.download = `${safe}${SCHEDULE_FILE_EXT}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      log.info('Run-sheet saved to file');
    } catch (e) {
      setError('Could not save the run-sheet file. Please try again.');
    }
  };

  const handleLoadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseScheduleDocument(text);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setName(parsed.schedule.name);
      setItems(parsed.schedule.items);
      setPlannedStart(toDatetimeLocal(parsed.schedule.plannedStartEpochMs ?? Date.now()));
      setError('');
      log.info('Run-sheet loaded from file', { items: parsed.schedule.items.length });
    } catch {
      setError('Could not read that file. Please choose a .ldsch run-sheet.');
    }
  };

  const handleSend = () => {
    if (items.length === 0) {
      setError('Add at least one segment before sending the run-sheet to the clock.');
      return;
    }
    onSendToClock?.(buildSchedule());
  };

  const card = darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-600';
  const row = darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50';

  return (
    <div role="dialog" aria-modal="true" aria-label="Service run-sheet builder" className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-black/60">
      <div className={`w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border shadow-2xl p-5 sm:p-6 ${card}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Service run-sheet</h2>
            <p className={`text-xs mt-1 ${muted}`}>Timed plan for the service: Prelude → Praise → Sermon → Benediction. Flex items never move the clock.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close run-sheet builder">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <label className="block">
            <span className={`text-xs font-semibold ${muted}`}>Service name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Service" aria-label="Service name" className="mt-1" />
          </label>
          <label className="block">
            <span className={`text-xs font-semibold ${muted}`}>Planned start</span>
            <Input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} aria-label="Planned start time" className="mt-1" />
          </label>
        </div>

        <div className="mt-4 space-y-2" role="list" aria-label="Run-sheet segments">
          {items.map((item, idx) => (
            <div key={item.id} role="listitem" className={`flex items-center gap-2 rounded-xl border p-2.5 ${row}`}>
              <span className={`text-xs font-bold w-6 text-center shrink-0 ${muted}`}>{idx + 1}</span>
              <Input
                value={item.name}
                onChange={(e) => updateItem(item.id, { name: e.target.value.slice(0, 120) })}
                placeholder="Segment name (e.g. Praise)"
                aria-label={`Segment ${idx + 1} name`}
                className="flex-1 min-w-0"
              />
              <Input
                type="number"
                min="0"
                max="1440"
                step="0.5"
                value={item.timed === false ? '' : item.minutes}
                disabled={item.timed === false}
                onChange={(e) => updateItem(item.id, { minutes: e.target.value })}
                placeholder="min"
                aria-label={`Segment ${idx + 1} minutes`}
                className="w-20 shrink-0"
              />
              <button
                type="button"
                onClick={() => updateItem(item.id, { timed: item.timed === false })}
                aria-pressed={item.timed !== false}
                aria-label={`Segment ${idx + 1} is ${item.timed === false ? 'flex (untimed)' : 'timed'}. Activate to switch.`}
                title={item.timed === false ? 'Flex: does not move the clock' : 'Timed: counts down on the stage clock'}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  item.timed === false
                    ? darkMode ? 'border-gray-700 text-gray-300 bg-gray-900' : 'border-gray-300 text-gray-600 bg-gray-100'
                    : darkMode ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-emerald-300 text-emerald-800 bg-emerald-50'
                }`}
              >
                {item.timed === false ? <Pause className="w-3.5 h-3.5" aria-hidden /> : <Timer className="w-3.5 h-3.5" aria-hidden />}
                {item.timed === false ? 'FLEX' : 'TIMED'}
              </button>
              <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} disabled={items.length <= 1} aria-label={`Remove segment ${idx + 1}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addItem} className="mt-3">
          <Plus className="w-4 h-4 mr-1.5" /> Add segment
        </Button>

        <div className={`mt-4 rounded-xl border p-3 text-sm ${row}`}>
          <span className="font-semibold">{totals.itemCount} segments</span>
          <span className={muted}> · {totals.timedMinutes} timed minutes{totals.untimedCount > 0 ? ` · ${totals.untimedCount} flex` : ''}</span>
          {preview.endEpochMs ? (
            <span className={muted}> · ends {formatClockTime(preview.endEpochMs)}</span>
          ) : null}
          <div className="mt-1">
            <span className={`text-xs ${muted}`}>
              {items.length >= 3 ? '✓ Ready: at least 3 segments planned' : '○ Draft: add at least 3 segments for a full run-sheet'}
            </span>
          </div>
        </div>

        {error ? (
          <p role="alert" className={`mt-3 text-sm font-medium ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
        ) : null}

        <input ref={fileRef} type="file" accept=".ldsch,application/json" onChange={handleLoadFile} className="hidden" aria-hidden tabIndex={-1} />

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" /> Load .ldsch
          </Button>
          <Button variant="outline" onClick={handleSaveFile}>
            <Download className="w-4 h-4 mr-1.5" /> Save .ldsch
          </Button>
          <Button onClick={handleSend}>
            <Send className="w-4 h-4 mr-1.5" /> Send to stage clock
          </Button>
        </div>
      </div>
    </div>
  );
}
