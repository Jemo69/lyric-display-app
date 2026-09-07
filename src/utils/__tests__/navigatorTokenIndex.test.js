import { describe, it, expect } from 'vitest';
import {
  createNavigatorTokenIndex,
  extractNavigatorSearchTokens,
} from 'shared/navigatorTokenIndex.js';
import {
  createHighlightedSnippet,
  escapeHtml,
  escapeRegex,
  prepareNavigatorSearchRecord,
  scoreNavigatorSearchRecord,
  parseFileNavigatorQuery,
} from 'shared/fileNavigatorSearch.js';

describe('navigatorTokenIndex', () => {
  it('extracts tokens stripping punctuation and skipping tokens shorter than 2 chars', () => {
    const tokens = extractNavigatorSearchTokens('Amazing grace, how sweet the sound! (chains...)');
    expect(tokens).toContain('amazing');
    expect(tokens).toContain('grace');
    expect(tokens).toContain('sweet');
    expect(tokens).toContain('sound');
    expect(tokens).toContain('chains');
    // Ensure punctuation is stripped ("grace," -> "grace", "(chains...)" -> "chains")
    expect(tokens).not.toContain('grace,');
    expect(tokens).not.toContain('chains...');
    expect(tokens).not.toContain('a'); // length 1 skipped
  });

  it('indexes both stem and content without polluting index with file extensions', () => {
    const index = createNavigatorTokenIndex();
    const record = prepareNavigatorSearchRecord({
      filePath: '/songs/Amazing Grace.txt',
      fileName: 'Amazing Grace.txt',
      contentText: 'My chains are gone, I have been set free',
    });

    index.indexRecordTokens(record);

    // Stem tokens
    expect(index.findCandidateKeys(['amazing'])).toContain('/songs/Amazing Grace.txt');
    expect(index.findCandidateKeys(['grace'])).toContain('/songs/Amazing Grace.txt');

    // Content tokens
    expect(index.findCandidateKeys(['chains'])).toContain('/songs/Amazing Grace.txt');
    expect(index.findCandidateKeys(['gone'])).toContain('/songs/Amazing Grace.txt');

    // F1: "txt" extension token should NOT be indexed
    expect(index.tokenIndex.has('txt')).toBe(false);
  });

  it('drops tokens and cleans up empty sets when record is deleted (B2)', () => {
    const index = createNavigatorTokenIndex();
    const record = prepareNavigatorSearchRecord({
      filePath: '/songs/song1.txt',
      fileName: 'song1.txt',
      contentText: 'uniqueunrepeatabletoken',
    });

    index.indexRecordTokens(record);
    expect(index.tokenIndex.has('uniqueunrepeatabletoken')).toBe(true);

    index.dropRecordTokens('/songs/song1.txt');
    expect(index.tokenIndex.has('uniqueunrepeatabletoken')).toBe(false);
    expect(index.fileTokens.has('/songs/song1.txt')).toBe(false);
  });

  it('updates tokens incrementally on file edit without leaking stale terms (Nit 01)', () => {
    const index = createNavigatorTokenIndex();
    const path = '/songs/song1.txt';

    index.indexRecordTokens(prepareNavigatorSearchRecord({
      filePath: path,
      fileName: 'song1.txt',
      contentText: 'firstversion words',
    }));
    expect(index.findCandidateKeys(['firstversion'])).toContain(path);

    // Edit file content
    index.indexRecordTokens(prepareNavigatorSearchRecord({
      filePath: path,
      fileName: 'song1.txt',
      contentText: 'secondversion words',
    }));

    expect(index.findCandidateKeys(['firstversion'])).toBeNull;
    expect(index.findCandidateKeys(['firstversion'])?.has(path)).toBeFalsy();
    expect(index.findCandidateKeys(['secondversion'])).toContain(path);
  });

  it('handles multi-term intersection across title and content', () => {
    const index = createNavigatorTokenIndex();
    const r1 = prepareNavigatorSearchRecord({
      filePath: '/songs/grace.txt',
      fileName: 'grace.txt',
      contentText: 'my chains are gone',
    });
    const r2 = prepareNavigatorSearchRecord({
      filePath: '/songs/chains.txt',
      fileName: 'chains.txt',
      contentText: 'no longer slaves',
    });

    index.indexRecordTokens(r1);
    index.indexRecordTokens(r2);

    // "grace" + "chains" should match only r1
    const matchBoth = index.findCandidateKeys(['grace', 'chains']);
    expect(matchBoth.has('/songs/grace.txt')).toBe(true);
    expect(matchBoth.has('/songs/chains.txt')).toBe(false);
  });

  it('clears all index maps on clearIndex (F2)', () => {
    const index = createNavigatorTokenIndex();
    index.indexRecordTokens(prepareNavigatorSearchRecord({
      filePath: '/songs/song.txt',
      fileName: 'song.txt',
      contentText: 'some lyric content',
    }));

    expect(index.fileTokens.size).toBeGreaterThan(0);
    expect(index.tokenIndex.size).toBeGreaterThan(0);

    index.clearIndex();
    expect(index.fileTokens.size).toBe(0);
    expect(index.tokenIndex.size).toBe(0);
  });

  it('matches punctuated text like "gone," when searching "gone" (R1 recall)', () => {
    const index = createNavigatorTokenIndex();
    const path = '/songs/amazing.txt';
    index.indexRecordTokens(prepareNavigatorSearchRecord({
      filePath: path,
      fileName: 'amazing.txt',
      contentText: 'My chains are gone, I have been set free',
    }));

    const candidates = index.findCandidateKeys(['gone']);
    expect(candidates).not.toBeNull();
    expect(candidates.has(path)).toBe(true);
  });
});

describe('createHighlightedSnippet and XSS safety', () => {
  it('escapes HTML tags preventing XSS injection (B1)', () => {
    const dangerousText = '<script>alert("xss")</script> Amazing grace\n<img src=x onerror="alert(1)">';
    const highlighted = createHighlightedSnippet(dangerousText, 'grace', 'txt');

    expect(highlighted).not.toContain('<script>');
    expect(highlighted).toContain('&lt;script&gt;');
    expect(highlighted).toContain('&lt;img');
    expect(highlighted).toContain('<mark class="bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-200 px-0.5 rounded font-medium">grace</mark>');
  });

  it('sorts multi-word terms longest-first to prevent nested mark collisions', () => {
    const text = 'Amazing grace how sweet the sound';
    const highlighted = createHighlightedSnippet(text, 'grace amazing', 'txt');
    expect(highlighted).toContain('<mark class="bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-200 px-0.5 rounded font-medium">Amazing</mark>');
    expect(highlighted).toContain('<mark class="bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-200 px-0.5 rounded font-medium">grace</mark>');
  });
});

describe('R1 Fallback integration test with fuzzy scorer', () => {
  it('fuzzy scorer still matches typos when exact candidate lookup yields zero', () => {
    const record = prepareNavigatorSearchRecord({
      filePath: '/songs/Amazing Grace.txt',
      fileName: 'Amazing Grace.txt',
      contentText: 'How sweet the sound that saved a wretch like me',
    });

    const index = createNavigatorTokenIndex();
    index.indexRecordTokens(record);

    // Typo query "amzing" has 0 exact tokens in the index
    const candidates = index.findCandidateKeys(['amzing']);
    expect(candidates.size).toBe(0);

    // Fallback logic: when candidates.size === 0, scoreNavigatorSearchRecord is called on all records
    const parsed = parseFileNavigatorQuery('amzing');
    const scored = scoreNavigatorSearchRecord(record, parsed);
    expect(scored).not.toBeNull();
    expect(scored.score).toBeGreaterThan(0);
  });

  it('matches content when search term has trailing punctuation', () => {
    const record = prepareNavigatorSearchRecord({
      filePath: '/songs/Free.txt',
      fileName: 'Free.txt',
      contentText: 'My chains are gone I have been set free',
    });

    const index = createNavigatorTokenIndex();
    index.indexRecordTokens(record);

    const parsed = parseFileNavigatorQuery('gone,');
    expect(parsed.terms).toEqual(['gone']);

    const candidates = index.findCandidateKeys(parsed.terms);
    expect(candidates).toContain('/songs/Free.txt');

    const scored = scoreNavigatorSearchRecord(record, parsed);
    expect(scored).not.toBeNull();
    expect(scored.matchedField).toBe('content');
  });
});
