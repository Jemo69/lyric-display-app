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

  return (
    <section aria-label="Suggestions" className={card}>
      <h3 className={title}>Suggestions</h3>

      {suggestions.gateReason ? (
        <p data-testid="lane-gate-reason" className={`text-xs leading-snug ${muted}`}>
          No suggestions from the last segment — {suggestions.gateReason}.
        </p>
      ) : null}

      {lanes.map((lane) =>
        lane.reason && (lane.degraded || !lane.enabled) ? (
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
