export default [
  {
    ignores: ['tidehold/dist/**'],
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'tidehold/**/*.js', 'tidehold/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', performance: 'readonly', localStorage: 'readonly',
        requestAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly', setInterval: 'readonly', location: 'readonly',
        process: 'readonly', console: 'readonly', URLSearchParams: 'readonly', OfflineAudioContext: 'readonly', Event: 'readonly',
        HTMLElement: 'readonly', Promise: 'readonly', fetch: 'readonly', PointerEvent: 'readonly', Buffer: 'readonly', URL: 'readonly', CanvasRenderingContext2D: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'warn',
    },
  },
  {
    // the service worker runs in its own global scope
    files: ['tidehold/public/sw.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', URL: 'readonly' },
    },
  },
];
