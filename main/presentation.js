/**
 * main/presentation.js — Full document + legacy presentation importers (feature #06).
 *
 * ADDITIVE module: normalizes every supported source to a single shape:
 *   { title: string, author: string, verses: string[], source: {...} }
 *
 * Sources:
 *   - Word .docx      (via mammoth — already a dependency)
 *   - RTF  .rtf       (dep-free text extraction)
 *   - Markdown .md    (dep-free)
 *   - Plain text .txt (dep-free)
 *   - EasyWorship 6/7 SQLite folder (Songs.db + SongWords.db, via better-sqlite3)
 *   - EasyWorship 2009 Paradox Songs.DB (via paradox-reader, memo blob aware)
 *
 * Existing EasyWorship flow in main/easyWorship.js is intentionally untouched;
 * the EW 6/7 reader below reuses the same SQL/files but returns the normalized
 * shape instead of writing .txt files.
 *
 * Pure text functions are exported for vitest; only the `read*` / `import*`
 * functions touch the filesystem or optional native deps (loaded lazily via
 * dynamic import so unit tests never need them).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const SONG_TEXT_EXTENSIONS = ['.md', '.markdown', '.rtf', '.txt', '.docx'];
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_EW2009_RECORDS = 5000;

const EW67_REQUIRED_FILES = ['Songs.db', 'SongWords.db'];

// Best-effort field-name maps for the EW2009 Paradox Songs table. Exact
// schema varies by EW2009 build, so we match case-insensitively and report
// the mapping used (see `fieldMap` in the result) for transparency.
const EW2009_TITLE_FIELDS = ['title', 'songtitle', 'song_title', 'name', 'songname'];
const EW2009_AUTHOR_FIELDS = ['author', 'authors', 'writer', 'writtenby', 'artist', 'composer', 'wordsby', 'musicby'];
const EW2009_LYRIC_FIELDS = ['lyrics', 'lyric', 'words', 'word', 'text', 'songwords', 'song_words', 'songtext', 'body', 'memo'];
const EW2009_COPYRIGHT_FIELDS = ['copyright', 'copy', 'ccli'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function pickField(record, candidates) {
  const keys = Object.keys(record || {});
  const lower = new Map(keys.map((k) => [String(k).toLowerCase(), k]));
  for (const candidate of candidates) {
    if (lower.has(candidate)) return lower.get(candidate);
  }
  return null;
}

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return String(value);
}

function collapseSpaces(line) {
  return line.replace(/[ \t\u00a0]+/g, ' ').trim();
}

/**
 * Clean a single lyric line: strip HTML tags, markdown emphasis, leading
 * list markers and verse-number prefixes volunteers paste from the web.
 */
export function cleanLyricLine(line) {
  if (!line) return '';
  let out = asText(line);
  out = out.replace(/<[^>]*>/g, '');
  out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
  out = out.replace(/(^|\s)[*_]([^*_]+)[*_](\s|$)/g, '$1$2$3');
  out = out.replace(/^#{1,6}\s+/, '');
  out = out.replace(/^[-*•·]\s+/, '');
  out = out.replace(/^\d+[.)]\s+/, '');
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  return collapseSpaces(out);
}

function isSectionHeader(line) {
  return /^(verse|chorus|bridge|pre-?chorus|intro|outro|ending|tag|interlude|refrain|v\d+|c\d+)\b[\s\d:.-]*/i.test(line.trim());
}

function stripSectionHeader(line) {
  const cleaned = line.trim().replace(/^(verse|chorus|bridge|pre-?chorus|intro|outro|ending|tag|interlude|refrain)\b[\s\d:.-]*/i, '').trim();
  return cleaned;
}

// ---------------------------------------------------------------------------
// Verse structuring
// ---------------------------------------------------------------------------

/**
 * Group cleaned lines into verses (slides). Blank lines are verse breaks;
 * explicit section headers (Verse 1, Chorus, …) also start a new verse and
 * their label text is dropped (matching the EasyWorship importer behaviour
 * of projecting lyrics, not chord-chart labels).
 */
export function splitIntoVerses(text) {
  const rawLines = asText(text).replace(/\r\n?/g, '\n').split('\n');
  const verses = [];
  let current = [];

  const push = () => {
    const lines = current.map(cleanLyricLine).filter(Boolean);
    if (lines.length > 0) verses.push(lines.join('\n'));
    current = [];
  };

  for (const raw of rawLines) {
    const line = collapseSpaces(raw);
    if (!line) {
      push();
      continue;
    }
    if (isSectionHeader(line)) {
      push();
      const rest = stripSectionHeader(line);
      if (rest) current.push(rest);
      continue;
    }
    current.push(line);
  }
  push();

  // No blank lines at all (one long block): chunk every 4 lines so a slide
  // never becomes a wall of text on the projector.
  if (verses.length <= 1 && current.length === 0) {
    const lines = (verses[0] || '').split('\n').filter(Boolean);
    if (lines.length > 4) {
      const chunked = [];
      for (let i = 0; i < lines.length; i += 4) {
        chunked.push(lines.slice(i, i + 4).join('\n'));
      }
      return chunked;
    }
  }

  return verses;
}

/**
 * Title = first meaningful line (strips `# `, `Title:` prefixes).
 * Author = first `By …` / `Author: …` / `Words … Music …` style line.
 */
export function extractTitleAuthor(text, fallbackName = 'Untitled') {
  const lines = asText(text).replace(/\r\n?/g, '\n').split('\n').map(collapseSpaces).filter(Boolean);
  let title = '';
  let author = '';

  for (const line of lines) {
    const titleMatch = line.match(/^(?:title|song)\s*:\s*(.+)$/i);
    if (titleMatch && !title) {
      title = cleanLyricLine(titleMatch[1]);
      continue;
    }
    const authorMatch = line.match(/^(?:by|author|artist|words?|music|written\s+by)\s*[:–—-]?\s*(.+)$/i);
    if (authorMatch && !author) {
      author = cleanLyricLine(authorMatch[1]);
      continue;
    }
    if (!title && !isSectionHeader(line)) {
      title = cleanLyricLine(line.replace(/^#{1,6}\s+/, ''));
    }
    if (title && author) break;
  }

  if (!title) {
    title = collapseSpaces(String(fallbackName || 'Untitled').replace(/\.[^.]+$/, '')) || 'Untitled';
  }
  return { title, author };
}

export function normalizeSong({ title, author, verses, source } = {}) {
  return {
    title: collapseSpaces(asText(title)) || 'Untitled',
    author: collapseSpaces(asText(author)),
    verses: Array.isArray(verses) ? verses.map((v) => asText(v).trim()).filter(Boolean) : [],
    source: source && typeof source === 'object' ? source : {},
  };
}

// ---------------------------------------------------------------------------
// Format parsers (pure text in → normalized song out)
// ---------------------------------------------------------------------------

export function parsePlainText(text, fallbackName = 'Untitled', source = {}) {
  const normalized = asText(text).replace(/\r\n?/g, '\n');
  const { title, author } = extractTitleAuthor(normalized, fallbackName);
  // Drop consumed metadata lines so the title/author don't become slide 1.
  let titleSkipped = false;
  let authorSkipped = false;
  const body = normalized
    .split('\n')
    .filter((line) => {
      const t = collapseSpaces(line);
      if (!t) return true;
      if (/^(?:title|song)\s*:\s*.+$/i.test(t)) return false;
      if (!titleSkipped && cleanLyricLine(t) === title) {
        titleSkipped = true;
        return false;
      }
      if (!authorSkipped && author && /^(?:by|author|artist|words?|music|written\s+by)\s*[:–—-]?\s*.+$/i.test(t) && t.toLowerCase().includes(author.toLowerCase())) {
        authorSkipped = true;
        return false;
      }
      return true;
    })
    .join('\n');
  const verses = splitIntoVerses(body);
  // If metadata stripping removed everything useful, fall back to full text.
  const finalVerses = verses.length > 0 ? verses : splitIntoVerses(normalized);
  return normalizeSong({ title, author, verses: finalVerses, source: { kind: 'txt', ...source } });
}

export function parseMarkdownText(text, fallbackName = 'Untitled', source = {}) {
  let body = asText(text).replace(/\r\n?/g, '\n');
  // Strip YAML frontmatter (Title:/Author: friendly).
  let frontTitle = '';
  let frontAuthor = '';
  const front = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (front) {
    for (const line of front[1].split('\n')) {
      const m = line.match(/^\s*(title|author|artist)\s*:\s*(.+?)\s*$/i);
      if (m && m[1].toLowerCase() === 'title' && !frontTitle) frontTitle = collapseSpaces(m[2]);
      if ((m && (m[1].toLowerCase() === 'author' || m[1].toLowerCase() === 'artist')) && !frontAuthor) frontAuthor = collapseSpaces(m[2]);
    }
    body = body.slice(front[0].length);
  }
  // `## …` subheads are verse breaks; `# …` H1 is the title.
  let h1Title = '';
  const lines = [];
  for (const line of body.split('\n')) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !h1Title) {
      h1Title = cleanLyricLine(h1[1]);
      continue;
    }
    if (/^#{2,6}\s+/.test(line)) {
      lines.push('');
      const rest = cleanLyricLine(line.replace(/^#{2,6}\s+/, ''));
      if (rest && !isSectionHeader(rest)) lines.push(rest);
      continue;
    }
    lines.push(line);
  }
  const rejoined = lines.join('\n');
  const { title, author } = extractTitleAuthor(rejoined, fallbackName);
  const verses = splitIntoVerses(rejoined);
  return normalizeSong({
    title: frontTitle || h1Title || title,
    author: frontAuthor || author,
    verses,
    source: { kind: 'markdown', ...source },
  });
}

/**
 * Dep-free RTF → plain text. Handles the control words Word/EasyWorship
 * emit (\\par, \\line, \\tab, \\'xx hex, \\uN? unicode) and strips groups.
 */
export function parseRtfText(rtf) {
  let text = asText(rtf);
  if (!text) return '';
  if (!text.includes('{') && !text.includes('\\')) return collapseSpaces(text);

  text = text.replace(/\{\\rtf1[^{}]*\{[^}]*\}[^{}]*\}/g, ' ');
  text = text.replace(/\{\\fonttbl[\s\S]*?\}(?=\s*\{|\s*\\|\s*[A-Za-z])/g, ' ');
  text = text.replace(/\{\\colortbl[\s\S]*?\}/g, ' ');
  text = text.replace(/\{\\stylesheet[\s\S]*?\}(?=\s*\\par|\s*\\)/g, ' ');
  text = text.replace(/\{\\\*\\[^}]*\}/g, ' ');

  text = text.replace(/\\par[d]?\s*/gi, '\n');
  text = text.replace(/\\line\s*/gi, '\n');
  text = text.replace(/\\tab\s*/gi, ' ');
  text = text.replace(/\\emdash\s*/gi, '—').replace(/\\endash\s*/gi, '–');

  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
    const WIN1252 = { 91: "'", 92: "'", 93: '"', 94: '"', 96: '–', 97: '—', 85: '…', A0: ' ' };
    const key = parseInt(hex, 16);
    if (WIN1252[key] !== undefined) return WIN1252[key];
    try {
      return Buffer.from(hex, 'hex').toString('latin1');
    } catch {
      return '';
    }
  });
  // \uN followed by exactly one fallback char (plain or escaped) — consume it.
  text = text.replace(/\\u(-?\d+)(\\'..|\\?.|.)?/g, (_, code) => {
    const n = parseInt(code, 10);
    const c = n < 0 ? 65536 + n : n;
    try {
      return String.fromCharCode(c);
    } catch {
      return '';
    }
  });

  // Strip remaining groups but keep their text content.
  let prev;
  do {
    prev = text;
    text = text.replace(/\{([^{}]*)\}/g, '$1');
  } while (text !== prev);

  text = text.replace(/\\[a-z]+\d*\s?/gi, ' ');
  text = text.replace(/[{}]/g, '');
  text = text.replace(/\\/g, '');
  text = text.replace(/[ \t\u00a0]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.join('\n').trim();
}

export function parseRtfDocument(rtf, fallbackName = 'Untitled', source = {}) {
  const plain = parseRtfText(rtf);
  const song = parsePlainText(plain, fallbackName, { kind: 'rtf', ...source });
  song.source.kind = 'rtf';
  return song;
}

/**
 * .docx via mammoth (already a dependency). Lazy import keeps unit tests
 * free of the dependency; throws a structured error when unavailable.
 */
export async function parseDocxBuffer(buffer, fallbackName = 'Untitled', source = {}) {
  let mammoth;
  try {
    const mod = await import('mammoth');
    mammoth = mod.default || mod;
  } catch {
    throw new Error('Word import needs the "mammoth" package, which is not installed.');
  }
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const { value } = await mammoth.extractRawText({ buffer: input });
  const song = parsePlainText(value || '', fallbackName, { kind: 'docx', ...source });
  song.source.kind = 'docx';
  return song;
}

// ---------------------------------------------------------------------------
// File dispatch
// ---------------------------------------------------------------------------

export function kindForExtension(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.rtf') return 'rtf';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.txt') return 'txt';
  return null;
}

export function sanitizeFilename(filename) {
  if (!filename) return 'untitled';
  return String(filename).replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200) || 'untitled';
}

/**
 * Read one presentation/document file and normalize it.
 * Returns { success, song } or { success: false, error }.
 */
export async function importPresentationFile(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'No file selected.' };
    }
    const kind = kindForExtension(filePath);
    if (!kind) {
      return { success: false, error: `Unsupported file type: ${path.extname(filePath) || '(none)'}. Choose .docx, .rtf, .md or .txt.` };
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return { success: false, error: 'File not found. It may have been moved or deleted.' };
    }
    if (stat.size > MAX_IMPORT_BYTES) {
      return { success: false, error: 'File is larger than 5 MB and was skipped for safety.' };
    }
    const base = path.basename(filePath);
    if (kind === 'docx') {
      const buffer = await fs.readFile(filePath);
      const song = await parseDocxBuffer(buffer, base, { filePath });
      if (song.verses.length === 0) return { success: false, error: 'No lyrics found in this Word document.' };
      return { success: true, song };
    }
    const text = await fs.readFile(filePath, 'utf8');
    let song;
    if (kind === 'rtf') song = parseRtfDocument(text, base, { filePath });
    else if (kind === 'markdown') song = parseMarkdownText(text, base, { filePath });
    else song = parsePlainText(text, base, { filePath });
    if (song.verses.length === 0) return { success: false, error: 'No lyrics found in this file.' };
    return { success: true, song };
  } catch (error) {
    return { success: false, error: error?.message || 'Failed to import file.' };
  }
}

/**
 * Serialize a normalized song to LyricDisplay .txt (same `# Key: value`
 * header convention the EasyWorship importer writes).
 */
export function songToLyricDisplayText(song) {
  const s = normalizeSong(song);
  const header = [];
  header.push(`# Title: ${s.title}`);
  if (s.author) header.push(`# Author: ${s.author}`);
  if (s.source?.copyright) header.push(`# Copyright: ${s.source.copyright}`);
  const origin = s.source?.origin || 'Document import';
  header.push(`# Imported from ${origin}: ${new Date().toISOString().split('T')[0]}`);
  return `${header.join('\n')}\n\n${s.verses.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// EasyWorship 6/7 SQLite (same DBs as main/easyWorship.js, normalized shape)
// ---------------------------------------------------------------------------

export function isEw67Folder(filesInDir) {
  return EW67_REQUIRED_FILES.every((f) => filesInDir.includes(f));
}

export async function readEw67Folder(folderPath) {
  try {
    let entries;
    try {
      entries = await fs.readdir(folderPath);
    } catch {
      return { success: false, error: 'Folder not found.' };
    }
    if (!isEw67Folder(entries)) {
      return { success: false, error: `Not an EasyWorship 6/7 database folder. Looking for: ${EW67_REQUIRED_FILES.join(', ')}` };
    }
    let Database;
    try {
      const mod = await import('better-sqlite3');
      Database = mod.default || mod;
    } catch {
      return { success: false, error: 'EasyWorship database import needs "better-sqlite3", which is not installed.' };
    }
    const songsDb = new Database(path.join(folderPath, 'Songs.db'), { readonly: true, fileMustExist: true });
    const wordsDb = new Database(path.join(folderPath, 'SongWords.db'), { readonly: true, fileMustExist: true });
    try {
      const rows = songsDb.prepare('SELECT rowid, song_uid, title, author, copyright, administrator FROM song').all();
      const songs = [];
      for (const row of rows) {
        try {
          const wordRow = wordsDb.prepare('SELECT words FROM word WHERE song_id = ?').get(row.rowid);
          if (!wordRow?.words) continue;
          const plain = parseRtfText(asText(wordRow.words));
          const verses = splitIntoVerses(plain);
          if (verses.length === 0) continue;
          songs.push(normalizeSong({
            title: row.title || 'Untitled',
            author: row.author || '',
            verses,
            source: {
              kind: 'easyworship67',
              id: row.song_uid || String(row.rowid),
              copyright: row.copyright || '',
              administrator: row.administrator || '',
              origin: 'EasyWorship 6/7',
            },
          }));
        } catch {
          // Skip a single corrupt song, keep the rest (volunteer-safe).
        }
      }
      songs.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      return { success: true, songs };
    } finally {
      try { songsDb.close(); } catch { /* ignore */ }
      try { wordsDb.close(); } catch { /* ignore */ }
    }
  } catch (error) {
    return { success: false, error: error?.message || 'Failed to read EasyWorship database.' };
  }
}

// ---------------------------------------------------------------------------
// EasyWorship 2009 Paradox Songs.DB
// ---------------------------------------------------------------------------

/**
 * Map one Paradox record to a normalized song using best-effort field names.
 * Exported for tests (real Songs.DB files vary by EW2009 build).
 */
export function normalizeEw2009Record(record, fieldMap = null) {
  if (!record || typeof record !== 'object') return null;
  const map = fieldMap || {
    title: pickField(record, EW2009_TITLE_FIELDS),
    author: pickField(record, EW2009_AUTHOR_FIELDS),
    lyrics: pickField(record, EW2009_LYRIC_FIELDS),
    copyright: pickField(record, EW2009_COPYRIGHT_FIELDS),
  };
  const rawLyrics = asText(map.lyrics ? record[map.lyrics] : '');
  if (!rawLyrics.trim()) return null;
  const plain = rawLyrics.trim().startsWith('{\\rtf') ? parseRtfText(rawLyrics) : rawLyrics;
  const verses = splitIntoVerses(plain);
  if (verses.length === 0) return null;
  return normalizeSong({
    title: asText(map.title ? record[map.title] : '') || 'Untitled',
    author: asText(map.author ? record[map.author] : ''),
    verses,
    source: {
      kind: 'easyworship2009',
      copyright: asText(map.copyright ? record[map.copyright] : ''),
      origin: 'EasyWorship 2009',
    },
  });
}

export async function readEw2009File(dbFilePath, options = {}) {
  try {
    if (!dbFilePath || typeof dbFilePath !== 'string') {
      return { success: false, error: 'No database file selected.' };
    }
    try {
      await fs.access(dbFilePath);
    } catch {
      return { success: false, error: 'Songs.DB not found.' };
    }
    let paradox;
    try {
      // paradox-reader is CommonJS — load via require in this ESM module.
      paradox = require('paradox-reader');
    } catch {
      return { success: false, error: 'EasyWorship 2009 import needs the "paradox-reader" package, which is not installed.' };
    }
    const limit = options.limit || MAX_EW2009_RECORDS;
    const records = [];
    paradox.scan(dbFilePath, {
      encoding: 'latin1',
      onRow: (row, index) => {
        if (index < limit) records.push(row);
      },
    });
    if (records.length === 0) {
      return { success: false, error: 'No songs found in this Songs.DB file.' };
    }
    const first = records[0] || {};
    const fieldMap = {
      title: pickField(first, EW2009_TITLE_FIELDS),
      author: pickField(first, EW2009_AUTHOR_FIELDS),
      lyrics: pickField(first, EW2009_LYRIC_FIELDS),
      copyright: pickField(first, EW2009_COPYRIGHT_FIELDS),
    };
    const songs = [];
    for (const record of records) {
      const song = normalizeEw2009Record(record, fieldMap);
      if (song) songs.push(song);
    }
    songs.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    return {
      success: true,
      songs,
      fieldMap,
      sourceFields: Object.keys(first),
      truncated: records.length >= limit,
    };
  } catch (error) {
    return { success: false, error: error?.message || 'Failed to read Songs.DB.' };
  }
}
