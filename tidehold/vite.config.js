import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Tidehold is its own small site inside the repo (published under /tidehold/). Plain modules, no dependencies.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5174 },
});
