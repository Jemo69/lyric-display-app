import React from 'react';
import { Eye, MonitorPlay, Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import useLyricsStore from '../context/LyricsStore';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PreviewSafetyBar');

/**
 * Preview-mode toggle + PREVIEW vs LIVE badges (feature #02).
 *
 * Default OFF preserves current single-click-projects behavior.
 * Badges use text + shape (dashed ▢ vs solid ●), never color alone.
 * Dark-mode-first, visible focus, reduced-motion safe.
 */
export function PreviewBadge({ lineIndex = null }) {
  return (
    <span
      role="status"
      aria-label={lineIndex === null || lineIndex === undefined ? 'Preview ready' : `Previewing line ${lineIndex + 1}, not yet on screen`}
      className="motion-reduce:transition-none inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-dashed border-sky-400 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-200"
    >
      <span aria-hidden="true">▢</span>
      <span>Preview</span>
    </span>
  );
}

export function LiveBadge({ lineIndex = null }) {
  return (
    <span
      role="status"
      aria-label={lineIndex === null || lineIndex === undefined ? 'Live on screen' : `Live on screen: line ${lineIndex + 1}`}
      className="motion-reduce:transition-none inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-solid border-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200"
    >
      <span aria-hidden="true">●</span>
      <span>Live</span>
    </span>
  );
}

export default function PreviewSafetyBar({ darkMode = true, onFirePreview = null }) {
  logger.info('PreviewSafetyBar mounted');
  const previewMode = useLyricsStore((s) => s.previewMode ?? false);
  const setPreviewMode = useLyricsStore((s) => s.setPreviewMode);
  const previewSelectedLine = useLyricsStore((s) => s.previewSelectedLine ?? null);
  const selectedLine = useLyricsStore((s) => s.selectedLine ?? null);
  const isOutputOn = useLyricsStore((s) => s.isOutputOn);

  const pendingLine = previewSelectedLine === null || previewSelectedLine === undefined ? null : previewSelectedLine + 1;

  return (
    <section
      aria-label="Preview safety"
      className={`motion-reduce:transition-none flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 ${
        darkMode ? 'border-gray-700 bg-gray-950/60' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <label htmlFor="preview-mode-toggle" className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <Switch
          id="preview-mode-toggle"
          checked={!!previewMode}
          onCheckedChange={(v) => setPreviewMode?.(!!v)}
          aria-label="Preview mode: single click previews, Enter projects to screen"
          className="focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        />
        <span className="min-w-0">
          <span className={`block text-xs font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            Preview mode {previewMode ? 'on' : 'off'}
          </span>
          <span className={`block truncate text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {previewMode
              ? 'Single click previews — double-click or Enter projects to screen'
              : 'Off — single click projects instantly (current behavior)'}
          </span>
        </span>
      </label>

      <span className="flex items-center gap-2" aria-hidden={false}>
        {previewMode ? (
          <PreviewBadge lineIndex={previewSelectedLine} />
        ) : (
          <span
            className={`motion-reduce:transition-none inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            <span aria-hidden="true">○</span>
            <span>Direct</span>
          </span>
        )}
        {isOutputOn && selectedLine !== null && selectedLine !== undefined ? (
          <LiveBadge lineIndex={selectedLine} />
        ) : (
          <span
            role="status"
            aria-label="Display hidden — nothing on screen"
            className={`motion-reduce:transition-none inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-dotted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'
            }`}
          >
            <span aria-hidden="true">◇</span>
            <span>Hidden</span>
          </span>
        )}
      </span>

      {previewMode && previewSelectedLine !== null && previewSelectedLine !== undefined && (
        <button
          type="button"
          onClick={() => onFirePreview?.(previewSelectedLine)}
          title="Project the previewed line to the screen (Enter)"
          className="motion-reduce:transition-none inline-flex items-center gap-1.5 rounded-lg border-2 border-solid border-emerald-400 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          Project line {pendingLine} (Enter)
        </button>
      )}

      <span className={`flex items-center gap-1 text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
        {isOutputOn ? (
          <>
            <MonitorPlay className="h-3.5 w-3.5" aria-hidden="true" />
            Safety lock armed while live
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Display hidden — destructive actions allowed
          </>
        )}
      </span>
    </section>
  );
}
