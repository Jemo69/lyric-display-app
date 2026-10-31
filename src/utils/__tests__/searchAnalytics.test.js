import { describe, it, expect, beforeEach } from 'vitest';
import {
  logSearchEvent,
  startSearchTimer,
  flushSearchAnalytics,
  getSearchEvents,
  getSearchStats,
  clearSearchEvents,
  MAX_EVENTS,
  __testOnly,
} from '../searchAnalytics.js';

beforeEach(async () => {
  __testOnly.resetForTest();
  await clearSearchEvents();
});

describe('searchAnalytics — non-blocking telemetry', () => {
  it('logSearchEvent returns synchronously and queues without awaiting storage', () => {
    const ret = logSearchEvent({
      surface: 'bible',
      query: 'amazing grace',
      resultCount: 3,
      topResults: [{ reference: 'John 3:16', bibleName: 'KJV' }],
      latencyMs: 42,
    });
    // Fire-and-forget contract: sync void return.
    expect(ret).toBeUndefined();
    expect(__testOnly.getPending().length).toBe(1);
  });

  it('ignores typing noise (<2 chars) and dedupes rapid repeats', () => {
    logSearchEvent({ surface: 'lyrics-local', query: 'a', resultCount: 0 });
    expect(__testOnly.getPending().length).toBe(0);

    logSearchEvent({ surface: 'lyrics-local', query: 'hello', resultCount: 1 });
    logSearchEvent({ surface: 'lyrics-local', query: 'hello', resultCount: 1 });
    expect(__testOnly.getPending().length).toBe(1);
  });

  it('strips full payload text, keeps only labels', async () => {
    logSearchEvent({
      surface: 'online-lyrics',
      query: '  Amazing Grace  ',
      resultCount: 1,
      topResults: [
        {
          title: 'Amazing Grace',
          artist: 'John Newton',
          text: 'Amazing grace how sweet the sound... FULL LYRICS SHOULD NOT PERSIST',
          lyric: 'FULL LYRICS SHOULD NOT PERSIST',
          snippet: 'SHOULD NOT PERSIST',
          provider: 'lrclib',
        },
      ],
    });
    await flushSearchAnalytics();
    const events = await getSearchEvents();
    expect(events.length).toBe(1);
    expect(events[0].query).toBe('Amazing Grace');
    expect(events[0].topResults[0]).toMatchObject({
      title: 'Amazing Grace',
      artist: 'John Newton',
      provider: 'lrclib',
    });
    expect(events[0].topResults[0]).not.toHaveProperty('text');
    expect(events[0].topResults[0]).not.toHaveProperty('lyric');
    expect(events[0].topResults[0]).not.toHaveProperty('snippet');
  });

  it('truncates long queries and caps top results at 5', async () => {
    logSearchEvent({
      surface: 'bible',
      query: 'x'.repeat(500),
      resultCount: 10,
      topResults: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ reference: `Gen 1:${n}` })),
    });
    await flushSearchAnalytics();
    const events = await getSearchEvents();
    expect(events[0].query.length).toBeLessThanOrEqual(200);
    expect(events[0].topResults.length).toBe(5);
  });

  it('startSearchTimer measures latency without the caller awaiting anything', () => {
    const done = startSearchTimer('bible', 'psalm 23');
    expect(typeof done).toBe('function');
    done({ resultCount: 2, topResults: [{ reference: 'Psalm 23:1' }] });
    const [pending] = __testOnly.getPending();
    expect(pending.surface).toBe('bible');
    expect(pending.query).toBe('psalm 23');
    expect(typeof pending.latencyMs).toBe('number');
  });

  it('never throws on garbage input', () => {
    expect(() => logSearchEvent(null)).not.toThrow();
    expect(() => logSearchEvent({})).not.toThrow();
    expect(() => logSearchEvent({ surface: 'bible', query: null })).not.toThrow();
    expect(__testOnly.getPending().length).toBe(0);
  });

  it('aggregates stats: bySurface, zero-result rate, top queries', async () => {
    logSearchEvent({ surface: 'bible', query: 'grace', resultCount: 5 });
    logSearchEvent({ surface: 'bible', query: 'grace', resultCount: 5 });
    // Different case still counts as same query; dedupe window passed via time —
    // force through by using a distinct surface then back would be slow, so
    // just log a zero-result miss instead.
    logSearchEvent({ surface: 'online-lyrics', query: 'xyzzy-no-such-song', resultCount: 0 });
    await flushSearchAnalytics();
    const stats = await getSearchStats();
    expect(stats.bySurface.bible).toBeGreaterThanOrEqual(1);
    expect(stats.bySurface['online-lyrics']).toBe(1);
    expect(stats.zeroResultRate).toBeGreaterThan(0);
    expect(Array.isArray(stats.topQueries)).toBe(true);
  });

  it('caps persisted history at MAX_EVENTS', async () => {
    for (let i = 0; i < MAX_EVENTS + 50; i++) {
      // Bypass dedupe by varying the query.
      logSearchEvent({ surface: 'bible', query: `query-${i}`, resultCount: i % 3 });
    }
    await flushSearchAnalytics();
    // flush is batched at 20; loop until drained.
    for (let i = 0; i < 200 && __testOnly.getPending().length > 0; i++) {
      await flushSearchAnalytics();
    }
    const events = await getSearchEvents({ limit: MAX_EVENTS + 100 });
    expect(events.length).toBeLessThanOrEqual(MAX_EVENTS);
  });

  it('keeps file-navigator display labels, drops paths and snippets', async () => {
    logSearchEvent({
      surface: 'file-navigator',
      query: 'grace',
      resultCount: 1,
      topResults: [
        {
          fileName: 'Amazing Grace.txt',
          filePath: '/lyrics/Amazing Grace.txt',
          fileType: 'txt',
          matchedField: 'content',
          matchSnippet: 'Amazing grace how sweet the sound... FULL CONTENT SHOULD NOT PERSIST',
          matchSnippetHtml: '<em>grace</em> SHOULD NOT PERSIST',
        },
      ],
    });
    await flushSearchAnalytics();
    const events = await getSearchEvents();
    expect(events.length).toBe(1);
    expect(events[0].topResults[0]).toMatchObject({
      fileName: 'Amazing Grace.txt',
      fileType: 'txt',
      matchedField: 'content',
    });
    expect(events[0].topResults[0]).not.toHaveProperty('filePath');
    expect(events[0].topResults[0]).not.toHaveProperty('matchSnippet');
    expect(events[0].topResults[0]).not.toHaveProperty('matchSnippetHtml');
  });
});
