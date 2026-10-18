/**
 * SpeechRuntimeStore.js — Live Sermon Assist Phase 4, the rail's runtime state.
 *
 * WHAT LIVES HERE: the transcript tail (settled segments), the one provisional
 * partial, the reason the newest segment failed a hallucination gate, the
 * running sermon-note draft, and the list of references the operator has
 * dismissed.
 *
 * WHAT NEVER LIVES HERE: persistence. This store deliberately does NOT use
 * zustand's `persist` — no localStorage, no disk. A transcript is audio-derived
 * text belonging to *this session*; reloading the app must start from an empty
 * rail, and a crash must never resurrect half of a sermon. (SpeechStore keeps
 * the preferences that are safe to remember; this store remembers nothing.)
 *
 * HYGIENE (plan, non-negotiable): no logging of any kind in this module — a
 * segment's text is never written to the logger, only shown in the rail. The
 * store is a plain `create()`; importing it performs no I/O, spawns nothing,
 * opens no socket, and touches no media device (invariant 4's cold-by-default
 * rule covers src/components/Speech/** and speech-named hooks).
 *
 * Gate semantics (why `gateReason` exists at all): the hallucination gates in
 * src/speech/hallucination.js decide whether the newest final segment may feed
 * a SUGGESTION. `pushSegment` runs `gateSegment` once per final, keeps the
 * phrase that failed on both the state and the stored segment, and refuses to
 * append a discarded segment to the note — the note is content that later
 * reaches an output through "Send to Free Notes", so it is held to the same
 * rule as the cards. The tail still shows what the engine settled on (marked
 * `data-gate="discarded"`): hiding the hallucination would hide the very thing
 * the operator should notice.
 */
import { create } from 'zustand';
import {
  appendFinalSegment,
  createSermonNote,
  editSermonNote,
  gateSegment,
} from '../speech';

/** Tail length: bounded so an hour of sermon cannot grow an unbounded array. */
export const MAX_TAIL_SEGMENTS = 40;

/** Dismissed references are bounded for the same reason. */
export const MAX_DISMISSED = 50;

/**
 * Machine gate reason (GATE_REASONS) -> the sentence fragment the operator
 * reads. Deliberately text-free: the phrases below never include anything
 * that was said — only why it was rejected.
 */
const GATE_PHRASES = Object.freeze({
  'below-noise-floor': 'below the noise floor',
  'model-flagged-no-speech': 'flagged as no speech by the model',
  'repeated-phrase': 'a repeated phrase',
});

/**
 * @param {string} reason a GATE_REASONS value ('' when the gate passed)
 * @returns {string} human phrase, '' for a passing segment
 */
export function gatePhrase(reason) {
  if (!reason) return '';
  return GATE_PHRASES[reason] ?? 'discarded by a hallucination gate';
}

const initialState = () => ({
  /** Settled segments, oldest first, bounded to MAX_TAIL_SEGMENTS. */
  segments: [],
  /** The engine's provisional partial — unsettled, never a suggestion input. */
  partial: '',
  /** Phrase for the NEWEST segment's gate failure; '' when it passed. */
  gateReason: '',
  /** Running draft in the freeNotesDrafts shape; created on first use. */
  note: createSermonNote(),
  /** References the operator dismissed — a label, not content. */
  dismissed: [],
});

const useSpeechRuntimeStore = create((set, get) => ({
  ...initialState(),

  /** Replace the provisional partial (engine `t:'partial'`). */
  setPartial(text) {
    set({ partial: typeof text === 'string' ? text : '' });
  },

  /** Drop the provisional partial without touching the tail. */
  clearPartial() {
    if (get().partial !== '') set({ partial: '' });
  },

  /**
   * Settle one final segment: append it to the tail, clear the partial, run
   * the gates once, and — only when they pass — append it to the note.
   *
   * @param {{t?: string, text?: string, noSpeechProb?: number,
   *          confidence?: number, ...}} segment the whole engine message
   */
  pushSegment(segment) {
    if (!segment || typeof segment.text !== 'string' || segment.text.trim() === '') {
      // An empty final still settles the partial: the engine moved on.
      if (get().partial !== '') set({ partial: '' });
      return;
    }

    const gate = gateSegment(segment);
    const gateReason = gate.ok ? '' : gatePhrase(gate.reason);

    set((state) => {
      const stored = { ...segment, gateReason };
      const segments = [...state.segments, stored].slice(-MAX_TAIL_SEGMENTS);
      const note = gate.ok ? appendFinalSegment(state.note, segment) : state.note;
      return { segments, partial: '', gateReason, note };
    });
  },

  /** Inline edit of the running note (plan 11: the note is editable). */
  editNote(patch) {
    set((state) => ({ note: editSermonNote(state.note, patch) }));
  },

  /**
   * Dismiss the verse card for a reference. Local only — no emit, no store
   * content change: nothing on any screen moves or changes.
   */
  dismissVerse(reference) {
    if (typeof reference !== 'string' || reference.trim() === '') return;
    set((state) => {
      if (state.dismissed.includes(reference)) return {};
      return { dismissed: [...state.dismissed, reference].slice(-MAX_DISMISSED) };
    });
  },

  /** Back to an empty rail: no tail, no partial, a fresh draft note. */
  reset() {
    set(initialState());
  },
}));

export default useSpeechRuntimeStore;
