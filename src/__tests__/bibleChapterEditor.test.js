import { describe, it, expect } from 'vitest';
import {
  parseEditedChapterToSlides,
  buildChapterEditText,
} from '../components/Bible/BibleChapterEditorModal.jsx';
import { DEFAULT_BINDINGS } from '../constants/hotkeyBindings.js';

describe('BibleChapterEditorModal utils', () => {
  it('builds one editable line per verse', () => {
    const text = buildChapterEditText([
      { number: 16, text: 'For God so loved the world' },
      { number: 17, text: 'For God sent not his Son' },
    ]);
    expect(text).toBe('16 For God so loved the world\n17 For God sent not his Son');
  });

  it('lines mode: each non-empty line is a slide', () => {
    const slides = parseEditedChapterToSlides('16 love\n\n17 sent\n   \n18 life', 'lines');
    expect(slides).toEqual(['16 love', '17 sent', '18 life']);
  });

  it('lines mode: joining lines shows verses together', () => {
    const slides = parseEditedChapterToSlides('16 love 17 sent\n18 life', 'lines');
    expect(slides).toEqual(['16 love 17 sent', '18 life']);
  });

  it('paragraphs mode: blank line starts a new slide, single newlines join', () => {
    const slides = parseEditedChapterToSlides('16 love\n17 sent\n\n18 life', 'paragraphs');
    expect(slides).toEqual(['16 love 17 sent', '18 life']);
  });

  it('returns empty array for blank text', () => {
    expect(parseEditedChapterToSlides('   \n  ', 'lines')).toEqual([]);
    expect(parseEditedChapterToSlides('', 'paragraphs')).toEqual([]);
  });

  it('registers Alt+Shift+Enter binding for the chapter editor', () => {
    expect(DEFAULT_BINDINGS.openBibleChapterEditor).toBe('Alt+Shift+Enter');
  });
});
