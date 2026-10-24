/**
 * useVerseSearchWorker.js — owns the off-thread verse index for detector 3
 * (Phase 1).
 *
 * WHY THIS FILE EXISTS. `detectVerse()` takes `searchResults` as a parameter and
 * has always taken it as a parameter — but nothing was ever passing them, so
 * detector 3 (full-text fuzzy match) was dead code. It is wired here.
 *
 * THE TWO-STAGE ORDER IS THE POINT, and it is not an optimization:
 *
 *   1. Run detectors 1 and 2 WITHOUT the worker. These are regex-and-table
 *      lookups — microseconds. A reference said out loud ("First Peter, five")
 *      resolves here and must never wait on a 30,000-verse scan.
 *   2. ONLY if both miss, spin up the worker. That is the expensive path, and
 *      it is reached only when the preacher is reading a verse WITHOUT saying
 *      its reference — which is the common case for a reading-aloud, and the
 *      case the index exists to serve.
 *
 * So a spoken reference costs nothing, and a verbatim reading costs one
 * indexed scan. Getting this order backwards would add worker latency to the
 * single most latency-sensitive path in the feature.
 *
 * WHY THE INDEX LIVES IN THE WORKER. The inverted index is built once per
 * translation and cached there across a whole service. Putting it in the
 * renderer would mean either rebuilding it per chunk or holding ~2 MB of
 * typed arrays on the UI thread during a service, where a stall drops frames.
 *
 * COLD BY DEFAULT (invariant 4). The worker is not constructed at import time,
 * not constructed on mount, and not constructed while the feature is off. It is
 * constructed on the first transcript tail that actually needs detector 3, and
 * terminated on unmount. Mounting this hook with the feature off touches no
 * Worker constructor, no media device, and no network.
 *
 * NO LOGGING. Transcript text goes in as a parameter and comes back as scored
 * results. It is never written to the console, because a sermon transcript in
 * a log file is a privacy failure that outlives the service.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import useLyricsStore from '../context/LyricsStore';
import useBibleStore from '../context/BibleStore';
import { THRESHOLDS } from '../speech';

/**
 * Debounce before a worker round-trip. Long enough that a preacher reading a
 * passage does not trigger one scan per sentence, short enough that the card
 * still appears while he is mid-paragraph.
 */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * The locale the spoken citation vocabulary should use (Phase 3).
 *
 * Precedence, in order:
 *
 *   1. An explicit operator override in User Preferences. Highest, because the
 *      congregation's language and the machine's language are genuinely
 *      different facts — a French-speaking church running an English UI on a
 *      shared laptop is completely ordinary, and no amount of locale sniffing
 *      would get that right.
 *   2. The browser/OS locale, which is the best available guess about the room.
 *   3. English, which is the previous behaviour and a safe fallback: every
 *      English citation keeps working, and nothing is lost that worked before.
 *
 * Reads `navigator.language` defensively — it is absent in a test environment
 * and in a renderer that has not finished initializing, and this must never be
 * the thing that throws during a service.
 *
 * @param {string|null} override the operator's choice, or null
 * @returns {string} a locale tag
 */
export function resolveSpeechLocale(override = null) {
  if (typeof override === 'string' && override.trim()) return override.trim();

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
      return navigator.language;
    }
  } catch {
    // A renderer that cannot answer this is not a reason to fail a service.
  }

  return 'en';
}

/**
 * @param {object} options
 * @param {boolean} options.enabled   the verse lane is enabled and running
 * @param {string}   options.transcript the transcript TAIL to match against
 * @param {string|null} options.currentReference what is on screen now, for the
 *   upcoming-verse prior. This is the single most valuable parameter the scorer
 *   gets: it is what tells it which verse he is probably moving to next.
 * @returns {{results: Array, searching: boolean, searchingBibleId: string|null}}
 */
export function useVerseSearchWorker({ enabled = false, transcript = '', currentReference = null } = {}) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const workerRef = useRef(null);
  const bibles = useBibleStore((state) => state.bibles);
  const activeBibleId = useBibleStore((state) => state.activeBibleId);
  const lastSentRef = useRef(null);

  /** Build the worker lazily — never on mount, never while disabled. */
  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL('../workers/verseSearch.worker.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (event) => {
      // A null reply is the contract's "nothing matched" answer, not an error.
      setResults(Array.isArray(event.data) ? event.data : []);
      setSearching(false);
    };
    worker.onerror = () => {
      // Silence is always an acceptable outcome on a sanctuary screen. A worker
      // that dies must leave the rail working with whatever it already had,
      // never take the lane down mid-sermon.
      setSearching(false);
      setResults([]);
    };
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setResults([]);
      setSearching(false);
      lastSentRef.current = null;
      return undefined;
    }
    if (!transcript || transcript.trim().length === 0 || !activeBibleId) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    const handle = setTimeout(() => {
      const bible = bibles?.[activeBibleId] ?? null;
      // Without a usable corpus there is nothing to index. An API-backed Bible
      // has no local text, so detector 3 cannot run against it — and must say so
      // by producing nothing rather than by guessing.
      if (!bible || !Array.isArray(bible.books)) {
        setResults([]);
        setSearching(false);
        return;
      }

      const payload = `${activeBibleId}:${currentReference ?? ''}:${transcript}`;
      if (lastSentRef.current === payload) return;
      lastSentRef.current = payload;

      const worker = ensureWorker();
      setSearching(true);
      worker.postMessage({
        currentBible: bible,
        query: transcript,
        currentReference,
        allBibles: bibles,
        maxResults: THRESHOLDS.verseSearch.maxResults,
        minScore: THRESHOLDS.verseSearch.minScore,
        minMatches: THRESHOLDS.verseSearch.minMatches,
        // First message for this corpus: the worker has no cache to serve from.
        refreshBibles: true,
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [enabled, transcript, currentReference, bibles, activeBibleId, ensureWorker]);

  // Terminate on unmount and on feature-off. An orphaned worker holds an
  // inverted index — real memory — and nothing would ever ask it a question
  // again.
  useEffect(() => {
    if (!enabled) {
      workerRef.current?.terminate();
      workerRef.current = null;
      lastSentRef.current = null;
    }
    return undefined;
  }, [enabled]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return { results, searching, searchingBibleId: activeBibleId ?? null };
}

/**
 * What is on screen right now, as a bare reference string, for the scorer.
 *
 * Reads the same state the verse card uses so the prior and the display can
 * never disagree — if the card says John 3:16, the scorer believed John 3:16.
 *
 * @returns {string|null}
 */
export function useCurrentBibleReference() {
  const activeReference = useBibleStore((state) => state.activeReference);
  const selectedVerses = useBibleStore((state) => state.selectedVerses);
  const bibles = useBibleStore((state) => state.bibles);

  if (!activeReference || !Array.isArray(activeReference.chapters)) return null;

  const book =
    (activeReference.bookMap && activeReference.bookMap[activeReference.book]) ||
    (bibles?.[activeReference.bibleId]?.books || []).find((b) => b.number === activeReference.book);
  if (!book) return null;

  const verses = [...new Set((selectedVerses || []).filter((v) => Number.isInteger(v)))].sort((a, b) => a - b);
  if (verses.length === 0) return null;

  return `${book.name} ${activeReference.chapters.join(',')}:${verses.join(',')}`;
}

export default useVerseSearchWorker;