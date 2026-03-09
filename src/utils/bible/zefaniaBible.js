import { xml2json } from './xmlUtils.js';

export function parseZefaniaBible(xml) {
  const parsed = xml2json(xml);
  if (!parsed) return { name: '', books: [] };
  
  const bible = parsed.XMLBIBLE || {};
  const books = [];
  
  if (!bible.BIBLEBOOK) {
    return { name: '', books };
  }
  
  const bookArray = Array.isArray(bible.BIBLEBOOK) 
    ? bible.BIBLEBOOK 
    : [bible.BIBLEBOOK];
  
  for (const book of bookArray) {
    if (!book) continue;
    
    const chapters = [];
    const chapterArray = book.CHAPTER ? (Array.isArray(book.CHAPTER) ? book.CHAPTER : [book.CHAPTER]) : [];
    
    for (const chapter of chapterArray) {
      if (!chapter) continue;
      
      const verses = [];
      const verseArray = chapter.VERS ? (Array.isArray(chapter.VERS) ? chapter.VERS : [chapter.VERS]) : [];
      
      for (const verse of verseArray) {
        if (!verse) continue;
        
        let text = verse['#text'] || '';
        
        text = text.replace(/<NOTE.*?<\/NOTE>/gi, '');
        text = text.replace(/<NOTE.*?>/gi, '');
        text = text.replace(/\n/g, ' ').trim();
        
        verses.push({
          number: parseInt(verse['@_vnumber']) || 0,
          text
        });
      }
      
      chapters.push({
        number: parseInt(chapter['@_cnumber']) || 0,
        verses
      });
    }
    
    books.push({
      number: parseInt(book['@_bnumber']) || 0,
      name: book['@_bname'] || '',
      abbreviation: book['@_babbr'] || '',
      chapters
    });
  }
  
  const info = bible.INFORMATION || {};
  return {
    name: info.title || bible['@_biblename'] || 'Unknown',
    metadata: {
      title: info.title,
      copyright: info.publisher,
      language: info.language
    },
    books
  };
}
