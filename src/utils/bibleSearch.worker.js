import { searchBible } from 'shared/bible';

let cachedBibles = {};
let cachedCurrentBible = null;

self.onmessage = function(e) {
  const { currentBible, query, allBibles, maxResults, defaultBibleId, searchAll, refreshBibles } = e.data;

  if (refreshBibles && allBibles && typeof allBibles === 'object') {
    cachedBibles = allBibles;
  }
  if (currentBible) {
    cachedCurrentBible = currentBible;
  }

  const activeCurrent = currentBible || cachedCurrentBible;
  const results = searchBible(activeCurrent, query, cachedBibles, maxResults, defaultBibleId, searchAll);
  self.postMessage(results);
};
