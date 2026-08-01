import { searchBible } from 'shared/bible';

self.onmessage = function(e) {
  const { currentBible, query, allBibles, maxResults, defaultBibleId, searchAll } = e.data;
  const results = searchBible(currentBible, query, allBibles, maxResults, defaultBibleId, searchAll);
  self.postMessage(results);
};
