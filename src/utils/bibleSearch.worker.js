import { searchBible } from 'shared/bible';

let cachedBibles = {};
let cachedCurrentBible = null;

self.onmessage = function(e) {
  const { currentBible, query, allBibles, maxResults, defaultBibleId, searchAll, refreshBibles, pruneBibles } = e.data;

  if (refreshBibles && allBibles && typeof allBibles === 'object') {
    cachedBibles = allBibles;
  }
  if (currentBible) {
    cachedCurrentBible = currentBible;
  }
  if (pruneBibles && typeof pruneBibles === 'object') {
    // The renderer evicted inactive bibles from its store; drop them here too
    // so this worker does not keep the full corpus alive indefinitely.
    const keptIds = new Set(Object.keys(pruneBibles));
    for (const bibleId of Object.keys(cachedBibles)) {
      if (!keptIds.has(bibleId)) delete cachedBibles[bibleId];
    }
  }

  const activeCurrent = currentBible || cachedCurrentBible;
  if (typeof query === 'string' && query.trim().length > 0) {
    const results = searchBible(activeCurrent, query, cachedBibles, maxResults, defaultBibleId, searchAll);
    self.postMessage(results);
  }
};
