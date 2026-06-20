import type { LyricsLine, OutputSettings } from '$lib/types';

// Lyrics store using Svelte 5 runes
function createLyricsStore() {
  let lines = $state<LyricsLine[]>([]);
  let selectedLines = $state<string[]>([]);
  let activeLine = $state<string | null>(null);
  let metadata = $state({
    title: '',
    artist: '',
    album: '',
    year: '',
  });

  // Output settings for each output
  let output1Settings = $state<OutputSettings>({
    enabled: true,
    fontFamily: 'Space Grotesk',
    fontSize: 48,
    fontWeight: 700,
    fontStyle: 'normal',
    color: '#ffffff',
    backgroundColor: '#000000',
    textAlign: 'center',
    lineHeight: 1.4,
    padding: 40,
    maxLines: 3,
    transitionDuration: 300,
    backgroundOpacity: 1,
  });

  let output2Settings = $state<OutputSettings>({
    enabled: false,
    fontFamily: 'Space Grotesk',
    fontSize: 48,
    fontWeight: 700,
    fontStyle: 'normal',
    color: '#ffffff',
    backgroundColor: '#000000',
    textAlign: 'center',
    lineHeight: 1.4,
    padding: 40,
    maxLines: 3,
    transitionDuration: 300,
    backgroundOpacity: 1,
  });

  let stageSettings = $state<OutputSettings>({
    enabled: false,
    fontFamily: 'Space Grotesk',
    fontSize: 32,
    fontWeight: 600,
    fontStyle: 'normal',
    color: '#ffffff',
    backgroundColor: '#1a1a2e',
    textAlign: 'center',
    lineHeight: 1.4,
    padding: 30,
    maxLines: 5,
    transitionDuration: 300,
    backgroundOpacity: 1,
  });

  // Dark mode
  let darkMode = $state(false);

  return {
    get lines() { return lines; },
    set lines(value: LyricsLine[]) { lines = value; },
    
    get selectedLines() { return selectedLines; },
    set selectedLines(value: string[]) { selectedLines = value; },
    
    get activeLine() { return activeLine; },
    set activeLine(value: string | null) { activeLine = value; },
    
    get metadata() { return metadata; },
    set metadata(value: typeof metadata) { metadata = value; },
    
    get output1Settings() { return output1Settings; },
    setOutput1Settings(value: Partial<OutputSettings>) { output1Settings = { ...output1Settings, ...value }; },
    
    get output2Settings() { return output2Settings; },
    setOutput2Settings(value: Partial<OutputSettings>) { output2Settings = { ...output2Settings, ...value }; },
    
    get stageSettings() { return stageSettings; },
    setStageSettings(value: Partial<OutputSettings>) { stageSettings = { ...stageSettings, ...value }; },
    
    get darkMode() { return darkMode; },
    set darkMode(value: boolean) { darkMode = value; },

    // Actions
    setActiveLine(lineId: string | null) {
      activeLine = lineId;
    },

    toggleLineSelection(lineId: string) {
      if (selectedLines.includes(lineId)) {
        selectedLines = selectedLines.filter(id => id !== lineId);
      } else {
        selectedLines = [...selectedLines, lineId];
      }
    },

    clearSelection() {
      selectedLines = [];
    },

    setLines(newLines: LyricsLine[]) {
      lines = newLines;
    },

    updateMetadata(newMetadata: Partial<typeof metadata>) {
      metadata = { ...metadata, ...newMetadata };
    },

    reset() {
      lines = [];
      selectedLines = [];
      activeLine = null;
      metadata = { title: '', artist: '', album: '', year: '' };
    }
  };
}

// Bible store
function createBibleStore() {
  let bibles = $state<Record<string, unknown>>({});
  let activeBible = $state<string | null>(null);
  let currentReference = $state({ book: '', chapter: 0, verse: 0 });
  let selectedVerses = $state<string[]>([]);

  return {
    get bibles() { return bibles; },
    set bibles(value: Record<string, unknown>) { bibles = value; },
    
    get activeBible() { return activeBible; },
    set activeBible(value: string | null) { activeBible = value; },
    
    get currentReference() { return currentReference; },
    set currentReference(value: typeof currentReference) { currentReference = value; },
    
    get selectedVerses() { return selectedVerses; },
    set selectedVerses(value: string[]) { selectedVerses = value; },

    setActiveBible(id: string | null) {
      activeBible = id;
    },

    setCurrentReference(ref: typeof currentReference) {
      currentReference = ref;
    },

    toggleVerseSelection(verseId: string) {
      if (selectedVerses.includes(verseId)) {
        selectedVerses = selectedVerses.filter(id => id !== verseId);
      } else {
        selectedVerses = [...selectedVerses, verseId];
      }
    },

    clearSelection() {
      selectedVerses = [];
    }
  };
}

// Export stores as singletons
export const lyricsStore = createLyricsStore();
export const bibleStore = createBibleStore();
