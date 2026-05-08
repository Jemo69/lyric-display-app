import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FolderOpen, FileText, FilePlusCorner, Edit, ListMusic, Globe, Plus, Info, FileMusic, Play, ChevronDown, Square, Sparkles, Volume2, VolumeX, Moon, Sun, Settings, BookText, Database } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLyricsState, useOutputState, useOutput1Settings, useOutput2Settings, useStageSettings, useDarkModeState, useSetlistState, useIsDesktopApp, useAutoplaySettings, useIntelligentAutoplayState, useOutputRegistry } from '../hooks/useStoreSelectors';
import { useControlSocket } from '../context/ControlSocketProvider';
import useFileUpload from '../hooks/useFileUpload';
import useMultipleFileUpload from '../hooks/useMultipleFileUpload';
import useSetlistLoader from '../hooks/SetlistModal/useSetlistLoader';
import AuthStatusIndicator from './AuthStatusIndicator';
import ConnectionBackoffBanner from './ConnectionBackoffBanner';
import LyricsList from './LyricsList';
import MobileLayout from './MobileLayout';

import OutputSettingsPanel from './OutputSettingsPanel';
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { slugifyOutputName, isReservedOutputSlug } from '../utils/outputs';
import { parseLrcContent } from '../../shared/lyricsParsing.js';
import { useAutoplayManager } from '../hooks/useAutoplayManager';
import { useSyncOutputs } from '../hooks/useSyncOutputs';
import { useLyricsLoader } from '../hooks/LyricDisplayApp/useLyricsLoader';
import { useKeyboardShortcuts } from '../hooks/LyricDisplayApp/useKeyboardShortcuts';
import { useElectronListeners } from '../hooks/LyricDisplayApp/useElectronListeners';
import { useResponsiveWidth } from '../hooks/LyricDisplayApp/useResponsiveWidth';
import { useDragAndDrop } from '../hooks/LyricDisplayApp/useDragAndDrop';
import useBibleStore from '../context/BibleStore';
import useLyricsStore from '../context/LyricsStore';
import BibleControlPanel from './Bible/BibleControlPanel';

const SetlistModal = React.lazy(() => import('./SetlistModal'));
const OnlineLyricsSearchModal = React.lazy(() => import('./OnlineLyricsSearchModal'));
const RccgTphbSongModal = React.lazy(() => import('./RccgTphbSongModal'));
const EasyWorshipImportModal = React.lazy(() => import('./EasyWorshipImportModal'));
const DraftApprovalModal = React.lazy(() => import('./DraftApprovalModal'));

const LazyBoundary = ({ children }) => (
    <React.Suspense fallback={null}>{children}</React.Suspense>
);

const LyricDisplayApp = () => {
    const navigate = useNavigate();

    const { isOutputOn, setIsOutputOn } = useOutputState();
    const { lyrics, lyricsFileName, rawLyricsContent, selectedLine, lyricsTimestamps, pendingSavedVersion, selectLine, setLyrics, setLyricsSections, setLineToSection, setRawLyricsContent, setLyricsFileName, setSongMetadata, setLyricsTimestamps, clearPendingSavedVersion, addToLyricsHistory, songMetadata } = useLyricsState();
    const { settings: output1Settings, updateSettings: updateOutput1Settings } = useOutput1Settings();
    const { settings: output2Settings, updateSettings: updateOutput2Settings } = useOutput2Settings();
    const { settings: stageSettings, updateSettings: updateStageSettings } = useStageSettings();
    const { darkMode, setDarkMode } = useDarkModeState();
    const { setSetlistModalOpen, setlistModalOpen, setlistFiles, setSetlistFiles } = useSetlistState();
    const isDesktopApp = useIsDesktopApp();
    const { settings: autoplaySettings, setSettings: setAutoplaySettings } = useAutoplaySettings();
    const { hasSeenIntelligentAutoplayInfo, setHasSeenIntelligentAutoplayInfo } = useIntelligentAutoplayState();
    const { outputs, createCustomOutput } = useOutputRegistry();
    const [showNewOutputForm, setShowNewOutputForm] = useState(false);
    const [newOutputName, setNewOutputName] = useState('');
    const [newOutputType, setNewOutputType] = useState('regular');
    const [newOutputSource, setNewOutputSource] = useState('output1');

    const [contentType, setContentType] = useState('lyrics');
    const [showBibleSidebar, setShowBibleSidebar] = useState(false);
    const isBibleMode = contentType === 'bible';
    const { addBible, setActiveBible, activeBibleId, activeReference, selectedVerses, getVerseText, getFormattedReference, bibles, addToBibleHistory } = useBibleStore();


    useDarkModeSync(darkMode, setDarkMode);

    const fileInputRef = useRef(null);
    const scrollableSettingsRef = useRef(null);
    useMenuShortcuts(navigate, fileInputRef);

    const { socket, emitOutputToggle, emitLineUpdate, emitLyricsLoad, emitStyleUpdate, emitSetlistAdd, emitSetlistClear, emitSetlistLoad, emitAutoplayStateUpdate, emitOutputRegistryUpdate, connectionStatus, authStatus, forceReconnect, refreshAuthToken, isConnected, isAuthenticated, ready } = useControlSocket();

    useEffect(() => {
        if (!ready || !emitOutputRegistryUpdate) return;
        const registryState = useLyricsStore.getState();
        if (!registryState.customOutputs?.length) return;
        emitOutputRegistryUpdate({
            customOutputs: registryState.customOutputs,
            customOutputSettings: registryState.customOutputSettings,
            customOutputEnabled: registryState.customOutputEnabled,
        });
    }, [ready, emitOutputRegistryUpdate]);

    const handleBibleVerseSelect = useCallback((verseData) => {
        const slideTexts = Array.isArray(verseData.slides) && verseData.slides.length > 0
            ? verseData.slides
            : [verseData.text];
        const requestedSlideIndex = Number.isInteger(verseData.slideIndex) ? verseData.slideIndex : 0;
        const selectedSlideIndex = Math.min(Math.max(requestedSlideIndex, 0), slideTexts.length - 1);
        const lines = slideTexts.map((slideText) => `${slideText}\n\n${verseData.reference}`);
        const formattedVerse = lines.join('\n\n');
        const fullVerseText = verseData.fullText || slideTexts.join(' ');

        setLyrics(lines);
        setLyricsFileName(verseData.reference);
        setRawLyricsContent(formattedVerse);

        // Tell output windows to load these lyrics
        emitLyricsLoad(lines);
        
        // Update filename on server and other clients
        if (socket && socket.connected) {
            socket.emit('fileNameUpdate', verseData.reference);
        }

        // Add to Bible history once per passage, not every slide advance
        if (selectedSlideIndex === 0) {
            addToBibleHistory(verseData.reference, fullVerseText);
        }

        // Auto-add to setlist if not already there
        if (isDesktopApp && !setlistFiles.some(f => f.displayName === verseData.reference)) {
            emitSetlistAdd([{
                name: `${verseData.reference}.txt`,
                content: formattedVerse,
                lastModified: Date.now(),
                metadata: { type: 'bible', reference: verseData.reference, slideCount: slideTexts.length }
            }]);
        }

        // Select the requested Bible slide
        selectLine(selectedSlideIndex);
        emitLineUpdate(selectedSlideIndex);
    }, [setLyrics, setLyricsFileName, setRawLyricsContent, selectLine, emitLineUpdate, emitLyricsLoad, addToBibleHistory, isDesktopApp, setlistFiles, emitSetlistAdd, socket]);

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
        if (!outputs.some((output) => output.key === tab)) return;
        setActiveTab(tab);
        if (scrollableSettingsRef.current) {
            scrollableSettingsRef.current.scrollTop = 0;
        }
    }, [outputs, setActiveTab]);

    const newOutputSlug = slugifyOutputName(newOutputName);
    const duplicateOutput = outputs.some((output) => output.slug === newOutputSlug);
    const reservedOutput = isReservedOutputSlug(newOutputSlug);
    const newOutputSources = outputs.filter((output) => output.type === newOutputType);
    const newOutputError = !newOutputName.trim()
        ? 'Name is required.'
        : !newOutputSlug
            ? 'Use at least one letter or number.'
            : reservedOutput
                ? 'This URL is reserved by the app.'
                : duplicateOutput
                    ? 'That output URL already exists.'
                    : '';

    React.useEffect(() => {
        if (!newOutputSources.some((output) => output.key === newOutputSource)) {
            setNewOutputSource(newOutputSources[0]?.key || (newOutputType === 'stage' ? 'stage' : 'output1'));
        }
    }, [newOutputSource, newOutputSources, newOutputType]);

    const handleCreateCustomOutput = React.useCallback(() => {
        if (newOutputError) return;
        const outputKey = createCustomOutput({
            name: newOutputName.trim(),
            slug: newOutputSlug,
            type: newOutputType,
            sourceOutputKey: newOutputSource,
        });
        const registryState = useLyricsStore.getState();
        emitOutputRegistryUpdate?.({
            customOutputs: registryState.customOutputs,
            customOutputSettings: registryState.customOutputSettings,
            customOutputEnabled: registryState.customOutputEnabled,
        });
        setActiveTab(outputKey);
        setShowNewOutputForm(false);
        setNewOutputName('');
        showToast({
            title: 'Output created',
            message: `Open /${newOutputSlug} to view ${newOutputName.trim()}.`,
            variant: 'success',
        });
    }, [createCustomOutput, emitOutputRegistryUpdate, newOutputError, newOutputName, newOutputSlug, newOutputSource, newOutputType, setActiveTab, showToast]);

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
        const base = 'p-2.5 font-medium sanctuary-icon-button';
        return disabled ? `${base} cursor-not-allowed opacity-50` : base;
    };

    if (!isDesktopApp) {
        return <MobileLayout />;
    }

    return (
        <>
            {!isBibleMode && <ConnectionBackoffBanner darkMode={darkMode} />}
            {isDesktopApp && !isBibleMode && (
                <LazyBoundary>
                    <DraftApprovalModal darkMode={darkMode} />
                </LazyBoundary>
            )}
            <div className={`flex h-full font-sans sanctuary-shell ${darkMode ? 'dark' : ''}`}>
                    {/* Left Sidebar - Control Panel */}
                    {(!isBibleMode || showBibleSidebar) && (
                    <div className="w-[430px] flex-shrink-0 flex flex-col h-full sanctuary-sidebar">
                        {/* Fixed Header Section */}
                        <div className="flex-shrink-0 p-5 pb-0 sanctuary-header-surface">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2">
                                    {/* Content Type Toggle */}
                                    <div className={`flex rounded-lg overflow-hidden border p-1 ${darkMode ? 'border-gray-700 bg-gray-950/40' : 'border-gray-200 bg-gray-100'}`}>
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
                                            onClick={() => {
                                                setContentType('bible');
                                                setShowBibleSidebar(false);
                                            }}
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
                            <div className="flex gap-3 mb-4">
                                <Tooltip content={<span>Load a .txt or .lrc lyrics file from your computer - <strong>Ctrl+O</strong></span>} side="right">
                                    <button
                                        className="flex-1 py-3 px-4 sanctuary-primary-action rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                                        onClick={openFileDialog}
                                    >
                                        <FolderOpen className="w-5 h-5" />
                                        Load lyrics file (.txt, .lrc)
                                    </button>
                                </Tooltip>
                                <Tooltip content={<span>Open the song canvas to create new lyrics from scratch - <strong>Ctrl+N</strong></span>} side="left">
                                    <button
                                        className="h-[52px] w-[52px] sanctuary-icon-button rounded-xl font-medium transition-all duration-200 flex items-center justify-center"
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
                                <div className={`mb-5 text-xs font-semibold flex items-center gap-2 rounded-lg px-3 py-2 border ${darkMode ? 'text-gray-300 border-gray-700 bg-gray-950/30' : 'text-gray-600 border-gray-200 bg-gray-50'}`}>
                                    <FileMusic className="w-4 h-4 flex-shrink-0" />
                                    <span className="truncate">{lyricsFileName}</span>
                                </div>
                            )}

                            {/* Output Toggle */}
                            <div className="sanctuary-live-card flex items-center justify-between mb-5 px-4 py-3">
                                <div className="flex items-center gap-4">
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
                                    <span className={`text-sm ml-5 font-semibold ${isOutputOn ? (darkMode ? 'text-green-300' : 'text-green-700') : (darkMode ? 'text-rose-300' : 'text-rose-700')}`}>
                                        {isOutputOn ? 'Output live' : 'Output hidden'}
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

                            <div className={`border-t my-5 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}></div>

                            {/* Output Tabs */}
                            <div className="mb-5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Tabs value={activeTab} onValueChange={handleOutputTabSwitch} className="min-w-0 flex-1">
                                        <TabsList className={`w-full p-1.5 min-h-11 h-auto gap-2 rounded-xl border flex flex-wrap ${darkMode ? 'bg-gray-950/40 text-gray-300 border-gray-700' : 'bg-gray-100 border-gray-200'}`}>
                                            {outputs.map((output) => (
                                                <TabsTrigger key={output.key} value={output.key} className={`flex-1 h-8 text-sm min-w-[84px] ${darkMode ? 'data-[state=active]:bg-white data-[state=active]:text-gray-900' : 'data-[state=active]:bg-black data-[state=active]:text-white'}`}>
                                                    {output.name}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                    </Tabs>
                                    <button
                                        type="button"
                                        onClick={() => setShowNewOutputForm((value) => !value)}
                                        className={`h-10 shrink-0 rounded-xl border px-3 text-sm font-semibold transition-colors ${darkMode ? 'border-gray-700 bg-gray-900 text-gray-100 hover:bg-gray-800' : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'}`}
                                    >
                                        New Output
                                    </button>
                                </div>
                                {showNewOutputForm && (
                                    <div className={`rounded-xl border p-3 space-y-3 ${darkMode ? 'border-gray-800 bg-gray-950/40' : 'border-gray-200 bg-white'}`}>
                                        <div className="grid gap-2">
                                            <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Output name</label>
                                            <Input value={newOutputName} onChange={(event) => setNewOutputName(event.target.value)} placeholder="Main Screen" />
                                            <p className={`text-xs ${newOutputError ? (darkMode ? 'text-red-300' : 'text-red-600') : (darkMode ? 'text-gray-500' : 'text-gray-500')}`}>
                                                {newOutputError || `URL: /${newOutputSlug}`}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="grid gap-2">
                                                <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Display type</label>
                                                <select value={newOutputType} onChange={(event) => setNewOutputType(event.target.value)} className={`h-9 rounded-md border px-3 text-sm ${darkMode ? 'border-gray-700 bg-gray-950 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
                                                    <option value="regular">Regular</option>
                                                    <option value="stage">Stage</option>
                                                </select>
                                            </div>
                                            <div className="grid gap-2">
                                                <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Copy settings from</label>
                                                <select value={newOutputSource} onChange={(event) => setNewOutputSource(event.target.value)} className={`h-9 rounded-md border px-3 text-sm ${darkMode ? 'border-gray-700 bg-gray-950 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
                                                    {newOutputSources.map((output) => <option key={output.key} value={output.key}>{output.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setShowNewOutputForm(false)}>Cancel</Button>
                                            <Button size="sm" disabled={Boolean(newOutputError)} onClick={handleCreateCustomOutput}>Create</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Scrollable Settings Panel */}
                        <div
                            ref={scrollableSettingsRef}
                            className="flex-1 overflow-y-auto px-5 relative"
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
                                {outputs.some((output) => output.key === activeTab) && (
                                    <OutputSettingsPanel key={activeTab} outputKey={activeTab} />
                                )}
                            </div>
                            <div className="m-10"></div>
                        </div>
                    </div>
                    )}

                    {/* Right Main Area */}
                    <div className="flex-1 min-w-0 p-5 flex flex-col h-full">
                        {/* Fixed Header */}
                        <div className="mb-4 flex-shrink-0 min-w-0" ref={headerContainerRef}>
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    {isBibleMode && (
                                        <div className={`inline-flex items-center gap-3 rounded-full border px-3 py-2 shadow-sm ${darkMode ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-800'}`}>
                                            <span className={`text-[11px] font-semibold uppercase tracking-wider ${showBibleSidebar ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>
                                                Bible sidebar
                                            </span>
                                            <Switch
                                                checked={showBibleSidebar}
                                                onCheckedChange={setShowBibleSidebar}
                                                className={`${darkMode
                                                    ? 'data-[state=checked]:bg-green-400 data-[state=unchecked]:bg-gray-600'
                                                    : 'data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-300'
                                                    }`}
                                            />
                                            <button
                                                onClick={() => setContentType('lyrics')}
                                                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                                            >
                                                Exit Bible
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {!isBibleMode && hasLyrics && (
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

                            {!isBibleMode && hasLyrics && (
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
                        <div className="sanctuary-content-surface flex-1 flex flex-col overflow-hidden relative">
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
                {setlistModalOpen && (
                    <LazyBoundary>
                        <SetlistModal />
                    </LazyBoundary>
                )}

                {/* Online Lyrics Search Modal */}
                {onlineLyricsModalOpen && (
                    <LazyBoundary>
                        <OnlineLyricsSearchModal
                            isOpen={onlineLyricsModalOpen}
                            onClose={handleCloseOnlineLyricsSearch}
                            darkMode={darkMode}
                            onImportLyrics={handleImportFromLibrary}
                        />
                    </LazyBoundary>
                )}

                {/* RCCGTPHB Song Database Modal */}
                {rccgTphbModalOpen && (
                    <LazyBoundary>
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
                    </LazyBoundary>
                )}

                {/* EasyWorship Import Modal */}
                {easyWorshipModalOpen && (
                    <LazyBoundary>
                        <EasyWorshipImportModal
                            isOpen={easyWorshipModalOpen}
                            onClose={() => setEasyWorshipModalOpen(false)}
                            darkMode={darkMode}
                        />
                    </LazyBoundary>
                )}
            </div>
        </>
    );
};

export default LyricDisplayApp;
