import React, { useState } from 'react';
import { Languages, Unlink, Link2 } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import useToast from '../../hooks/useToast';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ParallelBibleLinkControl');

// Links a secondary translation for dual-translation parallel display.
// Dark-mode-first, labeled controls, visible focus rings, no motion.
export default function ParallelBibleLinkControl({ darkMode }) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const linkedBibleId = useBibleStore((s) => s.linkedBibleId);
  const activeBibleId = useBibleStore((s) => s.activeBibleId);
  const bibleMetadata = useBibleStore((s) => s.bibleMetadata);
  const linkParallelBible = useBibleStore((s) => s.linkParallelBible);
  const unlinkParallelBible = useBibleStore((s) => s.unlinkParallelBible);

  const candidates = Object.values(bibleMetadata || {}).filter((m) => m.id !== activeBibleId);
  const linkedName = linkedBibleId ? (bibleMetadata?.[linkedBibleId]?.name || linkedBibleId) : null;

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
    <div
      className={`mt-2 rounded-lg border p-2 ${darkMode ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}
      data-testid="parallel-bible-link"
    >
      <div className="flex items-center gap-2">
        <Languages className={`h-3.5 w-3.5 shrink-0 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} aria-hidden="true" />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Parallel display
        </span>
        {linkedName ? (
          <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            {linkedName}
          </span>
        ) : (
          <span className={`text-[10px] uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Off
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {linkedBibleId ? (
          <>
            <span className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Layout is set per output in Output / Stage settings.
            </span>
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
    </div>
  );
}
