// src/workers/verseSearch.worker.js — off-thread verse search (plan 11, detector 3)
//
// "using the existing src/utils/bibleSearch.worker.js off-thread pattern
//  so a 30,000-verse search never touches the UI thread during a service."
//
// Message shape mirrors bibleSearch.worker.js exactly:
//   in  { query, currentBible, allBibles, maxResults, refreshBibles, pruneBibles }
//   out Array of scored verse results, or null when nothing matched
//       (or the message was unusable) — a 0-result search returns null
//       rather than throwing.
//
// The bible corpus is retained across messages so the renderer can omit
// `currentBible` on subsequent sends, and pruned when the renderer evicts
// inactive translations — same retention rules as the existing worker.

import { rankVerses } from '../speech/verseCorpus.js';

let cachedBibles = {};
let cachedCurrentBible = null;

self.onmessage = function (e) {
  const {
    currentBible,
    query,
    allBibles,
    maxResults,
    refreshBibles,
    pruneBibles,
    minScore,
    minMatches,
  } = e.data ?? {};

  try {
    if (refreshBibles && allBibles && typeof allBibles === 'object') {
      cachedBibles = allBibles;
    }
    if (currentBible) {
      cachedCurrentBible = currentBible;
    }
    if (pruneBibles && typeof pruneBibles === 'object') {
      const keptIds = new Set(Object.keys(pruneBibles));
      for (const bibleId of Object.keys(cachedBibles)) {
        if (!keptIds.has(bibleId)) delete cachedBibles[bibleId];
      }
    }

    const activeBible = currentBible || cachedCurrentBible;
    if (typeof query !== 'string' || query.trim().length === 0 || !activeBible) {
      self.postMessage(null);
      return;
    }

    const results = rankVerses(query, activeBible, { maxResults, minScore, minMatches });
    self.postMessage(results.length > 0 ? results : null);
  } catch {
    // A search failure during a service is silence, never an exception
    // that could take the rail down mid-sermon.
    self.postMessage(null);
  }
};
