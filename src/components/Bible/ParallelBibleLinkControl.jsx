import React, { useCallback, useState } from 'react';
import { Languages, Unlink, Link2, Eye, EyeOff, ChevronDown } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import useToast from '../../hooks/useToast';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ParallelBibleLinkControl');

const BODY_ID = 'parallel-bible-link-body';

// Links a secondary translation for dual-translation parallel display.
// Dark-mode-first, labeled controls, visible focus rings, no motion.
//
// The whole block folds to a one-line header. Seated in the verse tray it is
// useful while running a service and pure clutter the rest of the time, and a
// second translation is linked for whole services at a stretch. Collapsed, the
// header keeps reporting what the link is doing — translation name, "Hidden",
// or "Off" — so the operator never reopens it just to look.
export default function ParallelBibleLinkControl({ darkMode }) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const linkedBibleId = useBibleStore((s) => s.linkedBibleId);
  const activeBibleId = useBibleStore((s) => s.activeBibleId);
  const bibleMetadata = useBibleStore((s) => s.bibleMetadata);
  const linkParallelBible = useBibleStore((s) => s.linkParallelBible);
  const unlinkParallelBible = useBibleStore((s) => s.unlinkParallelBible);
  const parallelHidden = useBibleStore((s) => Boolean(s.parallelHidden));
  const setParallelHidden = useBibleStore((s) => s.setParallelHidden);
  const collapsed = useBibleStore((s) => Boolean(s.ui?.parallelControlCollapsed));
  const setUIState = useBibleStore((s) => s.setUIState);

  const candidates = Object.values(bibleMetadata || {}).filter((m) => m.id !== activeBibleId);
  const linkedName = linkedBibleId ? (bibleMetadata?.[linkedBibleId]?.name || linkedBibleId) : null;

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setUIState({ parallelControlCollapsed: next });
    logger.info('Parallel control folded', { collapsed: next });
  }, [collapsed, setUIState]);

  // Hide/show keeps the link: the second translation stays one click away
  // instead of having to be re-picked from the dropdown.
  const handleToggleHidden = () => {
    const next = !parallelHidden;
    setParallelHidden(next);
    logger.info('Parallel display toggled', { hidden: next });
    showToast({
      title: next ? 'Parallel display hidden' : 'Parallel display shown',
      message: next
        ? `${linkedName || 'The second translation'} stays linked but is off the screen.`
        : `Verses now project in both translations again.`,
      variant: 'info',
    });
  };

  const handleLink = async (id) => {
    if (!id) return;
    setPending(true);
    try {
      const ok = await linkParallelBible(id);
      if (ok) {
        logger.info('Parallel bible linked from control', { secondary: id });
        showToast({
          title: 'Parallel display on',
          message: `Linked ${bibleMetadata?.[id]?.name || id} — verses now project in both translations.`,
          variant: 'success',
        });
      } else {
        showToast({
          title: 'Could not link translation',
          message: 'That translation is unavailable. Try importing it first.',
          variant: 'warning',
        });
      }
    } finally {
      setPending(false);
    }
  };

  const handleUnlink = () => {
    unlinkParallelBible();
    logger.info('Parallel bible unlinked from control');
    showToast({
      title: 'Parallel display off',
      message: 'Back to single-translation display.',
      variant: 'info',
    });
  };

  return (
    <section
      className={`overflow-hidden rounded-lg border ${darkMode ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}
      data-testid="parallel-bible-link"
      data-parallel-hidden={linkedBibleId ? String(parallelHidden) : undefined}
      data-parallel-collapsed={String(collapsed)}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls={BODY_ID}
        data-testid="parallel-bible-link-toggle"
        title={collapsed ? 'Expand parallel display controls' : 'Collapse parallel display controls'}
        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
          darkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'
        }`}
      >
        <Languages
          className={`h-3.5 w-3.5 shrink-0 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}
          aria-hidden="true"
        />
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}
          title="Side-by-side or stacked layout is set per output in Output / Stage settings"
        >
          Parallel display
        </span>
        {linkedName ? (
          parallelHidden ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${darkMode
              ? 'bg-amber-400/20 text-amber-300'
              : 'bg-amber-400/20 text-amber-700'
            }`}>
              Hidden
            </span>
          ) : (
            <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              {linkedName}
            </span>
          )
        ) : (
          <span className={`text-[10px] uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Off
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <div id={BODY_ID} data-testid="parallel-bible-link-body" className="flex items-center gap-2 px-2 pb-2">
          {linkedBibleId ? (
            <>
              <button
                type="button"
                onClick={handleToggleHidden}
                aria-pressed={parallelHidden}
                aria-label={parallelHidden ? 'Show parallel translation' : 'Hide parallel translation'}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${parallelHidden
                  ? darkMode
                    ? 'border-amber-400/60 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                    : 'border-amber-400 bg-amber-400/10 text-amber-700 hover:bg-amber-400/20'
                  : darkMode
                    ? 'border-gray-600 text-gray-200 hover:bg-gray-600'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                title={parallelHidden
                  ? `Show ${linkedName || 'the second translation'} alongside the verse`
                  : `Hide ${linkedName || 'the second translation'} — the link stays, so this is reversible`}
              >
                {parallelHidden
                  ? <Eye className="h-3 w-3" aria-hidden="true" />
                  : <EyeOff className="h-3 w-3" aria-hidden="true" />}
                {parallelHidden ? 'Show' : 'Hide'}
              </button>
              <button
                type="button"
                onClick={handleUnlink}
                className={`ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${darkMode
                  ? 'border-gray-600 text-gray-200 hover:bg-gray-600'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                title="Unlink the secondary translation"
              >
                <Unlink className="h-3 w-3" aria-hidden="true" />
                Unlink
              </button>
            </>
          ) : (
            <>
              <Link2 className={`h-3 w-3 shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} aria-hidden="true" />
              <select
                value=""
                disabled={pending || candidates.length === 0}
                onChange={(e) => handleLink(e.target.value)}
                className={`w-full rounded-lg border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${darkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
                  }`}
                title="Link a second translation"
                aria-label="Link a second translation for parallel display"
              >
                <option value="">
                  {candidates.length === 0 ? 'No second translation' : 'Link 2nd translation…'}
                </option>
                {candidates.map((meta) => (
                  <option key={meta.id} value={meta.id}>{meta.name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
    </section>
  );
}