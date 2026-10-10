// src/speech/index.js — barrel for the suggestion engine (plan section 11)
//
// "Where the transcript becomes something useful. Pure functions, no I/O,
//  fully unit-testable."
//
// The rail (SermonAssistPanel) imports from here; nothing in this
// directory reads a store, opens a socket, spawns a process, or logs
// transcript text. Data goes in as parameters, suggestions come out.

export { THRESHOLDS } from './thresholds.js';
export { combine, segmentWeight, clamp01, clearsSuggestionFloor } from './confidence.js';

export {
  normalizeSpokenReference,
  wordsToDigits,
  stripBookPrefix,
  parseReference,
  matchReference,
} from './spokenForm.js';

export {
  detectVerse,
  detectVerseFromSegment,
  detectSpokenReference,
  detectAliasReference,
  detectFuzzyReference,
} from './detectVerse.js';

export { rankNextLyric, lyricTail, lyricLineText } from './rankNextLyric.js';

export {
  energyGate,
  noSpeechGate,
  repetitionGate,
  gateSegment,
  segmentWeightedConfidence,
  GATE_REASONS,
} from './hallucination.js';

export { lanesForCapabilities, findLane, LANE_IDS } from './capabilities.js';

export {
  FAKE_BACKEND,
  CANNED_BACKENDS,
  isCannedEngine,
  isRealEngine,
  cannedEngineLabel,
  engineModeLabel,
} from './engineTruth.js';

export {
  createSermonNote,
  appendFinalSegment,
  editSermonNote,
  sermonNoteFromSegments,
  toFreeNoteDraft,
} from './sermonNote.js';

export { rankVerses, textOverlapScore } from './verseCorpus.js';

export {
  BOOK_ALIAS_ROWS,
  CANONICAL_BOOK_NAMES,
  STRIPPED_PHRASES,
  lookupBookAlias,
  resolveBookAlias,
} from 'shared/bible/bookAliases.js';
