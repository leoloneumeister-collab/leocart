import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));

// Relative base so the site works from any path: GitHub Pages under /leocart/cvlens/,
// the root of its own domain, or served by the MCP server.
export default defineConfig({
  root: at('./site'),
  base: './',
  build: {
    outDir: at('./dist/site'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: { index: at('./site/index.html'), privacy: at('./site/privacy.html') },
    },
  },
});
