import { useEffect, useRef } from 'react';
import { getHotkeyManager } from '@tanstack/hotkeys';
import { createLogger } from '../../utils/logger';
import { hasValidTimestamps } from '../../utils/timestampHelpers';
import useHotkeysStore from '../../context/HotkeysStore';
import { DEFAULT_BINDINGS } from '../../constants/hotkeyBindings';
import { cycleTranslation, getSearchTargetForContentType } from '../../utils/shortcutHelpers';

const log = createLogger('KeyboardShortcuts');

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

const focusSearchInput = (selector) => {
  const el = document.querySelector(selector);
  if (el) {
    el.focus();
    el.select();
  }
  return !!el;
};

export const useKeyboardShortcuts = ({
  hasLyrics,
  lyrics,
  lyricsTimestamps,
  selectedLine,
  handleLineSelect,
  handleToggle,
  handleAutoplayToggle,
  handleIntelligentAutoplayToggle,
  handleClearOutput,
  handleOutputTabSwitch,
  searchQuery,
  clearSearch,
  totalMatches,
  highlightedLineIndex,
  handleOpenSetlist,
  handleOpenOnlineLyricsSearch,
  handleOpenFileDialog,
  handleCreateNewSong,
  handleEditLyrics,
  handleAddToSetlist,
  handleNavigateSetlistPrevious,
  handleNavigateSetlistNext,
  setContentType,
  // New props for smart search + translation cycling
  contentType = 'lyrics',
  activeBibleId = null,
  bibleIds = [],
  setActiveBible,
}) => {
  const bindings = useHotkeysStore((s) => s.bindings);

  // Keep the latest props/state in a ref so registered handlers never go stale
  // without needing to re-register on every render.
  const latest = useRef({});
  latest.current = {
    hasLyrics,
    lyrics,
    lyricsTimestamps,
    selectedLine,
    handleLineSelect,
    handleToggle,
    handleAutoplayToggle,
    handleIntelligentAutoplayToggle,
    handleClearOutput,
    handleOutputTabSwitch,
    searchQuery,
    clearSearch,
    totalMatches,
    highlightedLineIndex,
    handleOpenSetlist,
    handleOpenOnlineLyricsSearch,
    handleOpenFileDialog,
    handleCreateNewSong,
    handleEditLyrics,
    handleAddToSetlist,
    handleNavigateSetlistPrevious,
    handleNavigateSetlistNext,
    setContentType,
    contentType,
    activeBibleId,
    bibleIds,
    setActiveBible,
  };

  const navigateLine = (direction) => {
    const l = latest.current;
    if (!l.hasLyrics || !l.lyrics || l.lyrics.length === 0) return;
    const currentIndex = l.selectedLine ?? -1;
    let newIndex;
    if (direction === 'first') newIndex = 0;
    else if (direction === 'last') newIndex = l.lyrics.length - 1;
    else if (direction === 'up') newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
    else newIndex = currentIndex < l.lyrics.length - 1 ? currentIndex + 1 : l.lyrics.length - 1;

    if (newIndex !== currentIndex) {
      l.handleLineSelect(newIndex);
      window.dispatchEvent(new CustomEvent('scroll-to-lyric-line', { detail: { lineIndex: newIndex } }));
    }
  };

  // Register every shortcut via the singleton HotkeyManager, reading live bindings.
  const bindingsKey = JSON.stringify(bindings);

  useEffect(() => {
    const manager = getHotkeyManager();
    const l = () => latest.current;
    const handles = [];

    const register = (combo, handler, options) => {
      if (!combo) return;
      handles.push(manager.register(combo, handler, options));
    };

    // --- File operations ---
    register(bindings.openFile || DEFAULT_BINDINGS.openFile, (e) => {
      if (isTyping()) return;
      e.preventDefault();
      l().handleOpenFileDialog?.();
    });
    register(bindings.newSong || DEFAULT_BINDINGS.newSong, (e) => {
      if (isTyping()) return;
      e.preventDefault();
      l().handleCreateNewSong?.();
    });
    register(bindings.editLyrics || DEFAULT_BINDINGS.editLyrics, (e) => {
      const ctx = l();
      if (isTyping()) return;
      if (!ctx.hasLyrics) return;
      e.preventDefault();
      ctx.handleEditLyrics?.();
    });
    register(bindings.openSetlist || DEFAULT_BINDINGS.openSetlist, (e) => {
      e.preventDefault();
      l().handleOpenSetlist?.();
    });
    register(bindings.openOnlineSearch || DEFAULT_BINDINGS.openOnlineSearch, (e) => {
      e.preventDefault();
      l().handleOpenOnlineLyricsSearch?.();
    });
    register(bindings.addToSetlist || DEFAULT_BINDINGS.addToSetlist, (e) => {
      if (isTyping()) return;
      e.preventDefault();
      l().handleAddToSetlist?.();
    });

    // --- Search & navigation ---
    register(bindings.focusSearch || DEFAULT_BINDINGS.focusSearch, (e) => {
      e.preventDefault();
      const target = getSearchTargetForContentType(l().contentType);
      focusSearchInput(target === 'bible' ? '[data-bible-search-input]' : '[data-search-input]');
    });
    register(bindings.clearSearch || DEFAULT_BINDINGS.clearSearch, (e) => {
      const ctx = l();
      if (!ctx.searchQuery) return;
      e.preventDefault();
      ctx.clearSearch?.();
      const el = document.activeElement;
      if (el && el.hasAttribute('data-search-input')) el.blur();
    }, { preventDefault: false, stopPropagation: false });
    register(bindings.jumpToMatch || DEFAULT_BINDINGS.jumpToMatch, (e) => {
      const el = document.activeElement;
      if (!el || !el.hasAttribute('data-search-input')) return;
      const ctx = l();
      if (ctx.totalMatches > 0 && ctx.highlightedLineIndex !== null) {
        e.preventDefault();
        ctx.handleLineSelect(ctx.highlightedLineIndex);
        window.dispatchEvent(new CustomEvent('scroll-to-lyric-line', {
          detail: { lineIndex: ctx.highlightedLineIndex },
        }));
      }
    }, { ignoreInputs: false, preventDefault: false, stopPropagation: false });
    register(bindings.switchToBible || DEFAULT_BINDINGS.switchToBible, (e) => {
      if (isTyping()) return;
      e.preventDefault();
      l().setContentType?.('bible');
    });
    register(bindings.focusBibleSearch || DEFAULT_BINDINGS.focusBibleSearch, (e) => {
      e.preventDefault();
      l().setContentType?.('bible');
      setTimeout(() => focusSearchInput('[data-bible-search-input]'), 50);
    });
    register(bindings.cycleTranslation || DEFAULT_BINDINGS.cycleTranslation, (e) => {
      e.preventDefault();
      const ctx = l();
      if (ctx.contentType !== 'bible') ctx.setContentType?.('bible');
      const next = cycleTranslation(ctx.activeBibleId, ctx.bibleIds);
      if (next && next !== ctx.activeBibleId) ctx.setActiveBible?.(next);
    });
    register(bindings.showShortcuts || DEFAULT_BINDINGS.showShortcuts, (e) => {
      e.preventDefault();
      window.dispatchEvent(new Event('show-keyboard-shortcuts'));
    });
    register(bindings.prevSetlistSong || DEFAULT_BINDINGS.prevSetlistSong, (e) => {
      e.preventDefault();
      l().handleNavigateSetlistPrevious?.();
    });
    register(bindings.nextSetlistSong || DEFAULT_BINDINGS.nextSetlistSong, (e) => {
      e.preventDefault();
      l().handleNavigateSetlistNext?.();
    });

    // --- Playback control ---
    register(bindings.toggleAutoplay || DEFAULT_BINDINGS.toggleAutoplay, (e) => {
      e.preventDefault();
      l().handleAutoplayToggle?.();
    });
    register(bindings.toggleIntelligentAutoplay || DEFAULT_BINDINGS.toggleIntelligentAutoplay, (e) => {
      e.preventDefault();
      const ctx = l();
      if (hasValidTimestamps(ctx.lyricsTimestamps)) ctx.handleIntelligentAutoplayToggle?.();
      else ctx.handleAutoplayToggle?.();
    });
    register(bindings.toggleDisplayOutput || DEFAULT_BINDINGS.toggleDisplayOutput, (e) => {
      e.preventDefault();
      l().handleToggle?.();
    });
    register(bindings.clearOutput || DEFAULT_BINDINGS.clearOutput, (e) => {
      if (isTyping()) return;
      e.preventDefault();
      l().handleClearOutput?.();
    });

    // --- Lyric navigation ---
    register(bindings.prevLine || DEFAULT_BINDINGS.prevLine, (e) => {
      e.preventDefault();
      navigateLine('up');
    });
    register(bindings.nextLine || DEFAULT_BINDINGS.nextLine, (e) => {
      e.preventDefault();
      navigateLine('down');
    });
    register(bindings.firstLine || DEFAULT_BINDINGS.firstLine, (e) => {
      e.preventDefault();
      navigateLine('first');
    });
    register(bindings.lastLine || DEFAULT_BINDINGS.lastLine, (e) => {
      e.preventDefault();
      navigateLine('last');
    });

    // --- Output tabs ---
    register(bindings.output1 || DEFAULT_BINDINGS.output1, (e) => {
      e.preventDefault();
      l().handleOutputTabSwitch?.('output1');
    });
    register(bindings.output2 || DEFAULT_BINDINGS.output2, (e) => {
      e.preventDefault();
      l().handleOutputTabSwitch?.('output2');
    });
    register(bindings.stage || DEFAULT_BINDINGS.stage, (e) => {
      e.preventDefault();
      l().handleOutputTabSwitch?.('stage');
    });

    // --- Vim-style line navigation (fixed, not remappable) ---
    let lastGKeyTime = 0;
    register('j', (e) => {
      e.preventDefault();
      navigateLine('down');
    });
    register('k', (e) => {
      e.preventDefault();
      navigateLine('up');
    });
    register('G', (e) => {
      e.preventDefault();
      navigateLine('last');
    });
    register('g', (e) => {
      e.preventDefault();
      const now = Date.now();
      if (lastGKeyTime && now - lastGKeyTime < 500) {
        lastGKeyTime = 0;
        navigateLine('first');
      } else {
        lastGKeyTime = now;
      }
    });

    log.info('Registered keyboard shortcuts', { count: handles.length });

    return () => {
      handles.forEach((h) => h.unregister?.());
    };
    // Re-register only when bindings change; handlers read fresh state via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingsKey]);
};
