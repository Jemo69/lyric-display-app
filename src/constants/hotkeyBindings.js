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
  openRccgTphbDb: 'Mod+Shift+D',
  addToSetlist: 'Mod+Alt+S',

  // Search & navigation
  focusSearch: 'Mod+F',
  clearSearch: 'Escape',
  jumpToMatch: 'Enter',
  switchToBible: 'Mod+B',
  focusBibleSearch: 'Mod+Shift+F',
  cycleTranslation: 'Mod+Shift+B',
  openBibleChapterEditor: 'Alt+Shift+Enter',
  showShortcuts: 'Mod+/',
  prevSetlistSong: 'Mod+Shift+ArrowLeft',
  nextSetlistSong: 'Mod+Shift+ArrowRight',

  // Playback control
  toggleAutoplay: 'Mod+P',
  toggleIntelligentAutoplay: 'Mod+Shift+P',
  toggleDisplayOutput: 'Mod+T',
  clearOutput: 'Mod+C',
  showLive: 'Mod+Shift+1',
  showClear: 'Mod+Shift+2',
  showBlackout: 'Mod+Shift+3',
  showLogo: 'Mod+Shift+4',

  // Lyric navigation (single keys; ignored while typing)
  prevLine: 'ArrowUp',
  nextLine: 'ArrowDown',
  firstLine: 'Home',
  lastLine: 'End',

  // Output tabs
  output1: '1',
  output2: '2',
  stage: '3',

  // Sermon Assist — one keystroke that kills the microphone no matter what
  // the app is doing. `Mod+Shift+M` (M = mic/mute) was free: no other entry
  // above, no hardcoded registration in useKeyboardShortcuts, and `Mod+Shift+A`
  // stays reserved for the Phase 4 rail toggle. It is a Ctrl/Meta combo, so
  // TanStack fires it even while a text field has focus — a panic key that
  // is ignored while the operator is typing is not a panic key.
  panicStop: 'Mod+Shift+M',

  // Phase 4 rail toggle: show/hide the Sermon Assist rail. Reserved here (it
  // appeared in no binding, no menu accelerator, and no hardcoded registration
  // before Phase 4 — only in the comment above). Handler lives in
  // useSermonAssistToggle(): it flips `ui.railCollapsed` and does nothing at
  // all while Sermon Assist is off, so the key never enables the feature.
  toggleSermonAssist: 'Mod+Shift+A',

  // Verse card actions (Phase 4, plan 6.3): the committing press and the
  // labelled negative. Both are genuinely free — no entry in this file, no
  // hardcoded registration in useKeyboardShortcuts (only Alt+F4 is handled
  // there), and the app runs with Menu.setApplicationMenu(null), so there are
  // no menu accelerators to collide with.
  //
  // They are registered by VerseSuggestionCard for as long as a verse card is
  // on screen and unregistered with it: there is deliberately no standing
  // "send" key when no suggestion exists. Alt-only on purpose — TanStack's
  // default `ignoreInputs` suppresses combos without Ctrl/Meta while a text
  // field has focus, so these cannot fire while the operator is typing.
  verseSendLive: 'Alt+V',
  verseDismiss: 'Alt+X',
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
      { id: 'openRccgTphbDb', label: 'Open RCCGTPHB Song Database' },
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
      { id: 'openBibleChapterEditor', label: 'Open Bible Verse Editor (editable)' },
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
      { id: 'showLive', label: 'Show Control: Live' },
      { id: 'showClear', label: 'Show Control: Clear (background only)' },
      { id: 'showBlackout', label: 'Show Control: Blackout' },
      { id: 'showLogo', label: 'Show Control: Logo (house slide)' },
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
  {
    category: 'Sermon Assist',
    items: [
      { id: 'panicStop', label: 'Panic Stop (stop capture and close the microphone)' },
      { id: 'toggleSermonAssist', label: 'Show or Hide Sermon Assist Rail' },
      { id: 'verseSendLive', label: 'Send Suggested Verse Live (while the verse card is showing)' },
      { id: 'verseDismiss', label: 'Dismiss Suggested Verse Card (while the verse card is showing)' },
    ],
  },
];

// Flat list of every shortcut id (used by the store to detect unknown/removed keys).
export const ALL_SHORTCUT_IDS = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => i.id));
