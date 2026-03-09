import { detectBibleFormat } from './xmlUtils.js';
import { parseZefaniaBible } from './zefaniaBible.js';
import { parseOsisBible } from './osisBible.js';
import { parseBebliaBible } from './bebliaBible.js';
import { parseOpenSongBible } from './openSongBible.js';

const bibleParsers = {
  zefania: { name: 'Zefania', parse: parseZefaniaBible },
  osis: { name: 'OSIS', parse: parseOsisBible },
  beblia: { name: 'Beblia', parse: parseBebliaBible },
  opensong: { name: 'OpenSong', parse: parseOpenSongBible }
};

export function parseBible(content, fileName = 'bible') {
  const format = detectBibleFormat(content);

  if (format === 'freeshow') {
    try {
      const data = JSON.parse(content);
      const id = data[0] || `bible_${Date.now()}`;
      const bible = data[1] || data;
      return { id, ...bible };
    } catch (e) {
      console.error('Failed to parse FreeShow Bible:', e);
      return { name: fileName, books: [] };
    }
  }

  if (format === 'unknown') {
    console.warn('Unknown Bible format, attempting Zefania as fallback');
    const result = parseZefaniaBible(content);
    if (result.books.length > 0) {
      return { id: `bible_${Date.now()}`, ...result };
    }
    return { name: fileName, books: [] };
  }

  const parser = bibleParsers[format];
  if (!parser) {
    console.error('No parser found for format:', format);
    return { name: fileName, books: [] };
  }

  const result = parser.parse(content);
  return { id: `bible_${Date.now()}`, ...result };
}

export function parseBibleFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const fileName = file.name.replace(/\.(xml|json)$/i, '');
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

export function buildSearchIndex(bible) {
  const index = new Map();

  for (const book of bible.books) {
    for (const chapter of book.chapters) {
      for (const verse of chapter.verses) {
        const words = (verse.text || '').toLowerCase().split(/\s+/);

        for (const word of words) {
          const normalized = word.replace(/[^a-z0-9]/g, '');
          if (!normalized) continue;

          const result = {
            book: book.number,
            bookName: book.name,
            chapter: chapter.number,
            verse: verse.number,
            text: verse.text,
            reference: `${book.name} ${chapter.number}:${verse.number}`
          };

          const existing = index.get(normalized) || [];
          existing.push(result);
          index.set(normalized, existing);
        }
      }
    }
  }

  return index;
}

export function searchBible(currentBible, query, allBibles = {}, maxResults = 50) {
  if (!currentBible || !currentBible.books) return [];

  const rawQuery = query.trim();
  const lowerQuery = rawQuery.toLowerCase();

  // Normalize query for reference detection
  // 1st -> 1, 2nd -> 2, i -> 1, ii -> 2, etc.
  const normalizeReference = (str) => {
    return str
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
      .replace(/[^a-z0-9\s:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalizedQuery = normalizeReference(lowerQuery);

  // 1. Try to detect a reference (Book Chapter:Verse or Book Chapter)
  // Regex to match "Book 1:1" or "1 Book 1:1" or "Book 1"
  const refRegex = /^(\d?\s*[a-z]+)\s+(\d+)(?::(\d+))?$/i;
  const match = normalizedQuery.match(refRegex);

  if (match) {
    const bookNameInput = match[1].trim();
    const chapterNum = parseInt(match[2], 10);
    const verseNum = match[3] ? parseInt(match[3], 10) : null;

    // We search across ALL provided bibles if it's a specific reference match
    const biblesToSearch = Object.keys(allBibles).length > 0 ? Object.values(allBibles) : [currentBible];
    const allRefResults = [];

    for (const bible of biblesToSearch) {
      const bookMatch = bible.books.find(b => {
        const normalizedBookName = normalizeReference(b.name.toLowerCase());
        return normalizedBookName.startsWith(bookNameInput) ||
          (b.abbreviation && b.abbreviation.toLowerCase().startsWith(bookNameInput));
      });

      if (bookMatch) {
        const chapter = bookMatch.chapters.find(c => c.number === chapterNum);
        if (chapter) {
          if (verseNum !== null) {
            // Specific verse match across all bibles
            const verse = chapter.verses.find(v => v.number === verseNum);
            if (verse) {
              allRefResults.push({
                book: bookMatch.number,
                bookName: bookMatch.name,
                chapter: chapter.number,
                verse: verse.number,
                text: verse.text,
                reference: `${bookMatch.name} ${chapter.number}:${verse.number}`,
                bibleId: bible.id,
                bibleName: bible.name
              });
            }
          } else {
            // Entire chapter - usually we only show from current bible to avoid flooding
            if (bible.id === currentBible.id || (!currentBible.id && biblesToSearch.length === 1)) {
              return chapter.verses.map(verse => ({
                book: bookMatch.number,
                bookName: bookMatch.name,
                chapter: chapter.number,
                verse: verse.number,
                text: verse.text,
                reference: `${bookMatch.name} ${chapter.number}:${verse.number}`,
                bibleId: bible.id,
                bibleName: bible.name
              })).slice(0, maxResults);
            }
          }
        }
      }
    }

    if (allRefResults.length > 0) {
      return allRefResults.slice(0, maxResults);
    }
  }

  // 2. Keyword/Phrase Search
  // We search across all bibles but prioritize the current one
  const queryTerms = lowerQuery.split(/\s+/).filter(w => w.length > 2);
  if (queryTerms.length === 0) return [];

  const results = [];
  const biblesToSearch = Object.keys(allBibles).length > 0 ? Object.values(allBibles) : [currentBible];

  for (const bible of biblesToSearch) {
    const isCurrent = bible.id === currentBible.id;
    const priorityBoost = isCurrent ? 50 : 0;

    for (const book of bible.books) {
      for (const chapter of book.chapters) {
        for (const verse of chapter.verses) {
          const verseText = (verse.text || '').toLowerCase();

          // Exact phrase match gets highest priority
          if (verseText.includes(lowerQuery)) {
            results.push({
              book: book.number,
              bookName: book.name,
              chapter: chapter.number,
              verse: verse.number,
              text: verse.text,
              reference: `${book.name} ${chapter.number}:${verse.number}`,
              bibleId: bible.id,
              bibleName: bible.name,
              score: 100 + (lowerQuery.length) + priorityBoost
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
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ score, ...rest }) => rest);
}

