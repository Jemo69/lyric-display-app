import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseBible } from 'shared/bible';
import {
  BIBLE_PREVIEW_TEXT_BUDGET,
  buildAllVersionsPreview,
  truncatePreviewText,
} from '../biblePreview';

// jsdom rewrites import.meta.url, so resolve the fixture from the repo root.
const fixtureXml = readFileSync(
  path.join(process.cwd(), 'src/utils/__tests__/fixtures/duplicated-verse-bible.xml'),
  'utf8'
);

// Sandbox-style check: the previewer is exercised against a real parsed XML
// bible (same parser path as the import button), not just synthetic strings.
function previewFixtureVerse(bible, verses, { chapter = 1, book = 1, truncate } = {}) {
  return buildAllVersionsPreview({
    reference: { id: bible.id, book, chapters: [String(chapter)], verses: [verses] },
    verses,
    bibleMetadata: { [bible.id]: { id: bible.id, name: bible.name } },
    getBibles: () => ({ [bible.id]: bible }),
    loadAllBibles: vi.fn(),
    defaultBibleId: bible.id,
    ...(truncate === undefined ? {} : { truncate }),
  });
}

describe('truncatePreviewText', () => {
  it('returns short text unchanged', () => {
    expect(truncatePreviewText('Blessed is the man')).toBe('Blessed is the man');
  });

  it('returns an empty string for missing text', () => {
    expect(truncatePreviewText(null)).toBe('');
    expect(truncatePreviewText(undefined)).toBe('');
    expect(truncatePreviewText('   ')).toBe('');
  });

  it('cuts long text at the budget and marks the cut with an ellipsis', () => {
    const long = `${'pasted block '.repeat(200)}PASTE-DUPLICATE-TAIL`;
    const result = truncatePreviewText(long);

    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(BIBLE_PREVIEW_TEXT_BUDGET + 1);
    expect(result).not.toContain('PASTE-DUPLICATE-TAIL');
  });

  it('respects a custom budget and prefers a word boundary', () => {
    expect(truncatePreviewText('one two three four five', 10)).toBe('one two…');
  });

  it('hard-cuts when no usable word boundary exists', () => {
    const result = truncatePreviewText('x'.repeat(500));
    expect(result).toBe(`${'x'.repeat(BIBLE_PREVIEW_TEXT_BUDGET)}…`);
  });
});

describe('buildAllVersionsPreview with a copy-pasted XML verse', () => {
  it('parses the fixture bible through the real import parser', () => {
    const bible = parseBible(fixtureXml, 'duplicated-verse-bible');

    expect(bible.name).toContain('Copy-Paste Test Version');
    expect(bible.books).toHaveLength(2);
    expect(bible.books[0].chapters[0].verses).toHaveLength(3);
  });

  it('cuts the duplicated copy-paste block off the preview', async () => {
    const bible = parseBible(fixtureXml, 'duplicated-verse-bible');
    const [entry] = await previewFixtureVerse(bible, [2]);

    expect(entry.text.startsWith('The earth was without form and void.')).toBe(true);
    expect(entry.text.endsWith('…')).toBe(true);
    expect(entry.text.length).toBeLessThanOrEqual(BIBLE_PREVIEW_TEXT_BUDGET + 1);
    expect(entry.text).not.toContain('PASTE-DUPLICATE-09');
    expect(entry.text).not.toContain('PASTE-DUPLICATE-10-TAIL');
    expect(entry.truncated).toBe(true);
  });

  it('leaves a normal short verse untouched and unflagged', async () => {
    const bible = parseBible(fixtureXml, 'duplicated-verse-bible');
    const [entry] = await previewFixtureVerse(bible, [1]);

    expect(entry.text).toBe('In the beginning God created the heavens and the earth.');
    expect(entry.truncated).toBe(false);
  });

  it('keeps the full text when the Settings toggle turns truncation off', async () => {
    const bible = parseBible(fixtureXml, 'duplicated-verse-bible');
    const [entry] = await previewFixtureVerse(bible, [2], { truncate: false });

    expect(entry.text).toContain('PASTE-DUPLICATE-10-TAIL');
    expect(entry.text.endsWith('…')).toBe(false);
    expect(entry.truncated).toBe(false);
  });

  it('flags a hard cut even when the preview keeps the input length (281 chars)', async () => {
    const bible = parseBible(fixtureXml, 'duplicated-verse-bible');
    // 281 chars with no word boundary near the budget: the hard-cut path
    // returns 280 chars + '…', so the output has the SAME length as the input
    // while still replacing its last character. A length-based flag would miss it.
    const input = `${'a'.repeat(160)} ${'b'.repeat(120)}`;
    bible.books[0].chapters[0].verses[0].text = input;

    const [entry] = await previewFixtureVerse(bible, [1]);

    expect(entry.text.length).toBe(input.length);
    expect(entry.text).not.toBe(input);
    expect(entry.truncated).toBe(true);
  });
});
