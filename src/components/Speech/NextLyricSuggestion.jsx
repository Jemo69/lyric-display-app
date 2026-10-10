/**
 * NextLyricSuggestion.jsx — lane 1, the next lyric line.
 *
 * WHAT THE OPERATOR SEES (plan 11): the current line, the match, and the line
 * after it — because the actual question is "where am I, and where does this
 * go". The match row is the SEND TARGET and is marked as such; the row after
 * it is context, not a second action.
 *
 * WHY THE MATCH IS WHAT GETS SENT: the transcript matched a line, so the line
 * the service is on is that line. Sending the match never skips a line the
 * congregation is singing; advancing one line stays where it has always lived
 * (ArrowDown / j, already in the app).
 *
 * NOTHING AUTO-DISPLAYS: `onSend` runs on click, never on mount, never on a
 * new suggestion arriving. After the press, the card says so — the rail's own
 * feedback, not a new output.
 */
import React, { useState } from 'react';
import { sendLyricLine } from '../../hooks/useSpeechRuntime';

const NextLyricSuggestion = ({ darkMode = false, suggestion = null }) => {
  const [sent, setSent] = useState(false);

  const match = suggestion?.match ?? null;
  if (!match) return null;

  const current = suggestion.current ?? null;
  const next = suggestion.next ?? null;
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const send = () => {
    if (sendLyricLine(match.index)) setSent(true);
  };

  return (
    <div
      data-testid="suggestion-lyric"
      className={`rounded-lg border p-3 space-y-2 ${
        darkMode ? 'border-gray-800 bg-gray-950/40' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <p className={`text-[11px] font-bold uppercase tracking-wider ${muted}`}>
        Next lyric line
      </p>

      {current ? (
        <p className={`text-xs ${muted}`}>
          Now: <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>{current.text}</span>
        </p>
      ) : null}

      <p
        data-testid="lyric-send-target"
        className={`text-sm font-semibold leading-snug ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
      >
        <span aria-hidden="true">→ </span>
        {match.text}
      </p>

      {next ? (
        <p className={`text-xs ${muted}`}>
          Then: {next.text}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="lyric-send"
        onClick={send}
        className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
          darkMode
            ? 'border-blue-500/50 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
            : 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
        }`}
      >
        Send to output
      </button>

      {sent ? (
        <p
          data-testid="lyric-send-feedback"
          role="status"
          className={`text-xs ${muted}`}
        >
          Sent to the output.
        </p>
      ) : null}
    </div>
  );
};

export default NextLyricSuggestion;
