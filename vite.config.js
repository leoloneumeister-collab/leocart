import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /<repo>/ as well as on any static host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  server: { host: true, port: 5173 },
});
