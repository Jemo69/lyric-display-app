import React from 'react';
import { normalizeParallelLayout } from '../../utils/bibleParallel.js';

// Dual-translation parallel display (#16). Presentational only: renders the
// primary + secondary verse side by side on wide surfaces and stacked on
// narrow ones. No animation of its own — it inherits the parent's motion
// container, so reduced-motion and transition settings keep working.
// Rendered ONLY when a linked secondary translation is present; the
// single-translation path never mounts this component.
export default function ParallelBibleDisplay({
  primaryText = '',
  primaryLabel = '',
  secondaryText = '',
  secondaryLabel = '',
  layout = 'side-by-side',
  fontFamily,
  fontSize,
  fontWeight = 'normal',
  fontStyle = 'normal',
  textDecoration = 'none',
  primaryColor = '#FFFFFF',
  secondaryColor,
  labelColor,
  textAlign = 'center',
  lineHeight = 1.25,
  textShadow,
  textStrokeStyles,
}) {
  const mode = normalizeParallelLayout(layout);
  const secondary = secondaryText || '';
  const secondaryInk = secondaryColor || primaryColor;

  const slot = (key, label, body, ink, labelTestId) => (
    <div
      key={key}
      role="group"
      aria-label={label ? `Bible verse, ${label}` : 'Bible verse'}
      data-testid={labelTestId}
      style={{
        flex: mode === 'side-by-side' ? '1 1 300px' : '1 1 100%',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      {label ? (
        <div
          aria-hidden="true"
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.42em',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: labelColor || ink,
            opacity: 0.85,
            textAlign,
            marginBottom: '0.5em',
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          color: ink,
          textAlign,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {body}
      </div>
    </div>
  );

  return (
    <div
      data-testid="parallel-bible-display"
      data-parallel-layout={mode}
      style={{
        display: 'flex',
        flexDirection: mode === 'side-by-side' ? 'row' : 'column',
        flexWrap: mode === 'side-by-side' ? 'wrap' : 'nowrap',
        alignItems: mode === 'side-by-side' ? 'flex-start' : 'stretch',
        justifyContent: 'center',
        gap: '0.9em',
        width: '100%',
        maxWidth: '100%',
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        textDecoration,
        lineHeight,
        textShadow,
        ...textStrokeStyles,
      }}
    >
      {slot('primary', primaryLabel, primaryText, primaryColor, 'parallel-bible-primary')}
      {secondary
        ? slot('secondary', secondaryLabel, secondary, secondaryInk, 'parallel-bible-secondary')
        : null}
    </div>
  );
}
