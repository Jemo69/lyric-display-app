import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronRight, ChevronDown, Loader2, Upload, History, BookOpen } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import { searchBible, parseBibleFromFile } from 'shared/bible';
import useToast from '../../hooks/useToast';

export default function BibleControlPanel({ darkMode, onSelectVerse }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [expandedBooks, setExpandedBooks] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const { showToast } = useToast();

  const {
    bibles,
    bibleMetadata,
    activeBibleId,
    activeReference,
    selectedVerses,
    addBible,
    setActiveBible,
    setReference,
    setSelectedVerses,
    getFormattedReference,
    getVerseText,
    bibleHistory = []
  } = useBibleStore();

  const currentBible = bibles[activeBibleId];

  useEffect(() => {
    if (!activeBibleId && Object.keys(bibleMetadata).length > 0) {
      const firstId = Object.keys(bibleMetadata)[0];
      setActiveBible(firstId);
    }
  }, [activeBibleId, bibleMetadata, setActiveBible]);

  useEffect(() => {
    if (query && query.length >= 3 && currentBible) {
      setSearching(true);
      const results = searchBible(currentBible, query, bibles, 20);
      setSearchResults(results);
      setSearching(false);
    } else {
      setSearchResults([]);
    }
  }, [query, currentBible, bibles]);

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

      onSelectVerse({ reference, text, bible: currentBible?.name });
    }
  }, [activeBibleId, currentBible, setReference, setSelectedVerses, onSelectVerse]);

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
            {Object.values(bibleMetadata).map(meta => (
              <option key={meta.id} value={meta.id}>{meta.name}</option>
            ))}
          </select>

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
      <div className="flex-1 min-h-0 p-3">
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Main Bible module */}
          <div className="flex min-h-0 flex-col gap-3">
            <section className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm ${darkMode ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50'}`}>
              <div className={`flex-shrink-0 border-b px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <BookOpen className={`h-4 w-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider">Bible Library</div>
                    <div className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Choose a book and chapter to load verses
                    </div>
                  </div>
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
                  onClick={() => setShowHistory(!showHistory)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 bg-gray-800/50' : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Recent Verses
                  </div>
                  {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {showHistory && (
                  <div className={`max-h-56 overflow-y-auto p-2 grid grid-cols-1 gap-1.5 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                    {bibleHistory.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => {
                          if (onSelectVerse) {
                            onSelectVerse({
                              reference: entry.reference,
                              text: entry.text,
                              bible: entry.bibleName
                            });
                          }
                          setShowHistory(false);
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

          {/* Verse side panel */}
          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-xl ${darkMode ? 'border-gray-700 bg-gray-950/60' : 'border-gray-200 bg-white'}`}>
            {/* Search bar */}
            <div className={`flex-shrink-0 border-b p-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
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
                  <div className="text-sm font-medium">{getFormattedReference()}</div>
                  <button
                    onClick={() => {
                      const text = getVerseText();
                      const reference = getFormattedReference();
                      if (onSelectVerse) {
                        onSelectVerse({ reference, text, bible: currentBible?.name });
                      }
                    }}
                    className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    Send to Display
                  </button>
                </div>
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {currentChapter?.verses
                    ?.filter(v => selectedVerses[0]?.includes(v.number))
                    .map(v => v.text)
                    .join(' ')}
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
        </div>
      </div>
    </div>
  );
}

function currentReferenceLabel(bookName, activeReference) {
  if (!activeReference?.chapters?.[0]) return bookName;
  return `${bookName} ${activeReference.chapters[0]}`;
}
