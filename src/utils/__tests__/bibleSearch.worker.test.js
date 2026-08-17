import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const bible = {
  id: 'b1',
  name: 'KJV',
  books: [
    {
      number: 1,
      name: 'Genesis',
      chapters: [
        {
          number: 1,
          verses: [{ number: 1, text: 'In the beginning God created the heaven' }]
        }
      ]
    }
  ]
};

describe('bibleSearch.worker currentBible retention', () => {
  let postMessage;

  beforeEach(() => {
    postMessage = vi.fn();
    vi.stubGlobal('self', { postMessage, onmessage: null });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const loadWorkerAndGetHandler = async () => {
    await import('../../utils/bibleSearch.worker.js');
    return self.onmessage;
  };

  it('keeps searching on subsequent keystrokes that omit currentBible', async () => {
    const handler = await loadWorkerAndGetHandler();

    handler({ data: { query: 'beginning', currentBible: bible, allBibles: {}, maxResults: 30, defaultBibleId: null, searchAll: false } });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0].length).toBeGreaterThan(0);

    handler({ data: { query: 'heaven', allBibles: {}, maxResults: 30, defaultBibleId: null, searchAll: false } });
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1][0].length).toBeGreaterThan(0);
  });

  it('searches across all bibles using the retained currentBible as tiebreaker', async () => {
    const handler = await loadWorkerAndGetHandler();
    const secondBible = {
      id: 'b2',
      name: 'NIV',
      books: [
        {
          number: 1,
          name: 'Genesis',
          chapters: [{ number: 1, verses: [{ number: 1, text: 'In the beginning NIV text' }] }]
        }
      ]
    };

    handler({ data: { query: 'beginning', currentBible: bible, allBibles: { b1: bible, b2: secondBible }, maxResults: 30, defaultBibleId: null, searchAll: true, refreshBibles: true } });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const results = postMessage.mock.calls[0][0];
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.bibleId === 'b2')).toBe(true);
  });
});
