import React from 'react';
import { createLogger } from '../utils/logger';
import { getLineSearchText } from '../utils/parseLyrics';
import { logSearchEvent } from '../utils/searchAnalytics';

const log = createLogger('Search');

const useSearch = (lyrics) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [highlightedLineIndex, setHighlightedLineIndex] = React.useState(null);
  const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
  const [totalMatches, setTotalMatches] = React.useState(0);
  const [allMatchIndices, setAllMatchIndices] = React.useState([]);

  const containerRef = React.useRef(null);

  const findAllMatches = React.useCallback((query) => {
    if (!query.trim() || !lyrics || lyrics.length === 0) return [];
    const matchIndices = [];
    lyrics.forEach((line, index) => {
      const text = getLineSearchText(line);
      if (text.toLowerCase().includes(query.toLowerCase())) matchIndices.push(index);
    });
    return matchIndices;
  }, [lyrics]);

  const scrollToLine = React.useCallback((lineIndex) => {
    window.dispatchEvent(new CustomEvent('scroll-to-lyric-line', {
      detail: { lineIndex }
    }));
  }, []);

  const navigateToMatch = React.useCallback((matchIndex) => {
    if (allMatchIndices.length === 0) return;
    const clamped = Math.max(0, Math.min(matchIndex, allMatchIndices.length - 1));
    const lineIndex = allMatchIndices[clamped];
    setCurrentMatchIndex(clamped);
    setHighlightedLineIndex(lineIndex);
    scrollToLine(lineIndex);
  }, [allMatchIndices, scrollToLine]);

  const navigateToNextMatch = React.useCallback(() => {
    if (allMatchIndices.length === 0) return;
    const nextIndex = currentMatchIndex >= allMatchIndices.length - 1 ? 0 : currentMatchIndex + 1;
    navigateToMatch(nextIndex);
  }, [allMatchIndices, currentMatchIndex, navigateToMatch]);

  const navigateToPreviousMatch = React.useCallback(() => {
    if (allMatchIndices.length === 0) return;
    const prevIndex = currentMatchIndex <= 0 ? allMatchIndices.length - 1 : currentMatchIndex - 1;
    navigateToMatch(prevIndex);
  }, [allMatchIndices, currentMatchIndex, navigateToMatch]);

  const handleSearch = React.useCallback((query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setHighlightedLineIndex(null);
      setCurrentMatchIndex(0);
      setTotalMatches(0);
      setAllMatchIndices([]);
      return;
    }
    // Timed inline so the telemetry call below can report latency without
    // adding any await to the search path.
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const matchIndices = findAllMatches(query);
    log.debug('Search query:', query, '- found', matchIndices.length, 'matches');
    // Fire-and-forget: queues a sanitized event, flushes on idle. Never
    // awaited — the highlight/scroll below runs regardless of storage.
    logSearchEvent({
      surface: 'lyrics-local',
      query,
      resultCount: matchIndices.length,
      topResults: matchIndices.slice(0, 5).map((lineIndex) => ({ lineIndex })),
      latencyMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
    });
    setAllMatchIndices(matchIndices);
    setTotalMatches(matchIndices.length);
    if (matchIndices.length > 0) {
      setCurrentMatchIndex(0);
      setHighlightedLineIndex(matchIndices[0]);
      scrollToLine(matchIndices[0]);
    } else {
      setHighlightedLineIndex(null);
      setCurrentMatchIndex(0);
    }
  }, [findAllMatches, scrollToLine]);

  const clearSearch = React.useCallback(() => {
    setSearchQuery('');
    setHighlightedLineIndex(null);
    setCurrentMatchIndex(0);
    setTotalMatches(0);
    setAllMatchIndices([]);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.shiftKey && searchQuery && allMatchIndices.length > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateToPreviousMatch();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigateToNextMatch();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, allMatchIndices, navigateToNextMatch, navigateToPreviousMatch]);

  return {
    containerRef,
    searchQuery,
    highlightedLineIndex,
    currentMatchIndex,
    totalMatches,
    allMatchIndices,
    handleSearch,
    clearSearch,
    navigateToNextMatch,
    navigateToPreviousMatch,
  };
};

export default useSearch;