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
    setupFiles: [],
  },
});
