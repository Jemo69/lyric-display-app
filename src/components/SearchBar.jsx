import React from 'react';
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, X, Monitor, Eye, EyeOff } from 'lucide-react';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SearchBar');

const SearchBar = ({
  darkMode,
  searchQuery,
  onSearch,
  totalMatches,
  currentMatchIndex,
  onPrev,
  onNext,
  onClear,
  isOutputOn,
  onToggleOutput,
  showSelectedLineHighlight,
  onToggleSelectedLineHighlight,
}) => {
  logger.info('SearchBar mounted');
  return (
    <div className="w-full">
      <div className="relative">
        <Input
          type="text"
          placeholder="Search loaded lyrics..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          data-search-input
          className={`border rounded-md w-full pr-3 ${darkMode
            ? 'border-gray-600 bg-gray-800 text-white placeholder-gray-400'
            : 'border-gray-300 bg-white'
            }`}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 min-h-9">
        <div className="flex items-center gap-1">
          {searchQuery && totalMatches > 0 && <>
            <button onClick={onPrev} className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} title="Previous match (Shift+Up)" aria-label="Previous match"><ChevronUp className="w-4 h-4" /></button>
            <button onClick={onNext} className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} title="Next match (Shift+Down)" aria-label="Next match"><ChevronDown className="w-4 h-4" /></button>
          </>}
          {searchQuery && <>
            <span className={`ml-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{totalMatches > 0 ? `Result ${currentMatchIndex + 1} of ${totalMatches}` : 'No matches found'}</span>
            <button onClick={onClear} className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} title="Clear search" aria-label="Clear search"><X className="w-4 h-4" /></button>
          </>}
        </div>
        <div className="flex items-center gap-2">
          {onToggleSelectedLineHighlight && <button type="button" onClick={() => onToggleSelectedLineHighlight(!showSelectedLineHighlight)} className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${showSelectedLineHighlight ? (darkMode ? 'border-blue-500/50 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25' : 'border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100') : (darkMode ? 'border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700' : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100')}`} title={showSelectedLineHighlight ? 'Hide selected lyric highlight' : 'Show selected lyric highlight'}>{showSelectedLineHighlight ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}{showSelectedLineHighlight ? 'Highlight on' : 'Highlight off'}</button>}
          {onToggleOutput && <button type="button" onClick={() => onToggleOutput(!isOutputOn)} className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${isOutputOn ? (darkMode ? 'border-green-500/50 bg-green-500/15 text-green-300 hover:bg-green-500/25' : 'border-green-600 bg-green-50 text-green-700 hover:bg-green-100') : (darkMode ? 'border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100')}`} title={isOutputOn ? 'Hide output displays' : 'Show output displays'}><Monitor className="w-3.5 h-3.5" />{isOutputOn ? 'Display live' : 'Display hidden'}</button>}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
