import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, ChevronRight, BookOpen } from 'lucide-react';
import useBibleStore from '../../context/BibleStore';
import { searchBible } from 'shared/bible';

export default function BibleBrowser({
  activeBibleId,
  activeReference,
  selectedVerses,
  onSelectBible,
  onSelectReference,
  onSelectVerses,
  searchQuery,
  onSearchResults,
  darkMode
}) {
  const { bibles, bibleMetadata } = useBibleStore();
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [verses, setVerses] = useState([]);

  const currentBible = bibles[activeBibleId];

  useEffect(() => {
    if (!activeBibleId || !currentBible) {
      setBooks([]);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setBooks(currentBible.books || []);
      setLoading(false);
    }, 10);
  }, [activeBibleId, currentBible]);

  useEffect(() => {
    if (!activeReference?.book || !currentBible) {
      setChapters([]);
      return;
    }
    const book = currentBible.books.find(b => b.number === activeReference.book);
    setChapters(book?.chapters || []);
  }, [activeReference?.book, activeBibleId, currentBible]);

  useEffect(() => {
    if (!activeReference?.book || !activeReference?.chapters?.length || !currentBible) {
      setVerses([]);
      return;
    }
    const book = currentBible.books.find(b => b.number === activeReference.book);
    const chapter = book?.chapters.find(c => c.number === parseInt(activeReference.chapters[0]));
    setVerses(chapter?.verses || []);
  }, [activeReference?.book, activeReference?.chapters, activeBibleId, currentBible]);

  useEffect(() => {
    if (searchQuery && searchQuery.length >= 3 && currentBible) {
      const results = searchBible(currentBible, searchQuery, bibles, 30);
      if (onSearchResults) {
        onSearchResults(results);
      }
    } else if (onSearchResults) {
      onSearchResults([]);
    }
  }, [searchQuery, currentBible, bibles, onSearchResults]);

  const handleBookSelect = useCallback((bookNumber) => {
    onSelectReference({
      id: activeBibleId,
      book: bookNumber,
      chapters: [],
      verses: []
    });
    onSelectVerses([[1]]);
  }, [activeBibleId, onSelectReference, onSelectVerses]);

  const handleChapterSelect = useCallback((chapterNumber) => {
    onSelectReference({
      ...activeReference,
      id: activeBibleId,
      chapters: [String(chapterNumber)]
    });
    onSelectVerses([[1]]);
  }, [activeReference, activeBibleId, onSelectReference, onSelectVerses]);

  const handleVerseSelect = useCallback((verseNumber) => {
    const current = selectedVerses[0] || [];
    const isSelected = current.includes(verseNumber);

    if (isSelected) {
      onSelectVerses([current.filter(v => v !== verseNumber)]);
    } else {
      onSelectVerses([[...current, verseNumber]]);
    }
  }, [selectedVerses, onSelectVerses]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className={`flex h-full ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
      <div className={`
        w-48 border-r overflow-y-auto p-2
        ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}
      `}>
        <div className={`
          text-xs font-medium uppercase tracking-wide px-2 py-1 mb-2
          ${darkMode ? 'text-gray-400' : 'text-gray-500'}
        `}>
          Bible Version
        </div>
        {Object.values(bibleMetadata).map((meta) => (
          <button
            key={meta.id}
            onClick={() => onSelectBible(meta.id)}
            className={`
              w-full px-3 py-2 text-left rounded-lg text-sm mb-1 transition-colors
              ${activeBibleId === meta.id
                ? 'bg-blue-600 text-white'
                : darkMode
                  ? 'hover:bg-gray-800 text-gray-300'
                  : 'hover:bg-gray-200 text-gray-700'}
            `}
          >
            {meta.name}
          </button>
        ))}
        {Object.keys(bibleMetadata).length === 0 && (
          <p className={`text-xs px-3 py-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Import a Bible to get started
          </p>
        )}
      </div>

      <div className={`
        w-56 border-r overflow-y-auto p-2
        ${darkMode ? 'border-gray-700' : 'border-gray-200'}
      `}>
        <div className={`
          text-xs font-medium uppercase tracking-wide px-2 py-1 mb-2
          ${darkMode ? 'text-gray-400' : 'text-gray-500'}
        `}>
          Books
        </div>
        {books.map((book) => (
          <button
            key={book.number}
            onClick={() => handleBookSelect(book.number)}
            className={`
              w-full px-3 py-2 text-left rounded-lg text-sm mb-1 transition-colors truncate
              ${activeReference?.book === book.number
                ? 'bg-blue-600 text-white'
                : darkMode
                  ? 'hover:bg-gray-800 text-gray-300'
                  : 'hover:bg-gray-200 text-gray-700'}
            `}
            title={book.name}
          >
            {book.name}
          </button>
        ))}
      </div>

      <div className={`
        w-20 border-r overflow-y-auto p-2
        ${darkMode ? 'border-gray-700' : 'border-gray-200'}
      `}>
        <div className={`
          text-xs font-medium uppercase tracking-wide px-2 py-1 mb-2
          ${darkMode ? 'text-gray-400' : 'text-gray-500'}
        `}>
          Ch
        </div>
        {chapters.map((chapter) => (
          <button
            key={chapter.number}
            onClick={() => handleChapterSelect(chapter.number)}
            className={`
              w-full px-2 py-2 text-center rounded-lg text-sm mb-1 transition-colors
              ${activeReference?.chapters?.includes(String(chapter.number))
                ? 'bg-blue-600 text-white'
                : darkMode
                  ? 'hover:bg-gray-800 text-gray-300'
                  : 'hover:bg-gray-200 text-gray-700'}
            `}
          >
            {chapter.number}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col">
        <div className={`
          text-xs font-medium uppercase tracking-wide px-2 py-1 mb-2
          ${darkMode ? 'text-gray-400' : 'text-gray-500'}
        `}>
          Verses
        </div>
        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1">
          {verses.map((verse) => (
            <button
              key={verse.number}
              onClick={() => handleVerseSelect(verse.number)}
              className={`
                w-full rounded-xl border p-3 text-left transition-colors
                ${selectedVerses[0]?.includes(verse.number)
                  ? 'bg-blue-600 text-white border-blue-500'
                  : darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-gray-200'}
              `}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`
                  text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                  ${selectedVerses[0]?.includes(verse.number)
                    ? 'bg-white/20 text-white'
                    : darkMode
                      ? 'bg-gray-700 text-gray-200'
                      : 'bg-gray-200 text-gray-700'}
                `}>
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
      </div>
    </div>
  );
}
