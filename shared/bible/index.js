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

const REFERENCE_REGEX = /^(.+?)\s+(\d+)(?:[:.,]\s*(\d+)|\s+(\d+))?(?:-(\d+))?/i;
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

  const results = [];

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
