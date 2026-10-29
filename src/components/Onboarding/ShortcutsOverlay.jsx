import React from 'react';
import { X, Keyboard } from 'lucide-react';

const GROUPS = [
  { title: 'Slides', keys: [['↓ / ↑ or Space', 'Fire next / previous slide'], ['Click a row', 'Fire that slide']] },
  { title: 'Show', keys: [['L', 'Go LIVE'], ['C', 'CLEAR output'], ['B', 'BLACKOUT'], ['Esc', 'Close dialogs']] },
  { title: 'Library', keys: [['Ctrl+O', 'Open lyrics file'], ['Ctrl+Shift+O', 'Online lyrics search'], ['Ctrl+Shift+S', 'Open setlist']] },
  { title: 'This app', keys: [['?', 'This cheat-sheet'], ['F', 'F-hint click mode (if enabled)']] },
];

export default function ShortcutsOverlay({ darkMode, onClose }) {
  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative w-full max-w-md rounded-xl border shadow-2xl p-5 space-y-4 ${darkMode ? 'bg-gray-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><Keyboard className="h-4 w-4" /> Shortcuts</h2>
          <button onClick={onClose} aria-label="Close shortcuts" className="p-1.5 rounded hover:bg-black/10"><X className="h-4 w-4" /></button>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{g.title}</div>
            <div className="space-y-1">
              {g.keys.map(([k, desc]) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <kbd className={`px-1.5 py-0.5 rounded font-mono ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>{k}</kbd>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
