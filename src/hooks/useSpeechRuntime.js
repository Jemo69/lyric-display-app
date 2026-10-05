/**
 * useSpeechRuntime.js — Live Sermon Assist Phase 4, the rail's data path.
 *
 * Four responsibilities, all in one place so a reviewer can see the whole
 * flow without opening five files:
 *
 *   1. useSpeechRuntime(enabled)   — subscribe to the engine's transcript
 *      relay (preload's `speech.onTranscript`) for as long as the feature is
 *      on. Cold by default: with `enabled === false`, or with no preload
 *      bridge (a test, a browser build), it subscribes to nothing and throws
 *      nothing.
 *   2. deriveSuggestions(...)      — pure: refuse canned output, gate the newest
 *      final segment, then produce the three lane suggestions (or nothing).
 *   3. the three SEND ACTIONS      — `sendLyricLine`, `sendVerseLive` +
 *      stage helpers, `sendSermonNote`. Every one of them is reached only by
 *      an explicit press; nothing here runs on mount, on a transcript event,
 *      or on a re-render. Each one reuses an existing store action / socket
 *      emit — no new IPC channel, no new store field, no new output code.
 *   4. useSermonAssistToggle()     — `Mod+Shift+A`, registered through the
 *      same singleton getHotkeyManager() every other app shortcut uses (the
 *      usePanicStop pattern), so it is remappable in User Preferences and
 *      survives HotkeysStore's unknown-id pruning.
 *
 * HYGIENE: no logging anywhere in this module — transcript text, note content,
 * and verse text are read as parameters and returned as values, never written
 * to the logger.
 */
import { useEffect } from 'react';
import { getHotkeyManager } from '@tanstack/hotkeys';
import useHotkeysStore from '../context/HotkeysStore';
import useSpeechStore from '../context/SpeechStore';
import useLyricsStore from '../context/LyricsStore';
import useBibleStore from '../context/BibleStore';
import useSpeechRuntimeStore, { gatePhrase } from '../context/SpeechRuntimeStore';
import { DEFAULT_BINDINGS } from '../constants/hotkeyBindings';
import { SPEECH_PROVIDERS } from 'shared/speech';
import { getBibleVerseText } from 'shared/bible';
import { splitBibleTextIntoSlides, resolveBibleGeometry } from '../utils/bibleSplitter';
import {
  clearsSuggestionFloor,
  detectVerseFromSegment,
  findLane,
  gateSegment,
  isCannedEngine,
  lanesForCapabilities,
  rankNextLyric,
  segmentWeight,
  toFreeNoteDraft,
} from '../speech';

// ---------------------------------------------------------------------------
// 1. transcript in
// ---------------------------------------------------------------------------

/**
 * Subscribe to the engine's transcript relay for the lifetime of the caller.
 *
 * Payload shape (main/speechIpc.js relays the whole engine message):
 *   { t: 'partial'|'final', sessionId, text, tStartMs, tEndMs, confidence, ... }
 *
 * Partials are provisional and settle nothing but the partial slot; a final
 * settles the tail and clears the partial. The subscription is torn down on
 * unmount and when the feature is switched off, so a disabled feature listens
 * to nothing.
 *
 * @param {boolean} enabled SpeechStore's `enabled`
 */
export function useSpeechRuntime(enabled = false) {
  useEffect(() => {
    if (!enabled) return undefined;
    const bridge = typeof window === 'undefined' ? null : window.electronAPI?.speech;
    if (!bridge || typeof bridge.onTranscript !== 'function') return undefined;

    const unsubscribe = bridge.onTranscript((message) => {
      if (!message || typeof message !== 'object') return;
      const store = useSpeechRuntimeStore.getState();
      if (message.t === 'final') store.pushSegment(message);
      else if (message.t === 'partial') store.setPartial(message.text);
    });

    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [enabled]);

  // Engine health, in the same effect as the transcript and off the same
  // switch: `speech:health` carries the `backend` field that decides whether
  // the running engine is real or the contract-conformant fake. The store's
  // `health` is non-persisted runtime state, so a reload starts unknown and
  // the UI says so rather than inheriting a stale answer.
  useEffect(() => {
    if (!enabled) return undefined;
    const bridge = typeof window === 'undefined' ? null : window.electronAPI?.speech;
    if (!bridge || typeof bridge.onHealth !== 'function') return undefined;

    const speechStore = useSpeechStore.getState();
    const unsubscribe = bridge.onHealth((payload) => {
      if (!payload || typeof payload !== 'object') return;
      speechStore.setHealth(payload);
    });

    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [enabled]);
}

/** The display half of the runtime state (segments + the provisional partial). */
export const transcriptOf = (state) => ({
  segments: Array.isArray(state?.segments) ? state.segments : [],
  partial: typeof state?.partial === 'string' ? state.partial : '',
});

// ---------------------------------------------------------------------------
// 2. suggestions out (pure)
// ---------------------------------------------------------------------------

/**
 * Capability gating: which engine is in play, mapped onto the three lanes.
 *
 * `where` picks the axis (local engine vs cloud provider); an unknown id
 * yields `null`, which `lanesForCapabilities` reports as "no provider
 * capabilities reported" with every lane off and a stated reason — never
 * silently off (decision D11).
 *
 * @param {{where?: string, providerId?: string, cloudProviderId?: string}} speech
 * @returns {Array<{id, enabled, degraded, reason}>}
 */
export function capabilitiesForProviderId(speech = {}) {
  const { where, providerId, cloudProviderId } = speech;
  const id = where === 'local' ? providerId : cloudProviderId;
  const provider = id
    ? SPEECH_PROVIDERS.find((candidate) => candidate && candidate.id === id) ?? null
    : null;
  return lanesForCapabilities(provider);
}

/**
 * Turn the transcript into the three lane suggestions — or into nothing.
 *
 * ORDER IS THE POINT: the hallucination gates run FIRST, on the newest final
 * segment. A failing gate returns `null` for all three lanes plus a text-free
 * `gateReason` phrase, so a segment the model flagged as noise can never reach
 * a card no matter how clean its match looks. Partials never reach here: the
 * caller passes the settled tail only.
 *
 * THEN THE FLOOR: every lane's confidence is the segment-weighted one
 * (`combine(matchConfidence, segmentWeight(segment))`, applied inside the
 * engine), and `clearsSuggestionFloor` is the last word on whether a card
 * renders at all. Below it the lane reports no suggestion — not a degraded
 * card, not a warning card: nothing.
 *
 * @param {object} input
 * @param {Array<object>} input.segments settled segments (newest last)
 * @param {Array<string|object>} input.lyrics useLyricsStore().lyrics
 * @param {number|null} input.selectedIndex the operator's current line
 * @param {Array} input.lanes lanesForCapabilities() / capabilitiesForProviderId()
 * @param {Array<string>} input.dismissed dismissed verse references
 * @param {object|null} input.note the running sermon-note draft
 * @param {object|null} [input.health] latest `speech:health` payload
 * @returns {{lyric: object|null, verse: object|null, note: object|null,
 *            gateReason: string}}
 */
export function deriveSuggestions({
  segments = [],
  lyrics = [],
  selectedIndex = null,
  lanes = [],
  dismissed = [],
  note = null,
  health = null,
} = {}) {
  // Canned output may never become a sendable card. The fake engine ignores
  // the audio bytes and replays a fixed sentence, but it passes every
  // downstream gate cleanly — it is not noisy, not repetitive, and its
  // confidence is the number the fake engine chose. So without this check a
  // canned "John 3:16" would render as a high-confidence, correctly-formatted
  // verse card one tap from the sanctuary screens.
  //
  // `gateReason` stays '' here on purpose: nothing about this segment was
  // rejected by a hallucination gate. The UI reports the engine itself, via
  // engineModeLabel(), not a fabricated gate phrase.
  if (isCannedEngine(health)) return { lyric: null, verse: null, note: null, gateReason: '' };

  const latest = segments.length > 0 ? segments[segments.length - 1] : null;
  const gate = latest ? gateSegment(latest) : { ok: true, reason: '' };
  const gateReason = gate.ok ? '' : gatePhrase(gate.reason);

  // Gate failure blanks every lane — that is the whole contract.
  if (!gate.ok) return { lyric: null, verse: null, note: null, gateReason };

  const transcript = latest && typeof latest.text === 'string' ? latest.text : '';
  const lyricLane = findLane(lanes, 'lyric');
  const verseLane = findLane(lanes, 'verse');
  const noteLane = findLane(lanes, 'note');

  const ranked = lyricLane && lyricLane.enabled && transcript
    ? rankNextLyric(lyrics, transcript, {
        selectedIndex,
        segmentConfidence: segmentWeight(latest),
      })
    : null;
  const lyric =
    ranked && ranked.match && clearsSuggestionFloor(ranked.match.confidence) ? ranked : null;

  const detected = verseLane && verseLane.enabled && transcript
    ? detectVerseFromSegment(latest)
    : null;
  const reference = detected && detected.verse ? detected.verse.reference : null;
  const verse =
    detected && reference && clearsSuggestionFloor(detected.confidence) && !dismissed.includes(reference)
      ? detected
      : null;

  const noteOut = noteLane && noteLane.enabled &&
    note && typeof note.content === 'string' && note.content.trim().length > 0
    ? note
    : null;

  return { lyric, verse, note: noteOut, gateReason };
}

// ---------------------------------------------------------------------------
// 3. verse resolution — a detected reference, made real against an install
// ---------------------------------------------------------------------------

const normalizeBookName = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Resolve a canonical book name (or an ambiguous candidate list) inside one
 * installed translation.
 *
 * @param {object} bible a BibleStore bible ({ books: [{ number, name, chapters }] })
 * @param {string|string[]} bookNames tried in order
 * @returns {{number, name, chapters}|null}
 */
export function findBibleBook(bible, bookNames = []) {
  if (!bible || !Array.isArray(bible.books)) return null;
  const wanted = (Array.isArray(bookNames) ? bookNames : [bookNames])
    .map(normalizeBookName)
    .filter(Boolean);
  for (const name of wanted) {
    const hit = bible.books.find((book) => book && normalizeBookName(book.name) === name);
    if (hit) return hit;
  }
  return null;
}

/**
 * The verse numbers a detection covers: `16` -> [16], `16-18` -> [16,17,18].
 * @param {{verse?: number, endVerse?: number}} verse
 * @returns {number[]}
 */
export function verseNumberList(verse) {
  const first = Number(verse?.verse);
  if (!Number.isFinite(first) || first < 1) return [];
  const last = Number(verse?.endVerse);
  const out = [first];
  if (Number.isFinite(last) && last > first) {
    for (let n = first + 1; n <= last; n += 1) out.push(n);
  }
  return out;
}

/**
 * "John 3:16" / "John 3:16-18" — the label every surface shows and sends.
 * @param {string} bookName
 * @param {number|string} chapter
 * @param {number[]} numbers from verseNumberList()
 */
export function formatVerseReference(bookName, chapter, numbers = []) {
  const head = `${bookName ?? ''} ${chapter ?? ''}`.trim();
  if (numbers.length === 0) return head;
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  return `${head}:${first}${last !== first ? `-${last}` : ''}`;
}

/**
 * Every installed translation that actually contains this verse, ACTIVE ONE
 * FIRST, each carrying its own resolved text.
 *
 * Pure: pass the BibleStore state in. The async wrapper below (`listVerseTranslations`)
 * is what touches the store, and it only ever calls the store's own
 * `loadAllBibles()` — an IndexedDB read, no network, no spawn.
 *
 * @param {{book, chapter, verse, endVerse}} verse a detection's `verse`
 * @param {object} bibleState
 * @param {string[]} [bookNames] candidates (ambiguous aliases) tried per bible
 * @returns {Array<{bibleId, bibleName, bookNumber, text}>}
 */
export function translationOptionsFor(verse, bibleState = {}, bookNames = []) {
  const numbers = verseNumberList(verse);
  if (!verse || numbers.length === 0) return [];

  const metadata = bibleState.bibleMetadata ?? {};
  const bibles = bibleState.bibles ?? {};
  const ids = [...new Set([...Object.keys(metadata), ...Object.keys(bibles)])];
  const chapter = String(Number(verse.chapter));

  const options = [];
  for (const id of ids) {
    const bible = bibles[id];
    if (!bible) continue; // metadata-only: not resident, cannot be resolved here
    const book = findBibleBook(bible, [verse.book, ...bookNames]);
    if (!book) continue;
    const text = getBibleVerseText(bible, { book: book.number, chapters: [chapter] }, [numbers]);
    if (!text || !text.trim()) continue;
    options.push({
      bibleId: id,
      bibleName: bible.name || metadata[id]?.name || id,
      bookNumber: book.number,
      text,
    });
  }

  const activeId = bibleState.activeBibleId;
  return options.sort((a, b) => Number(b.bibleId === activeId) - Number(a.bibleId === activeId));
}

/**
 * Store-aware resolution: load whatever metadata promises, then list the
 * translations that carry the verse. Never throws — a partially loaded library
 * degrades to fewer options, and an empty list means "not in any translation".
 *
 * @param {object} verse a detection's `verse`
 * @param {string[]} [bookNames]
 */
export async function listVerseTranslations(verse, bookNames = []) {
  const before = useBibleStore.getState();
  const promised = Object.keys(before.bibleMetadata ?? {}).length;
  const resident = Object.keys(before.bibles ?? {}).length;
  if (promised > resident) {
    try {
      await before.loadAllBibles();
    } catch {
      // IndexedDB unavailable or a failed read: keep whatever is resident.
    }
  }
  return translationOptionsFor(verse, useBibleStore.getState(), bookNames);
}

/**
 * Turn one translation's raw verse text into the exact payload
 * `useLyricsStore.loadBibleVerse()` (and therefore the server's
 * `bibleVerseLoaded` fan-out) expects: slides split by the operator's own
 * Bible settings, one line per slide with the reference appended, plus the
 * structured fields the send action needs.
 *
 * Returns `null` when nothing usable comes out — never a payload with empty
 * slides (an empty slide is a reference-only screen).
 *
 * @param {{verse, option, bookName?, bibleState?, lyricsState?}} input
 * @returns {object|null}
 */
export function buildVersePayload({ verse, option, bookName, bibleState = null, lyricsState = null }) {
  if (!verse || !option || typeof option.text !== 'string' || !option.text.trim()) return null;

  const bstate = bibleState ?? useBibleStore.getState();
  const lstate = lyricsState ?? useLyricsStore.getState();
  const split = bstate.settings ?? {};
  const geometry = resolveBibleGeometry(lstate.output1Settings ?? {});

  const slides = splitBibleTextIntoSlides(option.text, {
    splitLongVerses: Boolean(split.splitLongVerses),
    method: split.splitMethod || 'nearest-punctuation',
    maxChars: Number(split.longVersesChars || 100),
    tolerance: Number(split.longVersesTolerance || 0),
    geometry,
  })
    .map((slide) => String(slide ?? ''))
    .filter((slide) => slide.trim().length > 0);

  if (slides.length === 0) return null;

  const numbers = verseNumberList(verse);
  const reference = formatVerseReference(bookName || option.bookName || verse.book, Number(verse.chapter), numbers);
  const lines = slides.map((slide) => `${slide}\n\n${reference}`);

  return {
    bibleId: option.bibleId,
    bible: option.bibleName,
    book: bookName || verse.book,
    chapter: Number(verse.chapter),
    verses: numbers,
    reference,
    text: slides[0],
    fullText: option.text,
    slides,
    lines,
    rawText: lines.join('\n\n'),
    slideIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// 3b. the three send actions (explicit presses only)
// ---------------------------------------------------------------------------

/**
 * The control socket context — the established pattern (useLyricsHotReload,
 * useLyricsLoader, UserPreferencesModal) for emitting without another
 * `useControlSocket()` subscription at every call site.
 */
const controlSocket = () =>
  (typeof window === 'undefined' ? null : window.__controlSocketContext) ?? null;

/**
 * SEND 1 — next lyric line.
 *
 * Mechanism: `useLyricsStore().selectLine(index)` — the store action every
 * "project this line" path in the app uses (LyricsList's click handler,
 * `navigateLine` on ArrowDown/j) — followed by the same existing
 * `emitLineUpdate` those paths use. Output windows are separate renderers fed
 * by socket events, so the selection alone would move the control window's
 * preview and leave the sanctuary screens where they were; announcing the line
 * is the existing code, not new output machinery.
 *
 * @param {number} index the matched lyric line
 * @returns {boolean} whether the action ran
 */
export function sendLyricLine(index) {
  if (!Number.isInteger(index) || index < 0) return false;
  useLyricsStore.getState().selectLine(index);

  const socket = controlSocket();
  if (socket && typeof socket.emitLineUpdate === 'function') socket.emitLineUpdate(index);
  else if (socket?.socket?.connected) socket.socket.emit('lineUpdate', { index });
  return true;
}

/**
 * SEND 2a — Bible verse, live.
 *
 * Mechanism: `useLyricsStore().loadBibleVerse(payload)` (atomic: contentMode
 * 'bible', lyrics, selectedLine via reduceLoadBibleVerse) + `selectLine(0)`,
 * then the existing `emitBibleVerseLoaded` on the control socket. The server
 * fans lyricsLoad / lineUpdate / fileNameUpdate / contentModeUpdate out of that
 * ONE event itself, which is why this emits nothing else.
 *
 * @param {object|null} payload from buildVersePayload()
 * @returns {boolean}
 */
export function sendVerseLive(payload) {
  if (!payload || !payload.reference) return false;
  const lyrics = useLyricsStore.getState();
  lyrics.loadBibleVerse(payload);
  lyrics.selectLine(0);

  const socket = controlSocket();
  const announcement = {
    reference: payload.reference,
    bible: payload.bible || '',
    slideIndex: 0,
    slides: payload.slides,
    text: payload.text,
  };
  if (socket && typeof socket.emitBibleVerseLoaded === 'function') socket.emitBibleVerseLoaded(announcement);
  else if (socket?.socket?.connected) socket.socket.emit('bibleVerseLoaded', announcement);
  return true;
}

/**
 * SEND 2b — Bible verse, staged only.
 *
 * Mechanism, byte-for-byte the store calls behind
 * `BibleControlPanel.stageVerseSelection` (the app's Alt-click "stage WITHOUT
 * sending to output" path): reference + selection in the Bible panel, and the
 * Stage output routed on. It never emits `bibleVerseLoaded` and never touches
 * contentMode / lyrics / selectedLine / isOutputOn / output1 / output2, so
 * nothing on a main output moves.
 *
 * Verified at implementation time: `bibleVerseLoaded` is a broadcast
 * (`io.emit`) — content cannot be aimed at one window — so `individualOutputToggle`
 * (server/events.js) is the only per-output routing there is, and the Stage
 * output is what gets touched here.
 *
 * @param {object} verse a detection's `verse`
 * @param {string[]} [bookNames] ambiguous alias candidates
 * @returns {boolean} false when the verse cannot be staged (no such book here)
 */
export function stageVerseInPanel(verse, bookNames = []) {
  const numbers = verseNumberList(verse);
  if (!verse || numbers.length === 0) return false;

  const state = useBibleStore.getState();
  const bible = state.bibles?.[state.activeBibleId] ?? null;
  const book = findBibleBook(bible, [verse.book, ...bookNames]);
  if (!book) return false;

  state.setReference({
    id: state.activeBibleId,
    book: book.number,
    chapters: [String(Number(verse.chapter))],
    verses: [numbers],
  });
  state.setSelectedVerses([numbers]);
  return true;
}

/** Route the Stage output on — the second half of the stage press. */
export function enableStageOutput() {
  useLyricsStore.getState().setStageEnabled(true);
  const socket = controlSocket();
  const announcement = { output: 'stage', enabled: true };
  if (socket && typeof socket.emitIndividualOutputToggle === 'function') {
    socket.emitIndividualOutputToggle(announcement);
  } else if (socket?.socket?.connected) {
    socket.socket.emit('individualOutputToggle', announcement);
  }
  return true;
}

/**
 * SEND 3 — sermon note.
 *
 * Mechanism: `toFreeNoteDraft(note)` -> the existing
 * `useLyricsStore().saveFreeNoteDraft()` (upserts into `freeNotesDrafts` by
 * id). It writes a draft the operator opens when they want it; it never
 * switches contentMode and never emits anything to an output.
 *
 * @param {object|null} note the running draft
 * @returns {boolean}
 */
export function sendSermonNote(note) {
  const draft = toFreeNoteDraft(note);
  if (!draft || !draft.id) return false;
  useLyricsStore.getState().saveFreeNoteDraft(draft);
  return true;
}

// ---------------------------------------------------------------------------
// 4. Mod+Shift+A — the rail toggle
// ---------------------------------------------------------------------------

/**
 * Live binding with the shipped default as fallback (a partially rehydrated
 * hotkeys store must never leave the rail key unbound).
 *
 * @param {Record<string, string>|undefined} bindings
 * @returns {string} a TanStack hotkey combo string
 */
export const resolveToggleCombo = (bindings) =>
  bindings && typeof bindings.toggleSermonAssist === 'string' && bindings.toggleSermonAssist.length > 0
    ? bindings.toggleSermonAssist
    : DEFAULT_BINDINGS.toggleSermonAssist;

/**
 * Register the rail toggle for the lifetime of the calling component and
 * return the combo currently bound (for display).
 *
 * What it may NOT do: arm, enable, start, or display anything. The handler
 * flips `ui.railCollapsed` and only while `enabled` is already true — with the
 * feature off, the key is a no-op, because a keystroke that turns the feature
 * on would violate "off by default, cold by default".
 */
export function useSermonAssistToggle() {
  const combo = useHotkeysStore((state) => resolveToggleCombo(state.bindings));

  useEffect(() => {
    const manager = getHotkeyManager();
    const handle = manager.register(
      combo,
      () => {
        const speech = useSpeechStore.getState();
        if (!speech.enabled) return;
        const collapsed = speech.ui?.railCollapsed === true;
        speech.setUI({ railCollapsed: !collapsed });
      },
      // 'allow': a second mount (or a test) registering the same combo is
      // idempotent — every handler does the same flip.
      { conflictBehavior: 'allow' }
    );
    return () => handle.unregister();
  }, [combo]);

  return combo;
}

export default useSpeechRuntime;
