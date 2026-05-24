import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, ChevronRight, ChevronDown, Loader2, Upload, History, BookOpen, SkipBack, SkipForward, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, GripVertical } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import { searchBible, parseBibleFromFile, orderBibleMetadata } from 'shared/bible';
import useToast from '../../hooks/useToast';

export default function BibleControlPanel({ darkMode, onSelectVerse }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [expandedBooks, setExpandedBooks] = useState({});
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const { showToast } = useToast();

  const {
    bibles,
    bibleMetadata,
    activeBibleId,
    defaultBibleId,
    activeReference,
    selectedVerses,
    addBible,
    setActiveBible,
    setDefaultBible,
    setReference,
    setSelectedVerses,
    getFormattedReference,
    getVerseText,
    bibleHistory = [],
    settings,
    updateSettings,
    ui = { libraryCollapsed: false, sidePanelCollapsed: false, historyCollapsed: true },
    setUIState
  } = useBibleStore();
  const splitLongVersesEnabled = Boolean(settings?.splitLongVerses);
  const splitLongVersesChars = Number(settings?.longVersesChars || 100);
  const splitLongVersesTolerance = Number(settings?.longVersesTolerance || 0);

  const currentBible = bibles[activeBibleId];
  const orderedBibleMetadata = useMemo(
    () => orderBibleMetadata(bibleMetadata, defaultBibleId),
    [bibleMetadata, defaultBibleId]
  );

  useEffect(() => {
    if (!activeBibleId && Object.keys(bibleMetadata).length > 0) {
      const firstId = defaultBibleId && bibleMetadata[defaultBibleId]
        ? defaultBibleId
        : orderedBibleMetadata[0]?.id;
      setActiveBible(firstId);
    }
  }, [activeBibleId, bibleMetadata, defaultBibleId, orderedBibleMetadata, setActiveBible]);

  useEffect(() => {
    if (query && query.length >= 3 && currentBible) {
      setSearching(true);
      const results = searchBible(currentBible, query, bibles, 20, defaultBibleId);
      setSearchResults(results);
      setSearching(false);
    } else {
      setSearchResults([]);
    }
  }, [query, currentBible, bibles, defaultBibleId]);

  const handleBookToggle = useCallback((bookNumber) => {
    setExpandedBooks(prev => ({
      ...prev,
      [bookNumber]: !prev[bookNumber]
    }));
  }, []);

  const handleImportBible = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const bible = await parseBibleFromFile(file);
      if (!bible.books || bible.books.length === 0) {
        throw new Error('No books found in Bible file');
      }

      const id = bible.id || `bible_${Date.now()}`;
      addBible(id, bible);
      setActiveBible(id);

      showToast({
        title: 'Bible imported',
        message: `${bible.name} has been added to your library`,
        variant: 'success'
      });
    } catch (error) {
      showToast({
        title: 'Import failed',
        message: error.message || 'Could not parse Bible file',
        variant: 'error'
      });
    } finally {
      e.target.value = '';
    }
  }, [addBible, setActiveBible, showToast]);

  const handleVerseSelect = useCallback((book, chapter, verses, text) => {
    const verseArray = Array.isArray(verses) ? verses : [verses];

    setReference({
      id: activeBibleId,
      book,
      chapters: [String(chapter)],
      verses: [verseArray]
    });
    setSelectedVerses([verseArray]);

    if (onSelectVerse) {
      const bookData = currentBible?.books.find(b => b.number === book);
      const reference = verseArray.length > 1
        ? `${bookData?.name || 'Unknown'} ${chapter}:${verseArray[0]}-${verseArray[verseArray.length - 1]}`
        : `${bookData?.name || 'Unknown'} ${chapter}:${verseArray[0]}`;

      const slides = getBibleSlides(text, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance);
      onSelectVerse({
        reference,
        text: slides[0] || text,
        fullText: text,
        slides,
        slideIndex: 0,
        bible: currentBible?.name,
      });
    }
  }, [activeBibleId, currentBible, setReference, setSelectedVerses, onSelectVerse, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance]);

  const handleSearchResultClick = useCallback((result) => {
    if (result.bibleId && result.bibleId !== activeBibleId) {
      setActiveBible(result.bibleId);
    }
    handleVerseSelect(result.book, result.chapter, result.verses || result.verse, result.text);
    setQuery('');
    setSearchResults([]);
  }, [handleVerseSelect, activeBibleId, setActiveBible]);

  const books = currentBible?.books || [];
  const currentBook = activeReference?.book ? books.find(b => b.number === activeReference.book) : null;
  const currentChapter = currentBook && activeReference?.chapters?.[0]
    ? currentBook.chapters.find(c => c.number === parseInt(activeReference.chapters[0]))
    : null;
  const selectedReference = activeReference && selectedVerses[0]?.length > 0 ? getFormattedReference() : '';
  const selectedVerseText = activeReference && selectedVerses[0]?.length > 0 ? getVerseText() : '';
  const selectedVerseSlides = useMemo(
    () => getBibleSlides(selectedVerseText, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance),
    [selectedVerseText, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance]
  );
  const hasMultipleSlides = selectedVerseSlides.length > 1;
  const selectedPreviewText = selectedVerseSlides[selectedSlideIndex] || selectedVerseText;
  const selectedVerseNumbers = selectedVerses[0] || [];
  const lastSelectedVerseNumber = selectedVerseNumbers[selectedVerseNumbers.length - 1];
  const firstSelectedVerseNumber = selectedVerseNumbers[0];
  const nextVerse = currentChapter?.verses?.find((verse) => verse.number > lastSelectedVerseNumber);
  const previousVerse = currentChapter?.verses ? [...currentChapter.verses].reverse().find((verse) => verse.number < firstSelectedVerseNumber) : null;
  const canAdvanceBible = (hasMultipleSlides && selectedSlideIndex < selectedVerseSlides.length - 1) || Boolean(nextVerse);
  const canGoBackBible = selectedSlideIndex > 0 || Boolean(previousVerse);

  useEffect(() => {
    setSelectedSlideIndex(0);
  }, [selectedReference, selectedVerseText, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance]);

  const sendBibleSlideToDisplay = useCallback((slideIndex = selectedSlideIndex) => {
    if (!onSelectVerse || !selectedReference || !selectedVerseText) return;

    const safeIndex = Math.min(Math.max(slideIndex, 0), Math.max(selectedVerseSlides.length - 1, 0));
    setSelectedSlideIndex(safeIndex);
    onSelectVerse({
      reference: selectedReference,
      text: selectedVerseSlides[safeIndex] || selectedVerseText,
      fullText: selectedVerseText,
      slides: selectedVerseSlides,
      slideIndex: safeIndex,
      bible: currentBible?.name,
    });
  }, [currentBible?.name, onSelectVerse, selectedReference, selectedSlideIndex, selectedVerseSlides, selectedVerseText]);

  const sendNextBibleSlideToDisplay = useCallback(() => {
    if (hasMultipleSlides && selectedSlideIndex < selectedVerseSlides.length - 1) {
      const nextIndex = selectedSlideIndex + 1;
      sendBibleSlideToDisplay(nextIndex);
      return;
    }

    if (nextVerse && currentBook && currentChapter) {
      handleVerseSelect(currentBook.number, currentChapter.number, nextVerse.number, nextVerse.text);
    }
  }, [currentBook, currentChapter, handleVerseSelect, hasMultipleSlides, nextVerse, selectedSlideIndex, selectedVerseSlides.length, sendBibleSlideToDisplay]);

  const sendPreviousBibleSlideToDisplay = useCallback(() => {
    if (selectedSlideIndex > 0) {
      sendBibleSlideToDisplay(selectedSlideIndex - 1);
      return;
    }

    if (previousVerse && currentBook && currentChapter) {
      const previousSlides = getBibleSlides(previousVerse.text, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance);
      const previousSlideIndex = Math.max(previousSlides.length - 1, 0);
      setReference({
        id: activeBibleId,
        book: currentBook.number,
        chapters: [String(currentChapter.number)],
        verses: [[previousVerse.number]]
      });
      setSelectedVerses([[previousVerse.number]]);
      setSelectedSlideIndex(previousSlideIndex);

      if (onSelectVerse) {
        const reference = `${currentBook.name || 'Unknown'} ${currentChapter.number}:${previousVerse.number}`;
        onSelectVerse({
          reference,
          text: previousSlides[previousSlideIndex] || previousVerse.text,
          fullText: previousVerse.text,
          slides: previousSlides,
          slideIndex: previousSlideIndex,
          bible: currentBible?.name,
        });
      }
    }
  }, [activeBibleId, currentBible?.name, currentBook, currentChapter, onSelectVerse, previousVerse, selectedSlideIndex, sendBibleSlideToDisplay, setReference, setSelectedVerses, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance]);

  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizing && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const newWidth = containerWidth - e.clientX + containerRef.current.offsetLeft;
      if (newWidth > 300 && newWidth < 800) {
        setUIState({ sidePanelWidth: newWidth });
      }
    }
  }, [isResizing, setUIState]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${darkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'}`}>
      {/* Bible Selector */}
      <div className={`flex-shrink-0 border-b p-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-2">
          <select
            value={activeBibleId || ''}
            onChange={(e) => setActiveBible(e.target.value)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${darkMode
              ? 'bg-gray-700 border-gray-600 text-white'
              : 'bg-white border-gray-300 text-gray-900'
              }`}
          >
            <option value="">Select Bible</option>
            {orderedBibleMetadata.map(meta => (
              <option key={meta.id} value={meta.id}>{meta.name}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => activeBibleId && setDefaultBible(activeBibleId)}
            disabled={!activeBibleId || activeBibleId === defaultBibleId}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${darkMode
              ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:border-gray-700'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200'
              } disabled:cursor-not-allowed`}
            title={activeBibleId === defaultBibleId ? 'Current default Bible' : 'Set selected Bible as default'}
          >
            {activeBibleId === defaultBibleId ? 'Default' : 'Set Default'}
          </button>

          <input
            type="file"
            accept=".xml,.json"
            onChange={handleImportBible}
            className="hidden"
            id="bible-import-input-panel"
          />
          <label
            htmlFor="bible-import-input-panel"
            className={`rounded-lg border p-2 transition-colors cursor-pointer ${darkMode
              ? 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white'
              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-blue-600'
              }`}
            title="Import Bible (.xml)"
          >
            <Upload className="h-4 w-4" />
          </label>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 min-h-0 p-3 relative" ref={containerRef}>
        <div 
          className={`grid h-full min-h-0 gap-3 transition-[grid-template-columns] duration-300 ${
            ui.libraryCollapsed || ui.sidePanelCollapsed 
              ? 'grid-cols-1' 
              : 'xl:grid-cols-[1fr_auto]'
          }`}
          style={{ 
            gridTemplateColumns: (!ui.libraryCollapsed && !ui.sidePanelCollapsed) 
              ? `1fr ${ui.sidePanelWidth}px` 
              : undefined 
          }}
        >
          {/* Main Bible module (Library & History) */}
          {!ui.libraryCollapsed && (
          <div className={`flex min-h-0 flex-col gap-3 transition-all duration-300 animate-in fade-in slide-in-from-left-4`}>
            <section className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm ${darkMode ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50'}`}>
              <div className={`flex-shrink-0 border-b px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className={`h-4 w-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider">Bible Library</div>
                      <div className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Choose a book and chapter
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setUIState({ libraryCollapsed: true })}
                    className={`p-1 rounded-md transition-colors ${darkMode ? 'hover:bg-gray-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}
                    title="Collapse Library"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {books.length > 0 ? (
                  books.map((book) => (
                    <div key={book.number} className="border-b last:border-b-0 border-transparent">
                      <button
                        onClick={() => handleBookToggle(book.number)}
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors ${darkMode
                          ? 'hover:bg-gray-800 text-gray-200'
                          : 'hover:bg-white text-gray-800'
                          } ${activeReference?.book === book.number
                            ? darkMode ? 'bg-blue-900/30' : 'bg-blue-50'
                            : ''}`}
                      >
                        {expandedBooks[book.number]
                          ? <ChevronDown className="h-4 w-4 flex-shrink-0" />
                          : <ChevronRight className="h-4 w-4 flex-shrink-0" />
                        }
                        <span className="truncate">{book.name}</span>
                      </button>

                      {expandedBooks[book.number] && (
                        <div className={`grid grid-cols-8 gap-1 px-4 pb-3 ${darkMode ? 'bg-gray-900/20' : 'bg-white/40'}`}>
                          {book.chapters.map((chapter) => (
                            <button
                              key={chapter.number}
                              onClick={() => {
                                setReference({
                                  id: activeBibleId,
                                  book: book.number,
                                  chapters: [String(chapter.number)],
                                  verses: [[1]]
                                });
                                setSelectedVerses([[1]]);
                              }}
                              className={`rounded-lg px-2 py-1 text-xs transition-colors ${activeReference?.book === book.number && activeReference?.chapters?.[0] === String(chapter.number)
                                ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                                : darkMode
                                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                              {chapter.number}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={`flex h-full min-h-[240px] items-center justify-center p-6 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <div>
                      <BookOpen className="mx-auto mb-3 h-8 w-8 opacity-60" />
                      <p className="text-sm font-medium">Import a Bible to get started</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Bible History Section */}
            {bibleHistory.length > 0 && (
              <section className={`flex-shrink-0 overflow-hidden rounded-2xl border shadow-sm ${darkMode ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-white'}`}>
                <button
                  onClick={() => setUIState({ historyCollapsed: !ui.historyCollapsed })}
                  className={`w-full flex items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 bg-gray-800/50' : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Recent Verses
                  </div>
                  {ui.historyCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {!ui.historyCollapsed && (
                  <div className={`max-h-56 overflow-y-auto p-2 grid grid-cols-1 gap-1.5 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                    {bibleHistory.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => {
                          if (onSelectVerse) {
                            const slides = getBibleSlides(entry.text, splitLongVersesEnabled, splitLongVersesChars, splitLongVersesTolerance);
                            onSelectVerse({
                              reference: entry.reference,
                              text: slides[0] || entry.text,
                              fullText: entry.text,
                              slides,
                              slideIndex: 0,
                              bible: entry.bibleName
                            });
                          }
                          setUIState({ historyCollapsed: true });
                        }}
                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${darkMode
                          ? 'border-gray-700 text-gray-200 hover:bg-gray-700'
                          : 'border-gray-100 text-gray-800 hover:bg-gray-50 hover:border-gray-200'
                          }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="truncate text-sm font-semibold">{entry.reference}</div>
                          <div className="text-[10px] font-bold uppercase opacity-60">{entry.bibleName}</div>
                        </div>
                        <div className="mt-1.5 w-full text-xs leading-relaxed opacity-70 line-clamp-2">{entry.text}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
          )}

          {/* Verse side panel */}
          {!ui.sidePanelCollapsed && (
          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-xl relative transition-all duration-300 animate-in fade-in slide-in-from-right-4 ${darkMode ? 'border-gray-700 bg-gray-950/60' : 'border-gray-200 bg-white'}`}>
            {/* Resize Handle */}
            {!ui.libraryCollapsed && (
              <div
                  onMouseDown={startResizing}
                  className={`absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize z-30 group flex items-center justify-center hover:bg-blue-500/20 transition-colors`}
              >
                  <div className={`w-1 h-full bg-transparent group-hover:bg-blue-500/30 transition-colors`}></div>
                  <GripVertical className="absolute w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            
            {/* Search bar & Toggle */}
            <div className={`flex-shrink-0 border-b p-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <button
                    onClick={() => setUIState({ sidePanelCollapsed: true })}
                    className={`p-1 rounded-md transition-colors ${darkMode ? 'hover:bg-gray-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}
                    title="Collapse Side Panel"
                >
                    <PanelRightClose className="w-4 h-4" />
                </button>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Verse Search & Selection</div>
              </div>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      handleSearchResultClick(searchResults[0]);
                    }
                  }}
                  placeholder="Search verses..."
                  data-bible-search-input
                  className={`w-full rounded-lg border py-2 pl-9 pr-3 text-sm ${darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                />
                {searching && (
                  <Loader2 className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 ? (
                <div className={`mt-2 max-h-48 overflow-y-auto rounded-lg border ${darkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-white'
                  }`}>
                  {searchResults.map((result, idx) => (
                    <button
                      key={`${result.reference}-${idx}`}
                      onClick={() => handleSearchResultClick(result)}
                      className={`w-full border-b p-2 text-left text-sm last:border-b-0 ${darkMode ? 'border-gray-600 hover:bg-gray-600' : 'border-gray-100 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{result.reference}</div>
                        {result.bibleName && (
                          <div className="rounded bg-blue-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-400">
                            {result.bibleName}
                          </div>
                        )}
                      </div>
                      <div className={`truncate text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {result.text}
                      </div>
                    </button>
                  ))}
                </div>
              ) : query.length >= 3 ? (
                <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${darkMode ? 'border-gray-700 bg-gray-800 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}>
                  No matching verses found.
                </div>
              ) : (
                <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${darkMode ? 'border-gray-700 bg-gray-800 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}>
                  Search for a verse or passage to bring results up beside the Bible module.
                </div>
              )}
            </div>

            {/* Current Selection Display */}
            {activeReference && selectedVerses[0]?.length > 0 && (
              <div className={`flex-shrink-0 border-b p-3 ${darkMode ? 'border-gray-700 bg-blue-900/30' : 'border-gray-200 bg-blue-50'}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{selectedReference}</div>
                    {hasMultipleSlides && (
                      <div className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wider ${darkMode ? 'text-blue-200' : 'text-blue-700'}`}>
                        Slide {selectedSlideIndex + 1} of {selectedVerseSlides.length}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={sendPreviousBibleSlideToDisplay}
                      disabled={!canGoBackBible}
                      className={`rounded border p-1 transition-colors ${darkMode
                        ? 'border-blue-400/40 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500'
                        : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400'
                        } disabled:cursor-not-allowed`}
                      title={canGoBackBible ? 'Send previous Bible slide or verse' : 'No previous Bible slide or verse'}
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => sendBibleSlideToDisplay(selectedSlideIndex)}
                      className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      Send to Display
                    </button>
                    <button
                      type="button"
                      onClick={sendNextBibleSlideToDisplay}
                      disabled={!canAdvanceBible}
                      className={`rounded border p-1 transition-colors ${darkMode
                        ? 'border-blue-400/40 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500'
                        : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400'
                        } disabled:cursor-not-allowed`}
                      title={canAdvanceBible ? 'Send next Bible slide or verse' : 'No next Bible slide or verse'}
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <label className={`mb-2 flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-[11px] ${darkMode ? 'border-blue-400/20 bg-gray-900/50 text-blue-100' : 'border-blue-100 bg-white/70 text-blue-900'}`}>
                  <span className="font-semibold">Divide long verses into slides</span>
                  <input
                    type="checkbox"
                    checked={splitLongVersesEnabled}
                    onChange={(event) => updateSettings({ splitLongVerses: event.target.checked })}
                    className="h-4 w-4 accent-blue-600"
                  />
                </label>
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedPreviewText}
                </div>
              </div>
            )}

            {/* Current Chapter Verses */}
            <div className="flex-1 min-h-0 p-3">
              <div className={`mb-2 text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {currentBook?.name && currentReferenceLabel(currentBook?.name, activeReference)}
                {!currentBook?.name && 'Verses'}
              </div>

              {currentChapter ? (
                <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1">
                  {currentChapter.verses.map((verse) => (
                    <button
                      key={verse.number}
                      onClick={() => handleVerseSelect(currentBook.number, currentChapter.number, verse.number, verse.text)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedVerses[0]?.includes(verse.number)
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : darkMode
                          ? 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700'
                          : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
                        }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${selectedVerses[0]?.includes(verse.number)
                          ? 'bg-white/20 text-white'
                          : darkMode
                            ? 'bg-gray-600 text-gray-200'
                            : 'bg-gray-200 text-gray-700'
                          }`}>
                          Verse {verse.number}
                        </span>
                      </div>
                      <div
                        className="text-xs leading-relaxed"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {verse.text}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm ${darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
                  }`}>
                  {activeReference?.book
                    ? 'Select a chapter to browse verses.'
                    : 'Select a book to begin browsing verses.'}
                </div>
              )}
            </div>
          </aside>
          )}

          {/* Restore Buttons (When collapsed) */}
          {ui.libraryCollapsed && (
            <button
                onClick={() => setUIState({ libraryCollapsed: false })}
                className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-xl border shadow-lg transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600'}`}
                title="Expand Bible Library"
            >
                <PanelLeftOpen className="w-5 h-5" />
            </button>
          )}

          {ui.sidePanelCollapsed && (
            <button
                onClick={() => setUIState({ sidePanelCollapsed: false })}
                className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-xl border shadow-lg transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600'}`}
                title="Expand Side Panel"
            >
                <PanelRightOpen className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function currentReferenceLabel(bookName, activeReference) {
  if (!activeReference?.chapters?.[0]) return bookName;
  return `${bookName} ${activeReference.chapters[0]}`;
}

function getBibleSlides(text, splitLongVersesEnabled, maxChars = 100, tolerance = 0) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!splitLongVersesEnabled) return [normalizedText];
  return splitBibleTextIntoSlides(normalizedText, maxChars, tolerance);
}

function splitBibleTextIntoSlides(text, maxChars = 100, tolerance = 0) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return [''];

  const segments = splitPlainText(normalizedText, maxChars, tolerance, 3);
  return segments.length > 0 ? segments : [normalizedText];
}

function splitTextContentInHalf(text) {
  const center = Math.floor(text.length / 2);

  function findSplitIndex(chars) {
    const margin = center / 2;
    let index = -1;
    for (let i = center - margin; i <= center + margin; i++) {
      if (chars.includes(text[i])) index = i + 1;
    }
    return index;
  }

  function checkForSpaces(left = true) {
    let index = -1;
    for (let i = center; left ? i >= 0 : i < text.length; i += left ? -1 : 1) {
      if (text[i] === ' ') {
        index = i;
        break;
      }
    }
    return index;
  }

  const splitChars = ['.', ',', '!', '?'];
  let splitIndex = findSplitIndex(splitChars);

  if (splitIndex === -1) {
    const leftIndex = checkForSpaces(true);
    const rightIndex = checkForSpaces(false);

    if (leftIndex !== -1 && (rightIndex === -1 || center - leftIndex <= rightIndex - center)) splitIndex = leftIndex;
    else splitIndex = rightIndex;
  }

  if (splitIndex === -1) return [text];

  const firstHalf = text.slice(0, splitIndex).trim();
  const secondHalf = text.slice(splitIndex).trim();
  return [firstHalf, secondHalf];
}

function adjustSplitIndexForBracket(text, breakIndex) {
  if (!text) return breakIndex;
  const safeIndex = Math.max(0, Math.min(breakIndex, text.length));
  const before = text.slice(0, safeIndex);
  const after = text.slice(safeIndex);
  const lastOpen = before.lastIndexOf('[');
  if (lastOpen === -1) return safeIndex;
  if (before.indexOf(']', lastOpen) !== -1) return safeIndex;

  const closingIndex = after.indexOf(']');
  if (closingIndex === -1) return safeIndex;

  const bracketContent = (before.slice(lastOpen + 1) + after.slice(0, closingIndex)).replace(/[\[\]]/g, '').trim();
  if (!bracketContent.length) return safeIndex;

  const wordCount = bracketContent.split(/\s+/).filter(Boolean).length;
  if (!wordCount || wordCount >= 4) return safeIndex;

  let newIndex = lastOpen;
  while (newIndex > 0 && /\s/.test(before[newIndex - 1])) newIndex--;

  return Math.max(0, newIndex);
}

function moveDanglingBracketToNext(first, second) {
  const before = first;
  const after = second;
  const lastOpen = before.lastIndexOf('[');
  if (lastOpen === -1) return { first, second };
  if (before.indexOf(']', lastOpen) !== -1) return { first, second };

  const closingIndex = after.indexOf(']');
  if (closingIndex === -1) return { first, second };

  const bracketContent = (before.slice(lastOpen + 1) + after.slice(0, closingIndex)).replace(/[\[\]]/g, '').trim();
  if (!bracketContent.length) return { first, second };

  const wordCount = bracketContent.split(/\s+/).filter(Boolean).length;
  if (!wordCount || wordCount >= 4) return { first, second };

  const kept = first.slice(0, lastOpen).trimEnd();
  const movedPortion = first.slice(lastOpen);
  const combinedSecond = `${movedPortion}${second ? ` ${second.trimStart()}` : ''}`.trim();
  return { first: kept, second: combinedSecond };
}

function getSplitHalves(text, maxChars, tolerance = 0) {
  if (tolerance === 0) {
    const halves = splitTextContentInHalf(text);
    if (halves.length >= 2) {
      const first = halves[0].trim();
      const second = halves[1].trim();
      if (first.length && second.length) return [first, second];
    }
  }

  if (text.length <= maxChars) return null;

  let pivot = -1;

  if (tolerance > 0) {
    const center = Math.floor(text.length / 2);
    const windowMin = Math.max(0, center - tolerance);
    const windowMax = Math.min(text.length - 1, center + tolerance);
    let bestPivot = -1;
    let bestDistance = Infinity;

    for (let i = windowMin; i <= windowMax; i++) {
      if (/[.,;:!?]/.test(text.charAt(i))) {
        const distance = Math.abs(i - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPivot = i + 1;
        }
      }
    }

    pivot = bestPivot;
  }

  if (pivot <= 0) {
    const capacity = maxChars;
    const slice = text.slice(0, capacity);
    const breakChars = [' ', '\n', '\t', '-', ','];
    let splitIndex = -1;

    breakChars.forEach((char) => {
      const idx = slice.lastIndexOf(char);
      if (idx > splitIndex) splitIndex = idx;
    });

    if (splitIndex === -1) {
      const nextBreak = text.slice(capacity).search(/[ \n\t\-,]/);
      if (nextBreak >= 0 && nextBreak <= 20) {
        splitIndex = capacity + nextBreak;
      }
    }

    pivot = splitIndex === -1 ? capacity : splitIndex + 1;
    pivot = adjustSplitIndexForBracket(text, pivot);
  }

  const first = text.slice(0, pivot).trim();
  const second = text.slice(pivot).trim();
  if (!first.length || !second.length) return null;
  return [first, second];
}

function rebalanceHalves(first, second, maxChars, minSegmentLength) {
  if (second.length >= minSegmentLength || first.length <= minSegmentLength) {
    return { first, second };
  }

  const words = first.split(/\s+/).filter(Boolean);
  while (words.length > 1 && second.length < minSegmentLength) {
    const moved = words.pop();
    if (!moved) break;

    const candidateFirst = words.join(' ').trim();
    const candidateSecond = `${moved} ${second}`.trim();

    if (!candidateFirst.length || candidateFirst.length > maxChars || candidateSecond.length > maxChars) {
      words.push(moved);
      break;
    }

    first = candidateFirst;
    second = candidateSecond;
  }

  return { first, second };
}

function splitPlainText(value, maxChars, tolerance = 0, maxSegments = 4) {
  const queue = [String(value || '').trim()];
  const segments = [];
  const proportion = Math.floor(maxChars * 0.3);
  const upperBound = Math.max(maxChars - 1, 0);
  const acceptLength = tolerance > 0 ? maxChars + tolerance : maxChars;
  let minSegmentLength = Math.max(10, proportion);
  if (upperBound > 0) minSegmentLength = Math.min(minSegmentLength, upperBound);
  if (minSegmentLength < 1) minSegmentLength = 1;

  while (queue.length) {
    const current = queue.shift()?.trim();
    if (!current) continue;

    if (current.length <= acceptLength) {
      segments.push(current);
      continue;
    }

    const halves = getSplitHalves(current, maxChars, tolerance);
    if (!halves) {
      segments.push(current);
      continue;
    }

    let [first, second] = halves;
    ({ first, second } = moveDanglingBracketToNext(first, second));

    if (tolerance === 0) {
      const rebalanced = rebalanceHalves(first, second, maxChars, minSegmentLength);
      first = rebalanced.first;
      second = rebalanced.second;
    }

    if (second.length < 1) {
      segments.push(first);
      continue;
    }

    if (second.length > 0) queue.unshift(second);
    if (first.length > 0) queue.unshift(first);
  }

  if (segments.length > 1 && segments[segments.length - 1].length < minSegmentLength) {
    const last = segments[segments.length - 1];
    const combined = `${segments[segments.length - 2]} ${last}`.trim();
    if (tolerance === 0 || combined.length <= acceptLength) {
      segments[segments.length - 2] = combined;
      segments.pop();
    }
  }

  while (segments.length > maxSegments) {
    let mergeIndex = 0;
    let smallestCombinedLength = Infinity;

    for (let i = 0; i < segments.length - 1; i++) {
      const combinedLength = `${segments[i]} ${segments[i + 1]}`.trim().length;
      if (combinedLength < smallestCombinedLength) {
        smallestCombinedLength = combinedLength;
        mergeIndex = i;
      }
    }

    segments.splice(mergeIndex, 2, `${segments[mergeIndex]} ${segments[mergeIndex + 1]}`.trim());
  }

  return balanceSegmentLengths(segments, maxChars);
}

function balanceSegmentLengths(segments, maxChars) {
  if (segments.length < 2) return segments;

  const balanced = [...segments];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < balanced.length - 1; i++) {
      const current = balanced[i];
      const next = balanced[i + 1];
      const currentWords = current.split(/\s+/).filter(Boolean);
      const nextWords = next.split(/\s+/).filter(Boolean);
      if (currentWords.length < 2 || nextWords.length < 2) continue;

      const currentLength = current.length;
      const nextLength = next.length;
      const currentDiff = Math.abs(currentLength - nextLength);

      const moveLastToNext = {
        current: currentWords.slice(0, -1).join(' ').trim(),
        next: [currentWords[currentWords.length - 1], ...nextWords].join(' ').trim()
      };
      const moveFirstToCurrent = {
        current: [...currentWords, nextWords[0]].join(' ').trim(),
        next: nextWords.slice(1).join(' ').trim()
      };

      const candidates = [moveLastToNext, moveFirstToCurrent].filter(
        (candidate) => candidate.current.length > 0 && candidate.next.length > 0 && candidate.current.length <= maxChars && candidate.next.length <= maxChars
      );

      let bestCandidate = null;
      let bestDiff = currentDiff;

      for (const candidate of candidates) {
        const diff = Math.abs(candidate.current.length - candidate.next.length);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        balanced[i] = bestCandidate.current;
        balanced[i + 1] = bestCandidate.next;
        changed = true;
      }
    }
  }

  return balanced;
}
