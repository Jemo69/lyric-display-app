// Central definition of every app keyboard shortcut.
// `DEFAULT_BINDINGS` maps a stable shortcut id to its default TanStack Hotkey combo string.
// `SHORTCUT_GROUPS` drives the User Preferences shortcut menu (categories + labels).
//
// Combo format uses TanStack's canonical template strings:
//   - `Mod` resolves to Cmd on macOS and Ctrl on Windows/Linux.
//   - Modifiers are ordered Mod, Alt, Shift, then the key (e.g. `Mod+Shift+B`).

export const DEFAULT_BINDINGS = {
  // File operations
  openFile: 'Mod+O',
  newSong: 'Mod+N',
  editLyrics: 'Mod+E',
  openSetlist: 'Mod+Shift+S',
  openOnlineSearch: 'Mod+Shift+O',
  addToSetlist: 'Mod+Alt+S',

  // Search & navigation
  focusSearch: 'Mod+F',
  clearSearch: 'Escape',
  jumpToMatch: 'Enter',
  switchToBible: 'Mod+B',
  focusBibleSearch: 'Mod+Shift+F',
  cycleTranslation: 'Mod+Shift+B',
  showShortcuts: 'Mod+/',
  prevSetlistSong: 'Mod+Shift+ArrowLeft',
  nextSetlistSong: 'Mod+Shift+ArrowRight',

  // Playback control
  toggleAutoplay: 'Mod+P',
  toggleIntelligentAutoplay: 'Mod+Shift+P',
  toggleDisplayOutput: 'Mod+T',
  clearOutput: 'Mod+C',

  // Lyric navigation (single keys; ignored while typing)
  prevLine: 'ArrowUp',
  nextLine: 'ArrowDown',
  firstLine: 'Home',
  lastLine: 'End',

  // Output tabs
  output1: '1',
  output2: '2',
  stage: '3',
};

export const SHORTCUT_GROUPS = [
  {
    category: 'File Operations',
    items: [
      { id: 'openFile', label: 'Open Lyrics File' },
      { id: 'newSong', label: 'New Lyrics' },
      { id: 'editLyrics', label: 'Edit Lyrics' },
      { id: 'openSetlist', label: 'Open Setlist Modal' },
      { id: 'openOnlineSearch', label: 'Open Online Lyrics Search' },
      { id: 'addToSetlist', label: 'Add Current Song to Setlist' },
    ],
  },
  {
    category: 'Search & Navigation',
    items: [
      { id: 'focusSearch', label: 'Focus Search (songs or Bible by mode)' },
      { id: 'clearSearch', label: 'Clear Search' },
      { id: 'jumpToMatch', label: 'Jump to First Match' },
      { id: 'switchToBible', label: 'Switch to Bible' },
      { id: 'focusBibleSearch', label: 'Switch to Bible and Focus Search' },
      { id: 'cycleTranslation', label: 'Cycle Bible Translation' },
      { id: 'showShortcuts', label: 'Open Keyboard Shortcuts Menu' },
      { id: 'prevSetlistSong', label: 'Previous Setlist Song' },
      { id: 'nextSetlistSong', label: 'Next Setlist Song' },
    ],
  },
  {
    category: 'Playback Control',
    items: [
      { id: 'toggleAutoplay', label: 'Toggle Autoplay' },
      { id: 'toggleIntelligentAutoplay', label: 'Toggle Intelligent Autoplay' },
      { id: 'toggleDisplayOutput', label: 'Toggle Display Output' },
      { id: 'clearOutput', label: 'Clear Output (deselect active line)' },
    ],
  },
  {
    category: 'Lyric Navigation',
    items: [
      { id: 'prevLine', label: 'Previous Line' },
      { id: 'nextLine', label: 'Next Line' },
      { id: 'firstLine', label: 'First Line' },
      { id: 'lastLine', label: 'Last Line' },
    ],
  },
  {
    category: 'Output Tabs',
    items: [
      { id: 'output1', label: 'Switch to Output 1' },
      { id: 'output2', label: 'Switch to Output 2' },
      { id: 'stage', label: 'Switch to Stage' },
    ],
  },
];

// Flat list of every shortcut id (used by the store to detect unknown/removed keys).
export const ALL_SHORTCUT_IDS = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => i.id));
