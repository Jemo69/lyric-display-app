/**
 * tests/presentation.test.js — feature #06 (Full document + legacy importers).
 * Covers the pure normalizers in main/presentation.js plus file dispatch,
 * EW 6/7 SQLite round-trip (DBs built at runtime) and EW2009 record mapping.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import {
  cleanLyricLine,
  splitIntoVerses,
  extractTitleAuthor,
  normalizeSong,
  parsePlainText,
  parseMarkdownText,
  parseRtfText,
  parseRtfDocument,
  parseDocxBuffer,
  kindForExtension,
  sanitizeFilename,
  importPresentationFile,
  songToLyricDisplayText,
  normalizeEw2009Record,
  readEw2009File,
  readEw67Folder,
} from '../main/presentation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');

let tmpDir = null;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-presentation-'));
});

afterAll(async () => {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

// --- line cleanup -----------------------------------------------------------

describe('cleanLyricLine', () => {
  it('strips markdown, html and list markers', () => {
    expect(cleanLyricLine('# Amazing Grace')).toBe('Amazing Grace');
    expect(cleanLyricLine('**Holy** is the <b>Lord</b>')).toBe('Holy is the Lord');
    expect(cleanLyricLine('- [Grace](https://example.com) flows')).toBe('Grace flows');
    expect(cleanLyricLine('1. First line')).toBe('First line');
  });
});

// --- verse structuring ------------------------------------------------------

describe('splitIntoVerses', () => {
  it('splits on blank lines', () => {
    const verses = splitIntoVerses('a\nb\n\nc\nd');
    expect(verses).toEqual(['a\nb', 'c\nd']);
  });

  it('starts a new verse on section headers and drops the label', () => {
    const verses = splitIntoVerses('Verse 1\nline one\nChorus\nline two');
    expect(verses).toEqual(['line one', 'line two']);
  });

  it('chunks long unbroken blocks every 4 lines', () => {
    const verses = splitIntoVerses(['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].join('\n'));
    expect(verses).toHaveLength(2);
    expect(verses[0]).toBe('l1\nl2\nl3\nl4');
  });
});

// --- title / author ---------------------------------------------------------

describe('extractTitleAuthor', () => {
  it('takes the first line as title and By-lines as author', () => {
    const { title, author } = extractTitleAuthor('Amazing Grace\nBy John Newton\n\nLyrics here');
    expect(title).toBe('Amazing Grace');
    expect(author).toBe('John Newton');
  });

  it('understands Title: / Author: metadata lines', () => {
    const { title, author } = extractTitleAuthor('Title: Be Thou My Vision\nAuthor: Ancient Irish\n\nLyrics');
    expect(title).toBe('Be Thou My Vision');
    expect(author).toBe('Ancient Irish');
  });

  it('falls back to the file name', () => {
    expect(extractTitleAuthor('\n\n', 'some-song.md').title).toBe('some-song');
  });
});

// --- markdown fixture -------------------------------------------------------

describe('parseMarkdownText', () => {
  it('imports the markdown fixture with metadata and verses', async () => {
    const text = await fs.readFile(path.join(fixtures, 'amazing-grace.md'), 'utf8');
    const song = parseMarkdownText(text, 'amazing-grace.md');
    expect(song.title).toBe('Amazing Grace');
    expect(song.author).toBe('John Newton');
    expect(song.verses).toHaveLength(2);
    expect(song.verses[0]).toMatch(/sweet the sound/);
    expect(song.source.kind).toBe('markdown');
  });
});

// --- rtf fixture ------------------------------------------------------------

describe('parseRtfText', () => {
  it('extracts plain text from the rtf fixture', async () => {
    const rtf = await fs.readFile(path.join(fixtures, 'amazing-grace.rtf'), 'utf8');
    const plain = parseRtfText(rtf);
    expect(plain).toMatch(/sweet the sound/);
    expect(plain).not.toMatch(/[{}]/);
    expect(plain).not.toMatch(/\\par/);
    const song = parseRtfDocument(rtf, 'amazing-grace.rtf');
    expect(song.verses.length).toBeGreaterThanOrEqual(1);
    expect(song.source.kind).toBe('rtf');
  });

  it('decodes hex and unicode escapes', () => {
    expect(parseRtfText("{\\rtf1\\ansi Don\\'92t stop}")).toMatch(/Don.t stop/);
    expect(parseRtfText('{\\rtf1\\ansi \\u8212\\? dash}')).toMatch(/— dash/);
  });
});

// --- txt + file dispatch ----------------------------------------------------

describe('importPresentationFile', () => {
  it('imports .txt, .md and .rtf fixtures with verses', async () => {
    for (const file of ['amazing-grace.txt', 'amazing-grace.md', 'amazing-grace.rtf']) {
      const result = await importPresentationFile(path.join(fixtures, file));
      expect(result.success).toBe(true);
      expect(result.song.title).toBe('Amazing Grace');
      expect(result.song.verses.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects unsupported extensions with a volunteer-safe message', async () => {
    const result = await importPresentationFile(path.join(fixtures, 'song.pdf'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/\.docx, \.rtf, \.md or \.txt/);
  });

  it('reports missing files cleanly', async () => {
    const result = await importPresentationFile(path.join(fixtures, 'nope.md'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

describe('kindForExtension / sanitizeFilename', () => {
  it('maps extensions', () => {
    expect(kindForExtension('a.DOCX')).toBe('docx');
    expect(kindForExtension('a.markdown')).toBe('markdown');
    expect(kindForExtension('a.pdf')).toBe(null);
  });

  it('sanitizes filenames', () => {
    expect(sanitizeFilename('A/B: "Grace"?')).toBe('AB Grace');
  });
});

// --- docx (generated in-memory with jszip, parsed with mammoth) -------------

function buildMinimalDocx(paragraphs) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join('');
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}</w:body></w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('parseDocxBuffer', () => {
  it('imports a minimal .docx via mammoth with title and verses', async () => {
    const buffer = await buildMinimalDocx([
      'Amazing Grace',
      'By John Newton',
      '',
      'Amazing grace how sweet the sound',
      'That saved a wretch like me',
    ]);
    const song = await parseDocxBuffer(buffer, 'amazing-grace.docx');
    expect(song.title).toBe('Amazing Grace');
    expect(song.author).toBe('John Newton');
    expect(song.verses.length).toBeGreaterThanOrEqual(1);
    expect(song.source.kind).toBe('docx');
  });

  it('imports a .docx file from disk end to end', async () => {
    const buffer = await buildMinimalDocx(['Be Thou My Vision', '', 'Be thou my vision O Lord of my heart']);
    const filePath = path.join(tmpDir, 'vision.docx');
    await fs.writeFile(filePath, buffer);
    const result = await importPresentationFile(filePath);
    expect(result.success).toBe(true);
    expect(result.song.title).toBe('Be Thou My Vision');
  });
});

// --- LyricDisplay serialization ---------------------------------------------

describe('songToLyricDisplayText', () => {
  it('writes Title/Author headers plus verses', () => {
    const text = songToLyricDisplayText(
      normalizeSong({ title: 'Grace', author: 'Newton', verses: ['a\nb', 'c'] })
    );
    expect(text).toMatch(/# Title: Grace/);
    expect(text).toMatch(/# Author: Newton/);
    expect(text).toMatch(/a\nb\n\nc/);
  });
});

// --- EasyWorship 6/7 SQLite round-trip --------------------------------------

describe('readEw67Folder', () => {
  it('reads generated Songs.db + SongWords.db into normalized songs', async () => {
    const { default: Database } = await import('better-sqlite3');
    const dir = path.join(tmpDir, 'ew67');
    await fs.mkdir(dir, { recursive: true });

    const songsDb = new Database(path.join(dir, 'Songs.db'));
    songsDb.exec('CREATE TABLE song (song_uid TEXT, title TEXT, author TEXT, copyright TEXT, administrator TEXT)');
    songsDb.prepare('INSERT INTO song VALUES (?,?,?,?,?)').run('uid-1', 'Amazing Grace', 'John Newton', '', '');
    songsDb.close();

    const wordsDb = new Database(path.join(dir, 'SongWords.db'));
    wordsDb.exec('CREATE TABLE word (song_id INTEGER, words TEXT)');
    wordsDb
      .prepare('INSERT INTO word VALUES (?,?)')
      .run(1, '{\\rtf1\\ansi Amazing grace how sweet the sound\\par That saved a wretch like me\\par}');
    wordsDb.close();

    const result = await readEw67Folder(dir);
    expect(result.success).toBe(true);
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].title).toBe('Amazing Grace');
    expect(result.songs[0].author).toBe('John Newton');
    expect(result.songs[0].verses[0]).toMatch(/sweet the sound/);
    expect(result.songs[0].source.kind).toBe('easyworship67');
  });

  it('rejects folders without the required database files', async () => {
    const result = await readEw67Folder(tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Songs\.db/);
  });
});

// --- EasyWorship 2009 Paradox record mapping --------------------------------

describe('normalizeEw2009Record', () => {
  it('maps plain-text memo lyrics with heuristic field names', () => {
    const song = normalizeEw2009Record({
      SongNum: 7,
      Title: 'Come Thou Fount',
      Author: 'Robert Robinson',
      Lyrics: 'Come thou fount of every blessing\n\nTune my heart to sing thy grace',
    });
    expect(song.title).toBe('Come Thou Fount');
    expect(song.author).toBe('Robert Robinson');
    expect(song.verses).toHaveLength(2);
    expect(song.source.kind).toBe('easyworship2009');
  });

  it('handles RTF memo lyrics', () => {
    const song = normalizeEw2009Record({
      title: 'Grace',
      words: '{\\rtf1\\ansi line one\\par line two\\par}',
    });
    expect(song.verses[0]).toMatch(/line one/);
  });

  it('returns null when there are no lyrics', () => {
    expect(normalizeEw2009Record({ Title: 'Empty' })).toBe(null);
    expect(normalizeEw2009Record(null)).toBe(null);
  });
});

describe('readEw2009File', () => {
  it('reports a missing Songs.DB cleanly', async () => {
    const result = await readEw2009File(path.join(tmpDir, 'Songs.DB'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});
