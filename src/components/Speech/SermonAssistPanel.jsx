import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, PanelRightClose, PanelRightOpen } from 'lucide-react';
import useSpeechStore from '../../context/SpeechStore';

// Phase 0 placeholder status copy — no engine is attached yet.
const STATUS_LABELS = {
  idle: 'Idle',
  starting: 'Starting',
  listening: 'Listening',
  transcribing: 'Transcribing',
  error: 'Error',
};

// Section 10 privacy requirement: an accurate, always-visible mode indicator.
// Local leads; cloud is one option, not the default.
const modeLabelFor = (state) => {
  if (state.where === 'local') return `Local · ${state.modelId}`;
  if (state.where === 'network') return 'Remote engine';
  return `Cloud · ${state.cloudProviderId ?? 'not configured'}`;
};

const SermonAssistRail = ({ darkMode }) => {
  const status = useSpeechStore((state) => state.status);
  const where = useSpeechStore((state) => state.where);
  const modelId = useSpeechStore((state) => state.modelId);
  const cloudProviderId = useSpeechStore((state) => state.cloudProviderId);
  const ui = useSpeechStore((state) => state.ui);
  const setUI = useSpeechStore((state) => state.setUI);

  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizing && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      const min = 280;
      const max = Math.max(min + 40, rect.width - 280);
      const clamped = Math.min(Math.max(newWidth, min), max);
      // only update if within bounds — avoids jitter at edges
      if (newWidth >= min && newWidth <= max) {
        setUI({ railWidth: clamped });
      } else if (newWidth < min) {
        setUI({ railWidth: min });
      } else if (newWidth > max) {
        setUI({ railWidth: max });
      }
    }
  }, [isResizing, setUI]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Collapsed: a narrow summon affordance on the right edge — nothing else.
  if (ui.railCollapsed) {
    return (
      <aside
        className={`flex-shrink-0 self-stretch flex flex-col items-center border-l w-8 py-2 ${
          darkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'
        }`}
      >
        <button
          type="button"
          data-testid="sermon-assist-open"
          aria-label="Open Sermon Assist rail"
          title="Open Sermon Assist"
          onClick={() => setUI({ railCollapsed: false })}
          className={`p-1.5 rounded-md transition-colors ${
            darkMode
              ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={containerRef}
      style={{ width: ui.railWidth }}
      className={`relative flex-shrink-0 flex flex-col h-full min-h-0 border-l transition-[width] duration-300 ease-in-out ${
        darkMode
          ? 'border-gray-800 bg-gray-950 text-gray-100'
          : 'border-gray-200 bg-white text-gray-900'
      }`}
    >
      {/* Resize Handle — right-side rail: handle sits on the panel's LEFT edge */}
      <div
        onMouseDown={startResizing}
        className={`absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize z-30 group flex items-center justify-center hover:bg-blue-500/20 transition-colors`}
      >
        <div className={`w-1 h-full bg-transparent group-hover:bg-blue-500/30 transition-colors`}></div>
        <GripVertical className="absolute w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Header */}
      <div
        className={`flex-shrink-0 flex items-center justify-between gap-2 border-b px-4 py-3 ${
          darkMode ? 'border-gray-800' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider truncate">
            Sermon Assist
          </span>
          <span
            data-testid="speech-status-chip"
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              status === 'error'
                ? 'border-red-500/40 text-red-500'
                : darkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-400'
                  : 'border-gray-200 bg-gray-100 text-gray-500'
            }`}
          >
            {STATUS_LABELS[status] ?? 'Idle'}
          </span>
        </div>
        <button
          type="button"
          data-testid="sermon-assist-collapse"
          aria-label="Collapse Sermon Assist rail"
          title="Collapse Sermon Assist"
          onClick={() => setUI({ railCollapsed: true })}
          className={`p-1.5 rounded-md transition-colors ${
            darkMode
              ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <section
          className={`rounded-xl border p-5 space-y-4 transition-all ${
            darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
          }`}
        >
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Transcript
          </h3>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Transcript appears here when listening starts.
          </p>
        </section>

        <section
          className={`rounded-xl border p-5 space-y-4 transition-all ${
            darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
          }`}
        >
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Suggestions
          </h3>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Next lyric line, Bible verse, and sermon note suggestions appear here.
          </p>
          {/* D5: nothing reaches an output window until the operator presses send. */}
        </section>

        {/* Section 10: always-visible, accurate mode indicator */}
        <div
          data-testid="speech-mode-indicator"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            darkMode ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          {modeLabelFor({ where, modelId, cloudProviderId })}
        </div>
      </div>

      {/* Footer — the cold-start reality, stated plainly */}
      <p
        className={`flex-shrink-0 border-t px-4 py-3 text-[11px] leading-relaxed ${
          darkMode ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'
        }`}
      >
        Microphone access is off. No audio is captured or sent until you enable Sermon Assist.
      </p>
    </aside>
  );
};

export default function SermonAssistPanel({ darkMode = false }) {
  const enabled = useSpeechStore((state) => state.enabled);
  // Phase 0 exit criterion: disabled means hidden entirely — zero DOM nodes.
  if (!enabled) return null;
  return <SermonAssistRail darkMode={darkMode} />;
}
