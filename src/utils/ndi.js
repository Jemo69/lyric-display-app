/**
 * NDI renderer helpers: default source names + status descriptors.
 *
 * Status is NEVER color-alone: every state carries a distinct glyph
 * (shape) plus a text label, so the NDI indicator stays readable for
 * color-blind operators in a dim booth. Dark-mode-first classes included.
 */

export function defaultNdiSourceName(outputKey) {
  const label =
    outputKey === 'output1'
      ? 'Output 1'
      : outputKey === 'output2'
        ? 'Output 2'
        : outputKey === 'stage'
          ? 'Stage'
          : String(outputKey || '').replace(/^custom_/, '').replace(/[-_]+/g, ' ').trim() || 'Output';
  return `LyricDisplay ${label}`;
}

export const NDI_STATE_META = {
  stopped: {
    glyph: '○',
    label: 'Off',
    detail: 'NDI output is off for this screen.',
    pill: 'border-gray-500 text-gray-300',
    dot: 'bg-gray-500',
  },
  starting: {
    glyph: '◐',
    label: 'Starting…',
    detail: 'Opening the NDI sender. This takes a moment.',
    pill: 'border-amber-400 text-amber-200',
    dot: 'bg-amber-400',
  },
  live: {
    glyph: '●',
    label: 'Live on NDI',
    detail: 'Sending lyrics over the local network.',
    pill: 'border-emerald-400 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  error: {
    glyph: '▲',
    label: 'Needs attention',
    detail: 'NDI output could not start. The app is unaffected.',
    pill: 'border-red-400 text-red-200',
    dot: 'bg-red-400',
  },
};

export function describeNdiSnapshot(snapshot) {
  const state = snapshot?.state && NDI_STATE_META[snapshot.state] ? snapshot.state : 'stopped';
  const meta = NDI_STATE_META[state];
  const errorMessage = snapshot?.error?.message || null;
  return {
    state,
    glyph: meta.glyph,
    label: meta.label,
    detail: state === 'error' && errorMessage ? errorMessage : meta.detail,
    pill: meta.pill,
    dot: meta.dot,
  };
}
