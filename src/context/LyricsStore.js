import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LyricsStore');

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
  showBibleVersion: true,
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
  showBibleVersion: true,
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
  showOffScreenImage: false,
  offScreenMedia: null,
  offScreenMediaName: '',
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
  showBibleVersion: true,
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
      bibleVersion: '',
      lyricsSections: [],
      lineToSection: {},
      isOutputOn: true,
      autoTurnOnOutput: true,
      outputActions: [{ id: crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`, endpoint: 'http://localhost:5505/', onAction: '', offAction: '', payloadFormat: 'boolean' }],
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
      performanceSettings: {
        lowPowerMode: false,
        disableVideoPreloading: false,
        reducedGraphics: false,
        disableHardwareAcceleration: false,
        gpuEffects: true,
      },
      lyricsTimestamps: [],
      hasSeenIntelligentAutoplayInfo: false,
      pendingSavedVersion: null,
      sidebarCollapsed: false,
      settingsCollapsed: false,
      sidebarWidth: 430,
      headerCompact: false,
      vimMode: false,
      autoGroupLines: true,
      defaultLayout: 'bible-sidebar',
      uiScale: 100,
      fHintEnabled: true,
      modeTemplates: {
        output1: { enabled: false, song: null, bible: null },
        output2: { enabled: false, song: null, bible: null },
        stage: { enabled: false, song: null, bible: null },
      },
      _lastAppliedModeTemplate: {},

      setLyrics: (lines) => {
        log.info('Lyrics loaded', { lineCount: lines?.length ?? 0 });
        set({ lyrics: Array.isArray(lines) ? lines : [] });
      },
      setLyricsSections: (sections) => set({ lyricsSections: Array.isArray(sections) ? sections : [] }),
      setLineToSection: (mapping) => set({ lineToSection: mapping && typeof mapping === 'object' ? mapping : {} }),
      setRawLyricsContent: (content) => set({ rawLyricsContent: content }),
      setLyricsFileName: (name) => {
        log.info('Lyrics file changed', { name });
        set({ lyricsFileName: name, bibleVersion: '' });
      },
      setBibleVersion: (version) => {
        log.info('Bible version changed', { version });
        set({ bibleVersion: version || '' });
      },
      selectLine: (index) => {
        log.debug('Line selected', { index });
        set({ selectedLine: index });
      },
      setIsOutputOn: (state) => {
        log.info('Output toggled', { isOutputOn: state });
        set({ isOutputOn: state });
      },
      setAutoTurnOnOutput: (auto) => set({ autoTurnOnOutput: auto }),
      setOutputActions: (actions) => set({ outputActions: actions }),
      addOutputAction: () => set((state) => ({
        outputActions: [...state.outputActions, { id: crypto.randomUUID?.() || String(Date.now()), endpoint: 'http://localhost:5505/', onAction: '', offAction: '', payloadFormat: 'boolean', enabled: true }],
      })),
      removeOutputAction: (id) => set((state) => ({
        outputActions: state.outputActions.filter((a) => a.id !== id),
      })),
      updateOutputAction: (id, updates) => set((state) => ({
        outputActions: state.outputActions.map((a) => a.id === id ? { ...a, ...updates } : a),
      })),
      httpActionButtons: [],
      setHttpActionButtons: (buttons) => set({ httpActionButtons: Array.isArray(buttons) ? buttons : [] }),
      addHttpActionButton: () => set((state) => ({
        httpActionButtons: [
          ...(Array.isArray(state.httpActionButtons) ? state.httpActionButtons : []),
          {
            id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
            label: 'HTTP',
            url: 'http://localhost:8080/trigger',
            method: 'POST',
            headers: '{"Content-Type":"application/json"}',
            body: '',
          },
        ],
      })),
      removeHttpActionButton: (id) => set((state) => ({
        httpActionButtons: (state.httpActionButtons || []).filter((b) => b.id !== id),
      })),
      updateHttpActionButton: (id, updates) => set((state) => ({
        httpActionButtons: (state.httpActionButtons || []).map((b) => b.id === id ? { ...b, ...updates } : b),
      })),
      setOutput1Enabled: (enabled) => set({ output1Enabled: enabled }),
      setOutput2Enabled: (enabled) => set({ output2Enabled: enabled }),
      setStageEnabled: (enabled) => set({ stageEnabled: enabled }),
      setCustomOutputEnabled: (outputKey, enabled) => {
        log.info('Custom output toggled', { outputKey, enabled });
        set((state) => ({
          customOutputEnabled: {
            ...state.customOutputEnabled,
            [outputKey]: enabled,
          },
        }));
      },
      setDarkMode: (mode) => set({ darkMode: mode }),
      setHasSeenWelcome: (seen) => set({ hasSeenWelcome: seen }),
      setSetlistFiles: (files) => {
        log.info('Setlist files updated', { count: files.length });
        set({ setlistFiles: files });
      },
      setIsDesktopApp: (isDesktop) => set({ isDesktopApp: isDesktop }),
      setSetlistModalOpen: (open) => set({ setlistModalOpen: open }),
      setSongMetadata: (metadata) => set({ songMetadata: metadata }),
      setAutoplaySettings: (settings) => set({ autoplaySettings: settings }),
      setPerformanceSettings: (settings) => set((state) => ({
        performanceSettings: { ...state.performanceSettings, ...settings }
      })),
      setLyricsTimestamps: (timestamps) => set({ lyricsTimestamps: timestamps }),
      setHasSeenIntelligentAutoplayInfo: (seen) => set({ hasSeenIntelligentAutoplayInfo: seen }),
      setPendingSavedVersion: (payload) => set({ pendingSavedVersion: payload || null }),
      clearPendingSavedVersion: () => set({ pendingSavedVersion: null }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setDefaultLayout: (layout) => set({ defaultLayout: layout }),
      setUiScale: (scale) => set({ uiScale: Math.min(150, Math.max(75, Math.round(scale) || 100)) }),
      setSettingsCollapsed: (collapsed) => set({ settingsCollapsed: collapsed }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setHeaderCompact: (compact) => set({ headerCompact: compact }),
      setVimMode: (enabled) => set({ vimMode: enabled }),
      setAutoGroupLines: (enabled) => set({ autoGroupLines: !!enabled }),
      setFHintEnabled: (enabled) => set({ fHintEnabled: !!enabled }),
      setModeTemplateEnabled: (outputKey, enabled) => set((state) => ({
        modeTemplates: {
          ...(state.modeTemplates || {}),
          [outputKey]: {
            ...(state.modeTemplates?.[outputKey] || { enabled: false, song: null, bible: null }),
            enabled: !!enabled,
          },
        },
      })),
      setModeTemplate: (outputKey, mode, templateId) => set((state) => ({
        modeTemplates: {
          ...(state.modeTemplates || {}),
          [outputKey]: {
            ...(state.modeTemplates?.[outputKey] || { enabled: false, song: null, bible: null }),
            [mode]: templateId ?? null,
          },
        },
      })),
      getModeTemplate: (outputKey, mode) => {
        const state = get();
        return state.modeTemplates?.[outputKey]?.[mode] ?? null;
      },
      isModeTemplateEnabled: (outputKey) => {
        const state = get();
        return !!state.modeTemplates?.[outputKey]?.enabled;
      },
      copyModeTemplates: (fromKey, toKeys, opts = {}) => set((state) => {
        const src = state.modeTemplates?.[fromKey];
        if (!src) return state;
        const next = { ...(state.modeTemplates || {}) };
        for (const toKey of toKeys || []) {
          if (!toKey || toKey === fromKey) continue;
          const target = next[toKey] || { enabled: false, song: null, bible: null };
          next[toKey] = {
            enabled: opts.includeEnabled ? !!src.enabled : target.enabled,
            song: src.song ?? null,
            bible: src.bible ?? null,
          };
        }
        return { modeTemplates: next };
      }),
      setLastAppliedModeTemplate: (outputKey, entry) => set((state) => ({
        _lastAppliedModeTemplate: {
          ...(state._lastAppliedModeTemplate || {}),
          [outputKey]: entry,
        },
      })),
      clearLastAppliedModeTemplate: (outputKey) => set((state) => {
        if (!outputKey) return { _lastAppliedModeTemplate: {} };
        const { [outputKey]: _removed, ...rest } = state._lastAppliedModeTemplate || {};
        return { _lastAppliedModeTemplate: rest };
      }),
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
        log.info('Creating custom output', { name, slug, type, sourceOutputKey });
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
          modeTemplates: {
            ...(current.modeTemplates || {}),
            [id]: { enabled: false, song: null, bible: null },
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
        const { [outputKey]: _removedMode, ...modeTemplates } = state.modeTemplates || {};
        const { [outputKey]: _removedLast, ..._lastAppliedModeTemplate } = state._lastAppliedModeTemplate || {};
        return {
          customOutputs: state.customOutputs.filter((output) => output.id !== outputKey),
          customOutputSettings,
          customOutputEnabled,
          modeTemplates,
          _lastAppliedModeTemplate,
        };
      }),
      updateOutputSettings: (output, newSettings) => {
        log.debug('Output settings updated', { output, settingKeys: Object.keys(newSettings) });
        return set((state) => {
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
        });
      },
    }),
    {
      name: 'lyrics-store',
      partialize: (state) => ({
        lyrics: state.lyrics,
        rawLyricsContent: state.rawLyricsContent,
        selectedLine: state.selectedLine,
        lyricsFileName: state.lyricsFileName,
        bibleVersion: state.bibleVersion || '',
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
        performanceSettings: state.performanceSettings,
        lyricsTimestamps: state.lyricsTimestamps,
        lyricsHistory: Array.isArray(state.lyricsHistory) ? state.lyricsHistory.slice(0, 10) : [],
        hasSeenIntelligentAutoplayInfo: state.hasSeenIntelligentAutoplayInfo,
        sidebarCollapsed: state.sidebarCollapsed,
        settingsCollapsed: state.settingsCollapsed,
        sidebarWidth: state.sidebarWidth,
        headerCompact: state.headerCompact,
        vimMode: state.vimMode,
        autoGroupLines: state.autoGroupLines,
        autoTurnOnOutput: state.autoTurnOnOutput,
        outputActions: state.outputActions,
        httpActionButtons: Array.isArray(state.httpActionButtons) ? state.httpActionButtons : [],
        defaultLayout: state.defaultLayout,
        uiScale: state.uiScale,
        fHintEnabled: state.fHintEnabled ?? true,
        modeTemplates: state.modeTemplates || {
          output1: { enabled: false, song: null, bible: null },
          output2: { enabled: false, song: null, bible: null },
          stage: { enabled: false, song: null, bible: null },
        },
      }),
      onRehydrateStorage: () => (state) => {
        log.info('LyricsStore rehydrated from persistence', { hasState: !!state });
        if (state) {
          if (state.outputActionEndpoint !== undefined || state.outputOnActionName !== undefined) {
            const oldEndpoint = state.outputActionEndpoint || 'http://localhost:5505/';
            const oldOnAction = state.outputOnActionName || '';
            const oldOffAction = state.outputOffActionName || '';
            state.outputActions = [{ id: crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`, endpoint: oldEndpoint, onAction: oldOnAction, offAction: oldOffAction, payloadFormat: 'action' }];
            delete state.outputActionEndpoint;
            delete state.outputOnActionName;
            delete state.outputOffActionName;
          }
          if (!state.outputActions || !Array.isArray(state.outputActions) || state.outputActions.length === 0) {
            state.outputActions = [{ id: crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`, endpoint: 'http://localhost:5505/', onAction: '', offAction: '', payloadFormat: 'boolean' }];
          }
          state.outputActions = state.outputActions.map((a) => ({
            ...a,
            payloadFormat: a.payloadFormat || 'action',
            enabled: a.enabled !== false,
          }));
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
          if (state.fHintEnabled === undefined) state.fHintEnabled = true;
          if (!Array.isArray(state.httpActionButtons)) state.httpActionButtons = [];
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
          // modeTemplates migration + legacy global flag
          if (state.modeTemplatesEnabled !== undefined && !state.modeTemplates) {
            const legacyEnabled = !!state.modeTemplatesEnabled;
            state.modeTemplates = {
              output1: { enabled: legacyEnabled, song: null, bible: null },
              output2: { enabled: legacyEnabled, song: null, bible: null },
              stage: { enabled: legacyEnabled, song: null, bible: null },
            };
            delete state.modeTemplatesEnabled;
          }
          if (!state.modeTemplates || typeof state.modeTemplates !== 'object') {
            state.modeTemplates = {
              output1: { enabled: false, song: null, bible: null },
              output2: { enabled: false, song: null, bible: null },
              stage: { enabled: false, song: null, bible: null },
            };
          }
          for (const key of ['output1', 'output2', 'stage']) {
            if (!state.modeTemplates[key] || typeof state.modeTemplates[key] !== 'object') {
              state.modeTemplates[key] = { enabled: false, song: null, bible: null };
            } else {
              state.modeTemplates[key] = {
                enabled: !!state.modeTemplates[key].enabled,
                song: state.modeTemplates[key].song ?? null,
                bible: state.modeTemplates[key].bible ?? null,
              };
            }
          }
          if (Array.isArray(state.customOutputs)) {
            for (const o of state.customOutputs) {
              const k = o.id || o.key;
              if (k && !state.modeTemplates[k]) {
                state.modeTemplates[k] = { enabled: false, song: null, bible: null };
              }
            }
          }
          // prune orphaned modeTemplates entries
          {
            const validKeys = new Set(['output1', 'output2', 'stage', ...(Array.isArray(state.customOutputs) ? state.customOutputs.map((o) => o.id) : [])]);
            for (const k of Object.keys(state.modeTemplates)) {
              if (!validKeys.has(k)) delete state.modeTemplates[k];
            }
          }
          if (!state._lastAppliedModeTemplate || typeof state._lastAppliedModeTemplate !== 'object') state._lastAppliedModeTemplate = {};
        }
      },
    }
  )
);

log.info('LyricsStore initialized');

export default useLyricsStore;
