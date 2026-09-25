import React, { useMemo } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { formatChordLyricLine, isChordChart, transposeChord } from 'shared/chords.js';

const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const normalizeLyricLine = (value) => String(value ?? '')
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((line) => line.trim().replace(/\s+/g, ' '))
  .filter(Boolean)
  .join('\n')
  .toLowerCase();

const getOutputLineTexts = (line) => {
  if (typeof line === 'string') return [line];
  if (line?.type === 'normal-group') return [line.line1, line.line2];
  if (line?.type === 'group') return [line.mainLine];
  if (typeof line?.displayText === 'string') return [line.displayText];
  return [];
};

const getChartLineText = (line) => {
  if (!Array.isArray(line?.segments)) return '';
  return line.segments.map((segment) => segment?.text ?? '').join('');
};

const getSelectedOccurrence = (targetText, lyrics, activeLineIndex) => {
  const normalizedTarget = normalizeLyricLine(targetText);
  if (!normalizedTarget) return 0;
  if (!Array.isArray(lyrics) || !Number.isInteger(activeLineIndex)) return 0;

  let occurrence = 0;
  const safeIndex = Math.max(0, Math.min(activeLineIndex, lyrics.length - 1));

  for (let index = 0; index < safeIndex; index += 1) {
    const texts = getOutputLineTexts(lyrics[index]);
    occurrence += texts.filter((text) => normalizeLyricLine(text) === normalizedTarget).length;
  }

  const selectedTexts = getOutputLineTexts(lyrics[safeIndex]);
  const selectedMatch = selectedTexts.findIndex((text) => normalizeLyricLine(text) === normalizedTarget);
  if (selectedMatch > 0) {
    occurrence += selectedTexts
      .slice(0, selectedMatch)
      .filter((text) => normalizeLyricLine(text) === normalizedTarget).length;
  }

  return occurrence;
};

const formatTransposeLabel = (semitones) => {
  if (!semitones) return 'Concert pitch';
  return `${semitones > 0 ? '+' : ''}${semitones} st`;
};

/**
 * Current-line-only mono chord view for the stage (music-stand) display.
 * Additive-only: rendered only when the loaded song carries chord data;
 * lyric-only songs never reach this component so their stage view is untouched.
 */
const ChordChartView = ({
  chart,
  activeLine = null,
  activeLineIndex = null,
  lyrics = [],
  transpose = 0,
  onTransposeChange,
  notation = 'letters',
  baseFontSize = 40,
  color = '#FFFFFF',
  activeSectionLabel = '',
  songTitle = '',
}) => {
  const safeTranspose = Number.isFinite(Number(transpose)) ? Number(transpose) : 0;
  const useNumbers = notation === 'numbers';
  const validChart = useMemo(() => (isChordChart(chart) ? chart : null), [chart]);
  const sections = validChart?.sections || [];

  const activeTextLines = useMemo(
    () => getOutputLineTexts(activeLine).filter((text) => normalizeLyricLine(text)),
    [activeLine],
  );

  const activeChartLines = useMemo(() => {
    if (!validChart || activeTextLines.length === 0) return [];

    const entries = validChart.sections.flatMap((section) => (
      section.lines
        .map((line, lineIndex) => ({ section, line, lineIndex, text: getChartLineText(line) }))
        .filter((entry) => normalizeLyricLine(entry.text))
    ));

    return activeTextLines.map((targetText, targetIndex) => {
      const normalizedTarget = normalizeLyricLine(targetText);
      const matches = entries.filter((entry) => normalizeLyricLine(entry.text) === normalizedTarget);
      if (matches.length === 0) {
        return {
          key: `fallback-${targetIndex}`,
          section: null,
          line: { segments: [{ chord: null, text: targetText }] },
        };
      }

      const occurrence = getSelectedOccurrence(targetText, lyrics, activeLineIndex);
      const match = matches[Math.min(occurrence, matches.length - 1)];
      return {
        key: `${match.section.id}-${match.lineIndex}`,
        section: match.section,
        line: match.line,
      };
    });
  }, [activeLineIndex, activeTextLines, lyrics, validChart]);

  const originalKey = (validChart?.key || '').trim().split(/\s+/)[0] || '';
  const soundingKey = originalKey ? transposeChord(originalKey, safeTranspose) : '';
  const keyBadge = safeTranspose ? `Key ${originalKey} → ${soundingKey}` : `Key ${originalKey}`;
  // A number chart is unreadable without its reference, so number mode states
  // the tonic explicitly instead of leaving the operator to infer it.
  const useNumberLegend = useNumbers && originalKey;

  const handleStep = (delta) => {
    if (typeof onTransposeChange !== 'function') return;
    const next = Math.max(-11, Math.min(11, safeTranspose + delta));
    onTransposeChange(next);
  };

  if (!validChart || sections.length === 0 || activeTextLines.length === 0) return null;

  const controlClass =
    'rounded-md border border-current px-2 py-1 text-sm font-bold leading-none transition-opacity ' +
    'hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

  const displayedSection = activeChartLines.find((entry) => entry.section)?.section || null;

  return (
    <section
      aria-label={songTitle ? `Current chord line for ${songTitle}` : 'Current chord line'}
      className="flex w-full flex-col items-center justify-center"
      data-active-line-index={Number.isInteger(activeLineIndex) ? activeLineIndex : undefined}
      style={{ fontFamily: MONO_STACK, color }}
    >
      <div
        className="mb-6 flex flex-wrap items-center justify-center gap-2"
        style={{ fontSize: `${Math.max(14, Math.round(baseFontSize * 0.42))}px` }}
      >
        {originalKey ? (
          <span
            aria-label={soundingKey && safeTranspose ? `Original key ${originalKey}, transposed key ${soundingKey}` : keyBadge}
            className="rounded-md border border-current px-2 py-1 font-bold tracking-wide"
          >
            {keyBadge}
          </span>
        ) : null}
        {useNumberLegend ? (
          <span className="rounded-md border border-current px-2 py-1" data-testid="chord-number-legend">
            1 = {originalKey}
          </span>
        ) : null}
        {validChart.capo ? (
          <span className="rounded-md border border-current px-2 py-1">Capo {validChart.capo}</span>
        ) : null}
        <span className="px-1 opacity-80" aria-live="polite">
          {formatTransposeLabel(safeTranspose)}
        </span>
        <span className="inline-flex items-center gap-1" role="group" aria-label="Transpose current chord line">
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

      {displayedSection?.label || activeSectionLabel ? (
        <h3
          className="mb-3 text-center font-bold uppercase tracking-widest opacity-90"
          style={{ fontSize: `${Math.max(13, Math.round(baseFontSize * 0.38))}px` }}
        >
          {displayedSection?.label || activeSectionLabel}
        </h3>
      ) : null}

      <div
        aria-live="polite"
        className="max-w-full overflow-x-auto whitespace-pre text-left leading-snug"
        style={{ fontSize: `${baseFontSize}px`, fontFamily: 'inherit' }}
      >
        {activeChartLines.map(({ key, line }, lineIdx) => {
          const { chords, lyrics: lyricText } = formatChordLyricLine(line.segments, safeTranspose, {
            notation: useNumbers ? 'numbers' : 'letters',
            key: originalKey,
          });
          return (
            <div key={key || `chord-line-${lineIdx}`}>
              {chords ? (
                <div className="font-bold" data-testid={lineIdx === 0 ? 'chord-number-row' : undefined}>
                  {chords}
                </div>
              ) : null}
              <div>{lyricText}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ChordChartView;
