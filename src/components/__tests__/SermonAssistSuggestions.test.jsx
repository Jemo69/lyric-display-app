/**
 * SermonAssistSuggestions.test.jsx — Live Sermon Assist, Phase 4: the three
 * suggestion lanes and the send actions that move the REAL outputs.
 *
 * What is pinned here, in the plan's own words:
 *
 *   1. "nothing appears on the output window without explicit press" —
 *      a suggestion can be sitting on screen, fully resolved, and the lyric
 *      selection, the `bibleVerseLoaded` announcement, and `contentMode` are
 *      all untouched. Only a click moves them, and each press moves exactly
 *      the state its action claims to move (asserted on the real stores, not
 *      on a mock of this code).
 *   2. a gated segment (no_speech_prob / flat energy / repetition) produces
 *      NO lane output — observable as "no suggestion", never as a broken card.
 *   3. below the shared confidence floor, the lane is quiet: no card, and no
 *      gate reason either (the gate passed; it was the confidence that said no).
 *   4. capability gating (D11) is user-visible: a provider with no word
 *      timestamps renders the lyric lane's disabled state WITH its reason.
 *   5. Stage does not touch the main outputs; Dismiss records the miss and
 *      sends nothing; a different translation re-resolves the same reference.
 *
 * The rail is driven through the real preload bridge shape
 * (`window.electronAPI.speech.onTranscript`) and the real control-socket
 * context (`window.__controlSocketContext`) — no store of ours is mocked.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, act, waitFor } from '@testing-library/react';

import SermonAssistPanel from '../Speech/SermonAssistPanel';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import useLyricsStore from '../../context/LyricsStore';
import useBibleStore from '../../context/BibleStore';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';
import useHotkeysStore from '../../context/HotkeysStore';

// Load contention with a concurrent suite run: give the async assertions headroom.
const itFlow = (name, fn) => it(name, fn, 30000);

const LYRICS = [
  'Amazing grace how sweet the sound',
  'That saved a wretch like me',
  'I once was lost but now am found',
  'Was blind but now I see',
];

/** Two installed translations so "different translation" has somewhere to go. */
const KJV = {
  id: 'kjv',
  name: 'KJV',
  books: [
    {
      number: 43,
      name: 'John',
      chapters: [
        {
          number: 3,
          verses: [
            { number: 16, text: 'For God so loved the world, that he gave his only begotten Son.' },
            { number: 17, text: 'For God sent not his Son into the world to condemn the world.' },
          ],
        },
      ],
    },
  ],
};

const WEB = {
  id: 'web',
  name: 'WEB',
  books: [
    {
      number: 43,
      name: 'John',
      chapters: [
        {
          number: 3,
          verses: [
            { number: 16, text: 'For God so loved the world, that he gave his one and only Son.' },
            { number: 17, text: 'For God did not send his Son into the world to judge the world.' },
          ],
        },
      ],
    },
  ],
};

/** A transcript line that is deliberately NOT a lyric line (localStorage test). */
const TRANSCRIPT = 'overflowing joy upon the holy mountain';

// --- stubs for the two bridges the rail reads ------------------------------

/** A deterministic stand-in for the preload speech.history bridge. */
const HISTORY_SESSION = {
  sessionId: 'svc-test',
  startedAt: Date.parse('2026-09-27T10:00:00.000Z'),
  endedAt: Date.parse('2026-09-27T10:10:00.000Z'),
  durationMs: 600_000,
  modelId: 'large-v3',
  providerId: 'whispercpp',
  where: 'local',
  werEstimate: null,
  segmentCount: 2,
  providers: ['whispercpp'],
  bytes: 2048,
};

const installSpeechBridge = () => {
  const listeners = new Set();
  const history = {
    list: vi.fn(async () => ({
      ok: true,
      sessions: [HISTORY_SESSION],
      status: { recording: true, byteCap: 1024, sessionCap: 10, storedBytes: 2048 },
    })),
    get: vi.fn(async () => ({ ok: true, session: null })),
    search: vi.fn(async () => ({ ok: true, matches: [] })),
    export: vi.fn(async () => ({ ok: true, path: '/tmp/export.json', bytes: 0 })),
    erase: vi.fn(async () => ({ ok: true, bytesReclaimed: 0, sessionsRemoved: 0 })),
    append: vi.fn(async () => ({ ok: true })),
  };
  const speech = {
    history,
    onTranscript: vi.fn((callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }),
  };
  window.electronAPI = { speech };
  return {
    speech,
    history,
    emit: (message) => {
      for (const callback of [...listeners]) callback(message);
    },
  };
};

const installControlSocket = () => {
  const socket = {
    emitLineUpdate: vi.fn(),
    emitBibleVerseLoaded: vi.fn(),
    emitIndividualOutputToggle: vi.fn(),
    emitOutputToggle: vi.fn(),
    emitLyricsLoad: vi.fn(),
  };
  window.__controlSocketContext = socket;
  return socket;
};

// --- store + render helpers -------------------------------------------------

const resetAll = ({ providerId = 'whispercpp' } = {}) => {
  useHotkeysStore.getState().resetBindings();

  useSpeechStore.setState({
    ...speechDefaults(),
    providerId,
    enabled: true,
    status: 'idle',
    health: null,
    lastError: null,
  });

  useLyricsStore.setState({
    lyrics: LYRICS,
    selectedLine: 0,
    contentMode: 'song',
    freeNotesDrafts: [],
    stageEnabled: false,
    isOutputOn: false,
    lyricsFileName: 'Amazing Grace',
  });

  useBibleStore.setState({
    bibles: { kjv: KJV, web: WEB },
    bibleMetadata: { kjv: { id: 'kjv', name: 'KJV' }, web: { id: 'web', name: 'WEB' } },
    activeBibleId: 'kjv',
    activeReference: null,
    selectedVerses: [[1]],
  });

  useSpeechRuntimeStore.getState().reset();

  // Everything above may have written preferences; the test that cares about
  // storage starts from a clean slate, and no later write carries speech text.
  localStorage.clear();
};

/** Mount the rail and expand it from its collapsed summon strip. */
const renderRail = () => {
  const utils = render(<SermonAssistPanel darkMode={false} />);
  fireEvent.click(screen.getByTestId('sermon-assist-open'));
  return utils;
};

/** Await every pending microtask (the card's translation resolution is a promise). */
const flush = async (ticks = 24) => {
  await act(async () => {
    for (let i = 0; i < ticks; i += 1) await Promise.resolve();
  });
};

let bridge = null;
let socket = null;

const feedFinal = (text, extra = {}) =>
  act(() => {
    bridge.emit({ t: 'final', text, sessionId: 'svc-test', tStartMs: 0, tEndMs: 1500, ...extra });
  });

const feedPartial = (text) =>
  act(() => {
    bridge.emit({ t: 'partial', text, sessionId: 'svc-test', tStartMs: 0, tEndMs: 1000 });
  });

const JOHN_SEGMENT = 'John 3:16 for God so loved the world';

describe('SermonAssistRail (Phase 4 suggestion lanes)', () => {
  beforeEach(() => {
    bridge = installSpeechBridge();
    socket = installControlSocket();
    resetAll();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.electronAPI;
    delete window.__controlSocketContext;
  });

  // --- 1. the non-negotiable -------------------------------------------------

  itFlow('a rendered suggestion moves NOTHING until the operator presses Send Live', async () => {
    renderRail();
    feedFinal(JOHN_SEGMENT);

    // The proposal is on screen, resolved against a real translation.
    const card = await screen.findByTestId('suggestion-verse');
    expect(card).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('verse-send-live')).toBeEnabled());
    expect(screen.getByTestId('verse-reference')).toHaveTextContent('John 3:16');
    expect(screen.getByTestId('verse-text')).toHaveTextContent('For God so loved the world');

    // NOTHING reached an output while it sat there.
    expect(socket.emitBibleVerseLoaded).not.toHaveBeenCalled();
    expect(socket.emitLineUpdate).not.toHaveBeenCalled();
    expect(socket.emitIndividualOutputToggle).not.toHaveBeenCalled();
    expect(useLyricsStore.getState().contentMode).toBe('song');
    expect(useLyricsStore.getState().selectedLine).toBe(0);
    expect(useLyricsStore.getState().lyrics).toEqual(LYRICS);
    expect(useLyricsStore.getState().stageEnabled).toBe(false);

    // The explicit press is what commits.
    fireEvent.click(screen.getByTestId('verse-send-live'));

    expect(socket.emitBibleVerseLoaded).toHaveBeenCalledTimes(1);
    expect(socket.emitBibleVerseLoaded.mock.calls[0][0].reference).toBe('John 3:16');
    expect(useLyricsStore.getState().contentMode).toBe('bible');
    expect(useLyricsStore.getState().lyrics[0]).toContain('For God so loved the world');
    // Stage routing was not touched by the live send either.
    expect(socket.emitIndividualOutputToggle).not.toHaveBeenCalled();
  });

  itFlow('next lyric: current / match / after are shown, Send moves selectedLine only', () => {
    renderRail();
    feedFinal('that saved a wretch like me');

    expect(screen.getByTestId('suggestion-lyric')).toBeInTheDocument();
    // The three slots the operator actually needs.
    expect(screen.getByText(/Now:/)).toHaveTextContent('Amazing grace how sweet the sound');
    expect(screen.getByTestId('lyric-send-target')).toHaveTextContent('That saved a wretch like me');
    expect(screen.getByText(/Then:/)).toHaveTextContent('I once was lost but now am found');

    // Nothing moved yet.
    expect(useLyricsStore.getState().selectedLine).toBe(0);
    expect(socket.emitLineUpdate).not.toHaveBeenCalled();
    expect(socket.emitBibleVerseLoaded).not.toHaveBeenCalled();
    expect(useLyricsStore.getState().contentMode).toBe('song');

    fireEvent.click(screen.getByTestId('lyric-send'));

    // The app's own mechanism: selectLine + emitLineUpdate (LyricsList's click path).
    expect(useLyricsStore.getState().selectedLine).toBe(1);
    expect(socket.emitLineUpdate).toHaveBeenCalledWith(1);
    expect(useLyricsStore.getState().contentMode).toBe('song');
    expect(socket.emitBibleVerseLoaded).not.toHaveBeenCalled();
  });

  // --- 2. verse: three actions + a fourth -----------------------------------

  itFlow('Stage routes only to the stage output — the main outputs do not move', async () => {
    renderRail();
    feedFinal(JOHN_SEGMENT);
    await screen.findByTestId('suggestion-verse');

    fireEvent.click(screen.getByTestId('verse-stage'));

    // The only per-output routing there is: the Stage output, switched on.
    expect(socket.emitIndividualOutputToggle).toHaveBeenCalledTimes(1);
    expect(socket.emitIndividualOutputToggle).toHaveBeenCalledWith({
      output: 'stage',
      enabled: true,
    });
    expect(useLyricsStore.getState().stageEnabled).toBe(true);

    // ...and not one word of content went anywhere the room can see it.
    expect(socket.emitBibleVerseLoaded).not.toHaveBeenCalled();
    expect(socket.emitLineUpdate).not.toHaveBeenCalled();
    expect(useLyricsStore.getState().contentMode).toBe('song');
    expect(useLyricsStore.getState().selectedLine).toBe(0);
    expect(useLyricsStore.getState().lyrics).toEqual(LYRICS);

    // The reference IS staged, in the Bible panel's own selection state —
    // byte-for-byte the store calls behind BibleControlPanel's Alt-click stage.
    expect(useBibleStore.getState().activeReference).toMatchObject({
      id: 'kjv',
      book: 43,
      chapters: ['3'],
      verses: [[16]],
    });
    expect(useBibleStore.getState().selectedVerses).toEqual([[16]]);
  });

  itFlow('Dismiss records the miss and sends nothing at all', async () => {
    renderRail();
    feedFinal(JOHN_SEGMENT);
    await screen.findByTestId('suggestion-verse');
    expect(useSpeechRuntimeStore.getState().dismissed).toEqual([]);

    fireEvent.click(screen.getByTestId('verse-dismiss'));

    expect(useSpeechRuntimeStore.getState().dismissed).toEqual(['John 3:16']);
    expect(screen.queryByTestId('suggestion-verse')).toBeNull();

    expect(socket.emitBibleVerseLoaded).not.toHaveBeenCalled();
    expect(socket.emitIndividualOutputToggle).not.toHaveBeenCalled();
    expect(useLyricsStore.getState().contentMode).toBe('song');
    expect(useLyricsStore.getState().selectedLine).toBe(0);

    // The dismissed reference stays dismissed on the next identical segment.
    feedFinal(JOHN_SEGMENT);
    expect(screen.queryByTestId('suggestion-verse')).toBeNull();
  });

  itFlow('a different translation re-resolves the same reference without re-transcribing', async () => {
    renderRail();
    feedFinal(JOHN_SEGMENT);
    await screen.findByTestId('suggestion-verse');
    await waitFor(() => expect(screen.getByTestId('verse-send-live')).toBeEnabled());

    expect(screen.getByTestId('verse-translation')).toHaveTextContent('Resolved from KJV');
    expect(screen.getByTestId('verse-text')).toHaveTextContent('his only begotten Son');
    expect(useSpeechRuntimeStore.getState().segments).toHaveLength(1);

    fireEvent.click(screen.getByTestId('verse-different-translation'));

    expect(screen.getByTestId('verse-translation')).toHaveTextContent('Resolved from WEB');
    expect(screen.getByTestId('verse-text')).toHaveTextContent('one and only Son');
    // Same detection, same card, same transcript: only the lookup changed.
    expect(screen.getByTestId('verse-reference')).toHaveTextContent('John 3:16');
    expect(useSpeechRuntimeStore.getState().segments).toHaveLength(1);
  });

  itFlow('Alt+V sends live and Alt+X dismisses — while the card is showing', async () => {
    renderRail();
    feedFinal(JOHN_SEGMENT);
    await screen.findByTestId('suggestion-verse');
    await waitFor(() => expect(screen.getByTestId('verse-send-live')).toBeEnabled());
    expect(screen.getByTestId('verse-hotkey-hint')).toHaveTextContent('Alt+V');
    expect(screen.getByTestId('verse-hotkey-hint')).toHaveTextContent('Alt+X');

    const pressKey = (key, code) =>
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key, code, altKey: true, bubbles: true, cancelable: true })
        );
      });

    pressKey('v', 'KeyV');
    expect(socket.emitBibleVerseLoaded).toHaveBeenCalledTimes(1);
    expect(useLyricsStore.getState().contentMode).toBe('bible');
    expect(screen.getByTestId('verse-feedback')).toHaveTextContent(/sent to the output/i);

    // The labelled negative is a keypress too — and it changes nothing else.
    pressKey('x', 'KeyX');
    expect(screen.queryByTestId('suggestion-verse')).toBeNull();
    expect(useSpeechRuntimeStore.getState().dismissed).toEqual(['John 3:16']);
    expect(socket.emitBibleVerseLoaded).toHaveBeenCalledTimes(1);
    expect(socket.emitIndividualOutputToggle).not.toHaveBeenCalled();
  });

  // --- 3. the gates ---------------------------------------------------------

  itFlow('a gated segment produces no lane output at all — only a stated reason', async () => {
    renderRail();

    // Gate 2: the model itself flagged the segment as no speech.
    feedFinal(JOHN_SEGMENT, { noSpeechProb: 0.92 });
    expect(screen.queryByTestId('suggestion-verse')).toBeNull();
    expect(screen.queryByTestId('suggestion-lyric')).toBeNull();
    expect(screen.queryByTestId('suggestion-note')).toBeNull();
    expect(screen.getByTestId('lane-gate-reason')).toHaveTextContent(
      'flagged as no speech by the model'
    );
    // The tail still shows what the engine settled on, marked discarded —
    // hiding the hallucination would hide the thing worth noticing.
    expect(screen.getByTestId('transcript-segment')).toHaveAttribute('data-gate', 'discarded');

    // Gate 1: flat energy below the noise floor.
    act(() => {
      useSpeechRuntimeStore.getState().reset();
    });
    feedFinal(JOHN_SEGMENT, { peak: 0.001, rms: 0.0002 });
    expect(screen.queryByTestId('suggestion-verse')).toBeNull();
    expect(screen.getByTestId('lane-gate-reason')).toHaveTextContent('below the noise floor');

    // Gate 3: the repeated-phrase hallucination signature.
    act(() => {
      useSpeechRuntimeStore.getState().reset();
    });
    feedFinal('Thank you. Thank you. Thank you.');
    expect(screen.queryByTestId('suggestion-lyric')).toBeNull();
    expect(screen.getByTestId('lane-gate-reason')).toHaveTextContent('a repeated phrase');
  });

  itFlow('below the confidence floor the lane is quiet: no card, and no gate reason', () => {
    renderRail();
    // Passes every gate (noSpeechProb 0.5 < 0.6) but halves the segment
    // weight, so the final confidence lands under THRESHOLDS.suggestion.
    feedFinal('that saved a wretch like me', { noSpeechProb: 0.5 });

    expect(screen.queryByTestId('suggestion-lyric')).toBeNull();
    expect(screen.queryByTestId('lane-gate-reason')).toBeNull();
    // The transcript itself is not hidden — only the proposal is.
    expect(screen.getByTestId('transcript-segment')).toHaveAttribute('data-gate', 'passed');
  });

  // --- 4. capability gating (D11) -------------------------------------------

  itFlow('a provider without word timestamps renders the lyric lane disabled, WITH its reason', async () => {
    resetAll({ providerId: 'vosk' });
    renderRail();
    feedFinal('that saved a wretch like me');

    const reason = screen.getByTestId('lane-lyric-reason');
    expect(reason).toHaveAttribute('data-lane-state', 'disabled');
    expect(reason.textContent.trim().length).toBeGreaterThan(0);
    // Never silently off: the reason is a sentence in the DOM.
    expect(reason).toHaveTextContent(/word/i);
    expect(screen.queryByTestId('suggestion-lyric')).toBeNull();

    // The other lanes keep working and say when they are degraded.
    feedFinal(JOHN_SEGMENT);
    await flush();
    expect(screen.queryByTestId('suggestion-verse')).not.toBeNull();
    const verseReason = screen.getByTestId('lane-verse-reason');
    expect(verseReason).toHaveAttribute('data-lane-state', 'degraded');
    expect(verseReason.textContent.trim().length).toBeGreaterThan(0);
  });

  // --- 5. the sermon note ---------------------------------------------------

  itFlow('sermon note: a running draft from finals, editable inline, sent to freeNotesDrafts', () => {
    renderRail();
    feedFinal('Blessed assurance Jesus is mine this is my story');

    const note = screen.getByTestId('suggestion-note');
    expect(screen.getByTestId('sermon-note-input')).toHaveValue(
      'Blessed assurance Jesus is mine this is my story'
    );
    expect(note).toBeInTheDocument();

    // Nothing was saved by merely drafting it.
    expect(useLyricsStore.getState().freeNotesDrafts).toEqual([]);
    expect(useLyricsStore.getState().contentMode).toBe('song');
    expect(socket.emitBibleVerseLoaded).not.toHaveBeenCalled();

    // Inline edit — no summarisation model, the operator fixes it directly.
    fireEvent.change(screen.getByTestId('sermon-note-input'), {
      target: { value: 'Illustration: the lighthouse keeper stayed at his post.' },
    });
    expect(useSpeechRuntimeStore.getState().note.content).toBe(
      'Illustration: the lighthouse keeper stayed at his post.'
    );

    fireEvent.click(screen.getByTestId('sermon-note-send'));

    const drafts = useLyricsStore.getState().freeNotesDrafts;
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe('Sermon Note');
    expect(drafts[0].content).toBe('Illustration: the lighthouse keeper stayed at his post.');

    // A draft save is not a projection: no output moved.
    expect(useLyricsStore.getState().contentMode).toBe('song');
    expect(useLyricsStore.getState().selectedLine).toBe(0);
    expect(socket.emitBibleVerseLoaded).not.toHaveBeenCalled();
    expect(socket.emitLineUpdate).not.toHaveBeenCalled();
  });

  // --- 6. history is reachable from the rail --------------------------------

  itFlow('the transcript history browser is reachable from the rail, behind one press', async () => {
    renderRail();

    expect(screen.queryByTestId('speech-history-browser')).toBeNull();
    expect(bridge.history.list).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('speech-history-toggle'));

    expect(await screen.findByTestId('speech-history-browser')).toBeInTheDocument();
    expect(await screen.findByTestId('history-list')).toBeInTheDocument();
    expect(screen.getByTestId('history-session-row')).toBeInTheDocument();
    expect(bridge.history.list).toHaveBeenCalledTimes(1);

    // Collapsing the disclosure removes it from the DOM again.
    fireEvent.click(screen.getByTestId('speech-history-toggle'));
    expect(screen.queryByTestId('speech-history-browser')).toBeNull();
  });

  // --- 7. the transcript tail -----------------------------------------------

  itFlow('a provisional partial is presentationally distinct from a settled final', () => {
    renderRail();
    feedPartial('the priest stood quietly');

    const partial = screen.getByTestId('transcript-partial');
    expect(partial).toHaveAttribute('data-state', 'provisional');
    expect(partial).toHaveAttribute('role', 'status');
    expect(partial.getAttribute('aria-label') ?? '').toMatch(/provisional/i);
    expect(partial).toHaveTextContent(/unsettled/i);
    expect(partial).toHaveTextContent('the priest stood quietly');
    // No settled row exists yet — the partial is not pretending to be one.
    expect(screen.queryByTestId('transcript-segment')).toBeNull();

    feedFinal('The priest stood quietly waiting');

    const settled = screen.getByTestId('transcript-segment');
    expect(settled).toHaveAttribute('data-state', 'final');
    expect(settled).not.toHaveAttribute('role', 'status');
    expect(settled).not.toHaveTextContent(/unsettled/i);
    expect(settled).toHaveTextContent('The priest stood quietly waiting');
    // Settling clears the provisional slot entirely.
    expect(screen.queryByTestId('transcript-partial')).toBeNull();
  });
});
