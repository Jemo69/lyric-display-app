import React, { useMemo } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { formatChordLyricLine, transposeChord } from 'shared/chords.js';

const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const normalizeLabel = (label) => String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');

const formatTransposeLabel = (semitones) => {
  if (!semitones) return 'Concert pitch';
  return `${semitones > 0 ? '+' : ''}${semitones} st`;
};

/**
 * Mono chord-chart view for the stage (music-stand) display.
 * Additive-only: rendered only when the loaded song carries chord data;
 * lyric-only songs never reach this component so their stage view is untouched.
 */
const ChordChartView = ({
  chart,
  transpose = 0,
  onTransposeChange,
  baseFontSize = 40,
  color = '#FFFFFF',
  activeSectionLabel = '',
  songTitle = '',
}) => {
  const safeTranspose = Number.isFinite(Number(transpose)) ? Number(transpose) : 0;

  const sections = useMemo(() => chart?.sections || [], [chart]);
  const activeNormalized = normalizeLabel(activeSectionLabel);

  const originalKey = (chart?.key || '').trim().split(/\s+/)[0] || '';
  const soundingKey = originalKey ? transposeChord(originalKey, safeTranspose) : '';
  const keyBadge = originalKey
    ? (safeTranspose ? `Key ${originalKey} → ${soundingKey}` : `Key ${originalKey}`)
    : 'Key n/a';

  const handleStep = (delta) => {
    if (typeof onTransposeChange !== 'function') return;
    const next = Math.max(-11, Math.min(11, safeTranspose + delta));
    onTransposeChange(next);
  };

  if (!chart || sections.length === 0) return null;

  const controlClass =
    'rounded-md border border-current px-2 py-1 text-sm font-bold leading-none transition-opacity ' +
    'hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section
      aria-label={songTitle ? `Chord chart for ${songTitle}` : 'Chord chart'}
      className="w-full overflow-y-auto"
      style={{ fontFamily: MONO_STACK, color }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2" style={{ fontSize: `${Math.max(14, Math.round(baseFontSize * 0.42))}px` }}>
        <span
          aria-label={soundingKey && safeTranspose ? `Original key ${originalKey}, sounding key ${soundingKey}` : keyBadge}
          className="rounded-md border border-current px-2 py-1 font-bold tracking-wide"
        >
          {keyBadge}
        </span>
        {chart.capo ? (
          <span className="rounded-md border border-current px-2 py-1">Capo {chart.capo}</span>
        ) : null}
        <span className="px-1 opacity-80" aria-live="polite">
          {formatTransposeLabel(safeTranspose)}
        </span>
        <span className="inline-flex items-center gap-1" role="group" aria-label="Transpose chord chart">
          <button type="button" aria-label="Transpose down one semitone" onClick={() => handleStep(-1)} disabled={safeTranspose <= -11} className={controlClass}>
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Transpose up one semitone" onClick={() => handleStep(1)} disabled={safeTranspose >= 11} className={controlClass}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Reset transpose to concert pitch"
            onClick={() => typeof onTransposeChange === 'function' && onTransposeChange(0)}
            disabled={safeTranspose === 0}
            className={controlClass}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </div>

      {sections.map((section) => {
        const isActive = activeNormalized !== '' && normalizeLabel(section.label) === activeNormalized;
        return (
          <div key={section.id} className="mb-4" aria-current={isActive ? 'true' : undefined}>
            <h3
              className="mb-1 font-bold uppercase tracking-widest opacity-90"
              style={{ fontSize: `${Math.max(13, Math.round(baseFontSize * 0.38))}px` }}
            >
              {section.label}
              {isActive ? <span> — now playing</span> : null}
            </h3>
            <pre
              className="whitespace-pre-wrap leading-snug"
              style={{ fontSize: `${baseFontSize}px`, fontFamily: 'inherit', margin: 0 }}
            >
              {section.lines.map((line, lineIdx) => {
                if (line.comment) {
                  return (
                    <div key={lineIdx} className="italic opacity-70">
                      {line.comment}
                    </div>
                  );
                }
                if (!line.segments || line.segments.length === 0) {
                  return <div key={lineIdx} aria-hidden="true">{' '}</div>;
                }
                const { chords, lyrics } = formatChordLyricLine(line.segments, safeTranspose);
                return (
                  <div key={lineIdx}>
                    {chords ? <div className="font-bold">{chords}</div> : null}
                    <div>{lyrics}</div>
                  </div>
                );
              })}
            </pre>
          </div>
        );
      })}
    </section>
  );
};

export default ChordChartView;
