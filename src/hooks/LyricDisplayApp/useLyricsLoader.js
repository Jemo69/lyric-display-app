import { useCallback } from 'react';
import useLyricsStore from '../../context/LyricsStore';
import { createLogger } from '../../utils/logger';
import { parseLyricsFileAsync } from '../../utils/asyncLyricsParser';
import { detectArtistFromFilename } from '../../utils/artistDetection';

const log = createLogger('LyricsLoader');

export const useLyricsLoader = ({
  setLyrics,
  setLyricsSections = () => { },
  setLineToSection = () => { },
  setRawLyricsContent,
  setLyricsTimestamps,
  selectLine,
  setLyricsFileName,
  setSongMetadata,
  emitLyricsLoad,
  emitFileNameUpdate,
  emitContentLoaded,
  socket,
  showToast
}) => {
  const processLoadedLyrics = useCallback(async ({ content, fileName, filePath, fileType, enableOnlineLyricsSplitting: fileEnableSplit, enableIntelligentSplitting: fileEnableIntelligent, enableSplitting: fileEnableSplitting }, context = {}) => {
    log.debug('Processing loaded lyrics:', fileName || 'untitled');
    const sanitize = (value) => (value || '')
      .replace(/[<>:"/\\|?*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    try {
      const requestedType = (fileType || '').toLowerCase() === 'lrc' ? 'lrc' : ((fileType || '').toLowerCase() === 'txt' ? 'txt' : null);
      const providedName = sanitize(fileName);
      const fallbackName = sanitize(context.fallbackFileName);
      const baseName = providedName || fallbackName || 'Imported Lyrics';
      const hasExtension = /\.[a-z0-9]{2,5}$/i.test(providedName);
      const inferredType = (!requestedType && providedName && providedName.toLowerCase().endsWith('.lrc')) ? 'lrc' : 'txt';
      const finalType = requestedType || inferredType;
      const extension = finalType === 'lrc' ? '.lrc' : '.txt';
      const finalFileName = hasExtension ? providedName : `${baseName}${extension}`;

      const globalSplitting = useLyricsStore.getState().enableLyricSplitting ?? true;
      const explicitSplitFlag = fileEnableSplit ?? fileEnableIntelligent ?? fileEnableSplitting
        ?? context.enableOnlineLyricsSplitting ?? context.enableIntelligentSplitting ?? context.enableSplitting;
      const hasExplicit = explicitSplitFlag !== undefined;
      // Global is master switch: off means never split; on means honor explicit flag or default to on
      const enableSplitting = hasExplicit ? (globalSplitting && Boolean(explicitSplitFlag)) : globalSplitting;

      const parsed = await parseLyricsFileAsync(null, {
        rawText: content || '',
        fileType: finalType,
        name: finalFileName,
        path: filePath,
        enableSplitting,
        enableNormalGrouping: useLyricsStore.getState().autoGroupLines ?? true,
      });

      if (!parsed || !Array.isArray(parsed.processedLines)) {
        throw new Error('Invalid lyrics response');
      }

      const processedLines = parsed.processedLines;
      const rawText = parsed.rawText ?? (content || '');
      const timestamps = parsed.timestamps || [];
      const sections = parsed.sections || [];
      const lineToSection = parsed.lineToSection || {};
      const finalBaseName = (finalFileName || '').replace(/\.(txt|lrc)$/i, '');

      const store = useLyricsStore.getState();
      if (store.loadSong) {
        store.loadSong({
          title: finalBaseName,
          fileName: finalBaseName,
          rawText: finalType === 'lrc' ? (content || rawText) : rawText,
          lines: processedLines,
          sections,
          lineToSection,
          timestamps,
          metadata: null,
          selectedLine: null,
        });
        setRawLyricsContent(finalType === 'lrc' ? (content || rawText) : rawText);
        selectLine(null);
      } else {
        setLyrics(processedLines);
        if (setLyricsSections) setLyricsSections(sections);
        if (setLineToSection) setLineToSection(lineToSection);
        setRawLyricsContent(finalType === 'lrc' ? (content || rawText) : rawText);
        setLyricsTimestamps(timestamps);
        selectLine(null);
        setLyricsFileName(finalBaseName);
        store.setContentMode('song');
      }

      if (!context.providerId) {
        const detected = detectArtistFromFilename(finalBaseName);
        const metadata = {
          title: detected.title || finalBaseName,
          artists: detected.artist ? [detected.artist] : [],
          album: null,
          year: null,
          lyricLines: processedLines.length,
          origin: finalType === 'lrc' ? 'Local (.lrc)' : 'Local (.txt)',
          filePath: filePath || null
        };
        setSongMetadata(metadata);
      }

      emitLyricsLoad(processedLines);
      // queued emits handle pending connection — use provider queue when available
      try {
        if (finalBaseName) {
          if (emitFileNameUpdate) emitFileNameUpdate(finalBaseName);
          else if (socket && socket.connected) socket.emit('fileNameUpdate', finalBaseName);
          if (emitContentLoaded) emitContentLoaded({ kind: 'song', fileName: finalBaseName });
          else if (socket && socket.connected) socket.emit('contentLoaded', { kind: 'song', fileName: finalBaseName });
        }
        if (socket && socket.connected) socket.emit('lyricsTimestampsUpdate', timestamps);
        else if (window.__controlSocketContext?.socket?.connected) window.__controlSocketContext.socket.emit('lyricsTimestampsUpdate', timestamps);
      } catch {}

      try {
        if (filePath && window?.electronAPI?.addRecentFile) {
          await window.electronAPI.addRecentFile(filePath);
        }
      } catch { }

      showToast({
        title: context.toastTitle || 'Lyrics loaded',
        message: context.toastMessage || `${finalType === 'lrc' ? 'LRC' : 'Text'}: ${finalBaseName}`,
        variant: context.toastVariant || 'success',
      });

      return true;
    } catch (err) {
      log.error('Failed to load lyrics content:', err);
      showToast({
        title: context.errorTitle || 'Failed to load lyrics',
        message: context.errorMessage || 'The lyrics could not be processed.',
        variant: 'error',
      });
      return false;
    }
  }, [emitLyricsLoad, emitFileNameUpdate, emitContentLoaded, selectLine, setLyrics, setRawLyricsContent, setLyricsFileName, setSongMetadata, setLyricsTimestamps, showToast, socket]);

  const handleImportFromLibrary = useCallback(async ({ providerId, providerName, lyric }, lyrics) => {
    log.debug('Importing from library:', providerName || providerId);
    if (!lyric || typeof lyric.content !== 'string' || !lyric.content.trim()) {
      showToast({
        title: 'Import failed',
        message: 'The selected provider did not return lyric content.',
        variant: 'error',
      });
      return false;
    }

    const baseNamePieces = [lyric.title || 'Untitled Song', lyric.artist || providerName || providerId];
    const fallbackFileName = baseNamePieces.filter(Boolean).join(' - ');

    const hasLrcTimestamps = /^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(lyric.content.trim());
    const fileType = hasLrcTimestamps ? 'lrc' : 'txt';

    const success = await processLoadedLyrics(
      {
        content: lyric.content,
        fileName: lyric.title || fallbackFileName,
        fileType,
        enableOnlineLyricsSplitting: !hasLrcTimestamps,
      },
      {
        fallbackFileName,
        toastTitle: 'Lyrics imported',
        toastMessage: `Loaded from ${providerName || providerId}.`,
        providerId,
      }
    );

    if (success) {
      const album = lyric.album || lyric.albumName || null;

      const metadata = {
        title: lyric.title || 'Untitled Song',
        artists: lyric.artist ? [lyric.artist] : [],
        album: album,
        year: lyric.year || lyric.metadata?.year || null,
        lyricLines: lyrics.length,
        origin: providerName || providerId,
        filePath: null
      };
      setSongMetadata(metadata);
    }

    return success;
  }, [processLoadedLyrics, showToast, setSongMetadata]);

  return {
    processLoadedLyrics,
    handleImportFromLibrary
  };
};
