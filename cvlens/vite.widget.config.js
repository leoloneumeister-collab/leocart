import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// The widget must be one self-contained HTML file: hosts load it as a ui://
// resource into a sandboxed iframe with no network access by default.
export default defineConfig({
  root: fileURLToPath(new URL('./widget', import.meta.url)),
  plugins: [viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL('./dist/widget', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
});
