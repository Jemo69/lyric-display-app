import React from 'react';
import { preScheduleTime } from '../utils/metronome';

/**
 * Beat indicator, ported from FreeShow's `MetronomeVisualizer.svelte`.
 *
 * FreeShow stacks numbered beat bars above a ping-pong sweep bar. The operator
 * sidebar here is tall and narrow and vertical space is precious — the app also
 * has to show Bible verses on the outputs — so the sweep is folded into a
 * full-width hairline and the beat chips share the same row. Same signal, one
 * line of height instead of three.
 */
const MetronomeVisualizer = ({ beat = 0, beats = 4, tempo = 120, timeToNext = 0, darkMode = false }) => {
  const beatsPerSecond = 60 / (tempo || 120);

  // FreeShow: nextTime = timeToNext + beatsPerSecond - preScheduleTime
  const sweepSeconds = Math.max(0, timeToNext + beatsPerSecond - preScheduleTime);
  // Ping-pong: odd beats sweep left, even beats sweep right.
  const direction = beat % 2 === 1 ? -1 : 1;
  const running = beat > 0;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="metronome-visualizer">
      {/* Numbered beat chips — FreeShow's `.beats .bar`, laid out in a row. */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {Array.from({ length: beats }, (_, index) => {
          const isActive = beat === index + 1;
          return (
            <div
              key={index}
              data-testid={`metronome-beat-${index + 1}`}
              aria-hidden="true"
              className={[
                'flex h-5 min-w-0 flex-1 items-center justify-center rounded text-[10px] font-bold leading-none transition-colors duration-200',
                isActive
                  ? darkMode
                    ? 'bg-sky-500 text-white'
                    : 'bg-sky-600 text-white'
                  : darkMode
                    ? 'border border-gray-700 text-gray-500'
                    : 'border border-gray-300 text-gray-400',
              ].join(' ')}
            >
              {index + 1}
            </div>
          );
        })}
      </div>

      {/* Ping-pong sweep — FreeShow's `.overflow > .bar > .indicator > .dot`. */}
      <div
        className={`relative h-1.5 w-full overflow-hidden rounded-full ${
          darkMode ? 'bg-gray-800' : 'bg-gray-200'
        }`}
      >
        <div
          className="h-full w-full transition-transform ease-in-out"
          style={{
            transform: `translateX(${running ? direction * 50 : 0}%)`,
            transitionDuration: `${sweepSeconds}s`,
          }}
        >
          <div
            data-testid="metronome-sweep-dot"
            className={[
              'absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200',
              beat === 1
                ? darkMode
                  ? 'h-3 w-3 bg-amber-400'
                  : 'h-3 w-3 bg-amber-500'
                : darkMode
                  ? 'bg-gray-300'
                  : 'bg-gray-500',
            ].join(' ')}
          />
        </div>
      </div>
    </div>
  );
};

export default MetronomeVisualizer;
