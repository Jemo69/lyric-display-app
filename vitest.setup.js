import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Testing Library's own wait budget — the timeout behind `waitFor` and
// `findBy*` — defaults to 1000ms. That is far too tight for a suite that
// renders large component trees in jsdom: the query resolves in a few
// hundred milliseconds on an idle machine, but on a busy one the state a
// test is waiting for can take several seconds to arrive, and the wait
// expires first. The symptom is a "Unable to find an element" failure on a
// test whose subject is present, which trains people to ignore red.
//
// The same reasoning applies to vitest's per-test budget (see
// vitest.config.js): a slow environment is not a broken test.
configure({ asyncUtilTimeout: 10000 });

afterEach(() => {
  cleanup();
});

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}
