import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  worker: {
    format: 'es'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'shared': path.resolve(__dirname, 'shared')
    }
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
      '/media': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
