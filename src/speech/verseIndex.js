/**
 * src/speech/verseIndex.js — the inverted index behind detector 3 (Phase 1).
 *
 * WHY THIS EXISTS. The shipped matcher scored by containment: "what share of
 * the query's content words appear in this verse". That is a word counter, not
 * a search engine. It cannot tell "I read the plans" (one rare, highly
 * diagnostic word) from a paragraph that happens to share four common ones,
 * and it has no way to notice that three matching words sat next to each other
 * in the verse rather than scattered across thirty.
 *
 * So this builds what FreeShow builds: a real inverted index over the active
 * translation.
 *
 *   wordIdf[w]        log((N + 1) / (df + 1)) — how much a word is worth
 *   wordPostings[w]   which verses contain w, as a flat Uint32Array
 *   verseTokens[v]    the token ids of verse v, in reading order
 *   referenceIndex    "john 3" -> { chapterNumber, startVerseId, verseCount }
 *
 * Candidate generation stops scanning 31,000 verses: it scans only the
 * postings of the query's own words, which is two orders of magnitude less
 * work and the reason a whole-translation scan is affordable per chunk.
 *
 * WHY THERE IS NO EVENT-LOOP YIELDING HERE. FreeShow's builder yields to the
 * main thread every 8ms because it runs in the renderer, where a 200ms stall
 * drops frames during a service. This one runs in src/workers/verseSearch.worker.js,
 * which has no frame budget to protect. Same scoring, less machinery.
 *
 * WHY THE STOPWORD SET STAYS. IDF handles stopwords correctly on its own — "the"
 * lands near zero weight and drops out of scoring for free. The hand-written set
 * in verseCorpus.js is kept as a floor for `textOverlapScore`, which still runs
 * on results that arrive without a score (the caller-supplied searchResults
 * path in detectVerse). Two mechanisms, two jobs, no conflict.
 *
 * PURE. Takes a bible object, returns an index. No store, no I/O, no timers.
 */

import THRESHOLDS from './thresholds.js';

/**
 * Lower-cased tokens with punctuation resolved.
 *
 * Apostrophes are REMOVED, hyphens become word breaks. That asymmetry is
 * deliberate and is not cosmetic:
 *
 *   "don't"  -> "dont"   (remove)  one token, still matches "dont"
 *   "don't"  -> "don t"  (replace) two tokens, and the "t" is then dropped
 *                                by the length filter — leaving a useless "don"
 *
 * So replacing an apostrophe with a space silently destroys the tail of a
 * word. That matters in scripture, which is full of contractions and
 * possessives: don't, can't, God's, man's, everyone's. Removing keeps them
 * searchable.
 *
 * Hyphens go the other way. "only-begotten" should index as two words, because
 * "only begotten" is how the phrase is read aloud and how it appears elsewhere
 * in a translation. Joining it would make the phrase unmatchable against a
 * transcription that spells it with a space.
 *
 * Single characters are dropped: "a", "I", "t" carry no signal and would only
 * enlarge the posting lists.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeVerseText(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/**
 * @typedef {object} VerseIndex
 * @property {string[]}        versePool        "John 3:16" per verse id
 * @property {Map<string,number>} verseToIdMap lower-cased reference -> id
 * @property {Map<string,{bookName:string,chapterNumber:number,startVerseId:number,verseCount:number}>} referenceIndex
 * @property {string[]}        vocabPool
 * @property {Map<string,number>} vocabToIdMap
 * @property {Float32Array}    wordIdf
 * @property {Uint32Array}     wordPostingsOffsets
 * @property {Uint32Array}     wordPostings
 * @property {Uint32Array}     verseTokensOffsets
 * @property {Uint32Array}     verseTokens
 * @property {string[]}        bookNames
 * @property {number}          totalVerses
 */

/**
 * Build the index for one translation. Synchronous on purpose — see the note
 * above about why there is no yielding.
 *
 * @param {{ id?: string, name?: string, books?: Array }} bible
 * @returns {VerseIndex|null} null when the bible has no usable books
 */
export function buildVerseIndex(bible) {
  if (!bible || !Array.isArray(bible.books)) return null;

  const versePool = [];
  const verseToIdMap = new Map();
  const referenceIndex = new Map();
  const vocabPool = [];
  const vocabToIdMap = new Map();
  const bookNames = [];
  // verseId -> raw verse text, carried so the card can render the resolved
  // text without a second lookup through BibleStore. The whole point of the
  // card showing the verse is that the operator can CHECK it.
  const verseTextById = new Map();
  let totalVerses = 0;

  /** wordId -> verseId[] during the build; packed into typed arrays after. */
  const postingsByWord = new Map();
  /** verseId -> tokenId[] during the build. */
  const tokensByVerse = [];

  // Pass 1 — walk the bible, intern every token, record every posting.
  for (const book of bible.books) {
    if (!book || !Array.isArray(book.chapters)) continue;
    bookNames.push(book.name);

    for (const chapter of book.chapters) {
      if (!chapter || !Array.isArray(chapter.verses)) continue;

      const startVerseId = totalVerses;
      let verseCount = 0;

      for (const verse of chapter.verses) {
        if (!verse || typeof verse.text !== 'string') continue;

        const verseId = totalVerses;
        const verseRef = `${book.name} ${chapter.number}:${verse.number}`;

        versePool.push(verseRef);
        verseToIdMap.set(verseRef.toLowerCase(), verseId);
        verseTextById.set(verseId, verse.text);
        totalVerses += 1;
        verseCount += 1;

        const tokenIds = [];
        const uniqueWordIds = new Set();

        for (const word of tokenizeVerseText(verse.text)) {
          let wordId = vocabToIdMap.get(word);
          if (wordId === undefined) {
            wordId = vocabPool.length;
            vocabToIdMap.set(word, wordId);
            vocabPool.push(word);
          }
          tokenIds.push(wordId);
          uniqueWordIds.add(wordId);
        }

        tokensByVerse.push(tokenIds);

        // One posting per (verse, word) pair. A verse that says "Lord" three
        // times still gets ONE posting — repeating a word inside a verse says
        // nothing about how diagnostic that word is for the verse.
        for (const wordId of uniqueWordIds) {
          let list = postingsByWord.get(wordId);
          if (!list) {
            list = [];
            postingsByWord.set(wordId, list);
          }
          list.push(verseId);
        }
      }

      referenceIndex.set(`${book.name.toLowerCase()} ${chapter.number}`, {
        bookName: book.name,
        chapterNumber: chapter.number,
        startVerseId,
        verseCount,
      });
    }
  }

  if (totalVerses === 0) return null;

  // Pass 2 — pack IDF and postings into typed arrays.
  //
  // The +1 smoothing is load-bearing. Without it a word appearing in every
  // verse would compute log(1) = 0 exactly, and a word in all but one verse
  // would divide by zero. Smoothed, "the" lands near zero and the cheapest
  // possible drop-out filter becomes arithmetic instead of a stopword list.
  const vocabSize = vocabPool.length;
  const wordIdf = new Float32Array(vocabSize);
  const wordPostingsOffsets = new Uint32Array(vocabSize + 1);

  let totalPostings = 0;
  for (let wordId = 0; wordId < vocabSize; wordId += 1) {
    const list = postingsByWord.get(wordId) || [];
    wordPostingsOffsets[wordId] = totalPostings;
    totalPostings += list.length;
    wordIdf[wordId] = Math.log((totalVerses + 1) / (list.length + 1));
  }
  wordPostingsOffsets[vocabSize] = totalPostings;

  const wordPostings = new Uint32Array(totalPostings);
  for (let wordId = 0; wordId < vocabSize; wordId += 1) {
    const list = postingsByWord.get(wordId) || [];
    const offset = wordPostingsOffsets[wordId];
    for (let i = 0; i < list.length; i += 1) wordPostings[offset + i] = list[i];
  }

  // Pass 3 — pack verse tokens, preserving reading order for the phrase bonus.
  const verseTokensOffsets = new Uint32Array(totalVerses + 1);
  let totalVerseTokens = 0;
  for (let verseId = 0; verseId < totalVerses; verseId += 1) {
    const tokens = tokensByVerse[verseId] || [];
    verseTokensOffsets[verseId] = totalVerseTokens;
    totalVerseTokens += tokens.length;
  }
  verseTokensOffsets[totalVerses] = totalVerseTokens;

  const verseTokens = new Uint32Array(totalVerseTokens);
  for (let verseId = 0; verseId < totalVerses; verseId += 1) {
    const tokens = tokensByVerse[verseId] || [];
    const offset = verseTokensOffsets[verseId];
    for (let i = 0; i < tokens.length; i += 1) verseTokens[offset + i] = tokens[i];
  }

  return {
    versePool,
    verseToIdMap,
    referenceIndex,
    vocabPool,
    vocabToIdMap,
    wordIdf,
    wordPostingsOffsets,
    wordPostings,
    verseTokensOffsets,
    verseTokens,
    verseTextById,
    bookNames,
    totalVerses,
    // Surfaced so the worker can drop a stale index without rebuilding: the
    // caller compares this against the bible it is about to serve.
    bibleId: bible.id ?? null,
    tokenThreshold: THRESHOLDS.verseIndex.tokenIdfFloor,
  };
}

/**
 * The token ids of one verse, in reading order.
 * @param {VerseIndex} index
 * @param {number} verseId
 * @returns {number[]}
 */
export function verseTokenIds(index, verseId) {
  if (!index || verseId < 0 || verseId >= index.totalVerses) return [];
  const start = index.verseTokensOffsets[verseId];
  const end = index.verseTokensOffsets[verseId + 1];
  return Array.from(index.verseTokens.subarray(start, end));
}

export default buildVerseIndex;