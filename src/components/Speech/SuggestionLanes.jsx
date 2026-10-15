/**
 * SuggestionLanes.jsx — the Suggestions section: three lanes, one gate, and
 * the D5 rule ("nothing reaches an output window until the operator presses
 * send") made structural.
 *
 * SHAPE OF THE SECTION, in reading order:
 *   1. gate reason   — muted, when the newest settled segment failed a
 *                      hallucination gate. Machine reason -> human phrase,
 *                      never transcript text.
 *   2. lane reasons  — a lane the provider's capabilities disable (or degrade)
 *                      states WHY inline. Nothing is ever silently off:
 *                      `lane-<id>-reason` with `data-lane-state` telling a
 *                      disabled lane from a degraded one.
 *   3. the cards     — rendered only when there is something to show. A card
 *                      is a proposal; it sends only on a press.
 *   4. empty state   — the shipped sentence when no lane has a card, so the
 *                      section never implies suggestions are coming from
 *                      something the operator cannot see.
 *
 * Selection of store values is primitive-by-primitive on purpose: an object
 * selector in zustand returns a fresh reference every call and re-renders the
 * rail forever.
 */
import React from 'react';
import useSpeechStore from '../../context/SpeechStore';
import useLyricsStore from '../../context/LyricsStore';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';
import { capabilitiesForProviderId, deriveSuggestions } from '../../hooks/useSpeechRuntime';
import NextLyricSuggestion from './NextLyricSuggestion';
import VerseSuggestionCard from './VerseSuggestionCard';
import SermonNoteSuggestion from './SermonNoteSuggestion';

/** Shipped empty-state copy (asserted by SermonAssistPanel.test.jsx). */
export const EMPTY_SUGGESTIONS_COPY =
  'Next lyric line, Bible verse, and sermon note suggestions appear here.';

/** Operator-facing lane names, for a reason that covers more than one lane. */
const LANE_LABELS = Object.freeze({ lyric: 'next-lyric', verse: 'verse', note: 'sermon note' });

/**
 * Group the lane reasons by exact sentence, so one sentence printed for two
 * lanes is rendered once naming both. Returns [] when every reason is unique.
 */
function findRepeatedReasons(lanes) {
  const byReason = new Map();
  for (const lane of lanes) {
    if (!lane.reason || (!lane.degraded && lane.enabled)) continue;
    if (!byReason.has(lane.reason)) byReason.set(lane.reason, []);
    byReason.get(lane.reason).push(lane.id);
  }
  return [...byReason.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([reason, ids]) => ({ reason, lanes: ids }));
}

const SuggestionLanes = ({ darkMode = false, cardClass, titleClass }) => {
  const segments = useSpeechRuntimeStore((state) => state.segments);
  const note = useSpeechRuntimeStore((state) => state.note);
  const dismissed = useSpeechRuntimeStore((state) => state.dismissed);
  const lyrics = useLyricsStore((state) => state.lyrics);
  const selectedLine = useLyricsStore((state) => state.selectedLine);
  const where = useSpeechStore((state) => state.where);
  const providerId = useSpeechStore((state) => state.providerId);
  const cloudProviderId = useSpeechStore((state) => state.cloudProviderId);
  const health = useSpeechStore((state) => state.health);

  const lanes = capabilitiesForProviderId({ where, providerId, cloudProviderId });
  const suggestions = deriveSuggestions({
    segments,
    lyrics,
    selectedIndex: selectedLine,
    lanes,
    dismissed,
    note,
    health,
  });

  const card = cardClass ?? 'rounded-xl border p-5 space-y-4';
  const title = titleClass ?? 'text-[11px] font-bold uppercase tracking-wider';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const hasCard = Boolean(suggestions.lyric || suggestions.verse || suggestions.note);

  // Reasons rendered individually are the ones that cover a single lane.
  const repeatedReasons = findRepeatedReasons(lanes);
  const repeatedText = new Set(repeatedReasons.map((entry) => entry.reason));

  return (
    <section aria-label="Suggestions" className={card}>
      <h3 className={title}>Suggestions</h3>

      {suggestions.gateReason ? (
        <p data-testid="lane-gate-reason" className={`text-xs leading-snug ${muted}`}>
          No suggestions from the last segment — {suggestions.gateReason}.
        </p>
      ) : null}

      {lanes.map((lane) =>
        lane.reason && !repeatedText.has(lane.reason) && (lane.degraded || !lane.enabled) ? (
          <p
            key={lane.id}
            data-testid={`lane-${lane.id}-reason`}
            data-lane-state={lane.enabled ? 'degraded' : 'disabled'}
            className={`text-xs leading-snug ${muted}`}
          >
            {lane.reason}
          </p>
        ) : null
      )}

      {/* Sections can repeat a lane reason verbatim when two lanes are disabled
          by the same missing capability. Show each DISTINCT sentence once,
          naming every lane it covers — the operator needs to know what is off,
          not to read the same warning twice and conclude the rail is broken. */}
      {repeatedReasons.length > 0 ? (
        <p
          data-testid="lane-shared-reason"
          className={`text-xs leading-snug ${muted} border-l-2 ${
            darkMode ? 'border-gray-700 pl-2' : 'border-gray-300 pl-2'
          }`}
        >
          {repeatedReasons[0].reason} ({repeatedReasons.map((r) => LANE_LABELS[r.lane]).join(' and ')})
        </p>
      ) : null}

      {suggestions.lyric ? (
        <NextLyricSuggestion darkMode={darkMode} suggestion={suggestions.lyric} />
      ) : null}

      {suggestions.verse ? (
        <VerseSuggestionCard
          key={suggestions.verse.verse?.reference ?? 'verse'}
          darkMode={darkMode}
          suggestion={suggestions.verse}
        />
      ) : null}

      {suggestions.note ? (
        <SermonNoteSuggestion darkMode={darkMode} note={suggestions.note} />
      ) : null}

      {/* D5: nothing reaches an output window until the operator presses send. */}
      {!hasCard ? (
        <p className={`text-sm ${muted}`}>{EMPTY_SUGGESTIONS_COPY}</p>
      ) : null}
    </section>
  );
};

export default SuggestionLanes;
