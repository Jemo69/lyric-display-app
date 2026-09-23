import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Ruler } from 'lucide-react';
import {
  DEFAULT_PROJECTION_BUDGET,
  computeLineBudgets,
  summarizeBudgets,
} from '@/utils/projectionBudget';

const MAX_LISTED_LINES = 8;

const CanvasMeasurementLayer = ({
  lines = [],
  budget = DEFAULT_PROJECTION_BUDGET,
  darkMode = true,
}) => {
  const statuses = useMemo(() => computeLineBudgets(lines, budget), [lines, budget]);
  const summary = useMemo(() => summarizeBudgets(statuses), [statuses]);

  const listedOver = useMemo(
    () => statuses.filter((status) => status.over).slice(0, MAX_LISTED_LINES),
    [statuses]
  );
  const hiddenOverCount = summary.overCount - listedOver.length;

  const hasWarning = summary.overCount > 0;

  return (
    <div
      data-testid="canvas-measurement-layer"
      role="status"
      aria-live="polite"
      aria-label={
        hasWarning
          ? `${summary.overCount} lines exceed the 16:9 projection budget of ${summary.overCount === 1 ? 'line' : 'lines'}`
          : 'All lines fit the 16:9 projection budget'
      }
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-xs ${
        hasWarning
          ? darkMode
            ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
            : 'border-amber-400 bg-amber-50 text-amber-900'
          : darkMode
            ? 'border-gray-700 bg-gray-800/60 text-gray-300'
            : 'border-gray-200 bg-gray-50 text-gray-600'
      }`}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        {hasWarning ? (
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        )}
        {hasWarning
          ? `${summary.overCount} ${summary.overCount === 1 ? 'line exceeds' : 'lines exceed'} projection budget`
          : 'All lines fit projection'}
      </span>
      <span
        className={`inline-flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
      >
        <Ruler className="w-3.5 h-3.5" aria-hidden="true" />
        16:9 budget · {budget} chars
      </span>
      {hasWarning && (
        <span className="inline-flex flex-wrap items-center gap-1 font-mono">
          {listedOver.map((status) => (
            <span
              key={status.index}
              data-testid={`canvas-overlong-line-${status.lineNumber}`}
              className={`rounded px-1.5 py-0.5 ${
                darkMode ? 'bg-amber-900/60 text-amber-100' : 'bg-amber-100 text-amber-900'
              }`}
            >
              L{status.lineNumber}: {status.length}/{status.budget}
            </span>
          ))}
          {hiddenOverCount > 0 && <span>+{hiddenOverCount} more</span>}
        </span>
      )}
    </div>
  );
};

export default CanvasMeasurementLayer;
