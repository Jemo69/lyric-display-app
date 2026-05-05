import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, FileText, FilePlusCorner, Edit, ListMusic, Globe, Plus, Info, FileMusic, Play, ChevronDown, Square, Sparkles, Volume2, VolumeX, Moon, Sun, Settings, BookText, Database, CheckCircle2, AlertTriangle, RadioTower, MonitorUp, MonitorCog, Trash2, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLyricsState, useOutputState, useOutput1Settings, useOutput2Settings, useStageSettings, useCustomOutputsState, useDarkModeState, useSetlistState, useIsDesktopApp, useAutoplaySettings, useIntelligentAutoplayState } from '../hooks/useStoreSelectors';
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
import { ContextMenu, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel } from '@/components/ui/context-menu';
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

const LyricDisplayApp = () => {
    const navigate = useNavigate();

    const { isOutputOn, setIsOutputOn } = useOutputState();
    const { lyrics, lyricsFileName, rawLyricsContent, selectedLine, lyricsTimestamps, pendingSavedVersion, selectLine, setLyrics, setLyricsSections, setLineToSection, setRawLyricsContent, setLyricsFileName, setSongMetadata, setLyricsTimestamps, clearPendingSavedVersion, addToLyricsHistory, songMetadata } = useLyricsState();
    const { settings: output1Settings, updateSettings: updateOutput1Settings } = useOutput1Settings();
    const { settings: output2Settings, updateSettings: updateOutput2Settings } = useOutput2Settings();
    const { settings: stageSettings, updateSettings: updateStageSettings } = useStageSettings();
    const { customOutputs, customOutputSettings, addCustomOutput, removeCustomOutput, updateCustomOutputSettings } = useCustomOutputsState();
    const { darkMode, setDarkMode } = useDarkModeState();
    const { setSetlistModalOpen, setlistFiles, setSetlistFiles } = useSetlistState();
    const isDesktopApp = useIsDesktopApp();
    const { settings: autoplaySettings, setSettings: setAutoplaySettings } = useAutoplaySettings();
    const { hasSeenIntelligentAutoplayInfo, setHasSeenIntelligentAutoplayInfo } = useIntelligentAutoplayState();

    const [contentType, setContentType] = useState('lyrics');
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
    const [settingsMenuOpen, setSettingsMenuOpen] = React.useState(false);
    const [outputManagerOpen, setOutputManagerOpen] = React.useState(false);
    const settingsMenuRef = useRef(null);
    const settingsButtonRef = useRef(null);
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
        if (!settingsMenuOpen) return;
        const handlePointerDown = (event) => {
            const menuNode = settingsMenuRef.current;
            const buttonNode = settingsButtonRef.current;
            if (menuNode?.contains(event.target) || buttonNode?.contains(event.target)) return;
            setSettingsMenuOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setSettingsMenuOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [settingsMenuOpen]);

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
        customOutputSettings,
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
        if (tab !== 'output1' && tab !== 'output2' && tab !== 'stage') return;
        setActiveTab(tab);
        if (scrollableSettingsRef.current) {
            scrollableSettingsRef.current.scrollTop = 0;
        }
    }, [setActiveTab]);

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
        const base = 'p-2.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
        const focus = darkMode ? 'focus-visible:ring-blue-300 focus-visible:ring-offset-gray-950' : 'focus-visible:ring-gray-900 focus-visible:ring-offset-white';
        if (disabled) {
            return `${base} ${focus} ${darkMode ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50' : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'}`;
        }
        return `${base} ${focus} ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}`;
    };

    const connectionReady = isConnected && isAuthenticated && ready;
    const selectedLineLabel = selectedLine == null ? 'None selected' : `Line ${selectedLine + 1}`;
    const syncTone = !connectionReady ? 'warning' : isOutputOn ? 'ready' : 'off';
    const syncCopy = !connectionReady ? 'Needs connection' : isOutputOn ? 'Synced' : 'Output off';
    const syncDetail = !connectionReady
        ? 'Reconnect before syncing outputs'
        : isOutputOn
            ? 'Output 1 and Output 2 receive the current lyric state'
            : 'Outputs are intentionally hidden';
    const statusChipClass = (tone) => {
        const tones = {
            ready: darkMode ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-emerald-600/25 bg-emerald-50 text-emerald-700',
            warning: darkMode ? 'border-amber-300/35 bg-amber-300/10 text-amber-200' : 'border-amber-600/25 bg-amber-50 text-amber-800',
            off: darkMode ? 'border-gray-600 bg-gray-800 text-gray-300' : 'border-gray-300 bg-gray-100 text-gray-700',
            live: darkMode ? 'border-blue-300/30 bg-blue-300/10 text-blue-200' : 'border-blue-600/20 bg-blue-50 text-blue-700',
        };
        return `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${tones[tone]}`;
    };

    if (!isDesktopApp) {
        return <MobileLayout />;
    }

    return (
        <>
            <ConnectionBackoffBanner darkMode={darkMode} />
            {isDesktopApp && <DraftApprovalModal darkMode={darkMode} />}
            <OutputManagerDialog
                open={outputManagerOpen}
                onClose={() => setOutputManagerOpen(false)}
                outputs={customOutputs}
                onAdd={(payload) => {
                    const output = { ...payload, id: `output${Date.now()}` };
                    addCustomOutput(output);
                    setActiveTab(output.id);
                    setOutputManagerOpen(false);
                    showToast({ title: 'Output added', message: `${output.name} is ready to configure.`, variant: 'success' });
                }}
                onDelete={(output) => {
                    removeCustomOutput(output.id);
                    if (activeTab === output.id) setActiveTab('output1');
                    showToast({ title: 'Output deleted', message: `${output.name} was removed.`, variant: 'info' });
                }}
                darkMode={darkMode}
            />
            <div className={`flex h-full font-sans ${darkMode ? 'dark bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-950'}`}>
                {/* Left Sidebar - Control Panel */}
                <aside className={`w-[420px] flex-shrink-0 flex flex-col h-full border-r ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                    {/* Fixed Header Section */}
                    <div className={`flex-shrink-0 p-5 pb-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                {/* Content Type Toggle */}
                                <div className={`flex shrink-0 rounded-lg overflow-hidden border ${darkMode ? 'border-gray-700 bg-gray-950' : 'border-gray-300 bg-white'}`}>
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

                                <Tooltip content="Manage outputs" side="bottom">
                                    <button
                                        className={iconButtonClass(false)}
                                        onClick={() => setOutputManagerOpen(true)}
                                        aria-label="Manage outputs"
                                    >
                                        <MonitorCog className="w-4 h-4" />
                                    </button>
                                </Tooltip>

                                <div className="relative">
                                    <Tooltip content="Tools and settings" side="bottom">
                                        <button
                                            ref={settingsButtonRef}
                                            className={iconButtonClass(false)}
                                            aria-haspopup="menu"
                                            aria-expanded={settingsMenuOpen}
                                            onClick={() => setSettingsMenuOpen((open) => !open)}
                                        >
                                            <Settings className="w-4 h-4" />
                                        </button>
                                    </Tooltip>
                                    <ContextMenu
                                        ref={settingsMenuRef}
                                        visible={settingsMenuOpen}
                                        position={{ top: 44, left: -176 }}
                                        darkMode={darkMode}
                                        positioning="absolute"
                                        className="w-64"
                                    >
                                        <ContextMenuLabel darkMode={darkMode}>Tools</ContextMenuLabel>
                                        <ContextMenuItem
                                            darkMode={darkMode}
                                            icon={<Globe className="h-4 w-4" />}
                                            onClick={() => {
                                                setSettingsMenuOpen(false);
                                                handleOpenOnlineLyricsSearch();
                                            }}
                                        >
                                            Online lyrics search
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            darkMode={darkMode}
                                            icon={<Database className="h-4 w-4" />}
                                            onClick={() => {
                                                setSettingsMenuOpen(false);
                                                setRccgTphbModalOpen(true);
                                            }}
                                        >
                                            RCCGTPHB song database
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            darkMode={darkMode}
                                            icon={<ListMusic className="h-4 w-4" />}
                                            onClick={() => {
                                                setSettingsMenuOpen(false);
                                                handleOpenSetlist();
                                            }}
                                        >
                                            Setlist manager
                                        </ContextMenuItem>
                                        <ContextMenuSeparator darkMode={darkMode} />
                                        <ContextMenuLabel darkMode={darkMode}>Preferences</ContextMenuLabel>
                                        <ContextMenuItem
                                            darkMode={darkMode}
                                            icon={muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                            onClick={() => {
                                                setSettingsMenuOpen(false);
                                                toggleMute();
                                            }}
                                        >
                                            {muted ? 'Unmute toast sounds' : 'Mute toast sounds'}
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            darkMode={darkMode}
                                            icon={darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                                            onClick={() => {
                                                setSettingsMenuOpen(false);
                                                const next = !darkMode;
                                                setDarkMode(next);
                                                window.electronAPI?.setDarkMode?.(next);
                                                window.electronAPI?.syncNativeDarkMode?.(next);
                                            }}
                                        >
                                            {darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            darkMode={darkMode}
                                            icon={<Settings className="h-4 w-4" />}
                                            onClick={() => {
                                                setSettingsMenuOpen(false);
                                                showToast({
                                                    title: 'User Preferences',
                                                    message: 'User preferences panel coming soon!',
                                                    variant: 'info'
                                                });
                                            }}
                                        >
                                            User preferences
                                        </ContextMenuItem>
                                    </ContextMenu>
                                </div>

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
                                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors duration-150 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${darkMode ? 'bg-gray-100 text-gray-950 hover:bg-gray-200 focus-visible:ring-blue-300 focus-visible:ring-offset-gray-900' : 'bg-gray-950 text-white hover:bg-gray-800 focus-visible:ring-gray-900 focus-visible:ring-offset-white'}`}
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
                        <div className={`mb-5 rounded-2xl border p-4 ${darkMode ? 'border-gray-800 bg-gray-950/70' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Live output</p>
                                    <p className={`mt-1 text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{syncCopy}</p>
                                </div>
                                <span className={statusChipClass(syncTone)}>
                                    {syncTone === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                    {syncCopy}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 pl-1">
                                    <Switch
                                        checked={isOutputOn}
                                        onCheckedChange={handleToggle}
                                        className={`
            scale-[1.55]
            ${darkMode
                                                ? "data-[state=checked]:bg-emerald-400 data-[state=unchecked]:bg-gray-700"
                                                : "data-[state=checked]:bg-gray-950"}
          `}
                                    />
                                    <span className={`text-sm ml-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {isOutputOn ? 'Display output is on' : 'Display output is off'}
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
                                            ? 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
                                            : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            </div>
                            <p className={`mt-3 text-xs leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{syncDetail}</p>
                        </div>

                        <div className={`border-t my-5 ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}></div>

                        {/* Output Tabs */}
                        <Tabs value={activeTab} onValueChange={handleOutputTabSwitch}>
                            <TabsList className={`w-full p-1.5 h-11 mb-5 gap-2 ${darkMode ? 'bg-gray-950 text-gray-400 border border-gray-800' : 'bg-gray-100'}`}>
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
                                    <TabsTrigger key={output.id} value={output.id} className={`flex-1 h-full text-sm min-w-0 ${darkMode ? 'data-[state=active]:bg-white data-[state=active]:text-gray-900' : 'data-[state=active]:bg-black data-[state=active]:text-white'}`}>
                                        {output.name}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
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

                            {customOutputs.some((output) => output.id === activeTab) && (
                                <OutputSettingsPanel
                                    outputKey={activeTab}
                                    settings={customOutputSettings[activeTab] || output2Settings}
                                    updateSettings={(settings) => {
                                        updateCustomOutputSettings(activeTab, settings);
                                        emitStyleUpdate(activeTab, settings);
                                    }}
                                />
                            )}
                        </div>
                        <div className="m-10"></div>
                    </div>
                </aside>

                {/* Right Main Area */}
                <main className="flex-1 min-w-0 p-5 flex flex-col h-full">
                    {/* Fixed Header */}
                    <div className="mb-5 flex-shrink-0 min-w-0" ref={headerContainerRef}>
                        <section className={`mb-4 rounded-2xl border p-4 ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`} aria-label="Output sync monitor">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Sync monitor</p>
                                    <h1 className={`mt-1 truncate text-xl font-semibold tracking-tight ${darkMode ? 'text-gray-50' : 'text-gray-950'}`}>{lyricsFileName || 'No lyrics loaded'}</h1>
                                    <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Selected line: {selectedLineLabel}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={statusChipClass(isOutputOn && connectionReady ? 'live' : syncTone)}><MonitorUp className="h-3.5 w-3.5" />Output 1</span>
                                    <span className={statusChipClass(isOutputOn && connectionReady ? 'live' : syncTone)}><MonitorUp className="h-3.5 w-3.5" />Output 2</span>
                                    <span className={statusChipClass(syncTone)}>{syncTone === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{syncCopy}</span>
                                    <button
                                        disabled={!connectionReady}
                                        onClick={handleSyncOutputs}
                                        className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${darkMode ? 'bg-gray-100 text-gray-950 hover:bg-gray-200 focus-visible:ring-blue-300 focus-visible:ring-offset-gray-900' : 'bg-gray-950 text-white hover:bg-gray-800 focus-visible:ring-gray-900 focus-visible:ring-offset-white'}`}
                                    >
                                        <RadioTower className="h-4 w-4" />
                                        Sync outputs
                                    </button>
                                </div>
                            </div>
                        </section>
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
                        {contentType !== 'bible' && hasLyrics && (
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
                    <section className={`rounded-2xl border flex-1 flex flex-col overflow-hidden relative ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
                        }`} aria-label={contentType === 'bible' ? 'Bible control workspace' : 'Lyrics workspace'}>
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
                                <div className="max-w-md text-center">
                                    <div className={`w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center border ${darkMode ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-200'
                                        }`}>
                                        <FolderOpen className={`w-10 h-10 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                                    </div>
                                    <h2 className={`text-xl font-semibold tracking-tight ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                        No lyrics loaded
                                    </h2>
                                    <p className={`mt-2 text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Drop a lyrics file, search online, open Bible, or create a song.
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
                    </section>
                </main>

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

const OutputManagerDialog = ({ open, onClose, outputs, onAdd, onDelete, darkMode }) => {
    const [name, setName] = React.useState('Output 3');
    const [type, setType] = React.useState('state');

    React.useEffect(() => {
        if (open) setName(`Output ${outputs.length + 3}`);
    }, [open, outputs.length]);

    if (!open) return null;

    const inputClass = `h-10 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 ${darkMode
        ? 'border-gray-700 bg-gray-950 text-gray-100 focus-visible:ring-blue-300'
        : 'border-gray-300 bg-white text-gray-900 focus-visible:ring-gray-900'
        }`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="output-manager-title">
            <button className="absolute inset-0 bg-gray-950/70" aria-label="Close output manager" onClick={onClose} />
            <div className={`relative w-full max-w-xl rounded-2xl border shadow-2xl ${darkMode ? 'border-gray-800 bg-gray-950 text-gray-100' : 'border-gray-200 bg-white text-gray-950'}`}>
                <div className={`flex items-start justify-between gap-4 border-b p-5 ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                    <div>
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${darkMode ? 'text-blue-200' : 'text-blue-700'}`}>Output manager</p>
                        <h2 id="output-manager-title" className="mt-1 text-xl font-semibold tracking-tight">Add or delete outputs</h2>
                        <p className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Create a named output, choose its type, or remove outputs you no longer use.</p>
                    </div>
                    <button onClick={onClose} className={`rounded-lg p-2 transition-colors ${darkMode ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    <div className={`rounded-xl border p-4 ${darkMode ? 'border-gray-800 bg-gray-900/70' : 'border-gray-200 bg-gray-50'}`}>
                        <label className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>New output name</label>
                        <div className="mt-2 grid grid-cols-[1fr_auto] gap-3">
                            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Output 3" />
                            <select value={type} onChange={(event) => setType(event.target.value)} className={inputClass}>
                                <option value="state">State output</option>
                                <option value="stage">Stage output</option>
                            </select>
                        </div>
                        <button
                            onClick={() => name.trim() && onAdd({ name: name.trim(), type })}
                            className={`mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${darkMode ? 'bg-gray-100 text-gray-950 hover:bg-gray-200' : 'bg-gray-950 text-white hover:bg-gray-800'}`}
                        >
                            <Plus className="h-4 w-4" />
                            Add output
                        </button>
                    </div>

                    <div className="space-y-2">
                        <p className={`text-xs font-semibold uppercase tracking-[0.08em] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Custom outputs</p>
                        {outputs.length === 0 ? (
                            <div className={`rounded-xl border p-4 text-sm ${darkMode ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-600'}`}>No custom outputs yet.</div>
                        ) : outputs.map((output) => (
                            <div key={output.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${darkMode ? 'border-gray-800 bg-gray-900/60' : 'border-gray-200 bg-white'}`}>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{output.name}</p>
                                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{output.type === 'stage' ? 'Stage output' : 'State output'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => window.open(`#/output/${output.id}`, '_blank')} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${darkMode ? 'bg-blue-300/10 text-blue-200 hover:bg-blue-300/20' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                                        <MonitorUp className="h-4 w-4" />
                                        View
                                    </button>
                                    <button onClick={() => onDelete(output)} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${darkMode ? 'bg-rose-400/10 text-rose-200 hover:bg-rose-400/20' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LyricDisplayApp;
