import { xml2json } from './xmlUtils.js';

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

export function parseBebliaBible(xml) {
  const parsed = xml2json(xml);
  if (!parsed) return { name: '', books: [] };
  
  const bibleData = parsed.bible || {};
  const books = [];
  
  const bookArray = bibleData.book ? (Array.isArray(bibleData.book) ? bibleData.book : [bibleData.book]) : [];
  
  for (const book of bookArray) {
    if (!book) continue;
    
    const chapters = [];
    const chapterArray = book.chapter ? (Array.isArray(book.chapter) ? book.chapter : [book.chapter]) : [];
    
    for (const chapter of chapterArray) {
      if (!chapter) continue;
      
      const verses = [];
      const verseArray = chapter.verse ? (Array.isArray(chapter.verse) ? chapter.verse : [chapter.verse]) : [];
      
      for (const verse of verseArray) {
        if (!verse) continue;
        
        verses.push({
          number: parseInt(verse['@_number']) || 0,
          text: verse['#text'] || verse || ''
        });
      }
      
      chapters.push({
        number: parseInt(chapter['@_number']) || 0,
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
  
  return {
    name: bibleData.name || 'Unknown',
    metadata: {
      copyright: bibleData.copyright
    },
    books
  };
}
