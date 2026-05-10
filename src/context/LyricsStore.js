import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const defaultOutput1Settings = {
  fontStyle: 'Bebas Neue',
  bold: false,
  italic: false,
  underline: false,
  allCaps: false,
  textAlign: 'center',
  fontSize: 48,
  translationFontSizeMode: 'bound',
  translationFontSize: 48,
  fontColor: '#FFFFFF',
  translationLineColor: '#FBBF24',
  borderColor: '#000000',
  borderSize: 0,
  dropShadowColor: '#000000',
  dropShadowOpacity: 4,
  dropShadowOffsetX: 0,
  dropShadowOffsetY: 8,
  dropShadowBlur: 10,
  backgroundColor: '#000000',
  backgroundOpacity: 0,
  backgroundBandVerticalPadding: 20,
  backgroundBandHeightMode: 'adaptive',
  backgroundBandCustomLines: 3,
  backgroundBandLockedToMaxLines: false,
  lyricsPosition: 'lower',
  fullScreenMode: false,
  fullScreenBackgroundType: 'color',
  fullScreenBackgroundColor: '#000000',
  fullScreenBackgroundMedia: null,
  fullScreenBackgroundMediaName: '',
  alwaysShowBackground: false,
  fullScreenRestorePosition: null,
  xMargin: 3.5,
  yMargin: 2,
  maxLinesEnabled: false,
  maxLines: 3,
  minFontSize: 24,
  maxFontSize: 300,
  fitWidthPercent: 90,
  fitHeightPercent: 90,
  bibleReferencePosition: 'bottom-center',
  bibleReferenceSize: 28,
  autosizerActive: false,
  primaryViewportWidth: null,
  primaryViewportHeight: null,
  allInstances: null,
  instanceCount: 0,
  transitionAnimation: 'none',
  transitionSpeed: 150
};

export const defaultOutput2Settings = {
  fontStyle: 'Bebas Neue',
  bold: false,
  italic: false,
  underline: false,
  allCaps: false,
  textAlign: 'center',
  fontSize: 72,
  translationFontSizeMode: 'bound',
  translationFontSize: 72,
  fontColor: '#FFFFFF',
  translationLineColor: '#FBBF24',
  borderColor: '#000000',
  borderSize: 0,
  dropShadowColor: '#000000',
  dropShadowOpacity: 4,
  dropShadowOffsetX: 0,
  dropShadowOffsetY: 8,
  dropShadowBlur: 10,
  backgroundColor: '#000000',
  backgroundOpacity: 0,
  backgroundBandVerticalPadding: 30,
  backgroundBandHeightMode: 'adaptive',
  backgroundBandCustomLines: 3,
  backgroundBandLockedToMaxLines: false,
  lyricsPosition: 'lower',
  fullScreenMode: false,
  fullScreenBackgroundType: 'color',
  fullScreenBackgroundColor: '#000000',
  fullScreenBackgroundMedia: null,
  fullScreenBackgroundMediaName: '',
  alwaysShowBackground: false,
  fullScreenRestorePosition: null,
  xMargin: 3.5,
  yMargin: 2,
  maxLinesEnabled: false,
  maxLines: 3,
  minFontSize: 24,
  maxFontSize: 300,
  fitWidthPercent: 90,
  fitHeightPercent: 90,
  bibleReferencePosition: 'bottom-center',
  bibleReferenceSize: 28,
  autosizerActive: false,
  primaryViewportWidth: null,
  primaryViewportHeight: null,
  allInstances: null,
  instanceCount: 0,
  transitionAnimation: 'none',
  transitionSpeed: 150
};

export const defaultStageSettings = {
  transparentBackground: false,
  fullScreenBackgroundType: 'color',
  fullScreenBackgroundColor: '#000000',
  fullScreenBackgroundMedia: null,
  fullScreenBackgroundMediaName: '',
  alwaysShowBackground: false,
  fontStyle: 'Bebas Neue',
  backgroundColor: '#000000',
  liveFontSize: 120,
  liveColor: '#FFFFFF',
  liveBold: true,
  liveItalic: false,
  liveUnderline: false,
  liveAllCaps: false,
  liveAlign: 'left',
  nextFontSize: 72,
  nextColor: '#808080',
  nextBold: false,
  nextItalic: false,
  nextUnderline: false,
  nextAllCaps: false,
  nextAlign: 'left',
  showNextArrow: true,
  nextArrowColor: '#FFA500',
  prevFontSize: 28,
  prevColor: '#404040',
  prevBold: false,
  prevItalic: false,
  prevUnderline: false,
  prevAllCaps: false,
  prevAlign: 'left',
  currentSongColor: '#FFFFFF',
  currentSongSize: 24,
  topBarAlignment: 'left',
  showTopBar: true,
  showUpcomingSong: false,
  upcomingSongColor: '#808080',
  upcomingSongSize: 18,
  upcomingSongMode: 'automatic',
  upcomingSongFullScreen: false,
  timerFullScreen: false,
  customMessagesFullScreen: false,
  showTime: true,
  showNextLine: true,
  showPrevLine: true,
  showWaitingForLyrics: false,
  messageScrollSpeed: 3000,
  bottomBarColor: '#FFFFFF',
  bottomBarSize: 20,
  translationLineColor: '#FBBF24',
  maxLinesEnabled: false,
  maxLines: 3,
  minFontSize: 24,
  maxFontSize: 300,
  fitWidthPercent: 90,
  fitHeightPercent: 90,
  bibleReferencePosition: 'bottom-center',
  bibleReferenceSize: 28,
  transitionAnimation: 'slide',
  transitionSpeed: 300
};

const useLyricsStore = create(
  persist(
    (set, get) => ({
      lyrics: [],
      rawLyricsContent: '',
      selectedLine: null,
      lyricsFileName: '',
      lyricsSections: [],
      lineToSection: {},
      isOutputOn: true,
      output1Enabled: true,
      output2Enabled: true,
      stageEnabled: true,
      customOutputs: [],
      customOutputSettings: {},
      customOutputEnabled: {},
      darkMode: false,
      hasSeenWelcome: false,
      setlistFiles: [],
      lyricsHistory: [],
      isDesktopApp: false,
      setlistModalOpen: false,
      songMetadata: {
        title: '',
        artists: [],
        album: '',
        year: null,
        origin: '',
        filePath: '',
      },
      autoplaySettings: {
        interval: 5,
        loop: true,
        startFromFirst: true,
        skipBlankLines: true,
      },
      lyricsTimestamps: [],
      hasSeenIntelligentAutoplayInfo: false,
      pendingSavedVersion: null,

      setLyrics: (lines) => set({ lyrics: lines }),
      setLyricsSections: (sections) => set({ lyricsSections: Array.isArray(sections) ? sections : [] }),
      setLineToSection: (mapping) => set({ lineToSection: mapping && typeof mapping === 'object' ? mapping : {} }),
      setRawLyricsContent: (content) => set({ rawLyricsContent: content }),
      setLyricsFileName: (name) => set({ lyricsFileName: name }),
      selectLine: (index) => set({ selectedLine: index }),
      setIsOutputOn: (state) => set({ isOutputOn: state }),
      setOutput1Enabled: (enabled) => set({ output1Enabled: enabled }),
      setOutput2Enabled: (enabled) => set({ output2Enabled: enabled }),
      setStageEnabled: (enabled) => set({ stageEnabled: enabled }),
      setCustomOutputEnabled: (outputKey, enabled) => set((state) => ({
        customOutputEnabled: {
          ...state.customOutputEnabled,
          [outputKey]: enabled,
        },
      })),
      setDarkMode: (mode) => set({ darkMode: mode }),
      setHasSeenWelcome: (seen) => set({ hasSeenWelcome: seen }),
      setSetlistFiles: (files) => set({ setlistFiles: files }),
      setIsDesktopApp: (isDesktop) => set({ isDesktopApp: isDesktop }),
      setSetlistModalOpen: (open) => set({ setlistModalOpen: open }),
      setSongMetadata: (metadata) => set({ songMetadata: metadata }),
      setAutoplaySettings: (settings) => set({ autoplaySettings: settings }),
      setLyricsTimestamps: (timestamps) => set({ lyricsTimestamps: timestamps }),
      setHasSeenIntelligentAutoplayInfo: (seen) => set({ hasSeenIntelligentAutoplayInfo: seen }),
      setPendingSavedVersion: (payload) => set({ pendingSavedVersion: payload || null }),
      clearPendingSavedVersion: () => set({ pendingSavedVersion: null }),
      addSetlistFiles: (newFiles) => set((state) => ({
        setlistFiles: [...state.setlistFiles, ...newFiles]
      })),
      removeSetlistFile: (fileId) => set((state) => ({
        setlistFiles: state.setlistFiles.filter(file => file.id !== fileId)
      })),
      clearSetlist: () => set({ setlistFiles: [] }),

      addToLyricsHistory: (metadata, lines) => set((state) => {
        if (!metadata?.title) return state;
        const entry = {
          id: metadata.filePath || `manual_${Date.now()}`,
          title: metadata.title,
          artists: metadata.artists || [],
          timestamp: Date.now(),
          lines: lines || state.lyrics
        };
        const filteredHistory = state.lyricsHistory.filter(h => h.title !== entry.title);
        return {
          lyricsHistory: [entry, ...filteredHistory].slice(0, 50)
        };
      }),

      clearLyricsHistory: () => set({ lyricsHistory: [] }),

      getSetlistFile: (fileId) => {
        const state = get();
        return state.setlistFiles.find(file => file.id === fileId);
      },

      isSetlistFull: () => {
        const state = get();
        return state.setlistFiles.length >= 50;
      },

      getAvailableSetlistSlots: () => {
        const state = get();
        return Math.max(0, 50 - state.setlistFiles.length);
      },

      output1Settings: defaultOutput1Settings,
      output2Settings: defaultOutput2Settings,
      stageSettings: defaultStageSettings,
      createCustomOutput: ({ name, slug, type, sourceOutputKey }) => {
        const now = Date.now();
        const id = `custom_${slug}`;
        let sourceSettings;
        const state = get();
        if (sourceOutputKey === 'output1') sourceSettings = state.output1Settings;
        else if (sourceOutputKey === 'output2') sourceSettings = state.output2Settings;
        else if (sourceOutputKey === 'stage') sourceSettings = state.stageSettings;
        else sourceSettings = state.customOutputSettings?.[sourceOutputKey];
        const fallbackSettings = type === 'stage' ? defaultStageSettings : defaultOutput1Settings;
        const clonedSettings = JSON.parse(JSON.stringify(sourceSettings || fallbackSettings));

        set((current) => ({
          customOutputs: [
            ...current.customOutputs.filter((output) => output.id !== id),
            { id, name, slug, type: type === 'stage' ? 'stage' : 'regular', sourceOutputKey, createdAt: now, updatedAt: now },
          ],
          customOutputSettings: {
            ...current.customOutputSettings,
            [id]: clonedSettings,
          },
          customOutputEnabled: {
            ...current.customOutputEnabled,
            [id]: true,
          },
        }));
        return id;
      },
      renameCustomOutput: (outputKey, name, slug) => set((state) => ({
        customOutputs: state.customOutputs.map((output) => (
          output.id === outputKey ? { ...output, name, slug, updatedAt: Date.now() } : output
        )),
      })),
      deleteCustomOutput: (outputKey) => set((state) => {
        const { [outputKey]: removedSettings, ...customOutputSettings } = state.customOutputSettings;
        const { [outputKey]: removedEnabled, ...customOutputEnabled } = state.customOutputEnabled;
        return {
          customOutputs: state.customOutputs.filter((output) => output.id !== outputKey),
          customOutputSettings,
          customOutputEnabled,
        };
      }),
      updateOutputSettings: (output, newSettings) =>
        set((state) => {
          if (output && output.startsWith('custom_')) {
            return {
              customOutputSettings: {
                ...state.customOutputSettings,
                [output]: {
                  ...(state.customOutputSettings?.[output] || {}),
                  ...newSettings,
                },
              },
            };
          }
          return {
            [`${output}Settings`]: {
              ...state[`${output}Settings`],
              ...newSettings
            }
          };
        }),
    }),
    {
      name: 'lyrics-store',
      partialize: (state) => ({
        lyrics: state.lyrics,
        rawLyricsContent: state.rawLyricsContent,
        selectedLine: state.selectedLine,
        lyricsFileName: state.lyricsFileName,
        songMetadata: state.songMetadata,
        isOutputOn: state.isOutputOn,
        lyricsSections: state.lyricsSections,
        lineToSection: state.lineToSection,
        output1Enabled: state.output1Enabled,
        output2Enabled: state.output2Enabled,
        stageEnabled: state.stageEnabled,
        customOutputs: state.customOutputs,
        customOutputSettings: state.customOutputSettings,
        customOutputEnabled: state.customOutputEnabled,
        darkMode: state.darkMode,
        hasSeenWelcome: state.hasSeenWelcome,
        output1Settings: state.output1Settings,
        output2Settings: state.output2Settings,
        stageSettings: state.stageSettings,
        autoplaySettings: state.autoplaySettings,
        lyricsTimestamps: state.lyricsTimestamps,
        lyricsHistory: state.lyricsHistory,
        hasSeenIntelligentAutoplayInfo: state.hasSeenIntelligentAutoplayInfo,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.output1Settings = {
            ...state.output1Settings,
            autosizerActive: false,
            primaryViewportWidth: null,
            primaryViewportHeight: null,
            allInstances: null,
            instanceCount: 0,
          };
          state.output2Settings = {
            ...state.output2Settings,
            autosizerActive: false,
            primaryViewportWidth: null,
            primaryViewportHeight: null,
            allInstances: null,
            instanceCount: 0,
          };
          if (!Array.isArray(state.customOutputs)) state.customOutputs = [];
          if (!state.customOutputSettings || typeof state.customOutputSettings !== 'object') state.customOutputSettings = {};
          if (!state.customOutputEnabled || typeof state.customOutputEnabled !== 'object') state.customOutputEnabled = {};
          Object.keys(state.customOutputSettings).forEach((key) => {
            state.customOutputSettings[key] = {
              ...state.customOutputSettings[key],
              autosizerActive: false,
              primaryViewportWidth: null,
              primaryViewportHeight: null,
              allInstances: null,
              instanceCount: 0,
            };
          });
        }
      },
    }
  )
);

export default useLyricsStore;
