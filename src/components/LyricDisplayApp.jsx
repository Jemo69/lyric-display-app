import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FolderOpen, FileText, FilePlusCorner, Edit, ListMusic, Globe, Plus, Info, FileMusic, Play, ChevronDown, Square, Sparkles, Volume2, VolumeX, Moon, Sun, Settings, BookText, Database } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLyricsState, useOutputState, useOutput1Settings, useOutput2Settings, useStageSettings, useDarkModeState, useSetlistState, useIsDesktopApp, useAutoplaySettings, useIntelligentAutoplayState } from '../hooks/useStoreSelectors';
import { useControlSocket } from '../context/ControlSocketProvider';
import useFileUpload from '../hooks/useFileUpload';
import useMultipleFileUpload from '../hooks/useMultipleFileUpload';
import useSetlistLoader from '../hooks/SetlistModal/useSetlistLoader';
import AuthStatusIndicator from './AuthStatusIndicator';
import ConnectionBackoffBanner from './ConnectionBackoffBanner';
import LyricsList from './LyricsList';
import MobileLayout from './MobileLayout';
import SetlistModal from './SetlistModal';
import OnlineLyricsSearchModal from './OnlineLyricsSearchModal';
import RccgTphbSongModal from './RccgTphbSongModal';
import EasyWorshipImportModal from './EasyWorshipImportModal';
import DraftApprovalModal from './DraftApprovalModal';
import OutputSettingsPanel from './OutputSettingsPanel';
import { Switch } from "@/components/ui/switch";
import useDarkModeSync from '../hooks/useDarkModeSync';
import useMenuShortcuts from '../hooks/LyricDisplayApp/useMenuShortcuts';
import useSearch from '../hooks/useSearch';
import useOutputSettings from '../hooks/LyricDisplayApp/useOutputSettings';
import useSetlistActions from '../hooks/LyricDisplayApp/useSetlistActions';
import SearchBar from './SearchBar';
import useToast from '../hooks/useToast';
import useModal from '../hooks/useModal';
import { Tooltip } from '@/components/ui/tooltip';
import { hasValidTimestamps } from '../utils/timestampHelpers';
import { parseLrcContent } from '../../shared/lyricsParsing.js';
import { useAutoplayManager } from '../hooks/useAutoplayManager';
import { useSyncOutputs } from '../hooks/useSyncOutputs';
import { useLyricsLoader } from '../hooks/LyricDisplayApp/useLyricsLoader';
import { useKeyboardShortcuts } from '../hooks/LyricDisplayApp/useKeyboardShortcuts';
import { useElectronListeners } from '../hooks/LyricDisplayApp/useElectronListeners';
import { useResponsiveWidth } from '../hooks/LyricDisplayApp/useResponsiveWidth';
import { useDragAndDrop } from '../hooks/LyricDisplayApp/useDragAndDrop';
import useBibleStore from '../context/BibleStore';
import BibleControlPanel from './Bible/BibleControlPanel';
import { Input } from '@/components/ui/input';

const LyricDisplayApp = () => {
    const navigate = useNavigate();

    const { isOutputOn, setIsOutputOn } = useOutputState();
    const { lyrics, lyricsFileName, rawLyricsContent, selectedLine, lyricsTimestamps, pendingSavedVersion, selectLine, setLyrics, setLyricsSections, setLineToSection, setRawLyricsContent, setLyricsFileName, setSongMetadata, setLyricsTimestamps, clearPendingSavedVersion, addToLyricsHistory, songMetadata } = useLyricsState();
    const { settings: output1Settings, updateSettings: updateOutput1Settings } = useOutput1Settings();
    const { settings: output2Settings, updateSettings: updateOutput2Settings } = useOutput2Settings();
    const { settings: stageSettings, updateSettings: updateStageSettings } = useStageSettings();
    const { darkMode, setDarkMode } = useDarkModeState();
    const { setSetlistModalOpen, setlistFiles, setSetlistFiles } = useSetlistState();
    const isDesktopApp = useIsDesktopApp();
    const { settings: autoplaySettings, setSettings: setAutoplaySettings } = useAutoplaySettings();
    const { hasSeenIntelligentAutoplayInfo, setHasSeenIntelligentAutoplayInfo } = useIntelligentAutoplayState();

    const [contentType, setContentType] = useState('lyrics');
    const [newOutputKey, setNewOutputKey] = useState('');
    const [newOutputType, setNewOutputType] = useState('regular');
    const [customOutputs, setCustomOutputs] = useState(() => {
        try {
            const saved = JSON.parse(window.localStorage.getItem('custom-output-tabs') || '[]');
            return saved.map((item) => typeof item === 'string' ? { key: item, type: 'regular' } : item).filter((item) => item?.key);
        } catch {
            return [];
        }
    });
    const { addBible, setActiveBible, activeBibleId, activeReference, selectedVerses, getVerseText, getFormattedReference, bibles, addToBibleHistory } = useBibleStore();


    useDarkModeSync(darkMode, setDarkMode);

    const fileInputRef = useRef(null);
    const scrollableSettingsRef = useRef(null);
    useMenuShortcuts(navigate, fileInputRef);

    const { socket, emitOutputToggle, emitLineUpdate, emitLyricsLoad, emitStyleUpdate, emitSetlistAdd, emitSetlistClear, emitSetlistLoad, emitAutoplayStateUpdate, connectionStatus, authStatus, forceReconnect, refreshAuthToken, isConnected, isAuthenticated, ready } = useControlSocket();

    const handleBibleVerseSelect = useCallback((verseData) => {
        const formattedVerse = `${verseData.text}\n\n${verseData.reference}`;
        const lines = [formattedVerse];
        setLyrics(lines);
        setLyricsFileName(verseData.reference);
        setRawLyricsContent(formattedVerse);

        // Tell output windows to load these lyrics
        emitLyricsLoad(lines);
        
        // Update filename on server and other clients
        if (socket && socket.connected) {
            socket.emit('fileNameUpdate', verseData.reference);
        }

        // Add to Bible history
        addToBibleHistory(verseData.reference, verseData.text);

        // Auto-add to setlist if not already there
        if (isDesktopApp && !setlistFiles.some(f => f.displayName === verseData.reference)) {
            emitSetlistAdd([{
                name: `${verseData.reference}.txt`,
                content: formattedVerse,
                lastModified: Date.now(),
                metadata: { type: 'bible', reference: verseData.reference }
            }]);
        }

        // Automatically select the verse
        selectLine(0);
        emitLineUpdate(0);
    }, [setLyrics, setLyricsFileName, setRawLyricsContent, selectLine, emitLineUpdate, emitLyricsLoad, addToBibleHistory, isDesktopApp, setlistFiles, emitSetlistAdd]);

    const handleFileUpload = useFileUpload();
    const handleMultipleFileUpload = useMultipleFileUpload();
    const loadSetlist = useSetlistLoader({ setlistFiles, setSetlistFiles, emitSetlistAdd, emitSetlistClear });

    const { activeTab, setActiveTab } = useOutputSettings({
        output1Settings,
        output2Settings,
        stageSettings,
        updateOutputSettings: (output, settings) => {
            if (output === 'output1') {
                updateOutput1Settings(settings);
            } else if (output === 'output2') {
                updateOutput2Settings(settings);
            } else if (output === 'stage') {
                updateStageSettings(settings);
            }
            emitStyleUpdate(output, settings);
            trackAction('settings_changed');
        },
        emitStyleUpdate,
    });

    const [onlineLyricsModalOpen, setOnlineLyricsModalOpen] = React.useState(false);
    const [rccgTphbModalOpen, setRccgTphbModalOpen] = React.useState(false);
    const [easyWorshipModalOpen, setEasyWorshipModalOpen] = React.useState(false);
    const headerContainerRef = useRef(null);

    const { containerRef: lyricsContainerRef, searchQuery, highlightedLineIndex, currentMatchIndex, totalMatches, handleSearch: baseHandleSearch, clearSearch, navigateToNextMatch, navigateToPreviousMatch } = useSearch(lyrics);

    const trackAction = React.useCallback(() => { }, []);

    React.useEffect(() => {
        const handleResetScroll = () => {
            if (lyricsContainerRef.current) {
                lyricsContainerRef.current.scrollTop = 0;
            }
        };

        window.addEventListener('reset-lyrics-scroll', handleResetScroll);
        return () => window.removeEventListener('reset-lyrics-scroll', handleResetScroll);
    }, [lyricsContainerRef]);

    const handleSearch = React.useCallback((query) => {
        baseHandleSearch(query);
        if (query) {
            trackAction('search_performed');
        }
    }, [baseHandleSearch, trackAction]);

    const hasLyrics = lyrics && lyrics.length > 0;
    const { showToast, muted, toggleMute } = useToast();
    const { showModal } = useModal();

    const { isDragging, dragFileCount, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } = useDragAndDrop({
        handleFileUpload,
        handleMultipleFileUpload,
        loadSetlist,
        clearSearch,
        trackAction,
        showToast
    });

    const { useIconOnlyButtons } = useResponsiveWidth(headerContainerRef, hasLyrics);

    React.useEffect(() => {
        if (!hasLyrics) return;
        if (hasValidTimestamps(lyricsTimestamps)) return;
        if (!rawLyricsContent) return;

        const looksLikeLrc = /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(rawLyricsContent);
        if (!looksLikeLrc) return;

        try {
            const parsed = parseLrcContent(rawLyricsContent);
            const lengthsMatch = Array.isArray(parsed?.processedLines) && parsed.processedLines.length === lyrics.length;

            if (lengthsMatch && Array.isArray(parsed.timestamps) && parsed.timestamps.length > 0) {
                setLyricsTimestamps(parsed.timestamps);
                if (parsed.sections && parsed.lineToSection) {
                    setLyricsSections(parsed.sections);
                    setLineToSection(parsed.lineToSection);
                }
            }
        } catch (err) {
            console.warn('Failed to regenerate timestamps from stored lyrics:', err);
        }
    }, [hasLyrics, lyrics, lyricsTimestamps, rawLyricsContent, setLyricsSections, setLineToSection, setLyricsTimestamps]);

    const {
        autoplayActive,
        intelligentAutoplayActive,
        remoteAutoplayActive,
        handleAutoplayToggle,
        handleIntelligentAutoplayToggle,
        handleOpenAutoplaySettings
    } = useAutoplayManager({
        lyrics,
        lyricsTimestamps,
        selectedLine,
        autoplaySettings,
        setAutoplaySettings,
        selectLine,
        emitLineUpdate,
        showToast,
        showModal,
        hasLyrics,
        lyricsFileName,
        hasSeenIntelligentAutoplayInfo,
        setHasSeenIntelligentAutoplayInfo,
        emitAutoplayStateUpdate,
        isConnected,
        isAuthenticated,
        ready,
        clientType: 'desktop'
    });

    const { handleSyncOutputs } = useSyncOutputs({
        isConnected,
        isAuthenticated,
        ready,
        lyrics,
        selectedLine,
        isOutputOn,
        emitLyricsLoad,
        emitLineUpdate,
        emitOutputToggle,
        emitStyleUpdate,
        output1Settings,
        output2Settings,
        showToast
    });

    const { processLoadedLyrics, handleImportFromLibrary: baseHandleImportFromLibrary } = useLyricsLoader({
        setLyrics,
        setLyricsSections,
        setLineToSection,
        setRawLyricsContent,
        setLyricsTimestamps,
        selectLine,
        setLyricsFileName,
        setSongMetadata,
        emitLyricsLoad,
        socket,
        showToast
    });

    const handleImportFromLibrary = React.useCallback(async (params) => {
        const result = await baseHandleImportFromLibrary(params, lyrics);
        if (result) {
            trackAction('song_loaded');
        }
        return result;
    }, [baseHandleImportFromLibrary, lyrics, trackAction]);

    useElectronListeners({
        processLoadedLyrics,
        showToast,
        setEasyWorshipModalOpen,
        setlistFiles,
        setSetlistFiles,
        emitSetlistAdd,
        emitSetlistClear
    });

    React.useEffect(() => {
        if (window.__pendingLyricsLoad) {
            const pendingData = window.__pendingLyricsLoad;
            delete window.__pendingLyricsLoad;

            processLoadedLyrics(pendingData);
        }
    }, [processLoadedLyrics]);

    const handledSavedVersionRef = React.useRef(null);

    React.useEffect(() => {
        if (!pendingSavedVersion) return;

        const key = pendingSavedVersion.createdAt || `${pendingSavedVersion.filePath || ''}-${pendingSavedVersion.fileName || ''}`;
        if (handledSavedVersionRef.current === key) {
            clearPendingSavedVersion();
            return;
        }
        handledSavedVersionRef.current = key;

        const { rawText, fileName: savedBaseName, filePath, extension } = pendingSavedVersion;
        const safeBaseName = savedBaseName || lyricsFileName || 'lyrics';
        const savedFileName = `${safeBaseName}.${extension || 'txt'}`;

        const loadSavedVersion = async () => {
            try {
                await processLoadedLyrics(
                    {
                        content: rawText || '',
                        fileName: savedFileName,
                        filePath: filePath || null,
                        fileType: extension || 'txt'
                    },
                    { fallbackFileName: savedFileName }
                );
            } catch (error) {
                console.error('Failed to reload saved lyrics from pending version:', error);
                showToast({
                    title: 'Load failed',
                    message: 'Could not load the last saved lyrics file.',
                    variant: 'error'
                });
            }
        };

        showToast({
            title: 'Load saved lyrics',
            message: 'You recently saved a lyrics file. Do you want to load that into the control panel?',
            variant: 'info',
            duration: 7000,
            actions: [
                { label: 'Load lyrics', onClick: loadSavedVersion }
            ]
        });

        clearPendingSavedVersion();
    }, [pendingSavedVersion, clearPendingSavedVersion, processLoadedLyrics, rawLyricsContent, lyricsFileName, showToast]);

    const openFileDialog = async () => {
        if (!isAuthenticated) {
            showToast({
                title: 'Authentication Required',
                message: 'Please wait for authentication to complete before loading files.',
                variant: 'warning'
            });
            return;
        }

        try {
            if (window?.electronAPI?.loadLyricsFile) {
                const result = await window.electronAPI.loadLyricsFile();
                if (result && result.success && result.content) {
                    const payload = { content: result.content, fileName: result.fileName, filePath: result.filePath };
                    window.dispatchEvent(new CustomEvent('lyrics-opened', { detail: payload }));
                    return;
                }
                if (result && result.canceled) return;
            }
        } catch { }
        fileInputRef.current?.click();
    };

    const handleCreateNewSong = () => {
        navigate('/new-song?mode=new');
    };

    const handleEditLyrics = () => {
        navigate('/new-song?mode=edit');
    };

    const handleOpenSetlist = () => {
        setSetlistModalOpen(true);
    };

    const handleOpenOnlineLyricsSearch = () => {
        setOnlineLyricsModalOpen(true);
    };

    const handleCloseOnlineLyricsSearch = () => {
        setOnlineLyricsModalOpen(false);
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.ldset')) {
            await loadSetlist(file);
            return;
        }

        const success = await handleFileUpload(file);
        if (success) {
            clearSearch();
            trackAction('song_loaded');
        }
    };

    const handleLineSelect = (index) => {
        selectLine(index);
        emitLineUpdate(index);
        trackAction('lyrics_edited');

        // Add current song to history when a line is selected (projected)
        if (songMetadata?.title) {
            addToLyricsHistory(songMetadata, lyrics);
        }

        // Auto-add to setlist if not already there
        if (isDesktopApp && lyricsFileName && !setlistFiles.some(f => f.displayName === lyricsFileName)) {
            const hasLrcTimestamps = lyricsTimestamps && lyricsTimestamps.length > 0;
            const extension = hasLrcTimestamps ? '.lrc' : '.txt';
            emitSetlistAdd([{
                name: `${lyricsFileName}${extension}`,
                content: rawLyricsContent,
                lastModified: Date.now(),
                metadata: songMetadata || { title: lyricsFileName }
            }]);
        }
    };

    const handleToggle = () => {
        if (!isConnected || !isAuthenticated || !ready) {
            showToast({
                title: 'Connection Required',
                message: 'Cannot control output - not connected or authenticated.',
                variant: 'warning'
            });
            return;
        }

        setIsOutputOn(!isOutputOn);
        emitOutputToggle(!isOutputOn);
        if (!isOutputOn) {
            trackAction('output_opened');
        }
    };

    const handleClearOutput = React.useCallback(() => {
        selectLine(null);
        emitLineUpdate(null);
    }, [emitLineUpdate, selectLine]);

    const handleOutputTabSwitch = React.useCallback((tab) => {
        if (tab !== 'output1' && tab !== 'output2' && tab !== 'stage' && !customOutputs.some((output) => output.key === tab)) return;
        setActiveTab(tab);
        if (scrollableSettingsRef.current) {
            scrollableSettingsRef.current.scrollTop = 0;
        }
    }, [setActiveTab, customOutputs]);

    const handleAddCustomOutput = React.useCallback(() => {
        const key = (newOutputKey || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!key) return;
        const normalizedKey = key.startsWith('output') ? key : `output${key}`;
        setCustomOutputs((prev) => {
            if (prev.some((output) => output.key === normalizedKey) || ['output1', 'output2', 'stage'].includes(normalizedKey)) return prev;
            const next = [...prev, { key: normalizedKey, type: newOutputType }];
            window.localStorage.setItem('custom-output-tabs', JSON.stringify(next));
            return next;
        });
        setActiveTab(normalizedKey);
        setNewOutputKey('');
    }, [newOutputKey, newOutputType, setActiveTab]);

    const handleDeleteCustomOutput = React.useCallback((outputKey) => {
        if (!customOutputs.some((output) => output.key === outputKey)) return;
        const confirmed = window.confirm(`Delete ${outputKey.replace(/^output/, 'Output ')}? This removes the tab and its saved settings from this control panel.`);
        if (!confirmed) return;

        setCustomOutputs((prev) => {
            const next = prev.filter((output) => output.key !== outputKey);
            window.localStorage.setItem('custom-output-tabs', JSON.stringify(next));
            return next;
        });
        window.localStorage.removeItem(`${outputKey}Settings`);
        setActiveTab('output1');
    }, [customOutputs, setActiveTab]);

    const { handleAddToSetlist, disabled: addDisabled, title: addTitle } = useSetlistActions(emitSetlistAdd);

    const handleNavigateSetlistPrevious = React.useCallback(() => {
        if (!hasLyrics || setlistFiles.length === 0) {
            showToast({
                title: 'No files in setlist',
                message: 'Add songs to your setlist to use navigation',
                variant: 'info'
            });
            return;
        }

        const currentIndex = setlistFiles.findIndex(file => file.displayName === lyricsFileName);
        if (currentIndex === -1) {
            showToast({
                title: 'Not in setlist',
                message: 'Current song is not in the setlist',
                variant: 'info'
            });
            return;
        }

        const previousIndex = currentIndex > 0 ? currentIndex - 1 : setlistFiles.length - 1;
        const previousFile = setlistFiles[previousIndex];

        if (previousFile) {
            emitSetlistLoad(previousFile.id);
        }
    }, [hasLyrics, setlistFiles, lyricsFileName, emitSetlistLoad, showToast]);

    const handleNavigateSetlistNext = React.useCallback(() => {
        if (!hasLyrics || setlistFiles.length === 0) {
            showToast({
                title: 'No files in setlist',
                message: 'Add songs to your setlist to use navigation',
                variant: 'info'
            });
            return;
        }

        const currentIndex = setlistFiles.findIndex(file => file.displayName === lyricsFileName);
        if (currentIndex === -1) {
            showToast({
                title: 'Not in setlist',
                message: 'Current song is not in the setlist',
                variant: 'info'
            });
            return;
        }

        const nextIndex = currentIndex < setlistFiles.length - 1 ? currentIndex + 1 : 0;
        const nextFile = setlistFiles[nextIndex];

        if (nextFile) {
            emitSetlistLoad(nextFile.id);
        }
    }, [hasLyrics, setlistFiles, lyricsFileName, emitSetlistLoad, showToast]);

    useKeyboardShortcuts({
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
        handleOpenFileDialog: openFileDialog,
        handleCreateNewSong,
        handleEditLyrics,
        handleAddToSetlist,
        handleNavigateSetlistPrevious,
        handleNavigateSetlistNext,
        setContentType
    });

    const iconButtonClass = (disabled = false) => {
        const base = 'p-2.5 rounded-lg font-medium transition-colors';
        if (disabled) {
            return `${base} ${darkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50' : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'}`;
        }
        return `${base} ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;
    };

    if (!isDesktopApp) {
        return <MobileLayout />;
    }

    return (
        <>
            <ConnectionBackoffBanner darkMode={darkMode} />
            {isDesktopApp && <DraftApprovalModal darkMode={darkMode} />}
            <div className={`flex h-full font-sans ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
                {/* Left Sidebar - Control Panel */}
                <div className={`w-[420px] flex-shrink-0 shadow-lg flex flex-col h-full ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                    {/* Fixed Header Section */}
                    <div className={`flex-shrink-0 p-6 pb-0 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                {/* Content Type Toggle */}
                                <div className={`flex rounded-lg overflow-hidden border ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                                    <button
                                        onClick={() => setContentType('lyrics')}
                                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${contentType === 'lyrics'
                                            ? darkMode ? 'bg-blue-600 text-white' : 'bg-black text-white'
                                            : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        Songs
                                    </button>
                                    <button
                                        onClick={() => setContentType('bible')}
                                        className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${contentType === 'bible'
                                            ? darkMode ? 'bg-blue-600 text-white' : 'bg-black text-white'
                                            : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        <BookText className="w-3 h-3" />
                                        Bible
                                    </button>
                                </div>

                                {/* Online Lyrics Search Button */}
                                <Tooltip content={<span>Search and import lyrics from online providers - <strong>Ctrl+Shift+O</strong></span>} side="bottom">
                                    <button
                                        className={iconButtonClass(false)}
                                        onClick={handleOpenOnlineLyricsSearch}
                                    >
                                        <Globe className="w-4 h-4" />
                                    </button>
                                </Tooltip>

                                {/* RCCGTPHB Song DB Button */}
                                <Tooltip content="Search the RCCGTPHB song database" side="bottom">
                                    <button
                                        className={iconButtonClass(false)}
                                        onClick={() => setRccgTphbModalOpen(true)}
                                    >
                                        <Database className="w-4 h-4" />
                                    </button>
                                </Tooltip>

                                {/* Setlist Button */}
                                <Tooltip content={<span>View and manage your song setlist (up to 50 songs) - <strong>Ctrl+Shift+S</strong></span>} side="bottom">
                                    <button
                                        className={iconButtonClass(false)}
                                        onClick={handleOpenSetlist}
                                    >
                                        <ListMusic className="w-4 h-4" />
                                    </button>
                                </Tooltip>

                                {/* Sync Outputs Button - Icon Only */}
                                <Tooltip content="Force refresh all output displays with current state" side="bottom">
                                    <button
                                        disabled={!isConnected || !isAuthenticated || !ready}
                                        className={iconButtonClass(!isConnected || !isAuthenticated || !ready)}
                                        onClick={handleSyncOutputs}
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                </Tooltip>

                                {/* Mute Toast Sounds Button */}
                                <Tooltip content={muted ? "Unmute toast sounds" : "Mute toast sounds"} side="bottom">
                                    <button
                                        className={iconButtonClass(false)}
                                        onClick={toggleMute}
                                    >
                                        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                    </button>
                                </Tooltip>

                                {/* Dark Mode Toggle Button */}
                                <Tooltip content={darkMode ? "Switch to light mode" : "Switch to dark mode"} side="bottom">
                                    <button
                                        className={iconButtonClass(false)}
                                        onClick={() => {
                                            const next = !darkMode;
                                            setDarkMode(next);
                                            window.electronAPI?.setDarkMode?.(next);
                                            window.electronAPI?.syncNativeDarkMode?.(next);
                                        }}
                                    >
                                        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                    </button>
                                </Tooltip>

                                {/* User Preferences Button */}
                                <Tooltip content="User preferences" side="bottom">
                                    <button
                                        className={iconButtonClass(false)}
                                        onClick={() => {
                                            showToast({
                                                title: 'User Preferences',
                                                message: 'User preferences panel coming soon!',
                                                variant: 'info'
                                            });
                                        }}
                                    >
                                        <Settings className="w-4 h-4" />
                                    </button>
                                </Tooltip>

                                {/* Authentication Status Indicator */}
                                <AuthStatusIndicator
                                    authStatus={authStatus}
                                    connectionStatus={connectionStatus}
                                    onRetry={forceReconnect}
                                    onRefreshToken={refreshAuthToken}
                                    darkMode={darkMode}
                                />
                            </div>
                        </div>

                        {/* Load and Create Buttons */}
                        <div className="flex gap-3 mb-3">
                            <Tooltip content={<span>Load a .txt or .lrc lyrics file from your computer - <strong>Ctrl+O</strong></span>} side="right">
                                <button
                                    className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-400 to-purple-600 text-white rounded-xl font-medium hover:from-blue-500 hover:to-purple-700 transition-all duration-200 flex items-center justify-center gap-2"
                                    onClick={openFileDialog}
                                >
                                    <FolderOpen className="w-5 h-5" />
                                    Load lyrics file (.txt, .lrc)
                                </button>
                            </Tooltip>
                            <Tooltip content={<span>Open the song canvas to create new lyrics from scratch - <strong>Ctrl+N</strong></span>} side="left">
                                <button
                                    className={`h-[52px] w-[52px] rounded-xl font-medium transition-all duration-200 flex items-center justify-center ${darkMode
                                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                        }`}
                                    onClick={handleCreateNewSong}
                                >
                                    <FilePlusCorner className="w-5 h-5" />
                                </button>
                            </Tooltip>
                        </div>
                        <input
                            type="file"
                            accept=".txt,.lrc"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />

                        {/* Current File Indicator */}
                        {hasLyrics && (
                            <div className={`mb-6 text-sm font-semibold flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                <FileMusic className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{lyricsFileName}</span>
                            </div>
                        )}

                        {/* Output Toggle */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4 pl-4">
                                <Switch
                                    checked={isOutputOn}
                                    onCheckedChange={handleToggle}
                                    className={`
            scale-[1.8]
            ${darkMode
                                            ? "data-[state=checked]:bg-green-400 data-[state=unchecked]:bg-gray-600"
                                            : "data-[state=checked]:bg-black"}
          `}
                                />
                                <span className={`text-sm ml-5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                    {isOutputOn ? 'Display Output is ON' : 'Display Output is OFF'}
                                </span>
                            </div>

                            {/* Help trigger button */}
                            <Tooltip content="Control Panel Help" side="bottom">
                                <button
                                    onClick={() => {
                                        showModal({
                                            title: 'Control Panel Help',
                                            headerDescription: 'Master your LyricDisplay workflow with these essential tools',
                                            component: 'ControlPanelHelp',
                                            variant: 'info',
                                            size: 'large',
                                            dismissLabel: 'Got it'
                                        });
                                    }}
                                    className={`p-2 rounded-lg transition-colors ${darkMode
                                        ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                                        : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </button>
                            </Tooltip>
                        </div>

                        <div className={`border-t my-8 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>

                        {/* Output Tabs */}
                        <Tabs value={activeTab} onValueChange={handleOutputTabSwitch}>
                            <TabsList className={`w-full p-1.5 h-11 mb-8 gap-2 ${darkMode ? 'bg-gray-700 text-gray-300' : ''}`}>
                                <TabsTrigger value="output1" className={`flex-1 h-full text-sm min-w-0 ${darkMode ? 'data-[state=active]:bg-white data-[state=active]:text-gray-900' : 'data-[state=active]:bg-black data-[state=active]:text-white'}`}>
                                    Output 1
                                </TabsTrigger>
                                <TabsTrigger value="output2" className={`flex-1 h-full text-sm min-w-0 ${darkMode ? 'data-[state=active]:bg-white data-[state=active]:text-gray-900' : 'data-[state=active]:bg-black data-[state=active]:text-white'}`}>
                                    Output 2
                                </TabsTrigger>
                                <TabsTrigger value="stage" className={`flex-1 h-full text-sm min-w-0 ${darkMode ? 'data-[state=active]:bg-white data-[state=active]:text-gray-900' : 'data-[state=active]:bg-black data-[state=active]:text-white'}`}>
                                    Stage
                                </TabsTrigger>
                                {customOutputs.map((output) => (
                                    <TabsTrigger key={output.key} value={output.key} className={`flex-1 h-full text-sm min-w-0 ${darkMode ? 'data-[state=active]:bg-white data-[state=active]:text-gray-900' : 'data-[state=active]:bg-black data-[state=active]:text-white'}`}>
                                        {output.key.replace(/^output/, 'Output ')}{output.type === 'stage' ? ' Stage' : ''}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <div className="mt-3 flex gap-2">
                            <Input
                                value={newOutputKey}
                                onChange={(event) => setNewOutputKey(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') handleAddCustomOutput();
                                }}
                                placeholder="Add output, e.g. output4"
                                className={`h-9 text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder:text-gray-400' : ''}`}
                            />
                            <select
                                value={newOutputType}
                                onChange={(event) => setNewOutputType(event.target.value)}
                                className={`h-9 rounded-md border px-2 text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                            >
                                <option value="regular">Normal</option>
                                <option value="stage">Stage</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleAddCustomOutput}
                                className={`h-9 px-3 rounded-md text-sm font-medium transition-colors ${darkMode ? 'bg-white text-gray-900 hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'}`}
                            >
                                Add
                            </button>
                            {customOutputs.some((output) => output.key === activeTab) && (
                                <button
                                    type="button"
                                    onClick={() => handleDeleteCustomOutput(activeTab)}
                                    className={`h-9 px-3 rounded-md text-sm font-medium transition-colors ${darkMode ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-400/30' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'}`}
                                >
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Scrollable Settings Panel */}
                    <div
                        ref={scrollableSettingsRef}
                        className="flex-1 overflow-y-auto px-6 relative"
                        onScroll={(e) => {
                            const scrollTop = e.currentTarget.scrollTop;
                            const shadow = e.currentTarget.previousElementSibling;
                            if (shadow) {
                                if (scrollTop > 10) {
                                    shadow.classList.add('shadow-md');
                                } else {
                                    shadow.classList.remove('shadow-md');
                                }
                            }
                        }}
                    >
                        {/* Tab Content */}
                        <div>
                            {activeTab === 'output1' && (
                                <OutputSettingsPanel
                                    outputKey="output1"
                                    settings={output1Settings}
                                    updateSettings={(settings) => {
                                        updateOutput1Settings(settings);
                                        emitStyleUpdate('output1', settings);
                                    }}
                                />
                            )}

                            {activeTab === 'output2' && (
                                <OutputSettingsPanel
                                    outputKey="output2"
                                    settings={output2Settings}
                                    updateSettings={(settings) => {
                                        updateOutput2Settings(settings);
                                        emitStyleUpdate('output2', settings);
                                    }}
                                />
                            )}

                            {activeTab === 'stage' && (
                                <OutputSettingsPanel
                                    outputKey="stage"
                                    settings={stageSettings}
                                    updateSettings={(settings) => {
                                        updateStageSettings(settings);
                                        emitStyleUpdate('stage', settings);
                                    }}
                                />
                            )}

                            {customOutputs.some((output) => output.key === activeTab) && (
                                <OutputSettingsPanel
                                    outputKey={activeTab}
                                    outputType={customOutputs.find((output) => output.key === activeTab)?.type || 'regular'}
                                />
                            )}
                        </div>
                        <div className="m-10"></div>
                    </div>
                </div>

                {/* Right Main Area */}
                <div className="flex-1 min-w-0 p-6 flex flex-col h-full">
                    {/* Fixed Header */}
                    <div className="mb-6 flex-shrink-0 min-w-0" ref={headerContainerRef}>
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                            </div>
                            {hasLyrics && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* Intelligent Autoplay Button */}
                                    {hasValidTimestamps(lyricsTimestamps) && (
                                        <Tooltip content={
                                            remoteAutoplayActive || autoplayActive
                                                ? "Autoplay is active"
                                                : intelligentAutoplayActive
                                                    ? "Stop intelligent autoplay"
                                                    : "Start timestamp-based autoplay"
                                        } side="bottom">
                                            <button
                                                onClick={handleIntelligentAutoplayToggle}
                                                disabled={remoteAutoplayActive || autoplayActive}
                                                className={`p-2 rounded-lg text-xs font-medium transition-all ${remoteAutoplayActive || autoplayActive
                                                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-60'
                                                    : intelligentAutoplayActive
                                                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white'
                                                        : darkMode
                                                            ? 'bg-gradient-to-r from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 text-purple-300 border border-purple-500/30'
                                                            : 'bg-gradient-to-r from-purple-100 to-blue-100 hover:from-purple-200 hover:to-blue-200 text-purple-700 border border-purple-300'
                                                    }`}
                                                title={intelligentAutoplayActive ? "Stop intelligent autoplay" : "Start intelligent autoplay"}
                                            >
                                                <Sparkles className="w-4 h-4" />
                                            </button>
                                        </Tooltip>
                                    )}

                                    {/* Autoplay Button */}
                                    <Tooltip content={
                                        remoteAutoplayActive || intelligentAutoplayActive
                                            ? "Autoplay is active"
                                            : autoplayActive
                                                ? "Stop autoplay"
                                                : "Start automatic lyric progression"
                                    } side="bottom">
                                        <div className="relative flex">
                                            <button
                                                onClick={handleAutoplayToggle}
                                                disabled={remoteAutoplayActive || intelligentAutoplayActive}
                                                className={`flex items-center gap-2 text-xs font-medium transition-all ${remoteAutoplayActive || intelligentAutoplayActive
                                                    ? useIconOnlyButtons
                                                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed px-2 py-2 rounded-lg opacity-60'
                                                        : 'bg-gray-400 text-gray-600 cursor-not-allowed px-4 py-2 rounded-lg opacity-60'
                                                    : autoplayActive
                                                        ? useIconOnlyButtons
                                                            ? 'bg-green-600 hover:bg-green-700 text-white px-2 py-2 rounded-lg'
                                                            : 'bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg'
                                                        : useIconOnlyButtons
                                                            ? darkMode
                                                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-2 rounded-l-lg'
                                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-2 rounded-l-lg'
                                                            : darkMode
                                                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-l-lg'
                                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-l-lg'
                                                    }`}
                                            >
                                                {autoplayActive ? (
                                                    <>
                                                        <Square className="w-4 h-4 flex-shrink-0 fill-current" />
                                                        {!useIconOnlyButtons && <span className="whitespace-nowrap">Autoplay</span>}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play className="w-4 h-4 flex-shrink-0" />
                                                        {!useIconOnlyButtons && <span className="whitespace-nowrap">Autoplay</span>}
                                                    </>
                                                )}
                                            </button>

                                            {/* Settings dropdown trigger */}
                                            {!autoplayActive && !remoteAutoplayActive && !intelligentAutoplayActive && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenAutoplaySettings();
                                                    }}
                                                    className={`flex items-center justify-center ${useIconOnlyButtons ? 'px-1.5' : 'px-2'} py-2 rounded-r-lg transition-colors border-l ${autoplayActive
                                                        ? 'bg-green-600 hover:bg-green-700 text-white border-green-500'
                                                        : darkMode
                                                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'
                                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300'
                                                        }`}
                                                    title="Autoplay settings"
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </Tooltip>

                                    {/* Add to Setlist Button */}
                                    <Tooltip content="Add current lyrics to your setlist for quick access during service" side="bottom">
                                        <button
                                            onClick={handleAddToSetlist}
                                            aria-disabled={addDisabled}
                                            className={`flex items-center gap-2 rounded-lg text-xs font-medium transition-colors ${addDisabled
                                                ? (darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400')
                                                : (darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-800')
                                                } ${useIconOnlyButtons ? 'px-2 py-2' : 'px-4 py-2'}`}
                                            title={addTitle}
                                            style={{ cursor: addDisabled ? 'not-allowed' : 'pointer', opacity: addDisabled ? 0.9 : 1 }}
                                        >
                                            <Plus className="w-4 h-4 flex-shrink-0" />
                                            {!useIconOnlyButtons && <span className="whitespace-nowrap overflow-hidden text-ellipsis">Add to Setlist</span>}
                                        </button>
                                    </Tooltip>

                                    {/* Edit Button */}
                                    <Tooltip content="Edit current lyrics in the song canvas editor" side="bottom">
                                        <button
                                            onClick={handleEditLyrics}
                                            className={`flex items-center gap-2 rounded-lg text-xs font-medium transition-colors ${darkMode
                                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                                                } ${useIconOnlyButtons ? 'px-2 py-2' : 'px-4 py-2'}`}
                                        >
                                            <Edit className="w-4 h-4 flex-shrink-0" />
                                            {!useIconOnlyButtons && <span className="whitespace-nowrap overflow-hidden text-ellipsis">Edit Lyrics</span>}
                                        </button>
                                    </Tooltip>

                                    {/* Song Info Button */}
                                    <Tooltip content="View song information" side="bottom">
                                        <button
                                            onClick={() => {
                                                showModal({
                                                    title: 'Song Information',
                                                    component: 'SongInfoModal',
                                                    variant: 'info',
                                                    size: 'sm',
                                                    dismissLabel: 'Close'
                                                });
                                            }}
                                            className={`p-2 rounded-lg transition-colors ${darkMode
                                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                                }`}
                                            title="Song Information"
                                        >
                                            <Info className="w-4 h-4" />
                                        </button>
                                    </Tooltip>
                                </div>
                            )}
                        </div>

                        {/* Search Bar */}
                        {hasLyrics && (
                            <div className="mt-3 w-full">
                                <SearchBar
                                    darkMode={darkMode}
                                    searchQuery={searchQuery}
                                    onSearch={handleSearch}
                                    totalMatches={totalMatches}
                                    currentMatchIndex={currentMatchIndex}
                                    onPrev={navigateToPreviousMatch}
                                    onNext={navigateToNextMatch}
                                    onClear={clearSearch}
                                />
                            </div>
                        )}
                    </div>

                    {/* Scrollable Content Area */}
                    <div className={`rounded-lg shadow-sm border flex-1 flex flex-col overflow-hidden relative ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
                        }`}>
                        {contentType === 'bible' ? (
                            <BibleControlPanel
                                darkMode={darkMode}
                                onSelectVerse={handleBibleVerseSelect}
                            />
                        ) : hasLyrics ? (
                            <div
                                ref={lyricsContainerRef}
                                className="flex-1 overflow-y-auto"
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragEnter={handleDragEnter}
                                onDragLeave={handleDragLeave}
                            >
                                <LyricsList
                                    searchQuery={searchQuery}
                                    highlightedLineIndex={highlightedLineIndex}
                                    onSelectLine={handleLineSelect}
                                />
                            </div>
                        ) : (
                            /* Empty State - Drag and Drop */
                            <div
                                className="flex-1 flex items-center justify-center p-4"
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragEnter={handleDragEnter}
                                onDragLeave={handleDragLeave}
                            >
                                <div className="text-center">
                                    <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-200'
                                        }`}>
                                        <FolderOpen className={`w-10 h-10 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
                                    </div>
                                    <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Drag and drop lyric files (.txt, .lrc) or setlists (.ldset) here
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Drag Overlay */}
                        {isDragging && (
                            <div
                                className={`absolute inset-0 flex items-center justify-center z-50 pointer-events-none ${darkMode ? 'bg-gray-900/90' : 'bg-gray-900/80'
                                    }`}
                            >
                                <div className="text-center px-8 py-10 rounded-2xl border-2 border-dashed max-w-md mx-auto"
                                    style={{
                                        borderColor: darkMode ? '#60a5fa' : '#3b82f6',
                                        backgroundColor: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
                                    }}
                                >
                                    <div className={`w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center ${darkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                                        }`}>
                                        {dragFileCount === 1 ? (
                                            <FileText className={`w-10 h-10 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                        ) : (
                                            <ListMusic className={`w-10 h-10 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                        )}
                                    </div>
                                    <h3 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                        {dragFileCount === 1 ? 'Drop to load file' : `Drop ${dragFileCount} files`}
                                    </h3>
                                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {dragFileCount === 1
                                            ? 'This file will be loaded into the app'
                                            : hasLyrics
                                                ? `These files will be added to your ${setlistFiles.length > 0 ? 'current' : ''} setlist`
                                                : 'These files will be added to your setlist'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Setlist Modal */}
                <SetlistModal />

                {/* Online Lyrics Search Modal */}
                <OnlineLyricsSearchModal
                    isOpen={onlineLyricsModalOpen}
                    onClose={handleCloseOnlineLyricsSearch}
                    darkMode={darkMode}
                    onImportLyrics={handleImportFromLibrary}
                />

                {/* RCCGTPHB Song Database Modal */}
                <RccgTphbSongModal
                    isOpen={rccgTphbModalOpen}
                    onClose={() => setRccgTphbModalOpen(false)}
                    darkMode={darkMode}
                    onImportLyrics={handleImportFromLibrary}
                    emitSetlistAdd={emitSetlistAdd}
                    selectLine={selectLine}
                    emitLineUpdate={emitLineUpdate}
                    isDesktopApp={isDesktopApp}
                />

                {/* EasyWorship Import Modal */}
                <EasyWorshipImportModal
                    isOpen={easyWorshipModalOpen}
                    onClose={() => setEasyWorshipModalOpen(false)}
                    darkMode={darkMode}
                />
            </div>
        </>
    );
};

export default LyricDisplayApp;
