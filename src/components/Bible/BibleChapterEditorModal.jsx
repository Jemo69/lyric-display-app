import React, { useEffect, useMemo, useState } from 'react';
import { X, Send, BookOpen, SplitSquareHorizontal, Rows3 } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('BibleChapterEditorModal');

export const BIBLE_CHAPTER_EDITOR_EVENT = 'open-bible-chapter-editor';

export function dispatchOpenBibleChapterEditor() {
  window.dispatchEvent(new Event(BIBLE_CHAPTER_EDITOR_EVENT));
}

/**
 * Split edited verse text into display slides.
 * - 'lines': every non-empty line is one slide. Delete a newline to show
 *   verses together on one slide.
 * - 'paragraphs': blank line starts a new slide; single newlines inside a
 *   paragraph are joined with a space so grouped verses stay together.
 */
export function parseEditedChapterToSlides(text, splitMode = 'lines') {
  const src = String(text ?? '');
  if (!src.trim()) return [];
  if (splitMode === 'paragraphs') {
    return src
      .split(/\n\s*\n+/)
      .map((block) => String(block || '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 0);
  }
  return src
    .split('\n')
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

export function buildChapterEditText(verses) {
  if (!Array.isArray(verses) || verses.length === 0) return '';
  return verses.map((v) => `${v.number} ${String(v.text || '').trim()}`).join('\n');
}

export default function BibleChapterEditorModal({ isOpen, onClose, onSend, darkMode }) {
  const { bibles, bibleMetadata, activeBibleId, activeReference, selectedVerses, getFormattedReference } = useBibleStore();

  const currentBible = activeBibleId ? bibles[activeBibleId] : null;
  const books = currentBible?.books || [];
  const currentBook = activeReference?.book
    ? books.find((b) => b.number === activeReference.book)
    : null;
  const chapterNumber = activeReference?.chapters?.[0] ?? null;
  const currentChapter = currentBook && chapterNumber
    ? currentBook.chapters.find((c) => c.number === parseInt(String(chapterNumber), 10))
    : null;
  const chapterVerses = currentChapter?.verses || [];
  const selectedNumbers = useMemo(
    () => (Array.isArray(selectedVerses?.[0]) ? [...new Set(selectedVerses[0])].sort((a, b) => a - b) : []),
    [selectedVerses]
  );
  const selectionVerses = useMemo(
    () => chapterVerses.filter((v) => selectedNumbers.includes(v.number)),
    [chapterVerses, selectedNumbers]
  );
  const hasSelection = selectionVerses.length > 0;

  const chapterLabel = useMemo(() => {
    if (currentBook && chapterNumber) return `${currentBook.name} ${chapterNumber}`;
    return '';
  }, [currentBook, chapterNumber]);
  const selectionLabel = useMemo(() => {
    try {
      const formatted = getFormattedReference?.();
      if (formatted) return formatted;
    } catch { /* fall through */ }
    if (currentBook && chapterNumber && selectedNumbers.length > 0) {
      const nums = selectedNumbers.join(',');
      return `${currentBook.name} ${chapterNumber}:${nums}`;
    }
    return chapterLabel;
  }, [getFormattedReference, currentBook, chapterNumber, selectedNumbers, chapterLabel]);
  const defaultReference = hasSelection ? selectionLabel : chapterLabel;

  const bibleName = currentBible?.name || (activeBibleId && bibleMetadata[activeBibleId]?.name) || '';

  const [editedText, setEditedText] = useState('');
  const [referenceInput, setReferenceInput] = useState('');
  const [splitMode, setSplitMode] = useState('lines');
  const [sourceMode, setSourceMode] = useState('selection');

  // Reset editor contents every time the modal opens, the chapter changes,
  // or the verse selection changes. Defaults to the selected verse(s),
  // with one-click switch to the full chapter.
  const selectionKey = selectedNumbers.join(',');
  const chapterKey = `${activeBibleId || ''}:${activeReference?.book || ''}:${chapterNumber || ''}:${selectionKey}`;
  useEffect(() => {
    if (!isOpen) return;
    const useSelection = hasSelection;
    setSourceMode(useSelection ? 'selection' : 'chapter');
    setEditedText(buildChapterEditText(useSelection ? selectionVerses : chapterVerses));
    setReferenceInput(useSelection ? selectionLabel : chapterLabel);
    setSplitMode('lines');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, chapterKey]);

  const slides = useMemo(
    () => parseEditedChapterToSlides(editedText, splitMode),
    [editedText, splitMode]
  );

  const hasChapter = Boolean(currentBook && currentChapter && chapterVerses.length > 0);
  const hasBible = Boolean(currentBible) || Object.keys(bibleMetadata || {}).length > 0;
  const canSend = hasChapter && slides.length > 0 && String(referenceInput || '').trim().length > 0;

  const loadSource = (mode) => {
    setSourceMode(mode);
    if (mode === 'chapter') {
      setEditedText(buildChapterEditText(chapterVerses));
      setReferenceInput(chapterLabel);
    } else {
      setEditedText(buildChapterEditText(selectionVerses));
      setReferenceInput(selectionLabel);
    }
  };

  const handleSend = React.useCallback(() => {
    const reference = String(referenceInput || '').trim() || defaultReference;
    if (!reference || slides.length === 0) {
      logger.warn('Bible chapter editor send blocked — empty', {
        hasReference: Boolean(reference),
        slideCount: slides.length,
      });
      return;
    }
    logger.info('Bible chapter editor send', { reference, slideCount: slides.length, bible: bibleName });
    onSend?.({
      reference,
      text: slides[0],
      fullText: slides.join(' '),
      slides,
      slideIndex: 0,
      bible: bibleName,
    });
    onClose?.();
  }, [referenceInput, defaultReference, slides, bibleName, onSend, onClose]);

  // Escape closes; Ctrl/Cmd+Enter sends.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleSend, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit Bible verse">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${darkMode ? 'border-gray-700 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 shrink-0 opacity-60" />
              <h2 className="truncate text-base font-semibold">
                {hasSelection ? `Edit verse — ${selectionLabel}` : hasChapter ? `Edit verse — ${chapterLabel}` : 'Edit Bible verse'}
              </h2>
            </div>
            <p className={`mt-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Selected verse text is loaded below. Edit the parts you want to display together, then Send to Display.
              <span className="ml-1 font-semibold">Alt+Shift+Enter</span> reopens this editor from the Bible panel.
            </p>
          </div>
          <button
            onClick={onClose}
            className={`rounded-md p-1.5 transition-colors ${darkMode ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!hasBible ? (
          <div className={`px-5 py-10 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Import a Bible first, then pick a verse to edit.
          </div>
        ) : !hasChapter ? (
          <div className={`px-5 py-10 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Select a book, chapter and verse in the Bible panel first — then press
            <span className="mx-1 font-semibold">Alt+Shift+Enter</span> to edit the verse here.
          </div>
        ) : !hasSelection ? (
          <div className={`px-5 py-10 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <p>Select a verse in the Bible panel first — then press
              <span className="mx-1 font-semibold">Alt+Shift+Enter</span> to edit it here.</p>
            <button
              type="button"
              onClick={() => loadSource('chapter')}
              className={`mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white ${darkMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              Or load full chapter ({chapterLabel}) instead
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Source:
              </span>
              <div className={`inline-flex items-center rounded-lg border p-0.5 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                <button
                  type="button"
                  onClick={() => loadSource('selection')}
                  aria-pressed={sourceMode === 'selection'}
                  title="Edit only the selected verse(s)"
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${sourceMode === 'selection' ? 'bg-blue-600 text-white' : darkMode ? 'text-gray-400 hover:text-gray-100' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  Selected ({selectionVerses.length})
                </button>
                <button
                  type="button"
                  onClick={() => loadSource('chapter')}
                  aria-pressed={sourceMode === 'chapter'}
                  title={`Load the full chapter (${chapterVerses.length} verses) instead`}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${sourceMode === 'chapter' ? 'bg-blue-600 text-white' : darkMode ? 'text-gray-400 hover:text-gray-100' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  Full chapter ({chapterVerses.length})
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} htmlFor="bible-chapter-ref">
                Display reference
              </label>
              <input
                id="bible-chapter-ref"
                type="text"
                value={referenceInput}
                onChange={(e) => setReferenceInput(e.target.value)}
                placeholder={defaultReference}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm ${darkMode ? 'border-gray-700 bg-gray-800 text-white placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`}
              />
              {bibleName && (
                <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                  {bibleName}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Slides:
              </span>
              <div className={`inline-flex items-center rounded-lg border p-0.5 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                <button
                  type="button"
                  onClick={() => setSplitMode('lines')}
                  aria-pressed={splitMode === 'lines'}
                  title="Each line is one slide — delete a newline to show verses together"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${splitMode === 'lines' ? 'bg-blue-600 text-white' : darkMode ? 'text-gray-400 hover:text-gray-100' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <Rows3 className="h-3.5 w-3.5" />
                  Each line = slide
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode('paragraphs')}
                  aria-pressed={splitMode === 'paragraphs'}
                  title="Blank line starts a new slide — group verses into one paragraph to show together"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${splitMode === 'paragraphs' ? 'bg-blue-600 text-white' : darkMode ? 'text-gray-400 hover:text-gray-100' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                  Blank line = slide
                </button>
              </div>
              <span className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {slides.length} {slides.length === 1 ? 'slide' : 'slides'}
              </span>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-5 md:grid-cols-2">
              <div className="flex min-h-0 flex-col">
                <div className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {sourceMode === 'selection' ? 'Selected verse — editable' : 'Full chapter — editable'}
                </div>
                <textarea
                  autoFocus
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  spellCheck={false}
                  data-bible-chapter-editor-input
                  placeholder="Verse text…"
                  className={`min-h-[220px] flex-1 resize-none rounded-xl border p-3 font-mono text-xs leading-relaxed ${darkMode ? 'border-gray-700 bg-gray-950 text-gray-100 placeholder-gray-600' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`}
                />
                <div className={`mt-1 text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {splitMode === 'lines'
                    ? 'Tip: each line becomes one slide. Join two verses onto one line to display them together.'
                    : 'Tip: group verses into one paragraph to display them together. Leave a blank line for a new slide.'}
                </div>
              </div>
              <div className="flex min-h-0 flex-col">
                <div className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Display preview
                </div>
                <div className={`min-h-[220px] flex-1 space-y-2 overflow-y-auto rounded-xl border p-2 ${darkMode ? 'border-gray-700 bg-gray-950/60' : 'border-gray-200 bg-gray-50'}`}>
                  {slides.length === 0 ? (
                    <div className={`px-3 py-6 text-center text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Nothing to display — keep at least one line of text.
                    </div>
                  ) : (
                    slides.map((slide, idx) => (
                      <div key={idx} className={`rounded-lg border p-2.5 text-left ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                        <div className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                          Slide {idx + 1}{slides.length > 1 ? ` of ${slides.length}` : ''}
                        </div>
                        <div className={`mt-1 text-xs leading-relaxed ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {slide}
                        </div>
                        <div className={`mt-1 text-[10px] italic ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {referenceInput || defaultReference}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <div className={`flex items-center justify-between gap-3 border-t px-5 py-4 ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            <span className="font-semibold">Ctrl+Enter</span> to send • <span className="font-semibold">Esc</span> to close
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${darkMode ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${!canSend ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
              title={canSend ? 'Send edited text to Output/Stage live' : 'Keep at least one slide and a reference'}
            >
              <Send className="h-4 w-4" />
              Send to Display
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
