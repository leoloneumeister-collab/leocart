import { defineConfig } from 'vite';

// The marketing page lives in site/ and builds to dist/site/, next to the game build.
// Run `npm run build` first (it clears dist/), then `npm run build:site`.
export default defineConfig({
  root: 'site',
  base: './',
  build: {
    outDir: '../dist/site',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  server: { host: true, port: 5174 },
});
