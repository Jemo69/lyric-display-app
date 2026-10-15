/**
 * TranscriptTail.jsx — the rail's live transcript (Phase 4, section "live
 * transcript tail with unsettled partials").
 *
 * HONESTY RULES held here:
 *  - FINAL segments render as settled rows: <li data-state="final">.
 *  - The provisional partial renders as ONE row flagged in words —
 *    `data-state="provisional"`, `role="status"` with an accessible name that
 *    says "provisional" (screen readers announce each update as such), and a
 *    visible "unsettled" tag in uppercase. The signal is text + semantics,
 *    never colour alone: a partial must never be mistakable for something the
 *    engine has settled on.
 *  - An empty tail renders the shipped empty-state sentence, so the section
 *    says the true thing before the mic is ever opened.
 *  - The history browser (Decision D9) mounts only after an explicit press on
 *    the toggle: `history.list()` is an IPC invoke, and nothing in this rail
 *    runs before the operator asks for it.
 *
 * Rendering performs no I/O of its own: it reads the non-persisted runtime
 * store and draws it.
 */
import React, { useState } from 'react';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';
import TranscriptHistoryBrowser from './TranscriptHistoryBrowser';

/** Shipped empty-state copy (asserted by SermonAssistPanel.test.jsx). */
export const EMPTY_TRANSCRIPT_COPY = 'Transcript appears here when listening starts.';

const TranscriptTail = ({ darkMode = false, cardClass, titleClass }) => {
  const segments = useSpeechRuntimeStore((state) => state.segments);
  const partial = useSpeechRuntimeStore((state) => state.partial);
  const [showHistory, setShowHistory] = useState(false);

  const card = cardClass ?? 'rounded-xl border p-5 space-y-4';
  const title = titleClass ?? 'text-[11px] font-bold uppercase tracking-wider';
  const muted = darkMode ? 'text-gray-500' : 'text-gray-400';
  const body = darkMode ? 'text-gray-300' : 'text-gray-700';
  const empty = segments.length === 0 && !partial;

  return (
    <section aria-label="Transcript" className={card}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={title}>Transcript</h3>
        <button
          type="button"
          data-testid="speech-history-toggle"
          aria-expanded={showHistory}
          aria-controls="sermon-assist-history"
          onClick={() => setShowHistory((open) => !open)}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            darkMode
              ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Transcript history
        </button>
      </div>

      {empty ? (
        <p className={`text-sm ${muted}`}>{EMPTY_TRANSCRIPT_COPY}</p>
      ) : (
        <div className="space-y-1.5">
          <ol className="space-y-1" aria-label="Settled transcript segments">
            {segments.map((segment, index) => (
              <li
                key={`${segment.sessionId ?? 'seg'}-${segment.tEndMs ?? index}-${index}`}
                data-testid="transcript-segment"
                data-state="final"
                data-gate={segment.gateReason ? 'discarded' : 'passed'}
                className={`text-xs leading-snug ${body}`}
              >
                {segment.gateReason ? (
                  <span
                    className={`mr-1.5 inline-block rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      darkMode
                        ? 'border-gray-700 text-gray-500'
                        : 'border-gray-300 text-gray-400'
                    }`}
                  >
                    discarded
                  </span>
                ) : null}
                {segment.text}
              </li>
            ))}
          </ol>

          {partial ? (
            <p
              data-testid="transcript-partial"
              data-state="provisional"
              role="status"
              aria-label="Provisional transcript, not yet settled"
              className={`text-xs leading-snug ${body}`}
            >
              <span
                className={`mr-1.5 inline-block rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  darkMode
                    ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
                    : 'border-amber-400 bg-amber-50 text-amber-700'
                }`}
              >
                unsettled
              </span>
              <span className="italic">{partial}</span>
            </p>
          ) : null}
        </div>
      )}

      {showHistory ? (
        <div id="sermon-assist-history" className="pt-1">
          <TranscriptHistoryBrowser darkMode={darkMode} />
        </div>
      ) : null}
    </section>
  );
};

export default TranscriptTail;
