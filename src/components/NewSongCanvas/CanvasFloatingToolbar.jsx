import React from 'react';
import { CaseSensitive, CaseUpper, CaseLower, Guitar, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { CASING_MODES } from '@/utils/textCasing';
import { createLogger } from '@/utils/logger';

const log = createLogger('CanvasFloatingToolbar');

const SECTION_CHIPS = ['Verse', 'Chorus', 'Bridge'];

const CanvasFloatingToolbar = ({
  darkMode = true,
  disabled = false,
  vimMode = false,
  vimState = 'normal',
  onToggleVim = null,
  onApplyCasing = null,
  onStripChords = null,
  onInsertSection = null,
}) => {
  log.debug('CanvasFloatingToolbar render', { vimMode, vimState, disabled });

  const ghostClass = darkMode
    ? 'text-gray-200 hover:text-white hover:bg-gray-700/70 active:bg-gray-700/80 focus-visible:ring-1 focus-visible:ring-blue-500/60 motion-reduce:transition-none'
    : 'motion-reduce:transition-none';

  const handleCasing = (mode) => {
    if (disabled || typeof onApplyCasing !== 'function') return;
    onApplyCasing(mode);
  };

  const dividerClass = `w-px h-6 ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`;

  return (
    <div
      data-testid="canvas-floating-toolbar"
      role="toolbar"
      aria-label="Song canvas formatting tools"
      className={`flex flex-wrap items-center justify-start gap-1.5 rounded-md border px-2 py-1.5 ${
        darkMode ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <span
        className={`hidden sm:inline px-1 text-[11px] font-bold uppercase tracking-wider ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}
        aria-hidden="true"
      >
        Format
      </span>

      <Tooltip content="Title Case — capitalize every word" side="bottom">
        <Button
          onClick={() => handleCasing(CASING_MODES.TITLE)}
          disabled={disabled}
          variant="ghost"
          size="sm"
          className={ghostClass}
          title="Title Case"
          aria-label="Apply Title Case"
          data-testid="canvas-casing-title"
        >
          <CaseSensitive className="w-4 h-4" />
          <span className="hidden lg:inline text-xs">Title</span>
        </Button>
      </Tooltip>
      <Tooltip content="UPPER CASE — all caps" side="bottom">
        <Button
          onClick={() => handleCasing(CASING_MODES.UPPER)}
          disabled={disabled}
          variant="ghost"
          size="sm"
          className={ghostClass}
          title="UPPER CASE"
          aria-label="Apply UPPER CASE"
          data-testid="canvas-casing-upper"
        >
          <CaseUpper className="w-4 h-4" />
          <span className="hidden lg:inline text-xs">UPPER</span>
        </Button>
      </Tooltip>
      <Tooltip content="Sentence case — first word capitalized" side="bottom">
        <Button
          onClick={() => handleCasing(CASING_MODES.SENTENCE)}
          disabled={disabled}
          variant="ghost"
          size="sm"
          className={ghostClass}
          title="Sentence case"
          aria-label="Apply sentence case"
          data-testid="canvas-casing-sentence"
        >
          <CaseLower className="w-4 h-4" />
          <span className="hidden lg:inline text-xs">Sentence</span>
        </Button>
      </Tooltip>

      <div className={dividerClass} aria-hidden="true" />

      <Tooltip content="Strip chords — remove [Am] chords and chord-only lines, keep lyrics" side="bottom">
        <Button
          onClick={() => {
            if (disabled || typeof onStripChords !== 'function') return;
            onStripChords();
          }}
          disabled={disabled}
          variant="ghost"
          size="sm"
          className={ghostClass}
          title="Strip chords"
          aria-label="Strip chords from lyrics"
          data-testid="canvas-strip-chords"
        >
          <Guitar className="w-4 h-4" />
          <span className="hidden lg:inline text-xs">Strip chords</span>
        </Button>
      </Tooltip>

      <div className={dividerClass} aria-hidden="true" />

      <ListOrdered
        className={`w-4 h-4 ml-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
        aria-hidden="true"
      />
      {SECTION_CHIPS.map((section) => (
        <Button
          key={section}
          onClick={() => {
            if (disabled || typeof onInsertSection !== 'function') return;
            onInsertSection(section);
          }}
          disabled={disabled}
          variant="ghost"
          size="sm"
          className={`${ghostClass} text-xs font-semibold`}
          title={`Insert [${section}] section`}
          aria-label={`Insert ${section} section`}
          data-testid={`canvas-section-${section.toLowerCase()}`}
        >
          [{section}]
        </Button>
      ))}

      {typeof onToggleVim === 'function' && (
        <>
          <div className={dividerClass} aria-hidden="true" />
          <Tooltip content={vimMode ? 'Vim mode ON — click to disable' : 'Enable vim keybindings'} side="bottom">
            <Button
              onClick={onToggleVim}
              variant="ghost"
              size="sm"
              className={`${ghostClass} ${
                vimMode
                  ? darkMode
                    ? 'bg-green-900/40 text-green-400'
                    : 'bg-green-50 text-green-700'
                  : ''
              }`}
              title={vimMode ? 'Vim mode ON' : 'Vim mode OFF'}
              aria-label={vimMode ? 'Disable vim mode' : 'Enable vim mode'}
              aria-pressed={vimMode}
              data-testid="canvas-vim-toggle"
            >
              <span className="font-mono text-xs font-bold" aria-hidden="true">
                V
              </span>
              {vimMode && (
                <span className="hidden lg:inline text-xs font-mono" aria-live="polite">
                  {String(vimState).toUpperCase()}
                </span>
              )}
            </Button>
          </Tooltip>
        </>
      )}
    </div>
  );
};

export default CanvasFloatingToolbar;
