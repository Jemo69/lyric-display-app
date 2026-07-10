import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import useLyricsStore from '../context/LyricsStore';
import { getAllOutputs, getOutputEnabled, getOutputSettings, findOutputByKey } from '../utils/outputs';

export const useLyricsState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            lyrics: state.lyrics,
            rawLyricsContent: state.rawLyricsContent,
            selectedLine: state.selectedLine,
            lyricsFileName: state.lyricsFileName,
            bibleVersion: state.bibleVersion,
            lyricsSource: state.lyricsSource,
            songMetadata: state.songMetadata,
            lyricsTimestamps: state.lyricsTimestamps,
            lyricsEnhancedTimestamps: state.lyricsEnhancedTimestamps,
            lyricsSections: state.lyricsSections,
            lineToSection: state.lineToSection,
            pendingSavedVersion: state.pendingSavedVersion,
            setLyrics: state.setLyrics,
            setLyricsSections: state.setLyricsSections,
            setLineToSection: state.setLineToSection,
            setRawLyricsContent: state.setRawLyricsContent,
            setLyricsSource: state.setLyricsSource,
            setLyricsFileName: state.setLyricsFileName,
            setBibleVersion: state.setBibleVersion,
            setSongMetadata: state.setSongMetadata,
            setLyricsTimestamps: state.setLyricsTimestamps,
            setLyricsEnhancedTimestamps: state.setLyricsEnhancedTimestamps,
            selectLine: state.selectLine,
            setPendingSavedVersion: state.setPendingSavedVersion,
            clearPendingSavedVersion: state.clearPendingSavedVersion,
            addToLyricsHistory: state.addToLyricsHistory,
        }),
        shallow
    );

export const useOutputState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            isOutputOn: state.isOutputOn,
            setIsOutputOn: state.setIsOutputOn,
            autoTurnOnOutput: state.autoTurnOnOutput,
        }),
        shallow
    );

export const useIndividualOutputState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            output1Enabled: state.output1Enabled,
            output2Enabled: state.output2Enabled,
            stageEnabled: state.stageEnabled,
            customOutputEnabled: state.customOutputEnabled,
            setOutput1Enabled: state.setOutput1Enabled,
            setOutput2Enabled: state.setOutput2Enabled,
            setStageEnabled: state.setStageEnabled,
            setCustomOutputEnabled: state.setCustomOutputEnabled,
        }),
        shallow
    );

export const useOutput1Settings = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: state.output1Settings,
            updateSettings: (newSettings) =>
                state.updateOutputSettings('output1', newSettings),
        }),
        shallow
    );

export const useOutput2Settings = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: state.output2Settings,
            updateSettings: (newSettings) =>
                state.updateOutputSettings('output2', newSettings),
        }),
        shallow
    );

export const useStageSettings = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: state.stageSettings,
            updateSettings: (newSettings) =>
                state.updateOutputSettings('stage', newSettings),
        }),
        shallow
    );

export const useOutputRegistry = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            outputs: getAllOutputs(state),
            customOutputs: state.customOutputs,
            createCustomOutput: state.createCustomOutput,
            renameCustomOutput: state.renameCustomOutput,
            deleteCustomOutput: state.deleteCustomOutput,
        }),
        shallow
    );

export const useOutputDefinition = (outputKey) =>
    useLyricsStore((state) => findOutputByKey(state, outputKey));

export const useOutputSettingsByKey = (outputKey) =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: getOutputSettings(state, outputKey),
            enabled: getOutputEnabled(state, outputKey),
            updateSettings: (newSettings) => state.updateOutputSettings(outputKey, newSettings),
            setEnabled: (enabled) => {
                if (outputKey === 'output1') return state.setOutput1Enabled(enabled);
                if (outputKey === 'output2') return state.setOutput2Enabled(enabled);
                if (outputKey === 'stage') return state.setStageEnabled(enabled);
                return state.setCustomOutputEnabled(outputKey, enabled);
            },
        }),
        shallow
    );

export const useDarkModeState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            darkMode: state.darkMode,
            themeMode: state.themeMode,
            setDarkMode: state.setDarkMode,
            setThemeMode: state.setThemeMode,
        }),
        shallow
    );

export const useKeyboardNavigationPreferences = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            skipSectionTitlesOnKeyboard: state.skipSectionTitlesOnKeyboard,
            setSkipSectionTitlesOnKeyboard: state.setSkipSectionTitlesOnKeyboard,
        }),
        shallow
    );

export const useCanvasFloatingToolbarPreference = () =>
    useLyricsStore((state) => state.showCanvasFloatingToolbar);

export const useTimerDisplaySettings = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: state.timerDisplaySettings,
            updateSettings: state.updateTimerDisplaySettings,
        }),
        shallow
    );

export const useTimerControlSettings = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: state.timerControlSettings,
            updateSettings: state.updateTimerControlSettings,
        }),
        shallow
    );

export const useVimModeState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            vimMode: state.vimMode,
            setVimMode: state.setVimMode,
        }),
        shallow
    );

export const useSetlistState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            setlistFiles: state.setlistFiles,
            setlistModalOpen: state.setlistModalOpen,
            isDesktopApp: state.isDesktopApp,
            maxSetlistFilesLimit: state.maxSetlistFilesLimit,
            maxFileSizeLimit: state.maxFileSizeLimit,
            setSetlistFiles: state.setSetlistFiles,
            setSetlistModalOpen: state.setSetlistModalOpen,
            addSetlistFiles: state.addSetlistFiles,
            removeSetlistFile: state.removeSetlistFile,
            clearSetlist: state.clearSetlist,
            getSetlistFile: state.getSetlistFile,
            isSetlistFull: state.isSetlistFull,
            getAvailableSetlistSlots: state.getAvailableSetlistSlots,
            getMaxSetlistFiles: state.getMaxSetlistFiles,
            getMaxFileSize: state.getMaxFileSize,
            updateMaxSetlistFiles: state.updateMaxSetlistFiles,
            updateMaxFileSize: state.updateMaxFileSize,
        }),
        shallow
    );

export const useLyricsFileName = () =>
    useLyricsStore((state) => state.lyricsFileName);
export const useIsDesktopApp = () =>
    useLyricsStore((state) => state.isDesktopApp);
export const useSelectedLine = () =>
    useLyricsStore((state) => state.selectedLine);
export const useIsOutputOn = () =>
    useLyricsStore((state) => state.isOutputOn);
export const useDarkMode = () =>
    useLyricsStore((state) => state.darkMode);

export const useHasLyrics = () =>
    useLyricsStore((state) => Boolean(state.lyrics && state.lyrics.length > 0));

export const useSidebarState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            sidebarCollapsed: state.sidebarCollapsed,
            setSidebarCollapsed: state.setSidebarCollapsed,
            sidebarWidth: state.sidebarWidth,
            setSidebarWidth: state.setSidebarWidth,
        }),
        shallow
    );

export const useSettingsState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settingsCollapsed: state.settingsCollapsed,
            setSettingsCollapsed: state.setSettingsCollapsed,
        }),
        shallow
    );

export const useHeaderState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            headerCompact: state.headerCompact,
            setHeaderCompact: state.setHeaderCompact,
        }),
        shallow
    );

export const useAutoTurnOnOutput = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            autoTurnOnOutput: state.autoTurnOnOutput,
            setAutoTurnOnOutput: state.setAutoTurnOnOutput,
        }),
        shallow
    );

export const useOutputAutomationState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            outputActions: state.outputActions,
            setOutputActions: state.setOutputActions,
            addOutputAction: state.addOutputAction,
            removeOutputAction: state.removeOutputAction,
            updateOutputAction: state.updateOutputAction,
        }),
        shallow
    );

export const useCanAddToSetlist = () =>
    useLyricsStore(
        (state) =>
            state.isDesktopApp &&
            state.setlistFiles.length < 50 &&
            state.lyricsFileName != null &&
            state.lyrics != null &&
            state.lyrics.length > 0
    );

export const useAutoplaySettings = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: state.autoplaySettings,
            setSettings: state.setAutoplaySettings,
        }),
        shallow
    );

export const useIntelligentAutoplayState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            lyricsTimestamps: state.lyricsTimestamps,
            hasSeenIntelligentAutoplayInfo: state.hasSeenIntelligentAutoplayInfo,
            setHasSeenIntelligentAutoplayInfo: state.setHasSeenIntelligentAutoplayInfo,
        }),
        shallow
    );

export const usePerformanceSettings = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            settings: state.performanceSettings,
            setSettings: state.setPerformanceSettings,
        }),
        shallow
    );

export const usePreferencesState = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => ({
            showTooltips: state.showTooltips,
            showTutorialPopovers: state.showTutorialPopovers,
            showCanvasFloatingToolbar: state.showCanvasFloatingToolbar,
            toastSoundsMuted: state.toastSoundsMuted,
            setShowTooltips: state.setShowTooltips,
            setShowTutorialPopovers: state.setShowTutorialPopovers,
            setShowCanvasFloatingToolbar: state.setShowCanvasFloatingToolbar,
            setToastSoundsMuted: state.setToastSoundsMuted,
        }),
        shallow
    );

export const useCustomOutputIds = () =>
    useLyricsStore((state) => state.customOutputIds || state.customOutputs?.map(o => o.id) || []);

export const useAllOutputIds = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => {
            const custom = state.customOutputIds || state.customOutputs?.map(o => o.id) || [];
            return ['output1', 'output2', ...custom];
        },
        shallow
    );

export const useSetOutputEnabledAction = () =>
    useStoreWithEqualityFn(
        useLyricsStore,
        (state) => state.setOutputEnabled || state.setCustomOutputEnabled,
        shallow
    );

export const useOutputEnabled = (outputKey) =>
    useLyricsStore((state) => {
        if (outputKey === 'output1') return state.output1Enabled;
        if (outputKey === 'output2') return state.output2Enabled;
        if (outputKey === 'stage') return state.stageEnabled;
        return state.customOutputEnabled?.[outputKey] ?? state[`${outputKey}Enabled`] ?? true;
    });

export const useOutputSettings = (outputKey) => {
    const settings = useLyricsStore((state) => {
        if (outputKey === 'output1') return state.output1Settings;
        if (outputKey === 'output2') return state.output2Settings;
        if (outputKey === 'stage') return state.stageSettings;
        return state.customOutputSettings?.[outputKey] || state[`${outputKey}Settings`];
    });
    const updateOutputSettings = useLyricsStore((state) => state.updateOutputSettings);
    return {
        settings,
        updateSettings: (newSettings) => updateOutputSettings(outputKey, newSettings),
    };
};