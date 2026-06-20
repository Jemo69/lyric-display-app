import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
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
  plugins: [sveltekit()],
  base: './',
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '$lib': path.resolve('./src/lib'),
      '$shared': path.resolve('./shared')
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
