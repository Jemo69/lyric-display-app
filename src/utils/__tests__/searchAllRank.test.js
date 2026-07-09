import { describe, it, expect } from 'vitest';
import { searchBible } from 'shared/bible';

function makeBible(id, name, word, count) {
  const verses = [];
  for (let i = 1; i <= count; i++) {
    verses.push({ number: i, text: `verse ${i} contains the word ${word} here` });
  }
  return {
    id,
    name,
    books: [{ number: 1, name: 'Test', chapters: [{ number: 1, verses }] }],
  };
}

describe('searchAll ranking', () => {
  const def = makeBible('def', 'Default', 'love', 40);
  const other = makeBible('oth', 'Other', 'love', 40);
  const all = { def, oth: other };

  it('includes the non-default bible in top maxResults', () => {
    const results = searchBible(def, 'love', all, 20, 'def', true);
    const names = new Set(results.map(r => r.bibleName));
    console.log('names in top 20:', [...names], 'total', results.length);
    expect(names.has('Other')).toBe(true);
  });
});
