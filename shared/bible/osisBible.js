import { xml2json } from './xmlUtils.js';
import createSharedLogger from '../logger.js';

const log = createSharedLogger('OsisBible');

export function parseOsisBible(xml) {
  log.info('parseOsisBible: parsing OSIS XML');
  const parsed = xml2json(xml);
  if (!parsed) {
    log.warn('parseOsisBible: XML parse returned null');
    return { name: '', books: [] };
  }
  
  const osis = parsed.osis || parsed.OSIS || {};
  const books = [];
  
  const work = osis.work || {};
  const bookArray = osis.book ? (Array.isArray(osis.book) ? osis.book : [osis.book]) : [];
  
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
          number: parseInt(verse['@_osisID']?.split('.')[2]) || 0,
          text: verse['#text'] || ''
        });
      }
      
      chapters.push({
        number: parseInt(chapter['@_osisID']?.split('.')[1]) || 0,
        verses
      });
    }
    
    books.push({
      number: books.length + 1,
      name: book['@_osisID']?.split('.')[0] || '',
      abbreviation: book['@_osisID']?.split('.')[0] || '',
      chapters
    });
  }
  
  log.info(`parseOsisBible: parsed ${books.length} books`);
  return {
    name: work.title || work['#text'] || 'Unknown',
    metadata: {
      title: work.title,
      copyright: work.rights
    },
    books
  };
}
