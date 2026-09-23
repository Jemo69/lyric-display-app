import { detectBibleFormat } from './xmlUtils.js';
import { parseZefaniaBible } from './zefaniaBible.js';
import { parseOsisBible } from './osisBible.js';
import { parseBebliaBible } from './bebliaBible.js';
import { parseOpenSongBible } from './openSongBible.js';
import createSharedLogger from '../logger.js';

const log = createSharedLogger('Bible');

const bibleParsers = {
  zefania: { name: 'Zefania', parse: parseZefaniaBible },
  osis: { name: 'OSIS', parse: parseOsisBible },
  beblia: { name: 'Beblia', parse: parseBebliaBible },
  opensong: { name: 'OpenSong', parse: parseOpenSongBible }
};

export function parseBible(content, fileName = 'bible') {
  log.info(`parseBible: parsing file "${fileName}", content length=${content.length}`);
  const format = detectBibleFormat(content);
  log.debug(`parseBible: detected format="${format}"`);

  if (format === 'unknown') {
    log.warn('Unknown Bible format, attempting Zefania as fallback');
    const result = parseZefaniaBible(content);
    if (result.books.length > 0) {
      return { id: `bible_${Date.now()}`, ...result };
    }
    log.warn(`parseBible: fallback parse returned 0 books for "${fileName}"`);
    return { name: fileName, books: [] };
  }

  const parser = bibleParsers[format];
  if (!parser) {
    log.error(`No parser found for format: ${format}`);
    return { name: fileName, books: [] };
  }

  const result = parser.parse(content);
  log.info(`parseBible: successfully parsed "${fileName}" as ${parser.name}, ${result.books.length} books`);

  // Add O(1) lookup maps
  result.bookMap = {};
  for (const book of result.books) {
    result.bookMap[book.number] = book;
    book.chapterMap = {};
    for (const chapter of book.chapters) {
      book.chapterMap[chapter.number] = chapter;
      chapter.verseMap = {};
      for (const verse of chapter.verses) {
        chapter.verseMap[verse.number] = verse;
      }
    }
  }

  // Build search index
  result.searchIndex = buildSearchIndex(result);

  return { id: `bible_${Date.now()}`, ...result };
}

export function parseBibleFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const fileName = file.name.replace(/\.[^.]+$/i, '');
        const bible = parseBible(content, fileName);
        resolve(bible);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export { detectBibleFormat };

export function orderBibleMetadata(bibleMetadata, defaultBibleId = null) {
  const items = Object.values(bibleMetadata || {});
  if (!defaultBibleId) return items;

  return items.sort((a, b) => {
    if (a.id === defaultBibleId && b.id !== defaultBibleId) return -1;
    if (b.id === defaultBibleId && a.id !== defaultBibleId) return 1;
    return 0;
  });
}

export function buildSearchIndex(bible) {
  log.info(`buildSearchIndex: indexing ${bible.books?.length || 0} books`);
  const index = {};

  for (const book of bible.books) {
    for (const chapter of book.chapters) {
      for (const verse of chapter.verses) {
        const words = (verse.text || '').toLowerCase().split(/\s+/);

        const seenInVerse = new Set();
        for (const word of words) {
          const normalized = word.replace(/[^a-z0-9]/g, '');
          if (!normalized || normalized.length < 3 || seenInVerse.has(normalized)) continue;

          const result = {
            b: book.number,
            c: chapter.number,
            v: verse.number
          };

          if (!index[normalized]) {
            index[normalized] = [];
          }
          index[normalized].push(result);
          seenInVerse.add(normalized);
        }
      }
    }
  }

  return index;
}

export function getBibleVerseText(bible, reference, selectedVerses) {
  if (!bible || !reference) return '';

  const bookObj = (bible.bookMap && bible.bookMap[reference.book]) || bible.books?.find(b => b.number === reference.book);
  if (!bookObj) return '';

  const chapterNum = parseInt(reference.chapters?.[0], 10);
  if (Number.isNaN(chapterNum)) return '';

  const chapter = (bookObj.chapterMap && bookObj.chapterMap[chapterNum]) || bookObj.chapters?.find(c => c.number === chapterNum);
  if (!chapter) return '';

  const verses = selectedVerses?.[0] || [];
  const texts = verses.map(v => {
    const verse = (chapter.verseMap && chapter.verseMap[v]) || chapter.verses?.find(vx => vx.number === v);
    return verse?.text || '';
  }).filter(Boolean);

  return texts.join(' ');
}

export const REFERENCE_REGEX = /^(.+?)\s+(\d+)(?:[:.,]\s*(\d+)|\s+(\d+))?(?:-(\d+))?/i;

// --- Cross-chapter + multi-part reference support (MF-14, additive) ---
// CROSS_CHAPTER_REGEX matches "Book 1:26-2:3" / "Rom 8:38-9:2" (any dash
// variant, spaces tolerated). CHAPTER_SPAN_REGEX matches whole-chapter spans
// like "Gen 1-2" / "Ps 23-24". Both are fully anchored so plain fuzzy queries
// and legacy prefix matches (e.g. "John 3:16 notes") never take this path.
const CROSS_CHAPTER_DASH = '[-\\u2012\\u2013\\u2014\\u2212]';
export const CROSS_CHAPTER_REGEX = new RegExp(
  `^(.+?)\\s+(\\d+)\\s*[:.,]\\s*(\\d+)\\s*${CROSS_CHAPTER_DASH}\\s*(\\d+)\\s*[:.,]\\s*(\\d+)\\s*$`,
  'i'
);
export const CHAPTER_SPAN_REGEX = new RegExp(
  `^(.+?)\\s+(\\d+)\\s*${CROSS_CHAPTER_DASH}\\s*(\\d+)\\s*$`,
  'i'
);

// A continuation part with no book/chapter of its own, e.g. "17" in
// "John 3:16; 17" (inherits the previous book + chapter).
const BARE_VERSE_PART_REGEX = /^\d+\s*(?:-\s*\d+)?$/;

export function normalizeReferenceDashes(value) {
  return String(value || '').replace(/[\u2012\u2013\u2014\u2212]/g, '-');
}

export function splitMultiPartReferences(query) {
  return String(query || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Expand a cross-chapter (or whole-chapter-span) segment into per-chapter
 * verse groups. Pure function: no Node/browser APIs, safe in Node, workers,
 * and browsers.
 *
 * @param {object} bible - parsed bible (books array)
 * @param {object} bookMatch - book object the segment resolved to
 * @param {{chapter:number, verse:number|null}} start - span start
 * @param {{chapter:number, verse:number|null}} end - span end
 * @returns {Array<{book,bookName,chapter,verses:number[],text,reference}>}
 *   one entry per chapter that actually contains verses in the span.
 */
export function expandCrossChapterSegment(bible, bookMatch, start, end) {
  const groups = [];
  if (!bible || !bookMatch) return groups;

  const startChapter = parseInt(start?.chapter, 10);
  const endChapter = parseInt(end?.chapter, 10);
  if (!Number.isInteger(startChapter) || !Number.isInteger(endChapter)) return groups;
  if (startChapter < 1 || endChapter < startChapter) return groups;

  const startVerse = start?.verse == null ? null : parseInt(start.verse, 10);
  const endVerse = end?.verse == null ? null : parseInt(end.verse, 10);
  if (startVerse != null && (!Number.isInteger(startVerse) || startVerse < 1)) return groups;
  if (endVerse != null && (!Number.isInteger(endVerse) || endVerse < 1)) return groups;
  if (startChapter === endChapter && startVerse != null && endVerse != null && endVerse < startVerse) {
    return groups;
  }

  const findChapterInBook = (number) => {
    if (bookMatch.chapterMap) return bookMatch.chapterMap[number] || null;
    return bookMatch.chapters?.find((chapter) => chapter.number === number) || null;
  };

  for (let number = startChapter; number <= endChapter; number++) {
    const chapter = findChapterInBook(number);
    if (!chapter || !Array.isArray(chapter.verses)) continue;
    const sorted = [...chapter.verses]
      .filter((verse) => verse && Number.isInteger(verse.number))
      .sort((a, b) => a.number - b.number);
    if (sorted.length === 0) continue;

    let wanted = sorted;
    if (number === startChapter && startVerse != null) {
      wanted = wanted.filter((verse) => verse.number >= startVerse);
    }
    if (number === endChapter && endVerse != null) {
      wanted = wanted.filter((verse) => verse.number <= endVerse);
    }
    if (wanted.length === 0) continue;

    const first = wanted[0].number;
    const last = wanted[wanted.length - 1].number;
    const isFullChapter = first === sorted[0].number && last === sorted[sorted.length - 1].number;
    const reference = isFullChapter
      ? `${bookMatch.name} ${number}`
      : (last > first
        ? `${bookMatch.name} ${number}:${first}-${last}`
        : `${bookMatch.name} ${number}:${first}`);

    groups.push({
      book: bookMatch.number,
      bookName: bookMatch.name,
      chapter: number,
      verses: wanted.map((verse) => verse.number),
      text: wanted.map((verse) => verse.text || '').join(' ').trim(),
      reference
    });
  }

  return groups;
}

function matchCrossChapterSegment(segment) {
  const normalized = normalizeReferenceDashes(segment).trim();
  const cross = normalized.match(CROSS_CHAPTER_REGEX);
  if (cross) {
    return {
      bookPart: (cross[1] || '').trim(),
      startChapter: parseInt(cross[2], 10),
      startVerse: parseInt(cross[3], 10),
      endChapter: parseInt(cross[4], 10),
      endVerse: parseInt(cross[5], 10),
      isChapterSpan: false
    };
  }
  const span = normalized.match(CHAPTER_SPAN_REGEX);
  if (span) {
    return {
      bookPart: (span[1] || '').trim(),
      startChapter: parseInt(span[2], 10),
      startVerse: null,
      endChapter: parseInt(span[3], 10),
      endVerse: null,
      isChapterSpan: true
    };
  }
  return null;
}

function matchSingleSegment(segment) {
  const normalized = normalizeReferenceDashes(segment).trim();
  const match = normalized.match(REFERENCE_REGEX);
  if (!match) return null;
  const [, bookPart, chapterPart, versePart1, versePart2, rangeEndPart] = match;
  return {
    bookPart: (bookPart || '').trim(),
    chapterPart,
    versePart: versePart1 || versePart2 || null,
    rangeEndPart: rangeEndPart || null
  };
}

// Legacy-equivalent single-segment resolver (same result shapes as the
// searchBible reference path). Returns { context, results } or null.
function resolveSingleSegmentForBible(bible, segment, chapterOnlyAllowed, maxResults) {
  const parsed = matchSingleSegment(segment);
  if (!parsed || !parsed.bookPart) return null;

  const bookMatch = findBookInArray(bible.books, parsed.bookPart);
  if (!bookMatch) return null;

  const chapter = findChapter(bookMatch, parsed.chapterPart);
  if (!chapter) return null;

  if (parsed.versePart) {
    const startVerse = parseInt(parsed.versePart, 10);
    const endVerse = parseInt(parsed.rangeEndPart || parsed.versePart, 10);
    const versesInRange = (chapter.verses || []).filter(
      (verse) => verse.number >= startVerse && verse.number <= endVerse
    );
    if (versesInRange.length === 0) return null;

    const normalizedEnd = Number.isNaN(endVerse) ? startVerse : endVerse;
    return {
      context: { bookName: bookMatch.name, chapter: chapter.number },
      results: [{
        book: bookMatch.number,
        bookName: bookMatch.name,
        chapter: chapter.number,
        verse: startVerse,
        endVerse: normalizedEnd,
        verses: versesInRange.map((verse) => verse.number),
        text: versesInRange.map((verse) => verse.text || '').join(' ').trim(),
        reference: normalizedEnd > startVerse
          ? `${bookMatch.name} ${chapter.number}:${startVerse}-${normalizedEnd}`
          : `${bookMatch.name} ${chapter.number}:${startVerse}`,
        bibleId: bible.id,
        bibleName: bible.name
      }]
    };
  }

  if (!chapterOnlyAllowed || !chapter.verses?.length) return null;
  return {
    context: { bookName: bookMatch.name, chapter: chapter.number },
    results: chapter.verses.slice(0, maxResults).map((verse) => ({
      book: bookMatch.number,
      bookName: bookMatch.name,
      chapter: chapter.number,
      verse: verse.number,
      text: verse.text || '',
      reference: `${bookMatch.name} ${chapter.number}:${verse.number}`,
      bibleId: bible.id,
      bibleName: bible.name
    }))
  };
}

function resolveCrossSegmentForBible(bible, parsed) {
  if (!parsed.bookPart) return null;
  const bookMatch = findBookInArray(bible.books, parsed.bookPart);
  if (!bookMatch) return null;

  const groups = expandCrossChapterSegment(
    bible,
    bookMatch,
    { chapter: parsed.startChapter, verse: parsed.startVerse },
    { chapter: parsed.endChapter, verse: parsed.endVerse }
  );
  if (groups.length === 0) return null;

  const groupReference = parsed.isChapterSpan
    ? `${bookMatch.name} ${parsed.startChapter}-${parsed.endChapter}`
    : `${bookMatch.name} ${parsed.startChapter}:${parsed.startVerse}-${parsed.endChapter}:${parsed.endVerse}`;

  const results = groups.map((group, index) => ({
    book: group.book,
    bookName: group.bookName,
    chapter: group.chapter,
    verse: group.verses[0],
    endVerse: group.verses[group.verses.length - 1],
    verses: group.verses,
    text: group.text,
    reference: group.reference,
    bibleId: bible.id,
    bibleName: bible.name,
    isCrossChapter: true,
    groupReference,
    groupIndex: index,
    groupSize: groups.length
  }));

  return {
    context: { bookName: bookMatch.name, chapter: groups[groups.length - 1].chapter },
    results
  };
}

// Resolve one ';'-separated part, carrying the previous book/chapter forward
// for continuation parts like "4:5" or "17" in "John 3:16; 17".
function resolveSegmentWithCarryover(bible, segment, carry, chapterOnlyAllowed, maxResults) {
  const trimmed = normalizeReferenceDashes(segment).trim();
  if (!trimmed) return null;

  const cross = matchCrossChapterSegment(trimmed);
  if (cross?.bookPart) {
    const resolved = resolveCrossSegmentForBible(bible, cross);
    if (resolved) return resolved;
  }

  const single = resolveSingleSegmentForBible(bible, trimmed, chapterOnlyAllowed, maxResults);
  if (single) return single;

  if (carry?.bookName) {
    const withBook = `${carry.bookName} ${trimmed}`;
    const crossCarry = matchCrossChapterSegment(withBook);
    if (crossCarry) {
      const resolved = resolveCrossSegmentForBible(bible, crossCarry);
      if (resolved) return resolved;
    }
    if (carry.chapter != null && BARE_VERSE_PART_REGEX.test(trimmed)) {
      const asVerse = resolveSingleSegmentForBible(
        bible,
        `${carry.bookName} ${carry.chapter}:${trimmed}`,
        chapterOnlyAllowed,
        maxResults
      );
      if (asVerse) return asVerse;
    }
    const asReference = resolveSingleSegmentForBible(bible, withBook, chapterOnlyAllowed, maxResults);
    if (asReference) return asReference;
  }

  return null;
}

// Attempt cross-chapter / multi-part resolution. Returns an array of grouped
// results, or null when the query is not such a reference (caller falls back
// to the legacy single-reference + fuzzy paths unchanged).
function searchGroupedReferences(biblesToSearch, rawQuery, maxResults, currentBibleId) {
  const normalized = normalizeReferenceDashes(rawQuery);
  const isMulti = normalized.includes(';');
  if (!isMulti && !matchCrossChapterSegment(normalized)) return null;

  const parts = isMulti ? splitMultiPartReferences(normalized) : [normalized.trim()];
  if (parts.length === 0) return null;

  const results = [];
  for (const bible of biblesToSearch) {
    const chapterOnlyAllowed = bible.id === currentBibleId || (!currentBibleId && biblesToSearch.length === 1);
    let carry = null;
    parts.forEach((part, partIndex) => {
      const resolved = resolveSegmentWithCarryover(bible, part, carry, chapterOnlyAllowed, maxResults);
      if (!resolved) return;
      carry = resolved.context;
      for (const item of resolved.results) {
        results.push(isMulti
          ? { ...item, partIndex, partTotal: parts.length, partReference: part }
          : item);
      }
    });
  }

  return results.length > 0 ? results.slice(0, maxResults) : null;
}
const bookIndexCache = new WeakMap();

function normalizeBookName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s/g, '')
    .replace(/\./g, '');
}

function getBookIndex(books) {
  if (!books) return null;
  let entries = bookIndexCache.get(books);
  if (entries) return entries;

  entries = books.map((book) => {
    const name = normalizeBookName(book.name);
    const abbr = book.abbreviation ? normalizeBookName(book.abbreviation) : '';
    return { book, name, abbr };
  });
  bookIndexCache.set(books, entries);
  return entries;
}

function findBookInArray(books, value) {
  if (!books || books.length === 0) return null;
  const normalized = normalizeBookName(value);
  if (!normalized) return null;

  const index = getBookIndex(books);

  for (let i = 0; i < index.length; i++) {
    const entry = index[i];
    if (entry.name === normalized || entry.abbr === normalized) return entry.book;
  }

  for (let i = 0; i < index.length; i++) {
    const entry = index[i];
    if (entry.name.startsWith(normalized) || entry.abbr.startsWith(normalized)) return entry.book;
  }

  for (let i = 0; i < index.length; i++) {
    const entry = index[i];
    if (entry.name.includes(normalized) || entry.abbr.includes(normalized)) return entry.book;
  }

  return null;
}

function findChapter(book, value) {
  const chapterNumber = parseInt(value, 10);
  if (Number.isNaN(chapterNumber) || chapterNumber < 1) return null;
  if (book.chapterMap) return book.chapterMap[chapterNumber] || null;
  return book.chapters?.find((chapter) => chapter.number === chapterNumber) || null;
}

function findVerse(chapter, value) {
  const verseNumber = parseInt(value, 10);
  if (Number.isNaN(verseNumber) || verseNumber < 1) return null;
  if (chapter.verseMap) return chapter.verseMap[verseNumber] || null;
  return chapter.verses?.find((verse) => verse.number === verseNumber) || null;
}

function parseCombinedQuery(query, books) {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/);

  if (words.length < 2) {
    return { textTerm: trimmed, book: null };
  }

  for (let i = 0; i < words.length; i++) {
    const singleWord = words[i];
    const book = findBookInArray(books, singleWord);
    if (book) {
      const textTerm = words.filter((_, idx) => idx !== i).join(' ').trim();
      if (textTerm.length >= 2) return { textTerm, book };
    }

    if (i < words.length - 1) {
      const twoWords = `${words[i]} ${words[i + 1]}`;
      const book2 = findBookInArray(books, twoWords);
      if (book2) {
        const textTerm = words.filter((_, idx) => idx !== i && idx !== i + 1).join(' ').trim();
        if (textTerm.length >= 2) return { textTerm, book: book2 };
      }
    }

    if (i < words.length - 2) {
      const threeWords = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const book3 = findBookInArray(books, threeWords);
      if (book3) {
        const textTerm = words.filter((_, idx) => idx !== i && idx !== i + 1 && idx !== i + 2).join(' ').trim();
        if (textTerm.length >= 2) return { textTerm, book: book3 };
      }
    }
  }

  return { textTerm: trimmed, book: null };
}

function searchInBible(books, searchTerm, filterBook = null) {
  const results = [];
  const searchLower = searchTerm.toLowerCase();
  const booksToSearch = filterBook ? [filterBook] : books;

  booksToSearch.forEach((book) => {
    book.chapters?.forEach((chapter) => {
      chapter.verses?.forEach((verse) => {
        const verseContent = String(verse.text || '');
        if (verseContent.toLowerCase().includes(searchLower)) {
          results.push({
            book: book.number,
            bookName: book.name,
            chapter: chapter.number,
            verse: verse.number,
            text: verseContent,
            reference: `${book.name} ${chapter.number}:${verse.number}`,
            bibleId: book.bibleId,
            bibleName: book.bibleName
          });
        }
      });
    });
  });

  return results.slice(0, 50);
}

export function searchBible(currentBible, query, allBibles = {}, maxResults = 50, defaultBibleId = null, searchAll = false) {
  if (!currentBible || !currentBible.books) return [];

  const rawQuery = query.trim();
  if (!rawQuery) return [];
  log.debug(`searchBible: query="${rawQuery}", maxResults=${maxResults}`);
  const lowerQuery = rawQuery.toLowerCase();
  const biblesToSearch = (searchAll && Object.keys(allBibles).length > 0)
    ? Object.values(allBibles).sort((a, b) => {
      if (a.id === defaultBibleId && b.id !== defaultBibleId) return -1;
      if (b.id === defaultBibleId && a.id !== defaultBibleId) return 1;
      if (a.id === currentBible.id && b.id !== currentBible.id) return -1;
      if (b.id === currentBible.id && a.id !== currentBible.id) return 1;
      return 0;
    })
    : [currentBible];

  // MF-14 (additive): cross-chapter spans ("Gen 1:26-2:3") and
  // semicolon-separated multi-part references ("Ps 23:1-3; John 3:16")
  // resolve to grouped slide sets. Returns null for anything else, leaving
  // the legacy single-reference and fuzzy paths below untouched.
  const groupedReferences = searchGroupedReferences(biblesToSearch, rawQuery, maxResults, currentBible?.id);
  if (groupedReferences) {
    return groupedReferences;
  }

  const referenceMatch = rawQuery.match(REFERENCE_REGEX);
  if (referenceMatch) {
    const results = [];
    const [, bookPart, chapterPart, versePart1, versePart2, rangeEndPart] = referenceMatch;
    const versePart = versePart1 || versePart2;

    for (const bible of biblesToSearch) {
      const bookMatch = findBookInArray(bible.books, bookPart);
      if (!bookMatch) continue;

      const chapter = findChapter(bookMatch, chapterPart);
      if (!chapter) continue;

      if (versePart) {
        const startVerse = parseInt(versePart, 10);
        const endVerse = parseInt(rangeEndPart || versePart, 10);
        const versesInRange = (chapter.verses || []).filter((verse) => verse.number >= startVerse && verse.number <= endVerse);

        if (versesInRange.length > 0) {
          const normalizedEnd = Number.isNaN(endVerse) ? startVerse : endVerse;
          results.push({
            book: bookMatch.number,
            bookName: bookMatch.name,
            chapter: chapter.number,
            verse: startVerse,
            endVerse: normalizedEnd,
            verses: versesInRange.map((verse) => verse.number),
            text: versesInRange.map((verse) => verse.text || '').join(' ').trim(),
            reference: normalizedEnd > startVerse
              ? `${bookMatch.name} ${chapter.number}:${startVerse}-${normalizedEnd}`
              : `${bookMatch.name} ${chapter.number}:${startVerse}`,
            bibleId: bible.id,
            bibleName: bible.name
          });
        }
      } else if (chapter.verses?.length > 0) {
        if (bible.id === currentBible.id || (!currentBible.id && biblesToSearch.length === 1)) {
          return chapter.verses.slice(0, maxResults).map((verse) => ({
            book: bookMatch.number,
            bookName: bookMatch.name,
            chapter: chapter.number,
            verse: verse.number,
            text: verse.text || '',
            reference: `${bookMatch.name} ${chapter.number}:${verse.number}`,
            bibleId: bible.id,
            bibleName: bible.name
          }));
        }
      }
    }

    if (results.length > 0) {
      return results.slice(0, maxResults);
    }
  }

  const combinedQuery = parseCombinedQuery(rawQuery, currentBible.books);
  const searchTerm = combinedQuery.book ? combinedQuery.textTerm : rawQuery;
  if (searchTerm.length < 2) return [];

  // Normalize query for reference detection
  // 1st -> 1, 2nd -> 2, i -> 1, ii -> 2, etc.
  const normalizeReference = (str) => {
    return String(str || '')
      .replace(/\bfirst\b/g, '1')
      .replace(/\bsecond\b/g, '2')
      .replace(/\bthird\b/g, '3')
      .replace(/\b1st\b/g, '1')
      .replace(/\b2nd\b/g, '2')
      .replace(/\b3rd\b/g, '3')
      .replace(/\bi\b/g, '1')
      .replace(/\bii\b/g, '2')
      .replace(/\biii\b/g, '3')
      .replace(/verse\s+/g, '')
      .replace(/\bv\.\s*/g, '')
      .replace(/[^a-z0-9\s:-]/g, ' ') // Keep hyphen for ranges
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalizedQuery = normalizeReference(searchTerm.toLowerCase());
  const queryTerms = normalizedQuery.split(/\s+/).filter((w) => w.length > 2);
  if (queryTerms.length === 0) return [];

  let results = [];

  for (const bible of biblesToSearch) {
    const isCurrent = bible.id === currentBible.id;
    const isDefault = bible.id === defaultBibleId;
    const priorityBoost = (isDefault ? 100 : 0) + (isCurrent ? 50 : 0);

    // If we have a search index, use it
    if (bible.searchIndex && !combinedQuery.book) {
      const termResults = queryTerms.map(term => bible.searchIndex[term] || []);
      // Intersect results for all terms
      let intersected = [];
      if (termResults.length > 0) {
        intersected = termResults[0];
        for (let i = 1; i < termResults.length; i++) {
          const currentSet = new Set(termResults[i].map(r => `${r.b}-${r.c}-${r.v}`));
          intersected = intersected.filter(r => currentSet.has(`${r.b}-${r.c}-${r.v}`));
        }
      }

      for (const res of intersected) {
        const book = bible.bookMap?.[res.b] || bible.books.find(b => b.number === res.b);
        const chapter = book?.chapterMap?.[res.c] || book?.chapters.find(c => c.number === res.c);
        const verse = chapter?.verseMap?.[res.v] || chapter?.verses.find(v => v.number === res.v);

        if (verse) {
          results.push({
            book: book.number,
            bookName: book.name,
            chapter: chapter.number,
            verse: verse.number,
            text: verse.text,
            reference: `${book.name} ${chapter.number}:${verse.number}`,
            bibleId: bible.id,
            bibleName: bible.name,
            score: 200 + priorityBoost
          });
        }
      }

      if (results.length > 0) continue;
    }

    const searchBooks = combinedQuery.book
      ? [findBookInArray(bible.books, combinedQuery.book.name)].filter(Boolean)
      : bible.books;

    for (const book of searchBooks) {
      for (const chapter of book.chapters) {
        for (const verse of chapter.verses) {
          const verseText = (verse.text || '').toLowerCase();

          // Exact phrase match gets highest priority
          if (verseText.includes(searchTerm.toLowerCase())) {
            results.push({
              book: book.number,
              bookName: book.name,
              chapter: chapter.number,
              verse: verse.number,
              text: verse.text,
              reference: `${book.name} ${chapter.number}:${verse.number}`,
              bibleId: bible.id,
              bibleName: bible.name,
              score: 100 + searchTerm.length + priorityBoost
            });
            continue;
          }

          // Individual word matches
          let matchCount = 0;
          for (const term of queryTerms) {
            if (verseText.includes(term)) {
              matchCount++;
            }
          }

          if (matchCount > 0) {
            results.push({
              book: book.number,
              bookName: book.name,
              chapter: chapter.number,
              verse: verse.number,
              text: verse.text,
              reference: `${book.name} ${chapter.number}:${verse.number}`,
              bibleId: bible.id,
              bibleName: bible.name,
              score: (matchCount * 10) + priorityBoost
            });
          }
        }
      }
    }
  }

  // When searching across all bibles, give each bible a fair share of the
  // results so that non-default/non-active bibles aren't pushed out of the
  // top N by the per-bible score boost.
  if (searchAll && biblesToSearch.length > 1) {
    const perBibleCap = Math.max(1, Math.ceil(maxResults / biblesToSearch.length));
    const byBible = new Map();
    for (const result of results) {
      if (!byBible.has(result.bibleId)) byBible.set(result.bibleId, []);
      byBible.get(result.bibleId).push(result);
    }
    const balanced = [];
    for (const group of byBible.values()) {
      group.sort((a, b) => b.score - a.score);
      balanced.push(...group.slice(0, perBibleCap));
    }
    results = balanced;
  }

  return results
    .sort((a, b) => {
      const aIsDefault = a.bibleId === defaultBibleId;
      const bIsDefault = b.bibleId === defaultBibleId;
      if (aIsDefault && !bIsDefault) return -1;
      if (bIsDefault && !aIsDefault) return 1;
      return b.score - a.score;
    })
    .slice(0, maxResults)
    .map(({ score, ...rest }) => rest);
}
