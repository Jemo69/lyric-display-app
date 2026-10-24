import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // shared/** is included because it is real product code, not scaffolding:
    // the Bible parsing, alias, and mishearing tables live there and are covered
    // by src/speech/__tests__/bookAliases.test.js today. Without this glob a
    // test written under shared/bible/__tests__/ would pass by never running,
    // which is worse than having no test at all.
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'shared/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    setupFiles: ['./vitest.setup.js'],
    // Vitest's default per-test budget is 5000ms. This suite renders large
    // component trees in jsdom, and a `screen.getByRole(name)` query costs
    // roughly a millisecond per DOM node (jsdom computes visibility and the
    // accessible name for every candidate). Those queries land at 2-7s
    // measured on a 12-core box, and CI runners have fewer cores, so the
    // default budget leaves the slowest tests with no headroom: whichever one
    // happens to sit nearest the ceiling goes red on a busy machine, and the
    // suite fails intermittently in a different place each run. A failing
    // assertion still fails immediately — this only stops the deadline from
    // firing on a test that was going to pass.
    testTimeout: 30000,
  },
});
