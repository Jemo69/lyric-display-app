export const SHORTCUTS = [
  {
    category: 'File Operations',
    items: [
      { label: 'Open Lyrics File', combo: 'Ctrl/Cmd + O' },
      { label: 'New Lyrics', combo: 'Ctrl/Cmd + N' },
      { label: 'Edit Lyrics', combo: 'Ctrl/Cmd + E' },
      { label: 'Open Setlist Modal', combo: 'Ctrl/Cmd + Shift + S' },
      { label: 'Open Online Lyrics Search', combo: 'Ctrl/Cmd + Shift + O' },
      { label: 'Add Current Song to Setlist', combo: 'Ctrl/Cmd + Alt + S' },
    ]
  },
  {
    category: 'Search & Navigation',
    items: [
      { label: 'Focus Search Bar (songs or Bible by mode)', combo: 'Ctrl/Cmd + F' },
      { label: 'Clear Search', combo: 'Escape' },
      { label: 'Jump to First Match', combo: 'Enter' },
      { label: 'Switch to Bible Section', combo: 'Ctrl/Cmd + B' },
      { label: 'Focus Bible Search Bar', combo: 'Ctrl/Cmd + Shift + F' },
      { label: 'Cycle Bible Translation', combo: 'Ctrl/Cmd + Shift + B' },
      { label: 'Open Keyboard Shortcuts Menu', combo: 'Ctrl/Cmd + /' },
      { label: 'Navigate Previous Search Results', combo: 'Shift + ↑' },
      { label: 'Navigate Next Search Results', combo: 'Shift + ↓' },
      { label: 'Navigate to Previous Setlist Song', combo: 'Ctrl/Cmd + Shift + ←' },
      { label: 'Navigate to Next Setlist Song', combo: 'Ctrl/Cmd + Shift + →' },
    ]
  },
  {
    category: 'Playback Control',
    items: [
      { label: 'Toggle Autoplay', combo: 'Ctrl/Cmd + P' },
      { label: 'Toggle Intelligent Autoplay', combo: 'Ctrl/Cmd + Shift + P' },
      { label: 'Toggle Display Output', combo: 'Ctrl/Cmd + T' },
      { label: 'Clear Output (deselect active line)', combo: 'Ctrl/Cmd + C' },
    ]
  },
  {
    category: 'Lyric Navigation',
    items: [
      { label: 'Navigate to Previous Line', combo: '↑ / Numpad ↑ / k' },
      { label: 'Navigate to Next Line', combo: '↓ / Numpad ↓ / j' },
      { label: 'Jump to First Line', combo: 'Home / gg' },
      { label: 'Jump to Last Line', combo: 'End / G' },
    ]
  },
  {
    category: 'Song Canvas',
    items: [
      { label: 'Go Back to Control Panel', combo: 'Escape / Backspace' },
      { label: 'Save File', combo: 'Ctrl/Cmd + S' },
      { label: 'Save and Load', combo: 'Ctrl/Cmd + Shift + L' },
      { label: 'Cleanup Lyrics', combo: 'Ctrl/Cmd + Shift + C' },
      { label: 'Undo', combo: 'Ctrl/Cmd + Z' },
      { label: 'Redo', combo: 'Ctrl/Cmd + Shift + Z' },
    ]
  },
  {
    category: 'Canvas Editing',
    items: [
      { label: 'Add Translation Line', combo: 'Ctrl/Cmd + T' },
      { label: 'Duplicate Line', combo: 'Ctrl/Cmd + D' },
      { label: 'Select Line', combo: 'Ctrl/Cmd + L' },
    ]
  },
  {
    category: 'Vim Mode (Song Canvas)',
    description: 'Enable vim mode toggle in the toolbar to use these keys',
    items: [
      { label: 'Move Down', combo: 'j' },
      { label: 'Move Up', combo: 'k' },
      { label: 'Move Left', combo: 'h' },
      { label: 'Move Right', combo: 'l' },
      { label: 'Word Forward', combo: 'w' },
      { label: 'Word Backward', combo: 'b' },
      { label: 'Line Start', combo: '0' },
      { label: 'Line End', combo: '$' },
      { label: 'Go to First Line', combo: 'gg' },
      { label: 'Go to Last Line', combo: 'G' },
      { label: 'Enter Insert Mode', combo: 'i / I / a / A / o / O' },
      { label: 'Exit Insert Mode', combo: 'Escape' },
      { label: 'Delete Line', combo: 'dd' },
      { label: 'Change Line', combo: 'cc' },
      { label: 'Yank (Copy) Line', combo: 'yy' },
      { label: 'Paste After', combo: 'p' },
      { label: 'Delete Character', combo: 'x' },
      { label: 'Undo', combo: 'u' },
      { label: 'Repeat Count', combo: '[number] + motion (e.g. 5j)' },
    ]
  },
  {
    category: 'Vim Text Objects (Song Canvas)',
    description: 'Use after d (delete), c (change), or y (yank) operators',
    items: [
      { label: 'Delete Inner Word', combo: 'diw' },
      { label: 'Delete A Word', combo: 'daw' },
      { label: 'Change Inner Word', combo: 'ciw' },
      { label: 'Change A Word', combo: 'caw' },
      { label: 'Yank Inner Word', combo: 'yiw' },
      { label: 'Yank A Word', combo: 'yaw' },
      { label: 'Delete Inside Quotes', combo: 'di" / di\' / di`' },
      { label: 'Delete Around Quotes', combo: 'da" / da\' / da`' },
      { label: 'Delete Inside Brackets', combo: 'di( / di[ / di{' },
      { label: 'Delete Around Brackets', combo: 'da( / da[ / da{' },
      { label: 'Change Inside Quotes', combo: 'ci" / ci\' / ci`' },
      { label: 'Change Inside Brackets', combo: 'ci( / ci[ / ci{' },
      { label: 'Yank Inside Quotes', combo: 'yi" / yi\' / yi`' },
      { label: 'Yank Inside Brackets', combo: 'yi( / yi[ / yi{' },
      { label: 'Delete Inner Line', combo: 'dil' },
      { label: 'Delete A Line (with newline)', combo: 'dal' },
      { label: 'Change Inner Line', combo: 'cil' },
      { label: 'Yank Inner Line', combo: 'yil' },
    ]
  },
  {
    category: 'Output Settings',
    items: [
      { label: 'Switch to Output 1 tab', combo: '1' },
      { label: 'Switch to Output 2 tab', combo: '2' },
      { label: 'Switch to Stage tab', combo: '3' },
    ]
  },
];