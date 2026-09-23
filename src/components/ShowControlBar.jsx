import React from 'react';
import { MonitorPlay, Eraser, MonitorOff, Home } from 'lucide-react';

export const SHOW_STATES = ['LIVE', 'CLEAR', 'BLACKOUT', 'LOGO'];

const STATE_DEFS = [
  {
    state: 'LIVE',
    label: 'Live',
    hint: 'Project lyrics normally',
    hotkey: 'Mod+Shift+1',
    Icon: MonitorPlay,
  },
  {
    state: 'CLEAR',
    label: 'Clear',
    hint: 'Hide lyrics — keep background',
    hotkey: 'Mod+Shift+2',
    Icon: Eraser,
  },
  {
    state: 'BLACKOUT',
    label: 'Blackout',
    hint: 'All outputs full black',
    hotkey: 'Mod+Shift+3',
    Icon: MonitorOff,
  },
  {
    state: 'LOGO',
    label: 'Logo',
    hint: 'House slide on all outputs',
    hotkey: 'Mod+Shift+4',
    Icon: Home,
  },
];

/**
 * Show-control state buttons (feature #18).
 * Dark-mode-first, label + icon on every button (never color alone),
 * aria-pressed for the active state, visible focus rings.
 */
const ShowControlBar = ({
  showState = 'LIVE',
  onSelect,
  darkMode = false,
  compact = false,
  disabled = false,
}) => {
  const active = (showState || 'LIVE').toUpperCase();

  return (
    <div
      role="group"
      aria-label="Show control: live, clear, blackout, or logo"
      className={`grid ${compact ? 'grid-cols-4 gap-1.5' : 'grid-cols-2 gap-2'}`}
    >
      {STATE_DEFS.map(({ state, label, hint, hotkey, Icon }) => {
        const isActive = active === state;
        return (
          <button
            key={state}
            type="button"
            onClick={() => onSelect?.(state)}
            disabled={disabled}
            aria-pressed={isActive}
            title={`${hint} (${hotkey})`}
            className={[
              'flex items-center justify-center gap-1.5 rounded-xl border font-bold transition-colors',
              compact ? 'px-2 py-2 text-[11px]' : 'px-3 py-2.5 text-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              darkMode ? 'focus-visible:ring-sky-300 focus-visible:ring-offset-gray-950' : 'focus-visible:ring-sky-600 focus-visible:ring-offset-white',
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              isActive
                ? darkMode
                  ? 'border-sky-300 bg-sky-500/25 text-sky-100 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.6)]'
                  : 'border-sky-600 bg-sky-100 text-sky-900 shadow-[inset_0_0_0_1px_rgba(2,132,199,0.5)]'
                : darkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            <Icon className={compact ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'} aria-hidden="true" />
            <span className="truncate">{label}</span>
            {isActive && (
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${darkMode ? 'bg-sky-300' : 'bg-sky-600'}`}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ShowControlBar;
