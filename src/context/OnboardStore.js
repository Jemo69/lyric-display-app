import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandPersistentStorage } from '../utils/persistentStorage.js';

export const ONBOARD_ROLES = [
  { id: 'all', label: 'Everyone (show all)', hint: 'Default — nothing hidden.' },
  { id: 'operator', label: 'Lyrics operator', hint: 'Lyrics, show control, setlist. Hides autoplay, HTTP actions, MIDI/OSC.' },
  { id: 'preacher', label: 'Preacher / teacher', hint: 'Bible, Notes, show control. Hides outputs styling, automation.' },
  { id: 'streamer', label: 'Streamer', hint: 'Outputs, browser-source URLs, ticker. Hides Bible import, setlists.' },
  { id: 'musician', label: 'Musician', hint: 'Stage output, chords, metronome. Hides HTTP actions, automation.' },
];

// Role → store flags that simplify the UI. Only touches existing settings keys.
export const ROLE_HIDDEN = {
  operator: ['httpActions', 'hardware', 'automation'],
  preacher: ['httpActions', 'hardware', 'automation', 'modeTemplates'],
  streamer: ['bible', 'hardware', 'fHint'],
  musician: ['httpActions', 'automation', 'database'],
  all: [],
};

export const CHECKLIST_TASKS = [
  { id: 'load', label: 'Load the demo song', hint: 'Onboard settings → Load demo service, or press Ctrl+O' },
  { id: 'fire', label: 'Fire a slide', hint: 'Click any lyric row (or press ↓)' },
  { id: 'clear', label: 'Clear the output', hint: 'Show dock → CLEAR (or press C)' },
  { id: 'live', label: 'Go LIVE again', hint: 'Show dock → LIVE (or press L)' },
  { id: 'bible', label: 'Open a Bible verse', hint: 'Sidebar → Bible tab → click a verse' },
  { id: 'setlist', label: 'Open the setlist', hint: 'ListMusic toolbar button (Ctrl+Shift+S)' },
];

const initialChecklist = () => Object.fromEntries(CHECKLIST_TASKS.map((t) => [t.id, false]));

export const useOnboardStore = create()(
  persist(
    (set) => ({
      role: 'all',
      setRole: (role) => set({ role }),
      explainMode: false,
      setExplainMode: (explainMode) => set({ explainMode }),
      checklist: initialChecklist(),
      completeTask: (id) => set((s) => ({ checklist: { ...s.checklist, [id]: true } })),
      resetChecklist: () => set({ checklist: initialChecklist() }),
      actionLog: [],
      logAction: (text) =>
        set((s) => ({
          actionLog: [{ at: Date.now(), text }, ...s.actionLog].slice(0, 50),
        })),
      clearActionLog: () => set({ actionLog: [] }),
      spotlightDone: false,
      setSpotlightDone: (v) => set({ spotlightDone: v }),
      demoLoaded: false,
      setDemoLoaded: (v) => set({ demoLoaded: v }),
    }),
    {
      name: 'selah-onboard-store',
      storage: createJSONStorage(() => zustandPersistentStorage),
      partialize: (s) => ({
        role: s.role,
        explainMode: s.explainMode,
        checklist: s.checklist,
        spotlightDone: s.spotlightDone,
        demoLoaded: s.demoLoaded,
      }),
    }
  )
);
