import { xml2json } from './xmlUtils.js';
import createSharedLogger from '../logger.js';

const log = createSharedLogger('OpenSongBible');

const defaultBibleBookNames = {
  '1': 'Genesis', '2': 'Exodus', '3': 'Leviticus', '4': 'Numbers', '5': 'Deuteronomy',
  '6': 'Joshua', '7': 'Judges', '8': 'Ruth', '9': '1 Samuel', '10': '2 Samuel',
  '11': '1 Kings', '12': '2 Kings', '13': '1 Chronicles', '14': '2 Chronicles',
  '15': 'Ezra', '16': 'Nehemiah', '17': 'Esther', '18': 'Job', '19': 'Psalms',
  '20': 'Proverbs', '21': 'Ecclesiastes', '22': 'Song of Solomon', '23': 'Isaiah',
  '24': 'Jeremiah', '25': 'Lamentations', '26': 'Ezekiel', '27': 'Daniel',
  '28': 'Hosea', '29': 'Joel', '30': 'Amos', '31': 'Obadiah', '32': 'Jonah',
  '33': 'Micah', '34': 'Nahum', '35': 'Habakkuk', '36': 'Zephaniah', '37': 'Haggai',
  '38': 'Zechariah', '39': 'Malachi', '40': 'Matthew', '41': 'Mark', '42': 'Luke',
  '43': 'John', '44': 'Acts', '45': 'Romans', '46': '1 Corinthians', '47': '2 Corinthians',
  '48': 'Galatians', '49': 'Ephesians', '50': 'Philippians', '51': 'Colossians',
  '52': '1 Thessalonians', '53': '2 Thessalonians', '54': '1 Timothy', '55': '2 Timothy',
  '56': 'Titus', '57': 'Philemon', '58': 'Hebrews', '59': 'James', '60': '1 Peter',
  '61': '2 Peter', '62': '1 John', '63': '2 John', '64': '3 John', '65': 'Jude',
  '66': 'Revelation'
};

export function parseOpenSongBible(xml) {
  log.info('parseOpenSongBible: parsing OpenSong XML');
  const parsed = xml2json(xml);
  if (!parsed) {
    log.warn('parseOpenSongBible: XML parse returned null');
    return { name: '', books: [] };
  }
  
  const bible = parsed.bible || {};
  const books = [];
  
  const bookArray = (() => {
    for (const key of ['book', 'b']) {
      const val = bible[key];
      if (val) return Array.isArray(val) ? val : [val];
    }
    return [];
  })();
  
  for (const book of bookArray) {
    if (!book) continue;
    
    const chapters = [];
    const chapterArray = (() => {
      for (const key of ['chapter', 'c']) {
        const val = book[key];
        if (val) return Array.isArray(val) ? val : [val];
      }
      return [];
    })();
    
    for (const chapter of chapterArray) {
      if (!chapter) continue;
      
      const verses = [];
      const verseArray = (() => {
        // Try <verses> as verse element tag first, then <v>
        for (const key of ['verses', 'v']) {
          const val = chapter[key];
          if (val) return Array.isArray(val) ? val : [val];
        }
        return [];
      })();
      
      for (const verse of verseArray) {
        if (!verse) continue;
        
        verses.push({
          number: parseInt(verse['@_n']) || 0,
          text: verse['#text'] || ''
        });
      }
      
      chapters.push({
        number: parseInt(chapter['@_n']) || 0,
        verses
      });
    }
    
    books.push({
      number: parseInt(book['@_n']) || books.length + 1,
      name: book['@_name'] || defaultBibleBookNames[book['@_n']] || '',
      abbreviation: book['@_n'] || '',
      chapters
    });
  }
  
  log.info(`parseOpenSongBible: parsed ${books.length} books`);
  return {
    name: bible['@_name'] || bible.name || 'Unknown',
    metadata: {
      copyright: bible['@_copyright'] || bible.copyright
    },
    books
  };
}
