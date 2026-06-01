import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import net from 'node:net';

// Bun's Node compatibility layer does not currently expose destroySoon() on
// sockets. Vite's proxy calls it after proxied responses, so polyfill it to
// keep `bun run electron-dev` from crashing during startup/proxy requests.
if (typeof net.Socket?.prototype?.destroySoon !== 'function') {
  net.Socket.prototype.destroySoon = function destroySoon() {
    this.end();
    this.destroy();
  };
}

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
