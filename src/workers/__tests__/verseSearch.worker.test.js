import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Message shape mirrors src/utils/bibleSearch.worker.js (the plan's
// "existing off-thread pattern"): the renderer sends the corpus with the
// query and the worker replies with a results array — or null for an
// unusable query, zero matches, or any error. It never throws.

const bible = {
  id: 'b1',
  name: 'KJV',
  books: [
    {
      number: 40,
      name: 'Matthew',
      chapters: [
        {
          number: 5,
          verses: [
            { number: 3, text: 'Blessed are the poor in spirit: for theirs is the kingdom of heaven' },
            { number: 4, text: 'Blessed are they that mourn: for they shall be comforted' },
            { number: 9, text: 'Blessed are the peacemakers: for they shall be called the children of God' },
          ],
        },
      ],
    },
    {
      number: 43,
      name: 'John',
      chapters: [
        {
          number: 3,
          verses: [
            { number: 16, text: 'For God so loved the world, that he gave his only begotten Son' },
          ],
        },
      ],
    },
  ],
};

describe('verseSearch.worker', () => {
  let postMessage;

  beforeEach(() => {
    postMessage = vi.fn();
    vi.stubGlobal('self', { postMessage, onmessage: null });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const loadHandler = async () => {
    await import('../verseSearch.worker.js');
    return self.onmessage;
  };

  const lastPost = () => postMessage.mock.calls.at(-1)[0];

  it('answers a query with scored, normalized verse results', async () => {
    const handler = await loadHandler();
    handler({ data: { query: 'For God so loved the world that he gave', currentBible: bible, maxResults: 5 } });
    expect(postMessage).toHaveBeenCalledTimes(1);
    const results = lastPost();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      bookName: 'John',
      chapter: 3,
      verse: 16,
      reference: 'John 3:16',
      bibleId: 'b1',
      bibleName: 'KJV',
    });
    expect(results[0].score).toBeGreaterThanOrEqual(0);
    expect(results[0].score).toBeLessThanOrEqual(1);
    // best first
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('respects maxResults and the minScore floor', async () => {
    const handler = await loadHandler();
    handler({ data: { query: 'blessed are the peacemakers children of god', currentBible: bible, maxResults: 1 } });
    expect(lastPost()).toHaveLength(1);

    // A floor above any possible score (scores are capped at 1) -> no hits.
    handler({ data: { query: 'blessed are the peacemakers children of god', currentBible: bible, minScore: 1.5 } });
    expect(lastPost()).toBeNull();
  });

  it('posts null for an empty query or a missing bible (never throws)', async () => {
    const handler = await loadHandler();
    // No bible has ever been sent to this worker instance.
    handler({ data: { query: 'For God so loved the world' } });
    expect(lastPost()).toBeNull();

    handler({ data: {} });
    expect(lastPost()).toBeNull();

    handler({ data: { query: '   ', currentBible: bible } });
    expect(lastPost()).toBeNull();
  });

  it('posts null when nothing clears the floor (0 results, not an exception)', async () => {
    const handler = await loadHandler();
    handler({ data: { query: 'completely unrelated words about weather', currentBible: bible } });
    expect(lastPost()).toBeNull();
  });

  it('retains the bible corpus across messages so later sends can omit it', async () => {
    const handler = await loadHandler();
    handler({ data: { query: 'For God so loved the world', currentBible: bible } });
    expect(Array.isArray(lastPost())).toBe(true);

    // Second keystroke: no currentBible in the payload.
    handler({ data: { query: 'For God so loved the world' } });
    expect(Array.isArray(lastPost())).toBe(true);
  });

  it('survives a malformed corpus without throwing', async () => {
    const handler = await loadHandler();
    handler({ data: { query: 'For God so loved the world', currentBible: { books: 'not-an-array' } } });
    expect(lastPost()).toBeNull();

    handler({ data: { query: 'For God so loved the world', currentBible: {} } });
    expect(lastPost()).toBeNull();

    handler({ data: { query: 42, currentBible: bible } });
    expect(lastPost()).toBeNull();
  });

  it('ignores unknown message types without posting an error', async () => {
    const handler = await loadHandler();
    handler({ data: { type: 'nonsense' } });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(lastPost()).toBeNull();
  });
});
