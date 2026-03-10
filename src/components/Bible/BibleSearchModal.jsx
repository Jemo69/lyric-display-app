import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, BookOpen, Loader2 } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import useToast from '../../hooks/useToast';
import { parseBibleFromFile } from '../../shared/bible';
import BibleBrowser from './BibleBrowser';
import BibleImportModal from './BibleImportModal';

const TABS = {
  BROWSE: 'browse',
  SEARCH: 'search',
  IMPORT: 'import'
};

export default function BibleSearchModal({ isOpen, onClose, onSelectVerses, darkMode }) {
  const [activeTab, setActiveTab] = useState(TABS.BROWSE);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

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
    getBibleById
  } = useBibleStore();

  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      setActiveTab(TABS.BROWSE);
      setQuery('');
      setSearchResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!activeBibleId && Object.keys(bibleMetadata).length > 0) {
      const firstId = Object.keys(bibleMetadata)[0];
      setActiveBible(firstId);
    }
  }, [activeBibleId, bibleMetadata, setActiveBible]);

  const handleImportBible = useCallback(async (file) => {
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

      setActiveTab(TABS.BROWSE);
    } catch (error) {
      showToast({
        title: 'Import failed',
        message: error.message || 'Could not parse Bible file',
        variant: 'error'
      });
      throw error;
    }
  }, [addBible, setActiveBible, showToast]);

  const handleSearchResultClick = useCallback((result) => {
    setReference({
      id: activeBibleId,
      book: result.book,
      chapters: [String(result.chapter)],
      verses: [[result.verse]]
    });
    setSelectedVerses([[result.verse]]);
    setActiveTab(TABS.BROWSE);
  }, [activeBibleId, setReference, setSelectedVerses]);

  const handleSelect = useCallback(() => {
    if (!activeReference) return;

    const bible = getBibleById(activeBibleId);
    const reference = getFormattedReference();
    const text = getVerseText();

    if (onSelectVerses) {
      onSelectVerses({
        reference,
        text,
        bible: bible?.name || ''
      });
    }
    onClose();
  }, [activeReference, activeBibleId, getBibleById, getFormattedReference, getVerseText, onSelectVerses, onClose]);

  const handleSelectBible = useCallback((id) => {
    setActiveBible(id);
  }, [setActiveBible]);

  const handleSelectReference = useCallback((ref) => {
    setReference(ref);
  }, [setReference]);

  const handleSelectVerses = useCallback((verses) => {
    setSelectedVerses(verses);
  }, [setSelectedVerses]);

  const handleSearchResults = useCallback((results) => {
    setSearchResults(results);
    setSearching(false);
  }, []);

  const handleQueryChange = useCallback((e) => {
    setQuery(e.target.value);
    if (e.target.value.length >= 3) {
      setSearching(true);
    }
  }, []);

  if (!isOpen) return null;

  const formattedReference = getFormattedReference();
  const hasSelection = activeReference && selectedVerses[0]?.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className={`
        relative w-[90vw] max-w-4xl h-[700px] flex flex-col
        rounded-2xl border shadow-2xl
        ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}
      `}>
        <div className={`
          flex items-center justify-between px-6 py-4 border-b
          ${darkMode ? 'border-gray-800' : 'border-gray-200'}
        `}>
          <div>
            <h2 className="text-lg font-semibold">Bible Verses</h2>
            <p className="text-xs text-gray-500">
              Search and select Bible verses to display
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-md transition-colors ${darkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 px-6 py-3 border-b">
          {[
            { id: TABS.BROWSE, label: 'Browse' },
            { id: TABS.SEARCH, label: 'Search' },
            { id: TABS.IMPORT, label: 'Import Bible' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === TABS.BROWSE && (
            <BibleBrowser
              activeBibleId={activeBibleId}
              activeReference={activeReference}
              selectedVerses={selectedVerses}
              onSelectBible={handleSelectBible}
              onSelectReference={handleSelectReference}
              onSelectVerses={handleSelectVerses}
              searchQuery={query}
              onSearchResults={handleSearchResults}
              darkMode={darkMode}
            />
          )}

          {activeTab === TABS.SEARCH && (
            <div className="p-6 h-full flex flex-col">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="Search Bible verses (min 3 characters)..."
                  className={`
                    w-full pl-10 pr-4 py-3 rounded-lg border
                    ${darkMode
                      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}
                  `}
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />
                )}
              </div>

              <div className="mt-4 flex-1 overflow-y-auto">
                {!query && (
                  <p className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Enter a search term to find verses
                  </p>
                )}

                {query && query.length < 3 && (
                  <p className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Enter at least 3 characters to search
                  </p>
                )}

                {query.length >= 3 && searchResults.length === 0 && !searching && (
                  <p className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    No results found for "{query}"
                  </p>
                )}

                {searchResults.map((result, index) => (
                  <button
                    key={`${result.reference}-${index}`}
                    onClick={() => handleSearchResultClick(result)}
                    className={`
                      w-full p-3 text-left border-b rounded-lg mb-2 transition-colors
                      ${darkMode ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-100 hover:bg-gray-50'}
                    `}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{result.reference}</div>
                      {result.bibleName && (
                        <div className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 font-bold uppercase tracking-wider">
                          {result.bibleName}
                        </div>
                      )}
                    </div>
                    <div className={`text-sm mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {result.text}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === TABS.IMPORT && (
            <BibleImportModal
              onImport={handleImportBible}
              darkMode={darkMode}
            />
          )}
        </div>

        <div className={`
          flex items-center justify-between px-6 py-4 border-t
          ${darkMode ? 'border-gray-800' : 'border-gray-200'}
        `}>
          <div className="text-sm">
            <span className="text-gray-500">Selected: </span>
            <span className={`font-medium ${hasSelection ? (darkMode ? 'text-white' : 'text-gray-900') : 'text-gray-400'}`}>
              {formattedReference || 'No verses selected'}
            </span>
          </div>
          <button
            onClick={handleSelect}
            disabled={!hasSelection}
            className={`
              px-6 py-2 rounded-lg font-medium transition-colors
              ${!hasSelection
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'}
            `}
          >
            Send to Display
          </button>
        </div>
      </div>
    </div>
  );
}
