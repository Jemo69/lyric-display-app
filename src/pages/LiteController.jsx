import React, { useRef, useEffect, useCallback } from 'react';
import { useLyricsState, useOutputState, useDarkModeState } from '../hooks/useStoreSelectors';
import { useControlSocket } from '../context/ControlSocketProvider';

const ConnectionDot = ({ connected }) => (
  <span
    role="img"
    aria-label={connected ? 'Connected' : 'Disconnected'}
    className={`inline-block w-3 h-3 rounded-full transition-colors duration-200 ${
      connected ? 'bg-[#8FCE72]' : 'bg-[#E06C75]'
    }`}
    title={connected ? 'Connected' : 'Disconnected'}
  />
);

const LiteController = () => {
  const { lyrics, lyricsFileName, selectedLine, selectLine } = useLyricsState();
  const { isOutputOn, setIsOutputOn } = useOutputState();
  const { darkMode } = useDarkModeState();
  const { emitOutputToggle, emitLineUpdate, isConnected } = useControlSocket();

  const listRef = useRef(null);
  const hasLyrics = lyrics && lyrics.length > 0;

  const handleLineSelect = useCallback(
    (index) => {
      selectLine(index);
      emitLineUpdate(index);
    },
    [selectLine, emitLineUpdate]
  );

  const handlePrev = useCallback(() => {
    if (!hasLyrics || selectedLine <= 0) return;
    handleLineSelect(selectedLine - 1);
  }, [hasLyrics, selectedLine, handleLineSelect]);

  const handleNext = useCallback(() => {
    if (!hasLyrics || selectedLine >= lyrics.length - 1) return;
    handleLineSelect(selectedLine + 1);
  }, [hasLyrics, selectedLine, lyrics, handleLineSelect]);

  const handleToggleOutput = useCallback(() => {
    const next = !isOutputOn;
    setIsOutputOn(next);
    emitOutputToggle(next);
  }, [isOutputOn, setIsOutputOn, emitOutputToggle]);

  useEffect(() => {
    if (!listRef.current || selectedLine == null) return;
    const el = listRef.current.children[selectedLine];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedLine]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleToggleOutput();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePrev, handleNext, handleToggleOutput]);

  const currentLine = hasLyrics && selectedLine != null ? lyrics[selectedLine] : '';

  return (
    <div className="flex flex-col h-screen bg-[#111231] text-white select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#282946] flex-shrink-0">
        <div className="flex items-center gap-2">
          <ConnectionDot connected={isConnected} />
          <span className="text-sm text-[#D8DEE0] truncate max-w-[60vw]">
            {hasLyrics ? lyricsFileName : 'Lite Mode'}
          </span>
        </div>
        <button
          onClick={handleToggleOutput}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-150 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DDBD3] ${
            isOutputOn
              ? 'bg-[#8FCE72] text-[#111231]'
              : 'bg-[#282946] text-[#D8DEE0]'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isOutputOn ? 'bg-[#D8DEE0]' : 'bg-[#55464B]'
            }`}
          />
          {isOutputOn ? 'ON' : 'OFF'}
        </button>
      </header>

      {/* Current Lyric Display */}
      <div className="flex-shrink-0 px-4 py-6 min-h-[120px] flex items-center justify-center">
        {hasLyrics && currentLine ? (
          <p className="text-2xl sm:text-3xl font-bold text-center leading-snug px-2">
            {currentLine}
          </p>
        ) : (
          <p className="text-lg text-[#55464B] text-center">No lyrics loaded</p>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 flex-shrink-0 border-t border-[#282946]">
        <button
          onClick={handlePrev}
          disabled={!hasLyrics || selectedLine <= 0}
          className="flex-1 max-w-[140px] py-3 rounded-lg text-base font-semibold transition-colors duration-150 min-h-[44px] disabled:opacity-30 disabled:cursor-not-allowed bg-[#1A1C40] text-[#D8DEE0] border border-[#282946] hover:bg-[#282946] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DDBD3]"
        >
          Previous
        </button>
        <span className="text-sm text-[#55464B] tabular-nums min-w-[60px] text-center">
          {hasLyrics ? `${(selectedLine ?? 0) + 1} / ${lyrics.length}` : '0 / 0'}
        </span>
        <button
          onClick={handleNext}
          disabled={!hasLyrics || selectedLine >= lyrics.length - 1}
          className="flex-1 max-w-[140px] py-3 rounded-lg text-base font-semibold transition-colors duration-150 min-h-[44px] disabled:opacity-30 disabled:cursor-not-allowed bg-[#1A1C40] text-[#D8DEE0] border border-[#282946] hover:bg-[#282946] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DDBD3]"
        >
          Next
        </button>
      </div>

      {/* Scrollable Lyric List */}
      {hasLyrics && (
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto border-t border-[#282946]"
        >
          {lyrics.map((line, i) => (
            <button
              key={i}
              onClick={() => handleLineSelect(i)}
              aria-current={i === selectedLine ? 'true' : undefined}
              className={`w-full text-left px-4 py-3 text-base transition-colors duration-100 min-h-[44px] border-b border-[#282946]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DDBD3] ${
                i === selectedLine
                  ? 'bg-[#7DDBD3]/15 text-[#7DDBD3] font-semibold'
                  : 'bg-[#1A1C40] text-[#D8DEE0] hover:bg-[#282946]'
              }`}
            >
              {line}
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <footer className="px-4 py-2 text-center text-xs text-[#55464B] border-t border-[#282946] flex-shrink-0">
        Lite Mode — minimal controller
      </footer>
    </div>
  );
};

export default LiteController;
