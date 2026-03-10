import React, { useState, useEffect, useCallback } from 'react';
import { Search, BookOpen, ChevronRight, ChevronDown, Loader2, X, Upload, History } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import { searchBible, parseBibleFromFile } from '../../shared/bible';
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

  const handleVerseSelect = useCallback((book, chapter, verse, text) => {
    setReference({
      id: activeBibleId,
      book: book,
      chapters: [String(chapter)],
      verses: [[verse]]
    });
    setSelectedVerses([[verse]]);

    if (onSelectVerse) {
      const bookData = currentBible?.books.find(b => b.number === book);
      const reference = `${bookData?.name || 'Unknown'} ${chapter}:${verse}`;
      onSelectVerse({ reference, text, bible: currentBible?.name });
    }
  }, [activeBibleId, currentBible, setReference, setSelectedVerses, onSelectVerse]);

  const handleSearchResultClick = useCallback((result) => {
    if (result.bibleId && result.bibleId !== activeBibleId) {
      setActiveBible(result.bibleId);
    }
    handleVerseSelect(result.book, result.chapter, result.verse, result.text);
    setQuery('');
    setSearchResults([]);
  }, [handleVerseSelect, activeBibleId, setActiveBible]);

  const books = currentBible?.books || [];
  const currentBook = activeReference?.book ? books.find(b => b.number === activeReference.book) : null;
  const currentChapter = currentBook && activeReference?.chapters?.[0]
    ? currentBook.chapters.find(c => c.number === parseInt(activeReference.chapters[0]))
    : null;

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
      {/* Bible Selector */}
      <div className={`p-3 border-b flex items-center gap-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <select
          value={activeBibleId || ''}
          onChange={(e) => setActiveBible(e.target.value)}
          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode
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
          className={`p-2 rounded-lg border cursor-pointer transition-colors ${darkMode
            ? 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white hover:bg-gray-600'
            : 'bg-white border-gray-300 text-gray-500 hover:text-blue-600 hover:bg-gray-50'
            }`}
          title="Import Bible (.xml)"
        >
          <Upload className="w-4 h-4" />
        </label>
      </div>

      {/* Search */}
      <div className={`p-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
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
            className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm ${darkMode
              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
          />
          {searching && (
            <Loader2 className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          )}
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className={`mt-2 max-h-48 overflow-y-auto rounded-lg border ${darkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-white'
            }`}>
            {searchResults.map((result, idx) => (
              <button
                key={`${result.reference}-${idx}`}
                onClick={() => handleSearchResultClick(result)}
                className={`w-full p-2 text-left text-sm border-b last:border-b-0 ${darkMode ? 'border-gray-600 hover:bg-gray-600' : 'border-gray-100 hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{result.reference}</div>
                  {result.bibleName && (
                    <div className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 font-bold uppercase tracking-wider">
                      {result.bibleName}
                    </div>
                  )}
                </div>
                <div className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {result.text}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Current Selection Display */}
      {activeReference && selectedVerses[0]?.length > 0 && (
        <div className={`p-3 border-b ${darkMode ? 'border-gray-700 bg-blue-900/30' : 'border-gray-200 bg-blue-50'}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-sm font-medium">{getFormattedReference()}</div>
            <button
              onClick={() => {
                const text = getVerseText();
                const reference = getFormattedReference();
                if (onSelectVerse) {
                  onSelectVerse({ reference, text, bible: currentBible?.name });
                }
              }}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
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

      {/* Books List */}
      <div className="flex-1 overflow-y-auto">
        {books.map((book) => (
          <div key={book.number}>
            <button
              onClick={() => handleBookToggle(book.number)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:${darkMode ? 'bg-gray-700' : 'bg-gray-50'
                } ${activeReference?.book === book.number
                  ? darkMode ? 'bg-blue-900/50' : 'bg-blue-50'
                  : ''}`}
            >
              {expandedBooks[book.number]
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />
              }
              <span className="truncate">{book.name}</span>
            </button>

            {expandedBooks[book.number] && (
              <div className="pl-6">
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
                    className={`px-3 py-1 text-xs hover:${darkMode ? 'bg-gray-700' : 'bg-gray-50'
                      } ${activeReference?.book === book.number && activeReference?.chapters?.[0] === String(chapter.number)
                        ? darkMode ? 'bg-blue-900/50' : 'bg-blue-50'
                        : ''}`}
                  >
                    Ch. {chapter.number}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Current Chapter Verses */}
      {currentChapter && (
        <div className={`p-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {currentBook?.name} {activeReference?.chapters?.[0]}
          </div>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {currentChapter.verses.map((verse) => (
              <button
                key={verse.number}
                onClick={() => handleVerseSelect(currentBook.number, currentChapter.number, verse.number, verse.text)}
                className={`w-8 h-8 rounded text-xs font-medium transition-colors ${selectedVerses[0]?.includes(verse.number)
                  ? 'bg-blue-600 text-white'
                  : darkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {verse.number}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bible History Section */}
      {bibleHistory.length > 0 && (
        <div className={`flex-shrink-0 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 bg-gray-800/50' : 'text-gray-500 hover:text-gray-700 bg-gray-50'
              }`}
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Recent Verses
            </div>
            {showHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {showHistory && (
            <div className={`max-h-48 overflow-y-auto p-2 grid grid-cols-1 gap-1.5 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
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
                  className={`flex flex-col items-start p-3 rounded-xl text-left transition-all border ${darkMode
                    ? 'hover:bg-gray-700 text-gray-200 border-gray-700'
                    : 'hover:bg-gray-50 text-gray-800 border-gray-100 hover:border-gray-200'
                    }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="text-sm font-semibold truncate">{entry.reference}</div>
                    <div className="text-[10px] opacity-60 font-bold uppercase">{entry.bibleName}</div>
                  </div>
                  <div className="text-xs opacity-70 line-clamp-2 w-full mt-1.5 leading-relaxed">{entry.text}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
