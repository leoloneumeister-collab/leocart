import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));

// Public address of the deployed site. Set SITE_URL yourself, or build on Vercel and its
// production domain is picked up. Empty for local builds, which hides the install address.
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const deployed = (process.env.SITE_URL || (productionHost ? `https://${productionHost}` : '')).replace(/\/$/, '');

// Relative base so the site works from any path: GitHub Pages under /leocart/cvlens/,
// the root of its own domain, or served by the MCP server.
export default defineConfig({
  root: at('./site'),
  base: './',
  define: { __SITE_URL__: JSON.stringify(deployed) },
  build: {
    outDir: at('./dist/site'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: { index: at('./site/index.html'), privacy: at('./site/privacy.html') },
    },
  },
});
