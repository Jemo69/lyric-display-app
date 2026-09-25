import React, { useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import useLyricsStore from '../context/LyricsStore';
import ShowControlBar from './ShowControlBar';
import AnnouncementTickerPanel from './AnnouncementTickerPanel';

/**
 * Collapsible wrapper for the show controls (feature #18).
 *
 * The operator dock holds two panels that are useful while running a service
 * but pure clutter the rest of the time, so the whole block folds away. When
 * collapsed the header stays put and keeps reporting the state that matters
 * mid-song — which show state is active, and how many announcements are
 * waiting — so the operator never has to reopen it just to look.
 *
 * Children are only mounted while expanded, so a collapsed dock costs nothing.
 */
const ShowControlDock = ({
  showState = 'LIVE',
  onSelect,
  outputs = [],
  queue = [],
  activeId = null,
  targetOutput = 'all',
  onTargetOutputChange,
  onAdd,
  onRemove,
  onClear,
  onShow,
  darkMode = false,
  disabled = false,
}) => {
  const expanded = useLyricsStore((s) => s.showControlDockExpanded);
  const setExpanded = useLyricsStore((s) => s.setShowControlDockExpanded);

  const toggle = useCallback(() => setExpanded(!expanded), [expanded, setExpanded]);

  const items = Array.isArray(queue) ? queue : [];
  const queuedCount = items.length;
  const activeState = String(showState || 'LIVE').toUpperCase();
  const activeLabel = activeState.charAt(0) + activeState.slice(1).toLowerCase();

  return (
    <section
      data-testid="show-control-dock"
      className={`mb-4 overflow-hidden rounded-xl border ${
        darkMode ? 'border-gray-700 bg-gray-950/30' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="show-control-dock-body"
        data-testid="show-control-dock-toggle"
        title={expanded ? 'Collapse show controls' : 'Expand show controls'}
        className={[
          'flex w-full items-center gap-2 px-3 py-2 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
          darkMode
            ? 'focus-visible:ring-sky-300 text-gray-300 hover:bg-gray-900/50'
            : 'focus-visible:ring-sky-600 text-gray-600 hover:bg-gray-50',
        ].join(' ')}
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
          aria-hidden="true"
        />
        <span className="flex-1 text-xs font-bold uppercase tracking-[0.14em]">
          Show Control
        </span>

        {/* State stays legible while collapsed. */}
        <span
          data-testid="show-control-dock-state"
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
            darkMode
              ? 'border-sky-300/50 bg-sky-500/15 text-sky-100'
              : 'border-sky-600/40 bg-sky-100 text-sky-900'
          }`}
        >
          {activeLabel}
        </span>

        {queuedCount > 0 && (
          <span
            data-testid="show-control-dock-queued"
            title={`${queuedCount} announcement${queuedCount === 1 ? '' : 's'} queued`}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              darkMode
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-amber-300 bg-amber-50 text-amber-800'
            }`}
          >
            {queuedCount} queued
          </span>
        )}
      </button>

      {expanded && (
        <div id="show-control-dock-body" data-testid="show-control-dock-body" className="space-y-2 px-3 pb-3">
          <ShowControlBar
            showState={showState}
            onSelect={onSelect}
            darkMode={darkMode}
            disabled={disabled}
          />
          <AnnouncementTickerPanel
            outputs={outputs}
            queue={queue}
            activeId={activeId}
            targetOutput={targetOutput}
            onTargetOutputChange={onTargetOutputChange}
            onAdd={onAdd}
            onRemove={onRemove}
            onClear={onClear}
            onShow={onShow}
            darkMode={darkMode}
            disabled={disabled}
          />
        </div>
      )}
    </section>
  );
};

export default ShowControlDock;
